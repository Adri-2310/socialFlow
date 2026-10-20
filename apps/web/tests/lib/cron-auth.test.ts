// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isCronAuthorized } from '@/lib/authz/cron-auth';

const request = (authorization?: string) =>
  new Request('http://localhost:3000/api/cron/x', {
    headers: authorization === undefined ? {} : { authorization },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCronAuthorized', () => {
  it('accepte le bon secret', () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test');
    expect(isCronAuthorized(request('Bearer secret-de-test'))).toBe(true);
  });

  it('refuse un mauvais secret, un secret de longueur differente et l absence d en-tete', () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test');
    expect(isCronAuthorized(request('Bearer autre-secret!'))).toBe(false);
    expect(isCronAuthorized(request('Bearer secret-de-tes'))).toBe(false);
    expect(isCronAuthorized(request('Bearer secret-de-test-plus-long'))).toBe(false);
    expect(isCronAuthorized(request('secret-de-test'))).toBe(false);
    expect(isCronAuthorized(request())).toBe(false);
  });

  it('refuse tout appel quand le secret n est pas defini : "Bearer undefined" ne passe pas', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(isCronAuthorized(request('Bearer undefined'))).toBe(false);
    expect(isCronAuthorized(request('Bearer '))).toBe(false);
    expect(isCronAuthorized(request())).toBe(false);
  });
});

describe('routes cron sans secret configure', () => {
  const routes = [
    ['purge-deleted-accounts', () => import('@/app/api/cron/purge-deleted-accounts/route')],
    ['purge-deleted-cabinets', () => import('@/app/api/cron/purge-deleted-cabinets/route')],
    ['purge-expired-sessions', () => import('@/app/api/cron/purge-expired-sessions/route')],
    ['suspend-overdue-cabinets', () => import('@/app/api/cron/suspend-overdue-cabinets/route')],
  ] as const;

  it.each(routes)('%s refuse "Bearer undefined" quand CRON_SECRET est absent (401)', async (_name, load) => {
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await load();
    const res = await GET(request('Bearer undefined'));
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s refuse un mauvais secret meme quand CRON_SECRET est defini (401)', async (_name, load) => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test');
    const { GET } = await load();
    const res = await GET(request('Bearer mauvais'));
    expect(res.status).toBe(401);
  });
});
