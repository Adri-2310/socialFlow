// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { versionBaremeCompleteSchema } from '@/lib/payroll/bareme/schema';
import {
  CAS_REFERENCE_2026,
  casDeLaVersion,
  verifierCasReference,
} from '@/lib/payroll/cas-reference';
import type { VersionAvecParametres } from '@/lib/payroll/fiche';

// Les cas de référence rejoués contre le barème réel de 2026 (étape 9.4, D118). Les montants attendus
// viennent de doc/reference/cas-de-reference-simulations.md (simulations externes du 30/10/2026).

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const charger = (nom: string) =>
  versionBaremeCompleteSchema.parse(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')));

// En production une version est ACTIVE après les cas de référence ; ici on la force pour les rejouer.
const versions = (modifier?: (v: VersionAvecParametres) => VersionAvecParametres) =>
  ['be-2026-09.json', 'be-2026-10.json', 'be-2026-11.json'].map((nom) => {
    const v = charger(nom);
    const active: VersionAvecParametres = {
      code: v.code,
      valideDepuis: v.valideDepuis,
      valideJusqua: v.valideJusqua,
      statut: 'ACTIF',
      categorieEmployeur: v.categorieEmployeur,
      parametres: v.parametres,
    };
    return modifier ? modifier(active) : active;
  });

describe('cas de référence du 30/10/2026 contre le barème réel', () => {
  it('les huit cas redonnent les montants de la simulation externe, au centime', () => {
    const r = verifierCasReference(versions());
    expect(r.casVerifies).toBe(8);
    expect(r.ecarts).toEqual([]);
  });

  it('la suite détecte une erreur de barème : bonus fiscal « très bas salaire » faussé à 52,54 %', () => {
    const faux = versions((v) =>
      v.code !== 'BE-2026-10'
        ? v
        : {
            ...v,
            parametres: {
              ...v.parametres,
              precompte: {
                ...v.parametres.precompte!,
                bonusEmploiFiscal: { tauxVoletA: 331_400, tauxVoletB: 525_400 },
              },
            },
          },
    );
    const { ecarts } = verifierCasReference(faux);
    // le cas 1 (2 000,00 €) a un volet B de 133,86 € : 10,46 % de plus = 14,00 € de bonus fiscal
    expect(ecarts).toContainEqual({
      casId: 'CAS-1',
      champ: 'bonusFiscal',
      attendu: 12_660,
      obtenu: 11_260,
    });
    expect(ecarts).toContainEqual({
      casId: 'CAS-1',
      champ: 'precompte',
      attendu: 4_041,
      obtenu: 5_441,
    });
    expect(ecarts.length).toBeGreaterThan(1);
  });

  it('signale un barème absent comme un écart de calcul, sans lever d’exception', () => {
    const { ecarts } = verifierCasReference([]);
    expect(ecarts).toHaveLength(8);
    expect(ecarts[0]).toEqual({
      casId: 'CAS-1',
      champ: 'calcul',
      attendu: 'un résultat',
      obtenu: 'BAREME_INTROUVABLE',
    });
  });
});

describe('cas qui valident une version', () => {
  const [sept, oct, nov] = versions();

  it('les cas d’octobre valident BE-2026-10 : huit cas', () => {
    expect(casDeLaVersion(oct)).toHaveLength(8);
  });

  it('aucun cas ne valide BE-2026-09 ni BE-2026-11 : sans source externe, ils ne sont pas activables', () => {
    expect(casDeLaVersion(sept)).toEqual([]);
    expect(casDeLaVersion(nov)).toEqual([]);
  });

  it('un cas ne valide pas une version qui ne couvre qu’une partie de son mois', () => {
    const partielle = { valideDepuis: '2026-10-15', valideJusqua: null };
    expect(casDeLaVersion(partielle)).toEqual([]);
  });

  it('chaque cas porte sa source externe et une période couverte par une version', () => {
    for (const c of CAS_REFERENCE_2026) {
      expect(c.source).toContain('calculateur-de-salaire.be');
      expect(c.periode).toEqual({ annee: 2026, mois: 10 });
    }
  });
});

// Le simulateur s'écarte des textes officiels sur deux lignes de l'ouvrier : ces valeurs ne sont PAS
// une simulation externe. Elles sont calculées à la main sur les textes officiels déposés.
describe('cas 8 (ouvrier) : calcul à la main sur les textes officiels', () => {
  const cas8 = CAS_REFERENCE_2026.find((c) => c.id === 'CAS-8')!;
  const { casVerifies, ecarts } = verifierCasReference(versions(), [cas8]);

  it('les lignes communes au simulateur et aux textes sont celles du simulateur', () => {
    expect(casVerifies).toBe(1);
    expect(ecarts).toEqual([]);
  });

  it('CSSS : 2 500,00 x 108 % = 2 700,00 ; trimestre estimé 8 100,00 ; 30,99 + 1,10 % x (8 100,00 - 6 570,54) = 47,81 ; tiers = 15,94 €', () => {
    // instructions ONSS 2026/3, « La cotisation spéciale pour la sécurité sociale » : rémunération portée à 108 %
    // (le simulateur affiche 13,74 € : il n'applique pas ce 108 %)
    const r = verifierCasReference(versions(), [
      { ...cas8, attendu: { cotisationSpeciale: 1_594 } },
    ]);
    expect(r.ecarts).toEqual([]);
  });

  it('bonus fiscal : 33,14 % x 137,74 = 45,648 -> 45,65 ; 63 % x 127,63 = 80,4069 -> 80,41 ; total 126,06 € (n° 12 : arrondi à chaque étape)', () => {
    // Annexe III n° 12 : arrondi au cent « selon que le chiffre des millièmes atteint ou non 5 »
    // (le simulateur affiche 126,05 € : il tronque 45,648)
    const r = verifierCasReference(versions(), [{ ...cas8, attendu: { bonusFiscal: 12_606 } }]);
    expect(r.ecarts).toEqual([]);
  });

  it('précompte 343,55 - 126,06 = 217,49 € ; net 2 500,00 - 352,89 + 265,37 - 217,49 - 15,94 = 2 179,05 €', () => {
    const r = verifierCasReference(versions(), [
      { ...cas8, attendu: { precompte: 21_749, net: 217_905 } },
    ]);
    expect(r.ecarts).toEqual([]);
  });
});

describe('cas à ajouter quand les sources seront disponibles', () => {
  it.todo(
    'série du 01/11/2026 : mêmes cas avec la quotité de 11 550 € (arrêté royal du 27/09/2026)',
  );
  it.todo(
    'n° 6 de l’Annexe III : conjoint avec revenus, avec et sans enfant (calculateur du SPF Finances)',
  );
  it.todo('série de septembre 2026 : valider BE-2026-09 par une source externe datée de septembre');
});
