import { parseEurosToCents } from '@/lib/salarie/montant';

// Colonnes du CSV d'import et conversion d'une ligne en corps de création (roles/03 § 4.1).
// Fonction pure : le texte entre, le corps que `salarieSchema` valide sort. Les règles métier
// restent celles de la création manuelle : ce fichier ne fait que traduire des saisies
// françaises (dates JJ/MM/AAAA, montants avec virgule, « oui » / « non »).

export const COLONNES = [
  { nom: 'prenom', champ: 'prenom', obligatoire: true },
  { nom: 'nom', champ: 'nom', obligatoire: true },
  { nom: 'niss', champ: 'niss', obligatoire: true },
  { nom: 'date_naissance', champ: 'dateNaissance', obligatoire: true },
  { nom: 'iban', champ: 'iban', obligatoire: true },
  { nom: 'email', champ: 'email', obligatoire: false },
  { nom: 'adresse', champ: 'adresse', obligatoire: false },
  { nom: 'code_postal', champ: 'codePostal', obligatoire: false },
  { nom: 'ville', champ: 'ville', obligatoire: false },
  { nom: 'pays', champ: 'pays', obligatoire: false },
  { nom: 'statut', champ: 'statut', obligatoire: true },
  { nom: 'type_contrat', champ: 'typeContrat', obligatoire: true },
  { nom: 'date_entree', champ: 'dateEntree', obligatoire: true },
  { nom: 'date_fin_contrat', champ: 'dateFinContrat', obligatoire: false },
  { nom: 'fonction', champ: 'fonction', obligatoire: true },
  { nom: 'regime', champ: 'regime', obligatoire: true },
  { nom: 'heures_semaine', champ: 'heuresSemaine', obligatoire: false },
  { nom: 'heures_reference', champ: 'heuresReference', obligatoire: false },
  // Mensuel pour un employé, horaire pour un ouvrier (voir le statut).
  { nom: 'salaire', champ: 'salaire', obligatoire: true },
  { nom: 'situation_familiale', champ: 'situationFamiliale', obligatoire: true },
  { nom: 'revenus_conjoint', champ: 'conjointAvecRevenus', obligatoire: false },
  { nom: 'personnes_charge', champ: 'personnesCharge', obligatoire: false },
] as const;

export type NomColonne = (typeof COLONNES)[number]['nom'];

// « Date de naissance », « date-naissance » et « DATE_NAISSANCE » désignent la même colonne.
export function normaliserEntete(entete: string): string {
  return entete
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Façons naturelles d'écrire un en-tête dans Excel, une fois normalisées (« Date de naissance »
// devient date_de_naissance). Sans cette table, le gestionnaire devrait deviner les noms du modèle.
const ALIAS: Record<string, NomColonne> = {
  date_de_naissance: 'date_naissance',
  type_de_contrat: 'type_contrat',
  date_d_entree: 'date_entree',
  date_de_fin_contrat: 'date_fin_contrat',
  date_de_fin_du_contrat: 'date_fin_contrat',
  date_de_fin_du_cdd: 'date_fin_contrat',
  heures_par_semaine: 'heures_semaine',
  heures_de_reference: 'heures_reference',
  revenus_du_conjoint: 'revenus_conjoint',
  personnes_a_charge: 'personnes_charge',
  salaire_brut: 'salaire',
};

const NOMS = new Set<string>(COLONNES.map((c) => c.nom));

// La colonne du modèle que désigne un en-tête du fichier, ou null s'il n'en désigne aucune.
export function resoudreColonne(entete: string): NomColonne | null {
  const nom = normaliserEntete(entete);
  if (NOMS.has(nom)) return nom as NomColonne;
  return ALIAS[nom] ?? null;
}

// Nom de la colonne du fichier qui a produit une erreur sur un champ du schéma. Le salaire et
// la commission paritaire (déduite du statut) n'ont pas de champ propre dans le fichier.
const COLONNE_DU_CHAMP: Record<string, NomColonne> = {
  salaireMensuelBrutCents: 'salaire',
  salaireHoraireBrutCents: 'salaire',
  commissionParitaire: 'statut',
  ...Object.fromEntries(COLONNES.map((c) => [c.champ, c.nom])),
};

export function colonneDuChamp(champ: string): NomColonne | null {
  return COLONNE_DU_CHAMP[champ] ?? null;
}

const vide = (valeur: string | undefined) => (valeur ?? '').trim() === '';
const texte = (valeur: string | undefined) => (vide(valeur) ? undefined : (valeur ?? '').trim());
const cle = (valeur: string | undefined) => normaliserEntete(valeur ?? '');

// JJ/MM/AAAA (ou J/M/AAAA) et AAAA-MM-JJ → AAAA-MM-JJ, si la date existe vraiment. Une saisie
// illisible est rendue telle quelle : le schéma la refuse avec le code du champ.
export function lireDate(valeur: string | undefined): string | undefined {
  const brut = texte(valeur);
  if (!brut) return undefined;
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(brut);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut);
  const morceaux = fr
    ? { annee: fr[3], mois: fr[2], jour: fr[1] }
    : iso
      ? { annee: iso[1], mois: iso[2], jour: iso[3] }
      : null;
  if (!morceaux) return brut;
  const { annee, mois, jour } = morceaux;
  const date = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  const existe =
    date.getUTCFullYear() === Number(annee) &&
    date.getUTCMonth() === Number(mois) - 1 &&
    date.getUTCDate() === Number(jour);
  return existe ? `${annee}-${mois.padStart(2, '0')}-${jour.padStart(2, '0')}` : brut;
}

