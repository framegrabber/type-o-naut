# Type-o-naut

A typing trainer for custom ergonomic keyboards. Load your own keyboard layout and ZMK keymap, and the trainer highlights the physical key you need to press next while you type.

Runs entirely in the browser — no backend, no accounts, no telemetry. Deployed as a static site to GitHub Pages.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173/type-o-naut/
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck (`tsc --noEmit`) + production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally |

Requires Node 18+ (CI builds on Node 24).

## What ships by default

On first load the app fetches four files from `public/defaults/`:

| File | Contents |
| --- | --- |
| `ergonaut_one_s.json` | Ergonaut One S physical layout — 36 keys with `x`/`y`/rotation |
| `ergonaut_one_s.keymap` | ZMK keymap with 9 layers (MAIN, FOCAL, NAV, MOUSE, MEDIA, NUM, SYM, FUN, ADJ) |
| `english_quotes.json` | 685 public-domain quotes from 46 works (Austen, Twain, Dickens, Darwin, Douglass …), ASCII-only and typeable on any keymap |
| `english_words.json` | 1500 English words, frequency-ranked from the Open American National Corpus (freely redistributable) |

Each file is fetched independently; if one is missing or invalid the rest still load, and the text falls back to the built-in pangrams.

## Using your own hardware

Open **⚙ Settings** for a sidebar that stays open while you type. It holds both text sources at once — a word list and a quote list, each with its own upload, URL and MonkeyType controls — plus the keyboard layout, the keymap and the lesson settings. A loaded file fills the slot matching its own kind, and the lesson mode decides which slot the session comes from, so loading one never evicts the other. Validation errors are listed inline with the exact field that failed.

MonkeyType's own content can be loaded by name — the **From MonkeyType** picker, or `monkeytype:english` in a URL field. Their files are fetched from `raw.githubusercontent.com` at runtime; nothing from their repository is copied into this one. The pickers offer prose lists your keymap can type; chips reveal the code lists and other scripts, and a loaded source that your keyboard cannot produce says so with the share that is untypeable. Each source can be unloaded or reset to the bundled default.

Sources can be passed as query parameters, which makes configurations shareable:

```
https://<user>.github.io/type-o-naut/?keyboardUrl=…&keymapUrl=…&wordsUrl=…&quotesUrl=…
```

`textUrl=` also still works and routes by the loaded file's kind.

URLs must be CORS-readable from the browser.

### Keyboard layout format

The ZMK/QMK physical-layout shape. `x` and `y` are in key units; `r`/`rx`/`ry` are optional rotation in degrees around an absolute origin.

```json
{
  "id": "ergonaut_one_s",
  "name": "Ergonaut One S",
  "layouts": {
    "LAYOUT": {
      "layout": [
        { "row": 0, "col": 0, "x": 0, "y": 0.95 },
        { "row": 3, "col": 5, "x": 4.65, "y": 3.95, "r": 30, "rx": 5.15, "ry": 4.45 }
      ]
    }
  }
}
```

Only the first entry in `layouts` is rendered. The nth binding of a keymap layer is drawn on the nth key of this array, so the two files must describe the same key order.

### Text format

MonkeyType-compatible. Word lists:

```json
{ "name": "english_1k", "words": ["the", "and", "for"] }
```

A word session draws 15 random words and repeats them over 5 rounds, reshuffling each round. Quote lists:

```json
{
  "language": "english",
  "groups": [[0, 100]],
  "quotes": [{ "text": "…", "source": "…", "length": 42, "id": 1 }]
}
```

A quote session types one quote; **Next** advances through the list and wraps.

### Supported ZMK bindings

| Binding | Label |
| --- | --- |
| `&kp Q`, `&kp N4`, `&kp SEMI` | `Q`, `4`, `;` |
| `&kp SPACE` / `ENTER` / `TAB` / `BSPC` / `DEL` | `␣` `⏎` `⇥` `⌫` `⌦` |
| `&kp LG(V)`, `&kp LG(LS(N4))` | `⌘V`, `⌘⇧4` (nested modifier functions) |
| `&mt MOD KEY`, `&lt LAYER KEY`, and user-defined hold-taps such as `&hm` | the tap key, e.g. `&hm LEFT_SHIFT A` → `A` |
| `&mo N`, `&to N`, `&tog N` | `LN` |
| `&sl N`, `&sk KEY` | `⏱LN`, `⏱KEY` |
| `&bt BT_SEL 0`, `&bt BT_CLR`, `&out OUT_USB` | `BT0`, `BT CLR`, `USB` |
| `&sys_reset`, `&bootloader`, `&studio_unlock` | `RESET`, `BOOT`, `STUDIO` |
| `&none`, `&trans` | blank, `∅` |
| `&my_macro` declared in a `macros` node | the macro's own label |

Unknown behaviors fall back to their last parameter mapped as a keycode. Hold-tap labels intentionally show only the tap key, because that is what gets typed — the hold action is still parsed, and is what lets the trainer tell you when to hold shift or a layer key.

New keycodes go in `ZMK_KEYCODE_MAP` (keycap text) and `KEYCODE_CHARS` (the characters a key emits) in [`src/utils/zmkParser.ts`](src/utils/zmkParser.ts).

