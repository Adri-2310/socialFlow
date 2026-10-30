// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerFiche,
  type EntreeFiche,
  type IncapaciteEmployeFiche,
  type IncapaciteOuvrierFiche,
  type SalaireEmploye,
  type SalaireOuvrier,
  type VersionAvecParametres,
} from '@/lib/payroll/fiche';
import type { HeuresSupplementaires } from '@/lib/payroll/heures-supplementaires';
import type { SituationFiscalePaie } from '@/lib/payroll/precompte';
import {
  ANOMALIES_2026,
  BONUS_EMPLOI_2026_09,
  COTISATIONS_PATRONALES_2026_3,
  CSSS_2026_3,
  HEURES_SUPPLEMENTAIRES_2026,
  JOURS_FERIES_2026,
  ONSS_2026_09,
  PRECOMPTE_2026,
  REDUCTION_STRUCTURELLE_2026_3,
  SALAIRE_GARANTI_2026,
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
  heuresSupplementaires: HEURES_SUPPLEMENTAIRES_2026,
  joursFeries: JOURS_FERIES_2026,
  salaireGaranti: SALAIRE_GARANTI_2026,
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

// ---------------------------------------------------------------- cas particuliers (étape 9.2b, D113)
// Pas de simulateur externe pour ces règles : on vérifie les lignes ajoutées, calculées à la main, et
// les identités de composition (ce qui est soumis à l'ONSS, ce qui entre dans la référence du bonus).
const ouvrier = (minutes: number): SalaireOuvrier => ({
  statut: 'OUVRIER',
  tauxHoraire: 2_500, // 25,00 €/h : un jour de 7 h 36 = 456 minutes vaut 190,00 €
  heuresPresteesMinutes: minutes,
  primeCents: null,
  primeLibelle: null,
});

const aucune: HeuresSupplementaires = {
  volontairesSansSursalaire: 0,
  volontaires50: 0,
  volontaires100: 0,
  ordinaires50: 0,
  ordinaires100: 0,
};
const heures = (
  ceMois: Partial<HeuresSupplementaires>,
  cumulAvantCeMois: Partial<HeuresSupplementaires> = {},
) => ({
  tauxHoraireCentimes: 2_000, // 20,00 €/h
  ceMois: { ...aucune, ...ceMois },
  cumulAvantCeMois: { ...aucune, ...cumulAvantCeMois },
});

describe('calculerFiche : jours fériés de l’ouvrier (D107)', () => {
  it('un jour férié payé s’ajoute au brut et à la base ONSS : 25,00 €/h x 7 h 36 = 190,00 €', () => {
    // 11 novembre 2026 (mercredi). Brut 2 500,00 + 190,00 = 2 690,00 € ; x 108 % = 2 905,20 € ; x 13,07 % = 379,7096 -> 379,71 €
    const r = calculerFiche(
      fiche({
        periode: { annee: 2026, mois: 11 },
        datePaiement: '2026-11-30',
        salaire: ouvrier(6_000),
        joursFeries: [
          {
            date: '2026-11-11',
            nature: 'FERIE',
            minutesPerdues: 456,
            absenceInjustifieeAutour: false,
            suspension: null,
          },
        ],
      }),
    );
    expect(r.brut).toBe(269_000);
    expect(r.baseOnss).toBe(269_000);
    expect(r.onssPersonnelle).toBe(37_971);
    expect(r.lignes.find((l) => l.code === 'JOUR_FERIE')).toMatchObject({ montant: 19_000 });
  });

  it('refuse des jours fériés pour un employé payé au mois', () => {
    expect(
      code(() =>
        calculerFiche(
          fiche({
            joursFeries: [
              {
                date: '2026-11-11',
                nature: 'FERIE',
                minutesPerdues: 456,
                absenceInjustifieeAutour: false,
                suspension: null,
              },
            ],
          }),
        ),
      ),
    ).toBe('ENTREE_INCOMPATIBLE');
  });
});

describe('calculerFiche : heures supplémentaires (D106)', () => {
  const sans = calculerFiche(fiche());

  it('5 h ordinaires à 50 % : 150,00 € de brut et de base ONSS, comptées dans le salaire de référence du bonus, réduction n° 45 de 57,75 €', () => {
    // 20,00 €/h x 5 h = 100,00 + 50 % = 150,00 ; brut 2 950,00 ; ONSS 13,07 % x 2 950,00 = 385,565 -> 385,57
    const r = calculerFiche(fiche({ heuresSupplementaires: heures({ ordinaires50: 300 }) }));
    expect(r.brut).toBe(295_000);
    expect(r.baseOnss).toBe(295_000);
    expect(r.onssPersonnelle).toBe(38_557);
    // salaire de référence 2 950,00 € (les heures ordinaires y sont : masse salariale déclarée à 100 %) :
    // volet B 0 (au-dessus de 2 937,93 €) ; volet A 127,54 - 27,39 % x (2 950,00 - 2 937,93) = 124,2340 -> 124,23 €
    expect(r.bonusEmploi).toBe(12_423);
    expect(sans.bonusEmploi).toBe(16_475); // sans les heures, le salaire de référence est de 2 800,00 €
    expect(r.detailPrecompte.reductionHeuresSupplementaires).toBe(5_775);
    expect(r.netExonere).toBe(0);
  });

  it('2 h 30 volontaires à 100 % : dans le brut imposable, hors base ONSS', () => {
    // base 50,00 + sursalaire 50,00 = 100,00 € ; réduction 57,75 % x 50,00 = 28,875 -> 28,88 €
    const r = calculerFiche(fiche({ heuresSupplementaires: heures({ volontaires100: 150 }) }));
    expect(r.brut).toBe(290_000);
    expect(r.baseOnss).toBe(sans.baseOnss);
    expect(r.onssPersonnelle).toBe(sans.onssPersonnelle);
    expect(r.bonusEmploi).toBe(sans.bonusEmploi);
    expect(r.cotisationSpeciale).toBe(sans.cotisationSpeciale);
    expect(r.detailPrecompte.reductionHeuresSupplementaires).toBe(2_888);
  });

  it('10 h volontaires sans sursalaire : 200,00 € ajoutés au net et au coût employeur, rien d’autre ne change', () => {
    const r = calculerFiche(
      fiche({ heuresSupplementaires: heures({ volontairesSansSursalaire: 600 }) }),
    );
    expect(r.netExonere).toBe(20_000);
    expect(r.brut).toBe(sans.brut);
    expect(r.precompte).toBe(sans.precompte);
    expect(r.cotisationSpeciale).toBe(sans.cotisationSpeciale);
    expect(r.net).toBe(sans.net + 20_000);
    expect(r.coutEmployeur).toBe(sans.coutEmployeur + 20_000);
    expect(r.cotisationsPatronales).toBe(sans.cotisationsPatronales);
  });

  it('signale l’approche du plafond de 360 heures volontaires', () => {
    // déjà 19 300 minutes + 150 minutes ce mois = 19 450 > 90 % x 21 600 = 19 440
    const r = calculerFiche(
      fiche({ heuresSupplementaires: heures({ volontaires100: 150 }, { volontaires50: 19_300 }) }),
    );
    expect(r.anomalies.map((a) => a.code)).toContain('HEURES_SUP_PLAFOND_PROCHE');
  });

  it('refuse un plafond dépassé : l’erreur du calcul sous-jacent remonte', () => {
    expect(
      code(() =>
        calculerFiche(
          fiche({
            heuresSupplementaires: heures({ volontaires50: 100 }, { volontaires50: 21_550 }),
          }),
        ),
      ),
    ).toBe('PLAFOND_HEURES_DEPASSE');
  });
});

describe('calculerFiche : salaire garanti (D108 à D111)', () => {
  // Lundi 5 octobre 2026 = jour 1 de l'incapacité ; lundi 12 octobre = jour 8.
  const jourO = (date: string) => ({ date, minutesPrevues: 456, dejaRemunere: false });
  const incapaciteOuvrier = (dates: string[]): IncapaciteOuvrierFiche => ({
    statut: 'OUVRIER',
    nature: 'MALADIE',
    debutPeriodeGarantie: '2026-10-05',
    joursActiviteParSemaine: 6,
    dateUnMoisAnciennete: null,
    exclusion: null,
    jours: dates.map(jourO),
  });
  const semaine1 = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const semaine2 = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];

  it('ouvrier : 5 jours à 100 % remplacent 5 jours de travail, la fiche est identique à celle de 2 500,00 € (cas 8)', () => {
    // 62 h prestées = 1 550,00 € ; 5 jours x 190,00 = 950,00 € de salaire garanti ; total 2 500,00 €
    const r = calculerFiche(
      fiche({ salaire: ouvrier(3_720), incapacite: incapaciteOuvrier(semaine1) }),
    );
    expect(r.brut).toBe(250_000);
    expect(r.baseOnss).toBe(250_000);
    // mêmes lignes que la simulation du cas 8 (doc/reference/cas-de-reference-simulations.md)
    expect(r.onssPersonnelle).toBe(35_289);
    expect(r.bonusEmploi).toBe(26_537);
    expect(r.imposable).toBe(241_248);
    expect(r.detailPrecompte.precompteAvantBonus).toBe(34_355);
    expect(r.lignes.find((l) => l.code === 'SALAIRE_GARANTI_100')).toMatchObject({
      montant: 95_000,
    });
  });

  it('ouvrier, jours 8 à 12 : le 60 % et l’indemnité CCT sont dans le brut mais hors base ONSS', () => {
    // garanti : loi 60 % x 5 x 100,00 (plafond de test) = 300,00 ; CCT 25,88 % x 500,00 + 85,88 % x 5 x 90,00 = 129,40 + 386,46 ;
    // total 815,86 € ; brut 1 550,00 + 815,86 = 2 365,86 € ; base ONSS 1 550,00 € ; x 108 % x 13,07 % = 218,79 €
    const r = calculerFiche(
      fiche({ salaire: ouvrier(3_720), incapacite: incapaciteOuvrier(semaine2) }),
    );
    expect(r.brut).toBe(236_586);
    expect(r.baseOnss).toBe(155_000);
    expect(r.onssPersonnelle).toBe(21_879);
  });

  it('employé de 3 mois ou plus, après le 30e jour : le salaire est réduit des jours non garantis', () => {
    // début le 1er septembre : le 1er octobre est le jour 31. 2 jours x 120,00 = 4 demi-jours : 2 800,00 x 4 / 40 = 280,00 €
    const incapacite: IncapaciteEmployeFiche = {
      statut: 'EMPLOYE',
      nature: 'MALADIE',
      contrat: 'LONGUE_DUREE',
      debutPeriodeGarantie: '2026-09-01',
      joursActiviteParSemaine: 5,
      jours: [
        { date: '2026-10-01', demiJoursPrevus: 2 },
        { date: '2026-10-02', demiJoursPrevus: 2 },
      ],
    };
    const r = calculerFiche(
      fiche({ salaire: { ...employe(2800), joursReferenceMois: 20 }, incapacite }),
    );
    expect(r.brut).toBe(252_000);
    expect(r.baseOnss).toBe(252_000);
    expect(r.lignes.find((l) => l.code === 'SALAIRE_GARANTI_FIN')).toMatchObject({
      montant: -28_000,
    });
  });

  it('employé de moins de 3 mois, jours 8 à 11 : l’indemnité reste dans le brut mais sort de la base ONSS', () => {
    // salaire 2 400,00 ; 8 demi-jours valent 480,00 ; versé en indemnité 417,26 ; retenue 62,74 ;
    // brut 2 400,00 - 62,74 = 2 337,26 ; base ONSS 2 337,26 - 417,26 = 1 920,00 = 2 400,00 - 480,00
    const incapacite: IncapaciteEmployeFiche = {
      statut: 'EMPLOYE',
      nature: 'MALADIE',
      contrat: 'COURTE_DUREE',
      debutPeriodeGarantie: '2026-10-05',
      joursActiviteParSemaine: 6,
      jours: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((date) => ({
        date,
        demiJoursPrevus: 2,
      })),
    };
    const r = calculerFiche(
      fiche({ salaire: { ...employe(2400), joursReferenceMois: 20 }, incapacite }),
    );
    expect(r.brut).toBe(233_726);
    expect(r.baseOnss).toBe(192_000);
  });

  it('refuse une incapacité qui ne correspond pas au statut, ou sans jours de référence pour un employé', () => {
    expect(code(() => calculerFiche(fiche({ incapacite: incapaciteOuvrier(semaine1) })))).toBe(
      'ENTREE_INCOMPATIBLE',
    );
    const incapacite: IncapaciteEmployeFiche = {
      statut: 'EMPLOYE',
      nature: 'MALADIE',
      contrat: 'LONGUE_DUREE',
      debutPeriodeGarantie: '2026-09-01',
      joursActiviteParSemaine: 5,
      jours: [{ date: '2026-10-01', demiJoursPrevus: 2 }],
    };
    expect(code(() => calculerFiche(fiche({ incapacite })))).toBe('JOURS_REFERENCE_MANQUANT');
  });

  it('refuse un brut négatif : trop de retenues pour le salaire du mois', () => {
    const incapacite: IncapaciteEmployeFiche = {
      statut: 'EMPLOYE',
      nature: 'MALADIE',
      contrat: 'LONGUE_DUREE',
      debutPeriodeGarantie: '2026-09-01',
      joursActiviteParSemaine: 5,
      jours: [{ date: '2026-10-01', demiJoursPrevus: 2 }],
    };
    const salaire = { ...employe(2800), joursReferenceMois: 20, absenceNonRemDemiJours: 40 };
    expect(code(() => calculerFiche(fiche({ salaire, incapacite })))).toBe('BRUT_NEGATIF');
  });
});
