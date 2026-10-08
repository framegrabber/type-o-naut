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
    KeySetDisplay.tsx   guided alphabet, tinted by confidence; focus key outlined
    ResultCard.tsx      end-of-run numbers, history summary, guided focus line
    ConfigPanel.tsx     right sidebar: both text sources, keyboard, lesson settings, validation errors
  utils/
    dts.ts              .keymap text  -> devicetree node tree
    zmkParser.ts        node tree     -> ParsedKeymap (layers, combos, structured bindings)
    history.ts          finished runs -> localStorage, summaries
    keyIndex.ts         ParsedKeymap  -> character index, layer access, access cost, next-key hint
    keyStats.ts         per-run samples -> smoothed per-character times, confidence
    lesson.ts           unlock order + statistics -> unlocked set, focus key, generated text
    layoutValidator.ts  unknown       -> KeyboardLayout
    textLoader.ts       unknown -> TextContent; per-kind narrowing and session text
    fileLoader.ts       File/URL readers, MonkeyType name resolution, query params
  types/index.ts        shared types, no logic
public/defaults/        keyboard, keymap, quote corpus and word list fetched on first load
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
17. **A sample is evidence about the key you were asked to hit.** `Sample.char` is the *expected* character, never the typed one, so a wrong keystroke counts against the key it was aimed at. Samples are appended inside the existing `setTyping` updaters — a ref push would double-record under StrictMode. Only `!typo` samples between 40 ms and 12 000 ms feed the timing; outside that window a keystroke is a pause or a machine, not a measurement.
18. **Statistics are scoped to a keymap.** `ParsedKeymap.id` hashes the keymap source; `history.v2` rows and `keystats.v1` carry it, `summarise(runs, keymapId)` filters by it, and a mismatch empties the table rather than merging. The same character behind a different layer hold is a different skill. Runs shorter than 10 characters or 1000 ms (`isValidRun`) are written nowhere.
19. **The lesson is read when a session starts, never depended on.** Folding a finished run changes the key statistics, which changes the lesson, while the typed text is still on screen; `lessonRef` is mirrored in render and read by the session effect so only `lessonReady` — whether a lesson exists at all — can trigger a regeneration.
20. **Unlock order defaults to access cost, not letter frequency.** `candidates` in `lesson.ts` ranks every character the keymap can produce by `charCost`, with corpus frequency breaking ties; `settings.unlockPolicy = 'frequency'` swaps those two keys and nothing else. When neither key can separate two characters — which is every character at once if the corpus shares nothing with the keymap, e.g. a Hebrew word list on QWERTY — letters sort before punctuation, because code-point order would open the lesson on `,` and `.`. Whichever policy is active, the next character unlocks only when every unlocked one has reached the target speed *at its best* (`bestConfidence >= 1`), and the focus key is the least proficient one and appears in every generated word — drilling anything else defeats the method.
21. **Unlocking measures speed; the focus measures speed and accuracy.** `proficiency` is `confidence` divided by `1 + 2 * misses / (hits + 4)`, so a key you hit quickly but miss a fifth of the time ranks below a clean slower one, and the smoothing prior stops the first typo on a fresh key from pinning the focus there forever. Unlocking deliberately stays on `bestConfidence`: misses only ever accumulate, so gating the queue on them would re-lock learned keys. A typo contributes no timing at all (`foldRun` skips it), which is why accuracy has to enter the ranking separately — otherwise a key that is only ever missed, never slow, is never drilled. `KeySetDisplay` tints by the same number it ranks by, so the outlined focus is always the worst-looking chip, and the title breaks it back into speed and misses.
22. **The order-3 chain backs off explicitly.** `guidedText` tries the three-character context, then the two-character one, then plain corpus letter frequency, in that order; the fallback is a written sequence, not a lookup that happens to miss. Both orders live in one table keyed by context length, built in a single walk over the corpus and cached per corpus array, so a thin unlocked alphabet degrades in quality rather than falling straight to noise.
23. **The mode picks the source, not the file.** `wordList` and `quoteList` are independent slots and a loaded file fills the one matching its own kind, so both can be loaded at once; `settings.mode` decides which the session comes from. When the active slot is empty the trainer says so instead of borrowing the other one — the single-slot design this replaced made `quotes` and `words` indistinguishable and silently evicted whichever source was loaded last. The one permitted fallback is the *guided corpus*, which tokenises the quote list when no word list is loaded, because that is a corpus, not a source.
24. **The config sidebar is not modal.** Typing continues while it is open, so the focus-restoration effect and the type-anywhere handler skip only when the active element is a text entry other than the typing field (`holdsTextEntry`), never on `showConfig` alone. The trainer reserves the sidebar's width; the panel paints no backdrop and never calls `focus()` itself.
25. **The guided corpus and its origin come from one call.** `guidedCorpus(wordList, quoteList)` returns both the words and which slot they came from, so the sidebar's label cannot drift from what the generator actually used. Its array identity is the session effect's dependency for guided mode: swapping one word list for another changes the alphabet underneath and must re-roll the fragment, while the identity is stable mid-run so nothing re-rolls under a typist.
26. **MonkeyType names are classified by name, never by content.** `classifyMonkeytypeName` groups the 446 word lists and 87 quote files into prose, code and non-Latin scripts to keep the pickers' default offering typeable; it is a heuristic over file names and is wrong whenever a name lies. Nothing is ever hidden permanently — the chips reveal each group with its count, and a hand-typed name loads whatever it is. The measurement that cannot lie is `coverage`: the occurrence-weighted share of a *loaded* source's non-whitespace characters the keymap can produce, which is what warns about a Hebrew list (0) or accented Latin (71%).

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
7. For guided-mode changes, switch the mode in the config panel and confirm: the key strip renders unmeasured keys gray and at-target keys green (they mean different things to the user), the focus key appears in every generated word, a completed run moves its characters' times in `localStorage['typeonaut.keystats.v1']`, and the next character unlocks only once the whole set is at target. A run typed faster than the 40 ms sample floor will record a result but no timings — that is the filter working, not a bug.
8. For text-source changes, load a MonkeyType quote file and a word list by name, and a name that does not exist — the failure must name the URL it tried. Nothing from their repository may be committed here; it is fetched at runtime from `raw.githubusercontent.com`, and the picker's index comes from the GitHub contents API (60 requests/hour per IP, so it is fetched once per kind per session).

