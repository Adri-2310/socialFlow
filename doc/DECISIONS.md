# Décisions produit — SocialFlow

> **Source de vérité.** Ce fichier prime sur tout document de `doc/archive/`.
> En cas de contradiction entre ce fichier et un autre document, ce fichier l'emporte.
> Toute nouvelle décision s'ajoute ici, datée.

Décisions prises par **Adrien Mertens**, au fil des séances d'analyse. Dernière mise à jour : 12/10/2026

## Contexte

- Projet de TFE (bachelier informatique de gestion), remise finale : 30/06/2027.
- Développeur unique (Adrien). Code produit avec l'assistance d'outils d'IA (Claude Code), usage autorisé par le promoteur ; analyse, décisions, architecture, revue et validation par Adrien (voir `JOURNAL.md`).
- Git : branche d'intégration `dev`, une branche `feature/<sujet>` par chantier, `main` = production.

## Stack (déjà en place dans le code, ne pas remettre en cause)

| Sujet | Choix |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| UI | Tailwind 4, shadcn/ui, Base UI, framer-motion |
| Base de données | PostgreSQL sur Neon, Prisma 7 (`@prisma/adapter-neon`) |
| Authentification | Better Auth 1.7 : sessions en base (pas de JWT maison), mot de passe, lien magique, code email, Google, Microsoft, 2FA TOTP |
| Emails | Resend |
| Paiement | Stripe (sandbox), essai de 30 jours à l'inscription |
| Hébergement | Vercel (Preview = `dev` et `feature/*`, Production = `main`), crons Vercel |
| Tests | Vitest |

Conséquence : les mentions de JWT 1 h / refresh 24 h, Coolify, MinIO, Upstash et BullMQ dans les anciens documents sont **obsolètes**.

## Vocabulaire officiel

| Code (`User.role`) | Libellé | Ancien(s) nom(s) à ne plus utiliser |
|---|---|---|
| `SUPER_ADMIN` | SuperAdmin | — |
| `CABINET_RH` | Cabinet RH | Admin Secrétariat, Secretariat |
| `GESTIONNAIRE_RH` | Gestionnaire RH | Consultant |
| `ENTREPRISE_CLIENTE` | Entreprise cliente (son administrateur) | Client, Company |
| `COLLABORATEUR` | Collaborateur (salarié) | Employé, Employee |

## Décisions du 12/10/2026

### Périmètre
- **D1.** Périmètre visé : tout ce qui figure dans les documents d'analyse (cœur + calendrier ONSS, messagerie, documents, white-label, DIMONA, C4, Exact Online, analytics…). Ordre : cœur d'abord, puis **calendrier ONSS + alertes** en premier module secondaire.
- **D2.** Intégrations officielles (DIMONA, ONSS, C4, Exact Online) : objectif **connexion réelle**. Constat du 12/10 : la DIMONA dispose d'un environnement de **simulation** officiel, mais l'accès suppose d'être l'employeur ou son mandataire (certificat, Chaman, OAuth). Plan de repli : implémentation simulée fidèle (voir `modules/integrations.md`). **Révisée par D50.**

### Rôles et relations
- **D3.** Le **Cabinet RH** est un rôle de **pilotage uniquement** : abonnement, équipe, entreprises clientes, paramètres. Il ne crée ni ne prépare de fiches. Pour produire, il faut un compte Gestionnaire RH.
- **D4.** Seul le **Cabinet RH** crée une entreprise cliente, l'assigne à un ou plusieurs gestionnaires et invite son administrateur.
- **D5.** Une entreprise cliente a **un seul** compte administrateur.
- **D6.** Seul le **Gestionnaire RH assigné** crée, importe et invite les collaborateurs de ses entreprises.
- **D7.** Un email = un seul rattachement (un cabinet, ou une entreprise). Pas de sélecteur de contexte multi-comptes.
- **D8.** Le **SuperAdmin ne voit jamais** les données des clients (salariés, fiches, documents). Il voit cabinets, comptes, facturation, monitoring et audit.

### Fiches de paie
- **D9.** Validation par l'entreprise **obligatoire** : `BROUILLON → A_VALIDER → VALIDEE → ENVOYEE` (codes sans accent, D13 ajoute `REMPLACEE`).
- **D10.** Rejet : retour en **BROUILLON avec un motif obligatoire** ; le gestionnaire corrige et resoumet.
- **D11.** C'est le **Gestionnaire RH assigné** qui envoie la fiche validée au salarié.
- **D12.** Envoi au salarié par **lien sécurisé temporaire, sans pièce jointe** (donnée sensible), plus consultation dans son portail.
- **D13.** Une fiche envoyée n'est **jamais modifiée** : correction via une **fiche rectificative** qui la remplace et garde le lien vers l'originale.
- **D14.** Calcul de paie sur **barèmes belges réels (2026)**, pas de taux approximatifs.

