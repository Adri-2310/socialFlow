import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import { bornesDuMois } from './periode-dates';

// Tableau de bord du gestionnaire (D93, roles/03 § 3), limité à ce qui existe : l'état de la
// période du mois courant de chaque entreprise assignée et le nombre de salariés en poste ce mois.

export type EtatPeriodeMois =
  | { kind: 'NON_OUVERTE' }
  | { kind: 'EN_ATTENTE'; periodeId: string; dateLimite: string }
  | { kind: 'EN_RETARD'; periodeId: string; dateLimite: string }
  | { kind: 'VERROUILLEE'; periodeId: string; dateLimite: string };

// « EN_RETARD » : période encore ouverte alors que la date limite est passée. Le gestionnaire peut
// encore encoder (D91), mais c'est ce qu'il doit relancer ou terminer. Dates ISO (AAAA-MM-JJ),
// comparables comme du texte.
export function etatPeriodeMois(
  periode: { id: string; statut: string; dateLimite: string } | null,
  aujourdhuiIso: string,
): EtatPeriodeMois {
  if (!periode) return { kind: 'NON_OUVERTE' };
  const base = { periodeId: periode.id, dateLimite: periode.dateLimite };
  if (periode.statut === 'VERROUILLEE') return { kind: 'VERROUILLEE', ...base };
  return aujourdhuiIso > periode.dateLimite
    ? { kind: 'EN_RETARD', ...base }
    : { kind: 'EN_ATTENTE', ...base };
}

export type EntrepriseTableauDeBord = {
  id: string;
  name: string;
  vatNumber: string;
  city: string | null;
  salariesEnPoste: number;
  etat: EtatPeriodeMois;
};

export async function getTableauDeBord(
  scope: Scope,
  aujourdhui: Date,
): Promise<{ annee: number; mois: number; entreprises: EntrepriseTableauDeBord[] }> {
  const annee = aujourdhui.getUTCFullYear();
  const mois = aujourdhui.getUTCMonth() + 1;
  if (scope.kind !== 'entreprises') return { annee, mois, entreprises: [] };

  const { premier, dernier } = bornesDuMois(annee, mois);
  const aujourdhuiIso = aujourdhui.toISOString().slice(0, 10);

  const entreprises = await prisma.entreprise.findMany({
    where: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      vatNumber: true,
      city: true,
      periodesPaie: {
        where: { annee, mois },
        select: { id: true, statut: true, dateLimite: true },
      },
      // D92 : même définition que la liste des prestations.
      _count: {
        select: {
          salaries: {
            where: {
              deletedAt: null,
              dateEntree: { lte: new Date(dernier) },
              OR: [{ dateSortie: null }, { dateSortie: { gte: new Date(premier) } }],
            },
          },
        },
      },
    },
  });

  return {
    annee,
    mois,
    entreprises: entreprises.map((e) => {
      const p = e.periodesPaie[0];
      return {
        id: e.id,
        name: e.name,
        vatNumber: e.vatNumber,
        city: e.city,
        salariesEnPoste: e._count.salaries,
        etat: etatPeriodeMois(
          p && { id: p.id, statut: p.statut, dateLimite: p.dateLimite.toISOString().slice(0, 10) },
          aujourdhuiIso,
        ),
      };
    }),
  };
}
