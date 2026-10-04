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

On first load the app fetches three files from `public/defaults/`:

| File | Contents |
| --- | --- |
| `ergonaut_one_s.json` | Ergonaut One S physical layout — 36 keys with `x`/`y`/rotation |
| `ergonaut_one_s.keymap` | ZMK keymap with 9 layers (MAIN, FOCAL, NAV, MOUSE, MEDIA, NUM, SYM, FUN, ADJ) |
| `english_minimal.json` | Four pangram quotes |

Each file is fetched independently; if one is missing or invalid the rest still load, and the text falls back to the built-in pangrams.

## Using your own hardware

Open **⚙ Settings** to upload a layout JSON, a `.keymap` file, or a text JSON — or paste a URL and press Enter. Validation errors are listed inline with the exact field that failed.

The same three sources can be passed as query parameters, which makes configurations shareable:

```
https://<user>.github.io/type-o-naut/?keyboardUrl=…&keymapUrl=…&textUrl=…
```

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

Unknown behaviors fall back to their last parameter mapped as a keycode. Hold-tap labels intentionally show only the tap key, because that is what gets typed.

New keycodes go in `ZMK_KEYCODE_MAP` in [`src/utils/zmkParser.ts`](src/utils/zmkParser.ts).

## How the metrics work

- **WPM** — net: correctly typed characters ÷ 5 ÷ elapsed minutes. Updated every 250 ms and recomputed exactly once more on the finishing keystroke.
- **Accuracy** — keystroke-based: `(keystrokes − errors) / keystrokes`. Backspacing over a mistake does **not** restore it.
- **Errors** — keystrokes that did not match the expected character.

Pasting is blocked: only single-character edits are accepted, so a run cannot be skipped.

## Known limitations

- The next-key highlight only searches the **selected** layer. Characters that live on another layer (digits, `!`, `?`, `_` on this keymap) highlight nothing, and capitals do not indicate shift.
- Results are not persisted between sessions.
- Combos and macros are not parsed.

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main`/`master` and publishes `dist/` via GitHub Pages (Actions source, not a `gh-pages` branch). Repository → Settings → Pages → Source → **GitHub Actions**.

`vite.config.ts` sets `base: '/type-o-naut/'`; asset paths derive from `import.meta.env.BASE_URL`, so change that one value if you host under a different path.

## Credits

Inspired by [MonkeyType](https://monkeytype.com/). Keymap handling informed by [keymap-editor](https://github.com/nickcoutsos/keymap-editor) and [keymap-drawer](https://github.com/caksoylar/keymap-drawer).

MIT.