const nombre = (valeur: string | undefined) => {
  const brut = texte(valeur);
  return brut === undefined ? undefined : Number(brut.replace(',', '.'));
};

const STATUTS: Record<string, string> = {
  employe: 'EMPLOYE',
  ouvrier: 'OUVRIER',
};
const REGIMES: Record<string, string> = {
  temps_plein: 'TEMPS_PLEIN',
  plein: 'TEMPS_PLEIN',
  temps_partiel: 'TEMPS_PARTIEL',
  partiel: 'TEMPS_PARTIEL',
};
const SITUATIONS: Record<string, string> = {
  isole: 'ISOLE',
  marie: 'MARIE_OU_COHABITANT_LEGAL',
  cohabitant_legal: 'MARIE_OU_COHABITANT_LEGAL',
  marie_ou_cohabitant_legal: 'MARIE_OU_COHABITANT_LEGAL',
};
const BOOLEENS: Record<string, boolean> = {
  oui: true,
  non: false,
  true: true,
  false: false,
  '1': true,
  '0': false,
};

// Une saisie inconnue est rendue en majuscules : l'énumération du schéma la refuse avec le
// code du champ, sans que ce fichier ait à connaître le message.
const traduire = (table: Record<string, string>, valeur: string | undefined) => {
  const brut = texte(valeur);
  if (brut === undefined) return undefined;
  return table[cle(brut)] ?? brut.toUpperCase();
};

// Une ligne du fichier (une valeur par colonne) → le corps que `salarieSchema` attend.
export function ligneVersCorps(ligne: Partial<Record<NomColonne, string>>) {
  const statut = traduire(STATUTS, ligne.statut);
  const typeContrat = texte(ligne.type_contrat)?.toUpperCase();
  // Même règle que le formulaire : le salaire est mensuel pour un employé, horaire pour un ouvrier.
  const centimes = vide(ligne.salaire)
    ? undefined
    : (parseEurosToCents(ligne.salaire ?? '') ?? Number.NaN);
  const revenus = texte(ligne.revenus_conjoint);

  return {
    prenom: ligne.prenom ?? '',
    nom: ligne.nom ?? '',
    niss: ligne.niss ?? '',
    dateNaissance: lireDate(ligne.date_naissance),
    iban: ligne.iban ?? '',
    email: texte(ligne.email),
    adresse: texte(ligne.adresse),
    codePostal: texte(ligne.code_postal),
    ville: texte(ligne.ville),
    pays: texte(ligne.pays),
    statut,
    typeContrat,
    dateEntree: lireDate(ligne.date_entree),
    dateFinContrat: lireDate(ligne.date_fin_contrat),
    // D44 : CP 200 pour les employés, CP 100 pour les ouvriers.
    commissionParitaire: statut === 'EMPLOYE' ? '200' : statut === 'OUVRIER' ? '100' : undefined,
    fonction: ligne.fonction ?? '',
    regime: traduire(REGIMES, ligne.regime),
    heuresSemaine: nombre(ligne.heures_semaine),
    heuresReference: nombre(ligne.heures_reference),
    salaireMensuelBrutCents: statut === 'EMPLOYE' ? centimes : undefined,
    salaireHoraireBrutCents: statut === 'OUVRIER' ? centimes : undefined,
    situationFamiliale: traduire(SITUATIONS, ligne.situation_familiale),
    conjointAvecRevenus:
      revenus === undefined ? undefined : (BOOLEENS[cle(revenus)] ?? (revenus as unknown)),
    // Colonne facultative : une cellule vide vaut 0, comme le champ du formulaire.
    personnesCharge: vide(ligne.personnes_charge) ? 0 : nombre(ligne.personnes_charge),
  };
}

// Le modèle téléchargeable : en-tête et une ligne d'exemple fictive, au séparateur d'Excel en
// français, avec le BOM qui lui fait lire l'UTF-8 (accents).
export function modeleCsv(): string {
  const exemple: Record<NomColonne, string> = {
    prenom: 'Marie',
    nom: 'Dupont',
    niss: '85.07.30-033.28',
    date_naissance: '30/07/1985',
    iban: 'BE68 5390 0754 7034',
    email: 'marie.dupont@exemple.be',
    adresse: 'Rue de la Loi 16',
    code_postal: '1000',
    ville: 'Bruxelles',
    pays: 'BE',
    statut: 'employé',
    type_contrat: 'CDI',
    date_entree: '01/11/2026',
    date_fin_contrat: '',
    fonction: 'Comptable',
    regime: 'temps plein',
    heures_semaine: '',
    heures_reference: '',
    salaire: '2850,00',
    situation_familiale: 'isolé',
    revenus_conjoint: '',
    personnes_charge: '0',
  };
  const ligne = (valeurs: string[]) => valeurs.join(';');
  return `﻿${ligne(COLONNES.map((c) => c.nom))}\r\n${ligne(COLONNES.map((c) => exemple[c.nom]))}\r\n`;
}
