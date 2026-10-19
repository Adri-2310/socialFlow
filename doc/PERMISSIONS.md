# Matrice des permissions

> Référence unique « action × rôle ». Les fiches de rôles (`roles/`) détaillent le contexte ; en cas de doute, **ce tableau fait foi** pour l'implémentation et les tests d'autorisation.
> Légende : ✅ autorisé · 🔸 autorisé dans son périmètre · 📊 compteurs/statuts uniquement · ❌ interdit

Périmètres : **Cabinet RH** = son cabinet ; **Gestionnaire** = entreprises qui lui sont assignées ; **Entreprise** = sa seule entreprise ; **Collaborateur** = son seul dossier.

## Plateforme et comptes

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur |
|---|---|---|---|---|---|
| Voir / suspendre / archiver / restaurer un cabinet | ✅ | ❌ | ❌ | ❌ | ❌ |
| Modifier l'identité d'un cabinet | ✅ | 🔸 | ❌ | ❌ | ❌ |
| Voir tous les utilisateurs de la plateforme | ✅ | ❌ | ❌ | ❌ | ❌ |
| Suspendre / archiver un utilisateur | ✅ (sauf SuperAdmin) | ❌ | ❌ | ❌ | ❌ |
| Révoquer les sessions / envoyer un lien de réinitialisation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inviter un SuperAdmin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gérer les plans tarifaires et les quotas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Valider / activer une version de barème | ✅ | ❌ | ❌ | ❌ | ❌ |
| Monitoring, facturation globale | ✅ | ❌ | ❌ | ❌ | ❌ |
| Journal d'audit | ✅ global | 🔸 son cabinet | ❌ | ❌ | ❌ |
| Gérer son abonnement (portail Stripe) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Branding et modèles d'emails | ❌ | ✅ | ❌ | ❌ | ❌ |
| Exporter les données du cabinet | ❌ | ✅ | ❌ | ❌ | ❌ |
| Profil, mot de passe, 2FA, comptes liés | ✅ (2FA obligatoire) | ✅ | ✅ | ✅ | ✅ |

## Équipe et portefeuille

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur |
|---|---|---|---|---|---|
| Inviter / renvoyer / révoquer un gestionnaire | ❌ | ✅ (quota) | ❌ | ❌ | ❌ |
| Désactiver un gestionnaire | ❌ | ✅ si toutes ses entreprises restent couvertes | ❌ | ❌ | ❌ |
| Corriger l'adresse d'un gestionnaire | ❌ | ✅ | ❌ | ❌ | ❌ |
| Créer / modifier / archiver une entreprise | ❌ | ✅ (quota) | ❌ | ❌ | ❌ |
| Assigner des gestionnaires à une entreprise | ❌ | ✅ | ❌ | ❌ | ❌ |
| Inviter l'admin d'une entreprise | ❌ | ✅ | ❌ | ❌ | ❌ |
| Retirer l'admin d'une entreprise | ❌ | ✅ | ❌ | ❌ | ❌ |
| Remplacer l'admin d'une entreprise | ❌ | ✅ | 🔸 | ❌ | ❌ |
| Voir la liste des entreprises | ❌ | ✅ | 🔸 | 🔸 la sienne | ❌ |

D78 : le gestionnaire assigné ne peut que **remplacer** l'administrateur d'une entreprise (jamais inviter un premier administrateur) ; une entreprise qui ne lui est pas assignée est introuvable (404).

## Dossiers salariés

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur |
|---|---|---|---|---|---|
| Voir la liste des salariés | ❌ | 📊 | 🔸 | 🔸 | ❌ |
| Voir un dossier complet | ❌ | ❌ | 🔸 | 🔸 | 🔸 le sien |
| Dévoiler NISS / IBAN (journalisé) | ❌ | ❌ | 🔸 | 🔸 | 🔸 le sien |
| Créer / importer / modifier / archiver un dossier | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Inviter un salarié au portail | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Créer une demande (engagement, sortie, modification) | ❌ | ❌ | ❌ | 🔸 | ❌ |
| Créer une demande de correction de ses données | ❌ | ❌ | ❌ | ❌ | 🔸 |
| Traiter une demande (accepter / refuser) | ❌ | ❌ | 🔸 | ❌ | ❌ |

## Paie

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur |
|---|---|---|---|---|---|
| Ouvrir une période | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Encoder les prestations | ❌ | ❌ | 🔸 (toujours) | 🔸 jusqu'à la date limite | ❌ |
| Verrouiller les prestations | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Créer / modifier / recalculer une fiche `BROUILLON` | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Soumettre à validation | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Valider / rejeter (motif obligatoire) | ❌ | ❌ | ❌ | 🔸 | ❌ |
| Envoyer au salarié | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Créer une rectificative | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Voir le détail d'une fiche | ❌ | ❌ | 🔸 | 🔸 (y compris coût employeur) | 🔸 la sienne, `ENVOYEE` / `REMPLACEE` |
| Voir des statistiques de paie | ❌ | 📊 | 🔸 | 🔸 | ❌ |

## Déclarations, calendrier, collaboration

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur |
|---|---|---|---|---|---|
| Envoyer / suivre DIMONA, DmfA, C4 | ❌ | 📊 | 🔸 | 🔸 lecture | ❌ |
| Voir le calendrier des échéances | ❌ | 📊 | 🔸 | 🔸 | ❌ |
| Messagerie (fil de l'entreprise) | ❌ | ❌ | 🔸 | 🔸 | ❌ |
| Déposer un document | ❌ | ❌ | 🔸 | 🔸 | ❌ |
| Voir les documents | ❌ | ❌ | 🔸 | 🔸 | 🔸 les siens |
| Connecter Exact Online (Pro et +) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Associer une entreprise à une division Exact | ❌ | ❌ | 🔸 | ❌ | ❌ |
| Export RGPD de ses propres données | ✅ | ✅ | ✅ | ✅ | ✅ |

## États bloquants

| Situation | Effet |
|---|---|
| Cabinet `en attente de paiement` | Titulaire : seul l'écran « reprendre le paiement » ; aucun autre compte n'existe encore |
| Cabinet en **délai de grâce** | Tout fonctionne ; bandeau d'alerte chez le Cabinet RH |
| Cabinet **suspendu** ou en **lecture seule** | Cabinet RH : abonnement, export, lecture. Gestionnaire : lecture seule. Entreprise et Collaborateur : lecture seule (D29). Toute écriture → `423 CABINET_READ_ONLY` |
| Cabinet **archivé** | Aucune connexion |
| Utilisateur suspendu ou archivé | Aucune connexion |

## Implémentation

- Une fonction centrale `authorize(session, action, ressource)` dans `lib/authz.ts`, appelée par chaque route. Pas de contrôle de rôle dispersé « à la main ».
- Les noms d'actions de ce document (`fiche.valider`, `entreprise.creer`…) servent d'identifiants dans le code et dans les tests.
- Un test paramétré parcourt **toute** la matrice : chaque case ❌ doit renvoyer 403 ou 404, chaque case ✅ / 🔸 doit réussir dans le périmètre et échouer hors périmètre.
