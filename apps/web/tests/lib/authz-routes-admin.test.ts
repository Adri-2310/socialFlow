// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Routes api/admin/* : chaque gestionnaire passe par authorize() avec l'action
// prévue par la matrice (doc/PERMISSIONS.md), et refuse tout autre rôle. Session
// simulée, aucune base : seuls les refus d'accès sont éprouvés ici ; les effets
// des routes sont couverts par rbac-admin-*.test.ts.
const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/email', () => ({}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, authorize: vi.fn(actual.authorize) };
});

const { authorize, ROLES } = await import('@/lib/authz');
const cabinets = await import('@/app/api/admin/cabinets/[id]/route');
const plans = await import('@/app/api/admin/plans/route');
const plansById = await import('@/app/api/admin/plans/[id]/route');
const users = await import('@/app/api/admin/users/[id]/route');
const revokeSessions = await import('@/app/api/admin/users/[id]/revoke-sessions/route');
const resetPassword = await import('@/app/api/admin/users/[id]/reset-password/route');

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const ROUTES: [string, Handler, string][] = [
  ['PATCH admin/cabinets/[id]', cabinets.PATCH, 'cabinet.administrer'],
  ['DELETE admin/cabinets/[id]', cabinets.DELETE, 'cabinet.administrer'],
  ['PUT admin/cabinets/[id]', cabinets.PUT, 'cabinet.administrer'],
  ['POST admin/plans', plans.POST, 'plan.gerer'],
  ['PATCH admin/plans/[id]', plansById.PATCH, 'plan.gerer'],
  ['DELETE admin/plans/[id]', plansById.DELETE, 'plan.gerer'],
  ['PUT admin/plans/[id]', plansById.PUT, 'plan.gerer'],
  ['PATCH admin/users/[id]', users.PATCH, 'utilisateur.suspendre-archiver'],
  ['DELETE admin/users/[id]', users.DELETE, 'utilisateur.suspendre-archiver'],
  ['PUT admin/users/[id]', users.PUT, 'utilisateur.suspendre-archiver'],
  ['POST admin/users/[id]/revoke-sessions', revokeSessions.POST, 'utilisateur.support'],
  ['POST admin/users/[id]/reset-password', resetPassword.POST, 'utilisateur.support'],
];

function sessionFor(role: string, twoFactorEnabled = true) {
  getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Test', role, cabinetId: role === 'SUPER_ADMIN' ? null : 'c1', twoFactorEnabled },
  });
}

function call(handler: Handler) {
  return handler(new Request('http://localhost/api/admin/test', { method: 'POST' }), {
    params: Promise.resolve({ id: 'cible' }),
  });
}

beforeEach(() => {
  getSession.mockReset();
  vi.mocked(authorize).mockClear();
});

describe('routes api/admin/* : autorisation par la matrice', () => {
  it('couvre les 12 gestionnaires de la console', () => {
    expect(ROUTES).toHaveLength(12);
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
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
    });

    it.each(ROLES.filter((role) => role !== 'SUPER_ADMIN'))('renvoie 403 FORBIDDEN au rôle %s', async (role) => {
      sessionFor(role);
      const res = await call(handler);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    });

    it('renvoie 403 TWO_FACTOR_REQUIRED à un SuperAdmin sans 2FA (D20)', async () => {
      sessionFor('SUPER_ADMIN', false);
      const res = await call(handler);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'TWO_FACTOR_REQUIRED' });
    });
  });
});
