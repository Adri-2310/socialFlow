// Libelles affichables des roles (D3-D6, FONCTIONNEMENT.md § 2). Le code du
// role (`GESTIONNAIRE_RH`) ne doit jamais s'afficher tel quel a l'utilisateur.
export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'SuperAdmin',
  CABINET_RH: 'Cabinet RH',
  GESTIONNAIRE_RH: 'Gestionnaire RH',
  ENTREPRISE_CLIENTE: 'Entreprise cliente',
  COLLABORATEUR: 'Collaborateur',
};

export function roleDisplayLabel(role: string | null | undefined): string {
  if (!role) return '';
  return ROLE_DISPLAY_LABELS[role] ?? role;
}
