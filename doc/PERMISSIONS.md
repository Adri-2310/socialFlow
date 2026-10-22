# Matrice des permissions

> Référence unique « action × rôle ». Les fiches de rôles (`roles/`) détaillent le contexte ; en cas de doute, **ce tableau fait foi** pour l'implémentation et les tests d'autorisation.
> Légende : ✅ autorisé · 🔸 autorisé dans son périmètre · 📊 compteurs/statuts uniquement · ❌ interdit

Périmètres : **Cabinet RH** = son cabinet ; **Gestionnaire** = entreprises qui lui sont assignées ; **Entreprise** = sa seule entreprise ; **Collaborateur** = son seul dossier.

## Plateforme et comptes

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur | Identifiant |
|---|---|---|---|---|---|---|
| Voir / suspendre / archiver / restaurer un cabinet | ✅ | ❌ | ❌ | ❌ | ❌ | `cabinet.administrer` |
| Modifier l'identité d'un cabinet | ✅ | 🔸 | ❌ | ❌ | ❌ | `cabinet.modifier-identite` |
| Voir tous les utilisateurs de la plateforme | ✅ | ❌ | ❌ | ❌ | ❌ | `utilisateur.lister` |
| Suspendre / archiver un utilisateur | ✅ (sauf SuperAdmin) | ❌ | ❌ | ❌ | ❌ | `utilisateur.suspendre-archiver` |
| Révoquer les sessions / envoyer un lien de réinitialisation | ✅ | ❌ | ❌ | ❌ | ❌ | `utilisateur.support` |
| Inviter un SuperAdmin | ✅ | ❌ | ❌ | ❌ | ❌ | `superadmin.inviter` |
| Gérer les plans tarifaires et les quotas | ✅ | ❌ | ❌ | ❌ | ❌ | `plan.gerer` |
| Valider / activer une version de barème | ✅ | ❌ | ❌ | ❌ | ❌ | `bareme.valider` |
| Monitoring, facturation globale | ✅ | ❌ | ❌ | ❌ | ❌ | `plateforme.superviser` |
| Journal d'audit | ✅ global | 🔸 son cabinet | ❌ | ❌ | ❌ | `audit.voir` |
| Gérer son abonnement (portail Stripe) | ❌ | ✅ | ❌ | ❌ | ❌ | `abonnement.gerer` |
| Branding et modèles d'emails | ❌ | ✅ | ❌ | ❌ | ❌ | `cabinet.personnaliser` |
| Exporter les données du cabinet | ❌ | ✅ | ❌ | ❌ | ❌ | `cabinet.exporter` |
| Voir le tableau de bord du cabinet | ❌ | ✅ | ❌ | ❌ | ❌ | `cabinet.consulter` |
| Profil, mot de passe, 2FA, comptes liés | ✅ (2FA obligatoire) | ✅ | ✅ | ✅ | ✅ | `compte.gerer` |

## Équipe et portefeuille

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur | Identifiant |
|---|---|---|---|---|---|---|
| Voir l'équipe de gestionnaires | ❌ | ✅ | ❌ | ❌ | ❌ | `gestionnaire.lister` |
| Inviter / renvoyer / révoquer un gestionnaire | ❌ | ✅ (quota) | ❌ | ❌ | ❌ | `gestionnaire.inviter` |
| Désactiver un gestionnaire | ❌ | ✅ si toutes ses entreprises restent couvertes | ❌ | ❌ | ❌ | `gestionnaire.desactiver` |
| Corriger l'adresse d'un gestionnaire | ❌ | ✅ | ❌ | ❌ | ❌ | `gestionnaire.modifier-email` |
| Créer / modifier / archiver une entreprise | ❌ | ✅ (quota) | ❌ | ❌ | ❌ | `entreprise.gerer` |
| Assigner des gestionnaires à une entreprise | ❌ | ✅ | ❌ | ❌ | ❌ | `entreprise.assigner` |
| Inviter l'admin d'une entreprise | ❌ | ✅ | ❌ | ❌ | ❌ | `entreprise.inviter-admin` |
| Retirer l'admin d'une entreprise | ❌ | ✅ | ❌ | ❌ | ❌ | `entreprise.retirer-admin` |
| Remplacer l'admin d'une entreprise | ❌ | ✅ | 🔸 | ❌ | ❌ | `entreprise.remplacer-admin` |
| Voir la liste des entreprises | ❌ | ✅ | 🔸 | 🔸 la sienne | ❌ | `entreprise.lister` |

