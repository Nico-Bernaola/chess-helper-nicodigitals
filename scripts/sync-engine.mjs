/**
 * Copies the Stockfish WASM bundle from node_modules into public/engine.
 *
 * The build uses the "lite single-threaded" engine (~1.8 MB) because it runs
 * on any static host: no SharedArrayBuffer, no COOP/COEP headers, no server.
 * Files are renamed to a stable public name so the app never depends on the
 * engine version baked into the npm package.
 */
import { copyFile, mkdir, readFile, access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(root, 'node_modules', 'stockfish', 'package.json')

try {
  await access(packagePath)
} catch {
  console.error('[sync-engine] stockfish is not installed yet. Run `npm install` first.')
  process.exit(0)
}

const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
const version = pkg.buildVersion ?? '19'
const baseName = `stockfish-${version}-lite-single`
const binDir = join(root, 'node_modules', 'stockfish', 'bin')
const outDir = join(root, 'public', 'engine')

await mkdir(outDir, { recursive: true })
await copyFile(join(binDir, `${baseName}.js`), join(outDir, 'stockfish-lite-single.js'))
await copyFile(join(binDir, `${baseName}.wasm`), join(outDir, 'stockfish-lite-single.wasm'))
await copyFile(join(root, 'node_modules', 'stockfish', 'Copying.txt'), join(outDir, 'ENGINE-LICENSE.txt'))

console.log(`[sync-engine] ${baseName}.{js,wasm} -> public/engine/stockfish-lite-single.{js,wasm}`)
