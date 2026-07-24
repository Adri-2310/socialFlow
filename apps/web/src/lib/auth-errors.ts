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
  FAILED_TO_UNLINK_LAST_ACCOUNT: 'Impossible de délier votre dernier moyen de connexion.',
  ACCOUNT_NOT_FOUND: 'Compte introuvable.',
  SESSION_NOT_FRESH: 'Reconnectez-vous pour effectuer cette action.',
  SESSION_EXPIRED: 'Session expirée. Reconnectez-vous.',

  // Codes de redirection du flux OAuth (connexion Google/Microsoft) - minuscules,
  // distincts des codes d'API ci-dessus.
  account_not_linked:
    "Un compte existe déjà avec cet email mais n'est pas encore vérifié. Connectez-vous avec votre mot de passe, puis liez ce fournisseur depuis le tableau de bord.",
  "email_doesn't_match":
    "L'email de ce compte ne correspond pas à celui de votre compte SocialFlow.",
  account_already_linked_to_different_user: 'Ce compte est déjà lié à un autre utilisateur.',
  unable_to_link_account: 'Impossible de lier ce compte. Réessayez.',
  oauth_provider_not_found: 'Ce fournisseur de connexion est introuvable.',
  no_code: 'La connexion a été interrompue. Réessayez.',
  invalid_code: 'Code d’autorisation invalide. Réessayez.',
  unable_to_get_user_info: 'Impossible de récupérer vos informations. Réessayez.',
  no_callback_url: 'Configuration de redirection manquante.',
  email_not_found: 'Aucun email associé à ce compte.',
  signup_disabled:
    "Aucun compte SocialFlow n'est associé. Créez un compte depuis la page d'inscription.",
  unable_to_create_user: 'Impossible de créer votre compte. Réessayez.',
  unable_to_create_session: 'Impossible de démarrer votre session. Réessayez.',
  invalid_callback_request: 'Requête de connexion invalide.',
  internal_server_error: 'Erreur interne. Réessayez dans quelques instants.',

  // Lien magique (redirection depuis l'email cliqué).
  INVALID_TOKEN: 'Ce lien de connexion est invalide ou a déjà été utilisé. Demandez-en un nouveau.',
  new_user_signup_disabled:
    "Aucun compte SocialFlow n'est associé à cet email. Créez un compte depuis la page d'inscription.",
  failed_to_create_session: 'Impossible de démarrer votre session. Réessayez.',
  failed_to_create_user: 'Impossible de créer votre compte. Réessayez.',

  // Code par email (réponses API directes, pas une redirection).
  OTP_EXPIRED: 'Ce code a expiré. Demandez-en un nouveau.',
  INVALID_OTP: 'Code invalide. Réessayez.',
  TOO_MANY_ATTEMPTS: 'Trop de tentatives. Demandez un nouveau code.',

  // Modification du profil (nom, email, mot de passe).
  TOKEN_EXPIRED: 'Ce lien a expiré. Recommencez la demande.',
  USER_NOT_FOUND: 'Utilisateur introuvable.',
  INVALID_USER: 'Cette action ne correspond pas à votre session actuelle.',
  CHANGE_EMAIL_DISABLED: "Le changement d'email n'est pas disponible.",
  EMAIL_CAN_NOT_BE_UPDATED: "L'email ne peut pas être modifié de cette façon.",
};

const DEFAULT_MESSAGE = 'Une erreur est survenue. Veuillez réessayer.';

export function translateAuthError(code?: string): string {
  if (!code) return DEFAULT_MESSAGE;
  return MESSAGES[code] ?? DEFAULT_MESSAGE;
}
