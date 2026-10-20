import { isReadOnlyBillingStatus } from '@/lib/billing/billing';

// Suspension manuelle d'un cabinet par le SuperAdmin (D71). Module pur : partage
// entre le serveur, les composants et les tests.
//
//  - READ_ONLY : lecture seule, comme l'impaye (D29). Les connexions restent
//    possibles, toute ecriture est refusee (423 CABINET_READ_ONLY).
//  - BLOCKED : blocage total des connexions, choisi explicitement pour les cas
//    graves (compte compromis, fraude, abus).

export const SUSPENSION_TYPES = ['READ_ONLY', 'BLOCKED'] as const;
export type SuspensionType = (typeof SUSPENSION_TYPES)[number];

// Longueur maximale du motif saisi par le SuperAdmin.
export const SUSPENSION_REASON_MAX = 500;

export type CabinetSuspensionFields = {
  status: string;
  suspensionType?: string | null;
};

// Nature de la suspension, null si le cabinet n'est pas suspendu. Une suspension
// anterieure a D71 (status "suspendu" sans type) bloquait toutes les connexions :
// elle reste un blocage total tant que le SuperAdmin ne la change pas.
export function suspensionTypeOf(cabinet: CabinetSuspensionFields): SuspensionType | null {
  if (cabinet.status !== 'suspendu') return null;
  return cabinet.suspensionType === 'READ_ONLY' ? 'READ_ONLY' : 'BLOCKED';
}

// Les connexions sont refusees : blocage total, ou cabinet archive.
export function isLoginBlocked(cabinet: CabinetSuspensionFields & { deletedAt?: Date | null }): boolean {
  return !!cabinet.deletedAt || suspensionTypeOf(cabinet) === 'BLOCKED';
}

// Toute ecriture est refusee : lecture seule pour impaye ou resiliation (D29),
// ou suspension en lecture seule (D71). Un cabinet en blocage total n'a pas de
// session, mais reste en lecture seule par prudence.
export function isCabinetReadOnly(
  cabinet: CabinetSuspensionFields & { billingStatus?: string | null },
): boolean {
  return isReadOnlyBillingStatus(cabinet.billingStatus) || suspensionTypeOf(cabinet) !== null;
}
