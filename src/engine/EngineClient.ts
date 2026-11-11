import type { AnalysisResult, EngineInfo } from '../types'
import { parseBestMove, parseInfo } from './uci'

export interface AnalyzeOptions {
  fen: string
  /** Fixed search depth. Ignored when `movetimeMs` is set. */
  depth?: number
  /** Time-boxed search, useful for a fast preview pass. */
  movetimeMs?: number
  /** Number of principal variations. 1 is enough for review; 2+ for hints. */
  multipv?: number
  signal?: AbortSignal
}

export interface EngineLoadProgress {
  loaded: number
  total: number
  percent: number
}

interface PendingSearch {
  resolve: (result: AnalysisResult) => void
  reject: (error: Error) => void
  fen: string
  lines: Map<number, EngineInfo>
  bestMove: string | null
  ponder: string | null
  signal?: AbortSignal
  abortHandler?: () => void
}

/**
 * Thin, promise-based wrapper around a Stockfish UCI Web Worker.
 *
 * - One search runs at a time; concurrent calls are queued.
 * - `stop()` aborts the active search without killing the worker.
 * - The worker is created lazily and can be disposed after use.
 */
export class EngineClient {
  private worker: Worker | null = null
  private readonly workerUrl: string
  private onLoadProgress: ((progress: EngineLoadProgress) => void) | null = null

  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private ready = false

  private current: PendingSearch | null = null
  private queue: Array<() => void> = []
  private activeMultipv = 1

  constructor(workerUrl?: string) {
    this.workerUrl = workerUrl ?? defaultWorkerUrl()
  }

  /** Starts the worker and performs the UCI handshake. Safe to call repeatedly. */
  start(onProgress?: (progress: EngineLoadProgress) => void): Promise<void> {
    if (onProgress) this.onLoadProgress = onProgress
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })

    let worker: Worker
    try {
      worker = new Worker(this.workerUrl)
    } catch (error) {
      this.failReady(toError(error))
      return this.readyPromise
    }

    this.worker = worker
    worker.onmessage = (event: MessageEvent) => this.handleMessage(event.data)
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Stockfish worker failed to load')
      event.preventDefault?.()
      this.failReady(error)
      this.failCurrent(error)
      this.worker = null
      worker.terminate()
    }

    // Real download progress is streamed by the engine through a dedicated
    // MessagePort. It is best effort: on a fast cache hit the wasm may already
    // be compiled before the port is wired, and the UI falls back to an
    // indeterminate bar.
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event: MessageEvent) => {
        const progress = toLoadProgress(event.data)
        if (progress) this.onLoadProgress?.(progress)
      }
      worker.postMessage({ progressPort: channel.port2 }, [channel.port2])
      worker.postMessage('setoption name CanOutputEngineDownloadProgress')
    }

    this.send('uci')
    this.send('setoption name Threads value 1')
    this.send('setoption name Hash value 32')
    this.send('setoption name MultiPV value 1')
    this.send('setoption name UCI_ShowWDL value true')
    this.send('isready')

    return this.readyPromise
  }

  get isReady(): boolean {
    return this.ready
  }

  /** Analyzes a single FEN. Resolves with the deepest MultiPV lines found. */
  analyze(options: AnalyzeOptions): Promise<AnalysisResult> {
    const { fen, depth = 14, movetimeMs, multipv = 1, signal } = options

    return new Promise<AnalysisResult>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Analysis aborted', 'AbortError'))
        return
      }

      const run = () => {
        if (signal?.aborted) {
          reject(new DOMException('Analysis aborted', 'AbortError'))
          return
        }

        if (multipv !== this.activeMultipv) {
          this.send(`setoption name MultiPV value ${multipv}`)
          this.activeMultipv = multipv
        }

        const pending: PendingSearch = {
          resolve,
          reject,
          fen,
          lines: new Map(),
          bestMove: null,
          ponder: null,
          signal,
        }

        if (signal) {
          pending.abortHandler = () => {
            this.stop()
            this.settle(pending, new DOMException('Analysis aborted', 'AbortError'))
          }
          signal.addEventListener('abort', pending.abortHandler, { once: true })
        }

        this.current = pending
        this.send(`position fen ${fen}`)
        this.send(movetimeMs ? `go movetime ${Math.round(movetimeMs)}` : `go depth ${depth}`)
      }

      if (this.current) this.queue.push(run)
      else run()
    })
  }

  /** Requests the engine to abort the active search; queued searches continue. */
  stop(): void {
    if (this.current) this.send('stop')
  }

  /** Stops everything and terminates the worker. */
  dispose(): void {
    this.queue = []
    if (this.current) this.settle(this.current, new DOMException('Engine disposed', 'AbortError'))
    this.failReady(new DOMException('Engine disposed', 'AbortError'))
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }

  /** Resets engine state between games (clears hash/repetition bookkeeping). */
  newGame(): void {
    this.send('ucinewgame')
    this.send('isready')
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      const progress = toLoadProgress(data)
      if (progress) this.onLoadProgress?.(progress)
      return
    }

    const line = data.trim()

    if (line === 'uciok') {
      this.send('isready')
      return
    }

    if (line === 'readyok') {
      if (!this.ready) {
        this.ready = true
        this.readyResolve?.()
      }
      return
    }

    const best = parseBestMove(line)
    if (best) {
      const pending = this.current
      if (!pending) return

      const lines = [...pending.lines.values()].sort((a, b) => a.multipv - b.multipv)
      pending.bestMove = best.bestMove
      pending.ponder = best.ponder

      this.current = null
      const result: AnalysisResult = {
        fen: pending.fen,
        bestMove: best.bestMove,
        ponder: best.ponder,
        lines,
        searchedDepth: lines.reduce((max, info) => Math.max(max, info.depth), 0),
      }

      if (pending.signal && pending.abortHandler) {
        pending.signal.removeEventListener('abort', pending.abortHandler)
      }
      pending.resolve(result)
      this.drainQueue()
      return
    }

    const info = parseInfo(line)
    if (!info || !this.current) return

    // Keep the deepest report per MultiPV slot; shallow ones are overwritten.
    const previous = this.current.lines.get(info.multipv)
    if (!previous || info.depth >= previous.depth) {
      this.current.lines.set(info.multipv, info)
    }
  }

  private settle(pending: PendingSearch, error: Error | DOMException): void {
    if (this.current === pending) this.current = null
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener('abort', pending.abortHandler)
    }
    pending.reject(error)
    this.drainQueue()
  }

  private failCurrent(error: Error): void {
    if (this.current) this.settle(this.current, error)
  }

  /** Rejects the handshake once, then resets so a later `start()` can retry. */
  private failReady(error: Error): void {
    this.readyReject?.(error)
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
    this.ready = false
  }

  private drainQueue(): void {
    const next = this.queue.shift()
    if (next) next()
  }

  private send(command: string): void {
    this.worker?.postMessage(command)
  }
}

function defaultWorkerUrl(): string {
  const base = import.meta.env.BASE_URL || './'
  return `${base}engine/stockfish-lite-single.js`
}

function toLoadProgress(data: unknown): EngineLoadProgress | null {
  if (!data || typeof data !== 'object') return null
  const candidate = data as Partial<EngineLoadProgress>
  if (typeof candidate.percent !== 'number' || typeof candidate.total !== 'number') return null

  return {
    loaded: candidate.loaded ?? 0,
    total: candidate.total,
    percent: candidate.percent,
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
