import { useEffect, useMemo, useRef, useState } from 'react'
import type { ParsedGame } from '../types'
import { parsePgn } from '../review/pgn'
import { SAMPLE_PGN } from '../review/sample'
import { describeGame } from '../review/describeGame'

interface PgnInputProps {
  game: ParsedGame | null
  onGame: (game: ParsedGame) => void
}

/**
 * PGN import button and modal: text area, file drop and sample game.
 *
 * Parsing happens on submit so a review never starts from a half-typed PGN.
 * Parse failures are reported inline, next to the input, because they describe
 * the text rather than the engine.
 */
export function PgnInput({ game, onGame }: PgnInputProps) {
  const [open, setOpen] = useState(false)
  const [pgn, setPgn] = useState('')
  const [dragging, setDragging] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const summary = useMemo(() => (game ? describeGame(game) : null), [game])

  useEffect(() => {
    if (!open) return

    const trigger = triggerRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [open])

  const load = (text: string) => {
    const { game: parsed, error } = parsePgn(text)
    if (!parsed) {
      setParseError(error ?? 'Could not parse this PGN.')
      return
    }

    setParseError(null)
    setPgn(text)
    onGame(parsed)
    setOpen(false)
  }

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!/\.pgn$/i.test(file.name) && file.type && !file.type.includes('text')) {
      setParseError('That does not look like a PGN file.')
      return
    }
    load(await file.text())
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="btn ml-auto" onClick={() => setOpen(true)}>
        Import Pgn
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <section className="panel w-full max-w-2xl shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="pgn-dialog-title">
            <header className="panel-header">
              <h2 id="pgn-dialog-title" className="panel-title">Import Pgn</h2>
              <button type="button" className="cursor-pointer text-xl leading-none text-text-muted hover:text-text" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            {summary && !parseError && <p className="mb-3 text-xs text-text-muted">{summary}</p>}

            <textarea
              autoFocus
              value={pgn}
              onChange={(event) => {
                setPgn(event.target.value)
                if (parseError) setParseError(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void handleFiles(event.dataTransfer.files)
              }}
              placeholder="Paste a PGN, drag a .pgn file here, or load the sample game."
              spellCheck={false}
              aria-invalid={parseError ? true : undefined}
              className={`min-h-[180px] w-full resize-y rounded-lg border bg-[#10151b] px-3 py-2.5 font-mono text-xs leading-[1.6] text-text transition-[border-color,background] duration-[120ms] focus:border-[#4c6b3a] focus:outline-none ${dragging ? 'border-accent bg-accent/7' : parseError ? 'border-[#fa412d]/55' : 'border-border'}`}
              rows={8}
            />

            {parseError && (
              <p className="mt-2 text-xs text-[#ffb3a9]" role="alert">
                {parseError}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => load(pgn)}>
                Analyze game
              </button>
              <button type="button" className="btn" onClick={() => load(SAMPLE_PGN)}>
                Load Sample
              </button>
              <label className="btn bg-transparent">
                Upload
                <input
                  type="file"
                  accept=".pgn,application/x-chess-pgn,text/plain"
                  hidden
                  onChange={(event) => void handleFiles(event.target.files)}
                />
              </label>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
