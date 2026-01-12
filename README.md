# Type-o-naut - Ergonaut Typing Trainer

A modern, statically-hosted typing trainer built for custom keyboard layouts. Practice typing with your own keyboard layout and keymap, with support for ZMK keymaps and MonkeyType-style text content.

## Features

- ⌨️ **Custom Keyboard Layouts** - Load keyboard layout JSON files (via file upload or URL)
- 🗺️ **ZMK Keymap Support** - Parse ZMK `.keymap` files with multiple layers
- 📚 **Flexible Text Content** - Support for word lists and quotes in MonkeyType format
- 🎯 **Real-time Feedback** - Visual keyboard highlighting showing the next key to type
- 📊 **Performance Metrics** - Track WPM, accuracy, and errors in real-time
- 💾 **URL Sharing** - Load configurations via query parameters for easy sharing
- 🎨 **Responsive UI** - Dark theme with Tailwind CSS
- 📱 **Client-side Only** - Runs entirely in the browser, perfect for GitHub Pages

## Getting Started

### Prerequisites

- Node.js 16+ (for development)
- npm or yarn

### Installation

```bash
cd type-o-naut
npm install
```

### Development

```bash
npm run dev
```

This will start a development server at `http://localhost:5173`.

### Production Build

```bash
npm run build
```

Output will be in the `dist/` directory.

## Usage

### Default Setup

On first load, the app comes with:
- **Keyboard Layout**: Ergonaut One S
- **Keymap**: FOCAL layer (a Colemak-based layout)
- **Text**: English 1K word list

### Configuration

Click the **Settings** button (⚙️) to open the Configuration Panel where you can:

#### Keyboard Layout
- Upload a JSON file with keyboard layout definition
- Or provide a URL to fetch from
- Required format:
```json
{
  "id": "keyboard_id",
  "name": "Keyboard Name",
  "layouts": {
    "LAYOUT": {
      "layout": [
        {"row": 0, "col": 0, "x": 0, "y": 0},
        {"row": 0, "col": 1, "x": 1, "y": 0.32}
      ]
    }
  }
}
```

#### ZMK Keymap
- Upload a `.keymap` file
- Or provide a URL to fetch from
- The app will parse all layers and allow you to select which one to practice on
- Example binding formats supported:
  - `&kp KEY` - Key press
  - `&mt MOD KEY` - Mod-tap (modifier + key)
  - `&lt LAYER KEY` - Layer-tap
  - `&mo LAYER` - Momentary layer
  - `&none` - Empty key

#### Text Content
- Upload JSON in MonkeyType word list format:
```json
{
  "name": "word_list_name",
  "words": ["word1", "word2", "word3"]
}
```
- Or quotes format:
```json
{
  "language": "english",
  "groups": [[0, 100], [101, 300]],
  "quotes": [
    {"text": "...", "source": "...", "length": 0, "id": 1}
  ]
}
```

### URL Parameters

Share configurations via URL parameters:

```
https://your-domain/type-o-naut/?keyboardUrl=URL&keymapUrl=URL&textUrl=URL
```

Example:
```
https://your-domain/type-o-naut/?keyboardUrl=https://example.com/my_layout.json&keymapUrl=https://example.com/my_keymap.keymap&textUrl=https://example.com/words.json
```

## Key Label Mapping

The app converts ZMK keycodes to human-readable labels:

| ZMK Keycode | Display |
|---|---|
| `A-Z` | `A-Z` |
| `N0-N9` | `0-9` |
| `SPACE`, `SPC` | `␣` |
| `ENTER`, `RET` | `⏎` |
| `TAB` | `⇥` |
| `BSPC` | `⌫` |
| `DEL` | `⌦` |
| `LEFT_SHIFT` | `⇧` |
| `LEFT_CONTROL` | `⌃` |
| `LEFT_ALT` | `⌥` |
| `LEFT_GUI` | `⌘` |
| `UP`, `DOWN`, `LEFT`, `RIGHT` | `↑`, `↓`, `←`, `→` |

