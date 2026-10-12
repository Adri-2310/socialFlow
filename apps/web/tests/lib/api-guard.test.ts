// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));

const { requireApiSession } = await import('@/lib/api-guard');

const request = new Request('http://localhost/api/test');

function sessionFor(user: { role?: string | null; cabinetId?: string | null }) {
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
});
