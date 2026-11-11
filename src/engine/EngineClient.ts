import type { AnalysisResult, EngineInfo, EngineScore } from '../types'
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

interface Search {
  fen: string
  lines: Map<number, EngineInfo>
  resolve: (result: AnalysisResult) => void
  reject: (error: Error | DOMException) => void
  signal?: AbortSignal
  onAbort?: () => void
  /** Set once the search has been settled; a late `bestmove` is then ignored. */
  settled: boolean
  /** True after a `stop` was sent and before its `bestmove` arrives. */
  stopRequested: boolean
  multipv: number
}

/**
 * Promise-based wrapper around a Stockfish UCI Web Worker.
 *
 * Concurrency model:
 * - One search runs at a time; additional `analyze` calls are queued.
 * - `stop()` aborts the active search but keeps the worker alive.
 * - Every `go` is matched to exactly one `bestmove`. Searches are tracked in a
 *   FIFO so a `bestmove` produced by a stopped search can never be mistaken for
 *   the result of the next one.
 *
 * All communication stays inside the worker: the main thread only receives the
 * already-parsed lines it asked for.
 */
export class EngineClient {
  private worker: Worker | null = null
  private readonly workerUrl: string
  private onLoadProgress: ((progress: EngineLoadProgress) => void) | null = null

  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private ready = false

  /** Searches with an unanswered `go`, oldest first. */
  private inFlight: Search[] = []
  /** Searches waiting for the engine to become free, with their rejectors. */
  private queue: Array<{ start: () => void; reject: (error: Error | DOMException) => void }> = []
  private activeMultipv = 1
  private disposed = false

  constructor(workerUrl?: string) {
    this.workerUrl = workerUrl ?? defaultWorkerUrl()
  }

  /** Starts the worker and performs the UCI handshake. Safe to call repeatedly. */
  start(onProgress?: (progress: EngineLoadProgress) => void): Promise<void> {
    if (onProgress) this.onLoadProgress = onProgress
    if (this.readyPromise) return this.readyPromise
    if (this.disposed) {
      this.readyPromise = Promise.reject(new DOMException('Engine disposed', 'AbortError'))
      return this.readyPromise
    }

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
      event.preventDefault?.()
      const error = new Error(event.message || 'Stockfish worker failed to load')
      this.failReady(error)
      this.failAllInFlight(error)
      worker.terminate()
      this.worker = null
    }

    // Real download progress is streamed by the engine on a dedicated port.
    // Best effort: on a cache hit the wasm may already be compiled before the
    // port is wired, and the UI then simply keeps its indeterminate bar.
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

      const startSearch = () => {
        if (signal?.aborted) {
          reject(new DOMException('Analysis aborted', 'AbortError'))
          return
        }

        if (multipv !== this.activeMultipv) {
          this.send(`setoption name MultiPV value ${multipv}`)
          this.activeMultipv = multipv
        }

        const search: Search = {
          fen,
          lines: new Map(),
          resolve,
          reject,
          signal,
          settled: false,
          stopRequested: false,
          multipv,
        }

        if (signal) {
          search.onAbort = () => this.abortSearch(search)
          signal.addEventListener('abort', search.onAbort, { once: true })
        }

        this.inFlight.push(search)
        this.send(`position fen ${fen}`)
        this.send(movetimeMs ? `go movetime ${Math.round(movetimeMs)}` : `go depth ${depth}`)
      }

      if (this.inFlight.length > 0) this.queue.push({ start: startSearch, reject })
    else startSearch()
    })
  }

  /** Asks the engine to abort the active search. The worker stays warm. */
  stop(): void {
    const active = this.inFlight[0]
    if (!active || active.settled || active.stopRequested) return

    active.stopRequested = true
    this.send('stop')
  }

  /** Terminates the worker and rejects everything outstanding. */
  dispose(): void {
    this.disposed = true
    const error = new DOMException('Engine disposed', 'AbortError')

    // Queued searches never sent `go`, so they have no bestmove to await.
    for (const item of this.queue) item.reject(error)
    this.queue = []

    this.failAllInFlight(error)
    this.failReady(error as unknown as Error)

    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }

  /** Resets engine state between games (clears hash/repetition bookkeeping). */
  newGame(): void {
    if (this.inFlight.length > 0) return
    this.send('ucinewgame')
    this.send('isready')
  }

  /* ---------------------------------------------------------------- *
   * Internals                                                         *
   * ---------------------------------------------------------------- */

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
      this.ready = true
      this.readyResolve?.()
      return
    }

    const best = parseBestMove(line)
    if (best) {
      this.handleBestMove(best.bestMove, best.ponder)
      return
    }

    const info = parseInfo(line)
    const active = this.inFlight[0]
    if (!info || !active || active.settled) return

    // Keep the deepest report per MultiPV slot; shallow ones are overwritten.
    const previous = active.lines.get(info.multipv)
    if (!previous || info.depth >= previous.depth) {
      active.lines.set(info.multipv, info)
    }
  }

  /** Consumes exactly one `bestmove`, whichever search produced it. */
  private handleBestMove(bestMove: string | null, ponder: string | null): void {
    const search = this.inFlight.shift()
    if (!search) return

    if (search.settled) {
      // Result of a search that was aborted or replaced: discard, keep going.
      this.drainQueue()
      return
    }

    if (search.onAbort && search.signal) {
      search.signal.removeEventListener('abort', search.onAbort)
    }
    search.settled = true

    const lines = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv)
    search.resolve({
      fen: search.fen,
      bestMove,
      ponder,
      lines,
      searchedDepth: lines.reduce((max, info) => Math.max(max, info.depth), 0),
    })

    this.drainQueue()
  }

  /** Cancels a search, either because of its signal or an explicit stop. */
  private abortSearch(search: Search): void {
    if (search.settled) return

    if (search.onAbort && search.signal) {
      search.signal.removeEventListener('abort', search.onAbort)
    }
    search.settled = true
    search.reject(new DOMException('Analysis aborted', 'AbortError'))

    // A queued search never sent `go`, so there is no `bestmove` to wait for.
    if (!this.inFlight.includes(search)) {
      this.drainQueue()
      return
    }

    // In flight: ask the engine to stop. The slot stays occupied until its
    // `bestmove` arrives so the match stays one-to-one.
    if (!search.stopRequested) {
      search.stopRequested = true
      this.send('stop')
    }
  }

  private failAllInFlight(error: Error): void {
    const searches = this.inFlight
    this.inFlight = []

    for (const search of searches) {
      if (search.onAbort && search.signal) {
        search.signal.removeEventListener('abort', search.onAbort)
      }
      if (search.settled) continue
      search.settled = true
      search.reject(error)
    }
  }

  /** Rejects the handshake once, then allows a later `start()` to retry. */
  private failReady(error: Error): void {
    this.readyReject?.(error)
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
    this.ready = false
  }

  /** Starts the next queued search only once the engine has no pending `go`. */
  private drainQueue(): void {
    if (this.inFlight.length > 0) return
    const next = this.queue.shift()
    if (next) next.start()
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

/** Re-exported so consumers can type score objects without a second import. */
export type { EngineScore }
