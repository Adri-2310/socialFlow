# Vérification manuelle de l'interface (migration shadcn/ui)

> À passer **à la main**, écran par écran, après la migration de l'interface sur shadcn/ui (branche `feature/ui-shadcn`, 26 → 28 octobre 2026). Les tests automatiques couvrent le comportement et les rôles accessibles ; ils ne voient ni les couleurs, ni les espacements, ni le tactile. Cette liste couvre ce qui reste.
> Aucun identifiant n'est écrit ici : utiliser les comptes de test locaux. Cocher une case seulement après avoir **regardé** l'écran ; noter l'écart dans la colonne « Constat ».

## 0. Méthode commune

Pour **chaque écran** de la liste, vérifier les cinq points suivants, sauf mention contraire.

| # | Contrôle | Comment |
|---|---|---|
| A | **Thème clair et sombre** | Bouton de thème de la barre. Texte lisible partout, pas de bloc blanc en sombre (menus, listes déroulantes, barres de défilement, champs de date). |
| B | **Mobile (375 px)** | Outils de développement → mode appareil. Pas de défilement horizontal de la page, boutons assez grands (au moins 40 px de haut), tableaux lisibles. |
| C | **Clavier** | `Tab` parcourt tout dans l'ordre visuel, un anneau de focus est visible, `Entrée` ou `Espace` actionnent, `Échap` ferme une fenêtre ou un menu et rend le focus à son déclencheur. |
| D | **Erreurs** | Provoquer une erreur de saisie : le message apparaît près du champ, en rouge lisible, et le champ est signalé. |
| E | **Couleurs du cabinet (D65, D76)** | Sur un écran de cabinet client ou de portail : boutons, liens et accents prennent la couleur du cabinet, pas le violet de SocialFlow. |

Contrôle **lecteur d'écran** (une fois par lot, sur un formulaire) : chaque champ est annoncé avec son libellé, une erreur est annoncée à l'apparition, un bouton-icône a un nom.

## 1. Lot 1 : espaces Cabinet RH et Gestionnaire RH

Rôle : Cabinet RH (adresses `/dashboard/cabinet/…`) puis Gestionnaire RH (`/dashboard/gestionnaire/…`).

### Cabinet RH

| ☐ | Écran | À regarder | Constat |
|---|---|---|---|
| ☐ | `/dashboard/cabinet` | Cartes et alertes (ton ambre lisible, D62), liens des alertes | |
| ☐ | `/dashboard/cabinet/parametres` : identité | Champs nom et raison sociale, enregistrement, message de succès (bandeau vert) | |
| ☐ | idem : **branding** | Sélecteurs de couleur, aperçu des pastilles, message de contraste refusé, bouton « Utiliser cette teinte » | |
| ☐ | idem : **portail** | Adresse du portail, copie, activation | |
| ☐ | idem : **logo** | Choix et suppression du fichier, erreur de format ou de taille | |
| ☐ | idem : **modèles d'email** | Champs de texte, aperçu, réinitialisation | |
| ☐ | `/dashboard/cabinet/entreprises` | Liste, création d'une entreprise, invitation par email, pastilles de statut | |
| ☐ | `/dashboard/cabinet/gestionnaires` | Liste, invitation, suspension et réactivation (confirmation) | |
| ☐ | `/dashboard/cabinet/facturation` et `/paiement` | Plan, factures (tableau), pastille de statut, bandeau de facturation | |
| ☐ | `/dashboard/cabinet/audit` | Tableau, pagination, filtre | |

### Gestionnaire RH

