import type { KeyboardLayout } from '../types';

export function validateKeyboardLayout(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Layout must be a JSON object'] };
  }

  const layout = data as Record<string, unknown>;

  // Check required top-level properties
  if (typeof layout.id !== 'string' || !layout.id) {
    errors.push('Layout must have an "id" property (non-empty string)');
  }

  if (typeof layout.name !== 'string' || !layout.name) {
    errors.push('Layout must have a "name" property (non-empty string)');
  }

  if (!layout.layouts || typeof layout.layouts !== 'object') {
    errors.push('Layout must have a "layouts" object');
    return { valid: false, errors };
  }

  const layouts = layout.layouts as Record<string, unknown>;
  const layoutNames = Object.keys(layouts);

  if (layoutNames.length === 0) {
    errors.push('Layout must define at least one layout');
    return { valid: false, errors };
  }

  // Validate each layout
  for (const [layoutName, layoutDef] of Object.entries(layouts)) {
    if (!layoutDef || typeof layoutDef !== 'object') {
      errors.push(`Layout "${layoutName}" must be an object`);
      continue;
    }

    const layoutObj = layoutDef as Record<string, unknown>;
    const layoutArray = layoutObj.layout;

    if (!Array.isArray(layoutArray)) {
      errors.push(`Layout "${layoutName}" must have a "layout" array`);
      continue;
    }

    if (layoutArray.length === 0) {
      errors.push(`Layout "${layoutName}" has no keys defined`);
      continue;
    }

    // Validate each key
    for (let i = 0; i < layoutArray.length; i++) {
      const key = layoutArray[i];
      if (!key || typeof key !== 'object') {
        errors.push(`Key [${i}] in layout "${layoutName}" is invalid`);
        continue;
      }

      const keyObj = key as Record<string, unknown>;

      if (typeof keyObj.x !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" missing required "x" coordinate`);
      }

      if (typeof keyObj.y !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" missing required "y" coordinate`);
      }

      // Validate optional numeric fields
      if (keyObj.row !== undefined && typeof keyObj.row !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" has invalid "row"`);
      }

      if (keyObj.col !== undefined && typeof keyObj.col !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" has invalid "col"`);
      }

      if (keyObj.r !== undefined && typeof keyObj.r !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" has invalid "r" (rotation)`);
      }

      if (keyObj.rx !== undefined && typeof keyObj.rx !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" has invalid "rx"`);
      }

      if (keyObj.ry !== undefined && typeof keyObj.ry !== 'number') {
        errors.push(`Key [${i}] in layout "${layoutName}" has invalid "ry"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function parseKeyboardLayout(data: unknown): KeyboardLayout | null {
  const validation = validateKeyboardLayout(data);
  if (!validation.valid) {
    console.error('Keyboard layout validation failed:', validation.errors);
    return null;
  }

  try {
    return data as KeyboardLayout;
  } catch {
    return null;
  }
}
