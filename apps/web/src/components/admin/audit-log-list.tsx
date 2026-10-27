'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, PauseCircle, PlayCircle, Archive, ArchiveRestore, Tag, LogOut, KeyRound, ShieldCheck } from 'lucide-react';
import { CABINET_DELETION_RETENTION_DAYS } from '@/lib/cabinet/cabinet-retention';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/auth/account-retention';
import { TablePagination } from '@/components/shared/table-pagination';

export type AuditLogEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  cabinetName: string | null;
  targetUserName: string | null;
  // D71 : type et motif d'une suspension de cabinet.
  suspension?: { mode: 'READ_ONLY' | 'BLOCKED'; reason: string | null } | null;
};

const PAGE_SIZE = 25;

const AUDIT_ICONS: Record<string, { icon: typeof UserPlus; tone: string }> = {
  CABINET_CREATED: { icon: UserPlus, tone: 'bg-secondary/10 text-secondary' },
  CABINET_SUSPENDED: { icon: PauseCircle, tone: 'bg-destructive/10 text-destructive' },
  CABINET_REACTIVATED: { icon: PlayCircle, tone: 'bg-secondary/10 text-secondary' },
  CABINET_ARCHIVED: { icon: Archive, tone: 'bg-muted text-muted-foreground' },
  CABINET_RESTORED: { icon: ArchiveRestore, tone: 'bg-secondary/10 text-secondary' },
  CABINET_DATA_PURGED: { icon: Archive, tone: 'bg-muted text-muted-foreground' },
  USER_ARCHIVED: { icon: Archive, tone: 'bg-muted text-muted-foreground' },
  USER_RESTORED: { icon: ArchiveRestore, tone: 'bg-secondary/10 text-secondary' },
  USER_SUSPENDED: { icon: PauseCircle, tone: 'bg-destructive/10 text-destructive' },
  USER_REACTIVATED: { icon: PlayCircle, tone: 'bg-secondary/10 text-secondary' },
  USER_SESSIONS_REVOKED: { icon: LogOut, tone: 'bg-muted text-muted-foreground' },
  USER_PASSWORD_RESET_SENT: { icon: KeyRound, tone: 'bg-primary/10 text-primary' },
  SUPERADMIN_BOOTSTRAPPED: { icon: ShieldCheck, tone: 'bg-secondary/10 text-secondary' },
  PRICING_PLAN_CREATED: { icon: Tag, tone: 'bg-secondary/10 text-secondary' },
  PRICING_PLAN_UPDATED: { icon: Tag, tone: 'bg-primary/10 text-primary' },
  PRICING_PLAN_ARCHIVED: { icon: Archive, tone: 'bg-muted text-muted-foreground' },
  PRICING_PLAN_RESTORED: { icon: ArchiveRestore, tone: 'bg-secondary/10 text-secondary' },
};