| ☐ | Écran | À regarder | Constat |
|---|---|---|---|
| ☐ | `/dashboard/gestionnaire` | Tableau de bord, pastilles | |
| ☐ | `…/entreprises/[id]/salaries` | Liste des salariés, recherche et filtres, état vide | |
| ☐ | **Dossier salarié** `…/salaries/[id]` | Formulaire complet (identité, contrat, situation fiscale), listes déroulantes, cases à cocher, erreurs, valeurs sensibles (NISS, IBAN) masquées par défaut, avec leur révélation | |
| ☐ | Conditions de travail, sortie | Fenêtres de saisie : `Échap` ne ferme **pas** une saisie en cours, validation, erreur | |
| ☐ | **Import CSV** | Choix du fichier, tableau des problèmes (barre de défilement sombre : voir `AMELIORATIONS.md`), confirmation | |
| ☐ | `…/entreprises/[id]/periodes` et `/periodes/[id]` | Liste des périodes, **verrouillage** (confirmation avec erreur), pastilles | |
| ☐ | **Encodage des prestations** | Saisie par ligne, totaux, enregistrement, erreur de saisie | |

## 2. Lot 6 bis : coque, compte et espace Entreprise

| ☐ | Écran | À regarder | Constat |
|---|---|---|---|
| ☐ | **Barre latérale** (tous les rôles) | Lien actif, entrée « Bientôt », nom du cabinet, couleurs du cabinet | |
| ☐ | **Tiroir mobile** (375 px) | Le bouton « Ouvrir le menu » ouvre le tiroir, `Échap` et le clic extérieur le ferment, le focus revient au bouton | |
| ☐ | **Menu du compte** | Ouverture, flèches, « Mon profil », « Se déconnecter » (texte rouge **lisible en sombre**) | |
| ☐ | **Thème** | Bascule clair / sombre, mémorisée au rechargement | |
| ☐ | `/profil` : informations | « Modifier le nom », « Modifier l'adresse email », « Modifier le mot de passe » : édition, annulation, erreur, enregistrement | |
| ☐ | `/profil` : **double authentification** | Activation, code QR, codes de secours, désactivation | |
| ☐ | `/profil` : **comptes liés** | Google et Microsoft : lier, délier, refus de délier le dernier moyen de connexion | |
| ☐ | `/profil` : **suppression du compte** | Confirmation par le mot de passe, blocage par un abonnement actif | |
| ☐ | `/dashboard/entreprise` | Accueil de l'entreprise, messages (bandeaux), liens | |

## 3. Lot 6 ter : console SuperAdmin

Rôle : SuperAdmin (`/dashboard/admin/…`). **Je n'ai vu aucun de ces écrans moi-même** : à regarder en priorité.

| ☐ | Écran | À regarder | Constat |
|---|---|---|---|
| ☐ | `/dashboard/admin` | Tuiles, chiffres, MRR (libellé : voir `AMELIORATIONS.md`) | |
| ☐ | `/dashboard/admin/facturation` | Tuile MRR, tableau des abonnements, pastilles Stripe, lignes sur mobile | |
| ☐ | `/dashboard/admin/cabinets` | Tableau trié, recherche, filtres, **actions de ligne** (hauteur 40 px sur mobile, 32 px au bureau), pagination | |
| ☐ | **Suspension d'un cabinet** | Fenêtre : motif obligatoire, case de confirmation (clavier : `Espace`), erreur, bouton désactivé tant que la case n'est pas cochée | |
| ☐ | `/dashboard/admin/utilisateurs` | Tableau trié, actions (suspendre, réactiver, révoquer les sessions, envoyer un lien de réinitialisation, archiver), pastilles | |
| ☐ | `/dashboard/admin/configuration` | **Plans** : création, modification, archivage (confirmation), carte d'un plan archivé | |
| ☐ | `/dashboard/admin/audit` | Journal, pagination (« Pagination », page suivante et précédente), filtres | |
| ☐ | `/dashboard/admin/monitoring` | Aucun bouton ni champ à migrer : vérifier seulement l'affichage et les couleurs | |

## 4. Lot 6 quater : authentification et pages d'erreur

À faire **déconnecté**. Ne jamais envoyer de formulaire avec un vrai mot de passe pour ce contrôle visuel : regarder, puis provoquer des erreurs.