## Next-key guidance

The trainer resolves the next character against the whole keymap, not just the layer on screen:

- **Cross-layer.** Typing `1` finds it on NUM and shows the layer key to engage; the keyboard view follows along. Layers reachable only from another layer are chained, so a two-step path is shown as two keys. Momentary layers (`&mo`, `&lt`) are marked as **held** in yellow; layers you latch or make sticky (`&to`, `&tog`, `&sl`) are marked as **tapped** in blue, because holding them would be wrong.
- **Shift.** Capitals and shifted symbols add a shift key, picked from the hand opposite the target. Keycodes that already carry shift in firmware (`&kp EXCL`) need no shift from you.
- **Alternative layouts.** A layer that a `&to`/`&tog` key latches on — a Colemak or FOCAL alphabet, say — is a *resting layout*, not somewhere you visit. The **layout** selector lists those (the root layer plus every latched one); pick the one your keyboard is currently toggled to and the trainer measures everything from there, so its own characters need no access keys and other layers are reached through its thumbs. This is the mode for learning a new alphabet.
- **Layer view.** The keyboard always follows the character being typed and falls back to the resting layout when there is nothing to show.
- **Combos.** A `zmk,combos` node is read too. When a character has no ordinary key — or none on a reachable layer — the combo that types it is shown as a chord, with every key in it lit and a "press N keys together" note. Combos that fire a shortcut rather than a character, or that are restricted to other layers, are skipped. A key you can reach normally is always taught as a key, never as a chord.
- **Unreachable characters** are called out above the keyboard rather than silently highlighting nothing.

Resolution lives in [`src/utils/keyIndex.ts`](src/utils/keyIndex.ts): `buildCharIndex` maps every character the keymap can produce to the keys that produce it, `buildLayerAccess` breadth-first searches the chain of steps to each layer and records whether each one is held or tapped, and `resolveHint` picks a target — preferring the displayed layer, then no shift, then the shortest chain.

## How the metrics work

- **WPM** — net: correctly typed characters ÷ 5 ÷ elapsed minutes. Updated every 250 ms and recomputed exactly once more on the finishing keystroke.
- **Accuracy** — keystroke-based: `(keystrokes − errors) / keystrokes`. Backspacing over a mistake does **not** restore it.
- **Errors** — keystrokes that did not match the expected character.

Pasting is blocked: only single-character edits are accepted, so a run cannot be skipped.

You type onto the text itself: there is no visible input box, the caret sits in the passage, correct characters brighten and mistakes turn red. Clicking the text or pressing any key takes focus back; while focus is elsewhere the passage dims.

The end-of-run card is keyboard-only friendly: focus lands on **Try again**, `Tab` and the arrow keys cycle the actions, `Enter` or `Space` activates, `Escape` retries, and each action has a single-key shortcut (`r`, `n`).

Multi-line sources work, including MonkeyType's `code_*.json` quote files. Line structure and indentation are preserved, line ends are marked with a dim `↵`, `Enter` types the newline and `Tab` types a tab. A correct newline also consumes the next line's indentation the way a code editor would, so one keystroke takes you to the first real character of the line. Sources are normalised to LF with trailing whitespace stripped. On single-line text, `Tab` still moves focus and `Enter` does nothing.

The ⛶ button puts the page into fullscreen, hiding the browser's own chrome along with the app's header and buttons — just stats, text and keyboard. Leave with the corner button, `Esc` or `F11`; the app follows whichever you use. iOS Safari has no element fullscreen, so the button reports the refusal and nothing changes.

Finished runs are kept in `localStorage` (the most recent 200), so the result card can show your best and the average of the last ten. Nothing but numbers is stored — never the text you typed — and **Settings → Results → Clear history** removes it. A browser that refuses storage simply gets no history.

Each passage is credited underneath: a quote's own `source` field (`— Albert Einstein`, `— Dark Web: Thriller, Veit Etzold`), or the word list's `name` for a word session. Blank sources are omitted rather than rendered as an empty dash.

## Tests

```bash
npm test       # vitest run
```

Unit tests cover the keymap parser and the character resolution against the bundled Ergonaut One S files; CI runs them before the build. UI behaviour is verified by hand (see `AGENTS.md`).

## Known limitations

- The result card shows wpm, accuracy and errors only — no chart, raw speed or consistency, because no per-second series is recorded.
- Characters the keymap cannot produce plainly or with shift never highlight; accented text (`ö`, `ä`, `ß`) needs compose/`RA(...)` support.
- `&trans` is resolved against the base layer rather than ZMK's "next active layer" semantics.

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main`/`master` and publishes `dist/` via GitHub Pages (Actions source, not a `gh-pages` branch). Repository → Settings → Pages → Source → **GitHub Actions**.

`vite.config.ts` sets `base: '/type-o-naut/'`; asset paths derive from `import.meta.env.BASE_URL`, so change that one value if you host under a different path.

## Credits

Inspired by [MonkeyType](https://monkeytype.com/). Keymap handling informed by [keymap-editor](https://github.com/nickcoutsos/keymap-editor) and [keymap-drawer](https://github.com/caksoylar/keymap-drawer).

MIT.