D78 : le gestionnaire assigné ne peut que **remplacer** l'administrateur d'une entreprise (jamais inviter un premier administrateur) ; une entreprise qui ne lui est pas assignée est introuvable (404).

## Dossiers salariés

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur | Identifiant |
|---|---|---|---|---|---|---|
| Voir la liste des salariés | ❌ | 📊 | 🔸 | 🔸 | ❌ | `salarie.lister` |
| Voir un dossier complet | ❌ | ❌ | 🔸 | 🔸 | 🔸 le sien | `salarie.voir` |
| Dévoiler NISS / IBAN (journalisé) | ❌ | ❌ | 🔸 | 🔸 | 🔸 le sien | `salarie.devoiler-donnees-sensibles` |
| Créer / importer / modifier / archiver un dossier | ❌ | ❌ | 🔸 | ❌ | ❌ | `salarie.gerer` |
| Inviter un salarié au portail | ❌ | ❌ | 🔸 | ❌ | ❌ | `salarie.inviter-portail` |
| Créer une demande (engagement, sortie, modification) | ❌ | ❌ | ❌ | 🔸 | ❌ | `demande.creer` |
| Créer une demande de correction de ses données | ❌ | ❌ | ❌ | ❌ | 🔸 | `demande.creer-correction` |
| Traiter une demande (accepter / refuser) | ❌ | ❌ | 🔸 | ❌ | ❌ | `demande.traiter` |

## Paie

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur | Identifiant |
|---|---|---|---|---|---|---|
| Voir les périodes et les prestations | ❌ | ❌ | 🔸 | 🔸 la sienne | ❌ | `periode.voir` |
| Ouvrir une période | ❌ | ❌ | 🔸 | ❌ | ❌ | `periode.ouvrir` |
| Encoder les prestations | ❌ | ❌ | 🔸 (toujours) | 🔸 jusqu'à la date limite | ❌ | `prestation.encoder` |
| Verrouiller les prestations | ❌ | ❌ | 🔸 | ❌ | ❌ | `prestation.verrouiller` |

D90, D91 : `periode.ouvrir` couvre aussi le décalage de la date limite d'une période, et `prestation.verrouiller` aussi le déverrouillage.
| Créer / modifier / recalculer une fiche `BROUILLON` | ❌ | ❌ | 🔸 | ❌ | ❌ | `fiche.gerer-brouillon` |
| Soumettre à validation | ❌ | ❌ | 🔸 | ❌ | ❌ | `fiche.soumettre` |
| Valider / rejeter (motif obligatoire) | ❌ | ❌ | ❌ | 🔸 | ❌ | `fiche.valider` |
| Envoyer au salarié | ❌ | ❌ | 🔸 | ❌ | ❌ | `fiche.envoyer` |
| Créer une rectificative | ❌ | ❌ | 🔸 | ❌ | ❌ | `fiche.rectifier` |
| Voir le détail d'une fiche | ❌ | ❌ | 🔸 | 🔸 (y compris coût employeur) | 🔸 la sienne, `ENVOYEE` / `REMPLACEE` | `fiche.voir` |
| Voir des statistiques de paie | ❌ | 📊 | 🔸 | 🔸 | ❌ | `paie.statistiques` |

## Déclarations, calendrier, collaboration