| ☐ | Écran | À regarder | Constat |
|---|---|---|---|
| ☐ | `/login` | Boutons Google / Microsoft / Email (sur mobile : icônes seules, **nom lu par le lecteur d'écran**), œil du mot de passe, « Rester connecté », « Oublié ? » | |
| ☐ | `/connexion/<slug>` (portail d'un cabinet) | **Branding du cabinet conservé** (panneau, logo, boutons, lien « Oublié ? »), « Propulsé par SocialFlow » | |
| ☐ | idem avec une erreur dans l'adresse (`?error=WRONG_PORTAL`) | Bandeau rouge discret avec icône, annoncé comme alerte | |
| ☐ | **Double authentification** à la connexion | Champ du code, bascule vers un code de secours, « Retour », erreur de code | |
| ☐ | **Connexion sans mot de passe** | Lien par email, code à 6 chiffres, « Renvoyer le code », « Retour » | |
| ☐ | `/mot-de-passe-oublie` (et la version du portail) | Envoi, écran de confirmation avec l'adresse, lien « Retour à la connexion » | |
| ☐ | `/reinitialiser-mot-de-passe?token=…` | Deux champs, œil commun, erreurs (8 caractères, mots de passe différents), cercle de succès **vert** (plus teal) | |
| ☐ | `/register` | Choix de la formule (bascule Mensuel / Annuel, `−20%` lisible), puis formulaire, « Changer de formule » | |
| ☐ | `/invitations/accept?token=…` | Formulaire d'invitation (couleurs du cabinet qui invite), adresse du portail après création, « Copier » / « Copié » | |
| ☐ | idem **sans jeton valide** | Écran « Invitation invalide ou expirée », lien « Retour à la connexion » | |
| ☐ | `/erreur-connexion?error=CABINET_SUSPENDED&portal=<slug>` | Ton ambre lisible, trois actions, première en dégradé | |
| ☐ | Page 404 (adresse inexistante) | Code 404 en dégradé, deux actions | |
| ☐ | **Page d'erreur inattendue** | Provoquer une erreur (voir `error.tsx`) : « Réessayer » fonctionne, la référence s'affiche | |
| ☐ | `global-error.tsx` | **Exception documentée** : vérifier seulement qu'elle s'affiche sans style cassé | |

## 5. Lot 6 quinquies : site public

À faire **déconnecté**, thème clair puis sombre.

| ☐ | Écran | À regarder | Constat |
|---|---|---|---|
| ☐ | **Barre de navigation** (bureau) | Lien actif lisible en sombre ; menu « Entreprise » : s'ouvre au **survol**, au **clic** et au **clavier** (Entrée, flèches, `Échap`), la page active y est marquée | |
| ☐ | idem **mobile (375 px)** | Le bouton hamburger ouvre le menu, devient « Fermer le menu », les liens ferment le menu | |
| ☐ | `/tarifs` | Bascule Mensuel / Annuel, prix, carte « Pro » mise en avant, boutons « Démarrer l'essai » vers `/register?plan=…`, coches | |
| ☐ | `/faq` | Ouverture et fermeture d'une réponse (animation), une seule réponse ouverte, `Entrée` au clavier | |
| ☐ | Autres pages publiques | `/`, `/fonctionnalites`, `/pour-qui`, `/a-propos`, `/contact`, `/rgpd`, `/conditions`, `/confidentialite` : étiquette de page lisible en sombre, pas de régression | |

## 6. Après la vérification

- Reporter chaque écart dans la colonne « Constat », puis le corriger ou l'ajouter à `AMELIORATIONS.md` § 6.
- Quand tout est coché, retirer la ligne « Vérification visuelle non faite » de `AMELIORATIONS.md` § 6.
- Mesure **Lighthouse** de performance à refaire sur `next build` + `next start` avant la mise en ligne (voir `AMELIORATIONS.md` § 6).
