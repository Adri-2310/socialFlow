import { arrondirFraction } from './arrondi';
import type { ParametresJoursFeries } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import { formaterDuree } from './format';
import type { Centimes, DateIso, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// JOURS FÉRIÉS (modules/paie.md § 3, étape 8a, D107).
// Sources : loi du 4 janvier 1974 relative aux jours fériés (art. 6 : un jour férié tombant un
// dimanche ou un jour d'inactivité est remplacé ; art. 14 : le droit à la rémunération) et arrêté
// royal du 18 avril 1974 (art. 1 : les dix jours ; art. 2 et 3 : la rémunération ; art. 10 et 11 :
// l'absence injustifiée ; art. 12 : le maintien du droit pendant une suspension du contrat).
// La liste des jours et les durées de maintien viennent du bloc `joursFeries` du barème.
//
// En clair :
//   - il y a dix jours fériés par an ; sept ont une date fixe, trois dépendent de Pâques ;
//   - un ouvrier payé à l'heure n'est pas payé les jours où il ne travaille pas. Pour un jour férié
//     il garde pourtant son salaire : taux horaire x heures qu'il aurait prestées ce jour-là ;
//   - il le perd s'il s'est absenté SANS justification le jour d'activité qui précède ou suit ;
//   - pendant une suspension du contrat (maladie, congé de maternité...), le droit est conservé
//     durant 30 jours (14 jours pour une autre suspension) ;
//   - un employé payé au mois n'a rien à ajouter : son salaire mensuel couvre déjà les jours fériés.
//
// Limites de la v1 (D107) : primes à la moyenne horaire (art. 3), commissions (art. 8), travail à la
// pièce (art. 4 et 5), temps partiel à horaire variable (art. 4 § 2), chômage temporaire (art. 13) et
// arrêtés propres à certaines branches d'activité ne sont pas gérés.

// Pâques (calendrier grégorien), algorithme de Meeus/Jones/Butcher : uniquement des divisions
// entières, donc aucun flottant et aucune horloge. Renvoie le mois (1-12) et le jour du mois.
// Exemple à la main, 2026 : a = 12, h = 12, l = 2, m = 0, mois = 4, jour = 5 -> 5 avril 2026.
export function paques(annee: number): { mois: number; jour: number } {
  exigerEntier("L'année", annee, 1583, 4099); // l'algorithme vaut pour le calendrier grégorien
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return { mois, jour };
}

const estBissextile = (annee: number) =>
  (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;

function joursDuMois(annee: number, mois: number): number {
  if (mois === 2) return estBissextile(annee) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

// Ajoute des jours à une date, en avançant mois par mois (au plus quelques mois ici).
function ajouterJours(annee: number, mois: number, jour: number, jours: number) {
  let m = mois;
  let j = jour + jours;
  while (j > joursDuMois(annee, m)) {
    j -= joursDuMois(annee, m);
    m += 1; // les jours fériés mobiles restent largement avant décembre
  }
  return { mois: m, jour: j };
}

const iso = (annee: number, mois: number, jour: number): DateIso =>
  `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;

// Les jours fériés légaux d'une année civile, dans l'ordre chronologique (dates AAAA-MM-JJ).
// Exemple : 2026 -> 01-01, 06-04 (lundi de Pâques), 01-05, 14-05 (Ascension), 25-05 (lundi de
// Pentecôte), 21-07, 15-08, 01-11, 11-11, 25-12.
export function joursFeriesDeLAnnee(annee: number, bloc: ParametresJoursFeries): DateIso[] {
  const p = paques(annee);
  const dates = [
    ...bloc.fixes.map((f) => iso(annee, f.mois, f.jour)),
    ...bloc.apresPaques.map((decalage) => {
      const d = ajouterJours(annee, p.mois, p.jour, decalage);
      return iso(annee, d.mois, d.jour);
    }),
  ];
  return dates.sort();
}

// Les jours fériés d'un mois (1-12) : sert à proposer ceux qu'il faut rémunérer ce mois-là.
export function joursFeriesDuMois(
  annee: number,
  mois: number,
  bloc: ParametresJoursFeries,
): DateIso[] {
  exigerEntier('Le mois', mois, 1, 12);
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}-`;
  return joursFeriesDeLAnnee(annee, bloc).filter((d) => d.startsWith(prefixe));
}

// Suspension du contrat en cours le jour férié (art. 12 de l'arrêté royal du 18 avril 1974) :
//   - MALADIE_ACCIDENT_MATERNITE_GREVE : maladie, accident, accident du travail, maladie
//     professionnelle, congé de grossesse ou d'accouchement, grève ou lock-out (art. 12, 3°) ;
//   - AUTRE : les autres suspensions légales et la force majeure temporaire (art. 12, 4°) ;
//   - VACANCES : vacances annuelles ou rappel sous les armes, droit conservé sans limite (art. 12, 1° et 2°).
export type TypeSuspension = 'MALADIE_ACCIDENT_MATERNITE_GREVE' | 'AUTRE' | 'VACANCES';

export interface JourFerieOuvrier {
  // Le jour férié lui-même, ou le jour de remplacement fixé par l'entreprise (loi, art. 6).
  date: DateIso;
  // 'FERIE' : la date doit être l'un des jours fériés légaux ; 'REMPLACEMENT' : jour habituel
  // d'activité mis à la place d'un jour férié tombé un dimanche ou un jour d'inactivité.
  nature: 'FERIE' | 'REMPLACEMENT';
  // Durée que l'ouvrier aurait prestée ce jour-là si c'était un jour ouvrable (D96 : minutes).
  minutesPerdues: number;
  // Art. 10 : absent SANS justification le jour d'activité qui précède ou suit ce jour. Les
  // absences justifiées sont listées à l'art. 11 ; c'est à l'appelant d'en juger.
  absenceInjustifieeAutour: boolean;
  // Si le contrat est suspendu ce jour-là : le type, et le nombre de jours calendrier depuis le
  // premier jour de la suspension (compris : le premier jour vaut 1) jusqu'au jour férié (compris).
  suspension: { type: TypeSuspension; joursDepuisDebut: number } | null;
}

export interface EntreeJoursFeriesOuvrier {
  tauxHoraireCentimes: Centimes;
  annee: number;
  jours: JourFerieOuvrier[];
}

export interface JourSansDroit {
  date: DateIso;
  motif: 'ABSENCE_INJUSTIFIEE' | 'SUSPENSION_TROP_LONGUE';
}

export interface ResultatJoursFeriesOuvrier {
  montant: Centimes; // à ajouter au brut de l'ouvrier
  lignes: LigneCalcul[];
  joursSansDroit: JourSansDroit[]; // pour expliquer pourquoi un jour n'est pas payé
}

// Ouvrier payé à l'heure (art. 3) : montant = taux horaire x heures perdues, arrondi au cent.
// Exemple à la main : 15,00 €/h, journée de 7 h 36 (456 minutes) : 1 500 x 456 / 60 = 11 400
// centimes = 114,00 €.
export function calculerJoursFeriesOuvrier(
  entree: EntreeJoursFeriesOuvrier,
  bloc: ParametresJoursFeries,
): ResultatJoursFeriesOuvrier {
  const taux = exigerEntier('Le taux horaire', entree.tauxHoraireCentimes, 1, BORNES.montantMax);
  const legaux = new Set(joursFeriesDeLAnnee(entree.annee, bloc));

  const lignes: LigneCalcul[] = [];
  const joursSansDroit: JourSansDroit[] = [];
  let montant = 0;
  const vus = new Set<DateIso>();

  for (const jour of entree.jours) {
    // Le même jour deux fois serait payé deux fois : refusé.
    if (vus.has(jour.date)) {
      throw new ErreurMoteur('JOUR_FERIE_EN_DOUBLE', `Le jour ${jour.date} est listé deux fois.`);
    }
    vus.add(jour.date);
    // Un « jour férié » qui n'en est pas un ne doit jamais être payé en silence.
    if (jour.nature === 'FERIE' && !legaux.has(jour.date)) {
      throw new ErreurMoteur(
        'JOUR_FERIE_INCONNU',
        `Le ${jour.date} n'est pas un jour férié légal : utiliser un jour de remplacement.`,
      );
    }
    const minutes = exigerEntier(
      'Les heures perdues un jour férié',
      jour.minutesPerdues,
      0,
      BORNES.minutesDansUnJourMax,
    );

    // Droit à la rémunération : pendant une suspension, c'est l'art. 12 qui décide ; sinon, c'est
    // l'art. 10 (l'absence injustifiée autour du jour férié fait perdre le droit).
    let droit = true;
    let motif: JourSansDroit['motif'] = 'ABSENCE_INJUSTIFIEE';
    if (jour.suspension !== null) {
      const duree = exigerEntier(
        'Les jours de suspension',
        jour.suspension.joursDepuisDebut,
        1,
        BORNES.joursSuspensionMax,
      );
      if (jour.suspension.type === 'MALADIE_ACCIDENT_MATERNITE_GREVE') {
        droit = duree <= bloc.maintienMaladieJours;
      } else if (jour.suspension.type === 'AUTRE') {
        droit = duree <= bloc.maintienAutreSuspensionJours;
      }
      motif = 'SUSPENSION_TROP_LONGUE';
    } else if (jour.absenceInjustifieeAutour) {
      droit = false;
    }

    if (!droit) {
      joursSansDroit.push({ date: jour.date, motif });
      continue;
    }
    const montantJour = arrondirFraction(taux * minutes, 60);
    if (montantJour === 0) continue; // rien à payer (journée sans heures) : pas de ligne vide
    lignes.push({
      code: 'JOUR_FERIE',
      libelle: `${jour.nature === 'FERIE' ? 'Jour férié' : 'Jour de remplacement'} ${jour.date} : ${formaterDuree(minutes)}`,
      base: taux,
      taux: null,
      montant: montantJour,
    });
    montant += montantJour;
  }
  return { montant, lignes, joursSansDroit };
}
