import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The extension folder is not built, bundled, linted or type-checked — it is
 * loaded straight into Chrome. So nothing was checking it, and a stray raw
 * newline inside a string literal shipped a popup.js that would not parse.
 *
 * The symptom was the worst kind: pressing the button did NOTHING. The module
 * never evaluated, so not one line of the careful "always show a screen"
 * handling ever ran, and the window sat on its loading message forever while
 * the operator reloaded the extension over and over looking for the fault.
 *
 * These tests are the guard, and they are deliberately dumb and fast.
 */

const ROOT = 'browser-extension/hobbeast-importer';

function scripts(): string[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT).filter((name) => name.endsWith('.js'));
}

/** Import and export are only legal in a module, so they go before parsing. */
function parseable(source: string): string {
  return source.replace(/^\s*(import|export)\s.*$/gm, '');
}

describe('browser extension', () => {
  it('has scripts to check', () => {
    expect(scripts().length).toBeGreaterThan(0);
  });

  it.each(scripts())('%s parses the way Chrome parses it', (name) => {
    const source = readFileSync(join(ROOT, name), 'utf8');
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      new Function(parseable(source));
    }, `${name} does not parse — Chrome would silently load nothing`).not.toThrow();
  });

  it('would have caught the newline that broke the popup', () => {
    // The exact shape of the bug: an editing step turned \n inside a string
    // into a real line break, and a file that cannot parse makes the button
    // do nothing whatsoever — no error, no screen, no clue.
    const broken = ["const x = ['a'].join('", "');"].join('\n');
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      new Function(broken);
    }).toThrow();
  });

  it('declares every element id its popup script reaches for', () => {
    const html = readFileSync(join(ROOT, 'popup.html'), 'utf8');
    const js = readFileSync(join(ROOT, 'popup.js'), 'utf8');
    const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));

    // A missing id throws where the listener is attached, at module scope,
    // which kills the whole popup exactly the way a syntax error does.
    for (const [, wanted] of js.matchAll(/\$\('([^']+)'\)/g)) {
      expect(
        ids.has(wanted),
        `popup.js reaches for #${wanted}, which popup.html does not define`,
      ).toBe(true);
    }
  });

  it('keeps the manifest loadable and pointing at files that exist', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(existsSync(join(ROOT, manifest.action.default_popup))).toBe(true);
    for (const icon of Object.values(manifest.icons ?? {})) {
      expect(existsSync(join(ROOT, String(icon))), `missing icon ${icon}`).toBe(true);
    }
  });

  it('ships no API key', () => {
    for (const name of [...scripts(), 'manifest.json']) {
      const source = readFileSync(join(ROOT, name), 'utf8');
      expect(source).not.toMatch(/eyJhbGciOi/);
      expect(source).not.toMatch(/service_role/);
    }
  });
});
