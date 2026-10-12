# ⚠️ Archive — ne plus suivre

Documents d'analyse de juin-juillet 2026, **remplacés** par la documentation de `doc/` le 12/10/2026. Ils sont conservés pour l'historique du projet et pour le rapport (évolution de l'analyse).

Principales raisons de leur abandon :

| Sujet | Dans ces documents | Désormais |
|---|---|---|
| Prix | 99 € / 299 € | 150 / 300 / 750 € (D34) |
| Authentification | JWT maison 1 h + refresh 24 h | Sessions Better Auth en base |
| Hébergement | Vercel, Coolify ou MinIO selon le document | Vercel + Neon |
| Files d'attente | BullMQ + Redis | Vercel Cron, traitements idempotents |
| Noms de rôles | Admin Secrétariat, Consultant, Client, Employé | Cabinet RH, Gestionnaire RH, Entreprise cliente, Collaborateur |
| Statuts de fiche | Avec accents, incohérents | `BROUILLON → A_VALIDER → VALIDEE → ENVOYEE → REMPLACEE` |
| Envoi des fiches | Cabinet RH, pièce jointe PDF | Gestionnaire, lien sécurisé + code (D11, D12, D43) |

| Fichier | Remplacé par |
|---|---|
| `SPEC_FINAL.md` | `DECISIONS.md`, `roles/*`, `FONCTIONNEMENT.md` |
| `ARCHITECTURE.md` | `FONCTIONNEMENT.md`, `CONVENTIONS.md`, `modules/integrations.md` |
| `ARCHITECTURE_SOCIALFLOW_RBAC.md` | `PERMISSIONS.md`, `roles/*` |
| `PRD_INTERNE.md` | `ROADMAP.md`, `DECISIONS.md` |
| `PLANNING.md` | `ROADMAP.md` |

Les diagrammes UML du dossier TFE (`_uml/`) utilisent eux aussi l'ancien vocabulaire et sont à considérer comme archivés.
