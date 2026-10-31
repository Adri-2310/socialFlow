// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allocationsExceptionnellesSchema,
  precompteSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';
import { PRECOMPTE_2026 } from './fixtures-bareme';

// Sous-bloc « allocations exceptionnelles » du précompte (n° 53 à 55 et 78.1.2 de l'Annexe III) :
// les valeurs seulement, sans calcul. Les nombres ci-dessous sont recopiés À LA MAIN depuis les
// textes officiels (en euros et en pourcentages), puis convertis ; ils ne viennent ni du JSON ni
// du moteur.
//   - n° 53 et 78.1.2 : Annexe III, doc/reference/precompte/annexe-iii-2026.pdf, p. 18 et 24 ;
//   - n° 54 avant le 01/11/2026 : même PDF, p. 18 ;
//   - n° 54 depuis le 01/11/2026 : AR du 27/09/2026, art. 9, Moniteur du 02/10/2026, p. 52735 ;
//   - n° 55 : Annexe III, p. 19.
const euros = (e: number) => e * 100;
const pct = (p: number) => Math.round(p * 10_000); // 19,17 % -> 191 700 (dix-millièmes de pour cent)

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const charger = (nom: string) =>
  versionBaremeCompleteSchema.parse(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')));
const sept = charger('be-2026-09.json');
const oct = charger('be-2026-10.json');
const nov = charger('be-2026-11.json');

describe('allocations exceptionnelles : les valeurs saisies dans le barème réel', () => {
  it('n° 53 : dix tranches bornées et une dernière sans borne, pécules et autres allocations', () => {
    const attendu = [
      [10_675, 0, 0],
      [13_660, 19.17, 23.22],
      [17_375, 21.2, 25.23],
      [20_840, 26.25, 30.28],
      [23_580, 31.3, 35.33],
      [26_340, 34.33, 38.36],
      [31_830, 36.34, 40.38],
      [34_640, 39.37, 43.41],
      [45_860, 42.39, 46.44],
      [59_900, 47.44, 51.48],
    ].map(([borne, p, a]) => ({ jusqua: euros(borne), pecules: pct(p), autres: pct(a) }));
    // Dernière ligne : cellule fusionnée, 53,50 % pour les deux colonnes (page 18, vérifiée à l'image).
    attendu.push({ jusqua: null as never, pecules: pct(53.5), autres: pct(53.5) });

    for (const v of [sept, oct, nov]) {
      expect(v.parametres.precompte?.allocationsExceptionnelles?.taux).toEqual(attendu);
    }
  });

  it('n° 54 avant le 01/11/2026 : limites de 1 à 12 enfants (septembre et octobre)', () => {
    const attendu = [
      18_858, 22_470, 28_960, 36_200, 43_440, 50_680, 57_920, 65_160, 72_400, 79_640, 86_880,
      94_120,
    ].map(euros);
    for (const v of [sept, oct]) {
      expect(v.parametres.precompte?.allocationsExceptionnelles?.exonerationEnfants).toEqual(
        attendu,
      );
    }
  });

  it('n° 54 depuis le 01/11/2026 : nouveau tableau de l’AR du 27/09/2026, art. 9 (novembre)', () => {
    const attendu = [
      19_543, 22_750, 29_060, 36_130, 43_200, 50_270, 57_340, 64_410, 71_480, 78_550, 85_620,
      92_690,
    ].map(euros);
    expect(nov.parametres.precompte?.allocationsExceptionnelles?.exonerationEnfants).toEqual(
      attendu,
    );
  });

  it('n° 55 : pourcentage et plafond de rémunération de 1 à 5 enfants', () => {
    const attendu = [
      [7.5, 28_940],
      [20, 28_940],
      [35, 31_835],
      [55, 37_625],
      [75, 40_520],
    ].map(([p, m]) => ({ pourcentage: pct(p), remunerationMax: euros(m) }));
    for (const v of [sept, oct, nov]) {
      expect(v.parametres.precompte?.allocationsExceptionnelles?.reductionEnfants).toEqual(attendu);
    }
  });

  it('n° 78.1.2 : 32,10 % sans réduction à défaut de rémunération de référence', () => {
    for (const v of [sept, oct, nov]) {
      expect(v.parametres.precompte?.allocationsExceptionnelles?.tauxSansReference).toBe(pct(32.1));
    }
  });

  it('seul le tableau du n° 54 change au 01/11/2026 : tout le reste du sous-bloc est identique', () => {
    const { exonerationEnfants: avant, ...resteOct } =
      oct.parametres.precompte!.allocationsExceptionnelles!;
    const { exonerationEnfants: apres, ...resteNov } =
      nov.parametres.precompte!.allocationsExceptionnelles!;
    expect(resteNov).toEqual(resteOct);
    expect(apres).not.toEqual(avant);
    expect(sept.parametres.precompte!.allocationsExceptionnelles).toEqual(
      oct.parametres.precompte!.allocationsExceptionnelles,
    );
  });
});

describe('allocations exceptionnelles : le schéma', () => {
  const valide = oct.parametres.precompte!.allocationsExceptionnelles!;

  it('accepte le sous-bloc réel, et reste facultatif dans le bloc precompte', () => {
    expect(allocationsExceptionnellesSchema.parse(valide)).toEqual(valide);
    expect(precompteSchema.safeParse(PRECOMPTE_2026).success).toBe(true);
    expect(
      precompteSchema.safeParse({ ...PRECOMPTE_2026, allocationsExceptionnelles: valide }).success,
    ).toBe(true);
  });

  it('refuse un montant décimal ou une clé inconnue', () => {
    expect(
      allocationsExceptionnellesSchema.safeParse({ ...valide, tauxSansReference: 32.1 }).success,
    ).toBe(false);
    expect(allocationsExceptionnellesSchema.safeParse({ ...valide, autre: 1 }).success).toBe(false);
  });

  it('refuse des tranches dont la dernière a une borne, ou dont une tranche intermédiaire n’en a pas', () => {
    const avecBorne = valide.taux.map((t) => ({ ...t, jusqua: t.jusqua ?? euros(99_999) }));
    expect(allocationsExceptionnellesSchema.safeParse({ ...valide, taux: avecBorne }).success).toBe(
      false,
    );
    const sansBorne = [{ ...valide.taux[0], jusqua: null }, ...valide.taux.slice(1)];
    expect(allocationsExceptionnellesSchema.safeParse({ ...valide, taux: sansBorne }).success).toBe(
      false,
    );
  });

  it('refuse des bornes qui ne croissent pas', () => {
    const [a, b, ...reste] = valide.taux;
    const taux = [{ ...a, jusqua: b.jusqua }, b, ...reste];
    expect(allocationsExceptionnellesSchema.safeParse({ ...valide, taux }).success).toBe(false);
  });

  it('exige douze limites d’exonération croissantes et cinq réductions', () => {
    const onze = valide.exonerationEnfants.slice(0, 11);
    expect(
      allocationsExceptionnellesSchema.safeParse({ ...valide, exonerationEnfants: onze }).success,
    ).toBe(false);
    const desordre = [...valide.exonerationEnfants];
    [desordre[1], desordre[2]] = [desordre[2], desordre[1]];
    expect(
      allocationsExceptionnellesSchema.safeParse({ ...valide, exonerationEnfants: desordre })
        .success,
    ).toBe(false);
    expect(
      allocationsExceptionnellesSchema.safeParse({
        ...valide,
        reductionEnfants: valide.reductionEnfants.slice(0, 4),
      }).success,
    ).toBe(false);
  });
});
