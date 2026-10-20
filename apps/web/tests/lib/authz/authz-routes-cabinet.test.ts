// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Routes api/cabinet/* : chaque gestionnaire passe par authorize() avec l'action
// prévue par la matrice (doc/PERMISSIONS.md). Session simulée, aucune base :
// on vérifie l'action appelée, les refus par rôle et la lecture seule ; les
// effets des routes sont couverts par les tests rbac-*, cabinet-* et entreprise-*.
const getSession = vi.fn();
const cabinetFindUnique = vi.fn();
vi.mock('@/lib/auth/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cabinet: { findUnique: cabinetFindUnique },
    gestionnaireEntreprise: { findMany: vi.fn().mockResolvedValue([{ entrepriseId: 'e1' }]) },
    entreprise: { findFirst: vi.fn().mockResolvedValue({ id: 'e1' }) },
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

const entreprises = await import('@/app/api/cabinet/entreprises/route');
const entrepriseById = await import('@/app/api/cabinet/entreprises/[id]/route');
const entrepriseAdmin = await import('@/app/api/cabinet/entreprises/[id]/admin/route');
const adminInvitation = await import('@/app/api/cabinet/entreprises/[id]/admin-invitation/route');
const cabinetExport = await import('@/app/api/cabinet/export/route');
const branding = await import('@/app/api/cabinet/settings/branding/route');
const emailTemplates = await import('@/app/api/cabinet/settings/email-templates/[type]/route');
const emailTemplateTest = await import('@/app/api/cabinet/settings/email-templates/[type]/test/route');
const identity = await import('@/app/api/cabinet/settings/identity/route');
const logo = await import('@/app/api/cabinet/settings/logo/route');
const portal = await import('@/app/api/cabinet/settings/portal/route');

type Handler = (request: Request, context: { params: Promise<{ id: string; type: string }> }) => Promise<Response>;

const ROUTES: [string, Handler, ActionId][] = [
  ['POST cabinet/entreprises', entreprises.POST, 'entreprise.gerer'],
  ['PATCH cabinet/entreprises/[id]', entrepriseById.PATCH, 'entreprise.gerer'],
  ['DELETE cabinet/entreprises/[id]', entrepriseById.DELETE, 'entreprise.gerer'],
  ['PUT cabinet/entreprises/[id]', entrepriseById.PUT, 'entreprise.gerer'],
  ['DELETE cabinet/entreprises/[id]/admin', entrepriseAdmin.DELETE, 'entreprise.retirer-admin'],
  ['POST cabinet/entreprises/[id]/admin-invitation', adminInvitation.POST, 'entreprise.remplacer-admin'],
  ['GET cabinet/export', cabinetExport.GET, 'cabinet.exporter'],
  ['PATCH cabinet/settings/branding', branding.PATCH, 'cabinet.personnaliser'],
  ['PUT cabinet/settings/email-templates/[type]', emailTemplates.PUT, 'cabinet.personnaliser'],
  ['DELETE cabinet/settings/email-templates/[type]', emailTemplates.DELETE, 'cabinet.personnaliser'],
  ['POST cabinet/settings/email-templates/[type]/test', emailTemplateTest.POST, 'cabinet.personnaliser'],
  ['PATCH cabinet/settings/identity', identity.PATCH, 'cabinet.modifier-identite'],
  ['POST cabinet/settings/logo', logo.POST, 'cabinet.personnaliser'],
  ['DELETE cabinet/settings/logo', logo.DELETE, 'cabinet.personnaliser'],
  ['PATCH cabinet/settings/portal', portal.PATCH, 'cabinet.personnaliser'],
];

function sessionFor(role: string, cabinetId: string | null = role === 'SUPER_ADMIN' ? null : 'c1', twoFactorEnabled = true) {
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Test', role, cabinetId, twoFactorEnabled } });
}

// Appelle la route ; une route autorisée poursuit vers sa logique métier, que la
// base simulée fait échouer : seule la décision d'autorisation nous intéresse.
async function call(handler: Handler) {
  const request = new Request('http://localhost/api/cabinet/test', { method: 'POST' });
  const context = { params: Promise.resolve({ id: 'cible', type: 'WELCOME' }) };
  return handler(request, context).catch(() => undefined);
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

describe('routes api/cabinet/* : autorisation par la matrice', () => {
  it('couvre les 15 gestionnaires du cabinet', () => {
    expect(ROUTES).toHaveLength(15);
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
      const res = await call(handler);
      expect(res?.status).toBe(403);
    });

    it('laisse passer le Cabinet RH jusqu à la logique métier', async () => {
      sessionFor('CABINET_RH');
      await call(handler);
      const authz = await authorization();
      expect(authz.response).toBeUndefined();
      expect(authz.scope).toEqual({ kind: 'cabinet', cabinetId: 'c1' });
    });

    if (ACTIONS[action].levels.GESTIONNAIRE_RH !== 'DENY') {
      it('laisse passer le gestionnaire, avec son périmètre', async () => {
        sessionFor('GESTIONNAIRE_RH');
        await call(handler);
        const authz = await authorization();
        expect(authz.response).toBeUndefined();
        expect(authz.scope).toEqual({ kind: 'entreprises', cabinetId: 'c1', entrepriseIds: ['e1'] });
      });
    }

    const isWrite = 'write' in ACTIONS[action];
    it(
      isWrite
        ? '423 CABINET_READ_ONLY quand le cabinet est en lecture seule'
        : 'reste possible quand le cabinet est en lecture seule',
      async () => {
        cabinetFindUnique.mockResolvedValue({ billingStatus: 'IMPAYE', status: 'actif', suspensionType: null });
        sessionFor('CABINET_RH');
        const res = await call(handler);
        if (isWrite) {
          expect(res?.status).toBe(423);
          expect(await res?.json()).toEqual({ error: 'CABINET_READ_ONLY' });
        } else {
          expect((await authorization()).response).toBeUndefined();
        }
      },
    );
  });

  // La matrice laisse le SuperAdmin modifier l'identité d'un cabinet (chantier A4,
  // pas encore construit) ; cette route ne sert que le cabinet de la session.
  it("settings/identity refuse le SuperAdmin tant qu'il n'a pas de cabinet propre (A4)", async () => {
    sessionFor('SUPER_ADMIN');
    const res = await call(identity.PATCH);
    expect((await authorization()).response).toBeUndefined();
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: 'FORBIDDEN' });
  });

  // D78 : le gestionnaire assigné ne peut que remplacer l'admin, jamais inviter le premier.
  it("admin-invitation refuse au gestionnaire une invitation sans 'replace' (D78)", async () => {
    sessionFor('GESTIONNAIRE_RH');
    const request = new Request('http://localhost/api/cabinet/entreprises/cible/admin-invitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nouveau@exemple.be' }),
    });
    const res = await adminInvitation.POST(request, { params: Promise.resolve({ id: 'cible' }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
  });
});
