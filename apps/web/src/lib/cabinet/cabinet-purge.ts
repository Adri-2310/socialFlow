import { prisma } from '@/lib/prisma';
import { getLogoStorage } from '@/lib/branding/logo-storage';
import { PAIE_RETENTION_YEARS } from '@/lib/cabinet/cabinet-retention';

// D94 : purge d'un cabinet archive. Les donnees de paie se conservent 5 ans (D28), donc un
// cabinet qui en a n'est pas supprime : on purge ses comptes et son identite visuelle, on
// garde la coquille (raison sociale, TVA), ses entreprises et la paie, puis
// purge-expired-retention supprime le tout une fois le delai echu.

/**
 * Fin de la conservation (derniere seconde incluse). Regle de D94 : cinq ans apres la fin de
 * l'annee civile de la derniere periode ; sans periode, cinq ans apres la sortie la plus
 * recente ; a defaut, cinq ans apres l'archivage du cabinet.
 */
export function finDeConservation(input: {
  derniereAnneePeriode: number | null;
  derniereSortie: Date | null;
  archiveLe: Date;
}): Date {
  if (input.derniereAnneePeriode !== null) {
    return new Date(Date.UTC(input.derniereAnneePeriode + PAIE_RETENTION_YEARS, 11, 31, 23, 59, 59, 999));
  }
  const depart = input.derniereSortie ?? input.archiveLe;
  const fin = new Date(depart);
  fin.setUTCFullYear(fin.getUTCFullYear() + PAIE_RETENTION_YEARS);
  return fin;
}

/** Un cabinet a des donnees a conserver des qu'il a un dossier salarie (archive compris) ou une periode. */
export async function aDesDonneesAConserver(cabinetId: string): Promise<boolean> {
  const [salarie, periode] = await Promise.all([
    prisma.salarie.findFirst({ where: { cabinetId }, select: { id: true } }),
    prisma.periodePaie.findFirst({ where: { cabinetId }, select: { id: true } }),
  ]);
  return salarie !== null || periode !== null;
}

export async function calculerFinDeConservation(cabinetId: string): Promise<Date> {
  const [cabinet, periode, sortie] = await Promise.all([
    prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId }, select: { deletedAt: true } }),
    prisma.periodePaie.aggregate({ where: { cabinetId }, _max: { annee: true } }),
    prisma.salarie.aggregate({ where: { cabinetId }, _max: { dateSortie: true } }),
  ]);
  return finDeConservation({
    derniereAnneePeriode: periode._max.annee,
    derniereSortie: sortie._max.dateSortie,
    archiveLe: cabinet.deletedAt ?? new Date(),
  });
}

/**
 * Purge partielle : supprime comptes (sessions, 2FA et assignations partent avec eux),
 * invitations, modeles d'emails, branding, logo et lien d'abonnement. Garde la coquille, les
 * entreprises et la paie. Idempotente : un cabinet deja purge est ignore. L'audit est ecrit
 * dans la meme transaction.
 */
export async function purgerCabinetPartiellement(cabinetId: string): Promise<boolean> {
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { donneesPurgeesLe: true, logoPath: true },
  });
  if (!cabinet || cabinet.donneesPurgeesLe) return false;

  await prisma.$transaction(async (tx) => {
    await tx.invitation.deleteMany({ where: { cabinetId } });
    await tx.emailTemplate.deleteMany({ where: { cabinetId } });
    await tx.gestionnaireEntreprise.deleteMany({ where: { entreprise: { cabinetId } } });
    const comptes = await tx.user.deleteMany({ where: { cabinetId } });
    await tx.cabinet.update({
      where: { id: cabinetId },
      data: {
        donneesPurgeesLe: new Date(),
        slug: null,
        displayName: null,
        primaryColor: null,
        secondaryColor: null,
        logoUrl: null,
        logoPath: null,
        stripeCustomerId: null,
        planId: null,
        pendingPlanId: null,
        billingPeriod: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        pastDueSince: null,
        billingEventAt: null,
        addressLine: null,
        postalCode: null,
        city: null,
        contactEmail: null,
        contactPhone: null,
      },
    });
    // Que des nombres : jamais de nom, d'email ni de donnee de paie.
    await tx.auditLog.create({
      data: { action: 'CABINET_DATA_PURGED', cabinetId, metadata: { comptesSupprimes: comptes.count } },
    });
  });

  // Hors transaction : un echec du stockage ne doit pas defaire la purge (le logo orphelin
  // est sans donnee personnelle).
  if (cabinet.logoPath) {
    await getLogoStorage()
      ?.remove(cabinet.logoPath)
      .catch((error) => console.error('[cabinet-purge] suppression du logo impossible', error));
  }
  return true;
}

/**
 * Suppression definitive, dans l'ordre que les `Restrict` de D94 imposent : prestations,
 * conditions, periodes, dossiers, entreprises, puis le cabinet (qui emporte ses comptes).
 * Seule voie pour effacer un cabinet qui a de la paie : appelee par la purge sans donnees
 * a conserver, par la fin de conservation et par le nettoyage des tests.
 */
export async function supprimerCabinetsEtDonnees(cabinetIds: string[]): Promise<void> {
  if (cabinetIds.length === 0) return;
  const where = { cabinetId: { in: cabinetIds } };
  await prisma.$transaction([
    prisma.prestation.deleteMany({ where }),
    prisma.conditionTravail.deleteMany({ where }),
    prisma.periodePaie.deleteMany({ where }),
    prisma.salarie.deleteMany({ where }),
    prisma.entreprise.deleteMany({ where }),
    prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } }),
  ]);
}
