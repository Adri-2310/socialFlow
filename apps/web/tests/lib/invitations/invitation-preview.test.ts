// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { createInvitationToken } from '@/lib/invitations/invitations';
import { getInvitationPreview } from '@/lib/invitations/invitation-preview';
import { roleDisplayLabel } from '@/lib/role-labels';

const stamp = Date.now();
const cabinetIds: string[] = [];
const userIds: string[] = [];
let counter = 0;

async function setup(branding: Record<string, unknown> = {}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: { name: `Cabinet Invitation ${stamp}-${counter}`, ...branding },
  });
  cabinetIds.push(cabinet.id);
  const inviter = await prisma.user.create({
    data: {
      id: `vitest-prev-${stamp}-${counter}`,
      name: 'Titulaire',
      email: `vitest-auth-prev-${stamp}-${counter}@socialflow.page`,
      emailVerified: true,
      role: 'CABINET_RH',
      cabinetId: cabinet.id,
    },
  });
  userIds.push(inviter.id);
  return { cabinet, inviter };
}

async function invite(
  cabinetId: string,
  invitedById: string,
  data: { status?: string; expiresAt?: Date } = {},
) {
  const { token, tokenHash } = createInvitationToken();
  await prisma.invitation.create({
    data: {
      email: `invite-${stamp}-${++counter}@test.com`,
      role: 'GESTIONNAIRE_RH',
      tokenHash,
      cabinetId,
      invitedById,
      status: data.status ?? 'pending',
      expiresAt: data.expiresAt ?? new Date(Date.now() + 86_400_000),
    },
  });
  return token;
}

afterAll(async () => {
  await prisma.invitation.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
});

describe('getInvitationPreview (D33)', () => {
  it('montre le nom, la couleur et le logo du cabinet pour un jeton valide', async () => {
    const { cabinet, inviter } = await setup({
      displayName: 'Alicia Cabinet',
      primaryColor: '#008734',
      secondaryColor: '#00b3ff',
      logoUrl: 'https://blob.test/logo.png',
    });
    const token = await invite(cabinet.id, inviter.id);

    const preview = await getInvitationPreview(token);

    expect(preview).toMatchObject({
      brandName: 'Alicia Cabinet',
      cabinetName: cabinet.name,
      primaryColor: '#008734',
      secondaryColor: '#00b3ff',
      logoUrl: 'https://blob.test/logo.png',
    });
    expect(preview?.email).toMatch(/^invite-/);
  });

  it('retombe sur la raison sociale sans nom affiche', async () => {
    const { cabinet, inviter } = await setup();
    const token = await invite(cabinet.id, inviter.id);

    const preview = await getInvitationPreview(token);

    expect(preview?.brandName).toBe(cabinet.name);
    expect(preview?.primaryColor).toBeNull();
  });

  it('ne revele rien pour un jeton inconnu, expire, utilise ou revoque', async () => {
    const { cabinet, inviter } = await setup({ displayName: 'Secret Cabinet' });

    expect(await getInvitationPreview('jeton-inconnu')).toBeNull();
    expect(await getInvitationPreview(undefined)).toBeNull();
    expect(await getInvitationPreview('')).toBeNull();

    const expired = await invite(cabinet.id, inviter.id, { expiresAt: new Date(Date.now() - 1000) });
    const accepted = await invite(cabinet.id, inviter.id, { status: 'accepted' });
    const revoked = await invite(cabinet.id, inviter.id, { status: 'revoked' });
    for (const token of [expired, accepted, revoked]) {
      expect(await getInvitationPreview(token)).toBeNull();
    }
  });

  it('ne montre pas un cabinet archive', async () => {
    const { cabinet, inviter } = await setup({ deletedAt: new Date() });
    const token = await invite(cabinet.id, inviter.id);

    expect(await getInvitationPreview(token)).toBeNull();
  });
});

describe('roleDisplayLabel', () => {
  it('ne montre jamais le code brut du role', () => {
    expect(roleDisplayLabel('GESTIONNAIRE_RH')).toBe('Gestionnaire RH');
    expect(roleDisplayLabel('CABINET_RH')).toBe('Cabinet RH');
    expect(roleDisplayLabel('SUPER_ADMIN')).toBe('SuperAdmin');
    expect(roleDisplayLabel(null)).toBe('');
    expect(roleDisplayLabel('AUTRE')).toBe('AUTRE');
  });
});
