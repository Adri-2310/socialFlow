import { describe, expect, it } from 'vitest';
import { INITIAL, fiscalPayload, toFormValues, type FormValues } from '@/lib/salarie/salarie-form';
import type { SalarieDetail } from '@/lib/salarie/salarie-data';
import { salarieModificationSchema } from '@/lib/schemas/salarie';

// Ce que le formulaire envoie au serveur (D95) : une question masquée ne laisse jamais partir la
// valeur d'un choix précédent, sinon le serveur refuserait un dossier que l'écran juge complet.

const form = (changes: Partial<FormValues> = {}): FormValues => ({ ...INITIAL, ...changes });

describe('charge utile fiscale du formulaire', () => {
  it('un célibataire sans charge n’envoie que des valeurs par défaut', () => {
    expect(fiscalPayload(form())).toEqual({
      situationFamiliale: 'ISOLE',
      conjointRevenus: undefined,
      beneficiaireHandicape: false,
      conjointHandicape: false,
      enfantsCharge: 0,
      enfantsHandicapes: 0,
      autresChargeDependantes66: 0,
      autresChargeHandicapees: 0,
      autresCharge: 0,
      parentIsole: false,
      chargesFamilleAttribuees: undefined,
    });
  });

  it('repasser à isolé efface les réponses du conjoint restées dans le formulaire', () => {
    const payload = fiscalPayload(
      form({
        situationFamiliale: 'ISOLE',
        conjointRevenus: 'REVENUS',
        conjointHandicape: true,
        chargesFamilleAttribuees: 'oui',
        enfantsCharge: '1',
      }),
    );
    expect(payload.conjointRevenus).toBeUndefined();
    expect(payload.conjointHandicape).toBe(false);
    expect(payload.chargesFamilleAttribuees).toBeUndefined();
  });

  it('un conjoint qui a des revenus propres efface son handicap et garde l’attribution', () => {
    const payload = fiscalPayload(
      form({
        situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
        conjointRevenus: 'REVENUS',
        conjointHandicape: true,
        enfantsCharge: '2',
        chargesFamilleAttribuees: 'non',
      }),
    );
    expect(payload.conjointHandicape).toBe(false);
    expect(payload.chargesFamilleAttribuees).toBe(false);
  });

  it('sans enfant, ni enfant handicapé ni parent isolé ne partent', () => {
    const payload = fiscalPayload(
      form({ enfantsCharge: '0', enfantsHandicapes: '3', parentIsole: true }),
    );
    expect(payload.enfantsHandicapes).toBe(0);
    expect(payload.parentIsole).toBe(false);
  });

  it('case « autres personnes » décochée : les trois compteurs repartent à zéro', () => {
    const payload = fiscalPayload(
      form({
        autresPersonnes: false,
        autresChargeDependantes66: '2',
        autresChargeHandicapees: '1',
        autresCharge: '4',
      }),
    );
    expect(payload).toMatchObject({
      autresChargeDependantes66: 0,
      autresChargeHandicapees: 0,
      autresCharge: 0,
    });
  });

  it('un compteur vide vaut zéro, une saisie illisible reste refusée par le schéma', () => {
    expect(fiscalPayload(form({ enfantsCharge: '' })).enfantsCharge).toBe(0);
    expect(fiscalPayload(form({ enfantsCharge: 'deux' })).enfantsCharge).toBeNaN();
  });

  it('un marié sans réponse sur les revenus du conjoint est refusé par le schéma', () => {
    const payload = fiscalPayload(form({ situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL' }));
    expect(payload.conjointRevenus).toBeUndefined();
  });
});

describe('toute charge utile construite par le formulaire est acceptée par le schéma', () => {
  const dossier = {
    nom: 'Dupont',
    prenom: 'Marie',
    dateNaissance: '1985-07-30',
    pays: 'BE',
    typeContrat: 'CDI',
    dateEntree: '2026-11-01',
  };

  it.each([
    ['isolé sans charge', form()],
    ['isolé, parent isolé, enfant handicapé', form({ enfantsCharge: '2', enfantsHandicapes: '1', parentIsole: true })],
    ['marié, conjoint sans revenus, conjoint handicapé', form({ situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL', conjointRevenus: 'SANS_REVENUS', conjointHandicape: true })],
    ['marié, deux revenus, attribution à préciser', form({ situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL', conjointRevenus: 'REVENUS', enfantsCharge: '1' })],
    ['marié, deux revenus, attribution choisie', form({ situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL', conjointRevenus: 'REVENU_LIMITE', enfantsCharge: '1', chargesFamilleAttribuees: 'oui' })],
    ['autres personnes à charge', form({ autresPersonnes: true, autresChargeDependantes66: '1', autresChargeHandicapees: '1', autresCharge: '1' })],
    ['choix puis retour à isolé', form({ conjointRevenus: 'REVENUS', conjointHandicape: true, chargesFamilleAttribuees: 'oui' })],
  ])('%s', (_nom, valeurs) => {
    const resultat = salarieModificationSchema.safeParse({ ...dossier, ...fiscalPayload(valeurs) });
    expect(resultat.success).toBe(true);
  });
});

describe('préremplissage depuis la fiche', () => {
  const salarie = {
    prenom: 'Marie',
    nom: 'Dupont',
    dateNaissance: new Date('1985-07-30'),
    email: null,
    adresse: null,
    codePostal: null,
    ville: null,
    pays: 'BE',
    typeContrat: 'CDI',
    dateEntree: new Date('2026-11-01'),
    dateFinContrat: null,
    situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
    conjointRevenus: 'PENSION_LIMITEE',
    beneficiaireHandicape: true,
    conjointHandicape: false,
    enfantsCharge: 3,
    enfantsHandicapes: 1,
    autresChargeDependantes66: 0,
    autresChargeHandicapees: 1,
    autresCharge: 0,
    parentIsole: false,
    chargesFamilleAttribuees: false,
  } as unknown as SalarieDetail;

  it('reprend la situation enregistrée, la case « autres personnes » s’ouvre si besoin', () => {
    expect(toFormValues(salarie)).toMatchObject({
      situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
      conjointRevenus: 'PENSION_LIMITEE',
      beneficiaireHandicape: true,
      enfantsCharge: '3',
      enfantsHandicapes: '1',
      autresPersonnes: true,
      autresChargeHandicapees: '1',
      chargesFamilleAttribuees: 'non',
    });
  });

  it('une réponse absente reste « à préciser »', () => {
    const vide = { ...salarie, conjointRevenus: null, chargesFamilleAttribuees: null } as SalarieDetail;
    expect(toFormValues(vide)).toMatchObject({ conjointRevenus: '', chargesFamilleAttribuees: '' });
  });

  it('ce que la fiche prérempli est accepté tel quel par le schéma', () => {
    const f = toFormValues(salarie);
    const resultat = salarieModificationSchema.safeParse({
      nom: f.nom,
      prenom: f.prenom,
      dateNaissance: f.dateNaissance,
      pays: f.pays,
      typeContrat: f.typeContrat,
      dateEntree: f.dateEntree,
      ...fiscalPayload(f),
    });
    expect(resultat.success).toBe(true);
  });
});
