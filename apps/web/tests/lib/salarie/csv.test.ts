import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv } from '@/lib/salarie/csv';

describe('analyseur CSV', () => {
  it('lit un fichier simple séparé par des points-virgules (Excel en français)', () => {
    const t = parseCsv('nom;prenom\nDupont;Marie\nMartin;Paul\n');
    expect(t.headers).toEqual(['nom', 'prenom']);
    expect(t.rows).toEqual([
      ['Dupont', 'Marie'],
      ['Martin', 'Paul'],
    ]);
    // L'en-tête est la ligne 1 : les données commencent à la ligne 2.
    expect(t.lignes).toEqual([2, 3]);
  });

  it('détecte la virgule et la tabulation comme séparateurs', () => {
    expect(parseCsv('nom,prenom\nDupont,Marie').rows).toEqual([['Dupont', 'Marie']]);
    expect(parseCsv('nom\tprenom\nDupont\tMarie').rows).toEqual([['Dupont', 'Marie']]);
  });

  it('préfère le point-virgule à égalité, et ignore les virgules d’un champ entre guillemets', () => {
    expect(parseCsv('a;b\n1;2').rows).toEqual([['1', '2']]);
    expect(parseCsv('"a,b";c\n1;2').headers).toEqual(['a,b', 'c']);
  });

  it('retire le BOM UTF-8 que laisse Excel', () => {
    const t = parseCsv('﻿nom;prenom\nDupont;Marie');
    expect(t.headers).toEqual(['nom', 'prenom']);
  });

  it('accepte les fins de ligne \\r\\n, \\n et \\r', () => {
    for (const fin of ['\r\n', '\n', '\r']) {
      const t = parseCsv(`a;b${fin}1;2${fin}3;4`);
      expect(t.rows, JSON.stringify(fin)).toEqual([
        ['1', '2'],
        ['3', '4'],
      ]);
    }
  });

  it('gère les champs entre guillemets : séparateur, guillemet doublé, saut de ligne', () => {
    const t = parseCsv(
      'nom;note\n"Dupont; Jean";"Il dit ""bonjour"""\n"Martin";"ligne 1\nligne 2"\nFin;ok',
    );
    expect(t.rows).toEqual([
      ['Dupont; Jean', 'Il dit "bonjour"'],
      ['Martin', 'ligne 1\nligne 2'],
      ['Fin', 'ok'],
    ]);
    // Un champ sur deux lignes décale la numérotation de la suite.
    expect(t.lignes).toEqual([2, 3, 5]);
  });

  it('garde un guillemet au milieu d’un champ non guillemeté', () => {
    expect(parseCsv('a;b\n5" de large;x').rows).toEqual([['5" de large', 'x']]);
  });

  it('ignore les lignes vides, y compris à la fin et entre les données', () => {
    const t = parseCsv('a;b\n\n1;2\n\n\n3;4\n\n');
    expect(t.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(t.lignes).toEqual([3, 6]);
  });

  it('garde les cellules vides, y compris la dernière', () => {
    expect(parseCsv('a;b;c\n1;;3\n4;5;').rows).toEqual([
      ['1', '', '3'],
      ['4', '5', ''],
    ]);
  });

  it('lit une dernière ligne sans saut de ligne final', () => {
    expect(parseCsv('a;b\n1;2').rows).toEqual([['1', '2']]);
  });

  it('un fichier vide ou sans données donne un tableau vide', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], lignes: [] });
    expect(parseCsv('a;b\n')).toEqual({ headers: ['a', 'b'], rows: [], lignes: [] });
  });

  it('refuse un guillemet jamais refermé', () => {
    expect(() => parseCsv('a;b\n"Dupont;Marie')).toThrow(CsvError);
    try {
      parseCsv('a;b\n"Dupont;Marie');
    } catch (error) {
      expect((error as CsvError).code).toBe('CSV_UNTERMINATED_QUOTE');
    }
  });

  it('retire les espaces autour des noms de colonnes, pas des valeurs', () => {
    const t = parseCsv(' nom ; prenom \n Dupont ; Marie ');
    expect(t.headers).toEqual(['nom', 'prenom']);
    expect(t.rows).toEqual([[' Dupont ', ' Marie ']]);
  });
});
