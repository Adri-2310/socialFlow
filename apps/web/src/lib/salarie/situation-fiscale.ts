// Situation fiscale du salarié pour le précompte professionnel (D95, Annexe III 2026).
// Des critères seulement : aucun montant ni seuil ici, ils iront dans BaremeVersion (G2a).
// Partagé par le schéma Zod et le formulaire pour que l'écran ne propose que ce que
// le serveur accepte.

export const SITUATIONS_FAMILIALES = ['ISOLE', 'MARIE_OU_COHABITANT_LEGAL'] as const;

// Revenus professionnels propres du conjoint (n° 11, 32-34 et 40 de l'Annexe III).
export const REVENUS_CONJOINT = [
  'SANS_REVENUS',
  'PENSION_TRES_LIMITEE', // n° 33 : traité comme sans revenus propres
  'PENSION_LIMITEE', // n° 40.3
  'REVENU_LIMITE', // n° 40.2
  'REVENUS',
] as const;

export type RevenusConjoint = (typeof REVENUS_CONJOINT)[number];

// Le n° 33 assimile le conjoint à pensions très limitées à un conjoint sans revenus propres.
const SANS_REVENUS_PROPRES: readonly RevenusConjoint[] = ['SANS_REVENUS', 'PENSION_TRES_LIMITEE'];

export const REVENUS_CONJOINT_LIBELLES: Record<RevenusConjoint, string> = {
  SANS_REVENUS: 'Sans revenus professionnels propres',
  PENSION_TRES_LIMITEE: 'Uniquement une pension ou une rente très limitée (n° 33)',
  PENSION_LIMITEE: 'Uniquement une pension ou une rente limitée (n° 40.3)',
  REVENU_LIMITE: 'Un revenu professionnel limité (n° 40.2)',
  REVENUS: 'Des revenus professionnels',
};

export type SituationFiscale = {
  situationFamiliale: (typeof SITUATIONS_FAMILIALES)[number];
  conjointRevenus?: RevenusConjoint | null;
  enfantsCharge: number;
  autresChargeDependantes66: number;
  autresChargeHandicapees: number;
  autresCharge: number;
};

export const estMarie = (s: Pick<SituationFiscale, 'situationFamiliale'>) =>
  s.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL';

// Section 2 du barème (n° 34) : le conjoint n'a pas de revenus propres, ou seulement une
// pension très limitée (n° 33). Seul cas où le handicap du conjoint se saisit ici (n° 41) ;
// sinon le conjoint le déclare dans son propre dossier.
export const conjointSansRevenusPropres = (s: SituationFiscale) =>
  estMarie(s) && !!s.conjointRevenus && SANS_REVENUS_PROPRES.includes(s.conjointRevenus);

export const conjointAvecRevenusPropres = (s: SituationFiscale) =>
  estMarie(s) && !!s.conjointRevenus && !SANS_REVENUS_PROPRES.includes(s.conjointRevenus);

export const totalCharges = (s: SituationFiscale) =>
  s.enfantsCharge + s.autresChargeDependantes66 + s.autresChargeHandicapees + s.autresCharge;

// n° 6 : quand les deux conjoints ont des revenus, le couple choisit celui qui reçoit les
// réductions pour charges de famille. La question n'a de sens que pour un marié dont le
// conjoint a des revenus propres, et seulement s'il y a des charges à attribuer.
export const attributionDesCharges = (s: SituationFiscale) =>
  conjointAvecRevenusPropres(s) && totalCharges(s) > 0;

// n° 40.1 : veuf, père ou mère célibataire, parent divorcé ou séparé, avec enfants à charge.
// Ces situations sont celles d'un isolé (n° 4.2).
export const parentIsolePossible = (s: SituationFiscale) =>
  s.situationFamiliale === 'ISOLE' && s.enfantsCharge > 0;

// Ce que la fiche du dossier affiche (D95) : seulement les lignes qui ont un sens pour cette
// situation. Une valeur nulle s'affiche « — » : c'est le cas d'une réponse à préciser.
export type DossierFiscal = SituationFiscale & {
  beneficiaireHandicape: boolean;
  conjointHandicape: boolean;
  enfantsHandicapes: number;
  parentIsole: boolean;
  chargesFamilleAttribuees: boolean | null;
};

const ouiNon = (valeur: boolean) => (valeur ? 'Oui' : 'Non');
const pluriel = (n: number, singulier: string, plur: string) => `${n} ${n > 1 ? plur : singulier}`;

export function lignesSituationFiscale(
  s: DossierFiscal,
  situationLibelle: string,
): { label: string; value: string | null }[] {
  const lignes: { label: string; value: string | null }[] = [
    { label: 'Situation familiale', value: situationLibelle },
  ];
  if (estMarie(s)) {
    const revenus = s.conjointRevenus as RevenusConjoint | null | undefined;
    lignes.push({
      label: 'Revenus du conjoint ou cohabitant',
      value: revenus ? REVENUS_CONJOINT_LIBELLES[revenus] : null,
    });
  }
  lignes.push({ label: 'Salarié handicapé', value: ouiNon(s.beneficiaireHandicape) });
  if (conjointSansRevenusPropres(s)) {
    lignes.push({ label: 'Conjoint handicapé', value: ouiNon(s.conjointHandicape) });
  }
  lignes.push({
    label: 'Enfants à charge',
    value:
      s.enfantsHandicapes > 0
        ? `${s.enfantsCharge}, dont ${pluriel(s.enfantsHandicapes, 'handicapé', 'handicapés')}`
        : String(s.enfantsCharge),
  });
  if (parentIsolePossible(s)) {
    lignes.push({ label: 'Parent isolé', value: ouiNon(s.parentIsole) });
  }
  if (s.autresChargeDependantes66 + s.autresChargeHandicapees + s.autresCharge > 0) {
    lignes.push({
      label: 'Autres personnes à charge',
      value: [
        s.autresChargeDependantes66 > 0 &&
          pluriel(s.autresChargeDependantes66, 'dépendante de 66 ans ou plus', 'dépendantes de 66 ans ou plus'),
        s.autresChargeHandicapees > 0 &&
          pluriel(s.autresChargeHandicapees, 'handicapée', 'handicapées'),
        s.autresCharge > 0 && pluriel(s.autresCharge, 'autre', 'autres'),
      ]
        .filter(Boolean)
        .join(', '),
    });
  }
  if (attributionDesCharges(s)) {
    lignes.push({
      label: 'Réductions pour charges de famille',
      value:
        s.chargesFamilleAttribuees === null
          ? null
          : s.chargesFamilleAttribuees
            ? 'Reçues par ce salarié'
            : 'Reçues par son conjoint ou cohabitant',
    });
  }
  return lignes;
}
