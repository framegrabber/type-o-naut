# AGENTS.md

Working notes for coding agents in this repository. Read this before changing anything.

## Project

Static, client-only typing trainer for custom ergonomic keyboards. React 18 + TypeScript + Vite 4 + Tailwind 3. No backend, no router, no state library. Vitest covers the pure utils; component behaviour is verified by hand.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173/type-o-naut/  (note the base path)
npm test         # vitest run — unit tests for the pure utils
npm run build    # tsc --noEmit && vite build
npm run preview
```

CI runs `npm test` then `npm run build`. There is no linter; do not add one as a side effect of an unrelated change.

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
    zmkParser.ts        .keymap text  -> ParsedKeymap (labels + structured taps/holds)
    keyIndex.ts         ParsedKeymap  -> character index, layer access, next-key hint
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
10. **Bindings are structured, not strings.** `Binding.label` is display only; `tap`/`engages`/`engage` are what `keyIndex` resolves against. Adding a keycode means adding it to `ZMK_KEYCODE_MAP` (keycap text) *and* `KEYCODE_CHARS` (emitted characters) — the two tables answer different questions.
11. **Shift comes from the target layer when that layer has one.** Holding a layer key puts the base layer's home-row mods out of reach; `resolveHint` falls back to the base layer only when the target layer has no shift binding.
12. **A hint step carries how the key is engaged, not just which key.** `&mo`/`&lt` are held; `&to`/`&tog` latch (`tap`) and `&sl`/`&sk` are sticky. Telling someone to hold a toggle is wrong instruction. Indices are physical key positions, valid regardless of which layer's labels are drawn — do not remap them onto the displayed layer.
13. **A latched layer is a resting layout, not a destination.** `findBaseLayers` lists the root plus every layer a `&to`/`&tog` latches; the user picks which one the keyboard is toggled to, and `buildLayerAccess`/`resolveHint` measure from there. While an alternative alphabet is the base, its characters must need no access keys — showing the way back to it is the bug this replaced.
14. **The typing surface is a real but invisible `<textarea>`.** `TextDisplay` only renders; keystrokes still go through the controlled field (`opacity-0`, off-flow) so IME, composition and mobile keyboards keep working. Never reimplement typing on raw `keydown`.
15. **Enter is always `preventDefault`ed.** A textarea would otherwise insert a line break the text never asked for and score it as an error. `Enter` and `Tab` are applied through `typeWhitespace`, which counts one keystroke and, for a correct newline, consumes the next line's indentation for free. `Tab` is only swallowed when the text actually contains one, so focus navigation survives on prose.
16. **A run is recorded once, keyed by its start time.** StrictMode double-invokes effects and any re-render after the run ends would log it again; `recordedRunRef` holds the finished session's `startTime`. Storage failures are swallowed — history is a nicety and must never break typing.

## Conventions

- Validate at the boundary: every external input goes through `validate*` returning `{ valid, errors }` (layout, text) or `string[]` (keymap), and the errors are surfaced in the UI, not just logged.
- Parsers take `unknown` and narrow with type guards. No `as` casts on unvalidated data.
- Derive in render; add state only for things that cannot be computed.
- Tailwind utility classes inline; no CSS modules, no styled-components. `src/index.css` only holds the Tailwind directives.
- Inline one-line helpers rather than naming them, unless the name carries a real contract (e.g. `netWpm`).
- Keep comments for *why*, especially around the invariants above.

## Verification

1. `npm test` — parser and resolution unit tests, which run against the bundled keymap.
2. `npm run build` — typecheck plus bundle.
3. `npm run dev`, then exercise the changed path in a real browser and check the console is clean.
4. For keymap or layout changes, confirm the parsed binding count equals the layout key count for **every** layer (36 each for the bundled Ergonaut One S), and that labels land on the expected physical keys.
5. For typing-logic changes, cover: a correct run to completion, a wrong character followed by a correction (accuracy must not recover), an attempted paste, and the Reset / New Text / Next buttons (each must return focus to the input).
6. For guidance changes, type text containing a capital, a digit and a shifted symbol (`Say "Hi!" 42 times; ok?` is a good probe) and check the layer auto-follows and the hold keys are the ones you would really press.

## Known gaps

- No results screen beyond wpm/acc/err. Nothing records a per-second series, so raw wpm, consistency and a MonkeyType-style chart are all blocked on sampling `{second, netWpm, rawWpm, errors}` into a ref during the live-WPM interval. A quote run only lasts 5-15 seconds, so a timed mode is what would make such a chart worth drawing.
- Characters outside the keymap's plain and shifted bindings never resolve, so accented text (`ö`, `ä`, `ß` in the German quote file) shows the "not on this keymap" notice. Teaching `keyIndex` about `RA(...)` and compose sequences is the fix.
- `&trans` resolves against the base layer instead of ZMK's "next active layer" semantics; modelling it properly needs an activation stack the trainer does not keep.
- Combos and macros are not parsed from `.keymap` files. The line-oriented scanner in `parseZmkKeymap` only enters the `keymap` node; adding sibling nodes is the point at which it should be replaced by a small DTS tokenizer rather than extended again. The same scanner also requires each layer's opening brace to end its line.
