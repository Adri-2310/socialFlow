import crypto from 'node:crypto';

// Duree de validite d'une invitation (roles/02-cabinet-rh.md § 4.2).
export const INVITATION_TTL_DAYS = 7;

// D5, D78 : la place d'administrateur d'une entreprise est utilisable par une invitation quand
// elle est libre, ou tenue par l'administrateur que cette invitation remplace. Regle UNIQUE,
// partagee par l'apercu de la page d'acceptation et par l'acceptation elle-meme : elles ne
// peuvent pas diverger.
export function isAdminSeatAvailable(
  currentAdminId: string | null | undefined,
  replacesAdminId: string | null | undefined,
): boolean {
  return !currentAdminId || currentAdminId === replacesAdminId;
}

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
