const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Email ou mot de passe incorrect.',
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_NOT_VERIFIED: "Cette adresse email n'a pas encore été vérifiée.",
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 8 caractères.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long.',
  USER_ALREADY_EXISTS: 'Un compte existe déjà avec cette adresse email.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Un compte existe déjà avec cette adresse email.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'Aucun compte ne correspond à ces identifiants.',
  INVALID_PASSWORD: 'Mot de passe incorrect.',
  INVALID_CODE: 'Code invalide. Réessayez.',
  INVALID_BACKUP_CODE: 'Code de secours invalide.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Trop de tentatives. Demandez un nouveau code.',
  ACCOUNT_TEMPORARILY_LOCKED: 'Compte temporairement verrouillé suite à trop de tentatives.',
  INVALID_TWO_FACTOR_COOKIE: 'Session de vérification expirée. Reconnectez-vous.',
  TWO_FACTOR_NOT_ENABLED: "L'authentification à deux facteurs n'est pas activée.",
};

const DEFAULT_MESSAGE = 'Une erreur est survenue. Veuillez réessayer.';

export function translateAuthError(code?: string): string {
  if (!code) return DEFAULT_MESSAGE;
  return MESSAGES[code] ?? DEFAULT_MESSAGE;
}