| Action | SuperAdmin | Cabinet RH | Gestionnaire | Entreprise | Collaborateur | Identifiant |
|---|---|---|---|---|---|---|
| Envoyer / suivre DIMONA, DmfA, C4 | ❌ | 📊 | 🔸 | 🔸 lecture | ❌ | `declaration.suivre` |
| Voir le calendrier des échéances | ❌ | 📊 | 🔸 | 🔸 | ❌ | `calendrier.voir` |
| Messagerie (fil de l'entreprise) | ❌ | ❌ | 🔸 | 🔸 | ❌ | `messagerie.utiliser` |
| Déposer un document | ❌ | ❌ | 🔸 | 🔸 | ❌ | `document.deposer` |
| Voir les documents | ❌ | ❌ | 🔸 | 🔸 | 🔸 les siens | `document.voir` |
| Connecter Exact Online (Pro et +) | ❌ | ✅ | ❌ | ❌ | ❌ | `exact.connecter` |
| Associer une entreprise à une division Exact | ❌ | ❌ | 🔸 | ❌ | ❌ | `exact.associer-entreprise` |
| Export RGPD de ses propres données | ✅ | ✅ | ✅ | ✅ | ✅ | `export-rgpd.demander` |

## États bloquants

| Situation | Effet |
|---|---|
| Cabinet `en attente de paiement` | Titulaire : seul l'écran « reprendre le paiement » ; aucun autre compte n'existe encore |
| Cabinet en **délai de grâce** | Tout fonctionne ; bandeau d'alerte chez le Cabinet RH |
| Cabinet **suspendu** ou en **lecture seule** | Cabinet RH : abonnement, export, lecture. Gestionnaire : lecture seule. Entreprise et Collaborateur : lecture seule (D29). Toute écriture → `423 CABINET_READ_ONLY` |
| Cabinet **archivé** | Aucune connexion |
| Utilisateur suspendu ou archivé | Aucune connexion |

## Implémentation

- **Source unique dans le code** : le catalogue `ACTIONS` de `lib/authz/authz.ts` reprend chaque ligne de ce document (libellé, cinq niveaux, identifiant de la dernière colonne). `tests/lib/authz/authz.test.ts` le compare au document case par case : une ligne, un niveau ou un identifiant modifié d'un seul côté fait échouer les tests. Toute nouvelle action s'ajoute aux deux endroits.
- **Routes d'API** : `authorize(request, '<identifiant>', { write? })` en tête de chaque Route Handler, sauf les flux publics et techniques (`auth`, `register/finalize`, `invitations/accept`, `webhooks`, `cron`). Refus dans cet ordre : `401` sans session ; `403 FORBIDDEN` si le rôle est refusé par la matrice ; `423 CABINET_READ_ONLY` pour une écriture quand le cabinet est en lecture seule ; `403 TWO_FACTOR_REQUIRED` pour un SuperAdmin sans 2FA ; `403` si le compte n'a ni cabinet ni périmètre. En cas de succès, `{ session, level, scope }` : `level` dit si la route lit dans un périmètre (🔸) ou des compteurs seulement (📊).
- **Écriture et lecture seule (D29, D71)** : une action d'écriture porte `write: true` dans le catalogue. L'abonnement, l'export du cabinet et toute lecture restent possibles quand le cabinet est en lecture seule. Une route peut préciser `{ write }` quand une même action mêle lecture et écriture.
- **2FA du SuperAdmin (D20)** : exigée pour toute action sauf `compte.gerer` et `export-rgpd.demander`, pour qu'il puisse activer sa 2FA depuis son profil.
- **Pages** : `requireAuthorized('<identifiant>')` (`lib/authz/authz-page.ts`) en tête de chaque layout **et de chaque page**, car un layout n'est pas ré-exécuté à chaque navigation. Redirections : `/login` sans session, `/dashboard` si le rôle est refusé, `/profil?2fa=requise` pour un SuperAdmin sans 2FA. L'aiguillage `dashboard/page.tsx` n'est pas une décision d'accès et n'utilise que `requireSession()`.
- **Périmètre (`scope`)** : déduit de la base à chaque requête (jamais d'une liste stockée dans la session, ni envoyée par le client) : SuperAdmin → plateforme (jamais les données métier, D8) ; Cabinet RH → son cabinet ; Gestionnaire → ses entreprises assignées et non archivées ; Entreprise → sa seule entreprise ; Collaborateur → son seul compte (le périmètre de son dossier viendra avec son modèle de données). `entrepriseWhere(scope)` produit le filtre Prisma et ne laisse **rien** voir à la plateforme ni au collaborateur. Une ressource hors périmètre répond `404`.
- **Cas particuliers** : D78, `entreprise.remplacer-admin` est ouvert au gestionnaire assigné mais `entreprise.inviter-admin` ne l'est pas ; `cabinet.modifier-identite` est ouvert au SuperAdmin par la matrice (chantier A4), mais la route actuelle ne sert que le cabinet de la session et lui répond `403` ; la révocation et le renvoi d'une invitation (`invitations/[id]`) sont communs à tous les types d'invitation et passent par `gestionnaire.inviter`.
- **Tests** : `authz.test.ts` (catalogue contre ce document, décision `authorize` sur les 52 actions × 5 rôles, 2FA, cabinet, lecture seule, `resolveScope`, `entrepriseWhere`) ; `authz-scope.test.ts` (périmètres sur la vraie base : gestionnaire, entreprise, isolation entre cabinets) ; `authz-page.test.ts` (pages, toute la matrice) ; `authz-routes-*.test.ts` et `authz-pages.test.ts` (chaque route et chaque page appelle l'action prévue et refuse les autres rôles) ; `rbac-*.test.ts` (effets des routes avec de vraies sessions).