## Known gaps

- No results screen beyond wpm/acc/err and the guided focus line. Per-key samples now exist (`TypingState.samples`), but nothing records a per-second series, so raw wpm, consistency and a MonkeyType-style chart are still blocked on sampling `{second, netWpm, rawWpm, errors}` during the live-WPM interval. A quote run only lasts 5-15 seconds, so a timed mode is what would make such a chart worth drawing.
- The guided generator still invents words when the unlocked alphabet is too thin for real ones, but the order-3 chain keeps most of them pronounceable (`stern sees tree nest sister risen`); the plain letter-frequency tier, which produces the remaining junk, covers ~5-10% of generated characters at six unlocked keys. keybr's answer is a shipped phonetic model per language, which this project deliberately does not carry.
- `unlockPolicy` only changes anything when frequent characters differ in access cost. On a conventional base layer every letter costs the same, so cost and frequency order agree until capitals, digits and layer symbols appear; it earns its keep on alternative-alphabet keymaps and on corpora where a layer-held character (apostrophe, digits) is common.
- Characters outside the keymap's plain and shifted bindings never resolve, so accented text (`ö`, `ä`, `ß` in the German quote file) shows the "not on this keymap" notice. Teaching `keyIndex` about `RA(...)` and compose sequences is the fix.
- `&trans` resolves against the base layer instead of ZMK's "next active layer" semantics; modelling it properly needs an activation stack the trainer does not keep.
- Macros contribute only their name; their expansion is not typed out or resolved.
- `src/utils/dts.ts` covers nodes and properties only: no macro expansion, no `#include` following, no `/delete-node/`. A keymap that relies on those will parse the text as written.
