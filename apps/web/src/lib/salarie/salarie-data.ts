import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { DecryptionError } from '@/lib/crypto/field-encryption';
import { dechiffrerSalarie } from '@/lib/salarie/salarie-crypto';
import { maskIban, maskNiss } from '@/lib/crypto/masking';
import { prisma } from '@/lib/prisma';
import { conditionEnVigueur } from '@/lib/salarie/conditions';
import { etatPortail, type EtatPortail } from '@/lib/salarie/portail';

// Lectures du Gestionnaire RH (roles/03 § 2 et § 4). Règle de FONCTIONNEMENT § 4 :
// chaque fonction reçoit le périmètre calculé par resolveScope, jamais un
// cabinetId ou une liste d'entreprises venus du client. Hors périmètre, on ne
// distingue pas « inexistant » de « interdit » : null ou liste vide (404).

export type EntrepriseAvecEffectif = {
  id: string;
  name: string;
  vatNumber: string;
  city: string | null;
  salariesActifs: number;
};

export type SalarieRow = {
  id: string;
  nom: string;
  prenom: string;
  // Toujours masqué ici : le clair ne sort que par la route de dévoilement, journalisée.
  nissMasque: string;
  fonction: string | null;
  statut: string | null;
  dateEntree: Date;
  dateSortie: Date | null;
};

// Entreprises assignées au gestionnaire (non archivées), avec le nombre de salariés actifs.
export async function getEntreprisesAvecEffectif(scope: Scope): Promise<EntrepriseAvecEffectif[]> {
  if (scope.kind !== 'entreprises') return [];

  const entreprises = await prisma.entreprise.findMany({
    where: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      vatNumber: true,
      city: true,
      _count: { select: { salaries: { where: { deletedAt: null } } } },
    },
  });

  return entreprises.map(({ _count, ...e }) => ({ ...e, salariesActifs: _count.salaries }));
}

// Le NISS est déchiffré uniquement pour être masqué aussitôt. Une valeur
// illisible ne doit pas faire tomber toute la liste : elle s'affiche masquée
// en entier (une erreur de clé, elle, remonte).
function masquerNiss(salarieId: string, nissEncrypted: string): string {
  try {
    return maskNiss(dechiffrerSalarie(salarieId, 'niss', nissEncrypted));
  } catch (error) {
    if (error instanceof DecryptionError) return maskNiss('');
    throw error;
  }
}

// L'entreprise si elle est dans le périmètre du gestionnaire, sinon null (non assignée,
// archivée, autre cabinet, inconnue : le 404 ne distingue pas ces cas).
export async function findEntrepriseInScope(
  scope: Scope,
  entrepriseId: string,
): Promise<{ id: string; name: string } | null> {
  if (scope.kind !== 'entreprises') return null;
  return prisma.entreprise.findFirst({
    // AND et non une fusion d'objets : entrepriseWhere(scope) pose déjà un filtre sur `id`
    // (les entreprises assignées), qu'un `id` ajouté à côté écraserait.
    where: { AND: [entrepriseWhere(scope), { id: entrepriseId, deletedAt: null }] },
    select: { id: true, name: true },
  });
}

