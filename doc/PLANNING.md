# 📅 PLANNING DE DÉVELOPPEMENT — SocialFlow MVP

**Projet:** SocialFlow - Plateforme SaaS de gestion de paie belge  
**Durée totale:** ~12 mois (Juillet 2026 - Juin 2027)  
**Effort:** 6h/jour, 30h/semaine, du lundi au vendredi  
**Dernière mise à jour:** 16 Juillet 2026  

---

## 📊 RÉSUMÉ DES SPRINTS

| Sprint | Dates | Phase | Statut |
|--------|-------|-------|--------|
| **0** | 09-20 Juil | Setup & Infrastructure | 🟢 COMPLÉTÉ |
| **1** | 21 Juil - 3 Août | Landing Page | 🟢 COMPLÉTÉ (en avance) |
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
  - ✅ Structure monorepo créée (apps/)
  - ✅ apps/web package.json
  - ✅ Turbo.json config
  - ✅ npm workspaces (migré depuis pnpm en cours de route — voir Sprint 1)

- ✅ **Configuration Next.js**
  - ✅ next.config.ts
  - ✅ tsconfig.json
  - ✅ tailwind.config.ts
  - ✅ eslint.config.mjs (flat config, migré depuis .eslintrc.json)

- ✅ **Design System & Styling**
  - ✅ Tailwind 4 setup
  - ✅ Shadcn/UI + thème Tweakcn appliqué
  - ✅ Couleurs de marque (indigo `#4f46e5` + teal `#00c49f`)
  - ✅ Variables CSS globales, dark mode fonctionnel

- ✅ **Documentation & Config**
  - ✅ README.md (racine)
  - ✅ apps/web/README.md
  - ✅ .env.local.example
  - ✅ .gitignore

### 🎯 Jalon: Infrastructure Ready
**Statut:** ✅ VALIDÉ  
**Critère:** Structure complète, prête pour `npm install`

---

## 🟢 SPRINT 1 : LANDING PAGE (COMPLÉTÉ EN AVANCE)

**Dates:** 21 Juillet 2026 - 3 Août 2026 (terminé le 16 Juillet, en avance sur planning)  
**Statut:** 🟢 **COMPLÉTÉ**  
**Effort estimé:** 60h

### ✅ Tâches Complétées

- ✅ **Structure Composants Landing**
  - ✅ `components/landing/navbar.tsx` (lien actif, dropdown Entreprise, menu mobile)
  - ✅ `components/landing/hero.tsx`
  - ✅ `components/landing/trust-badges.tsx` (logos + citations clients)
  - ✅ `components/landing/features.tsx`
  - ✅ `components/landing/roles.tsx`
  - ✅ `components/landing/pricing.tsx`
  - ✅ `components/landing/faq.tsx`
  - ✅ `components/landing/footer.tsx`
  - (`cta.tsx` supprimé — jugé redondant avec les CTA déjà présents par section)

- ✅ **Composants Utilitaires**
  - ✅ `components/providers/theme-provider.tsx`
  - ✅ `components/theme-toggle.tsx`
  - ✅ `components/motion/fade-in.tsx`, `components/motion/counter.tsx`

- ✅ **Pages** — au-delà du scope initial, la landing a été étendue en plusieurs routes dédiées :
  - ✅ `/` (accueil), `/fonctionnalites`, `/pour-qui`, `/tarifs`, `/faq`
  - ✅ `/a-propos`, `/contact`
  - ✅ `/rgpd`, `/conditions`, `/confidentialite` (pages légales)

- ✅ **Qualité & outillage** (au-delà du scope initial du sprint)
  - ✅ Dark/light mode testé et fonctionnel
  - ✅ Responsive mobile/tablet/desktop vérifié
  - ✅ Tests unitaires (Vitest + RTL) sur les composants avec logique — 17 tests, 4 fichiers
  - ✅ Couverture de code configurée (`npm run test:coverage`)
  - ✅ ESLint (flat config) + Prettier + TypeScript strict, tous propres
  - ✅ Déployé sur Vercel (`main`, `dev`, `prod`)
  - ✅ Assets (logos, favicon) optimisés (compression ~98%)

