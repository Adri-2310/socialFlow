import { describe, expect, it } from 'vitest';
import {
  conditionTravailSchema,
  invalidFieldCode,
  salarieModificationSchema,
  salarieSchema,
} from '@/lib/schemas/salarie';

const employe = {
  nom: 'Dupont',
  prenom: 'Marie',
  niss: '85.07.30-033.28',
  dateNaissance: '1985-07-30',
  email: 'marie@exemple.be',
  iban: 'BE68 5390 0754 7034',
  statut: 'EMPLOYE',
  typeContrat: 'CDI',
  dateEntree: '2026-11-01',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
  situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
  conjointRevenus: 'SANS_REVENUS',
  enfantsCharge: 0,
};

const ouvrier = {
  ...employe,
  statut: 'OUVRIER',
  commissionParitaire: '100',
  salaireMensuelBrutCents: undefined,
  salaireHoraireBrutCents: 1650,
};

// Renvoie le code d'erreur du premier champ refusé, ou null si le dossier est valide.
function codeOf(input: unknown): string | null {
  const result = salarieSchema.safeParse(input);
  return result.success ? null : invalidFieldCode(result.error);
}

describe('schéma du dossier salarié', () => {
  it('accepte un employé et un ouvrier valides', () => {
    expect(codeOf(employe)).toBeNull();
    expect(codeOf(ouvrier)).toBeNull();
  });

  it('normalise NISS et IBAN et applique le pays par défaut', () => {
    const parsed = salarieSchema.parse(employe);
    expect(parsed.niss).toBe('85073003328');
    expect(parsed.iban).toBe('BE68539007547034');
    expect(parsed.pays).toBe('BE');
  });

  it('refuse un NISS ou un IBAN invalide', () => {
    expect(codeOf({ ...employe, niss: '85073003329' })).toBe('INVALID_NISS');
    expect(codeOf({ ...employe, iban: 'NL91ABNA0417164300' })).toBe('INVALID_IBAN');
  });

  it('CDD : date de fin obligatoire et postérieure à l’entrée ; CDI : pas de date de fin', () => {
    expect(codeOf({ ...employe, typeContrat: 'CDD' })).toBe('INVALID_DATE_FIN_CONTRAT');
    expect(codeOf({ ...employe, typeContrat: 'CDD', dateFinContrat: '2026-10-01' })).toBe(
      'INVALID_DATE_FIN_CONTRAT',
    );
    expect(codeOf({ ...employe, typeContrat: 'CDD', dateFinContrat: '2027-10-31' })).toBeNull();
    expect(codeOf({ ...employe, dateFinContrat: '2027-10-31' })).toBe('INVALID_DATE_FIN_CONTRAT');
  });

  it('refuse une sortie avant l’entrée', () => {
    expect(codeOf({ ...employe, dateSortie: '2026-10-31' })).toBe('INVALID_DATE_SORTIE');
    expect(codeOf({ ...employe, dateSortie: '2027-03-31' })).toBeNull();
  });

  it('temps partiel : heures obligatoires, sans dépasser la référence', () => {
    const partiel = { ...employe, regime: 'TEMPS_PARTIEL' };
    expect(codeOf(partiel)).toBe('INVALID_HEURES_SEMAINE');
    expect(codeOf({ ...partiel, heuresSemaine: 19 })).toBe('INVALID_HEURES_REFERENCE');
    expect(codeOf({ ...partiel, heuresSemaine: 40, heuresReference: 38 })).toBe(
      'INVALID_HEURES_SEMAINE',
    );
    expect(codeOf({ ...partiel, heuresSemaine: 19, heuresReference: 38 })).toBeNull();
  });

  it('rémunération : mensuelle pour l’employé, horaire pour l’ouvrier, jamais les deux', () => {
    expect(codeOf({ ...employe, salaireMensuelBrutCents: undefined })).toBe(
      'INVALID_SALAIRE_MENSUEL_BRUT_CENTS',
    );
    expect(codeOf({ ...employe, salaireHoraireBrutCents: 1650 })).toBe(
      'INVALID_SALAIRE_HORAIRE_BRUT_CENTS',
    );
    expect(codeOf({ ...ouvrier, salaireHoraireBrutCents: undefined })).toBe(
      'INVALID_SALAIRE_HORAIRE_BRUT_CENTS',
    );
    expect(codeOf({ ...ouvrier, salaireMensuelBrutCents: 280000 })).toBe(
      'INVALID_SALAIRE_MENSUEL_BRUT_CENTS',
    );
  });

  it('refuse un montant à virgule ou nul (centimes entiers)', () => {
    expect(codeOf({ ...employe, salaireMensuelBrutCents: 2800.5 })).toBe(
      'INVALID_SALAIRE_MENSUEL_BRUT_CENTS',
    );
    expect(codeOf({ ...employe, salaireMensuelBrutCents: 0 })).toBe(
      'INVALID_SALAIRE_MENSUEL_BRUT_CENTS',
    );
  });

  it('fiscal : le conjoint ne se précise que pour une personne mariée', () => {
    expect(codeOf({ ...employe, conjointRevenus: undefined })).toBe('INVALID_CONJOINT_REVENUS');
    expect(codeOf({ ...employe, situationFamiliale: 'ISOLE', conjointRevenus: 'REVENUS' })).toBe(
      'INVALID_CONJOINT_REVENUS',
    );
    expect(codeOf({ ...employe, conjointRevenus: 'peut-être' })).toBe('INVALID_CONJOINT_REVENUS');
    expect(codeOf({ ...employe, situationFamiliale: 'ISOLE', conjointRevenus: undefined })).toBeNull();
    for (const revenus of [
      'SANS_REVENUS',
      'PENSION_TRES_LIMITEE',
      'PENSION_LIMITEE',
      'REVENU_LIMITE',
      'REVENUS',
    ]) {
      expect(codeOf({ ...employe, conjointRevenus: revenus })).toBeNull();
    }
  });

  it('fiscal : un célibataire sans charge ne remplit rien (valeurs par défaut)', () => {
    const { conjointRevenus: _revenus, enfantsCharge: _enfants, ...isole } = employe;
    const parsed = salarieSchema.parse({ ...isole, situationFamiliale: 'ISOLE' });
    expect(parsed).toMatchObject({
      beneficiaireHandicape: false,
      conjointHandicape: false,
      enfantsCharge: 0,
      enfantsHandicapes: 0,
      autresChargeDependantes66: 0,
      autresChargeHandicapees: 0,
      autresCharge: 0,
      parentIsole: false,
    });
    expect(parsed.conjointRevenus).toBeUndefined();
    expect(parsed.chargesFamilleAttribuees).toBeUndefined();
  });

  it('fiscal : les compteurs de charges sont des entiers de 0 à 20', () => {
    expect(codeOf({ ...employe, enfantsCharge: -1 })).toBe('INVALID_ENFANTS_CHARGE');
    expect(codeOf({ ...employe, enfantsCharge: 21 })).toBe('INVALID_ENFANTS_CHARGE');
    expect(codeOf({ ...employe, enfantsCharge: 1.5 })).toBe('INVALID_ENFANTS_CHARGE');
    expect(codeOf({ ...employe, autresCharge: -1 })).toBe('INVALID_AUTRES_CHARGE');
    expect(codeOf({ ...employe, autresChargeHandicapees: 2.5 })).toBe(
      'INVALID_AUTRES_CHARGE_HANDICAPEES',
    );
    expect(codeOf({ ...employe, autresChargeDependantes66: 21 })).toBe(
      'INVALID_AUTRES_CHARGE_DEPENDANTES66',
    );
  });

  it('fiscal : les enfants handicapés sont un sous-ensemble des enfants à charge (n° 8)', () => {
    expect(codeOf({ ...employe, enfantsCharge: 1, enfantsHandicapes: 2 })).toBe(
      'INVALID_ENFANTS_HANDICAPES',
    );
    expect(codeOf({ ...employe, enfantsCharge: 0, enfantsHandicapes: 1 })).toBe(
      'INVALID_ENFANTS_HANDICAPES',
    );
    expect(codeOf({ ...employe, enfantsCharge: 2, enfantsHandicapes: 2 })).toBeNull();
  });

  it('fiscal : le handicap du conjoint ne se saisit que sans revenus propres (n° 41)', () => {
    for (const revenus of ['SANS_REVENUS', 'PENSION_TRES_LIMITEE']) {
      expect(codeOf({ ...employe, conjointRevenus: revenus, conjointHandicape: true })).toBeNull();
    }
    for (const revenus of ['PENSION_LIMITEE', 'REVENU_LIMITE', 'REVENUS']) {
      expect(codeOf({ ...employe, conjointRevenus: revenus, conjointHandicape: true })).toBe(
        'INVALID_CONJOINT_HANDICAPE',
      );
    }
    expect(
      codeOf({
        ...employe,
        situationFamiliale: 'ISOLE',
        conjointRevenus: undefined,
        conjointHandicape: true,
      }),
    ).toBe('INVALID_CONJOINT_HANDICAPE');
  });

  it('fiscal : le salarié handicapé se saisit pour tout le monde (n° 39)', () => {
    expect(codeOf({ ...employe, beneficiaireHandicape: true })).toBeNull();
    expect(
      codeOf({
        ...employe,
        situationFamiliale: 'ISOLE',
        conjointRevenus: undefined,
        beneficiaireHandicape: true,
      }),
    ).toBeNull();
  });

  it('fiscal : parent isolé réservé à un isolé qui a des enfants à charge (n° 40.1)', () => {
    const isole = { ...employe, situationFamiliale: 'ISOLE', conjointRevenus: undefined };
    expect(codeOf({ ...isole, enfantsCharge: 1, parentIsole: true })).toBeNull();
    expect(codeOf({ ...isole, enfantsCharge: 0, parentIsole: true })).toBe('INVALID_PARENT_ISOLE');
    expect(codeOf({ ...employe, enfantsCharge: 1, parentIsole: true })).toBe('INVALID_PARENT_ISOLE');
  });

  describe('attribution des charges de famille (n° 6)', () => {
    const coupleQuiTravaille = { ...employe, conjointRevenus: 'REVENUS', enfantsCharge: 1 };

    it('se précise, ou reste à préciser, quand le conjoint a des revenus et qu’il y a des charges', () => {
      expect(codeOf({ ...coupleQuiTravaille, chargesFamilleAttribuees: true })).toBeNull();
      expect(codeOf({ ...coupleQuiTravaille, chargesFamilleAttribuees: false })).toBeNull();
      expect(codeOf(coupleQuiTravaille)).toBeNull();
      for (const revenus of ['PENSION_LIMITEE', 'REVENU_LIMITE']) {
        expect(
          codeOf({ ...coupleQuiTravaille, conjointRevenus: revenus, chargesFamilleAttribuees: true }),
        ).toBeNull();
      }
    });

    it('compte aussi les autres personnes à charge', () => {
      const autres = { ...employe, conjointRevenus: 'REVENUS', autresCharge: 1 };
      expect(codeOf({ ...autres, chargesFamilleAttribuees: true })).toBeNull();
    });

    it('est refusée quand la question n’a pas d’objet', () => {
      const refus = 'INVALID_CHARGES_FAMILLE_ATTRIBUEES';
      // Conjoint sans revenus propres (n° 33 compris) : rien à attribuer.
      for (const revenus of ['SANS_REVENUS', 'PENSION_TRES_LIMITEE']) {
        expect(
          codeOf({ ...coupleQuiTravaille, conjointRevenus: revenus, chargesFamilleAttribuees: true }),
        ).toBe(refus);
      }
      // Pas de charge.
      expect(
        codeOf({ ...coupleQuiTravaille, enfantsCharge: 0, chargesFamilleAttribuees: true }),
      ).toBe(refus);
      // Isolé.
      expect(
        codeOf({
          ...employe,
          situationFamiliale: 'ISOLE',
          conjointRevenus: undefined,
          enfantsCharge: 1,
          chargesFamilleAttribuees: true,
        }),
      ).toBe(refus);
    });
  });

  it('la commission paritaire suit le statut : employé CP 200, ouvrier CP 100 (D44)', () => {
    expect(codeOf({ ...employe, commissionParitaire: '100' })).toBe('INVALID_COMMISSION_PARITAIRE');
    expect(codeOf({ ...ouvrier, commissionParitaire: '200' })).toBe('INVALID_COMMISSION_PARITAIRE');
  });

  it('refuse une commission paritaire inconnue et une date mal formée', () => {
    expect(codeOf({ ...employe, commissionParitaire: '999' })).toBe('INVALID_COMMISSION_PARITAIRE');
    expect(codeOf({ ...employe, dateEntree: '01/11/2026' })).toBe('INVALID_DATE_ENTREE');
  });
});

