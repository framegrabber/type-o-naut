import { describe, expect, it } from 'vitest';
import { findCompatible, findNodes, parseDts } from './dts';

describe('parseDts', () => {
  it('reads nested nodes and their properties', () => {
    const root = parseDts(`
      / {
        keymap {
          compatible = "zmk,keymap";
          base_layer {
            display-name = "MAIN";
            bindings = <&kp A &kp B>;
          };
        };
      };
    `);

    const keymap = findNodes(root, 'keymap')[0];
    expect(keymap.props.compatible).toBe('zmk,keymap');
    expect(keymap.children).toHaveLength(1);
    expect(keymap.children[0].name).toBe('base_layer');
    expect(keymap.children[0].props['display-name']).toBe('MAIN');
    expect(keymap.children[0].props.bindings).toBe('&kp A &kp B');
  });

  it('keeps the label in front of a node name', () => {
    const root = parseDts('/ { behaviors { hm: homerow_mods { tapping-term-ms = <220>; }; }; };');
    const node = findNodes(root, 'homerow_mods')[0];
    expect(node.label).toBe('hm');
    expect(node.props['tapping-term-ms']).toBe('220');
  });

  it('drops the unit address from a node name', () => {
    expect(findNodes(parseDts('/ { memory@40000000 { x = <1>; }; };'), 'memory')).toHaveLength(1);
  });

  it('ignores comments, block comments and preprocessor lines', () => {
    const root = parseDts(`
      #include <behaviors.dtsi>
      #define BASE 0
      / {
        // a line comment with a brace { and a semicolon ;
        /* a block
           comment = <&kp Q>; */
        keymap { base { bindings = <&kp Q>; }; };
      };
    `);
    expect(findNodes(root, 'base')[0].props.bindings).toBe('&kp Q');
    expect(findNodes(root, 'keymap')[0].children).toHaveLength(1);
  });

  it('collapses a value that spans many lines', () => {
    const root = parseDts(`
      / { keymap { base { bindings = <
        &kp A   &kp B
        &kp C
      >; }; }; };
    `);
    expect(findNodes(root, 'base')[0].props.bindings).toBe('&kp A &kp B &kp C');
  });

  it('records a valueless property', () => {
    const root = parseDts('/ { behaviors { ht: ht { hold-trigger-on-release; }; }; };');
    expect(findNodes(root, 'ht')[0].props['hold-trigger-on-release']).toBe('');
  });

  it('finds a node by its compatible string', () => {
    const root = parseDts('/ { combos { compatible = "zmk,combos"; c: c { timeout-ms = <50>; }; }; };');
    expect(findCompatible(root, 'zmk,combos')?.name).toBe('combos');
    expect(findCompatible(root, 'zmk,keymap')).toBeNull();
  });

  it('does not run away on a truncated file', () => {
    expect(() => parseDts('/ { keymap { base { bindings = <&kp A')).not.toThrow();
  });
});
