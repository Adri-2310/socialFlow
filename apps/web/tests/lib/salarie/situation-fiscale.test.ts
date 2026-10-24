import { describe, expect, it } from 'vitest';
import {
  REVENUS_CONJOINT,
  REVENUS_CONJOINT_LIBELLES,
  attributionDesCharges,
  conjointAvecRevenusPropres,
  conjointSansRevenusPropres,
  lignesSituationFiscale,
  parentIsolePossible,
  totalCharges,
  type DossierFiscal,
} from '@/lib/salarie/situation-fiscale';

const isole: DossierFiscal = {
  situationFamiliale: 'ISOLE',
  conjointRevenus: null,
  enfantsCharge: 0,
  autresChargeDependantes66: 0,
  autresChargeHandicapees: 0,
  autresCharge: 0,
  beneficiaireHandicape: false,
  conjointHandicape: false,
  enfantsHandicapes: 0,
  parentIsole: false,
  chargesFamilleAttribuees: null,
};

const marie = (revenus: DossierFiscal['conjointRevenus'], extra: Partial<DossierFiscal> = {}) => ({
  ...isole,
  situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL' as const,
  conjointRevenus: revenus,
  ...extra,
});

describe('situation fiscale : conjoint avec ou sans revenus propres', () => {
  it('SANS_REVENUS et PENSION_TRES_LIMITEE comptent comme sans revenus propres (n° 33)', () => {
    expect(conjointSansRevenusPropres(marie('SANS_REVENUS'))).toBe(true);
    expect(conjointSansRevenusPropres(marie('PENSION_TRES_LIMITEE'))).toBe(true);
    expect(conjointAvecRevenusPropres(marie('PENSION_TRES_LIMITEE'))).toBe(false);
  });

  it('les trois autres cas ont des revenus propres', () => {
    for (const revenus of ['PENSION_LIMITEE', 'REVENU_LIMITE', 'REVENUS'] as const) {
      expect(conjointAvecRevenusPropres(marie(revenus))).toBe(true);
      expect(conjointSansRevenusPropres(marie(revenus))).toBe(false);
    }
  });

  it('un isolé n’a pas de conjoint, quelle que soit la valeur résiduelle', () => {
    expect(conjointSansRevenusPropres({ ...isole, conjointRevenus: 'REVENUS' })).toBe(false);
    expect(conjointAvecRevenusPropres({ ...isole, conjointRevenus: 'REVENUS' })).toBe(false);
  });

  it('un marié dont les revenus du conjoint ne sont pas renseignés n’est dans aucun des deux cas', () => {
    expect(conjointSansRevenusPropres(marie(null))).toBe(false);
    expect(conjointAvecRevenusPropres(marie(null))).toBe(false);
  });

  it('chaque valeur a un libellé', () => {
    for (const revenus of REVENUS_CONJOINT) {
      expect(REVENUS_CONJOINT_LIBELLES[revenus]).toBeTruthy();
    }
  });
});

describe('situation fiscale : questions applicables', () => {
  it('l’attribution des charges exige un conjoint avec revenus ET des charges (n° 6)', () => {
    expect(attributionDesCharges(marie('REVENUS', { enfantsCharge: 1 }))).toBe(true);
    expect(attributionDesCharges(marie('REVENU_LIMITE', { autresCharge: 1 }))).toBe(true);
    expect(attributionDesCharges(marie('PENSION_LIMITEE', { autresChargeHandicapees: 1 }))).toBe(true);
    expect(attributionDesCharges(marie('REVENUS'))).toBe(false);
    expect(attributionDesCharges(marie('SANS_REVENUS', { enfantsCharge: 2 }))).toBe(false);
    expect(attributionDesCharges(marie('PENSION_TRES_LIMITEE', { enfantsCharge: 2 }))).toBe(false);
    expect(attributionDesCharges({ ...isole, enfantsCharge: 2 })).toBe(false);
  });

  it('le parent isolé exige un isolé avec des enfants à charge (n° 40.1)', () => {
    expect(parentIsolePossible({ ...isole, enfantsCharge: 1 })).toBe(true);
    expect(parentIsolePossible(isole)).toBe(false);
    expect(parentIsolePossible(marie('REVENUS', { enfantsCharge: 1 }))).toBe(false);
  });

  it('le total des charges additionne enfants et autres personnes', () => {
    expect(
      totalCharges({
        ...isole,
        enfantsCharge: 2,
        autresChargeDependantes66: 1,
        autresChargeHandicapees: 1,
        autresCharge: 3,
      }),
    ).toBe(7);
  });
});

describe('lignes de la fiche (situation fiscale)', () => {
  const libelles = (dossier: DossierFiscal) =>
    lignesSituationFiscale(dossier, 'Isolé').map((l) => l.label);

  it('un isolé sans charge ne voit que les lignes qui ont un sens', () => {
    expect(lignesSituationFiscale(isole, 'Isolé')).toEqual([
      { label: 'Situation familiale', value: 'Isolé' },
      { label: 'Salarié handicapé', value: 'Non' },
      { label: 'Enfants à charge', value: '0' },
    ]);
  });

  it('un marié affiche les revenus du conjoint, ou « à préciser » (null) s’ils manquent', () => {
    expect(
      lignesSituationFiscale(marie('REVENU_LIMITE'), 'Marié').find(
        (l) => l.label === 'Revenus du conjoint ou cohabitant',
      )?.value,
    ).toBe(REVENUS_CONJOINT_LIBELLES.REVENU_LIMITE);
    expect(
      lignesSituationFiscale(marie(null), 'Marié').find(
        (l) => l.label === 'Revenus du conjoint ou cohabitant',
      )?.value,
    ).toBeNull();
  });

  it('le handicap du conjoint n’apparaît que s’il n’a pas de revenus propres', () => {
    expect(libelles(marie('SANS_REVENUS'))).toContain('Conjoint handicapé');
    expect(libelles(marie('REVENUS'))).not.toContain('Conjoint handicapé');
  });

  it('détaille les enfants handicapés, le parent isolé et les autres personnes à charge', () => {
    const lignes = lignesSituationFiscale(
      {
        ...isole,
        enfantsCharge: 3,
        enfantsHandicapes: 1,
        parentIsole: true,
        autresChargeDependantes66: 2,
        autresChargeHandicapees: 1,
        autresCharge: 1,
      },
      'Isolé',
    );
    expect(lignes.find((l) => l.label === 'Enfants à charge')?.value).toBe('3, dont 1 handicapé');
    expect(lignes.find((l) => l.label === 'Parent isolé')?.value).toBe('Oui');
    expect(lignes.find((l) => l.label === 'Autres personnes à charge')?.value).toBe(
      '2 dépendantes de 66 ans ou plus, 1 handicapée, 1 autre',
    );
  });

  it('l’attribution des charges apparaît « à préciser » tant qu’elle est vide', () => {
    const couple = marie('REVENUS', { enfantsCharge: 1 });
    const attribution = (dossier: DossierFiscal) =>
      lignesSituationFiscale(dossier, 'Marié').find(
        (l) => l.label === 'Réductions pour charges de famille',
      )?.value;
    expect(attribution(couple)).toBeNull();
    expect(attribution({ ...couple, chargesFamilleAttribuees: true })).toBe('Reçues par ce salarié');
    expect(attribution({ ...couple, chargesFamilleAttribuees: false })).toBe(
      'Reçues par son conjoint ou cohabitant',
    );
    // Sans objet : la ligne n'existe pas.
    expect(attribution(marie('REVENUS'))).toBeUndefined();
  });
});
