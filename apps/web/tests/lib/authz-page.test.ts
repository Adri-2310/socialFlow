// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

// `redirect()` de next/navigation ne peut pas s'exécuter hors d'un rendu Next.js
// réel : on la remplace par une erreur ordinaire portant l'URL, pour vérifier où la
// garde redirige (même technique que require-session.test.ts).
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const { ACTIONS, ROLES } = await import('@/lib/authz');
const { requireAuthorized } = await import('@/lib/authz-page');
type ActionId = keyof typeof ACTIONS;

const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

function sessionFor(role: string | null, extra: { cabinetId?: string | null; twoFactorEnabled?: boolean | null } = {}) {
  getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Test', role, cabinetId: role === 'SUPER_ADMIN' ? null : 'c1', twoFactorEnabled: true, ...extra },
  });
}

beforeEach(() => {
  getSession.mockReset();
  redirectMock.mockClear();
});

describe('requireAuthorized', () => {
  it.each(ACTION_IDS)('%s : redirige vers /login sans session', async (action) => {
    getSession.mockResolvedValue(null);
    await expect(requireAuthorized(action)).rejects.toThrow('REDIRECT:/login');
  });

  describe.each(ACTION_IDS)('%s', (action) => {
    it.each(ROLES)('rôle %s : suit la matrice', async (role) => {
      sessionFor(role);
      if (ACTIONS[action].levels[role] === 'DENY') {
        await expect(requireAuthorized(action)).rejects.toThrow('REDIRECT:/dashboard');
      } else {
        const session = await requireAuthorized(action);
        expect(session.user.role).toBe(role);
        expect(redirectMock).not.toHaveBeenCalled();
      }
    });
  });

  it.each([null, 'ADMIN'])('redirige le rôle %s vers /dashboard', async (role) => {
    sessionFor(role);
    await expect(requireAuthorized('compte.gerer')).rejects.toThrow('REDIRECT:/dashboard');
  });

  describe('2FA du SuperAdmin (D20)', () => {
    const superAdminActions = ACTION_IDS.filter((id) => ACTIONS[id].levels.SUPER_ADMIN !== 'DENY');

    it.each(superAdminActions)('%s : exige la 2FA, sauf exemption', async (action) => {
      sessionFor('SUPER_ADMIN', { twoFactorEnabled: false });
      if ('twoFactorExempt' in ACTIONS[action]) {
        await expect(requireAuthorized(action)).resolves.toBeDefined();
      } else {
        await expect(requireAuthorized(action)).rejects.toThrow('REDIRECT:/profil?2fa=requise');
      }
    });

    it('laisse le SuperAdmin accéder à son profil sans 2FA, pour pouvoir l activer', async () => {
      sessionFor('SUPER_ADMIN', { twoFactorEnabled: false });
      await expect(requireAuthorized('compte.gerer')).resolves.toBeDefined();
    });

    it('laisse passer un SuperAdmin dont la 2FA est activée', async () => {
      sessionFor('SUPER_ADMIN', { twoFactorEnabled: true });
      await expect(requireAuthorized('plateforme.superviser')).resolves.toBeDefined();
    });

    it('un autre rôle va sur /dashboard, sans rien dire de la 2FA', async () => {
      sessionFor('CABINET_RH', { twoFactorEnabled: false });
      await expect(requireAuthorized('plateforme.superviser')).rejects.toThrow('REDIRECT:/dashboard');
    });

    it('n exige pas la 2FA des autres rôles', async () => {
      sessionFor('CABINET_RH', { twoFactorEnabled: false });
      await expect(requireAuthorized('cabinet.consulter')).resolves.toBeDefined();
    });
  });

  // Comportement conservé de requireSession : la présence d'un cabinet reste
  // contrôlée par chaque page, pas par la garde.
  it('ne contrôle pas la présence d un cabinet', async () => {
    sessionFor('CABINET_RH', { cabinetId: null });
    await expect(requireAuthorized('cabinet.consulter')).resolves.toBeDefined();
  });

  it('renvoie la session de l utilisateur', async () => {
    sessionFor('CABINET_RH');
    const session = await requireAuthorized('audit.voir');
    expect(session.user.id).toBe('u1');
    expect(session.user.cabinetId).toBe('c1');
  });
});
