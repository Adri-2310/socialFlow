// Libelles et filtres du journal d'audit du cabinet (D31, roles/02-cabinet-rh.md
// § 4.6). Module pur, sans acces donnees : utilisable par les composants et
// les tests sans base.

// Actions visibles par un Cabinet RH, regroupees pour le filtre. N'en font pas
// partie : la configuration de la plateforme (PRICING_PLAN_*) et le cycle de
// vie du cabinet lui-meme (CABINET_* : creation, suspension, archivage),
// qui ne concernent pas le travail d'equipe que le journal retrace.
export const CABINET_AUDIT_ACTIONS = {
  INVITATION_SENT: 'Invitation envoyée',
  INVITATION_RESENT: 'Invitation renvoyée',
  INVITATION_REVOKED: 'Invitation révoquée',
  INVITATION_ACCEPTED: 'Invitation acceptée',
  USER_SUSPENDED: 'Gestionnaire suspendu',
  USER_REACTIVATED: 'Gestionnaire réactivé',
  USER_ARCHIVED: 'Gestionnaire retiré',
  USER_RESTORED: 'Gestionnaire restauré',
  USER_EMAIL_CHANGED: 'Email modifié',
  ENTREPRISE_CREATED: 'Entreprise créée',
  ENTREPRISE_UPDATED: 'Entreprise modifiée',
  ENTREPRISE_ARCHIVED: 'Entreprise archivée',
  ENTREPRISE_RESTORED: 'Entreprise restaurée',
  SUBSCRIPTION_CANCEL_SCHEDULED: 'Résiliation programmée',
  SUBSCRIPTION_CANCEL_REVERTED: 'Résiliation annulée',
  PAYMENT_METHOD_UPDATED: 'Carte bancaire modifiée',
  PLAN_CHANGE_SCHEDULED: 'Changement de plan programmé',
  PLAN_CHANGE_CANCELLED: 'Changement de plan annulé',
  CABINET_SETTINGS_UPDATED: 'Paramètres du cabinet modifiés',
} as const;

export type CabinetAuditAction = keyof typeof CABINET_AUDIT_ACTIONS;

export const CABINET_AUDIT_ACTION_LIST = Object.keys(CABINET_AUDIT_ACTIONS) as CabinetAuditAction[];

export function isCabinetAuditAction(value: unknown): value is CabinetAuditAction {
  return typeof value === 'string' && value in CABINET_AUDIT_ACTIONS;
}

// Nom affiche pour l'auteur d'une action du SuperAdmin : le cabinet voit
// qu'il s'agit de l'administration, jamais l'identite de la personne.
export const PLATFORM_ACTOR_LABEL = 'Administration SocialFlow';

export type AuditMessageInput = {
  action: string;
  targetName: string | null;
  email: string | null;
  previousEmail: string | null;
  newEmail: string | null;
  // Raison sociale de l'entreprise concernee (metadata), pour ENTREPRISE_*.
  entreprise?: string | null;
};

// Phrase d'une entree, sans l'auteur (affiche a part). Une action inconnue
// retombe sur son code plutot que de disparaitre.
export function describeAuditEntry(input: AuditMessageInput): string {
  const target = input.targetName ?? 'Un utilisateur supprimé';
  const email = input.email ?? 'une adresse inconnue';

  switch (input.action) {
    // D5 : une invitation d'administrateur d'entreprise nomme l'entreprise.
    case 'INVITATION_SENT':
      return input.entreprise
        ? `Invitation de l'administrateur de ${input.entreprise} envoyée à ${email}`
        : `Invitation envoyée à ${email}`;
    case 'INVITATION_RESENT':
      return input.entreprise
        ? `Invitation de l'administrateur de ${input.entreprise} renvoyée à ${email}`
        : `Invitation renvoyée à ${email}`;
    case 'INVITATION_REVOKED':
      return input.entreprise
        ? `Invitation de l'administrateur de ${input.entreprise} (${email}) révoquée`
        : `Invitation de ${email} révoquée`;
    case 'INVITATION_ACCEPTED':
      return input.entreprise
        ? `${email} a accepté son invitation et administre ${input.entreprise}`
        : `${email} a accepté son invitation`;
    case 'USER_SUSPENDED':
      return `${target} a été suspendu`;
    case 'USER_REACTIVATED':
      return `${target} a été réactivé`;
    case 'USER_ARCHIVED':
      // D5 : retrait de l'administrateur d'une entreprise (remplacement).
      return input.entreprise
        ? `L'administrateur de ${input.entreprise} (${target}) a été retiré`
        : `${target} a été retiré du cabinet`;
    case 'USER_RESTORED':
      return `${target} a été restauré`;
    case 'USER_EMAIL_CHANGED':
      return input.previousEmail && input.newEmail
        ? `L'email de ${target} a été modifié (${input.previousEmail} → ${input.newEmail})`
        : `L'email de ${target} a été modifié`;
    case 'ENTREPRISE_CREATED':
      return `L'entreprise ${input.entreprise ?? 'cliente'} a été créée`;
    case 'ENTREPRISE_UPDATED':
      return `L'entreprise ${input.entreprise ?? 'cliente'} a été modifiée`;
    case 'ENTREPRISE_ARCHIVED':
      return `L'entreprise ${input.entreprise ?? 'cliente'} a été archivée`;
    case 'ENTREPRISE_RESTORED':
      return `L'entreprise ${input.entreprise ?? 'cliente'} a été restaurée`;
    case 'SUBSCRIPTION_CANCEL_SCHEDULED':
      return "La résiliation de l'abonnement a été programmée en fin de période";
    case 'SUBSCRIPTION_CANCEL_REVERTED':
      return "La résiliation de l'abonnement a été annulée";
    case 'PAYMENT_METHOD_UPDATED':
      return 'La carte bancaire de l’abonnement a été modifiée';
    case 'PLAN_CHANGE_SCHEDULED':
      return "Un changement de plan a été programmé en fin de période";
    case 'PLAN_CHANGE_CANCELLED':
      return "Le changement de plan programmé a été annulé";
    case 'CABINET_SETTINGS_UPDATED':
      return 'Les paramètres du cabinet ont été modifiés';
    default:
      return input.action;
  }
}

// Une date de filtre (AAAA-MM-JJ) : jour entier en heure de Bruxelles, pour
// qu'un filtre sur le 13/10 couvre bien la journee vecue par l'utilisateur et
// non la journee UTC du serveur.
const BRUSSELS = 'Europe/Brussels';
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseBrusselsDayStart(value: string | undefined | null): Date | null {
  const match = value ? DAY_PATTERN.exec(value) : null;
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  // Date reelle (refuse 2026-02-31).
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: BRUSSELS,
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  // Bruxelles est a UTC+1 ou UTC+2 : on retient le decalage qui donne minuit.
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, 0, 0) - offsetHours * 3_600_000);
    const parts = Object.fromEntries(
      formatter.formatToParts(candidate).map((p) => [p.type, p.value]),
    );
    if (parts.day === d && parts.hour === '00' && parts.minute === '00') return candidate;
  }
  return check;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
