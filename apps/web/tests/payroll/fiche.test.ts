// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerFiche,
  type EntreeFiche,
  type SalaireEmploye,
  type SalaireOuvrier,
  type VersionAvecParametres,
} from '@/lib/payroll/fiche';
import type { SituationFiscalePaie } from '@/lib/payroll/precompte';
import {
  ANOMALIES_2026,
  BONUS_EMPLOI_2026_09,
  COTISATIONS_PATRONALES_2026_3,
  CSSS_2026_3,
  ONSS_2026_09,
  PRECOMPTE_2026,
  REDUCTION_STRUCTURELLE_2026_3,
} from './fixtures-bareme';

// Tests d'ASSEMBLAGE : chaque calcul est testé à part (onss.test.ts, precompte.test.ts...). Ici on
// vérifie l'ordre, les branchements et le choix des deux versions de barème (D112).
//
// Valeurs attendues des cas 1, 2, 4 et 6 : simulations externes du 30/10/2026 (calculateur-de-salaire.be,
// source secondaire, doc/reference/cas-de-reference-simulations.md), jamais calculées par le moteur.
// Elles supposent le bonus fiscal « très bas salaire » à 63 % (arrêté royal du 24/07/2026, en vigueur
// le 01/08/2026) : le barème de test le porte ci-dessous ; les fixtures historiques gardent 52,54 %.
const PRECOMPTE_63 = {
  ...PRECOMPTE_2026,
  bonusEmploiFiscal: { tauxVoletA: 331_400, tauxVoletB: 630_000 }, // 33,14 %, 63 %
};

const parametres = (precompte = PRECOMPTE_63) => ({
  version: 1 as const,
  categorieEmployeur: 'PRIVE_MARCHAND',
  onss: ONSS_2026_09,
  bonusEmploi: BONUS_EMPLOI_2026_09,
  precompte,
  csss: CSSS_2026_3,
  cotisationsPatronales: COTISATIONS_PATRONALES_2026_3,
  reductionStructurelle: REDUCTION_STRUCTURELLE_2026_3,
  anomalies: ANOMALIES_2026,
});

const version = (
  code: string,
  depuis: string,
  jusqua: string | null,
  extra: Partial<VersionAvecParametres> = {},
): VersionAvecParametres => ({
  code,
  valideDepuis: depuis,
  valideJusqua: jusqua,
  statut: 'ACTIF',
  categorieEmployeur: 'PRIVE_MARCHAND',
  parametres: parametres(),
  ...extra,
});

const VERSIONS = [version('BE-2026-09', '2026-09-01', null)];

const isole: SituationFiscalePaie = {
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
};

const employe = (euros: number): SalaireEmploye => ({
  statut: 'EMPLOYE',
  remunerationMensuelle: euros * 100,
  absenceNonRemDemiJours: 0,
  joursReferenceMois: null,
  primeCents: null,
  primeLibelle: null,
});

const fiche = (extra: Partial<EntreeFiche> = {}): EntreeFiche => ({
  periode: { annee: 2026, mois: 10 }, // octobre : 1er mois du trimestre pour la CSSS
  datePaiement: '2026-10-30',
  categorieEmployeur: 'PRIVE_MARCHAND',
  versions: VERSIONS,
  salaire: employe(2800),
  prestations: { unite: 'JOURS', realisees: 20, pleinTemps: 20 },
  occupation: { regime: 'TEMPS_PLEIN', heuresSemaineMinutes: null, heuresReferenceMinutes: null },
  situation: isole,
  habitantRoyaume: true,
  employeurDixTravailleursOuPlus: false,
  cumuls: {
    bonusDejaPrisAnneeCentimes: 0,
    brutMoisPrecedentsCentimes: 0,
    csssDejaRetenueCentimes: 0,
    netMoisPrecedentCentimes: null,
  },
  ...extra,
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurMoteur);
    return (e as ErreurMoteur).code;
  }
  throw new Error('Aucune erreur levée');
};

