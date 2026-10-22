import { describe, expect, it } from 'vitest';
import { situationSalarie, situationSortie } from '@/lib/salarie/sortie';

const jour = (iso: string) => new Date(iso);

describe('situation d’un salarié par rapport à sa sortie', () => {
  const aujourdhui = jour('2026-10-21T15:30:00Z');

  it('est « en poste » sans date de sortie', () => {
    expect(situationSortie(null, aujourdhui)).toBe('EN_POSTE');
  });

  it('« sort bientôt » tant que le dernier jour n’est pas passé, jour même compris', () => {
    expect(situationSortie(jour('2026-12-31'), aujourdhui)).toBe('SORT_BIENTOT');
    // Le jour de la sortie, le salarié travaille encore.
    expect(situationSortie(jour('2026-10-21'), aujourdhui)).toBe('SORT_BIENTOT');
  });

  it('est « sorti » dès le lendemain du dernier jour', () => {
    expect(situationSortie(jour('2026-10-20'), aujourdhui)).toBe('SORTI');
    expect(situationSortie(jour('2020-01-01'), aujourdhui)).toBe('SORTI');
  });

  it('ne dépend que du jour, pas de l’heure', () => {
    expect(situationSortie(jour('2026-10-21'), jour('2026-10-21T00:00:00Z'))).toBe('SORT_BIENTOT');
    expect(situationSortie(jour('2026-10-21'), jour('2026-10-21T23:59:59Z'))).toBe('SORT_BIENTOT');
    expect(situationSortie(jour('2026-10-21'), jour('2026-10-22T00:00:00Z'))).toBe('SORTI');
  });
});

describe('situation d’un salarié selon son entrée et sa sortie', () => {
  const aujourdhui = jour('2026-10-21T15:30:00Z');

  it('n’est pas encore entré tant que la date d’entrée est dans le futur', () => {
    expect(situationSalarie(jour('2026-12-01'), null, aujourdhui)).toBe('PAS_ENCORE_ENTRE');
    expect(situationSalarie(jour('2026-10-22'), null, aujourdhui)).toBe('PAS_ENCORE_ENTRE');
  });

  it('est en poste dès le jour même de l’entrée', () => {
    expect(situationSalarie(jour('2026-10-21'), null, aujourdhui)).toBe('EN_POSTE');
    expect(situationSalarie(jour('2024-03-01'), null, aujourdhui)).toBe('EN_POSTE');
  });

  it('une sortie programmée ne change pas le fait qu’il n’est pas encore entré', () => {
    expect(situationSalarie(jour('2027-01-01'), jour('2027-06-30'), aujourdhui)).toBe(
      'PAS_ENCORE_ENTRE',
    );
  });

  it('retrouve la situation de sortie une fois entré', () => {
    expect(situationSalarie(jour('2024-03-01'), jour('2026-12-31'), aujourdhui)).toBe(
      'SORT_BIENTOT',
    );
    expect(situationSalarie(jour('2024-03-01'), jour('2026-10-20'), aujourdhui)).toBe('SORTI');
  });
});
