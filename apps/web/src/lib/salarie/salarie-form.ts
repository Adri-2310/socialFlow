import type { SalarieDetail } from '@/lib/salarie/salarie-data';
import {
  attributionDesCharges,
  conjointSansRevenusPropres,
  estMarie,
  parentIsolePossible,
  type RevenusConjoint,
  type SituationFiscale,
} from '@/lib/salarie/situation-fiscale';

// Valeurs d'un formulaire de dossier salarié : tout en chaînes, comme les champs de saisie.
// Partagé entre le formulaire (composant client) et la page qui le préremplit (serveur).
export type FormValues = {
  prenom: string;
  nom: string;
  dateNaissance: string;
  niss: string;
  iban: string;
  email: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  statut: 'EMPLOYE' | 'OUVRIER';
  typeContrat: 'CDI' | 'CDD';
  dateEntree: string;
  dateFinContrat: string;
  fonction: string;
  regime: 'TEMPS_PLEIN' | 'TEMPS_PARTIEL';
  heuresSemaine: string;
  heuresReference: string;
  salaire: string; // en euros : mensuel pour un employé, horaire pour un ouvrier
  // Situation fiscale (D95) : les cases et les listes ne montrent que ce qui est utile.
  situationFamiliale: 'ISOLE' | 'MARIE_OU_COHABITANT_LEGAL';
  conjointRevenus: '' | RevenusConjoint;
  beneficiaireHandicape: boolean;
  conjointHandicape: boolean;
  enfantsCharge: string;
  enfantsHandicapes: string;
  // Case « d'autres personnes à charge » : elle ouvre les trois compteurs qui suivent.
  autresPersonnes: boolean;
  autresChargeDependantes66: string;
  autresChargeHandicapees: string;
  autresCharge: string;
  parentIsole: boolean;
  chargesFamilleAttribuees: '' | 'oui' | 'non';
};

export const INITIAL: FormValues = {
  prenom: '',
  nom: '',
  dateNaissance: '',
  niss: '',
  iban: '',
  email: '',
  adresse: '',
  codePostal: '',
  ville: '',
  pays: 'BE',
  statut: 'EMPLOYE',
  typeContrat: 'CDI',
  dateEntree: '',
  dateFinContrat: '',
  fonction: '',
  regime: 'TEMPS_PLEIN',
  heuresSemaine: '',
  heuresReference: '',
  salaire: '',
  situationFamiliale: 'ISOLE',
  conjointRevenus: '',
  beneficiaireHandicape: false,
  conjointHandicape: false,
  enfantsCharge: '0',
  enfantsHandicapes: '0',
  autresPersonnes: false,
  autresChargeDependantes66: '0',
  autresChargeHandicapees: '0',
  autresCharge: '0',
  parentIsole: false,
  chargesFamilleAttribuees: '',
};

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '');

// Préremplit le formulaire de modification depuis la fiche. NISS et IBAN restent vides :
// leur clair ne sort que par le dévoilement journalisé (roles/03 § 4.1) ; vide = inchangé.
// Les conditions de travail (statut, fonction, régime, rémunération) ne se modifient pas ici.
export function toFormValues(salarie: SalarieDetail): FormValues {
  return {
    ...INITIAL,
    prenom: salarie.prenom,
    nom: salarie.nom,
    dateNaissance: iso(salarie.dateNaissance),
    email: salarie.email ?? '',
    adresse: salarie.adresse ?? '',
    codePostal: salarie.codePostal ?? '',
    ville: salarie.ville ?? '',
    pays: salarie.pays,
    typeContrat: salarie.typeContrat as FormValues['typeContrat'],
    dateEntree: iso(salarie.dateEntree),
    dateFinContrat: iso(salarie.dateFinContrat),
    situationFamiliale: salarie.situationFamiliale as FormValues['situationFamiliale'],
    conjointRevenus: (salarie.conjointRevenus ?? '') as FormValues['conjointRevenus'],
    beneficiaireHandicape: salarie.beneficiaireHandicape,
    conjointHandicape: salarie.conjointHandicape,
    enfantsCharge: String(salarie.enfantsCharge),
    enfantsHandicapes: String(salarie.enfantsHandicapes),
    autresPersonnes:
      salarie.autresChargeDependantes66 + salarie.autresChargeHandicapees + salarie.autresCharge > 0,
    autresChargeDependantes66: String(salarie.autresChargeDependantes66),
    autresChargeHandicapees: String(salarie.autresChargeHandicapees),
    autresCharge: String(salarie.autresCharge),
    parentIsole: salarie.parentIsole,
    chargesFamilleAttribuees:
      salarie.chargesFamilleAttribuees === null
        ? ''
        : salarie.chargesFamilleAttribuees
          ? 'oui'
          : 'non',
  };
}

// Un compteur vide vaut zéro ; une saisie illisible devient NaN et le schéma la refuse.
const compteur = (valeur: string) => (valeur.trim() ? Number(valeur) : 0);
const entier = (valeur: string) => (Number.isFinite(compteur(valeur)) ? compteur(valeur) : 0);

// Ce que la saisie en cours permet de demander (D95) : sert à masquer les questions sans objet
// et à ne pas envoyer de valeur restée d'un choix précédent.
export function vueFiscale(f: FormValues): SituationFiscale {
  return {
    situationFamiliale: f.situationFamiliale,
    conjointRevenus: f.conjointRevenus || null,
    enfantsCharge: entier(f.enfantsCharge),
    autresChargeDependantes66: f.autresPersonnes ? entier(f.autresChargeDependantes66) : 0,
    autresChargeHandicapees: f.autresPersonnes ? entier(f.autresChargeHandicapees) : 0,
    autresCharge: f.autresPersonnes ? entier(f.autresCharge) : 0,
  };
}

export function fiscalPayload(f: FormValues) {
  const vue = vueFiscale(f);
  return {
    situationFamiliale: f.situationFamiliale,
    conjointRevenus: estMarie(vue) && f.conjointRevenus ? f.conjointRevenus : undefined,
    beneficiaireHandicape: f.beneficiaireHandicape,
    conjointHandicape: conjointSansRevenusPropres(vue) ? f.conjointHandicape : false,
    enfantsCharge: compteur(f.enfantsCharge),
    enfantsHandicapes: vue.enfantsCharge > 0 ? compteur(f.enfantsHandicapes) : 0,
    autresChargeDependantes66: f.autresPersonnes ? compteur(f.autresChargeDependantes66) : 0,
    autresChargeHandicapees: f.autresPersonnes ? compteur(f.autresChargeHandicapees) : 0,
    autresCharge: f.autresPersonnes ? compteur(f.autresCharge) : 0,
    parentIsole: parentIsolePossible(vue) ? f.parentIsole : false,
    chargesFamilleAttribuees:
      attributionDesCharges(vue) && f.chargesFamilleAttribuees
        ? f.chargesFamilleAttribuees === 'oui'
        : undefined,
  };
}
