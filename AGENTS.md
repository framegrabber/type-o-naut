# AGENTS.md

Working notes for coding agents in this repository. Read this before changing anything.

## Project

Static, client-only typing trainer for custom ergonomic keyboards. React 18 + TypeScript + Vite 4 + Tailwind 3. No backend, no router, no state library, no test runner.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173/type-o-naut/  (note the base path)
npm run build    # tsc --noEmit && vite build
npm run preview
```

`npm run build` is the only gate in CI. There is no linter and no test suite; do not add either as a side effect of an unrelated change.

## Layout

```
src/
  components/
    TypingTrainer.tsx   owns all session state; everything else is presentational
    TextDisplay.tsx     per-character colouring, derives the cursor from input.length
    KeyboardDisplay.tsx absolute-positioned keys + layer <select>
    StatsDisplay.tsx    WPM / accuracy / errors
    ConfigPanel.tsx     file + URL loading, renders validation errors
  utils/
    zmkParser.ts        .keymap text  -> ParsedKeymap
    layoutValidator.ts  unknown       -> KeyboardLayout
    textLoader.ts       unknown       -> TextContent, session text generation
    fileLoader.ts       File/URL readers, query params
  types/index.ts        shared types, no logic
public/defaults/        the three files fetched on first load
```

Data flow is one-way: `ConfigPanel` and the URL-param effect produce validated objects, `TypingTrainer` holds them, children receive props. Keep it that way — do not introduce context or a store for this size of app.

## Invariants

These are load-bearing. Several were previously broken and the fixes are easy to undo by accident.

1. **Binding index == key index.** `ParsedKeymap.layers[n].bindings[i]` is rendered on `layout.layouts[first].layout[i]`. `&none` must stay in the array as `''`; never filter falsy labels out of `processBindings`, or every subsequent label shifts onto the wrong physical key.
2. **`input.length` is the cursor.** There is no separate index state. Anything that needs the current position derives it from `typing.input.length`.
3. **Single-character edits only.** `handleInput` rejects any change that is not ±1 character, or that would exceed `text.length`. Rejections must return a *new* object (`{ ...prev }`) so React re-renders and restores the controlled input's DOM value. `onPaste`/`onDrop` are also prevented.
4. **Accuracy is cumulative, not recomputed.** `(keystrokes − errors) / keystrokes`. Never derive it from the current buffer; correcting a mistake must not restore accuracy.
5. **One functional `setTyping` per event.** Reading `typing.*` inside the handler is stale state. Everything comes from `prev`.
6. **The WPM interval depends only on `[typing.startTime, typing.finished]`.** Adding `typing.input` to the deps recreates the timer on every keystroke.
7. **Asset paths come from `import.meta.env.BASE_URL`.** Never hardcode `/type-o-naut/`.
8. **`tsconfig.json` sets `noEmit`.** `npm run build` runs `tsc` directly; without it, `.js` files are emitted into `src/`.
9. **Focus restoration runs in an effect, not inline.** The input is `disabled` while `finished` is true; focusing it before the re-enabling render is a no-op.

## Conventions

- Validate at the boundary: every external input goes through `validate*` returning `{ valid, errors }` (layout, text) or `string[]` (keymap), and the errors are surfaced in the UI, not just logged.
- Parsers take `unknown` and narrow with type guards. No `as` casts on unvalidated data.
- Derive in render; add state only for things that cannot be computed.
- Tailwind utility classes inline; no CSS modules, no styled-components. `src/index.css` only holds the Tailwind directives.
- Inline one-line helpers rather than naming them, unless the name carries a real contract (e.g. `netWpm`).
- Keep comments for *why*, especially around the invariants above.

## Verification

There is no test harness, so changes are verified by running the app:

1. `npm run build` — typecheck plus bundle.
2. `npm run dev`, then exercise the changed path in a real browser and check the console is clean.
3. For keymap or layout changes, confirm the parsed binding count equals the layout key count for **every** layer (36 each for the bundled Ergonaut One S), and that labels land on the expected physical keys.
4. For typing-logic changes, cover: a correct run to completion, a wrong character followed by a correction (accuracy must not recover), an attempted paste, and the Reset / New Text / Next buttons (each must return focus to the input).

If you add a test runner, Vitest fits: `zmkParser`, `textLoader`, and the input reducer are pure and the obvious first targets.

## Known gaps

- Next-key highlighting searches only the selected layer, so off-layer characters highlight nothing and capitals do not indicate shift. Cross-layer lookup with automatic layer switching is the main outstanding feature.
- No persistence of results.
- Combos and macros are not parsed from `.keymap` files.
