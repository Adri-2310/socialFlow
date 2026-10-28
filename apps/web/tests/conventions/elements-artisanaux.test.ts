import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// CONVENTIONS § 5 : aucun <button>, <input>, <select>, <textarea> ni <table> écrit à la main hors
// de components/ui/. Même recherche que la commande `grep` de la convention : une balise
// ouvrante suivie d'un espace, de `>` ou d'une fin de ligne (le `<button` + retour à la ligne
// d'un JSX multiligne compte aussi).
const RACINE = path.resolve(__dirname, '../../src');
const BALISE = /<(button|input|select|textarea|table)([\s>]|$)/;

// Exception unique : global-error.tsx remplace le layout racine, sans globals.css ni variables CSS
// garanties ; il reste donc autonome (CONVENTIONS § 5, AMELIORATIONS § 6).
const EXCEPTIONS = ['app/global-error.tsx'];

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
    return chemin.endsWith('.tsx') ? [chemin] : [];
  });
}

describe('éléments d’interface écrits à la main', () => {
  it('n’en laisse aucun hors de components/ui, à l’exception documentée', () => {
    const trouves = fichiersTsx(RACINE).flatMap((fichier) => {
      const relatif = path.relative(RACINE, fichier).split(path.sep).join('/');
      if (relatif.startsWith('components/ui/') || EXCEPTIONS.includes(relatif)) return [];
      return readFileSync(fichier, 'utf-8')
        .split(/\r?\n/)
        .flatMap((ligne, i) => (BALISE.test(ligne) ? [`${relatif}:${i + 1}  ${ligne.trim()}`] : []));
    });

    expect(trouves).toEqual([]);
  });

  it('l’exception documentée existe encore (sinon, la retirer de la liste)', () => {
    for (const relatif of EXCEPTIONS) {
      expect(readFileSync(path.join(RACINE, relatif), 'utf-8')).toMatch(BALISE);
    }
  });

  it('détecte une balise ouverte puis un retour à la ligne', () => {
    expect(BALISE.test('        <button')).toBe(true);
    expect(BALISE.test('<input type="text" />')).toBe(true);
    expect(BALISE.test('<Button type="button">')).toBe(false);
    expect(BALISE.test('<inputs>')).toBe(false);
  });
});
