// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
const cabinetFindUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { cabinet: { findUnique: cabinetFindUnique } } }));

const { requireApiSession } = await import('@/lib/api-guard');

const request = new Request('http://localhost/api/test');

function sessionFor(user: {
  role?: string | null;
  cabinetId?: string | null;
  twoFactorEnabled?: boolean | null;
}) {
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Test', ...user } });
}

describe('requireApiSession', () => {
  beforeEach(() => getSession.mockReset());

  it('renvoie 401 sans session', async () => {
    getSession.mockResolvedValue(null);
    const guard = await requireApiSession(request);
    expect(guard.response?.status).toBe(401);
    expect(await guard.response?.json()).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('laisse passer toute session quand aucun role n est exige', async () => {
    sessionFor({ role: 'COLLABORATEUR' });
    const guard = await requireApiSession(request);
    expect(guard.response).toBeUndefined();
    expect(guard.session?.user.id).toBe('u1');
  });

  it('renvoie 403 quand le role ne correspond pas', async () => {
    sessionFor({ role: 'GESTIONNAIRE_RH' });
    const guard = await requireApiSession(request, { role: 'CABINET_RH' });
    expect(guard.response?.status).toBe(403);
    expect(await guard.response?.json()).toEqual({ error: 'FORBIDDEN' });
  });

  it('accepte n importe quel role d une liste', async () => {
    sessionFor({ role: 'GESTIONNAIRE_RH' });
    const guard = await requireApiSession(request, { role: ['CABINET_RH', 'GESTIONNAIRE_RH'] });
    expect(guard.response).toBeUndefined();
  });

  it('renvoie 403 pour un role null quand un role est exige', async () => {
    sessionFor({ role: null });
    const guard = await requireApiSession(request, { role: 'CABINET_RH' });
    expect(guard.response?.status).toBe(403);
  });

  it('exige un cabinetId avec cabinet: true', async () => {
    sessionFor({ role: 'CABINET_RH', cabinetId: null });
    const sans = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true });
    expect(sans.response?.status).toBe(403);

    sessionFor({ role: 'CABINET_RH', cabinetId: 'c1' });
    const avec = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true });
    expect(avec.response).toBeUndefined();
  });

  it('writable : renvoie 423 quand le cabinet est en lecture seule', async () => {
    sessionFor({ role: 'CABINET_RH', cabinetId: 'c1' });
    for (const billingStatus of ['IMPAYE', 'RESILIE']) {
      cabinetFindUnique.mockResolvedValueOnce({ billingStatus });
      const guard = await requireApiSession(request, {
        role: 'CABINET_RH',
        cabinet: true,
        writable: true,
      });
      expect(guard.response?.status).toBe(423);
      expect(await guard.response?.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    }
  });

  it('writable : laisse passer un cabinet en regle ou en delai de grace', async () => {
    sessionFor({ role: 'CABINET_RH', cabinetId: 'c1' });
    for (const billingStatus of ['ESSAI', 'ACTIF', 'DELAI_GRACE']) {
      cabinetFindUnique.mockResolvedValueOnce({ billingStatus });
      const guard = await requireApiSession(request, { role: 'CABINET_RH', writable: true });
      expect(guard.response).toBeUndefined();
    }
  });

  it('writable : ne consulte pas le cabinet pour une route de lecture ni sans cabinet', async () => {
    cabinetFindUnique.mockClear();

    sessionFor({ role: 'CABINET_RH', cabinetId: 'c1' });
    await requireApiSession(request, { role: 'CABINET_RH' });
    expect(cabinetFindUnique).not.toHaveBeenCalled();

    sessionFor({ role: 'SUPER_ADMIN', cabinetId: null });
    const guard = await requireApiSession(request, { role: 'SUPER_ADMIN', writable: true });
    expect(guard.response).toBeUndefined();
    expect(cabinetFindUnique).not.toHaveBeenCalled();
  });

  describe('twoFactor (D20)', () => {
    it.each([false, null, undefined])(
      'renvoie 403 TWO_FACTOR_REQUIRED quand la 2FA est %s',
      async (twoFactorEnabled) => {
        sessionFor({ role: 'SUPER_ADMIN', twoFactorEnabled });
        const guard = await requireApiSession(request, { role: 'SUPER_ADMIN', twoFactor: true });
        expect(guard.response?.status).toBe(403);
        expect(await guard.response?.json()).toEqual({ error: 'TWO_FACTOR_REQUIRED' });
      },
    );

    it('laisse passer un SuperAdmin dont la 2FA est activee', async () => {
      sessionFor({ role: 'SUPER_ADMIN', twoFactorEnabled: true });
      const guard = await requireApiSession(request, { role: 'SUPER_ADMIN', twoFactor: true });
      expect(guard.response).toBeUndefined();
    });

    it('n exige pas la 2FA sans l option twoFactor', async () => {
      sessionFor({ role: 'SUPER_ADMIN', twoFactorEnabled: false });
      const guard = await requireApiSession(request, { role: 'SUPER_ADMIN' });
      expect(guard.response).toBeUndefined();
    });

    it('un autre role recoit FORBIDDEN et rien sur la 2FA', async () => {
      sessionFor({ role: 'CABINET_RH', twoFactorEnabled: false });
      const guard = await requireApiSession(request, { role: 'SUPER_ADMIN', twoFactor: true });
      expect(guard.response?.status).toBe(403);
      expect(await guard.response?.json()).toEqual({ error: 'FORBIDDEN' });
    });

    it('ne touche pas les autres roles qui n exigent pas la 2FA', async () => {
      sessionFor({ role: 'CABINET_RH', cabinetId: 'c1', twoFactorEnabled: false });
      const guard = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true });
      expect(guard.response).toBeUndefined();
    });
  });
});
