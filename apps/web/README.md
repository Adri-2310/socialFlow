# 🌐 apps/web

**Application Next.js 16 — Frontend + API Routes**

L'application principale SocialFlow avec tous les portails et API.

---

## 📁 Structure

```
apps/web/
├── public/              # Assets statiques (images, favicon, etc.)
├── src/
│   ├── app/
│   │   ├── (auth)/     # Pages authentication
│   │   ├── (dashboard)/ # Pages protégées Cabinet RH
│   │   ├── (portal)/   # Portails Entreprise/Collaborateur
│   │   ├── api/        # Routes API
│   │   ├── layout.tsx  # Root layout
│   │   ├── page.tsx    # Landing page (accueil)
│   │   └── globals.css # Styles globaux
│   ├── components/
│   │   ├── landing/    # Composants landing page
│   │   ├── dashboard/  # Composants dashboard
│   │   ├── ui/         # Composants Shadcn/UI
│   │   └── providers/  # Context providers
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilitaires
│   ├── types/          # TypeScript types
│   └── middleware.ts   # Auth middleware
├── .env.local.example  # Variables d'environnement (template)
├── .eslintrc.json      # ESLint config
├── next.config.ts      # Next.js config
├── tailwind.config.ts  # Tailwind config
├── tsconfig.json       # TypeScript config
└── package.json        # Dépendances
```

---

## 🚀 Dev Local

```bash
# Depuis la racine (socialflow/)
pnpm dev

# L'app est sur http://localhost:3000
```

---

## 📝 Pages & Routes

### Landing Page
- **Route:** `/` (page.tsx)
- **Composants:** Hero, Features, Pricing, FAQ, etc.

### Auth (À venir)
- **Routes:** `/login`, `/register`, `/reset-password`
- **Provider:** Better Auth

### Dashboard Cabinet (À venir)
- **Routes:** `/dashboard/*`
- **Portée:** Cabinet RH seulement (role CABINET_RH)

### Portail Entreprise (À venir)
- **Routes:** `/portal/entreprise/*`
- **Portée:** Admin Entreprise seulement

### Portail Collaborateur (À venir)
- **Routes:** `/portal/collaborateur/*`
- **Portée:** Salarié seulement

### API Routes
- **Base:** `/api/*`
- **Auth:** `/api/auth/*`
- **Data:** `/api/companies/*`, `/api/payrolls/*`, etc.
- **Webhooks:** `/api/webhooks/stripe`

---

## 🎨 Styling

- **Framework:** Tailwind CSS 4
- **UI Kit:** Shadcn/UI + Tweakcn
- **Dark Mode:** Supporté via classe `dark`
- **Couleurs:** Brandées (violet + teal)

---

## 🔐 Auth

**Better Auth setup** (À implémenter en Sprint 2)
- Magic Link (15 min)
- Password (bcrypt)
- Google OAuth
- Microsoft OAuth

---

## 📦 Scripts

```bash
# Dev
pnpm dev

# Build
pnpm build

# Start production
pnpm start

# Linting
pnpm lint

# Type check
pnpm type-check

# Clean
pnpm clean
```

---

## 📚 Ressources

- [Next.js 16 Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Shadcn/UI](https://ui.shadcn.com)
- [Prisma Docs](https://www.prisma.io/docs)

---

**Bon développement! 🚀**