describe('schéma d’une condition de travail datée', () => {
  const condition = {
    dateEffet: '2027-01-01',
    statut: 'EMPLOYE',
    commissionParitaire: '200',
    fonction: 'Responsable comptable',
    regime: 'TEMPS_PLEIN',
    salaireMensuelBrutCents: 310000,
  };
  const codeOfCondition = (input: unknown): string | null => {
    const result = conditionTravailSchema.safeParse(input);
    return result.success ? null : invalidFieldCode(result.error);
  };

  it('accepte une nouvelle ligne valide, y compris un passage ouvrier → employé', () => {
    expect(codeOfCondition(condition)).toBeNull();
    expect(
      codeOfCondition({
        ...condition,
        statut: 'OUVRIER',
        commissionParitaire: '100',
        salaireMensuelBrutCents: undefined,
        salaireHoraireBrutCents: 1700,
      }),
    ).toBeNull();
  });

  it('applique les mêmes règles que le dossier', () => {
    expect(codeOfCondition({ ...condition, dateEffet: undefined })).toBe('INVALID_DATE_EFFET');
    expect(codeOfCondition({ ...condition, commissionParitaire: '100' })).toBe(
      'INVALID_COMMISSION_PARITAIRE',
    );
    expect(codeOfCondition({ ...condition, salaireMensuelBrutCents: undefined })).toBe(
      'INVALID_SALAIRE_MENSUEL_BRUT_CENTS',
    );
    expect(codeOfCondition({ ...condition, regime: 'TEMPS_PARTIEL' })).toBe(
      'INVALID_HEURES_SEMAINE',
    );
  });
});

