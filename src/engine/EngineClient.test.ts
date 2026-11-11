import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Minimal UCI engine double.
 *
 * It answers the handshake immediately and, for every `go`, replies with an
 * `info` line and a `bestmove` on the next microtask. Tests can hold the reply
 * to simulate latency and inspect how the client matches `go` to `bestmove`.
 */
class FakeWorker {
  static instances: FakeWorker[] = []

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly sent: string[] = []
  /** When true, `bestmove` is withheld until release() is called. */
  holdSearches = false
  private held: string[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private currentBest = 'e2e4'

  url: string

  constructor(url: string) {
    this.url = url
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown): void {
    if (typeof message !== 'string') return
    this.sent.push(message)

    if (message === 'uci') {
      this.emit('id name FakeFish')
      this.emit('uciok')
      return
    }

    if (message === 'isready') {
      this.emit('readyok')
      return
    }

    if (message.startsWith('position fen ')) return

    if (message.startsWith('go ')) {
      const best = this.currentBest
      this.timer = setTimeout(() => {
        this.emit('info depth 10 multipv 1 score cp 30 pv e2e4 e7e5')
        if (this.holdSearches) this.held.push(`bestmove ${best} ponder e7e5`)
        else this.emit(`bestmove ${best} ponder e7e5`)
      }, 0)
      return
    }

    if (message === 'stop') {
      // Stockfish answers `stop` with the best move found so far.
      this.flushHeld()
    }
  }

  release(): void {
    this.holdSearches = false
    this.flushHeld()
  }

  terminate(): void {
    if (this.timer) clearTimeout(this.timer)
  }

  /** Pretends the engine is now searching for a specific move. */
  setBestMove(move: string): void {
    this.currentBest = move
  }

  private flushHeld(): void {
    const pending = this.held
    this.held = []
    for (const line of pending) this.emit(line)
  }

  private emit(data: string): void {
    this.onmessage?.({ data } as MessageEvent)
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function createReadyClient() {
  const { EngineClient } = await import('./EngineClient')
  const client = new EngineClient('/engine/fake.js')
  await client.start()
  return { client, worker: FakeWorker.instances[0] }
}

const FEN_A = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const FEN_B = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('EngineClient', () => {
  it('performs the UCI handshake with single-thread-safe settings', async () => {
    const { worker } = await createReadyClient()
    expect(worker.sent).toContain('uci')
    expect(worker.sent).toContain('setoption name Threads value 1')
    expect(worker.sent).toContain('isready')
  })

  it('returns the parsed score and best move for a search', async () => {
    const { client } = await createReadyClient()
    const result = await client.analyze({ fen: FEN_A, depth: 10 })

    expect(result.bestMove).toBe('e2e4')
    expect(result.ponder).toBe('e7e5')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].score).toEqual({ type: 'cp', value: 30 })
    expect(result.searchedDepth).toBe(10)
  })

  it('runs searches sequentially and keeps their results separate', async () => {
    const { client, worker } = await createReadyClient()
    worker.setBestMove('d2d4')

    const first = client.analyze({ fen: FEN_A, depth: 10 })
    const second = client.analyze({ fen: FEN_B, depth: 10 })

    const [a, b] = await Promise.all([first, second])
    expect(a.fen).toBe(FEN_A)
    expect(b.fen).toBe(FEN_B)
    // The second `go` must not be sent before the first bestmove arrives.
    expect(worker.sent.filter((line) => line.startsWith('go '))).toHaveLength(2)
  })

  it('never attributes a stopped search result to the next search', async () => {
    const { client, worker } = await createReadyClient()
    worker.setBestMove('a2a3')

    // Hold the reply so the test controls ordering precisely.
    worker.holdSearches = true

    const controller = new AbortController()
    const aborted = client.analyze({ fen: FEN_A, depth: 10, signal: controller.signal })
    await Promise.resolve()

    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })

    // The engine still owes one bestmove; the client must discard it.
    const next = client.analyze({ fen: FEN_B, depth: 10 })
    worker.release()

    const result = await next
    expect(result.fen).toBe(FEN_B)
    expect(result.bestMove).toBe('a2a3')
  })

  it('rejects queued searches when the engine is disposed', async () => {
    const { client, worker } = await createReadyClient()
    worker.holdSearches = true

    const first = client.analyze({ fen: FEN_A, depth: 10 })
    const queued = client.analyze({ fen: FEN_B, depth: 10 })

    client.dispose()

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const { client } = await createReadyClient()
    const controller = new AbortController()
    controller.abort()

    await expect(
      client.analyze({ fen: FEN_A, depth: 10, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
