// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { peutActiverBareme } from '@/lib/payroll/bareme/activation';
import {
  versionBaremeCompleteSchema,
  type VersionBaremeComplete,
} from '@/lib/payroll/bareme/schema';
import { CAS_REFERENCE_2026 } from '@/lib/payroll/cas-reference';
import { calculerFiche, type VersionAvecParametres } from '@/lib/payroll/fiche';

// Dérogation à l'absence de cas de référence (D122) : elle lève SEULEMENT cette absence.

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const charger = (nom: string): VersionBaremeComplete =>
  versionBaremeCompleteSchema.parse(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')));
const sept = charger('be-2026-09.json');
const oct = charger('be-2026-10.json');
const nov = charger('be-2026-11.json');
const copie = (v: VersionBaremeComplete): VersionBaremeComplete => structuredClone(v);
const DEROGATION = { derogationSansCasReference: true };
const avec = (v: VersionBaremeComplete) => peutActiverBareme(v, [], CAS_REFERENCE_2026, DEROGATION);

describe('peutActiverBareme : la dérogation de D122', () => {
  it('sans dérogation, septembre et novembre restent refusés (comportement inchangé)', () => {
    expect(peutActiverBareme(sept, []).ok).toBe(false);
    expect(peutActiverBareme(nov, []).ok).toBe(false);
  });

  it('avec la dérogation, septembre et novembre sont activables et le résultat le signale', () => {
    expect(avec(sept)).toEqual({ ok: true, raisons: [], sansCasReference: true });
    expect(avec(nov)).toEqual({ ok: true, raisons: [], sansCasReference: true });
  });

  it('octobre reste activable sans passer par la dérogation : le résultat ne la signale pas', () => {
    const r = avec(oct);
    expect(r).toEqual({ ok: true, raisons: [] });
    expect(r.sansCasReference).toBeUndefined();
  });

  it('une catégorie d’employeur sans cas est activable avec la dérogation', () => {
    const autre = { ...copie(oct), categorieEmployeur: 'PUBLIC' };
    expect(peutActiverBareme(autre, []).ok).toBe(false);
    expect(avec(autre)).toEqual({ ok: true, raisons: [], sansCasReference: true });
  });

  it('un cas de référence qui échoue n’est jamais dérogé', () => {
    const v = copie(oct);
    v.parametres.precompte!.bonusEmploiFiscal.tauxVoletB = 525_400;
    const r = avec(v);
    expect(r.ok).toBe(false);
    expect(r.raisons).toContain('Cas CAS-1 : bonusFiscal, attendu 12660, obtenu 11260.');
    expect(r.sansCasReference).toBeUndefined();
  });

  it('les autres raisons restent : seule l’absence de cas disparaît de la liste', () => {
    const v = copie(sept);
    v.source.salaireGaranti.fiabilite = 'A_CONFIRMER';
    delete v.source.onss.fiabilite;
    const r = avec(v);
    expect(r.ok).toBe(false);
    expect(r.raisons).toEqual([
      "Fiabilité absente pour le bloc onss : à préciser avant l'activation.",
      'Le bloc salaireGaranti est encore à confirmer.',
    ]);
    expect(r.sansCasReference).toBeUndefined();
  });

  it('un bloc manquant, un statut déjà actif ou un chevauchement ne se dérogent pas', () => {
    const sansBloc = copie(sept);
    delete sansBloc.parametres.csss;
    expect(avec(sansBloc).raisons).toEqual(['Bloc manquant : csss.']);

    expect(avec({ ...copie(sept), statut: 'ACTIF' }).raisons[0]).toBe(
      'Seule une version à vérifier peut être activée (statut actuel : ACTIF).',
    );

    const active: VersionAvecParametres = {
      code: 'BE-AUTRE',
      valideDepuis: '2026-09-15',
      valideJusqua: null,
      statut: 'ACTIF',
      categorieEmployeur: 'PRIVE_MARCHAND',
      parametres: sept.parametres,
    };
    const r = peutActiverBareme(sept, [active], CAS_REFERENCE_2026, DEROGATION);
    expect(r.ok).toBe(false);
    expect(r.raisons).toEqual([
      'Les barèmes BE-AUTRE et BE-2026-09 sont actifs sur une même période.',
    ]);
  });
});

describe('calculerFiche : le signalement « barème non vérifié » (D122)', () => {
  const cas1 = CAS_REFERENCE_2026[0];
  const versions = (nonVerifie: Partial<Record<string, boolean>>): VersionAvecParametres[] =>
    [sept, oct, nov].map((v) => ({
      code: v.code,
      valideDepuis: v.valideDepuis,
      valideJusqua: v.valideJusqua,
      statut: 'ACTIF' as const,
      categorieEmployeur: v.categorieEmployeur,
      parametres: v.parametres,
      ...(nonVerifie[v.code] ? { nonVerifie: true } : {}),
    }));
  const fiche = (v: VersionAvecParametres[], datePaiement = cas1.datePaiement) =>
    calculerFiche({
      ...cas1.entree,
      periode: cas1.periode,
      datePaiement,
      categorieEmployeur: 'PRIVE_MARCHAND',
      versions: v,
    });

  it('est faux quand aucune version utilisée n’est dérogée, et le net ne change pas', () => {
    const r = fiche(versions({}));
    expect(r.baremeNonVerifie).toBe(false);
    expect(r.net).toBe(195_729);
  });

  it('est vrai quand la version de la période est dérogée, sans changer un seul montant', () => {
    const r = fiche(versions({ 'BE-2026-10': true }));
    expect(r.baremeNonVerifie).toBe(true);
    expect(r.net).toBe(195_729);
  });

  it('est vrai quand seule la version du jour de paiement (précompte) est dérogée', () => {
    // Période d'octobre, paiement le 02/11 : le précompte vient de BE-2026-11.
    const r = fiche(versions({ 'BE-2026-11': true }), '2026-11-02');
    expect(r.baremes).toEqual({ periode: 'BE-2026-10', paiement: 'BE-2026-11' });
    expect(r.baremeNonVerifie).toBe(true);
  });

  it('reste faux quand seule une version non utilisée est dérogée', () => {
    expect(fiche(versions({ 'BE-2026-09': true })).baremeNonVerifie).toBe(false);
  });
});
