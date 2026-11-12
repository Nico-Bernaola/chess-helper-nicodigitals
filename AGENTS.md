# Project Rules & Token Efficiency

## Stack & Verification
- TypeScript + React (Vite).
- Verify edits ONLY with: `npm run typecheck` and `npx oxlint <edited-file>`.

## Strict Editing Rules (Token & Diff Control)
- **No unnecessary exploration:** If the user names a specific file or component, read ONLY that file. Do NOT run `git log`, repo-wide searches, or read unrelated files unless a type error forces you to.
- **Minimalist diffs:** Write the simplest, shortest working fix (prefer <10 lines). Avoid over-engineering or forcing DOM reflows when simple properties work.
- **No obvious comments:** Do NOT add inline comments explaining *why* a bug happened or narrating what the code does.
- **Concise output:** Reply in 2-3 bullet points max summarizing the change and verification result.