describe('schéma de modification d’un dossier', () => {
  // Le dossier sans conditions de travail ni NISS et IBAN : ils se changent à part.
  const {
    niss: _niss,
    iban: _iban,
    statut: _statut,
    commissionParitaire: _cp,
    fonction: _fonction,
    regime: _regime,
    salaireMensuelBrutCents: _salaire,
    ...dossier
  } = employe;
  const codeOfModification = (input: unknown): string | null => {
    const result = salarieModificationSchema.safeParse(input);
    return result.success ? null : invalidFieldCode(result.error);
  };

  it('accepte le dossier sans NISS ni IBAN (inchangés) ni conditions de travail', () => {
    expect(codeOfModification(dossier)).toBeNull();
  });

  it('valide et normalise un nouveau NISS ou IBAN quand il est fourni', () => {
    const parsed = salarieModificationSchema.parse({
      ...dossier,
      niss: '85.07.30-033.28',
      iban: 'be68 5390 0754 7034',
    });
    expect(parsed.niss).toBe('85073003328');
    expect(parsed.iban).toBe('BE68539007547034');
    expect(codeOfModification({ ...dossier, niss: '85073003329' })).toBe('INVALID_NISS');
    expect(codeOfModification({ ...dossier, iban: 'NL91ABNA0417164300' })).toBe('INVALID_IBAN');
  });

  it('applique les règles de contrat et de fiscalité du dossier', () => {
    expect(codeOfModification({ ...dossier, typeContrat: 'CDD' })).toBe('INVALID_DATE_FIN_CONTRAT');
    expect(codeOfModification({ ...dossier, dateEntree: '1980-01-01' })).toBe(
      'INVALID_DATE_NAISSANCE',
    );
    expect(codeOfModification({ ...dossier, conjointRevenus: undefined })).toBe(
      'INVALID_CONJOINT_REVENUS',
    );
    expect(codeOfModification({ ...dossier, enfantsCharge: 1, enfantsHandicapes: 2 })).toBe(
      'INVALID_ENFANTS_HANDICAPES',
    );
  });
});