describe('calculerFiche : employé, cas des simulations externes du 30/10/2026', () => {
  it('cas 1 : isolé, 2 000,00 € -> précompte 40,41 €, CSSS 2,30 €, net 1 957,29 €', () => {
    const r = calculerFiche(fiche({ salaire: employe(2000) }));
    expect(r).toMatchObject({
      brut: 200_000,
      baseOnss: 200_000,
      onssPersonnelle: 26_140,
      bonusEmploi: 26_140,
      imposable: 200_000,
      precompte: 4_041,
      cotisationSpeciale: 230,
      net: 195_729,
    });
  });

  it('cas 2 : isolé, 2 800,00 € -> précompte 357,58 €, CSSS 17,04 €, net 2 224,17 €', () => {
    const r = calculerFiche(fiche());
    expect(r).toMatchObject({
      brut: 280_000,
      onssPersonnelle: 36_596,
      bonusEmploi: 16_475,
      imposable: 259_879,
      precompte: 35_758,
      cotisationSpeciale: 1_704,
      net: 222_417,
    });
  });

  it('cas 2 : le coût employeur est celui de l’exemple à la main du moteur (2 800,00 + 700,81 - 224,79)', () => {
    const r = calculerFiche(fiche());
    expect(r.cotisationsPatronales).toBe(70_081);
    expect(r.reductionStructurelle).toBe(22_479);
    expect(r.coutEmployeur).toBe(327_602);
  });

  it('cas 4 : isolé avec un enfant, 2 800,00 € -> précompte 253,58 €, net 2 328,17 €', () => {
    const r = calculerFiche(
      fiche({ situation: { ...isole, enfantsCharge: 1, parentIsole: true } }),
    );
    expect(r).toMatchObject({ precompte: 25_358, cotisationSpeciale: 1_704, net: 232_817 });
  });

  it('cas 6 : marié, conjoint sans revenus, 2 800,00 € -> précompte 7,81 €, CSSS 21,15 €, net 2 569,83 €', () => {
    const r = calculerFiche(
      fiche({
        situation: {
          ...isole,
          situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
          conjointRevenus: 'SANS_REVENUS',
        },
      }),
    );
    expect(r).toMatchObject({ precompte: 781, cotisationSpeciale: 2_115, net: 256_983 });
  });
});

describe('calculerFiche : ouvrier', () => {
  const ouvrier: SalaireOuvrier = {
    statut: 'OUVRIER',
    tauxHoraire: 2_500, // 25,00 €/h
    heuresPresteesMinutes: 6_000, // 100 h -> 2 500,00 €
    primeCents: null,
    primeLibelle: null,
  };

  it('cas 8 (lignes d’accord avec la simulation) : ONSS sur 108 %, bonus et base imposable', () => {
    // 2 500,00 x 108 % = 2 700,00 ; x 13,07 % = 352,89 ; bonus 265,37 ; imposable 2 412,48 ; précompte avant bonus 343,55
    // (la CSSS et l'arrondi du bonus fiscal de la simulation diffèrent des textes officiels : voir
    // doc/reference/cas-de-reference-simulations.md, ces deux lignes ne sont pas testées ici)
    const r = calculerFiche(fiche({ salaire: ouvrier }));
    expect(r).toMatchObject({
      brut: 250_000,
      onssPersonnelle: 35_289,
      bonusEmploi: 26_537,
      imposable: 241_248,
    });
    expect(r.detailPrecompte.precompteAvantBonus).toBe(34_355);
  });
});

