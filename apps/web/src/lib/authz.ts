import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '../../generated/prisma/client';

// Matrice des permissions en code (doc/PERMISSIONS.md). Chaque ligne du document
// est une action ; son identifiant sert dans les routes et dans les tests.
// tests/lib/authz.test.ts compare ce catalogue au document case par case : une
// ligne ou une case modifiée d'un côté seulement fait échouer les tests.

export const ROLES = [
  'SUPER_ADMIN',
  'CABINET_RH',
  'GESTIONNAIRE_RH',
  'ENTREPRISE_CLIENTE',
  'COLLABORATEUR',
] as const;
export type Role = (typeof ROLES)[number];

// Légende de PERMISSIONS.md : ✅ ALLOW, 🔸 SCOPED (dans son périmètre),
// 📊 COUNTERS (compteurs et statuts uniquement), ❌ DENY.
export type Level = 'ALLOW' | 'SCOPED' | 'COUNTERS' | 'DENY';

const A: Level = 'ALLOW';
const S: Level = 'SCOPED';
const C: Level = 'COUNTERS';
const D: Level = 'DENY';

type ActionRule = {
  // Texte exact de la première colonne de PERMISSIONS.md.
  label: string;
  levels: Record<Role, Level>;
  // Écriture : refusée (423 CABINET_READ_ONLY) quand le cabinet est en lecture
  // seule (D29, D71). Une route peut le préciser au cas par cas (voir authorize).
  write?: boolean;
  // D20 : la 2FA est exigée du SuperAdmin pour toute action, sauf celles qui
  // doivent rester possibles sans elle (activer la 2FA depuis le profil).
  twoFactorExempt?: boolean;
};

// Ordre des niveaux : SuperAdmin, Cabinet RH, Gestionnaire, Entreprise, Collaborateur.
function rule(
  label: string,
  levels: [Level, Level, Level, Level, Level],
  options?: { write?: boolean; twoFactorExempt?: boolean },
): ActionRule {
  const [superAdmin, cabinetRh, gestionnaire, entreprise, collaborateur] = levels;
  return {
    label,
    levels: {
      SUPER_ADMIN: superAdmin,
      CABINET_RH: cabinetRh,
      GESTIONNAIRE_RH: gestionnaire,
      ENTREPRISE_CLIENTE: entreprise,
      COLLABORATEUR: collaborateur,
    },
    ...options,
  };
}

