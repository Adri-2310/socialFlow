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
const salarieById = await import('@/app/api/salaries/[id]/route');
const conditions = await import('@/app/api/salaries/[id]/conditions/route');
const reveal = await import('@/app/api/salaries/[id]/reveal/route');
const sortie = await import('@/app/api/salaries/[id]/sortie/route');
const invitation = await import('@/app/api/salaries/[id]/invitation/route');
const importCsv = await import('@/app/api/entreprises/[id]/salaries/import/route');
const importModele = await import('@/app/api/entreprises/[id]/salaries/import/modele/route');
const conditionById = await import('@/app/api/salaries/[id]/conditions/[conditionId]/route');

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string; conditionId: string }> },
) => Promise<Response>;

// Quatrième valeur : la route lit seulement, même si son action est une écriture dans le
// catalogue (elle passe `{ write: false }` à authorize).
const ROUTES: [string, Handler, ActionId, boolean?][] = [
  ['POST entreprises/[id]/salaries', salaries.POST, 'salarie.gerer'],
  ['PATCH salaries/[id]', salarieById.PATCH, 'salarie.gerer'],
  ['DELETE salaries/[id]', salarieById.DELETE, 'salarie.gerer'],
  ['PUT salaries/[id]', salarieById.PUT, 'salarie.gerer'],
  ['PUT salaries/[id]/sortie', sortie.PUT, 'salarie.gerer'],
  ['POST salaries/[id]/invitation', invitation.POST, 'salarie.inviter-portail'],
  ['DELETE salaries/[id]/invitation', invitation.DELETE, 'salarie.inviter-portail'],
  ['POST entreprises/[id]/salaries/import', importCsv.POST, 'salarie.gerer'],
  ['GET entreprises/[id]/salaries/import/modele', importModele.GET, 'salarie.gerer', false],
  ['POST salaries/[id]/conditions', conditions.POST, 'salarie.gerer'],
  ['PUT salaries/[id]/conditions/[conditionId]', conditionById.PUT, 'salarie.gerer'],
  ['DELETE salaries/[id]/conditions/[conditionId]', conditionById.DELETE, 'salarie.gerer'],
  ['POST salaries/[id]/reveal', reveal.POST, 'salarie.devoiler-donnees-sensibles'],
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
  return handler(request, { params: Promise.resolve({ id: 'cible', conditionId: 'ligne' }) }).catch(
    () => undefined,
  );
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
  describe.each(ROUTES)('%s', (_name, handler, action, ecriture) => {
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

    // Une action d'écriture est refusée en lecture seule (423) ; consulter, y compris
    // dévoiler un NISS (journalisé), reste possible (D29).
    const isWrite = ecriture ?? 'write' in ACTIONS[action];
    it(
      isWrite
        ? '423 CABINET_READ_ONLY quand le cabinet est en lecture seule'
        : 'reste possible quand le cabinet est en lecture seule',
      async () => {
        cabinetFindUnique.mockResolvedValue({
          billingStatus: 'IMPAYE',
          status: 'actif',
          suspensionType: null,
        });
        sessionFor('GESTIONNAIRE_RH');
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
});
