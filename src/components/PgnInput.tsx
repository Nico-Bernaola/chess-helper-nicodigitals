import { useMemo, useState } from 'react'
import type { ParsedGame } from '../types'
import { parsePgn } from '../review/pgn'
import { SAMPLE_PGN } from '../review/sample'
import { describeGame } from '../review/describeGame'

interface PgnInputProps {
  game: ParsedGame | null
  onGame: (game: ParsedGame) => void
}

/**
 * PGN source panel: text area, file drop and sample game.
 *
 * Parsing happens on submit so a review never starts from a half-typed PGN.
 * Parse failures are reported inline, next to the input, because they describe
 * the text rather than the engine.
 */
export function PgnInput({ game, onGame }: PgnInputProps) {
  const [pgn, setPgn] = useState('')
  const [dragging, setDragging] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const summary = useMemo(() => (game ? describeGame(game) : null), [game])

  const load = (text: string) => {
    const { game: parsed, error } = parsePgn(text)
    if (!parsed) {
      setParseError(error ?? 'Could not parse this PGN.')
      return
    }

    setParseError(null)
    setPgn(text)
    onGame(parsed)
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
    <section className="panel pgn-input">
      <header className="panel__header">
        <h2>PGN</h2>
        {summary && !parseError && <span className="pgn-input__summary">{summary}</span>}
      </header>

      <textarea
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
        className={dragging ? 'is-dragging' : undefined}
        rows={6}
      />

      {parseError && (
        <p className="pgn-input__error" role="alert">
          {parseError}
        </p>
      )}

      <div className="row">
        <button type="button" className="btn btn--primary" onClick={() => load(pgn)}>
          Analyze game
        </button>
        <button type="button" className="btn" onClick={() => load(SAMPLE_PGN)}>
          Load sample
        </button>
        <label className="btn btn--ghost">
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
  )
}
