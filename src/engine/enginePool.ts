import { EngineClient } from './EngineClient'

/**
 * One Stockfish worker per page.
 *
 * The engine is expensive to spin up (WASM compile + NNUE load), so it is
 * shared by every consumer instead of being tied to a component lifecycle.
 * React's StrictMode mounts effects twice in development; owning the worker at
 * module scope keeps the second pass from tearing down a live engine.
 *
 * The worker is terminated when the page is hidden for good, which releases
 * ~40 MB of WASM memory held by the tab.
 */
let shared: EngineClient | null = null
let listening = false

export function getEngine(): EngineClient {
  if (!shared) {
    shared = new EngineClient()

    if (!listening && typeof window !== 'undefined') {
      listening = true
      window.addEventListener('pagehide', () => {
        shared?.dispose()
        shared = null
      })
    }
  }

  return shared
}

/** Creates a private engine (tests, or parallel analysis of several games). */
export function createEngine(): EngineClient {
  return new EngineClient()
}