export const ACTIONS = {
  // --- Plateforme et comptes ---
  'cabinet.administrer': rule('Voir / suspendre / archiver / restaurer un cabinet', [A, D, D, D, D]),
  'cabinet.modifier-identite': rule("Modifier l'identité d'un cabinet", [A, S, D, D, D], { write: true }),
  'utilisateur.lister': rule('Voir tous les utilisateurs de la plateforme', [A, D, D, D, D]),
  'utilisateur.suspendre-archiver': rule('Suspendre / archiver un utilisateur', [A, D, D, D, D]),
  'utilisateur.support': rule(
    'Révoquer les sessions / envoyer un lien de réinitialisation',
    [A, D, D, D, D],
  ),
  'superadmin.inviter': rule('Inviter un SuperAdmin', [A, D, D, D, D]),
  'plan.gerer': rule('Gérer les plans tarifaires et les quotas', [A, D, D, D, D]),
  'bareme.valider': rule('Valider / activer une version de barème', [A, D, D, D, D]),
  'plateforme.superviser': rule('Monitoring, facturation globale', [A, D, D, D, D]),
  'audit.voir': rule("Journal d'audit", [A, S, D, D, D]),
  'abonnement.gerer': rule('Gérer son abonnement (portail Stripe)', [D, A, D, D, D]),
  'cabinet.personnaliser': rule("Branding et modèles d'emails", [D, A, D, D, D], { write: true }),
  'cabinet.exporter': rule('Exporter les données du cabinet', [D, A, D, D, D]),
  'compte.gerer': rule('Profil, mot de passe, 2FA, comptes liés', [A, A, A, A, A], { twoFactorExempt: true }),

  // --- Équipe et portefeuille ---
  'gestionnaire.inviter': rule('Inviter / renvoyer / révoquer un gestionnaire', [D, A, D, D, D], { write: true }),
  'gestionnaire.desactiver': rule('Désactiver un gestionnaire', [D, A, D, D, D], { write: true }),
  'gestionnaire.modifier-email': rule("Corriger l'adresse d'un gestionnaire", [D, A, D, D, D], { write: true }),
  'entreprise.gerer': rule('Créer / modifier / archiver une entreprise', [D, A, D, D, D], { write: true }),
  'entreprise.assigner': rule('Assigner des gestionnaires à une entreprise', [D, A, D, D, D], { write: true }),
  'entreprise.inviter-admin': rule("Inviter l'admin d'une entreprise", [D, A, D, D, D], { write: true }),
  'entreprise.retirer-admin': rule("Retirer l'admin d'une entreprise", [D, A, D, D, D], { write: true }),
  // D78 : le gestionnaire assigné peut remplacer l'admin, jamais inviter le premier.
  'entreprise.remplacer-admin': rule("Remplacer l'admin d'une entreprise", [D, A, S, D, D], { write: true }),
  'entreprise.lister': rule('Voir la liste des entreprises', [D, A, S, S, D]),

  // --- Dossiers salariés ---
  'salarie.lister': rule('Voir la liste des salariés', [D, C, S, S, D]),
  'salarie.voir': rule('Voir un dossier complet', [D, D, S, S, S]),
  'salarie.devoiler-donnees-sensibles': rule('Dévoiler NISS / IBAN (journalisé)', [D, D, S, S, S]),
  'salarie.gerer': rule('Créer / importer / modifier / archiver un dossier', [D, D, S, D, D], { write: true }),
  'salarie.inviter-portail': rule('Inviter un salarié au portail', [D, D, S, D, D], { write: true }),
  'demande.creer': rule('Créer une demande (engagement, sortie, modification)', [D, D, D, S, D], { write: true }),
  'demande.creer-correction': rule('Créer une demande de correction de ses données', [D, D, D, D, S], {
    write: true,
  }),
  'demande.traiter': rule('Traiter une demande (accepter / refuser)', [D, D, S, D, D], { write: true }),

  // --- Paie ---
  'periode.ouvrir': rule('Ouvrir une période', [D, D, S, D, D], { write: true }),
  'prestation.encoder': rule('Encoder les prestations', [D, D, S, S, D], { write: true }),
  'prestation.verrouiller': rule('Verrouiller les prestations', [D, D, S, D, D], { write: true }),
  'fiche.gerer-brouillon': rule('Créer / modifier / recalculer une fiche `BROUILLON`', [D, D, S, D, D], {
    write: true,
  }),
  'fiche.soumettre': rule('Soumettre à validation', [D, D, S, D, D], { write: true }),
  'fiche.valider': rule('Valider / rejeter (motif obligatoire)', [D, D, D, S, D], { write: true }),
  'fiche.envoyer': rule('Envoyer au salarié', [D, D, S, D, D], { write: true }),
  'fiche.rectifier': rule('Créer une rectificative', [D, D, S, D, D], { write: true }),
  'fiche.voir': rule("Voir le détail d'une fiche", [D, D, S, S, S]),
  'paie.statistiques': rule('Voir des statistiques de paie', [D, C, S, S, D]),

  // --- Déclarations, calendrier, collaboration ---
  // « Envoyer » est une écriture : la route d'envoi le précisera (write: true).
  'declaration.suivre': rule('Envoyer / suivre DIMONA, DmfA, C4', [D, C, S, S, D]),
  'calendrier.voir': rule('Voir le calendrier des échéances', [D, C, S, S, D]),
  'messagerie.utiliser': rule("Messagerie (fil de l'entreprise)", [D, D, S, S, D], { write: true }),
  'document.deposer': rule('Déposer un document', [D, D, S, S, D], { write: true }),
  'document.voir': rule('Voir les documents', [D, D, S, S, S]),
  'exact.connecter': rule('Connecter Exact Online (Pro et +)', [D, A, D, D, D], { write: true }),
  'exact.associer-entreprise': rule('Associer une entreprise à une division Exact', [D, D, S, D, D], {
    write: true,
  }),
  'export-rgpd.demander': rule('Export RGPD de ses propres données', [A, A, A, A, A], {
    twoFactorExempt: true,
  }),
} satisfies Record<string, ActionRule>;

export type ActionId = keyof typeof ACTIONS;

// Niveau d'un rôle pour une action. Tout rôle inconnu ou absent est refusé.
export function levelFor(action: ActionId, role: string | null | undefined): Level {
  return ACTIONS[action].levels[role as Role] ?? D;
}

type Guard = Awaited<ReturnType<typeof requireApiSession>>;
type Session = NonNullable<Guard['session']>;

