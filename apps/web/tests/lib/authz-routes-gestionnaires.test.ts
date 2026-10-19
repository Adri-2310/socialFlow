// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Routes api/gestionnaires/* et api/invitations/* : chaque gestionnaire passe par
// authorize() avec l'action prévue par la matrice (doc/PERMISSIONS.md). Session
// simulée, aucune base : on vérifie l'action appelée, les refus par rôle et la
// lecture seule ; les effets des routes sont couverts par rbac-gestionnaires,
// invitations et rbac-entreprise-admin.
const getSession = vi.fn();
const cabinetFindUnique = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cabinet: { findUnique: cabinetFindUnique },
    gestionnaireEntreprise: { findMany: vi.fn().mockResolvedValue([]) },
    entreprise: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/email', () => ({}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, authorize: vi.fn(actual.authorize) };
});

const { ACTIONS, ROLES, authorize } = await import('@/lib/authz');
type ActionId = keyof typeof ACTIONS;

const gestionnaire = await import('@/app/api/gestionnaires/[id]/route');
const gestionnaireEmail = await import('@/app/api/gestionnaires/[id]/email/route');
const invitations = await import('@/app/api/invitations/route');
const invitation = await import('@/app/api/invitations/[id]/route');
const invitationResend = await import('@/app/api/invitations/[id]/resend/route');

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const ROUTES: [string, Handler, ActionId][] = [
  ['PATCH gestionnaires/[id]', gestionnaire.PATCH, 'gestionnaire.desactiver'],
  ['DELETE gestionnaires/[id]', gestionnaire.DELETE, 'gestionnaire.desactiver'],
  ['PUT gestionnaires/[id]', gestionnaire.PUT, 'gestionnaire.desactiver'],
  ['POST gestionnaires/[id]/email', gestionnaireEmail.POST, 'gestionnaire.modifier-email'],
  ['POST invitations', invitations.POST, 'gestionnaire.inviter'],
  ['DELETE invitations/[id]', invitation.DELETE, 'gestionnaire.inviter'],
  ['POST invitations/[id]/resend', invitationResend.POST, 'gestionnaire.inviter'],
];

function sessionFor(role: string, cabinetId: string | null = role === 'SUPER_ADMIN' ? null : 'c1') {
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Test', role, cabinetId, twoFactorEnabled: true } });
}

// Une route autorisée poursuit vers sa logique métier, que la base simulée fait
// échouer : seule la décision d'autorisation nous intéresse.
async function call(handler: Handler) {
  const request = new Request('http://localhost/api/test', { method: 'POST' });
  return handler(request, { params: Promise.resolve({ id: 'cible' }) }).catch(() => undefined);
}

async function authorization() {
  const calls = vi.mocked(authorize).mock.results;
  return calls.length ? await calls[0].value : undefined;
}

beforeEach(() => {
  getSession.mockReset();
  cabinetFindUnique.mockReset().mockResolvedValue({ billingStatus: 'ACTIF', status: 'actif', suspensionType: null });
  vi.mocked(authorize).mockClear();
});

describe('routes api/gestionnaires/* et api/invitations/* : autorisation par la matrice', () => {
  it('couvre les 7 gestionnaires', () => {
    expect(ROUTES).toHaveLength(7);
  });

  describe.each(ROUTES)('%s', (_name, handler, action) => {
    it(`appelle authorize avec l'action ${action}`, async () => {
      getSession.mockResolvedValue(null);
      await call(handler);
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(vi.mocked(authorize).mock.calls[0][1]).toBe(action);
    });

    it('renvoie 401 sans session', async () => {
      getSession.mockResolvedValue(null);
      const res = await call(handler);
      expect(res?.status).toBe(401);
      expect(await res?.json()).toEqual({ error: 'UNAUTHORIZED' });
    });

    it.each(ROLES.filter((role) => ACTIONS[action].levels[role] === 'DENY'))(
      'renvoie 403 FORBIDDEN au rôle %s',
      async (role) => {
        sessionFor(role);
        const res = await call(handler);
        expect(res?.status).toBe(403);
        expect(await res?.json()).toEqual({ error: 'FORBIDDEN' });
      },
    );

    it('renvoie 403 à un Cabinet RH sans cabinet', async () => {
      sessionFor('CABINET_RH', null);
      expect((await call(handler))?.status).toBe(403);
    });

    it('laisse passer le Cabinet RH jusqu à la logique métier', async () => {
      sessionFor('CABINET_RH');
      await call(handler);
      const authz = await authorization();
      expect(authz.response).toBeUndefined();
      expect(authz.scope).toEqual({ kind: 'cabinet', cabinetId: 'c1' });
    });

    it('423 CABINET_READ_ONLY quand le cabinet est en lecture seule', async () => {
      cabinetFindUnique.mockResolvedValue({ billingStatus: 'IMPAYE', status: 'actif', suspensionType: null });
      sessionFor('CABINET_RH');
      const res = await call(handler);
      expect(res?.status).toBe(423);
      expect(await res?.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    });
  });

  it('toutes ces actions sont des écritures réservées au Cabinet RH', () => {
    for (const action of new Set(ROUTES.map(([, , id]) => id))) {
      expect(ACTIONS[action]).toMatchObject({ write: true });
      expect(ROLES.filter((role) => ACTIONS[action].levels[role] !== 'DENY')).toEqual(['CABINET_RH']);
    }
  });
});
