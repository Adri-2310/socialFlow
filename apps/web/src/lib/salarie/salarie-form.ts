import type { SalarieDetail } from '@/lib/salarie/salarie-data';

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
  situationFamiliale: 'ISOLE' | 'MARIE_OU_COHABITANT_LEGAL';
  conjointAvecRevenus: '' | 'oui' | 'non';
  personnesCharge: string;
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
  conjointAvecRevenus: '',
  personnesCharge: '0',
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
    conjointAvecRevenus:
      salarie.conjointAvecRevenus === null ? '' : salarie.conjointAvecRevenus ? 'oui' : 'non',
    personnesCharge: String(salarie.personnesCharge),
  };
}
