// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCS_OBLIGATOIRES, peutActiverBareme } from '@/lib/payroll/bareme/activation';
import {
  versionBaremeCompleteSchema,
  type VersionBaremeComplete,
} from '@/lib/payroll/bareme/schema';
import type { VersionAvecParametres } from '@/lib/payroll/fiche';

// Le garde-fou d'activation (étape 9.5, D119) rejoué sur le barème réel de 2026 et sur des variantes
// volontairement fausses.

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const charger = (nom: string): VersionBaremeComplete =>
  versionBaremeCompleteSchema.parse(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')));

const sept = charger('be-2026-09.json');
const oct = charger('be-2026-10.json');
const nov = charger('be-2026-11.json');

// Copie profonde modifiable, pour fabriquer des variantes sans toucher aux originaux.
const copie = (v: VersionBaremeComplete): VersionBaremeComplete => structuredClone(v);

const active = (v: VersionBaremeComplete): VersionAvecParametres => ({
  code: v.code,
  valideDepuis: v.valideDepuis,
  valideJusqua: v.valideJusqua,
  statut: 'ACTIF',
  categorieEmployeur: v.categorieEmployeur,
  parametres: v.parametres,
});

describe('peutActiverBareme : le barème réel de 2026', () => {
  it('BE-2026-10 est activable : tous les blocs sont fiables et les huit cas d’octobre réussissent', () => {
    expect(peutActiverBareme(oct, [])).toEqual({ ok: true, raisons: [] });
  });

  it('BE-2026-09 est refusée : aucun cas de référence dans sa période', () => {
    const r = peutActiverBareme(sept, []);
    expect(r.ok).toBe(false);
    expect(r.raisons).toEqual([
      'Aucun cas de référence ne tombe dans la période de cette version : elle ne peut pas être validée.',
    ]);
  });

  it('BE-2026-11 est refusée de la même façon, en attendant la série du 01/11/2026', () => {
    const r = peutActiverBareme(nov, []);
    expect(r.ok).toBe(false);
    expect(r.raisons).toHaveLength(1);
    expect(r.raisons[0]).toContain('Aucun cas de référence');
  });

  it('les dix blocs obligatoires sont bien ceux du calcul', () => {
    expect([...BLOCS_OBLIGATOIRES].sort()).toEqual(
      [
        'anomalies',
        'bonusEmploi',
        'cotisationsPatronales',
        'csss',
        'heuresSupplementaires',
        'joursFeries',
        'onss',
        'precompte',
        'reductionStructurelle',
        'salaireGaranti',
      ].sort(),
    );
  });
});

describe('peutActiverBareme : les refus', () => {
  it('refuse une version déjà active ou retirée', () => {
    for (const statut of ['ACTIF', 'RETIRE'] as const) {
      const v = { ...copie(oct), statut };
      const r = peutActiverBareme(v, []);
      expect(r.ok).toBe(false);
      expect(r.raisons[0]).toBe(
        `Seule une version à vérifier peut être activée (statut actuel : ${statut}).`,
      );
    }
  });

  it('refuse un bloc encore à confirmer', () => {
    const v = copie(oct);
    v.source.precompte.fiabilite = 'A_CONFIRMER';
    const r = peutActiverBareme(v, []);
    expect(r.ok).toBe(false);
    expect(r.raisons).toEqual(['Le bloc precompte est encore à confirmer.']);
  });

  it('refuse un bloc sans fiabilité', () => {
    const v = copie(oct);
    delete v.source.csss.fiabilite;
    const r = peutActiverBareme(v, []);
    expect(r.raisons).toEqual([
      "Fiabilité absente pour le bloc csss : à préciser avant l'activation.",
    ]);
  });

  it('accepte une décision interne et une source officielle', () => {
    const v = copie(oct);
    v.source.precompte.fiabilite = 'OFFICIELLE';
    v.source.anomalies.fiabilite = 'DECISION_INTERNE';
    expect(peutActiverBareme(v, []).ok).toBe(true);
  });

  it('refuse un bloc obligatoire manquant et ne rejoue pas les cas sans lui', () => {
    const v = copie(oct);
    delete v.parametres.csss;
    const r = peutActiverBareme(v, []);
    expect(r.ok).toBe(false);
    expect(r.raisons).toEqual(['Bloc manquant : csss.']);
  });

  it('refuse un chevauchement avec une version déjà active de la même catégorie', () => {
    const autre = {
      ...active(copie(sept)),
      code: 'BE-AUTRE',
      valideDepuis: '2026-10-15',
      valideJusqua: null,
    };
    const r = peutActiverBareme(oct, [autre]);
    expect(r.ok).toBe(false);
    expect(r.raisons).toEqual([
      'Les barèmes BE-AUTRE et BE-2026-10 sont actifs sur une même période.',
    ]);
  });

  it('ignore une version à vérifier ou retirée dans le contrôle du chevauchement', () => {
    const retiree = { ...active(copie(oct)), code: 'ANCIENNE', statut: 'RETIRE' as const };
    expect(peutActiverBareme(oct, [retiree])).toEqual({ ok: true, raisons: [] });
  });

  it('refuse un barème faussé : un cas de référence échoue, avec l’écart cité', () => {
    const v = copie(oct);
    v.parametres.precompte!.bonusEmploiFiscal.tauxVoletB = 525_400; // 52,54 % au lieu de 63 %
    const r = peutActiverBareme(v, []);
    expect(r.ok).toBe(false);
    expect(r.raisons).toContain('Cas CAS-1 : bonusFiscal, attendu 12660, obtenu 11260.');
    // 5 écarts cités au plus, puis le nombre des autres
    expect(r.raisons.some((raison) => raison.startsWith('... et '))).toBe(true);
  });

  it('cumule toutes les raisons d’un coup', () => {
    const v = copie(sept);
    v.source.salaireGaranti.fiabilite = 'A_CONFIRMER';
    delete v.source.onss.fiabilite;
    const r = peutActiverBareme(v, []);
    expect(r.raisons).toEqual([
      "Fiabilité absente pour le bloc onss : à préciser avant l'activation.",
      'Le bloc salaireGaranti est encore à confirmer.',
      'Aucun cas de référence ne tombe dans la période de cette version : elle ne peut pas être validée.',
    ]);
  });

  it('refuse une catégorie d’employeur sans cas de référence', () => {
    const v = { ...copie(oct), categorieEmployeur: 'PUBLIC' };
    const r = peutActiverBareme(v, []);
    expect(r.raisons).toContain("Aucun cas de référence pour la catégorie d'employeur PUBLIC.");
  });
});
