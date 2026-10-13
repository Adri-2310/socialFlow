import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GestionnairesManager } from '@/components/cabinet/gestionnaires-manager';
import { requireSession } from '@/lib/require-session';
import { getGestionnaires, getInvitations } from '@/lib/cabinet-data';

export const metadata: Metadata = {
  title: 'Gestionnaires — SocialFlow',
  description: 'Équipe et invitations de votre cabinet.',
};

export default async function GestionnairesPage() {
  const { user } = await requireSession({ role: 'CABINET_RH' });
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');

  const [gestionnaires, invitations] = await Promise.all([
    getGestionnaires(user.cabinetId),
    getInvitations(user.cabinetId),
  ]);

  return <GestionnairesManager gestionnaires={gestionnaires} invitations={invitations} />;
}