// Le dossier actif si son entreprise est dans le périmètre du gestionnaire, sinon null
// (non assigné, archivé, autre cabinet, inexistant : le 404 ne distingue pas ces cas).
export async function findSalarieInScope(
  scope: Scope,
  salarieId: string,
  // Les actions d'archivage et de restauration visent aussi un dossier archivé.
  options: { includeArchived?: boolean } = {},
): Promise<{ id: string; entrepriseId: string } | null> {
  if (scope.kind !== 'entreprises') return null;
  return prisma.salarie.findFirst({
    where: {
      id: salarieId,
      cabinetId: scope.cabinetId,
      ...(options.includeArchived ? {} : { deletedAt: null }),
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: { id: true, entrepriseId: true },
  });
}

// Salariés actifs d'une entreprise du périmètre, ou null si l'entreprise n'y est pas
// (non assignée, archivée, d'un autre cabinet, inexistante).
export async function getSalariesEntreprise(
  scope: Scope,
  entrepriseId: string,
  at: Date = new Date(),
  // `archives` : liste les dossiers archivés au lieu des dossiers actifs (roles/03 § 4.2).
  options: { archives?: boolean } = {},
): Promise<{
  entreprise: { id: string; name: string };
  salaries: SalarieRow[];
  // Toujours le nombre de dossiers archivés, pour l'onglet « Archivés ».
  nbArchives: number;
} | null> {
  if (scope.kind !== 'entreprises') return null;

  const entreprise = await findEntrepriseInScope(scope, entrepriseId);
  if (!entreprise) return null;

  const salaries = await prisma.salarie.findMany({
    // cabinetId redondant avec l'entreprise, mais toute table métier est filtrée par tenant.
    where: {
      cabinetId: scope.cabinetId,
      entrepriseId: entreprise.id,
      deletedAt: options.archives ? { not: null } : null,
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: {
      id: true,
      nom: true,
      prenom: true,
      nissEncrypted: true,
      dateEntree: true,
      dateSortie: true,
      conditions: { select: { dateEffet: true, fonction: true, statut: true } },
    },
  });

  const nbArchives = await prisma.salarie.count({
    where: { cabinetId: scope.cabinetId, entrepriseId: entreprise.id, deletedAt: { not: null } },
  });

  return {
    entreprise,
    nbArchives,
    salaries: salaries.map((s) => {
      const condition = conditionEnVigueur(s.conditions, at);
      return {
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        nissMasque: masquerNiss(s.id, s.nissEncrypted),
        fonction: condition?.fonction ?? null,
        statut: condition?.statut ?? null,
        dateEntree: s.dateEntree,
        dateSortie: s.dateSortie,
      };
    }),
  };
}

export type ConditionRow = {
  id: string;
  dateEffet: Date;
  statut: string;
  commissionParitaire: string;
  fonction: string;
  regime: string;
  // Minutes par semaine (D96).
  heuresSemaineMinutes: number | null;
  heuresReferenceMinutes: number | null;
  salaireMensuelBrutCents: number | null;
  salaireHoraireBrutCents: number | null;
  etat: 'EN_VIGUEUR' | 'A_VENIR' | 'PASSEE';
};

// Fiche d'un salarié. Pas d'auteur des conditions (`createdById`) : roles/03 § 9, le
// gestionnaire ne voit pas les autres gestionnaires. NISS et IBAN restent masqués ; le
// clair ne sort que par la route de dévoilement journalisée.
export type SalarieDetail = {
  id: string;
  entreprise: { id: string; name: string };
  nom: string;
  prenom: string;
  dateNaissance: Date;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
  email: string | null;
  nissMasque: string;
  ibanMasque: string;
  typeContrat: string;
  dateEntree: Date;
  dateFinContrat: Date | null;
  dateSortie: Date | null;
  situationFamiliale: string;
  // Situation fiscale (D95).
  conjointRevenus: string | null;
  beneficiaireHandicape: boolean;
  conjointHandicape: boolean;
  enfantsCharge: number;
  enfantsHandicapes: number;
  autresChargeDependantes66: number;
  autresChargeHandicapees: number;
  autresCharge: number;
  parentIsole: boolean;
  chargesFamilleAttribuees: boolean | null;
  // Dossier archivé : lisible, mais plus modifiable (roles/03 § 4.2).
  archive: boolean;
  // Accès au portail Collaborateur (roles/03 § 4.3) : compte lié, invitation en attente ou rien.
  portail: EtatPortail;
  // Les plus récentes d'abord.
  conditions: ConditionRow[];
};

function masquerIban(salarieId: string, ibanEncrypted: string): string {
  try {
    return maskIban(dechiffrerSalarie(salarieId, 'iban', ibanEncrypted));
  } catch (error) {
    if (error instanceof DecryptionError) return maskIban('');
    throw error;
  }
}

// Dossier actif d'une entreprise du périmètre, ou null (non assigné, archivé, autre
// cabinet, inexistant : le 404 ne distingue pas ces cas).
export async function getSalarieDetail(
  scope: Scope,
  salarieId: string,
  at: Date = new Date(),
  // La fiche d'un dossier archivé reste consultable, pour pouvoir le restaurer.
  options: { includeArchived?: boolean } = {},
): Promise<SalarieDetail | null> {
  if (scope.kind !== 'entreprises') return null;

  const salarie = await prisma.salarie.findFirst({
    where: {
      id: salarieId,
      cabinetId: scope.cabinetId,
      ...(options.includeArchived ? {} : { deletedAt: null }),
      // Relation : le filtre d'entreprises du périmètre ne peut pas être écrasé par `id`.
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      adresse: true,
      codePostal: true,
      ville: true,
      pays: true,
      email: true,
      nissEncrypted: true,
      ibanEncrypted: true,
      typeContrat: true,
      dateEntree: true,
      dateFinContrat: true,
      dateSortie: true,
      situationFamiliale: true,
      conjointRevenus: true,
      beneficiaireHandicape: true,
      conjointHandicape: true,
      enfantsCharge: true,
      enfantsHandicapes: true,
      autresChargeDependantes66: true,
      autresChargeHandicapees: true,
      autresCharge: true,
      parentIsole: true,
      chargesFamilleAttribuees: true,
      deletedAt: true,
      userId: true,
      // Seulement la dernière invitation en attente : ni l'adresse ni le jeton ne sont lus.
      invitations: {
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { expiresAt: true },
      },
      entreprise: { select: { id: true, name: true } },
      conditions: {
        orderBy: { dateEffet: 'desc' },
        select: {
          id: true,
          dateEffet: true,
          statut: true,
          commissionParitaire: true,
          fonction: true,
          regime: true,
          heuresSemaineMinutes: true,
          heuresReferenceMinutes: true,
          salaireMensuelBrutCents: true,
          salaireHoraireBrutCents: true,
        },
      },
    },
  });
  if (!salarie) return null;

  const { nissEncrypted, ibanEncrypted, conditions, deletedAt, userId, invitations, ...dossier } =
    salarie;
  // Triées de la plus récente à la plus ancienne : la première déjà entrée en vigueur
  // est la condition courante ; une condition postérieure à `at` est « à venir ».
  const courante = conditions.find((c) => c.dateEffet.getTime() <= at.getTime());

  return {
    ...dossier,
    archive: deletedAt !== null,
    portail: etatPortail({ userId, invitations }, at),
    nissMasque: masquerNiss(dossier.id, nissEncrypted),
    ibanMasque: masquerIban(dossier.id, ibanEncrypted),
    conditions: conditions.map((c) => ({
      ...c,
      etat:
        c.dateEffet.getTime() > at.getTime()
          ? 'A_VENIR'
          : c.id === courante?.id
            ? 'EN_VIGUEUR'
            : 'PASSEE',
    })),
  };
}