// Périmètre de données d'une session (doc/FONCTIONNEMENT.md § 4), déduit à chaque
// requête de la base et jamais d'une liste stockée dans la session ni envoyée par
// le client :
//   platform    SuperAdmin : la plateforme, jamais les données métier (D8)
//   cabinet     Cabinet RH : son cabinet
//   entreprises Gestionnaire : les entreprises (non archivées) qui lui sont assignées
//   entreprise  Entreprise cliente : sa seule entreprise
//   self        Collaborateur : son seul compte
export type Scope =
  | { kind: 'platform' }
  | { kind: 'cabinet'; cabinetId: string }
  | { kind: 'entreprises'; cabinetId: string; entrepriseIds: string[] }
  | { kind: 'entreprise'; cabinetId: string; entrepriseId: string }
  | { kind: 'self'; userId: string };

type ScopeUser = { id: string; role?: string | null; cabinetId?: string | null };

// Renvoie null quand le compte n'a aucun périmètre exploitable (rôle inconnu,
// pas de cabinet, administrateur sans entreprise) : l'accès est alors refusé.
export async function resolveScope(user: ScopeUser): Promise<Scope | null> {
  switch (user.role) {
    case 'SUPER_ADMIN':
      return { kind: 'platform' };
    case 'COLLABORATEUR':
      return { kind: 'self', userId: user.id };
    case 'CABINET_RH':
      return user.cabinetId ? { kind: 'cabinet', cabinetId: user.cabinetId } : null;
    case 'GESTIONNAIRE_RH': {
      if (!user.cabinetId) return null;
      const assignments = await prisma.gestionnaireEntreprise.findMany({
        where: { userId: user.id, entreprise: { cabinetId: user.cabinetId, deletedAt: null } },
        select: { entrepriseId: true },
      });
      return {
        kind: 'entreprises',
        cabinetId: user.cabinetId,
        entrepriseIds: assignments.map((a) => a.entrepriseId),
      };
    }
    case 'ENTREPRISE_CLIENTE': {
      if (!user.cabinetId) return null;
      const entreprise = await prisma.entreprise.findFirst({
        where: { adminUserId: user.id, cabinetId: user.cabinetId, deletedAt: null },
        select: { id: true },
      });
      return entreprise ? { kind: 'entreprise', cabinetId: user.cabinetId, entrepriseId: entreprise.id } : null;
    }
    default:
      return null;
  }
}

// Filtre Prisma des entreprises visibles dans un périmètre. Fermé par défaut :
// un périmètre sans entreprises (plateforme, collaborateur) ne voit rien.
export function entrepriseWhere(scope: Scope): Prisma.EntrepriseWhereInput {
  switch (scope.kind) {
    case 'cabinet':
      return { cabinetId: scope.cabinetId };
    case 'entreprises':
      return { cabinetId: scope.cabinetId, id: { in: scope.entrepriseIds } };
    case 'entreprise':
      return { cabinetId: scope.cabinetId, id: scope.entrepriseId };
    default:
      return { id: { in: [] } };
  }
}

export type AuthzResult =
  | { session: Session; level: Exclude<Level, 'DENY'>; scope: Scope; response?: never }
  | { session?: never; level?: never; scope?: never; response: NextResponse };

// Contrôle d'accès d'une route d'API (doc/CONVENTIONS.md § 3, étapes 1 et 2).
// Ordre des refus : session (401), rôle selon la matrice (403), lecture seule du
// cabinet (423, actions d'écriture), 2FA du SuperAdmin (403 TWO_FACTOR_REQUIRED),
// cabinet requis pour tout autre rôle (403).
//
// `level` dit comment la route doit lire les données : SCOPED = filtrer par
// périmètre, COUNTERS = compteurs et statuts uniquement. `scope` est ce périmètre
// (voir Scope) ; un compte sans périmètre exploitable est refusé (403).
//
// Usage :
//   const authz = await authorize(request, 'entreprise.gerer');
//   if (authz.response) return authz.response;
//   const { session, scope } = authz;
export async function authorize(
  request: Request,
  action: ActionId,
  options?: { write?: boolean },
): Promise<AuthzResult> {
  const rule: ActionRule = ACTIONS[action];
  const allowedRoles = ROLES.filter((role) => rule.levels[role] !== D);

  const guard = await requireApiSession(request, {
    role: allowedRoles,
    writable: options?.write ?? rule.write ?? false,
  });
  if (guard.response) return { response: guard.response };
  const { session } = guard;

  const role = session.user.role as Role;
  if (role === 'SUPER_ADMIN') {
    if (!rule.twoFactorExempt && !session.user.twoFactorEnabled) {
      return { response: NextResponse.json({ error: 'TWO_FACTOR_REQUIRED' }, { status: 403 }) };
    }
  } else if (!session.user.cabinetId) {
    return { response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
  }

  const scope = await resolveScope(session.user);
  if (!scope) {
    return { response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
  }

  return { session, level: rule.levels[role] as Exclude<Level, 'DENY'>, scope };
}
