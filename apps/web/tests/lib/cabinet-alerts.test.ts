import { describe, it, expect } from 'vitest';
import { buildCabinetAlerts, type CabinetAlertsInput } from '@/lib/cabinet-alerts';
import type {
  ArchivedGestionnaireRow,
  GestionnaireRow,
  InvitationRow,
} from '@/lib/cabinet-data';
import type { CabinetQuotaUsage } from '@/lib/cabinet-quotas';

const now = new Date('2026-10-13T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

const quotas = (overrides: Partial<CabinetQuotaUsage> = {}): CabinetQuotaUsage => ({
  limits: { maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5120 },
  utilisateurs: { members: 2, pendingInvitations: 0, used: 2 },
  entreprises: { used: 0 },
  storageMb: { used: 0 },
  ...overrides,
});

const gestionnaire = (overrides: Partial<GestionnaireRow> = {}): GestionnaireRow => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@cabinet.be',
  status: 'actif',
  reactivatableByCabinet: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  ...overrides,
});

const invitation = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: 'i1',
  email: 'x@cabinet.be',
  status: 'pending',
  expiresAt: new Date(now.getTime() + day),
  createdAt: now,
  ...overrides,
});

const archived = (overrides: Partial<ArchivedGestionnaireRow> = {}): ArchivedGestionnaireRow => ({
  id: 'a1',
  name: 'Bruno',
  email: 'bruno@cabinet.be',
  deletedAt: new Date(now.getTime() - 25 * day),
  restorableUntil: new Date(now.getTime() + 5 * day),
  ...overrides,
});

function build(overrides: Partial<CabinetAlertsInput> = {}) {
  return buildCabinetAlerts({
    quotas: quotas(),
    invitations: [],
    gestionnaires: [gestionnaire()],
    archived: [],
    now,
    ...overrides,
  });
}

describe('buildCabinetAlerts', () => {
  it('ne renvoie aucune alerte quand tout est en ordre', () => {
    expect(build()).toEqual([]);
  });

  it('signale un quota atteint (danger) et un quota presque atteint (warning)', () => {
    const atteint = build({
      quotas: quotas({ utilisateurs: { members: 10, pendingInvitations: 0, used: 10 } }),
    });
    expect(atteint).toHaveLength(1);
    expect(atteint[0]).toMatchObject({
      id: 'quota-utilisateurs-atteint',
      level: 'danger',
      title: "Quota d'utilisateurs atteint",
      description: 'Vous utilisez 10 sur 10. Passez à un plan supérieur pour en ajouter.',
    });

    const proche = build({
      quotas: quotas({ utilisateurs: { members: 8, pendingInvitations: 0, used: 8 } }),
    });
    expect(proche[0]).toMatchObject({ id: 'quota-utilisateurs-proche', level: 'warning' });
  });

  it('formate le stockage en Go', () => {
    const alerts = build({ quotas: quotas({ storageMb: { used: 5120 } }) });
    expect(alerts[0].description).toBe(
      'Vous utilisez 5 Go sur 5 Go. Passez à un plan supérieur pour en ajouter.',
    );
  });

  it('ignore les quotas illimites et l absence de plan', () => {
    expect(
      build({
        quotas: quotas({
          limits: { maxEntreprises: null, maxUtilisateurs: null, maxStorageMb: null },
          utilisateurs: { members: 500, pendingInvitations: 0, used: 500 },
        }),
      }),
    ).toEqual([]);
    expect(build({ quotas: quotas({ limits: null }) })).toEqual([]);
  });

  it('signale les invitations expirees avec un accord au pluriel', () => {
    const one = build({ invitations: [invitation({ status: 'expired' })] });
    expect(one[0].title).toBe('1 invitation expirée');

    const two = build({
      invitations: [invitation({ status: 'expired' }), invitation({ id: 'i2', status: 'expired' })],
    });
    expect(two[0].title).toBe('2 invitations expirées');
  });

  it('distingue la suspension du cabinet (info) de celle de l administration (warning)', () => {
    const alerts = build({
      gestionnaires: [
        gestionnaire({ id: 'g1', status: 'suspendu', reactivatableByCabinet: true }),
        gestionnaire({ id: 'g2', status: 'suspendu', reactivatableByCabinet: false }),
      ],
    });

    expect(alerts.map((a) => [a.id, a.level])).toEqual([
      ['suspendus-administration', 'warning'],
      ['suspendus-cabinet', 'info'],
    ]);
  });

  it('previent quand la restauration d un gestionnaire retire expire dans 7 jours', () => {
    const proche = build({ archived: [archived()] });
    expect(proche[0]).toMatchObject({
      id: 'restauration-a1',
      level: 'warning',
      title: 'Bruno : restauration bientôt impossible',
    });
    expect(proche[0].description).toBe("Vous pouvez le restaurer jusqu'au 18/10/2026.");

    const loin = build({
      archived: [archived({ restorableUntil: new Date(now.getTime() + 20 * day) })],
    });
    expect(loin).toEqual([]);

    const passe = build({
      archived: [archived({ restorableUntil: new Date(now.getTime() - day) })],
    });
    expect(passe).toEqual([]);
  });

  it('suggere d inviter un premier gestionnaire seulement si rien n est en cours', () => {
    expect(build({ gestionnaires: [] })[0]).toMatchObject({
      id: 'aucun-gestionnaire',
      level: 'info',
    });
    expect(build({ gestionnaires: [], invitations: [invitation()] })).toEqual([]);
  });

  it('classe les alertes de la plus urgente a la moins urgente', () => {
    const alerts = build({
      gestionnaires: [gestionnaire({ status: 'suspendu', reactivatableByCabinet: true })],
      invitations: [invitation({ status: 'expired' })],
      quotas: quotas({ utilisateurs: { members: 10, pendingInvitations: 0, used: 10 } }),
    });

    expect(alerts.map((a) => a.level)).toEqual(['danger', 'warning', 'info']);
  });
});
