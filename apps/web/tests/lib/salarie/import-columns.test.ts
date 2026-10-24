import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/salarie/csv';
import {
  COLONNES,
  colonneDuChamp,
  ligneVersCorps,
  lireDate,
  modeleCsv,
  normaliserEntete,
  resoudreColonne,
} from '@/lib/salarie/import-columns';
import { invalidFields, salarieSchema } from '@/lib/schemas/salarie';

const base = {
  prenom: 'Marie',
  nom: 'Dupont',
  niss: '85.07.30-033.28',
  date_naissance: '30/07/1985',
  iban: 'BE68 5390 0754 7034',
  statut: 'Employé',
  type_contrat: 'cdi',
  date_entree: '01/11/2026',
  fonction: 'Comptable',
  regime: 'Temps plein',
  salaire: '2 850,00',
  situation_familiale: 'Isolé',
};

describe('en-têtes', () => {
  it('reconnaît une colonne quelle que soit la casse, les accents et la ponctuation', () => {
    expect(normaliserEntete('Date de naissance')).toBe('date_de_naissance');
    expect(normaliserEntete('DATE_NAISSANCE')).toBe('date_naissance');
    expect(normaliserEntete(' Date-Entrée ')).toBe('date_entree');
    expect(normaliserEntete('Régime')).toBe('regime');
  });

  it('associe chaque champ d’erreur à sa colonne, salaire et commission paritaire compris', () => {
    expect(colonneDuChamp('dateEntree')).toBe('date_entree');
    expect(colonneDuChamp('salaireMensuelBrutCents')).toBe('salaire');
    expect(colonneDuChamp('salaireHoraireBrutCents')).toBe('salaire');
    expect(colonneDuChamp('commissionParitaire')).toBe('statut');
    expect(colonneDuChamp('inconnu')).toBeNull();
  });
});

describe('résolution des colonnes', () => {
  it('reconnaît les noms du modèle et les écritures naturelles d’Excel', () => {
    expect(resoudreColonne('niss')).toBe('niss');
    expect(resoudreColonne('Prénom')).toBe('prenom');
    expect(resoudreColonne('Date de naissance')).toBe('date_naissance');
    expect(resoudreColonne('Type de contrat')).toBe('type_contrat');
    expect(resoudreColonne('Date d’entrée')).toBe('date_entree');
    expect(resoudreColonne('Personnes à charge')).toBe('enfants_charge');
    expect(resoudreColonne('Enfants à charge')).toBe('enfants_charge');
    expect(resoudreColonne('Revenus du conjoint')).toBe('revenus_conjoint');
    expect(resoudreColonne('Salaire brut')).toBe('salaire');
  });

  it('ne reconnaît pas un nom qu’elle ne connaît pas', () => {
    expect(resoudreColonne('cabinetId')).toBeNull();
    expect(resoudreColonne('Date de sortie')).toBeNull();
    expect(resoudreColonne('')).toBeNull();
  });
});

describe('lecture des dates', () => {
  it('convertit JJ/MM/AAAA, J/M/AAAA et AAAA-MM-JJ en AAAA-MM-JJ', () => {
    expect(lireDate('01/11/2026')).toBe('2026-11-01');
    expect(lireDate('1/2/2026')).toBe('2026-02-01');
    expect(lireDate('1.2.2026')).toBe('2026-02-01');
    expect(lireDate('2026-11-01')).toBe('2026-11-01');
  });

  it('rend telle quelle une date qui n’existe pas ou illisible : le schéma la refusera', () => {
    expect(lireDate('31/02/2026')).toBe('31/02/2026');
    expect(lireDate('demain')).toBe('demain');
    expect(lireDate('2026-13-01')).toBe('2026-13-01');
  });

  it('une cellule vide n’est pas une date', () => {
    expect(lireDate('')).toBeUndefined();
    expect(lireDate('   ')).toBeUndefined();
    expect(lireDate(undefined)).toBeUndefined();
  });
});