### 🟡 Reste à faire (reporté, non-bloquant)

- [ ] Audit Lighthouse formel (score cible > 90)
- [ ] SEO avancé (sitemap.xml, robots.txt, structured data)

### 🎯 Jalon: Landing Page Live
**Statut:** ✅ **VALIDÉ** (16 Juillet 2026, en avance sur la cible du 3 Août)  
**Critères de validation:**
- [x] Landing page en ligne sur Vercel
- [x] Dark/Light mode fonctionnel
- [x] Mobile responsive
- [x] FAQ accordéon
- [x] Pricing switch mensuel/annuel
- [x] SEO de base (metadata par page)
- [ ] Lighthouse > 90 (non vérifié formellement)

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
| Landing page Lighthouse | >90 | ⏳ Non mesuré |
| Test coverage | >80% | 🟡 ~49% (baseline landing page, composants avec logique à 90-100%) |
| Uptime | >99.9% | ⏳ À faire |
| Responsive design | Mobile/Tablet/Desktop | ✅ Oui |
| Dark mode | Fonctionnel | ✅ Oui |

---

## 🎯 JALONS MAJEURS

| Jalon | Date Cible | Statut | Validé |
|-------|-----------|--------|--------|
| ✅ Infrastructure ready | 20 Juil 2026 | 🟢 COMPLÉTÉ | ✅ |
| 🚀 **Landing page live** | ~~3 Août 2026~~ **16 Juil 2026** | 🟢 COMPLÉTÉ (en avance) | ✅ |
| Auth pages + login | 17 Août 2026 | ⏳ À faire | ⏳ |
| Cabinet dashboard | 21 Sept 2026 | ⏳ À faire | ⏳ |
| Backend complet | 14 Déc 2026 | ⏳ À faire | ⏳ |
| Intégrations Stripe | 11 Janv 2027 | ⏳ À faire | ⏳ |
| MVP production-ready | 21 Mars 2027 | ⏳ À faire | ⏳ |
| 🎓 Remise finale | 30 Juin 2027 | ⏳ À faire | ⏳ |

---

## 📝 NOTES D'IMPLÉMENTATION

### Architecture
- **Monorepo:** Turborepo + npm workspaces (migré depuis pnpm mi-Sprint 1)
- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS 4 + Shadcn/UI
- **Database:** PostgreSQL + Prisma *(prévu — pas encore implémenté)*
- **Cache:** Redis (Upstash) *(prévu — pas encore implémenté)*
- **Auth:** Better Auth (Magic Link + OAuth) *(prévu — pas encore implémenté)*
- **Payments:** Stripe + Webhooks *(prévu — pas encore implémenté)*

### Code Quality
- ✅ ESLint (flat config) + Prettier configurés et appliqués sur tout le code
- ✅ TypeScript strict mode activé
- ✅ Tests unitaires (Vitest + React Testing Library)
- [ ] Pre-commit hooks (pas encore mis en place)
- [ ] CI/CD pipeline via GitHub Actions (déploiement actuel : Vercel Git integration, pas de workflow CI dédié)

### Next Immediate Actions

```bash
# 1. Installer dépendances
npm install

# 2. Setup .env.local
cp apps/web/.env.local.example apps/web/.env.local

# 3. Démarrer dev
npm run dev

# 4. Vérifier sur http://localhost:3000
```

---

## 📞 Contact & Communication

**Auteur:** Adrien  
**Email:** adrien231020@gmail.com  
**Mise à jour:** Hebdomadaire le lundi  
**Prochaine révision:** 21 Juillet 2026

---

**Document vivant — Mis à jour régulièrement selon la progression**  
**Dernière modif:** 16 Juillet 2026
