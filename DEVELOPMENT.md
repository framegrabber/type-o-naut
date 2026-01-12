# Type-o-naut Development Guide

## Architecture Overview

Type-o-naut is built with a modular, component-based architecture focusing on separation of concerns:

### Core Layers

1. **Components** - React UI components
2. **Utils** - Parsing, validation, and data loading
3. **Types** - TypeScript interfaces for type safety
4. **State** - Typing state managed in TypingTrainer component

## Component Hierarchy

```
TypingTrainer (main component)
├── StatsDisplay (WPM, accuracy, errors)
├── TextDisplay (text rendering)
├── KeyboardDisplay (keyboard visualization)
├── ConfigPanel (settings modal)
└── Completion Modal
```

### Component Details

#### TypingTrainer.tsx
- **Responsibility**: Main typing test logic and state management
- **State**:
  - `layout`: Current keyboard layout
  - `keymap`: Parsed ZMK keymap with all layers
  - `selectedLayer`: Which keymap layer to display
  - `textContent`: Current word list or quotes
  - `typing`: Active test state (text, input, position, stats)
- **Key Functions**:
  - `handleInput()`: Process keyboard input
  - `reset()`: Reset test state
  - `newText()`: Generate new text to type
  - `getNextKeyIndex()`: Find next key in layout

#### StatsDisplay.tsx
- **Props**: `wpm`, `accuracy`, `errors`
- **Display**: Grid of 3 stat cards
- **Updates**: Real-time from parent

#### TextDisplay.tsx
- **Props**: `text`, `input`, `currentIndex`
- **Display**: Text with color-coded characters
  - Gray: Not yet typed
  - Green: Correct
  - Red: Incorrect
  - Yellow: Current position (underline)

#### KeyboardDisplay.tsx
- **Props**: `keyPositions`, `keyLabels`, `nextKeyIndex`, `scale`, `keySize`
- **Display**: Absolute-positioned keys with rotation support
- **Highlighting**: Yellow glow for next key

#### ConfigPanel.tsx
- **Functionality**:
  - File upload (keyboard layout, keymap, text)
  - URL input with loading
  - Error display with helpful messages
  - Layer selection dropdown
- **Validation**: Calls validator functions and displays errors

## Utilities

### zmkParser.ts
```typescript
parseZmkKeymap(content: string): ParsedKeymap
```
- Reads `.keymap` file content
- Extracts layers and their bindings
- Parses binding syntax:
  - `&kp KEY` → key press
  - `&mt MOD KEY` → mod-tap
  - `&lt LAYER KEY` → layer-tap
  - `&none` → empty
  - `&trans` → transparent
  - `&mo LAYER` → momentary
  - `&to LAYER` → toggle

**Key Code Mapping**: `ZMK_KEYCODE_MAP` translates ZMK keycodes to human-readable symbols.

### layoutValidator.ts
```typescript
validateKeyboardLayout(data: unknown): { valid: boolean; errors: string[] }
```
- Validates JSON structure
- Checks required fields (id, name, layouts, keys with x/y)
- Validates optional fields (r, rx, ry for rotation)
- Returns detailed error messages

### textLoader.ts
```typescript
isWordList(data: unknown): data is WordList
isQuoteList(data: unknown): data is QuoteList
parseTextContent(data: unknown): TextContent | null
getTextToType(content: TextContent): string
```
- Detects text format (words vs quotes)
- Validates structure
- localStorage integration:
  - `customText`: Word lists
  - `customTextLong`: Quotes

### fileLoader.ts
```typescript
loadFileAsJson(file: File): Promise<unknown>
loadFileAsText(file: File): Promise<string>
loadJsonFromUrl(url: string): Promise<unknown>
loadTextFromUrl(url: string): Promise<string>
getQueryParam(param: string): string | null
```
- File upload handling
- URL fetching with CORS support
- Query parameter parsing

## Type System

All major types are defined in `src/types/index.ts`:

```typescript
interface KeyPosition { row, col, x, y, r?, rx?, ry? }
interface KeyboardLayout { id, name, layouts }
interface KeymapLayer { name, bindings[] }
interface ParsedKeymap { layers[], defaultLayer }
interface TextContent { type, data: WordList | QuoteList }
```

## State Management

Single source of truth in `TypingTrainer` component:

```typescript
const [typing, setTyping] = useState<TypingState>({
  text: string,
  input: string,
  currentIndex: number,
  errors: number,
  startTime: number | null,
  wpm: number,
  accuracy: number,
  finished: boolean
})
```

Updates happen in `handleInput()` and propagate to child components via props.

## Styling

- **Framework**: Tailwind CSS with custom dark theme
- **Colors**:
  - Yellow: `#FBBF24` - Primary action and highlights
  - Green: `#4ADE80` - Success/correct
  - Red: `#F87171` - Errors/incorrect
  - Gray: `#1F2937` to `#F3F4F6` - Backgrounds and text