describe('ligne du fichier → corps de création', () => {
  it('produit un dossier que le schéma accepte, comme à la création manuelle', () => {
    const resultat = salarieSchema.safeParse(ligneVersCorps(base));
    expect(resultat.success).toBe(true);
    expect(resultat.data).toMatchObject({
      niss: '85073003328',
      iban: 'BE68539007547034',
      statut: 'EMPLOYE',
      typeContrat: 'CDI',
      commissionParitaire: '200',
      dateEntree: '2026-11-01',
      dateNaissance: '1985-07-30',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 285000,
      situationFamiliale: 'ISOLE',
      enfantsCharge: 0,
      beneficiaireHandicape: false,
      pays: 'BE',
    });
  });

  it('un ouvrier a un salaire horaire et la CP 100', () => {
    const corps = ligneVersCorps({ ...base, statut: 'ouvrier', salaire: '17,25' });
    const resultat = salarieSchema.safeParse(corps);
    expect(resultat.success).toBe(true);
    expect(resultat.data).toMatchObject({
      statut: 'OUVRIER',
      commissionParitaire: '100',
      salaireHoraireBrutCents: 1725,
    });
    expect(resultat.data?.salaireMensuelBrutCents).toBeUndefined();
  });

  it('comprend les synonymes de régime, de situation familiale et de revenus du conjoint', () => {
    const corps = ligneVersCorps({
      ...base,
      regime: 'partiel',
      heures_semaine: '30,4',
      heures_reference: '38',
      situation_familiale: 'Marié',
      revenus_conjoint: 'OUI',
      enfants_charge: '2',
    });
    const resultat = salarieSchema.safeParse(corps);
    expect(resultat.success).toBe(true);
    expect(resultat.data).toMatchObject({
      regime: 'TEMPS_PARTIEL',
      heuresSemaine: 30.4,
      heuresReference: 38,
      situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
      conjointRevenus: 'REVENUS',
      enfantsCharge: 2,
    });
  });

  it('lit la situation fiscale complète (D95) : revenus du conjoint, handicaps, charges', () => {
    const corps = ligneVersCorps({
      ...base,
      situation_familiale: 'marié',
      revenus_conjoint: 'revenu limité',
      salarie_handicape: 'oui',
      enfants_charge: '3',
      enfants_handicapes: '1',
      autres_charge_dependantes: '1',
      autres_charge_handicapees: '2',
      autres_charge: '1',
      charges_famille_attribuees: 'oui',
    });
    const resultat = salarieSchema.safeParse(corps);
    expect(resultat.success).toBe(true);
    expect(resultat.data).toMatchObject({
      conjointRevenus: 'REVENU_LIMITE',
      beneficiaireHandicape: true,
      conjointHandicape: false,
      enfantsCharge: 3,
      enfantsHandicapes: 1,
      autresChargeDependantes66: 1,
      autresChargeHandicapees: 2,
      autresCharge: 1,
      parentIsole: false,
      chargesFamilleAttribuees: true,
    });
  });

  it('les anciennes valeurs « oui » et « non » de la colonne des revenus restent lisibles', () => {
    const revenus = (valeur: string) =>
      salarieSchema.parse(
        ligneVersCorps({ ...base, situation_familiale: 'marié', revenus_conjoint: valeur }),
      ).conjointRevenus;
    expect(revenus('oui')).toBe('REVENUS');
    expect(revenus('non')).toBe('SANS_REVENUS');
    expect(revenus('pension très limitée')).toBe('PENSION_TRES_LIMITEE');
    expect(revenus('pension limitée')).toBe('PENSION_LIMITEE');
  });

  it('un fichier sans aucune colonne fiscale facultative reste valide (rien à remplir)', () => {
    const resultat = salarieSchema.safeParse(ligneVersCorps(base));
    expect(resultat.success).toBe(true);
    expect(resultat.data).toMatchObject({
      enfantsCharge: 0,
      enfantsHandicapes: 0,
      parentIsole: false,
      beneficiaireHandicape: false,
    });
    expect(resultat.data?.chargesFamilleAttribuees).toBeUndefined();
  });

  it('applique les règles de cohérence de la situation fiscale à l’import', () => {
    const fautes = (ligne: Parameters<typeof ligneVersCorps>[0]) => {
      const r = salarieSchema.safeParse(ligneVersCorps(ligne));
      return r.success ? [] : Object.keys(invalidFields(r.error));
    };
    // Un isolé n'a pas de conjoint.
    expect(fautes({ ...base, revenus_conjoint: 'oui' })).toEqual(['conjointRevenus']);
    // Les handicapés sont des enfants à charge.
    expect(fautes({ ...base, enfants_charge: '1', enfants_handicapes: '2' })).toEqual([
      'enfantsHandicapes',
    ]);
    // L'attribution des charges ne se pose pas sans conjoint ayant des revenus.
    expect(fautes({ ...base, enfants_charge: '1', charges_famille_attribuees: 'oui' })).toEqual([
      'chargesFamilleAttribuees',
    ]);
  });

  it('applique les règles de la création : CDD sans date de fin, NISS faux, IBAN étranger', () => {
    const fautes = (ligne: Parameters<typeof ligneVersCorps>[0]) => {
      const r = salarieSchema.safeParse(ligneVersCorps(ligne));
      return r.success ? {} : invalidFields(r.error);
    };
    expect(fautes({ ...base, type_contrat: 'CDD' })).toEqual({
      dateFinContrat: 'INVALID_DATE_FIN_CONTRAT',
    });
    expect(fautes({ ...base, niss: '85073003329' })).toEqual({ niss: 'INVALID_NISS' });
    expect(fautes({ ...base, iban: 'NL91ABNA0417164300' })).toEqual({ iban: 'INVALID_IBAN' });
  });

  it('signale par le champ concerné une saisie illisible', () => {
    const fautes = (ligne: Parameters<typeof ligneVersCorps>[0]) => {
      const r = salarieSchema.safeParse(ligneVersCorps(ligne));
      return r.success ? {} : Object.keys(invalidFields(r.error));
    };
    expect(fautes({ ...base, date_entree: '31/02/2026' })).toContain('dateEntree');
    expect(fautes({ ...base, salaire: '12,345' })).toContain('salaireMensuelBrutCents');
    expect(fautes({ ...base, statut: 'stagiaire' })).toEqual(
      expect.arrayContaining(['statut', 'commissionParitaire']),
    );
    expect(fautes({ ...base, regime: 'mi-temps' })).toContain('regime');
    expect(fautes({ ...base, situation_familiale: 'compliqué' })).toContain('situationFamiliale');
    expect(fautes({ ...base, enfants_charge: 'deux' })).toContain('enfantsCharge');
    expect(fautes({ ...base, parent_isole: 'peut-être' })).toContain('parentIsole');
    expect(
      fautes({ ...base, situation_familiale: 'marié', revenus_conjoint: 'peut-être' }),
    ).toContain('conjointRevenus');
  });

  it('une cellule de salaire vide n’est pas un salaire à 0', () => {
    const r = salarieSchema.safeParse(ligneVersCorps({ ...base, salaire: '' }));
    expect(r.success).toBe(false);
  });

  it('ignore les colonnes qui ne sont pas des champs du fichier', () => {
    // Un cabinetId ou un entrepriseId n'a aucune colonne : il n'existe pas dans le corps produit.
    const corps = ligneVersCorps({ ...base, cabinetId: 'autre' } as never);
    expect(Object.keys(corps)).not.toContain('cabinetId');
    expect(Object.keys(corps)).not.toContain('entrepriseId');
  });
});

describe('modèle téléchargeable', () => {
  it('contient toutes les colonnes et une ligne d’exemple que l’import accepte', () => {
    const modele = modeleCsv();
    expect(modele.startsWith('﻿')).toBe(true);

    const table = parseCsv(modele);
    expect(table.headers).toEqual(COLONNES.map((c) => c.nom));
    expect(table.rows).toHaveLength(1);

    const ligne = Object.fromEntries(table.headers.map((h, i) => [h, table.rows[0][i]]));
    const resultat = salarieSchema.safeParse(ligneVersCorps(ligne));
    expect(resultat.success).toBe(true);
  });
});
