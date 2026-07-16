# 🌐 apps/web

**Application Next.js 16 — Landing page marketing SocialFlow**

Aujourd'hui, cette application contient uniquement la landing page publique. Le dashboard,
l'authentification et les API métier sont prévus (voir [Roadmap](#-roadmap-à-venir)) mais pas
encore implémentés.

---

## 📁 Structure actuelle

```
apps/web/
├── public/                  # Assets statiques (logos, favicon, manifest...)
├── __mocks__/                # Mocks de modules externes (ex: framer-motion)
├── src/
│   ├── app/
│   │   ├── page.tsx          # Landing page (accueil)
│   │   ├── layout.tsx        # Root layout
│   │   ├── globals.css       # Styles globaux (thème Tweakcn)
│   │   ├── fonctionnalites/  # Page dédiée
│   │   ├── pour-qui/         # Page dédiée
│   │   ├── tarifs/           # Page dédiée
│   │   ├── faq/              # Page dédiée
│   │   ├── a-propos/         # Page dédiée
│   │   ├── contact/          # Page dédiée
│   │   ├── rgpd/             # Page légale
│   │   ├── conditions/       # Page légale
│   │   └── confidentialite/  # Page légale
│   ├── components/
│   │   ├── landing/          # Composants de la landing page
│   │   ├── motion/           # Wrappers d'animation (FadeIn, Counter)
│   │   ├── providers/        # Context providers (ThemeProvider)
│   │   └── theme-toggle.tsx
│   └── lib/                  # Utilitaires
├── tests/                    # Tous les tests unitaires, en miroir de src/
│   ├── setup.ts               # Setup Vitest (jest-dom, polyfills)
│   └── components/
│       ├── theme-toggle.test.tsx
│       └── landing/
│           ├── navbar.test.tsx
│           ├── faq.test.tsx
│           └── pricing.test.tsx
├── vitest.config.ts          # Config Vitest
├── eslint.config.mjs         # ESLint (flat config)
├── next.config.ts            # Next.js config
├── tailwind.config.ts        # Tailwind config
├── tsconfig.json             # TypeScript config
└── package.json              # Dépendances
```

---

## 🚀 Dev local

```bash
# Depuis la racine (socialflow/)
npm run dev

# L'app est sur http://localhost:3000
```

---

## 📝 Pages actuelles

| Route | Contenu |
|---|---|
| `/` | Accueil (Hero, trust bar, stats, teasers) |
| `/fonctionnalites` | Détail des fonctionnalités |
| `/pour-qui` | Segments cibles (cabinet RH, gestionnaire, entreprise, salarié) |
| `/tarifs` | Grille tarifaire |
| `/faq` | Questions fréquentes |
| `/a-propos` | Mission et valeurs |
| `/contact` | Contact commercial & support |
| `/rgpd`, `/conditions`, `/confidentialite` | Pages légales |

---

## 🎨 Styling

- **Framework:** Tailwind CSS 4
- **UI Kit:** Shadcn/UI + Tweakcn
- **Dark Mode:** Supporté via classe `dark`
- **Couleurs de marque:** Indigo (`#4f46e5`) + Teal (`#00c49f`)
- **Animations:** Framer Motion

---

## 🧪 Tests

```bash
# Lancer les tests une fois
npm test

# Mode watch
npm run test:watch

# Avec couverture de code
npm run test:coverage
```

Tests unitaires (Vitest + React Testing Library) sur les composants avec logique
(navbar, theme toggle, FAQ, pricing).

---

## 📦 Scripts

```bash
npm run dev            # Serveur de dev
npm run build          # Build production
npm start               # Démarrer le build production
npm run lint            # ESLint
npm run type-check      # tsc --noEmit
npm test                # Tests unitaires
npm run test:watch      # Tests en mode watch
npm run test:coverage   # Tests avec couverture de code
npm run clean           # Nettoyer .next/dist
```

---

## 🗺️ Roadmap (à venir)

Non implémenté pour l'instant :

- **Authentification** (Better Auth) — routes `(auth)/`, magic link, OAuth Google/Microsoft
- **Dashboard Cabinet RH** — routes `(dashboard)/*`
- **Portails Entreprise & Collaborateur** — routes `(portal)/*`
- **API Routes** — `/api/*` (auth, companies, payrolls, webhooks Stripe)
- **Base de données** — PostgreSQL + Prisma
- **Composants Shadcn/UI** dans `components/ui/`, `hooks/`, `types/`, `middleware.ts`

Voir [doc/analysis/ARCHITECTURE.md](../../doc/analysis/ARCHITECTURE.md) pour le détail de
l'architecture cible.

---

## 📚 Ressources

- [Next.js 16 Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Shadcn/UI](https://ui.shadcn.com)
- [Vitest](https://vitest.dev)

---

**Bon développement! 🚀**