### Modifiers

Modifier combinations are displayed as `MOD+KEY`, e.g.:
- `&mt LEFT_SHIFT A` → `⇧+A`
- `&mt LEFT_CONTROL S` → `⌃+S`

### Layer Taps

Layer-tap keys show both the layer and key:
- `&lt 1 SPACE` → `L1/␣`

## Project Structure

```
type-o-naut/
├── src/
│   ├── components/
│   │   ├── TypingTrainer.tsx        # Main component with state management
│   │   ├── StatsDisplay.tsx         # WPM, accuracy, errors display
│   │   ├── TextDisplay.tsx          # Text rendering with feedback
│   │   ├── KeyboardDisplay.tsx      # Keyboard visualization
│   │   └── ConfigPanel.tsx          # Settings UI
│   ├── utils/
│   │   ├── zmkParser.ts            # ZMK keymap parsing
│   │   ├── layoutValidator.ts      # Keyboard layout validation
│   │   ├── textLoader.ts           # Text content loading and validation
│   │   └── fileLoader.ts           # File and URL loading utilities
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
│   └── defaults/
│       ├── ergonaut_one_s.json
│       ├── ergonaut_one_s.keymap
│       └── english_minimal.json
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Pages deployment
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## Error Handling

The app provides detailed error messages for:

- **Invalid JSON** - Malformed JSON files
- **Missing required fields** - Layout missing coordinates, keymaps without bindings
- **Invalid bindings** - Unrecognized ZMK keycodes
- **Network errors** - Failed to load from URLs
- **Type validation** - Wrong data structure detected

All errors are displayed in the Configuration Panel with helpful descriptions.

## GitHub Pages Deployment

1. **Push to repository** with the `main` or `master` branch
2. **GitHub Actions** automatically builds and deploys to GitHub Pages
3. **Access** at `https://username.github.io/type-o-naut/`

### Initial Setup

1. In repository settings, enable GitHub Pages
2. Set source to "Deploy from a branch"
3. Select `gh-pages` branch (created by Actions)

The workflow file (`.github/workflows/deploy.yml`) handles everything automatically.

## Customization

### Adding Default Text

Create new word list files in `public/defaults/` and load them via URL parameters.

### Modifying Styling

Edit `src/index.css` and `tailwind.config.js` to customize colors and layout.

### Adding Key Label Mappings

Extend the `ZMK_KEYCODE_MAP` in `src/utils/zmkParser.ts` to support additional keycodes.

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Modern mobile browsers

## Performance

- **Bundle size**: ~150KB (gzipped)
- **No external API calls** (except for user-provided URLs)
- **Instant UI updates** - 60 FPS keyboard highlighting
- **Efficient re-renders** - React with TypeScript

## Future Enhancements

- [ ] Save results to localStorage
- [ ] Theme customization
- [ ] More ZMK binding types (combos, macros)
- [ ] Import from Keyboard Layout Editor (KLE)
- [ ] Multi-language support
- [ ] Typing statistics and history

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

MIT License - feel free to use this for your own typing practice!

## Troubleshooting

### Files won't load from URL
- Ensure the URL is accessible and CORS-enabled
- Check browser console for specific error messages

### Keymap not showing all layers
- Verify the `.keymap` file has valid `default_layer` section
- Check that layer definitions have proper `bindings` arrays

### Keyboard not displaying correctly
- Ensure layout JSON has all required key properties (`x`, `y`)
- Check that key positions don't overlap (or intentionally position them)

### Text not loading
- Ensure JSON has either `words` array (word list) or `quotes` array (quotes)
- Word lists require `name` property, quotes require `language` property

## Credits

- Inspired by [MonkeyType](https://monkeytype.com/) typing test
- Keyboard visualization based on [Keyboard Layout Editor](http://www.keyboard-layout-editor.com/)
- ZMK parsing inspired by [Keymap Editor](https://github.com/nickcoutsos/keymap-editor) and [Keymap Drawer](https://github.com/caksoylar/keymap-drawer)
