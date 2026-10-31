// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { peutActiverBareme } from '@/lib/payroll/bareme/activation';
import {
  versionBaremeCompleteSchema,
  type VersionBaremeComplete,
} from '@/lib/payroll/bareme/schema';
import { CAS_REFERENCE_2026, verifierCasReference } from '@/lib/payroll/cas-reference';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { calculerFiche, type EntreeFiche, type VersionAvecParametres } from '@/lib/payroll/fiche';
import { calculerSalaireGarantiEmploye } from '@/lib/payroll/salaire-garanti';
import { SALAIRE_GARANTI_2026 as BLOC } from './fixtures-bareme';

// Cas défensifs : ce que le moteur refuse ou laisse remonter quand l'entrée est cassée. Ils complètent
// la couverture à 100 % de lib/payroll sans changer aucune règle de calcul.

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const charger = (nom: string): VersionBaremeComplete =>
  versionBaremeCompleteSchema.parse(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')));
const reelles = ['be-2026-09.json', 'be-2026-10.json', 'be-2026-11.json'].map(charger);
const actives: VersionAvecParametres[] = reelles.map((v) => ({
  code: v.code,
  valideDepuis: v.valideDepuis,
  valideJusqua: v.valideJusqua,
  statut: 'ACTIF' as const,
  categorieEmployeur: v.categorieEmployeur,
  parametres: v.parametres,
}));

describe('situation familiale inconnue (précompte)', () => {
  it('est refusée avec un message clair', () => {
    const cas1 = CAS_REFERENCE_2026[0];
    const entree: EntreeFiche = {
      ...cas1.entree,
      periode: cas1.periode,
      datePaiement: cas1.datePaiement,
      categorieEmployeur: 'PRIVE_MARCHAND',
      versions: actives,
      situation: {
        ...cas1.entree.situation,
        situationFamiliale: 'DIVORCE' as unknown as 'ISOLE',
      },
    };
    expect(() => calculerFiche(entree)).toThrowError(
      new ErreurMoteur('ENTREE_INVALIDE', 'La situation familiale est inconnue.'),
    );
  });
});

describe('verifierCasReference : une erreur qui n’est pas du moteur remonte', () => {
  it('ne la range pas parmi les écarts', () => {
    const casCasse = { ...CAS_REFERENCE_2026[0], entree: null } as unknown as (typeof CAS_REFERENCE_2026)[number];
    expect(() => verifierCasReference(actives, [casCasse])).toThrow(TypeError);
  });
});

describe('peutActiverBareme : une erreur qui n’est pas du moteur remonte', () => {
  it('ne la range pas parmi les raisons', () => {
    // Une version active dont la lecture des dates échoue : l'erreur n'est pas une ErreurMoteur.
    const cassee = {
      code: 'BE-CASSE',
      statut: 'ACTIF',
      categorieEmployeur: reelles[1].categorieEmployeur,
      get valideDepuis(): string {
        throw new RangeError('lecture impossible');
      },
    } as unknown as VersionAvecParametres;
    expect(() => peutActiverBareme(reelles[1], [cassee])).toThrow(RangeError);
  });
});

describe('calculerSalaireGarantiEmploye : jamais de retenue négative', () => {
  it('une indemnité qui couvre tout le salaire ne crée ni ligne ni retenue', () => {
    // Complément à 100 % de la part sous le plafond : 60 % de la loi + 100 % dépassent la valeur du jour.
    const bloc = { ...BLOC, complementEmployePlafonne: 1_000_000, complementEmployeExcedent: 1_000_000 };
    const r = calculerSalaireGarantiEmploye(
      {
        remunerationMensuelle: 240_000,
        joursReferenceMois: 20,
        joursActiviteParSemaine: 6,
        contrat: 'COURTE_DUREE',
        nature: 'MALADIE',
        debutPeriodeGarantie: '2026-03-02',
        jours: [{ date: '2026-03-09', demiJoursPrevus: 2 }], // jour 8 : début de la période à 60 %
      },
      bloc,
    );
    expect(r.retenue).toBe(0);
    expect(r.lignes.some((l) => l.code === 'SALAIRE_GARANTI_PARTIEL_RETENUE')).toBe(false);
  });
});
