// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arrondirFraction } from '@/lib/payroll/arrondi';
import { choisirBaremesPourFiche, verifierPasDeChevauchement } from '@/lib/payroll/bareme/choisir';
import { versionBaremeCompleteSchema } from '@/lib/payroll/bareme/schema';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { calculerFiche, type VersionAvecParametres } from '@/lib/payroll/fiche';

// Le barème réel de 2026 (étape 9.3, D115) : les trois fichiers JSON de `prisma/bareme/`, qui servent
// de source au seed de la table `bareme_version`. Ces tests vérifient leur forme (schéma strict, une
// source par bloc), leur enchaînement dans le temps et les valeurs clés tirées des documents déposés.

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const charger = (nom: string) =>
  versionBaremeCompleteSchema.parse(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')));

const sept = charger('be-2026-09.json');
const oct = charger('be-2026-10.json');
const nov = charger('be-2026-11.json');
const TOUTES = [sept, oct, nov];

// En production, une version est ACTIVE après les cas de référence ; ici on les force pour tester le choix.
const actives: VersionAvecParametres[] = TOUTES.map((v) => ({
  code: v.code,
  valideDepuis: v.valideDepuis,
  valideJusqua: v.valideJusqua,
  statut: 'ACTIF',
  categorieEmployeur: v.categorieEmployeur,
  parametres: v.parametres,
}));

const BLOCS = [
  'onss',
  'bonusEmploi',
  'precompte',
  'csss',
  'cotisationsPatronales',
  'reductionStructurelle',
  'heuresSupplementaires',
  'joursFeries',
  'salaireGaranti',
  'anomalies',
] as const;

describe('barème réel 2026 : forme', () => {
  it('chaque version est valide, à vérifier, de la catégorie privée marchande', () => {
    for (const v of TOUTES) {
      expect(v.statut).toBe('A_VERIFIER'); // jamais activée par le seed
      expect(v.categorieEmployeur).toBe('PRIVE_MARCHAND');
    }
    expect(TOUTES.map((v) => v.code)).toEqual(['BE-2026-09', 'BE-2026-10', 'BE-2026-11']);
  });

  it('chaque version porte les dix blocs obligatoires au calcul, chacun avec sa source', () => {
    for (const v of TOUTES) {
      for (const bloc of BLOCS) {
        expect(v.parametres[bloc], `${v.code} : ${bloc}`).toBeDefined();
        expect(v.source[bloc], `${v.code} : source de ${bloc}`).toBeDefined();
      }
    }
  });

  it('la fiabilité de chaque bloc est celle décidée (D115)', () => {
    for (const v of TOUTES) {
      const fiabilite = Object.fromEntries(BLOCS.map((bloc) => [bloc, v.source[bloc].fiabilite]));
      expect(fiabilite).toEqual({
        onss: 'OFFICIELLE',
        bonusEmploi: 'OFFICIELLE',
        precompte: 'A_CONFIRMER',
        csss: 'OFFICIELLE',
        cotisationsPatronales: 'A_CONFIRMER',
        reductionStructurelle: 'OFFICIELLE',
        heuresSupplementaires: 'A_CONFIRMER',
        joursFeries: 'OFFICIELLE',
        salaireGaranti: 'A_CONFIRMER',
        anomalies: 'DECISION_INTERNE',
      });
    }
  });

  it('les périodes se suivent sans trou ni chevauchement : septembre, octobre, puis novembre sans fin', () => {
    expect([sept.valideDepuis, sept.valideJusqua]).toEqual(['2026-09-01', '2026-09-30']);
    expect([oct.valideDepuis, oct.valideJusqua]).toEqual(['2026-10-01', '2026-10-31']);
    expect([nov.valideDepuis, nov.valideJusqua]).toEqual(['2026-11-01', null]);
    expect(() => verifierPasDeChevauchement(actives)).not.toThrow();
  });
});

describe('barème réel 2026 : valeurs clés des documents déposés', () => {
  it('180 heures (loi du 15/07/2026, art. 47-49), 360 h volontaires dont 240 h sans sursalaire', () => {
    for (const v of TOUTES) {
      const h = v.parametres.heuresSupplementaires;
      expect(h?.plafondReductionMinutes).toBe(10_800); // 180 h
      expect(h?.plafondVolontairesMinutes).toBe(21_600); // 360 h
      expect(h?.plafondSansSursalaireMinutes).toBe(14_400); // 240 h
      expect(h?.tauxReduction).toBe(577_500); // 57,75 %
    }
  });

  it('bonus fiscal « très bas salaire » à 63 % (arrêté royal du 24/07/2026, en vigueur le 01/08/2026)', () => {
    for (const v of TOUTES) {
      expect(v.parametres.precompte?.bonusEmploiFiscal).toEqual({
        tauxVoletA: 331_400,
        tauxVoletB: 630_000,
      });
    }
  });

  it('plafond de l’INAMI du 01/09/2026 : 189,3583 € en dix-millièmes', () => {
    for (const v of TOUTES) {
      expect(v.parametres.salaireGaranti?.plafondJournalierDixMilliemes).toBe(1_893_583);
    }
  });

  it('fonds amiante : 0,01 % au 3e trimestre, 0 au 4e (ONSS 2026/3)', () => {
    expect(sept.parametres.cotisationsPatronales?.fondsAmiante).toBe(100);
    expect(oct.parametres.cotisationsPatronales?.fondsAmiante).toBe(0);
    expect(nov.parametres.cotisationsPatronales?.fondsAmiante).toBe(0);
  });

  it('précompte avant le 01/11/2026 : quotité de 11 170 €, impôt de 2 987,98 €', () => {
    for (const v of [sept, oct]) {
      expect(v.parametres.precompte?.impotQuotiteExemptee).toBe(298_798);
      expect(v.parametres.precompte?.quotientConjugal.maximum).toBe(1_379_000);
      expect(v.parametres.precompte?.reductions.enfants[0]).toBe(62_400);
    }
    // contrôle des sources entre elles : 26,75 % x 11 170,00 € = 2 987,975 -> 2 987,98 €
    expect(arrondirFraction(1_117_000 * 267_500, 1_000_000)).toBe(298_798);
  });

  it('précompte dès le 01/11/2026 (arrêté royal du 27/09/2026) : quotité de 11 550 €, impôt de 3 089,63 €', () => {
    const p = nov.parametres.precompte;
    expect(p?.impotQuotiteExemptee).toBe(308_963); // n° 32
    expect(p?.quotientConjugal).toEqual({ taux: 300_000, maximum: 1_178_000 }); // n° 34.1.1 : 11 780 €
    expect(p?.reductions.enfants).toEqual([
      68_400, 164_400, 434_400, 748_800, 1_088_400, 1_429_200, 1_771_200, 2_149_200,
    ]); // n° 38
    expect(p?.reductions.parEnfantAuDela8).toBe(378_000);
    expect(p?.reductions.beneficiaireHandicape).toBe(64_800); // n° 39 : 648 €
    expect(p?.reductions.dependant66).toBe(199_200);
    expect(p?.reductions.autreCharge).toBe(63_600);
    expect(p?.reductions.parentIsole).toBe(63_600); // n° 40
    expect(p?.reductions.conjointRevenuLimite).toBe(174_000);
    expect(p?.reductions.conjointPensionLimitee).toBe(347_400);
    expect(p?.reductions.conjointHandicape).toBe(63_600); // n° 41
    // contrôle des sources entre elles : 26,75 % x 11 550,00 € = 3 089,625 -> 3 089,63 €
    expect(arrondirFraction(1_155_000 * 267_500, 1_000_000)).toBe(308_963);
  });
});

describe('barème réel 2026 : choix de version et calcul', () => {
  it('une fiche d’octobre payée le 05/11 : période d’octobre, précompte de novembre', () => {
    const r = choisirBaremesPourFiche(actives, 2026, 10, '2026-11-05', 'PRIVE_MARCHAND');
    expect([r.periode.code, r.paiement.code]).toEqual(['BE-2026-10', 'BE-2026-11']);
  });

  it('septembre prend la version de septembre, une date de 2027 la version de novembre sans fin', () => {
    const septembre = choisirBaremesPourFiche(actives, 2026, 9, '2026-09-30', 'PRIVE_MARCHAND');
    expect([septembre.periode.code, septembre.paiement.code]).toEqual(['BE-2026-09', 'BE-2026-09']);
    const mars = choisirBaremesPourFiche(actives, 2027, 3, '2027-03-31', 'PRIVE_MARCHAND');
    expect([mars.periode.code, mars.paiement.code]).toEqual(['BE-2026-11', 'BE-2026-11']);
  });

  it('refuse un mois avant septembre 2026 : aucun barème', () => {
    try {
      choisirBaremesPourFiche(actives, 2026, 8, '2026-09-05', 'PRIVE_MARCHAND');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurMoteur);
      expect((e as ErreurMoteur).code).toBe('BAREME_INTROUVABLE');
    }
  });

  // Cas 2 de doc/reference/cas-de-reference-simulations.md (simulation externe du 30/10/2026) : le barème
  // réel redonne les mêmes valeurs que les fixtures de test avec le taux de 63 %.
  const fiche = (datePaiement: string) =>
    calculerFiche({
      periode: { annee: 2026, mois: 10 },
      datePaiement,
      categorieEmployeur: 'PRIVE_MARCHAND',
      versions: actives,
      salaire: {
        statut: 'EMPLOYE',
        remunerationMensuelle: 280_000,
        absenceNonRemDemiJours: 0,
        joursReferenceMois: null,
        primeCents: null,
        primeLibelle: null,
      },
      prestations: { unite: 'JOURS', realisees: 20, pleinTemps: 20 },
      occupation: {
        regime: 'TEMPS_PLEIN',
        heuresSemaineMinutes: null,
        heuresReferenceMinutes: null,
      },
      situation: {
        situationFamiliale: 'ISOLE',
        conjointRevenus: null,
        beneficiaireHandicape: false,
        conjointHandicape: false,
        enfantsCharge: 0,
        enfantsHandicapes: 0,
        autresChargeDependantes66: 0,
        autresChargeHandicapees: 0,
        autresCharge: 0,
        parentIsole: false,
        chargesFamilleAttribuees: null,
      },
      habitantRoyaume: true,
      employeurDixTravailleursOuPlus: false,
      cumuls: {
        bonusDejaPrisAnneeCentimes: 0,
        brutMoisPrecedentsCentimes: 0,
        csssDejaRetenueCentimes: 0,
        netMoisPrecedentCentimes: null,
      },
    });

  it('cas 2 avec le barème réel, payé le 30/10 : précompte 357,58 €, CSSS 17,04 €, net 2 224,17 €', () => {
    const r = fiche('2026-10-30');
    expect(r).toMatchObject({ precompte: 35_758, cotisationSpeciale: 1_704, net: 222_417 });
    expect(r.baremes).toEqual({ periode: 'BE-2026-10', paiement: 'BE-2026-10' });
  });

  it('la même fiche payée le 05/11 : seul le précompte change, l’impôt de base baisse de 101,65 €', () => {
    const avant = fiche('2026-10-30');
    const apres = fiche('2026-11-05');
    expect(apres.baremes).toEqual({ periode: 'BE-2026-10', paiement: 'BE-2026-11' });
    // 3 089,63 - 2 987,98 = 101,65 € de quotité en plus
    expect(avant.detailPrecompte.impotDeBase - apres.detailPrecompte.impotDeBase).toBe(10_165);
    expect(apres.brut).toBe(avant.brut);
    expect(apres.onssPersonnelle).toBe(avant.onssPersonnelle);
    expect(apres.cotisationSpeciale).toBe(avant.cotisationSpeciale);
  });
});
