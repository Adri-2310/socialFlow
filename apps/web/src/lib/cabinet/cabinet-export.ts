import { prisma } from '@/lib/prisma';

// Export des donnees du cabinet (D28, D74, roles/02-cabinet-rh.md § 4.8) : le
// titulaire peut emporter ses donnees, y compris en lecture seule (resiliation,
// impaye, suspension). Le cabinet vient toujours de la session, jamais de la
// requete.
//
// Contenu : identite, abonnement, equipe, entreprises clientes et leurs
// assignations, invitations et journal d'audit. Jamais de salaire ni de fiche de
// paie (D26), ni de secret : pas de hash de jeton d'invitation, d'identifiant
// Stripe, de chemin de fichier ou d'identifiant interne.

export const EXPORT_FORMAT = 'socialflow-cabinet-export';
export const EXPORT_VERSION = 1;
// Entrees d'audit les plus recentes incluses : borne la taille de la reponse.
export const EXPORT_AUDIT_LIMIT = 5000;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export async function buildCabinetExport(cabinetId: string, now: Date = new Date()) {
  const [cabinet, team, entreprises, invitations, audit] = await Promise.all([
    prisma.cabinet.findUniqueOrThrow({
      where: { id: cabinetId },
      select: {
        name: true,
        displayName: true,
        vatNumber: true,
        addressLine: true,
        postalCode: true,
        city: true,
        country: true,
        contactEmail: true,
        contactPhone: true,
        primaryColor: true,
        secondaryColor: true,
        planId: true,
        billingPeriod: true,
        billingStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        createdAt: true,
      },
    }),
    // Equipe : gestionnaires, archives compris (avec leur date de retrait).
    prisma.user.findMany({
      where: { cabinetId, role: 'GESTIONNAIRE_RH' },
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, status: true, createdAt: true, deletedAt: true },
    }),
    prisma.entreprise.findMany({
      where: { cabinetId },
      orderBy: { name: 'asc' },
      select: {
        name: true,
        vatNumber: true,
        addressLine: true,
        postalCode: true,
        city: true,
        country: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
        deletedAt: true,
        adminUser: { select: { name: true, email: true, deletedAt: true } },
        gestionnaires: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.invitation.findMany({
      where: { cabinetId },
      orderBy: { createdAt: 'desc' },
      select: {
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        entreprise: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { cabinetId },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_AUDIT_LIMIT,
      select: {
        action: true,
        createdAt: true,
        metadata: true,
        actor: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
      },
    }),
  ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    cabinet: {
      name: cabinet.name,
      displayName: cabinet.displayName,
      vatNumber: cabinet.vatNumber,
      address: {
        line: cabinet.addressLine,
        postalCode: cabinet.postalCode,
        city: cabinet.city,
        country: cabinet.country,
      },
      contactEmail: cabinet.contactEmail,
      contactPhone: cabinet.contactPhone,
      colors: { primary: cabinet.primaryColor, secondary: cabinet.secondaryColor },
      createdAt: iso(cabinet.createdAt),
    },
    subscription: {
      plan: cabinet.planId,
      billingPeriod: cabinet.billingPeriod,
      status: cabinet.billingStatus,
      trialEndsAt: iso(cabinet.trialEndsAt),
      currentPeriodEnd: iso(cabinet.currentPeriodEnd),
    },
    team: team.map((member) => ({
      name: member.name,
      email: member.email,
      status: member.status,
      createdAt: iso(member.createdAt),
      removedAt: iso(member.deletedAt),
    })),
    entreprises: entreprises.map((e) => ({
      name: e.name,
      vatNumber: e.vatNumber,
      address: { line: e.addressLine, postalCode: e.postalCode, city: e.city, country: e.country },
      contactEmail: e.contactEmail,
      contactPhone: e.contactPhone,
      createdAt: iso(e.createdAt),
      archivedAt: iso(e.deletedAt),
      // Un administrateur dont le compte est archive n'est plus l'administrateur.
      admin: e.adminUser && !e.adminUser.deletedAt ? { name: e.adminUser.name, email: e.adminUser.email } : null,
      gestionnaires: e.gestionnaires.map((g) => ({ name: g.user.name, email: g.user.email })),
    })),
    invitations: invitations.map((i) => ({
      email: i.email,
      role: i.role,
      status: i.status,
      entreprise: i.entreprise?.name ?? null,
      createdAt: iso(i.createdAt),
      expiresAt: iso(i.expiresAt),
      acceptedAt: iso(i.acceptedAt),
    })),
    audit: {
      // Du plus recent au plus ancien ; borne a EXPORT_AUDIT_LIMIT entrees.
      truncated: audit.length === EXPORT_AUDIT_LIMIT,
      entries: audit.map((entry) => ({
        action: entry.action,
        at: iso(entry.createdAt),
        actor: entry.actor ? { name: entry.actor.name, email: entry.actor.email } : null,
        target: entry.targetUser ? { name: entry.targetUser.name, email: entry.targetUser.email } : null,
        details: entry.metadata ?? null,
      })),
    },
  };
}

// Nom du fichier telecharge : date du jour, sans donnee personnelle.
export function exportFilename(now: Date = new Date()): string {
  return `socialflow-export-${now.toISOString().slice(0, 10)}.json`;
}
