# SocialFlow

**Plateforme SaaS multi-tenant de gestion de la paie belge**, pour les cabinets RH et secrétariats sociaux : gestion du portefeuille d'entreprises clientes, dossiers salariés, prestations mensuelles, fiches de paie validées par l'employeur et remises aux salariés, déclarations sociales.

Travail de fin d'études — bachelier en informatique de gestion — **Adrien Mertens** — remise en juin 2027.

---

## État du projet

| Partie | Statut |
|---|---|
| Site public (landing, fonctionnalités, tarifs, FAQ, contact, pages légales) | ✅ |
| Authentification : mot de passe, lien magique, code email, Google, Microsoft, 2FA | ✅ |
| Console SuperAdmin : cabinets, utilisateurs, plans et quotas, facturation, monitoring, audit | ✅ |
| Espace Cabinet RH : abonnement Stripe, gestionnaires, entreprises clientes, branding, modèles d'emails, portail de connexion, export, audit | ✅ |
| Espace Gestionnaire RH : dossiers salariés (NISS et IBAN chiffrés), import CSV, périodes de paie, prestations | ✅ |
| Interface entièrement sur shadcn/ui | 🟡 en cours |
| Moteur de paie, cycle des fiches, déclarations (DIMONA, DmfA, C4) | ⏳ à venir |
| Portails Entreprise cliente et Collaborateur complets | ⏳ à venir |

Planning détaillé et statut de chaque chantier : **[doc/ROADMAP.md](./doc/ROADMAP.md)**.

---

## Stack technique

| Domaine | Choix |
|---|---|
| Application | Next.js 16 (App Router), React 19, TypeScript strict |
| Interface | Tailwind CSS 4, shadcn/ui (style `base-nova`, Base UI), Framer Motion |
| Données | PostgreSQL sur Neon, Prisma 7 |
| Authentification | Better Auth 1.7 (sessions en base) |
| Paiement | Stripe (Checkout, abonnements, webhooks) |
| Emails | Resend |
| Fichiers | Vercel Blob |
| Hébergement | Vercel (déploiements et tâches planifiées) |
| Qualité | Vitest, React Testing Library, ESLint, Prettier, GitHub Actions |
| Monorepo | Turborepo, npm workspaces |

---

## Structure du dépôt

```
socialflow/
├── apps/
│   └── web/             # Application Next.js (site public, espaces, API) — voir apps/web/README.md
├── doc/                 # Documentation du projet — point d'entrée : doc/README.md
├── .github/workflows/   # Intégration continue (lint, types, tests)
├── CLAUDE.md            # Règles pour les assistants de code
├── vercel.json          # Build, branches déployées et tâches planifiées
└── turbo.json
```

---

## Démarrer en local

### Prérequis
- Node.js 22 (version utilisée par la CI) et npm 11
- Un accès à la branche Neon `dev` (ou une base PostgreSQL locale)

### Installation

```bash
git clone https://github.com/Adri-2310/socialFlow.git
cd socialFlow
npm install                      # génère aussi le client Prisma

# Variables d'environnement : partir de l'exemple documenté…
cp .env.example apps/web/.env.local
# …ou récupérer celles de Vercel si le projet y est lié
npx vercel env pull apps/web/.env.local
```

Secrets à générer si tu pars de l'exemple :

```bash
openssl rand -hex 32      # BETTER_AUTH_SECRET et CRON_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (32 octets, chiffrement du NISS et de l'IBAN)
```

Puis :

```bash
cd apps/web
npm run db:migrate                                   # applique les migrations
npm run superadmin:create -- prenom.nom@exemple.be   # premier SuperAdmin (une seule fois)
cd ../..
npm run dev                                          # http://localhost:3000
```

Toutes les variables sont décrites dans **[.env.example](./.env.example)**. Stripe (`STRIPE_SECRET_KEY`) et Vercel Blob (`BLOB_READ_WRITE_TOKEN`, stockage des logos ; sans lui, stockage en mémoire) sont fournis par les intégrations Vercel et récupérés par `vercel env pull`.

---

## Commandes utiles

Depuis la racine :

```bash
npm run dev            # serveur de développement
npm run build          # build de production
npm run lint           # ESLint
npm run type-check     # TypeScript
npm test               # tests (Vitest)
npm run test:coverage  # tests avec couverture
npm run format         # Prettier
```

Depuis `apps/web` (base de données et maintenance) :

```bash
npm run db:migrate          # créer et appliquer une migration (dev)
npm run db:studio           # explorer la base
npm run superadmin:create   # créer le premier SuperAdmin
npm run db:reencrypt        # convertir les valeurs chiffrées au format v2 (--dry-run pour simuler)
```

---

## Bases de données et déploiement

Trois branches Neon (D79) : **`dev`** (local, tests locaux, prévisualisations), **`test`** (intégration continue) et **`production`**.

| Branche Git | Déploiement Vercel | Base |
|---|---|---|
| `feature/*`, `dev` | Prévisualisation | Neon `dev` |
| `main` | Production | Neon `production` |

**Mettre en production** (après une CI verte sur `dev`) :
1. point de restauration Neon de `production` ;
2. `prisma migrate deploy` sur `production` ;
3. fusion de `dev` dans `main` (Vercel déploie) ;
4. vérification de la connexion et d'une page de chaque espace.

Tâches planifiées (Vercel Cron, protégées par `CRON_SECRET`) : purge des comptes archivés, purge partielle des cabinets archivés, purge des données de paie dont la conservation légale a expiré, purge des sessions expirées, suspension des cabinets dont le délai de grâce est écoulé.

---

## Tests et intégration continue

- Plus de 1 400 tests Vitest : unitaires, composants et intégration (routes, autorisations, isolation entre cabinets).
- GitHub Actions sur chaque push et pull request vers `dev` et `main` : job `qualite` (lint et types) et job `tests` sur la branche Neon `test`.

Stratégie complète : **[doc/TESTS.md](./doc/TESTS.md)**.

---

## Documentation

| Document | Contenu |
|---|---|
| [doc/README.md](./doc/README.md) | Sommaire de toute la documentation |
| [doc/DECISIONS.md](./doc/DECISIONS.md) | Décisions produit numérotées, **source de vérité** |
| [doc/FONCTIONNEMENT.md](./doc/FONCTIONNEMENT.md) | Fonctionnement de bout en bout et modèle de données |
| [doc/PERMISSIONS.md](./doc/PERMISSIONS.md) | Qui peut faire quoi (matrice testée) |
| [doc/CONVENTIONS.md](./doc/CONVENTIONS.md) | Règles de code, Git et API |
| [doc/ROADMAP.md](./doc/ROADMAP.md) | Planning et statut des chantiers |
| [doc/reference/PRD_CLIENT.md](./doc/reference/PRD_CLIENT.md) | Cahier des charges du client |

---

## Façon de travailler

- Une branche `feature/<sujet>` par chantier, partie de `dev` ; `main` = production.
- Commits en français, au présent (« Ajoute… », « Corrige… »).
- Toute nouvelle règle métier est d'abord écrite dans `doc/DECISIONS.md`, puis implémentée.
- Code produit avec l'assistance d'outils d'IA (usage autorisé) ; analyse, décisions, architecture, revue et validation par l'auteur. Suivi dans [doc/JOURNAL.md](./doc/JOURNAL.md).

---

## Auteur

**Adrien Mertens** — adrien.mertens@ifosup.wavre.be — 2026-2027