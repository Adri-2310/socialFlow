import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { DecryptionError, decryptField } from '@/lib/crypto/field-encryption';
import { maskNiss } from '@/lib/crypto/masking';
import { prisma } from '@/lib/prisma';
import { conditionEnVigueur } from '@/lib/salarie/conditions';

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
function masquerNiss(nissEncrypted: string): string {
  try {
    return maskNiss(decryptField(nissEncrypted));
  } catch (error) {
    if (error instanceof DecryptionError) return maskNiss('');
    throw error;
  }
}

// Salariés actifs d'une entreprise du périmètre, ou null si l'entreprise n'y est pas
// (non assignée, archivée, d'un autre cabinet, inexistante).
export async function getSalariesEntreprise(
  scope: Scope,
  entrepriseId: string,
  at: Date = new Date(),
): Promise<{ entreprise: { id: string; name: string }; salaries: SalarieRow[] } | null> {
  if (scope.kind !== 'entreprises') return null;

  const entreprise = await prisma.entreprise.findFirst({
    // AND et non une fusion d'objets : entrepriseWhere(scope) pose déjà un filtre sur `id`
    // (les entreprises assignées), qu'un `id` ajouté à côté écraserait.
    where: { AND: [entrepriseWhere(scope), { id: entrepriseId, deletedAt: null }] },
    select: { id: true, name: true },
  });
  if (!entreprise) return null;

  const salaries = await prisma.salarie.findMany({
    // cabinetId redondant avec l'entreprise, mais toute table métier est filtrée par tenant.
    where: { cabinetId: scope.cabinetId, entrepriseId: entreprise.id, deletedAt: null },
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

  return {
    entreprise,
    salaries: salaries.map((s) => {
      const condition = conditionEnVigueur(s.conditions, at);
      return {
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        nissMasque: masquerNiss(s.nissEncrypted),
        fonction: condition?.fonction ?? null,
        statut: condition?.statut ?? null,
        dateEntree: s.dateEntree,
        dateSortie: s.dateSortie,
      };
    }),
  };
}