### Facturation
- **D15.** Les **quotas** (entreprises clientes, utilisateurs du cabinet, stockage ; valeurs en D34) sont stockés dans `PricingPlan`, réglés par le SuperAdmin, et **bloquants** au-delà.

### SuperAdmin (12/10/2026, suite)
- **D18.** Le premier SuperAdmin est créé par **script** (bootstrap). Cible pro : seul un SuperAdmin existant peut en inviter un autre ; le script ne sert qu'à l'installation initiale.
- **D19.** Le SuperAdmin **ne crée pas de cabinet**. Tout cabinet s'inscrit lui-même et choisit un plan ; l'essai gratuit est suivi d'une facturation automatique. Le SuperAdmin peut **consulter et modifier** un cabinet existant.
- **D20.** **2FA obligatoire pour le SuperAdmin**, conseillée (pas imposée) pour les autres rôles.
- **D21.** Outils de support sur un compte : **révoquer ses sessions** et **lui envoyer un lien de réinitialisation**. Le SuperAdmin ne voit et ne fixe jamais un mot de passe. Pas de « forcer la 2FA » par utilisateur.
- **D22.** Les **barèmes de paie se mettent à jour automatiquement**, versionnés par date de validité. Proposition retenue en attente de confirmation : détection automatique d'une nouvelle publication officielle, version importée en `A_VERIFIER`, **activation par le SuperAdmin** après passage des cas de référence (voir `modules/paie.md` § 5).
- **D23.** Paiement échoué : **délai de grâce puis suspension automatique** du cabinet. Alertes par email au cabinet **et** au SuperAdmin, plus une notification dans l'application.

### Cabinet RH (12/10/2026)
- **D24.** **Un seul compte Cabinet RH** par cabinet : le titulaire inscrit. Les autres membres de l'équipe sont des Gestionnaires RH.
- **D25.** **Carte bancaire demandée à l'inscription** (Stripe Checkout avec essai de 30 jours). Débit automatique à la fin de l'essai.
- **D26.** Visibilité du Cabinet RH sur la paie : **statistiques et statuts uniquement** (compteurs, retards, fiches par statut et par gestionnaire). Jamais le détail des salaires ni des dossiers salariés.
- **D27.** Départ d'un gestionnaire : **réassignation obligatoire** de toutes ses entreprises avant de pouvoir le désactiver.
- **D28.** Résiliation : accès complet **jusqu'à la fin de la période payée**, puis **lecture seule** avec export possible pendant 90 jours, puis archivage. Les fiches de paie restent conservées 5 ans (obligation légale).
- **D29.** Cabinet suspendu (impayé ou résilié) : les portails **Entreprise et Collaborateur restent accessibles en lecture seule** (les salariés récupèrent leurs fiches déjà envoyées). Seules les actions de production sont bloquées.
- **D30.** Le Cabinet RH paramètre : **identité** (raison sociale, TVA, adresse, contact), **branding** (logo, couleurs, appliqués aux portails, PDF et emails de ses clients) et **modèles d'emails**. **Pas de SMTP propre** : tous les emails partent par Resend, au nom du cabinet.
- **D31.** Le Cabinet RH consulte le **journal d'audit de son propre cabinet**.

- **D32.** Abandon du paiement à l'inscription : le compte est conservé, avec un écran « reprendre le paiement » comme seul accès tant que Checkout n'est pas terminé.
- **D33.** Le Cabinet RH personnalise le **nom affiché**, le logo et les couleurs : ses gestionnaires, ses entreprises et leurs salariés doivent reconnaître leur cabinet.

### Plans et tarifs (12/10/2026)
- **D34.** `PRD_CLIENT.md` est le **cahier des charges du client**, base du programme. Les **prix et le nombre de fonctionnalités par plan ne se modifient pas** ; seuls de petits ajustements sont permis.

| Plan | Prix / mois | Entreprises clientes | Utilisateurs cabinet | Stockage | Fonctionnalités |
|---|---|---|---|---|---|
| Starter | 150 € | 25 | 3 | 5 Go | Base |
| Pro | 300 € | 100 | 10 | 25 Go | Base + intégrations |
| Enterprise | 750 € | illimité | illimité | 100 Go | Pro + white-label |

  Options payantes : +25 €/utilisateur supplémentaire, +10 € par tranche de 10 Go.
  Facturation annuelle (ajustement déjà présent dans `prisma/seed.mjs`) : 120 / 240 / 600 € par mois, soit -20 %.
  Les montants 99 € / 299 € de SPEC_FINAL et PRD_INTERNE sont **obsolètes**.

