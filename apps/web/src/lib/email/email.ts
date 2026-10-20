// Façade des envois d'emails : le code applicatif (et les mocks des tests) importent
// toujours ce fichier, jamais les sous-fichiers ci-dessous. Découpage par famille :
//   email-core         client Resend et éléments communs
//   email-account      emails de compte
//   email-invitations  invitations, bienvenue, changements d'accès (au nom du cabinet)
//   email-billing      emails de paiement de la plateforme
export * from '@/lib/email/email-account';
export * from '@/lib/email/email-invitations';
export * from '@/lib/email/email-billing';
