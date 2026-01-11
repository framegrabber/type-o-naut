import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Settings, Keyboard, Upload } from 'lucide-react';

const TypingTrainer = () => {
  const [text, setText] = useState('the quick brown fox jumps over the lazy dog');
  const [input, setInput] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [finished, setFinished] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [activeLayer, setActiveLayer] = useState(0);
  const inputRef = useRef(null);

  // Ergonaut One S Layout und Keymap
  const keyboardLayout = {
    "id": "ergonaut_one_s",
    "name": "Ergonaut One S",
    "layouts": {
      "LAYOUT": {
        "layout": [
          { "row": 0, "col": 0, "x": 0, "y": 0.95 },
          { "row": 0, "col": 1, "x": 1, "y": 0.32 },
          { "row": 0, "col": 2, "x": 2, "y": 0.0 },
          { "row": 0, "col": 3, "x": 3, "y": 0.34 },
          { "row": 0, "col": 4, "x": 4, "y": 0.47 },
          { "row": 0, "col": 5, "x": 7, "y": 0.47 },
          { "row": 0, "col": 6, "x": 8, "y": 0.34 },
          { "row": 0, "col": 7, "x": 9, "y": 0.0 },
          { "row": 0, "col": 8, "x": 10, "y": 0.32 },
          { "row": 0, "col": 9, "x": 11, "y": 0.95 },
          { "row": 1, "col": 0, "x": 0, "y": 1.95 },
          { "row": 1, "col": 1, "x": 1, "y": 1.32 },
          { "row": 1, "col": 2, "x": 2, "y": 1.0 },
          { "row": 1, "col": 3, "x": 3, "y": 1.34 },
          { "row": 1, "col": 4, "x": 4, "y": 1.47 },
          { "row": 1, "col": 5, "x": 7, "y": 1.47 },
          { "row": 1, "col": 6, "x": 8, "y": 1.34 },
          { "row": 1, "col": 7, "x": 9, "y": 1.0 },
          { "row": 1, "col": 8, "x": 10, "y": 1.32 },
          { "row": 1, "col": 9, "x": 11, "y": 1.95 },
          { "row": 2, "col": 0, "x": 0, "y": 2.95 },
          { "row": 2, "col": 1, "x": 1, "y": 2.32 },
          { "row": 2, "col": 2, "x": 2, "y": 2.0 },
          { "row": 2, "col": 3, "x": 3, "y": 2.34 },
          { "row": 2, "col": 4, "x": 4, "y": 2.47 },
          { "row": 2, "col": 5, "x": 7, "y": 2.47 },
          { "row": 2, "col": 6, "x": 8, "y": 2.34 },
          { "row": 2, "col": 7, "x": 9, "y": 2.0 },
          { "row": 2, "col": 8, "x": 10, "y": 2.32 },
          { "row": 2, "col": 9, "x": 11, "y": 2.95 },
          { "row": 3, "col": 3, "x": 2.5, "y": 3.38 },
          { "row": 3, "col": 4, "x": 3.61, "y": 3.52, "r": 15, "rx": 4.11, "ry": 4.02 },
          { "row": 3, "col": 5, "x": 4.65, "y": 3.95, "r": 30, "rx": 5.15, "ry": 4.45 },
          { "row": 3, "col": 6, "x": 6.35, "y": 3.95, "r": -30, "rx": 6.85, "ry": 4.45 },
          { "row": 3, "col": 7, "x": 7.39, "y": 3.52, "r": -15, "rx": 7.89, "ry": 4.02 },
          { "row": 3, "col": 8, "x": 8.5, "y": 3.38 }
        ]
      }
    }
  };

  // Focal Layer Mapping
  const focalLayer = [
    'v', 'l', 'h', 'g', 'k', 'q', 'f', 'o', 'u', 'j',
    's', 'r', 'n', 't', 'b', 'y', 'c', 'a', 'e', 'i',
    'z', 'x', 'm', 'd', 'p', "'", 'w', '.', ';', ',',
    'esc', 'bspc', 'tab', 'ret', ' ', 'del'
  ];

  const testTexts = [
    'the quick brown fox jumps over the lazy dog',
    'pack my box with five dozen liquor jugs',
    'how vexingly quick daft zebras jump',
    'the five boxing wizards jump quickly'
  ];

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (startTime && !finished) {
      const interval = setInterval(() => {
        const timeElapsed = (Date.now() - startTime) / 1000 / 60;
        const wordsTyped = input.length / 5;
        setWpm(Math.round(wordsTyped / timeElapsed));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [startTime, input, finished]);

  const handleInput = (e) => {
    const value = e.target.value;
    
    if (!startTime) {
      setStartTime(Date.now());
    }

    // Nur vorwärts typen zählen
    if (value.length > input.length) {
      const newChar = value[value.length - 1];
      if (newChar !== text[currentIndex]) {
        setErrors(errors + 1);
      }
      setCurrentIndex(currentIndex + 1);
    } else if (value.length < input.length) {
      // Backspace: Position zurücksetzen
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }

    setInput(value);
    
    const correct = value.split('').filter((char, i) => char === text[i]).length;
    setAccuracy(value.length > 0 ? Math.round((correct / value.length) * 100) : 100);

    // Fertig wenn die gleiche Länge erreicht ist
    if (value.length === text.length) {
      setFinished(true);
    }
  };

  const reset = () => {
    setInput('');
    setCurrentIndex(0);
    setErrors(0);
    setStartTime(null);
    setWpm(0);
    setAccuracy(100);
    setFinished(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const newText = () => {
    const randomText = testTexts[Math.floor(Math.random() * testTexts.length)];
    setText(randomText);
    reset();
  };

  const getKeyLabel = (index) => {
    const key = focalLayer[index];
    if (key === ' ') return 'SPC';
    return key || '';
  };

  const getNextKeyIndex = () => {
    if (currentIndex >= text.length) return -1;
    const nextChar = text[currentIndex].toLowerCase();
    return focalLayer.indexOf(nextChar);
  };

  const renderKey = (key, index) => {
    const label = getKeyLabel(index);
    const nextKeyIndex = getNextKeyIndex();
    const isNextKey = index === nextKeyIndex;
    const scale = 50;
    const keySize = 0.9;
    
    const style = {
      position: 'absolute',
      left: `${key.x * scale}px`,
      top: `${key.y * scale}px`,
      width: `${keySize * scale}px`,
      height: `${keySize * scale}px`,
      transform: key.r ? `rotate(${key.r}deg)` : 'none',
      transformOrigin: key.rx && key.ry ? `${(key.rx - key.x) * scale}px ${(key.ry - key.y) * scale}px` : 'center'
    };

    return (
      <div
        key={index}
        style={style}
        className={`
          flex items-center justify-center rounded border-2 text-sm font-mono
          transition-all duration-150
          ${isNextKey 
            ? 'bg-yellow-400 border-yellow-500 scale-110 shadow-lg' 
            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
          }
        `}
      >
        <span className={isNextKey ? 'text-gray-900 font-bold' : 'text-gray-200'}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-yellow-400">Ergonaut Typing Trainer</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setShowKeyboard(!showKeyboard)}
              className="p-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <Keyboard size={20} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-gray-400 text-sm">WPM</div>
            <div className="text-3xl font-bold text-yellow-400">{wpm}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-gray-400 text-sm">Accuracy</div>
            <div className="text-3xl font-bold text-green-400">{accuracy}%</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-gray-400 text-sm">Errors</div>
            <div className="text-3xl font-bold text-red-400">{errors}</div>
          </div>
        </div>

        {/* Text Display */}
        <div className="bg-gray-800 p-8 rounded-lg mb-8">
          <div className="font-mono text-2xl leading-relaxed">
            {text.split('').map((char, i) => {
              let className = 'text-gray-500';
              if (i < input.length) {
                className = input[i] === char ? 'text-green-400' : 'text-red-400 bg-red-900/30';
              } else if (i === currentIndex) {
                className = 'text-yellow-400 border-b-2 border-yellow-400';
              }
              return (
                <span key={i} className={className}>
                  {char}
                </span>
              );
            })}
          </div>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInput}
          disabled={finished}
          className="w-full bg-gray-800 text-gray-100 p-4 rounded-lg mb-8 font-mono text-xl focus:outline-none focus:ring-2 focus:ring-yellow-400"
          placeholder="Start typing..."
        />

        {/* Controls */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
          >
            <RotateCcw size={20} />
            Reset
          </button>
          <button
            onClick={newText}
            className="flex items-center gap-2 px-6 py-3 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition-colors font-semibold"
          >
            New Text
          </button>
        </div>

        {/* Keyboard Visualization */}
        {showKeyboard && (
          <div className="bg-gray-800 p-8 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-yellow-400">Focal Layout - Ergonaut One S</h2>
            <div className="relative" style={{ height: '280px', width: '700px', margin: '0 auto' }}>
              {keyboardLayout.layouts.LAYOUT.layout.map((key, index) => renderKey(key, index))}
            </div>
          </div>
        )}

        {/* Finish Message */}
        {finished && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="bg-gray-800 p-8 rounded-lg max-w-md">
              <h2 className="text-3xl font-bold text-yellow-400 mb-4">Test Complete!</h2>
              <div className="space-y-2 mb-6">
                <p className="text-xl">WPM: <span className="text-yellow-400 font-bold">{wpm}</span></p>
                <p className="text-xl">Accuracy: <span className="text-green-400 font-bold">{accuracy}%</span></p>
                <p className="text-xl">Errors: <span className="text-red-400 font-bold">{errors}</span></p>
              </div>
              <button
                onClick={reset}
                className="w-full px-6 py-3 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TypingTrainer;