import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Le thème sombre déclare `color-scheme: dark` : sans lui, l'icône des champs date et les barres
// de défilement restent clairs sur fond sombre (jsdom n'évalue pas le CSS, on lit la feuille).
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('thème sombre : contrôles natifs', () => {
  it('le bloc .dark déclare color-scheme: dark', () => {
    const bloc = css.match(/^\.dark \{([\s\S]*?)^\}/m)?.[1] ?? '';
    expect(bloc).toMatch(/color-scheme:\s*dark;/);
  });

  it('le thème clair ne force pas de color-scheme sombre', () => {
    const racine = css.match(/^:root \{([\s\S]*?)^\}/m)?.[1] ?? '';
    expect(racine).not.toMatch(/color-scheme:\s*dark/);
  });
});
