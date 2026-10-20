import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GestionnairesManager } from '@/components/cabinet/gestionnaires-manager';
import { requireAuthorized } from '@/lib/authz-page';
import { requirePaidCabinet } from '@/lib/cabinet-access';
import { getCabinetQuotaUsage } from '@/lib/cabinet-quotas';
import {
  getArchivedGestionnaires,
  getGestionnaires,
  getInvitations,
  getSelfDeletedGestionnaires,
} from '@/lib/cabinet-data';

export const metadata: Metadata = {
  title: 'Gestionnaires',
  description: 'Équipe et invitations de votre cabinet.',
};

export default async function GestionnairesPage() {
  const { user } = await requireAuthorized('gestionnaire.lister');
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');
  await requirePaidCabinet(user.cabinetId);

  const [gestionnaires, invitations, archived, selfDeleted, quotas] = await Promise.all([
    getGestionnaires(user.cabinetId),
    getInvitations(user.cabinetId),
    getArchivedGestionnaires(user.cabinetId),
    getSelfDeletedGestionnaires(user.cabinetId),
    getCabinetQuotaUsage(user.cabinetId),
  ]);

  return (
    <GestionnairesManager
      gestionnaires={gestionnaires}
      invitations={invitations}
      archived={archived}
      selfDeleted={selfDeleted}
      userQuota={
        quotas.limits
          ? {
              used: quotas.utilisateurs.used,
              limit: quotas.limits.maxUtilisateurs,
              pendingPlan: quotas.limits.pendingPlanName,
            }
          : undefined
      }
    />
  );
}
