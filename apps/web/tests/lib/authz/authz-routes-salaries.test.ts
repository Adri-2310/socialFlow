// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Routes des dossiers salariés : chaque gestionnaire passe par authorize() avec
// l'action prévue par la matrice (doc/PERMISSIONS.md). Session simulée, aucune base :
// on vérifie l'action appelée et les refus par rôle ; les effets des routes sont
// couverts par tests/lib/salarie/rbac-salaries.test.ts.
const getSession = vi.fn();
const cabinetFindUnique = vi.fn();
vi.mock('@/lib/auth/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cabinet: { findUnique: cabinetFindUnique },
    gestionnaireEntreprise: { findMany: vi.fn().mockResolvedValue([{ entrepriseId: 'e1' }]) },
    entreprise: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('@/lib/billing/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/email/email', () => ({}));
vi.mock('@/lib/authz/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz/authz')>();
  return { ...actual, authorize: vi.fn(actual.authorize) };
});

const { ACTIONS, ROLES, authorize } = await import('@/lib/authz/authz');
type ActionId = keyof typeof ACTIONS;

const salaries = await import('@/app/api/entreprises/[id]/salaries/route');

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ROUTES: [string, Handler, ActionId][] = [
  ['POST entreprises/[id]/salaries', salaries.POST, 'salarie.gerer'],
];

function sessionFor(role: string, cabinetId: string | null = role === 'SUPER_ADMIN' ? null : 'c1') {
  getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Test', role, cabinetId, twoFactorEnabled: true },
  });
}

async function call(handler: Handler) {
  const request = new Request('http://localhost/api/entreprises/cible/salaries', {
    method: 'POST',
  });
  return handler(request, { params: Promise.resolve({ id: 'cible' }) }).catch(() => undefined);
}

async function authorization() {
  const calls = vi.mocked(authorize).mock.results;
  return calls.length ? await calls[0].value : undefined;
}

beforeEach(() => {
  getSession.mockReset();
  cabinetFindUnique
    .mockReset()
    .mockResolvedValue({ billingStatus: 'ACTIF', status: 'actif', suspensionType: null });
  vi.mocked(authorize).mockClear();
});

describe('routes des salariés : autorisation par la matrice', () => {
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

    it('laisse passer le gestionnaire, avec son périmètre', async () => {
      sessionFor('GESTIONNAIRE_RH');
      await call(handler);
      const authz = await authorization();
      expect(authz.response).toBeUndefined();
      expect(authz.scope).toEqual({ kind: 'entreprises', cabinetId: 'c1', entrepriseIds: ['e1'] });
    });

    it('423 CABINET_READ_ONLY quand le cabinet est en lecture seule', async () => {
      cabinetFindUnique.mockResolvedValue({
        billingStatus: 'IMPAYE',
        status: 'actif',
        suspensionType: null,
      });
      sessionFor('GESTIONNAIRE_RH');
      const res = await call(handler);
      expect(res?.status).toBe(423);
      expect(await res?.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    });
  });
});
