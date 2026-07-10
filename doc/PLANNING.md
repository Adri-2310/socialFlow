# 📅 PLANNING DE DÉVELOPPEMENT — SocialFlow MVP

**Projet:** SocialFlow - Plateforme SaaS de gestion de paie belge  
**Durée totale:** ~12 mois (Juillet 2026 - Juin 2027)  
**Effort:** 6h/jour, 30h/semaine, du lundi au vendredi  
**Dernière mise à jour:** 09 Juillet 2026  

---

## 📊 RÉSUMÉ DES SPRINTS

| Sprint | Dates | Phase | Statut |
|--------|-------|-------|--------|
| **0** | 09-20 Juil | Setup & Infrastructure | 🟢 COMPLÉTÉ |
| **1** | 21 Juil - 3 Août | Landing Page | 🟡 EN COURS |
| **2** | 4-17 Août | Auth & Login | ⏳ À faire |
| **3-6** | 18 Août - 2 Nov | Dashboards & Portails | ⏳ À faire |
| **7** | 3 Nov - 14 Déc | Backend & API | ⏳ À faire |
| **8** | 15 Déc - 11 Janv | Intégrations | ⏳ À faire |
| **9-10** | 12 Janv - 21 Mars | Testing & Polish | ⏳ À faire |
| **Buffer** | 22 Mars - 30 Juin | Contingency & Finitions | ⏳ Réserve |

---

## 🟢 SPRINT 0 : SETUP & INFRASTRUCTURE (COMPLÉTÉ)

**Dates:** 09 Juillet 2026 - 20 Juillet 2026  
**Statut:** 🟢 **COMPLÉTÉ** (09 Juil 2026)  
**Effort:** 60h

### ✅ Tâches Complétées

- ✅ **Init Turborepo + Next.js 16**
  - ✅ Structure monorepo créée (apps/, packages/)
  - ✅ apps/web package.json
  - ✅ Turbo.json config
  - ✅ pnpm-workspace.yaml

- ✅ **Configuration Next.js**
  - ✅ next.config.ts
  - ✅ tsconfig.json
  - ✅ tailwind.config.ts
  - ✅ .eslintrc.json

- ✅ **Design System & Styling**
  - ✅ Tailwind 4 setup
  - ✅ Shadcn/UI structure (prêt pour tweakcn)
  - ✅ Couleurs de marque (violet + teal)
  - ✅ Variables CSS globales

- ✅ **Documentation & Config**
  - ✅ README.md (racine)
  - ✅ apps/web/README.md
  - ✅ .env.local.example
  - ✅ .gitignore

### 🎯 Jalon: Infrastructure Ready
**Statut:** ✅ VALIDÉ  
**Critère:** Structure complète, prête pour `pnpm install`

---

## 🟡 SPRINT 1 : LANDING PAGE (EN COURS)

**Dates:** 21 Juillet 2026 - 3 Août 2026  
**Statut:** 🟡 **EN COURS** (jour 0 — 09 Juil)  
**Effort estimé:** 60h

### ✅ Tâches Complétées

- ✅ **Structure Composants Landing** (09 Juil)
  - ✅ `components/landing/navbar.tsx`
  - ✅ `components/landing/hero.tsx`
  - ✅ `components/landing/trust-badges.tsx`
  - ✅ `components/landing/features.tsx`
  - ✅ `components/landing/roles.tsx`
  - ✅ `components/landing/pricing.tsx`
  - ✅ `components/landing/faq.tsx`
  - ✅ `components/landing/cta.tsx`
  - ✅ `components/landing/footer.tsx`

- ✅ **Composants Utilitaires** (09 Juil)
  - ✅ `components/providers/theme-provider.tsx`
  - ✅ `components/theme-toggle.tsx`

- ✅ **Pages** (09 Juil)
  - ✅ `app/layout.tsx` (Root)
  - ✅ `app/page.tsx` (Landing)
  - ✅ `app/globals.css`

### 🟡 Tâches En Attente

- [ ] Tester dark/light mode
- [ ] Ajuster responsive design si nécessaire (mobile + tablet + desktop)
- [ ] Optimiser images et performance
- [ ] Tester smooth scroll sur ancres
- [ ] Vérifier Lighthouse score > 90
- [ ] Tests unitaires des composants
- [ ] Déployer sur Vercel

### ⏱️ Timeline Détaillée

| Date | Tâche | Statut |
|------|-------|--------|
| 09 Juil | Structure complète créée | ✅ FAIT |
| 10-12 Juil | Tester & ajuster responsive | ⏳ À faire |
| 13-15 Juil | Performance & SEO | ⏳ À faire |
| 16-17 Juil | Déployer Vercel | ⏳ À faire |
| 18-20 Juil | Buffer & polish | ⏳ À faire |
| 3 Août | **Landing page live** | 🎯 Cible |

### 🎯 Jalon: Landing Page Live
**Date cible:** 3 Août 2026  
**Critères de validation:**
- [ ] Landing page en ligne sur Vercel
- [ ] Dark/Light mode fonctionnel
- [ ] Mobile responsive ✓
- [ ] Smooth scroll sur sections ✓
- [ ] FAQ accordéon ✓
- [ ] Pricing switch mensuel/annuel ✓
- [ ] SEO de base ✓
- [ ] Lighthouse > 90

---

## 🟡 SPRINT 2 : AUTH & PAGES DE CONNEXION (À faire)