describe('calculerFiche : versions de barème selon la période et le jour de paiement (D112)', () => {
  // Deux versions : la seconde, dès le 01/11, n'a qu'une quotité exemptée plus haute de 100,00 €.
  const quotitePlusHaute = parametres({
    ...PRECOMPTE_63,
    impotQuotiteExemptee: PRECOMPTE_63.impotQuotiteExemptee + 10_000,
  });
  const deuxVersions = [
    version('BE-2026-10', '2026-09-01', '2026-10-31'),
    version('BE-2026-11', '2026-11-01', null, { parametres: quotitePlusHaute }),
  ];

  it('une fiche d’octobre payée le 05/11 : période d’octobre, précompte de novembre', () => {
    const r = calculerFiche(fiche({ versions: deuxVersions, datePaiement: '2026-11-05' }));
    expect(r.baremes).toEqual({ periode: 'BE-2026-10', paiement: 'BE-2026-11' });
  });

  it('la même fiche payée le 28/10 garde le barème d’octobre pour les deux', () => {
    const r = calculerFiche(fiche({ versions: deuxVersions, datePaiement: '2026-10-28' }));
    expect(r.baremes).toEqual({ periode: 'BE-2026-10', paiement: 'BE-2026-10' });
  });

  it('seul le précompte change avec la date de paiement : l’impôt de base baisse de 100,00 €', () => {
    const avant = calculerFiche(fiche({ versions: deuxVersions, datePaiement: '2026-10-28' }));
    const apres = calculerFiche(fiche({ versions: deuxVersions, datePaiement: '2026-11-05' }));
    expect(avant.detailPrecompte.impotDeBase - apres.detailPrecompte.impotDeBase).toBe(10_000);
    expect(apres.precompte).toBeLessThan(avant.precompte);
    // l'ONSS, le bonus, la CSSS et le brut viennent de la période : identiques
    expect(apres.onssPersonnelle).toBe(avant.onssPersonnelle);
    expect(apres.bonusEmploi).toBe(avant.bonusEmploi);
    expect(apres.cotisationSpeciale).toBe(avant.cotisationSpeciale);
    expect(apres.brut).toBe(avant.brut);
  });
});

describe('calculerFiche : détail, anomalies et refus', () => {
  it('rend les lignes du salarié, celles de l’employeur et les anomalies', () => {
    const r = calculerFiche(fiche());
    expect(r.lignes.length).toBeGreaterThan(3);
    expect(r.lignes[0]).toMatchObject({ code: 'SALAIRE_BASE', montant: 280_000 });
    expect(r.lignesEmployeur.length).toBeGreaterThan(0);
    expect(r.anomalies).toEqual([]);
  });

  it('signale un écart de net de plus de 25 % avec le mois précédent', () => {
    const r = calculerFiche(
      fiche({ cumuls: { ...fiche().cumuls, netMoisPrecedentCentimes: 100_000 } }),
    );
    expect(r.anomalies.map((a) => a.code)).toContain('ECART_NET_MOIS_PRECEDENT');
  });

  it('refuse quand un bloc du barème manque', () => {
    const { csss: _csss, ...sansCsss } = parametres();
    const versions = [version('BE-2026-09', '2026-09-01', null, { parametres: sansCsss })];
    expect(code(() => calculerFiche(fiche({ versions })))).toBe('PARAMETRE_MANQUANT');
  });

  it('refuse sans version de barème, avec une date de paiement incohérente ou un mois invalide', () => {
    expect(code(() => calculerFiche(fiche({ versions: [] })))).toBe('BAREME_INTROUVABLE');
    expect(code(() => calculerFiche(fiche({ datePaiement: '2026-09-30' })))).toBe(
      'DATE_PAIEMENT_INCOHERENTE',
    );
    expect(code(() => calculerFiche(fiche({ periode: { annee: 2026, mois: 13 } })))).toBe(
      'ENTREE_INVALIDE',
    );
  });

  it('refuse un salaire impossible', () => {
    expect(
      code(() => calculerFiche(fiche({ salaire: { ...employe(2800), remunerationMensuelle: 0 } }))),
    ).toBe('ENTREE_INVALIDE');
  });
});
