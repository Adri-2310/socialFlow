# 🚀 SocialFlow — MVP

**Plateforme SaaS de gestion de la paie belge**

Projet développé pour les secrétariats sociaux et cabinets RH en Belgique.

---

## 📋 Structure du Projet

```
socialflow/
├── apps/
│   └── web/              # Application Next.js 16 (Frontend + API)
├── packages/
│   ├── ui/              # Composants Shadcn/UI + design system
│   ├── database/         # Prisma schema + migrations
│   ├── utils/            # Utilitaires partagés
│   └── config/           # Configuration TypeScript
├── PLANNING.md           # Roadmap avec dates et jalons
└── README.md            # Ce fichier
```

---

## 🛠️ Stack Technique

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Backend:** Next.js API Routes, Better Auth
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis (Upstash)
- **Paiements:** Stripe
- **Email:** Resend
- **Monorepo:** Turborepo + pnpm

---

## 🚀 Démarrer en local

### Prérequis
- Node.js >= 18
- pnpm >= 10
- PostgreSQL local OU Vercel Postgres
- Git

### Installation

```bash
# 1. Clone le repo
git clone <repo-url>
cd socialflow

# 2. Install dépendances
pnpm install

# 3. Configure environment
cp apps/web/.env.local.example apps/web/.env.local
# Édite .env.local avec tes clés (DB, OAuth, Stripe, etc.)

# 4. Setup database
cd apps/web
pnpm prisma migrate dev

# 5. Démarre dev
pnpm dev
```

L'app sera sur **http://localhost:3000**

---

## 📅 Jalons du Projet

Voir [PLANNING.md](./doc/PLANNING.md) pour le roadmap complet avec dates.

### Phase 1 : Landing Page ✨ (EN COURS)
- [x] Infrastructure (Sprint 0) — 20 Juil
- [ ] **Landing page (Sprint 1) — 3 Août**

### Phase 2 : Core Features
- [ ] Auth pages (Sprint 2) — 17 Août
- [ ] Dashboards (Sprints 3-6) — Octobre
- [ ] Backend complet (Sprint 7) — 14 Déc
- [ ] Intégrations (Sprint 8) — 11 Janv
- [ ] Testing & Polish (Sprints 9-10) — 21 Mars

### Remise finale
- [ ] MVP production-ready — **30 Juin 2027**

---

## 📖 Documentation

- **[PLANNING.md](./PLANNING.md)** — Roadmap avec étapes et dates
- **[doc/analysis/PRD_CLIENT.md](./doc/analysis/PRD_CLIENT.md)** — Cahier des charges complet
- **[doc/analysis/SPEC_FINAL.md](./doc/analysis/SPEC_FINAL.md)** — Spécification technique détaillée
- **[doc/analysis/ARCHITECTURE.md](./doc/analysis/ARCHITECTURE.md)** — Architecture système & API

---

## 🎨 Design System

Utilise **Shadcn/UI** + **Tweakcn** pour les thèmes personnalisés.

Couleurs de marque:
- **Primaire:** Violet (`#7c3aed`)
- **Secondaire:** Teal (`#0d9488`)

---

## 🧪 Tests

```bash
# Lint
pnpm lint

# Type check
pnpm type-check

# Tests (à venir)
pnpm test
```

---

## 📦 Build & Deploy

```bash
# Build production
pnpm build

# Deploy sur Vercel
# (automatic via Git push to main)
```

---

## 👤 Contact

**Auteur:** Adrien  
**Email:** adrien231020@gmail.com  
**Projet:** SocialFlow MVP  
**Année:** 2026-2027

---

**Bon développement! 🚀**
