// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';

class RedirectSignal extends Error {
  constructor(public readonly to: string) {
    super(`REDIRECT:${to}`);
  }
}
const redirect = vi.fn((to: string) => {
  throw new RedirectSignal(to);
});
vi.mock('next/navigation', () => ({ redirect }));

const { prisma } = await import('@/lib/prisma');
const { requirePaidCabinet, PAYMENT_PAGE } = await import('@/lib/cabinet/cabinet-access');

const stamp = Date.now();
const cabinetIds: string[] = [];

async function createCabinet(billingStatus: string) {
  const cabinet = await prisma.cabinet.create({
    data: { name: `access-test-${stamp}-${cabinetIds.length}`, billingStatus },
  });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

afterAll(async () => {
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
});

describe('requirePaidCabinet (D32)', () => {
  it('renvoie vers l ecran de paiement tant que rien n est paye', async () => {
    const cabinet = await createCabinet('EN_ATTENTE_PAIEMENT');

    await expect(requirePaidCabinet(cabinet.id)).rejects.toThrow(`REDIRECT:${PAYMENT_PAGE}`);
    expect(PAYMENT_PAGE).toBe('/dashboard/cabinet/paiement');
  });

  it.each(['ESSAI', 'ACTIF', 'DELAI_GRACE', 'IMPAYE', 'RESILIE'])(
    'laisse passer un cabinet en %s',
    async (status) => {
      redirect.mockClear();
      const cabinet = await createCabinet(status);

      await expect(requirePaidCabinet(cabinet.id)).resolves.toBeUndefined();
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it('ne bloque pas un cabinet inconnu (la page gere son propre 404)', async () => {
    redirect.mockClear();
    await expect(requirePaidCabinet('cabinet-inexistant')).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
