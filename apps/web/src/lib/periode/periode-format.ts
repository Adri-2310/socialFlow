import { formatCents } from '@/lib/salarie/montant';
import type { PrestationInput } from '@/lib/schemas/prestation';

// Affichage et saisie des périodes et des prestations (D92). Les valeurs voyagent en entiers
// (demi-journées, minutes, centimes) ; l'écran parle en jours, en heures et en euros. Module pur,
// sans React : partagé par les pages serveur et les formulaires.

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export const libelleMois = (annee: number, mois: number) => `${MOIS[mois - 1]} ${annee}`;

// « 2026-11-20 » → « 20/11/2026 », sans passer par Date (aucun décalage de fuseau possible).
export function dateIsoEnFrancais(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
}

// Les jours : 3 demi-journées → « 1,5 ».
export const demiJoursEnTexte = (demiJours: number) => String(demiJours / 2).replace('.', ',');

// Texte saisi → demi-journées. Vide = 0. Un nombre qui n'est pas un multiple de 0,5, négatif ou
// illisible donne NaN : le schéma le refuse avec le code du champ.
export function texteEnDemiJours(texte: string): number {
  if (!texte.trim()) return 0;
  const jours = Number(texte.trim().replace(',', '.'));
  const demi = jours * 2;
  return Number.isFinite(jours) && Number.isInteger(demi) && demi >= 0 ? demi : Number.NaN;
}

// Les heures : 450 minutes → « 7:30 ».
export function minutesEnTexte(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

// « 7:30 » ou « 7,5 » → 450 minutes. Vide = null (l'appelant décide de la valeur par défaut).
// Illisible : NaN.
export function texteEnMinutes(texte: string): number | null {
  const t = texte.trim();
  if (!t) return null;
  const hms = /^(\d+):([0-5]\d)$/.exec(t);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]);
  const heures = Number(t.replace(',', '.'));
  return Number.isFinite(heures) && heures >= 0 ? Math.round(heures * 60) : Number.NaN;
}

// Les écarts d'un salarié en phrases courtes pour le tableau (rien : « mois complet »).
export function resumePrestation(p: PrestationInput): string[] {
  const lignes: string[] = [];
  if (p.heuresPresteesMinutes !== null) {
    lignes.push(`Heures prestées ${minutesEnTexte(p.heuresPresteesMinutes)}`);
  }
  if (p.congeDemiJours) lignes.push(`Congé ${demiJoursEnTexte(p.congeDemiJours)} j`);
  if (p.maladieDemiJours) lignes.push(`Maladie ${demiJoursEnTexte(p.maladieDemiJours)} j`);
  if (p.ferieDemiJours) lignes.push(`Férié ${demiJoursEnTexte(p.ferieDemiJours)} j`);
  if (p.absenceNonRemDemiJours) {
    lignes.push(`Absence non rémunérée ${demiJoursEnTexte(p.absenceNonRemDemiJours)} j`);
  }
  if (p.heuresSupMinutes) lignes.push(`Heures sup. ${minutesEnTexte(p.heuresSupMinutes)}`);
  if (p.primeCents !== null) {
    lignes.push(`Prime ${formatCents(p.primeCents)} (${p.primeLibelle})`);
  }
  return lignes;
}

export const ROLE_LABELS: Record<string, string> = {
  GESTIONNAIRE_RH: 'gestionnaire',
  ENTREPRISE_CLIENTE: 'entreprise',
};
