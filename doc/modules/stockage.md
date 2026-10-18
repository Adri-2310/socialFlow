# Module : stockage des fichiers

> Statut : **à construire**. Décision : **D54**.
> Premier usage : avatars (profil) et logos (branding, C7) ; puis documents et pièces de messagerie (C5) ; puis PDF de fiches (C4).
> `StorageGateway` doit exister dès C0/C1 pour éviter de refaire les premiers usages.

## 1. Principe

Les fichiers vivent dans **Vercel Blob**, derrière une interface `StorageGateway` (même logique que `DeclarationGateway`, D50). La base Neon ne contient que les **métadonnées** (propriétaire, taille, type, chemin). Aucun fichier en base.

```
lib/storage/
  gateway.ts      (interface)
  vercel-blob.ts  (implémentation du TFE)
  memory.ts       (tests Vitest, sans réseau)
```

Évolution possible en production : implémentation S3-compatible (Scaleway, R2, AWS) sans toucher au reste. À présenter comme tel dans le rapport.

## 2. Catégories

| Catégorie | Exemples | Accès | Quota du plan | Durée |
|---|---|---|---|---|
| **Public léger** | Avatars, logos de cabinet | Lisible par tous (URL non devinable) | **Non** | Vie du compte |
| **Privé sensible** | PDF de fiches, contrats, C4, 281.10, certificats médicaux, pièces de messagerie | Uniquement via route serveur après `authorize()` + audit | **Oui** | 5 ans pour les documents légaux |
| **Temporaire** | Imports CSV, exports RGPD | Propriétaire seul | Non | 1 jour (CSV), 7 jours (export RGPD) |

## 3. Interface (indicatif)

```ts
interface StorageGateway {
  put(key: string, data: Buffer | ReadableStream, opts: { contentType: string; visibility: 'public' | 'private' }): Promise<{ url?: string; sizeBytes: number }>;
  get(key: string): Promise<ReadableStream>;      // lecture serveur uniquement
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;   // purge d'un cabinet archivé
}
```

Clés privées : `{cabinetId}/{entrepriseId}/{type}/{cuid}.{ext}`. Le préfixe par cabinet facilite la purge à 90 jours (D28) et l'isolation.

## 4. Modèle

```
Document
  id, cabinetId, entrepriseId?, salarieId?,
  type (FICHE_PDF | CONTRAT | C4 | FISCALE_281_10 | CERTIFICAT | PIECE_MESSAGE | AUTRE),
  nom, mimeType, sizeBytes, storageKey, visibility,
  statut: EN_ATTENTE | ACTIF | SUPPRIME,
  auteurId, createdAt, deletedAt?
```

- Index sur `cabinetId` et `deletedAt` (conventions).
- **Quota** : `SUM(sizeBytes)` des documents `ACTIF` privés du cabinet, comparé à `maxStorageMb` (D15). Jamais d'interrogation du stockage.

## 5. Avatars et logos

- Upload via route serveur, **2 Mo maximum** en entrée (JPG, PNG, WebP).
- Redimensionnement serveur avec `sharp` : avatar **WebP 256×256**, logo **PNG ou SVG nettoyé, 1 Mo maximum** (voir `modules/personnalisation.md` § 2). Les métadonnées EXIF sont supprimées.
- URL publique stockée dans `user.image` (Better Auth) ou `Cabinet.logoUrl`. Sans avatar : initiales.
- Ne pas afficher directement l'image Google ou Microsoft du compte lié (fuite d'adresse IP vers un tiers).
- Ne compte pas dans le quota du plan.

## 6. Documents privés

### Envoi
Limite des fonctions Vercel de 4,5 Mo : au-delà, l'envoi direct par le navigateur est nécessaire. Pour le TFE (10 Mo maximum par fichier, **à confirmer**) :

1. `POST /api/documents` : session → `authorize` → Zod → **contrôle du quota avant tout envoi** → création du `Document` en `EN_ATTENTE` → jeton d'envoi client Vercel Blob de courte durée.
2. Le navigateur envoie le fichier directement au stockage.
3. `POST /api/documents/[id]/confirm` : vérification de la taille réelle et du **type réel** (signature du fichier, pas l'extension) → statut `ACTIF` + audit.
4. Cron quotidien : suppression des `EN_ATTENTE` de plus de 24 h et de leurs fichiers.

Types autorisés : PDF, JPG, PNG, CSV, XLSX.

### Téléchargement
Route `GET /api/documents/[id]/download` : `authorize` (hors périmètre → `404`) → **audit** → lecture serveur du fichier et renvoi en flux. Jamais de lien direct partagé ; le stockage n'est jamais exposé au navigateur pour le privé.

> À vérifier avant C4/C5 : si Vercel Blob propose un mode d'accès réellement privé pour le store utilisé. Sinon, la lecture par route serveur ci-dessus est la solution de repli, et les clés restent non devinables.

### PDF de fiches
Écrit **une seule fois** à l'envoi (statut `ENVOYEE`), jamais réécrit (D13). Une rectificative produit un nouveau fichier.

### Suppression et conservation
- Soft-delete pour les documents ordinaires.
- Documents légaux (fiches, C4, 281.10) non supprimables pendant 5 ans.
- Cabinet archivé : purge du préfixe après 90 jours, **sauf** les documents légaux (D28).

## 7. Sécurité et RGPD

- Le SuperAdmin n'a **aucun accès au contenu** (D8) : uniquement des volumes agrégés.
- Le Cabinet RH ne voit pas les documents (D26).
- Chiffrement au repos assuré par le fournisseur (suffisant pour le TFE). **Évolution** : chiffrement applicatif AES-256-GCM des fiches et certificats médicaux, et verrou de rétention de 5 ans, à décrire comme mesures de production.
- Région du store : UE si le projet le permet, sinon à noter comme limite dans `RGPD.md` (point ouvert « localisation des données »).
- Vercel (fournisseur de stockage) à lister parmi les sous-traitants ultérieurs dans `RGPD.md`.

## 8. Limites de l'offre actuelle

L'offre gratuite affiche **1 Go** de Blob (1,41 Mo utilisés au 13/10/2026). Le jeu de démonstration (seed) reste très en dessous (< 100 Mo). Les quotas des plans (5 / 25 / 100 Go) se testent en base avec des valeurs réduites (par exemple un plan de test à 5 Mo) ; les tests nettoient leurs fichiers (préfixes `vitest-`, `e2e-`).

## 9. Tâches planifiées

| Tâche | Fréquence |
|---|---|
| Suppression des documents `EN_ATTENTE` > 24 h | Quotidienne |
| Suppression des fichiers temporaires (CSV 1 j, export RGPD 7 j) | Quotidienne |
| Purge des préfixes des cabinets archivés depuis 90 jours (hors documents légaux) | Quotidienne, avec la purge existante |

Toutes idempotentes et protégées par `CRON_SECRET`.

## 10. Critères d'acceptation

- Dépôt qui dépasse le quota : `403 QUOTA_EXCEEDED` **avant** tout envoi au stockage.
- Document d'un autre cabinet, d'une entreprise non assignée ou d'un autre salarié : `404`.
- Chaque téléchargement de fiche ou de document sensible écrit une entrée d'audit.
- Un fichier dont le type réel ne correspond pas à l'extension est refusé.
- Aucune fiche `ENVOYEE` n'est réécrite dans le stockage (test).
- Les tests tournent sur l'implémentation en mémoire, sans réseau.

## 11. Question ouverte

1. Taille maximale d'un document : 10 Mo proposé (déjà noté dans `modules/collaboration.md` § 3).