function auditMessage(log: AuditLogEntry): string {
  const cabinetName = log.cabinetName ?? 'un cabinet supprimé';
  const targetUserName = log.targetUserName ?? 'un utilisateur supprimé';
  switch (log.action) {
    case 'CABINET_CREATED':
      return `« ${cabinetName} » a créé son compte.`;
    case 'CABINET_SUSPENDED':
      return `« ${cabinetName} » a été suspendu${
        log.suspension ? (log.suspension.mode === 'READ_ONLY' ? ' en lecture seule' : ' avec blocage des connexions') : ''
      } par ${log.actorName ?? 'un administrateur'}.${log.suspension?.reason ? ` Motif : ${log.suspension.reason}` : ''}`;
    case 'CABINET_REACTIVATED':
      return `« ${cabinetName} » a été réactivé par ${log.actorName ?? 'un administrateur'}.`;
    case 'CABINET_ARCHIVED':
      return `« ${cabinetName} » a été archivé par ${log.actorName ?? 'un administrateur'} (purge dans ${CABINET_DELETION_RETENTION_DAYS} jours).`;
    case 'CABINET_RESTORED':
      return `« ${cabinetName} » a été restauré par ${log.actorName ?? 'un administrateur'}.`;
    case 'CABINET_DATA_PURGED':
      return `« ${cabinetName} » : comptes et identité purgés après ${CABINET_DELETION_RETENTION_DAYS} jours ; les données de paie sont conservées 5 ans.`;
    case 'USER_ARCHIVED':
      return `« ${targetUserName} » a été archivé par ${log.actorName ?? 'un administrateur'} (purge dans ${ACCOUNT_DELETION_RETENTION_DAYS} jours).`;
    case 'USER_RESTORED':
      return `« ${targetUserName} » a été restauré par ${log.actorName ?? 'un administrateur'}.`;
    case 'USER_SUSPENDED':
      return `« ${targetUserName} » a été suspendu par ${log.actorName ?? 'un administrateur'}.`;
    case 'USER_REACTIVATED':
      return `« ${targetUserName} » a été réactivé par ${log.actorName ?? 'un administrateur'}.`;
    case 'USER_SESSIONS_REVOKED':
      return `Les sessions de « ${targetUserName} » ont été révoquées par ${log.actorName ?? 'un administrateur'}.`;
    case 'USER_PASSWORD_RESET_SENT':
      return `Un lien de réinitialisation a été envoyé à « ${targetUserName} » par ${log.actorName ?? 'un administrateur'}.`;
    case 'SUPERADMIN_BOOTSTRAPPED':
      return `« ${targetUserName} » a été créé comme SuperAdmin par le script d’installation.`;
    case 'PRICING_PLAN_CREATED':
      return `Un plan tarifaire a été créé par ${log.actorName ?? 'un administrateur'}.`;
    case 'PRICING_PLAN_UPDATED':
      return `Un plan tarifaire a été modifié par ${log.actorName ?? 'un administrateur'}.`;
    case 'PRICING_PLAN_ARCHIVED':
      return `Un plan tarifaire a été archivé par ${log.actorName ?? 'un administrateur'}.`;
    case 'PRICING_PLAN_RESTORED':
      return `Un plan tarifaire a été restauré par ${log.actorName ?? 'un administrateur'}.`;
    case 'SUBSCRIPTION_CANCEL_SCHEDULED':
      return `« ${cabinetName} » : résiliation programmée par ${log.actorName ?? 'le titulaire'}.`;
    case 'SUBSCRIPTION_CANCEL_REVERTED':
      return `« ${cabinetName} » : résiliation annulée par ${log.actorName ?? 'le titulaire'}.`;
    case 'PAYMENT_METHOD_UPDATED':
      return `« ${cabinetName} » : carte bancaire modifiée par ${log.actorName ?? 'le titulaire'}.`;
    case 'PLAN_CHANGE_SCHEDULED':
      return `« ${cabinetName} » : changement de plan programmé par ${log.actorName ?? 'le titulaire'}.`;
    case 'PLAN_CHANGE_CANCELLED':
      return `« ${cabinetName} » : changement de plan annulé par ${log.actorName ?? 'le titulaire'}.`;
    case 'CABINET_SETTINGS_UPDATED':
      return `« ${cabinetName} » : paramètres modifiés par ${log.actorName ?? 'le titulaire'}.`;
    case 'BILLING_STATUS_CHANGED':
      return `Abonnement de « ${cabinetName} » mis à jour par Stripe.`;
    case 'USER_EMAIL_CHANGED':
      return `L'email de « ${targetUserName} » a été modifié par ${log.actorName ?? 'un administrateur'}.`;
    case 'INVITATION_SENT':
      return `« ${cabinetName} » : une invitation a été envoyée par ${log.actorName ?? 'un utilisateur'}.`;
    case 'INVITATION_RESENT':
      return `« ${cabinetName} » : une invitation a été renvoyée par ${log.actorName ?? 'un utilisateur'}.`;
    case 'INVITATION_REVOKED':
      return `« ${cabinetName} » : une invitation a été révoquée par ${log.actorName ?? 'un utilisateur'}.`;
    case 'INVITATION_ACCEPTED':
      return `« ${cabinetName} » : ${log.actorName ?? 'un utilisateur'} a accepté une invitation.`;
    default:
      return log.action;
  }
}

function formatRelativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  return rtf.format(Math.round(diffHour / 24), 'day');
}

// `limit` + `manageHref` : mode apercu utilise sur la vue d'ensemble (pas de
// pagination, juste un lien vers la liste complete). Sans ces props : page
// dediee /dashboard/admin/audit, paginee cote client (meme principe que
// CabinetsTable).
export function AuditLogList({
  logs,
  limit,
  manageHref,
}: {
  logs: AuditLogEntry[];
  limit?: number;
  manageHref?: string;
}) {
  const [page, setPage] = useState(1);
  const isPreview = typeof limit === 'number';

  const pageCount = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = isPreview ? logs.slice(0, limit) : logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Journal d&apos;audit{isPreview ? ' global' : ''}</h2>
        {isPreview && manageHref && (
          <Link href={manageHref} className="text-sm font-medium text-primary hover:underline">
            Voir tout →
          </Link>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun événement pour le moment.</p>
      ) : (
        <>
          <ul className="space-y-4">
            {visible.map((log) => {
              const { icon: Icon, tone } = AUDIT_ICONS[log.action] ?? {
                icon: UserPlus,
                tone: 'bg-muted text-muted-foreground',
              };
              return (
                <li key={log.id} className="flex gap-3">
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="text-sm">
                    <p className="text-foreground">{auditMessage(log)}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          {!isPreview && pageCount > 1 && (
            <TablePagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              className="mt-4 pt-3"
            >
              Page {currentPage} sur {pageCount}
            </TablePagination>
          )}
        </>
      )}
    </section>
  );
}
