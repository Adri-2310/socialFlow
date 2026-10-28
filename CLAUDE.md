# SocialFlow — instructions pour les assistants de code

SaaS multi-tenant de gestion de la paie belge (TFE d'Adrien Mertens). Next.js 16 · React 19 · TypeScript strict · Prisma 7 + Neon · Better Auth 1.7 · Stripe · Resend · Vercel.

## Avant toute tâche

1. Lire **`doc/README.md`** puis les documents du chantier demandé (fiche de rôle ou de module).
2. **`doc/DECISIONS.md` est la source de vérité.** En cas de contradiction avec un autre document, suivre `DECISIONS.md`.
3. **Ne jamais suivre `doc/archive/`** (anciens PRD, SPEC, UML) : prix, authentification, hébergement et noms de rôles y sont obsolètes.
4. Si une règle métier manque ou est ambiguë : **s'arrêter et poser la question** à Adrien. Ne jamais inventer une règle, un taux, un barème ou un délai.

## Règles non négociables

- **Isolation multi-tenant** : toute requête filtre côté serveur selon le périmètre du rôle (`doc/FONCTIONNEMENT.md` § 4). Ressource hors périmètre → `404`. `cabinetId`, `role` et `entrepriseId` viennent de la session, jamais du client.
- **Autorisations** conformes à `doc/PERMISSIONS.md`, via `lib/authz/authz.ts`. Pas de contrôle de rôle ad hoc.
- **Le SuperAdmin n'accède jamais aux données de paie** (D8). **Le Cabinet RH ne voit que des agrégats** (D26).
- **Fiches de paie** : machine à états `BROUILLON → A_VALIDER → VALIDEE → ENVOYEE (→ REMPLACEE)`. Aucune modification hors `BROUILLON`. Une fiche `ENVOYEE` n'est **jamais** modifiée ni recalculée.
- **Argent en centimes entiers.** Aucun flottant pour un montant.
- **Moteur de paie** (`lib/payroll/`) : fonctions pures, paramètres légaux uniquement depuis une `BaremeVersion`, cas de référence au centime près. Aucun taux en dur.
- **Données sensibles** (NISS, IBAN, secrets) chiffrées ; jamais dans les logs, les messages d'erreur ou les réponses d'API non nécessaires.
- **Audit** de chaque action sensible, dans la même transaction que l'action.
- **Intégrations externes** derrière une interface avec une implémentation simulée (`doc/modules/integrations.md`).

## Façon de travailler

- Branche `feature/<sujet>` depuis `dev`. Commits en français, au présent (« Ajoute… », « Corrige… »).
- Ordre d'une route d'API : session → autorisation → validation Zod → règles métier → écriture + audit en transaction → réponse `{ error: 'CODE' }` en cas d'échec (`doc/CONVENTIONS.md` § 3).
- Chaque nouvelle route arrive avec ses **tests d'isolation**. Lancer `npm run lint`, `npm run type-check` et `npm test` dans `apps/web` avant de proposer un commit.
- Respecter la « définition de terminé » de `doc/CONVENTIONS.md` § 8, y compris la mise à jour de la fiche concernée et de `doc/JOURNAL.md`.
- Commentaires en français, qui expliquent le pourquoi et renvoient à la décision (`// D27 : …`).
- Préférer de petits changements relisibles : Adrien relit et doit pouvoir expliquer chaque fichier.
- Interface : **aucun `<button>`, `<input>`, `<select>`, `<textarea>` ni `<table>` écrit à la main** hors de `components/ui/` ; on utilise shadcn/ui et les composants partagés de `components/shared/` (`doc/CONVENTIONS.md` § 5). Ne pas modifier `components/ui/` sans nécessité expliquée ; couleurs de texte conformes à D62 (`text-destructive-text`, jamais `text-secondary`).

## Commandes

```bash
cd apps/web
npm run dev          # http://localhost:3000
npm test             # Vitest (base Neon de dev, fichiers en série)
npm run lint
npm run type-check
npm run db:migrate   # prisma migrate dev
```
