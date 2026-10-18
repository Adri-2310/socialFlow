import { cabinetIdForSlug, ensureCabinetSlug } from '@/lib/cabinet-portal';
import { isPortalRole } from '@/lib/portal-slug';

// Controle d'acces par portail (D76), applique par le hook d'authentification a
// chaque session qui vient d'etre ouverte.
//
//  - Un gestionnaire, une entreprise ou un collaborateur ne se connecte QUE par le
//    portail de son cabinet : la page de connexion de SocialFlow le refuse
//    (PORTAL_REQUIRED) et lui indique le portail de son cabinet.
//  - Le portail d'un cabinet n'accepte que ses propres comptes (WRONG_PORTAL) :
//    un autre cabinet, ou le SuperAdmin, y est refuse.
//  - Le Cabinet RH et le SuperAdmin se connectent par SocialFlow (pas de portail).
export type PortalVerdict =
  | { ok: true }
  | { ok: false; reason: 'PORTAL_REQUIRED'; portalSlug: string | null }
  | { ok: false; reason: 'WRONG_PORTAL' };

export async function checkPortalAccess(
  user: { role?: string | null; cabinetId?: string | null },
  announcedSlug: string | null,
): Promise<PortalVerdict> {
  if (announcedSlug) {
    const portalCabinetId = await cabinetIdForSlug(announcedSlug);
    // Portail inconnu, ou compte d'un autre cabinet (y compris le SuperAdmin).
    if (!portalCabinetId || !user.cabinetId || user.cabinetId !== portalCabinetId) {
      return { ok: false, reason: 'WRONG_PORTAL' };
    }
    return { ok: true };
  }

  if (isPortalRole(user.role)) {
    // La personne a de bons identifiants : on peut lui nommer son portail.
    const portalSlug = user.cabinetId ? await ensureCabinetSlug(user.cabinetId) : null;
    return { ok: false, reason: 'PORTAL_REQUIRED', portalSlug };
  }
  return { ok: true };
}
