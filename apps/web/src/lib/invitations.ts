import crypto from 'node:crypto';

// Duree de validite d'une invitation (roles/02-cabinet-rh.md § 4.2).
export const INVITATION_TTL_DAYS = 7;

// C3 : seul sha256(jeton) est stocke en base (Invitation.tokenHash) ; le jeton
// en clair n'existe que dans l'email envoye. Sha256 sans sel suffit ici : le
// jeton est aleatoire sur 256 bits, pas un mot de passe choisi par un humain.
export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function invitationUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${token}`;
}
