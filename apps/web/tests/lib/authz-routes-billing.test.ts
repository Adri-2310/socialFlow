// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Routes api/billing/* : chaque gestionnaire passe par authorize() avec l'action
// `abonnement.gerer` de la matrice (doc/PERMISSIONS.md) et refuse tout autre
// rôle. Session simulée, aucune base : seuls les refus d'accès sont éprouvés ici ;
// les effets des routes sont couverts par billing-checkout, plan-change et
// cabinet-subscription.
const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/email', () => ({}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, authorize: vi.fn(actual.authorize) };
});

const { ACTIONS, ROLES, authorize } = await import('@/lib/authz');
const checkout = await import('@/app/api/billing/checkout/route');
const checkoutConfirm = await import('@/app/api/billing/checkout/confirm/route');
const card = await import('@/app/api/billing/card/route');
const planChange = await import('@/app/api/billing/plan-change/route');
const planChangeCancel = await import('@/app/api/billing/plan-change/cancel/route');
const subscriptionCancel = await import('@/app/api/billing/subscription/cancel/route');
const subscriptionResume = await import('@/app/api/billing/subscription/resume/route');

type Handler = (request: Request) => Promise<Response>;

const ACTION = 'abonnement.gerer';
const ROUTES: [string, Handler][] = [
  ['POST billing/checkout', checkout.POST],
  ['POST billing/checkout/confirm', checkoutConfirm.POST],
  ['POST billing/card', card.POST],
  ['POST billing/plan-change', planChange.POST],
  ['POST billing/plan-change/cancel', planChangeCancel.POST],
  ['POST billing/subscription/cancel', subscriptionCancel.POST],
  ['POST billing/subscription/resume', subscriptionResume.POST],
];

function sessionFor(role: string, cabinetId: string | null = role === 'SUPER_ADMIN' ? null : 'c1') {
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Test', role, cabinetId, twoFactorEnabled: true } });
}

const call = (handler: Handler) =>
  handler(new Request('http://localhost/api/billing/test', { method: 'POST' }));

beforeEach(() => {
  getSession.mockReset();
  vi.mocked(authorize).mockClear();
});

describe('routes api/billing/* : autorisation par la matrice', () => {
  it('couvre les 7 routes de facturation', () => {
    expect(ROUTES).toHaveLength(7);
  });

  // D29 : un cabinet en impayé ou résilié doit pouvoir reprendre son abonnement.
  it("l'abonnement n'est pas une écriture bloquée par la lecture seule", () => {
    expect('write' in ACTIONS[ACTION]).toBe(false);
  });

  describe.each(ROUTES)('%s', (_name, handler) => {
    it(`appelle authorize avec l'action ${ACTION}, sans option d'écriture`, async () => {
      getSession.mockResolvedValue(null);
      await call(handler);
      expect(authorize).toHaveBeenCalledTimes(1);
      const [, action, options] = vi.mocked(authorize).mock.calls[0];
      expect(action).toBe(ACTION);
      expect(options).toBeUndefined();
    });

    it('renvoie 401 sans session', async () => {
      getSession.mockResolvedValue(null);
      const res = await call(handler);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
    });

    it.each(ROLES.filter((role) => role !== 'CABINET_RH'))('renvoie 403 FORBIDDEN au rôle %s', async (role) => {
      sessionFor(role);
      const res = await call(handler);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    });

    it('renvoie 403 à un Cabinet RH sans cabinet', async () => {
      sessionFor('CABINET_RH', null);
      const res = await call(handler);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    });
  });
});
