# apps/web

**Application Next.js 16 de SocialFlow** : site public, authentification, espaces de chaque rôle et API. Pour l'installation et le déploiement, voir le [README racine](../../README.md) ; pour les règles métier, la [documentation](../../doc/README.md).

---

## Structure

```
apps/web/
├── prisma/
│   ├── schema.prisma        # Modèle de données (PostgreSQL)
│   ├── migrations/          # Migrations Prisma (ne jamais modifier une migration poussée)
│   └── seed.mjs             # Plans de base
├── scripts/                 # Maintenance : création du SuperAdmin, rechiffrement, prix Stripe
├── src/
│   ├── app/
│   │   ├── (marketing)/     # Site public : accueil, fonctionnalités, tarifs, FAQ, contact, pages légales
│   │   ├── (auth)/          # Connexion, inscription, mot de passe, invitations, portail du cabinet (connexion/[slug])
│   │   ├── dashboard/       # Espaces : admin, cabinet, gestionnaire, entreprise
│   │   ├── profil/          # Compte, sécurité, 2FA, comptes liés (tous les rôles)
│   │   └── api/             # Routes d'API, webhooks Stripe, tâches planifiées (cron)
│   ├── components/          # Par domaine : admin, cabinet, gestionnaire, auth, layout, landing…
│   │   └── ui/              # Composants shadcn/ui (générés)
│   └── lib/                 # Logique métier et accès aux données, par domaine
│       ├── auth/            # Better Auth, sessions, hooks
│       ├── authz/           # Autorisations : authorize(), matrice des permissions, gardes
│       ├── billing/         # Abonnements, Stripe, délai de grâce, changements de plan
│       ├── branding/        # Thème, couleurs, logo du cabinet
│       ├── cabinet/         # Données, quotas, audit, export, suspension, purge
│       ├── crypto/          # Chiffrement des champs sensibles (NISS, IBAN)
│       ├── email/           # Envoi et modèles d'emails
│       ├── entreprise/      # Portefeuille d'entreprises clientes et leur administrateur
│       ├── invitations/     # Création, acceptation et aperçu des invitations
│       ├── periode/         # Périodes de paie et prestations
│       ├── portal/          # Portail de connexion du cabinet et application installable
│       ├── salarie/         # Dossiers salariés, conditions de travail, import CSV
│       └── schemas/         # Schémas Zod partagés (client et serveur)
└── tests/                   # Tests Vitest, en miroir de src/ (lib/, components/)
```

---

## Espaces et rôles

| Rôle | Espace | Écrans |
|---|---|---|
| SuperAdmin | `/dashboard/admin` | Vue d'ensemble, cabinets, utilisateurs, monitoring, journal d'audit, facturation, configuration des plans (2FA obligatoire) |
| Cabinet RH | `/dashboard/cabinet` | Vue d'ensemble, gestionnaires, entreprises, abonnement et paiement, paramètres (identité, branding, emails, portail, données), journal d'audit |
| Gestionnaire RH | `/dashboard/gestionnaire` | Tableau de bord, salariés par entreprise, fiche salarié, périodes de paie et prestations |
| Entreprise cliente | `/dashboard/entreprise` | Accueil (le reste arrive avec le chantier Entreprise) |
| Collaborateur | — | À venir |

Chaque page appelle `requireAuthorized(action)` et chaque route d'API `authorize(request, action)` : les actions et leur niveau par rôle sont définis dans `src/lib/authz/authz.ts`, en miroir de [doc/PERMISSIONS.md](../../doc/PERMISSIONS.md).

---

## Scripts

```bash
npm run dev               # serveur de développement (http://localhost:3000)
npm run build             # build de production
npm start                 # démarrer le build
npm run lint              # ESLint
npm run type-check        # TypeScript
npm test                  # tests Vitest
npm run test:watch        # tests en continu
npm run test:coverage     # couverture

npm run db:generate       # générer le client Prisma
npm run db:migrate        # créer et appliquer une migration (dev)
npm run db:studio         # explorer la base
npm run superadmin:create -- <email> [--nom "Prénom Nom"] [--force]
npm run bareme:activer -- <code> --par <email> [--derogation "<motif>"] [--dry-run]   # activer un barème (D22, D122)
npm run db:reencrypt      # convertir NISS et IBAN au format v2 (--dry-run pour simuler)
node scripts/resync-yearly-prices.mjs [--apply]   # recaler les prix annuels Stripe (simulation par défaut)
```

---

## Tests

- Vitest + React Testing Library, environnement `jsdom`, fichiers exécutés en série.
- Les tests d'intégration utilisent une vraie base : la branche Neon `dev` en local (via `.env.local`), la branche `test` en CI.
- Chaque route arrive avec ses tests d'isolation : un utilisateur d'un autre cabinet, ou un gestionnaire non assigné, obtient `404`.

Voir [doc/TESTS.md](../../doc/TESTS.md).

---

## Interface

- Tailwind CSS 4 et shadcn/ui (`components.json`, style `base-nova`). Tout nouvel écran utilise `components/ui`.
- Thème clair et sombre ; couleurs SocialFlow : primaire `#4f46e5`, secondaire `#00c49f`.
- Chaque cabinet peut appliquer sa marque (nom, logo, couleurs) à son espace et à ceux de ses clients : variables CSS posées côté serveur par `buildThemeCss` (`lib/branding/branding-rules.ts`), avec contrôle du contraste.
- Animations du site public avec Framer Motion.

---

## Ressources

[Next.js](https://nextjs.org/docs) · [Prisma](https://www.prisma.io/docs) · [Better Auth](https://www.better-auth.com/docs) · [shadcn/ui](https://ui.shadcn.com) · [Tailwind CSS](https://tailwindcss.com) · [Vitest](https://vitest.dev)