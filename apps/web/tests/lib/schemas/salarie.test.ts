import { describe, expect, it } from 'vitest';
import { conditionTravailSchema, invalidFieldCode, salarieSchema } from '@/lib/schemas/salarie';

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
  conjointAvecRevenus: false,
  personnesCharge: 0,
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
    expect(codeOf({ ...employe, conjointAvecRevenus: undefined })).toBe(
      'INVALID_CONJOINT_AVEC_REVENUS',
    );
    expect(codeOf({ ...employe, situationFamiliale: 'ISOLE', conjointAvecRevenus: true })).toBe(
      'INVALID_CONJOINT_AVEC_REVENUS',
    );
    expect(
      codeOf({ ...employe, situationFamiliale: 'ISOLE', conjointAvecRevenus: undefined }),
    ).toBeNull();
    expect(codeOf({ ...employe, personnesCharge: -1 })).toBe('INVALID_PERSONNES_CHARGE');
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
