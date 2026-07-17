# 🚀 SocialFlow

**Plateforme SaaS de gestion de la paie belge**

Projet développé pour les secrétariats sociaux et cabinets RH en Belgique.

---

## 📋 Structure du projet

```
socialflow/
├── apps/
│   └── web/              # Application Next.js 16 — landing page + marketing
├── doc/
│   ├── PLANNING.md        # Roadmap avec dates et jalons
│   └── analysis/          # Cahier des charges, spec technique, architecture
└── README.md              # Ce fichier
```

> Le monorepo est structuré avec Turborepo pour accueillir de futurs packages partagés
> (`packages/ui`, `packages/database`, ...) au fur et à mesure de l'avancement du produit —
> voir [Roadmap](#-roadmap) plus bas.

---

## 🛠️ Stack technique (actuelle)

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Framer Motion
- **Tests:** Vitest + React Testing Library
- **Monorepo:** Turborepo + npm workspaces
- **Déploiement:** Vercel (branches `main`, `dev`, `prod`)

---

## 🚀 Démarrer en local

### Prérequis
- Node.js >= 18
- npm >= 10
- Git

### Installation

```bash
# 1. Clone le repo
git clone <repo-url>
cd socialflow

# 2. Install dépendances
npm install

# 3. Configure environment (nécessaire pour l'authentification, optionnel pour la landing page seule)
cp .env.example apps/web/.env.local
# Ou, si la base Neon est déjà provisionnée sur Vercel :
# npx vercel env pull apps/web/.env.local

# 4. Démarre le serveur de dev
npm run dev
```

L'app sera sur **http://localhost:3000**

---

## 📅 Jalons du projet

Voir [doc/PLANNING.md](./doc/PLANNING.md) pour le roadmap complet avec dates.

### Phase 1 : Landing page ✨ (en cours)
- [x] Infrastructure (Sprint 0) — 20 Juil
- [x] Landing page (Sprint 1) — 3 Août

### Phase 2 : Core features
- [ ] Auth pages (Sprint 2) — 17 Août
- [ ] Dashboards (Sprints 3-6) — Octobre
- [ ] Backend complet (Sprint 7) — 14 Déc
- [ ] Intégrations (Sprint 8) — 11 Janv
- [ ] Testing & Polish (Sprints 9-10) — 21 Mars

### Remise finale
- [ ] MVP production-ready — **30 Juin 2027**

---

## 📖 Documentation

- **[doc/PLANNING.md](./doc/PLANNING.md)** — Roadmap avec étapes et dates
- **[doc/analysis/PRD_CLIENT.md](./doc/analysis/PRD_CLIENT.md)** — Cahier des charges complet
- **[doc/analysis/SPEC_FINAL.md](./doc/analysis/SPEC_FINAL.md)** — Spécification technique détaillée
- **[doc/analysis/ARCHITECTURE.md](./doc/analysis/ARCHITECTURE.md)** — Architecture système & API cible

---

## 🎨 Design system

Utilise **Shadcn/UI** + **Tweakcn** pour les thèmes personnalisés.

Couleurs de marque :
- **Primaire:** Indigo (`#4f46e5`)
- **Secondaire:** Teal (`#00c49f`)

---

## 🧪 Tests & qualité

```bash
# Lint
npm run lint

# Type check
npm run type-check

# Tests unitaires
npm test

# Tests avec couverture de code
npm run test:coverage

# Formatage (Prettier)
npm run format
```

---

## 📦 Build & Deploy

```bash
# Build production
npm run build

# Deploy sur Vercel
# (automatique via Git push sur main / dev / prod)
```

---

## 🗺️ Roadmap

Ce qui existe aujourd'hui est uniquement la **landing page marketing** (`apps/web`). Le reste de
l'architecture cible — décrite dans `doc/analysis/` — n'est pas encore implémenté :

- `packages/ui`, `packages/database`, `packages/utils`, `packages/config` (packages partagés)
- Authentification (Better Auth), routes `(auth)/`, `(dashboard)/`, `(portal)/`
- API Routes, base de données PostgreSQL + Prisma, cache Redis
- Paiements Stripe, emails transactionnels Resend

---

## 👤 Contact

**Auteur:** Adrien
**Email:** adrien231020@gmail.com
**Projet:** SocialFlow
**Année:** 2026-2027

---

**Bon développement! 🚀**
