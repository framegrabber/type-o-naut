# Type-o-naut Quick Start Guide

## Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. Production Build
```bash
npm run build
```
Output goes to `dist/` directory.

## First Run

When you first open the app, it loads with:
- **Keyboard**: Ergonaut One S
- **Keymap Layer**: FOCAL (Colemak-based alternative layout)
- **Text**: English minimal word list

The keyboard visualization shows the next key to type highlighted in yellow.

## Loading Custom Configuration

### Option 1: Settings Panel
1. Click the **⚙️ Settings** button
2. Upload or paste URLs for:
   - Keyboard layout (JSON)
   - ZMK keymap (.keymap file)
   - Text content (word list or quotes JSON)
3. Select which layer to practice
4. Click **Done**

### Option 2: URL Parameters
Share your setup with others:
```
http://localhost:5173/?keyboardUrl=URL&keymapUrl=URL&textUrl=URL
```

## Example: Using Your Own Keyboard

### Step 1: Export Your Layout
From [Keyboard Layout Editor](http://www.keyboard-layout-editor.com/):
1. Click "Raw data" tab
2. Copy the JSON
3. Format it as `{"id": "my_kb", "name": "My Keyboard", "layouts": {"LAYOUT": {"layout": [...]}}}`

### Step 2: Export Your Keymap
From your ZMK configuration repository:
1. Get your keyboard's `.keymap` file
2. Upload it or host it online

### Step 3: Prepare Your Text
Create a JSON file with either:
```json
{
  "name": "my_words",
  "words": ["word1", "word2", "word3"]
}
```
Or quotes:
```json
{
  "language": "my_language",
  "quotes": [
    {"text": "...", "source": "...", "id": 1, "length": 0}
  ]
}
```

### Step 4: Load in App
Click Settings and upload/paste URLs to your files.

## Tips & Tricks

### Switching Layers Mid-Test
You can change which keymap layer you're practicing on:
1. Click Settings
2. Change the layer dropdown
3. Close settings
4. Click "New Text" to start with the new layer

### Fast Typing Tips
- Focus on accuracy first, speed comes naturally
- The yellow highlighted key is your next target
- Use the statistics to track your progress
- Practice different layers to improve muscle memory

### Sharing Your Setup
After configuring your keyboard, copy the URL from the address bar and share it!
Example:
```
https://username.github.io/type-o-naut/?keyboardUrl=https://example.com/my_kb.json&keymapUrl=https://example.com/my.keymap&textUrl=https://example.com/words.json
```

## Troubleshooting

**"Can't load keyboard layout"**
- Check the JSON is valid (use [jsonlint.com](https://www.jsonlint.com/))
- Make sure the URL is publicly accessible
- Check that `layouts` object contains at least one layout

**"No bindings in layer"**
- Verify your `.keymap` file has proper `bindings` arrays
- Check layer names match between editor and keymap

**"Word list won't load"**
- Ensure JSON has `name` and `words` array (or `language` and `quotes` array)
- Validate JSON syntax

**Keyboard not appearing**
- Make sure you've loaded a keyboard layout
- Check browser console for errors
- Try toggling the keyboard visibility (⌨️ button)

## File Structure

```
src/
├── components/          # React components
│   ├── TypingTrainer   # Main container
│   ├── StatsDisplay    # WPM/accuracy/errors
│   ├── TextDisplay     # Text with highlighting
│   ├── KeyboardDisplay # Keyboard visualization
│   └── ConfigPanel     # Settings UI
├── utils/              # Parsing & validation
│   ├── zmkParser       # ZMK keymap parsing
│   ├── layoutValidator # Keyboard layout validation
│   ├── textLoader      # Text content handling
│   └── fileLoader      # File/URL loading
└── types/              # TypeScript types
```

## Performance

- Runs entirely in the browser
- No server required
- Works offline (after initial load)
- Fast keyboard highlighting updates
- Minimal dependencies (React, Lucide icons, Tailwind CSS)

## Keyboard Symbols

The app uses these symbols for special keys:

| Symbol | Key |
|--------|-----|
| `␣` | Space |
| `⏎` | Enter/Return |
| `⇥` | Tab |
| `⌫` | Backspace |
| `⌦` | Delete |
| `⇧` | Shift |
| `⌃` | Control |
| `⌥` | Alt/Option |
| `⌘` | Command/Super |
| `↑↓←→` | Arrow keys |
| `⇪` | Caps Lock |

## Next Steps

1. ✅ Get typing! Click the input field and start typing
2. 📈 Watch your WPM and accuracy in real-time
3. ⚙️ Customize with your own keyboard and keymap
4. 🔗 Share your setup with the community

Happy typing! 🚀
