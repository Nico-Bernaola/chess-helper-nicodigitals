# Chess Helper · Game Review

Un clon minimalista del **Game Review** de Chess.com, 100 % client-side. No hay backend,
no hay base de datos y ningún dato sale del navegador: Stockfish corre como WebAssembly
dentro de un Web Worker dedicado.

![stack](https://img.shields.io/badge/React-19-61dafb) ![stack](https://img.shields.io/badge/Vite-8-646cff) ![stack](https://img.shields.io/badge/Stockfish-19-81b64c)

## Qué hace

- **Tablero interactivo** con navegación por teclado (`←` `→`, `Home`, `End`), volteo y
  resaltado de la última jugada coloreado según su etiqueta.
- **Análisis automático** de la partida completa con Stockfish 19 Lite (WASM, single-thread),
  un FEN por vez para no bloquear el hilo principal.
- **Clasificación** de cada jugada: Brilliant, Best, Excellent, Good, Inaccuracy, Mistake,
  Blunder, con detección de sacrificios por SEE.
- **Gráfico de evaluación** en probabilidad de victoria (no en centipawns), con las jugadas
  pintadas por etiqueta y navegación al hacer clic.
- **Accuracy** por jugador y distribución de etiquetas.
- **Entrada de PGN** por textarea, drag & drop o subida de archivo.

## Arrancar

```bash
npm install      # también copia el motor a public/engine
npm run dev
```

Abrí http://localhost:5173. La partida de ejemplo (Anderssen–Kieseritzky, 1851) se analiza
sola al cargar.

```bash
npm run build      # tsc -b + vite build -> dist/
npm run preview    # sirve dist/ localmente
npm test           # 31 tests de la lógica de clasificación
npm run lint
```

## Arquitectura

```
src/
├── engine/
│   ├── EngineClient.ts   Wrapper promisificado sobre el Web Worker UCI
│   ├── enginePool.ts     Un worker compartido por página (sobrevive a StrictMode)
│   ├── index.ts          API pública del motor
│   └── uci.ts            Parser de líneas `info`/`bestmove`
├── review/
│   ├── winChance.ts      Sigmoide cp → probabilidad, accuracy, formateo
│   ├── sacrifice.ts      SEE + heurística de sacrificio
│   ├── classifier.ts     Etiquetas, accuracy por jugador, revisión completa
│   ├── pgn.ts            PGN → posiciones + jugadas materializadas
│   ├── labels.ts         Colores y descripciones de cada etiqueta
│   ├── sample.ts         PGN de ejemplo
│   └── describeGame.ts   Resumen de una partida
├── hooks/
│   └── useGameReview.ts  Loop de análisis con progreso y cancelación
├── components/
│   ├── BoardPanel.tsx    Tablero + controles de navegación
│   ├── EvalChart.tsx     Timeline de win chance
│   ├── MoveList.tsx      Lista de jugadas con badges
│   ├── AccuracyPanel.tsx Accuracy y conteo por etiqueta
│   └── PgnInput.tsx      Carga de PGN
├── types.ts              Contratos compartidos
└── App.tsx               Contenedor principal
scripts/
└── sync-engine.mjs       Copia el motor de node_modules a public/engine
```

### Decisiones que importan

**Un worker compartido, no uno por componente.** Compilar el WASM y cargar la red NNUE
cuesta cientos de milisegundos. El worker vive a nivel de módulo (`enginePool.ts`) para que
el doble montaje de `StrictMode` no lo destruya, y se libera con `pagehide`.

**Búsquedas secuenciales.** Cada posición se analiza con una sola búsqueda en vuelo. La
memoria queda plana sin importar la longitud de la partida y el hilo principal nunca se
bloquea. Las posiciones repetidas (transposiciones) se buscan una sola vez porque el
`Map` está indexado por FEN.

**Probabilidades en el marco de las blancas.** Invertir un *score* no equivale a invertir
una probabilidad cuando hay mate en el tablero (`mate 0` niega a `mate 0`). El clasificador
convierte ambos lados a win chance de blancas y recién después calcula el delta.

**El motor lite single-thread.** Corre en cualquier hosting estático: sin `SharedArrayBuffer`,
sin headers COOP/COEP y sin configuración de servidor. El bundle completo pesa ~94 MB; el
lite pesa ~1.8 MB y sigue siendo mucho más fuerte que cualquier humano.

## Cómo se clasifica una jugada

1. Se analiza el FEN antes y después de la jugada, con la misma profundidad.
2. Ambos scores se proyectan a **win chance de las blancas** y de ahí al punto de vista de
   quien movió:

   ```
   WinChance = 1 / (1 + 10^(-cp / 400))
   ```

3. `delta = winChanceBefore − winChanceAfter` (0 = jugada perfecta).
4. La etiqueta sale de los umbrales de delta:

   | Etiqueta   | Pérdida de win chance |
   | ---------- | --------------------- |
   | Best       | ≤ 2 % y es la mejor jugada del motor |
   | Excellent  | ≤ 2 % |
   | Good       | ≤ 5 % |
   | Inaccuracy | ≤ 10 % |
   | Mistake    | ≤ 20 % |
   | Blunder    | > 20 % |

   Perder un mate forzado cuenta como 100 % de pérdida.

5. **Brilliant** es un caso aparte: la jugada debe ser un sacrificio *de pieza* (no de
   peón), seguir siendo la mejor del motor, dejar la posición al menos igualada y partir
   de una posición no ganada. El sacrificio se detecta con un SEE aproximado sobre la casa
   de destino, neto del material capturado. Las jugadas forzadas (única legal) nunca cuentan
   como sacrificio.

### Límites conocidos

- El SEE es heurístico: no ve sacrificios descubiertos ni compensación posicional.
- La detección de "Brilliant" es una aproximación; Chess.com usa un modelo propietario.
- La profundidad se fija por partida. Con `depth 14` una partida de 40 jugadas tarda
  aproximadamente 20–60 s en una laptop moderna.

## Stack

React 19 · TypeScript · Vite 8 · chess.js 1.4 · react-chessboard 5 · Stockfish.js 19 ·
Vitest.

## Licencia

El código de esta app es MIT. El motor Stockfish es **GPL-3.0** (ver
`public/engine/ENGINE-LICENSE.txt`), lo que se aplica al binario WASM distribuido junto a la app.