**Dates:** 4 Août 2026 - 17 Août 2026  
**Statut:** ⏳ **À faire**  
**Effort estimé:** 50h

### Tâches Prévues

- [ ] Setup Better Auth
- [ ] Pages de login/register
- [ ] Magic link implementation
- [ ] Google OAuth integration
- [ ] Microsoft OAuth integration
- [ ] Session management
- [ ] Tests auth flows

---

## 🟠 SPRINTS 3-6 : DASHBOARDS & PORTAILS (À faire)

**Dates:** 18 Août 2026 - 2 Novembre 2026  
**Statut:** ⏳ **À faire**  
**Effort estimé:** 250h

### Portails à Implémenter

- [ ] Cabinet RH Dashboard (Sprint 3)
- [ ] Gestionnaire RH Dashboard (Sprint 4)
- [ ] Entreprise Cliente Portal (Sprint 5)
- [ ] Collaborateur Portal (Sprint 6)

---

## 🔴 SPRINT 7 : BACKEND & API (À faire)

**Dates:** 3 Novembre 2026 - 14 Décembre 2026  
**Statut:** ⏳ **À faire**  
**Effort estimé:** 150h

### API Routes à Créer

- [ ] /api/auth/* (login, register, logout, refresh)
- [ ] /api/cabinet/* (create, update, delete, list)
- [ ] /api/gestionnaires/* (invite, assign, manage)
- [ ] /api/entreprises/* (CRUD operations)
- [ ] /api/collaborateurs/* (CRUD + import)
- [ ] /api/fiches/* (create, validate, send, archive)
- [ ] /api/webhooks/stripe (payment handling)

---

## 🔴 SPRINT 8 : INTÉGRATIONS (À faire)

**Dates:** 15 Décembre 2026 - 11 Janvier 2027  
**Statut:** ⏳ **À faire**  
**Effort estimé:** 90h

### Intégrations Prévues

- [ ] Stripe (payment processing)
- [ ] Resend (email service)
- [ ] Google OAuth (fully integrated)
- [ ] Microsoft OAuth (fully integrated)
- [ ] Exact Online (accounting sync)
- [ ] BullMQ (job queuing)

---

## 🔴 SPRINTS 9-10 : TESTING & POLISH (À faire)

**Dates:** 12 Janvier 2027 - 21 Mars 2027  
**Statut:** ⏳ **À faire**  
**Effort estimé:** 220h

### Activités Principales

- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] E2E tests (Playwright)
- [ ] Performance optimization
- [ ] Security audit
- [ ] RGPD compliance check
- [ ] Documentation complète
- [ ] Bug fixes

---

## 📦 BUFFER & CONTINGENCY

**Dates:** 22 Mars 2027 - 30 Juin 2027  
**Durée:** ~10 semaines  
**Utilisation:** Imprévus, améliorations, finitions

---

## 📈 MÉTRIQUES DE SUIVI

| Métrique | Cible | Statut |
|----------|-------|--------|
| Landing page Lighthouse | >90 | 🟡 En cours |
| Test coverage | >80% | ⏳ À faire |
| Uptime | >99.9% | ⏳ À faire |
| Responsive design | Mobile/Tablet/Desktop | 🟡 En cours |
| Dark mode | Fonctionnel | ✅ Oui |

---

## 🎯 JALONS MAJEURS

| Jalon | Date Cible | Statut | Validé |
|-------|-----------|--------|--------|
| ✅ Infrastructure ready | 20 Juil 2026 | 🟢 COMPLÉTÉ | ✅ |
| 🚀 **Landing page live** | **3 Août 2026** | 🟡 EN COURS | ⏳ |
| Auth pages + login | 17 Août 2026 | ⏳ À faire | ⏳ |
| Cabinet dashboard | 21 Sept 2026 | ⏳ À faire | ⏳ |
| Backend complet | 14 Déc 2026 | ⏳ À faire | ⏳ |
| Intégrations Stripe | 11 Janv 2027 | ⏳ À faire | ⏳ |
| MVP production-ready | 21 Mars 2027 | ⏳ À faire | ⏳ |
| 🎓 Remise finale | 30 Juin 2027 | ⏳ À faire | ⏳ |

---

## 📝 NOTES D'IMPLÉMENTATION

### Architecture
- **Monorepo:** Turborepo + pnpm workspaces
- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS 4 + Shadcn/UI
- **Database:** PostgreSQL + Prisma
- **Cache:** Redis (Upstash)
- **Auth:** Better Auth (Magic Link + OAuth)
- **Payments:** Stripe + Webhooks

### Code Quality
- ESLint + Prettier configured
- TypeScript strict mode enabled
- Pre-commit hooks ready
- CI/CD pipeline via GitHub Actions

### Next Immediate Actions (09 Juil)

```bash
# 1. Installer dépendances
pnpm install

# 2. Copier assets du dossier maquette
# cp doc/maquette/assets/* apps/web/public/

# 3. Setup .env.local
cp apps/web/.env.local.example apps/web/.env.local

# 4. Démarrer dev
pnpm dev

# 5. Vérifier sur http://localhost:3000
```

---

## 📞 Contact & Communication

**Auteur:** Adrien  
**Email:** adrien231020@gmail.com  
**Mise à jour:** Hebdomadaire le lundi  
**Prochaine révision:** 14 Juillet 2026

---

**Document vivant — Mis à jour régulièrement selon la progression**  
**Dernière modif:** 09 Juillet 2026, 15:30