## Build Configuration

### Vite
- **Base path**: `/type-o-naut/` (for GitHub Pages)
- **Output**: `dist/` directory
- **Plugins**: React fast refresh

### TypeScript
- **Target**: ES2020
- **Strict mode**: Enabled
- **JSX**: react-jsx

### Tailwind CSS
- **Content**: `src/**/*.{js,ts,jsx,tsx}`
- **Purging**: Automatic

## Key Implementation Details

### Next Key Detection Algorithm
```typescript
getNextKeyIndex(): number {
  const nextChar = text[currentIndex].toLowerCase()
  const labels = getKeyLabels()
  
  // Find label matching the character
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].toLowerCase()
    if (label === nextChar || label.includes(nextChar)) {
      return i
    }
  }
  return -1
}
```

### Accuracy Calculation
```typescript
const correct = input
  .split('')
  .filter((char, i) => char === text[i])
  .length
const accuracy = input.length > 0 
  ? Math.round((correct / input.length) * 100) 
  : 100
```

### WPM Calculation
```typescript
const timeElapsed = (Date.now() - startTime) / 1000 / 60  // minutes
const wordsTyped = input.length / 5
const wpm = Math.round(wordsTyped / timeElapsed)
```

## Adding New Features

### Adding a New Key Binding Type
1. Update `parseKeyBinding()` in `zmkParser.ts`
2. Add regex pattern and label generation
3. Add keycode to `ZMK_KEYCODE_MAP` if needed

### Adding a New Statistics Metric
1. Add to `TypingState` interface
2. Calculate in `handleInput()`
3. Create display component or add to `StatsDisplay`

### Adding Language Support
1. Create `i18n/` folder
2. Add translation JSON files
3. Create language context/hook
4. Wrap app with language provider

### Custom Themes
1. Extend `tailwind.config.js` with new color palette
2. Create theme selector component
3. Store preference in localStorage
4. Toggle `dark` class on root element

## Performance Optimization

### Current Optimizations
- Keyboard highlighting uses CSS transforms (GPU-accelerated)
- Text rendering efficiently with key-based mapping
- Minimal re-renders via React.FC memoization
- One WPM calculation interval (not per keystroke)

### Potential Improvements
- Memoize components with `React.memo()`
- Split `ConfigPanel` into smaller sub-components
- Virtual scrolling for large text displays
- Service Worker for offline support
- IndexedDB for caching downloaded files

## Testing

No tests are currently included. To add:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/user-event
```

Example test structure:
```typescript
import { describe, it, expect } from 'vitest'
import { parseZmkKeymap } from '../utils/zmkParser'

describe('zmkParser', () => {
  it('parses simple keymaps', () => {
    const result = parseZmkKeymap('default_layer { bindings = <&kp Q>; }')
    expect(result.layers).toHaveLength(1)
  })
})
```

## Debugging

### Browser DevTools
1. **React DevTools** - Inspect component props/state
2. **Network tab** - Monitor file/URL loads
3. **Console** - Check for parse errors
4. **Sources** - Step through TypeScript code

### Common Issues
- **Blank keyboard** - No layout loaded or invalid key positions
- **Wrong bindings** - Layer index mismatch or incomplete keymap parse
- **Text not loading** - Invalid JSON or wrong format (check console)

## Deployment

### GitHub Pages
1. Push to `main`/`master` branch
2. Actions workflow builds and deploys automatically
3. Site available at `https://username.github.io/type-o-naut/`

### Custom Domain
1. Create `CNAME` file in `public/` with domain
2. Configure DNS to point to GitHub Pages IPs
3. Enable custom domain in repository settings

### Self-Hosted
1. Build with `npm run build`
2. Serve `dist/` folder with any HTTP server
3. Ensure proper routing (Vite is SPA, all routes → index.html)

## Dependencies

- **react** (18.2.0): UI framework
- **react-dom** (18.2.0): DOM rendering
- **lucide-react** (0.263.1): Icons
- **tailwindcss** (3.3.0): Styling
- **vite** (4.4.0): Build tool
- **typescript** (5.0.0): Type checking

No other runtime dependencies - lightweight and fast!

## Contributing Guidelines

1. Keep components small and focused
2. Use TypeScript interfaces for all data
3. Add validation for user input
4. Provide helpful error messages
5. Update documentation when adding features
6. Test with multiple keyboard layouts and keymaps
7. Ensure dark theme contrast ratios

## Future Roadmap

- [ ] Statistics history and graphs
- [ ] Multiple language support
- [ ] Custom color themes
- [ ] Offline support with Service Workers
- [ ] Sound effects toggle
- [ ] Difficulty levels (easy/medium/hard texts)
- [ ] Keyboard firmware simulator
- [ ] Community submissions for layouts/keymaps
- [ ] Mobile touch keyboard support
- [ ] Multiplayer typing races

Enjoy developing! 🚀