- **D35.** Personnalisation : nom affiché, logo et couleurs pour **tous les plans** ; le **white-label Enterprise** ajoute le domaine personnalisé et la suppression de toute mention SocialFlow.
- **D36.** DIMONA et déclarations ONSS sont incluses **dans tous les plans**. « Intégrations » (Pro et +) = Exact Online et autres logiciels comptables.

### Production de la paie (12/10/2026)
- **D37.** Prestations mensuelles (heures, congés, maladie, primes) : l'entreprise **peut les pré-encoder** dans son portail, le gestionnaire **complète, corrige et valide**.
- **D38.** Production des fiches : **par lot** (ouverture de la période mensuelle d'une entreprise, une fiche brouillon par salarié actif) et **à l'unité** pour les cas particuliers (entrée ou sortie en cours de mois, fiche rectificative).

- **D39.** Travailleurs gérés : **employés** (salaire mensuel), **ouvriers** (salaire horaire) et **temps partiel**. Étudiants hors périmètre.
- **D40.** Créer un dossier salarié **génère une DIMONA IN** à envoyer avant le premier jour de travail ; enregistrer une date de sortie génère une **DIMONA OUT**.
- **D41.** Validation en retard : relances automatiques de l'entreprise à **J+2 et J+4**, puis alerte au gestionnaire. **Jamais de validation tacite.**
- **D42.** Messagerie : **un fil de discussion par entreprise**, entre le(s) gestionnaire(s) assigné(s) et l'admin de l'entreprise.

- **D43.** Lien de fiche envoyé au salarié : accès confirmé par un **code à usage unique envoyé par email** (valable 10 minutes). Le lien lui-même expire après **7 jours** ; ensuite, consultation via le portail ou renvoi par le gestionnaire.
- **D44.** Commissions paritaires au départ : **CP 200** (employés) et **CP 100** (commission auxiliaire pour ouvriers). Le modèle de données prévoit l'ajout d'autres CP.
- **D45.** Le **pécule de vacances** fait partie du périmètre.
- **D46.** Date limite d'encodage des prestations : un **jour par défaut réglé par entreprise** (par exemple le 20), que le gestionnaire peut décaler pour une période. Rappels à l'entreprise à J-3 et J-1. Après la date, l'entreprise ne peut plus modifier ; le gestionnaire, si.

### Entreprise cliente et Collaborateur (12/10/2026)
- **D47.** L'admin de l'entreprise **consulte** les dossiers de ses salariés et **signale** des changements (nouvel engagement, sortie, changement de salaire ou de régime) via une **demande** adressée au gestionnaire, qui l'applique. Il ne modifie jamais un dossier directement.
- **D48.** L'admin de l'entreprise voit **tout le détail** des fiches de ses salariés (brut, retenues, net, coût employeur), l'historique et les PDF.
- **D49.** Portail Collaborateur : ses **fiches de paie** (5 ans), ses **données personnelles** (lecture + demande de correction), ses **documents** (contrat, attestations, C4 ; fiche fiscale 281.10 si elle entre dans le périmètre, question ouverte) et l'**export RGPD** de ses données.

### Intégrations officielles (12/10/2026, suite)
- **D50.** DIMONA, DmfA et C4 : **implémentation simulée**, construite à partir de la **documentation officielle publique** de la sécurité sociale (formats JSON, statuts, anomalies). Pas de demande d'accès au service réel pour le TFE. L'architecture reste prête pour une connexion réelle plus tard (interface `DeclarationGateway`). **Exact Online reste en connexion réelle** (app de test sur sa propre instance).
- **D51.** **Mise à jour mensuelle automatique des données de référence** (codes d'anomalies et glossaires DIMONA, schémas DIMONA et DmfA, barèmes) : détection des nouvelles versions officielles, import en base dans des tables versionnées pour les formats lisibles, validation par le SuperAdmin pour les PDF et les barèmes (D22). Le site de la sécurité sociale interdisant les robots, les fichiers concernés sont téléchargés par un clic du SuperAdmin, puis importés automatiquement. **Réalisé en dernier** (chantier C9) : jusque-là, les données de référence sont saisies une première fois à partir de la documentation officielle.

### Documentation
- **D16.** Documentation dans le dépôt (`doc/`) + copie dans le projet claude.ai « TFE ». Anciens documents déplacés dans `doc/archive/`, la nouvelle doc fait foi.
- **D17.** Lecteurs : Adrien (référence) et toute personne ou outil qui implémente (règles précises, critères d'acceptation).
