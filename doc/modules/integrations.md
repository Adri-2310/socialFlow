# Module : intégrations externes

> Statut : **à construire**. Décisions : D2, **D50** (DIMONA, DmfA et C4 simulées à partir de la documentation officielle ; Exact Online réel), D36, D40.
> Ce document fait aussi office d'**étude de faisabilité** : il dit ce qui est réellement accessible, à quelles conditions, et ce qu'on fait si l'accès n'est pas obtenu à temps.

## 1. Architecture commune

Chaque intégration passe par une **interface** avec deux implémentations interchangeables par variable d'environnement :

```
lib/integrations/
  dimona/   gateway.ts (interface)  simulated.ts  socialsecurity.ts
  dmfa/     gateway.ts               simulated.ts  socialsecurity.ts
  exact/    gateway.ts               simulated.ts  exact-online.ts
  belcotax/ gateway.ts               simulated.ts  (export fichier)
```

- `INTEGRATION_MODE=simulated | sandbox | production` : choix par intégration, réglé dans la configuration.
- L'implémentation **simulée** reproduit les vrais formats et statuts (y compris refus et anomalies). Elle sert aux tests automatiques et à la **démonstration devant le jury**, qui ne dépend ainsi d'aucun service externe.
- Toute requête et réponse externe est journalisée (`Declaration.payload`, `Declaration.reponse`), sans secret.
- Les identifiants (certificats, secrets OAuth) vivent dans les variables d'environnement ou chiffrés en base, jamais dans le code.

## 2. DIMONA (déclaration immédiate de l'emploi)

| Élément | Constat |
|---|---|
| Canal | **Web service REST** de la sécurité sociale (JSON) |
| Environnement de test | **Oui** : environnement de **simulation**, dont les déclarations ne sont pas enregistrées dans le fichier du personnel réel. URL : `services-sim.socialsecurity.be/REST/dimona/v1/declarations` |
| Production | `services.socialsecurity.be/REST/dimona/v1/declarations` |
| Prérequis | Compte sur le portail de la sécurité sociale + configuration du canal dans **Chaman** + **certificat X.509** au nom de l'organisation + protocole **OAuth** (Client ID `self_service_expeditor_X`) |
| Droits | Le déclarant doit être **l'employeur ou son mandataire** (sinon 403) |
| Traitement | **Asynchrone** : POST → 201 avec l'URL de consultation ; GET jusqu'au résultat `A` (acceptée), `W` (acceptée avec avertissements), `B` (refusée), `S` (attente d'identification du travailleur). Médiane 2,5 s ; interrogation chaque seconde jusqu'à 30 s, puis chaque minute jusqu'à 20 min |
| Contact technique | `TBDIMONA@smals.be` |

**Flux dans SocialFlow**
1. Création ou modification d'un dossier → `Declaration` `A_ENVOYER` (D40).
2. Envoi : POST, stockage du numéro Dimona, statut `ENVOYEE`.
3. Job d'interrogation selon le rythme recommandé → `ACCEPTEE` (avec avertissements éventuels) ou `REFUSEE` (anomalies affichées en clair au gestionnaire).
4. Alerte si une DIMONA IN n'est pas acceptée la veille du premier jour de travail.

**Choix retenu (D50)** : l'accès suppose une organisation enregistrée qui agit pour des employeurs, hors de portée du TFE. SocialFlow implémente donc une **simulation fidèle** du web service, à partir de la documentation fonctionnelle publique : mêmes blocs JSON, mêmes réponses (201 puis A / W / B / S), mêmes codes d'anomalie, même rythme d'interrogation. La simulation produit aussi des refus réalistes (NISS invalide, déclaration hors délai…) pour tester l'affichage des anomalies. Passer au réel = ajouter l'implémentation `socialsecurity.ts` sans toucher au reste.

## 3. Déclaration trimestrielle ONSS (DmfA)

| Élément | Constat |
|---|---|
| Canal | Envoi de fichiers ou web service via le portail de la sécurité sociale, mêmes prérequis d'accès que la DIMONA **[à vérifier : canal et environnement de test exacts]** |
| Contenu | Pour chaque travailleur et chaque trimestre : périodes d'occupation, rémunérations, codes de prestations, cotisations et réductions |
| Dans SocialFlow | Génération à partir des fiches `ENVOYEE` du trimestre → contrôle de cohérence → envoi → suivi des anomalies |

Choix retenu (D50) : **génération et contrôle du fichier** selon les schémas officiels publics, puis **réponse simulée** (acceptation ou anomalies). Pas d'envoi réel pour le TFE.

## 4. Certificat de chômage C4

Document remis au travailleur à la fin du contrat, avec une version électronique transmise par les canaux de la sécurité sociale **[à vérifier : canal électronique et conditions d'accès]**. Dans SocialFlow : génération du C4 à partir du dossier (dates, motif de fin, rémunérations), PDF dans les documents du collaborateur ; transmission électronique **simulée** (D50).

## 5. Exact Online (plans Pro et Enterprise, D36)

| Élément | Constat |
|---|---|
| Accès | Compte sur l'**App Center** (`apps.exactonline.com`), enregistrement d'une app (Client ID, Client Secret, URL de callback) ; option « app de test » |
| Restriction | Avant la revue d'Exact (plusieurs semaines), l'app ne fonctionne qu'avec la **même instance Exact** que son créateur : suffisant pour un TFE avec un environnement de démonstration |
| Belgique | `https://start.exactonline.be/api/oauth2/auth` et `/api/oauth2/token` |
| Limites | 60 appels/minute et 5 000/jour par app et par société ; 60 enregistrements par requête |
| Particularité | Chaque appel cible une **division** (récupérée via `/api/v1/current/Me`) |

**Flux dans SocialFlow**
- Le Cabinet RH connecte **son** compte Exact (OAuth) ; jetons chiffrés en base, rafraîchis automatiquement.
- Le gestionnaire associe chaque entreprise cliente à une division Exact.
- Synchronisation : les entreprises clientes (création/mise à jour) et l'**export des écritures de salaires** après l'envoi des fiches d'un mois (charges, dettes ONSS et précompte, net à payer).
- File d'attente avec respect des limites (429 → nouvel essai différé).

⚠️ À vérifier : disponibilité d'un environnement Exact Online de démonstration gratuit ou peu coûteux pour un développeur en Belgique.

## 6. Fiche fiscale 281.10 (BelCotax)

Fiche annuelle des rémunérations, transmise au SPF Finances via **BelCotax-on-web** au format XML. Proposition : générer la fiche et le **fichier XML** dans SocialFlow (le collaborateur la voit dans ses documents), avec dépôt manuel du fichier par le cabinet. L'envoi automatique reste une évolution. **Périmètre à confirmer** (question ouverte du rôle Collaborateur).

## 7. Stripe (déjà intégré)

Voir `roles/01-superadmin.md` § 6.1 et `roles/02-cabinet-rh.md` : Checkout avec essai, portail client, webhook signé et idempotent, délai de grâce.

## 8. Ce qui est réel et ce qui est simulé (D50)

| Intégration | Pour la remise | Évolution possible |
|---|---|---|
| DIMONA | **Simulée**, fidèle à la documentation officielle | Connexion réelle via un mandat et un certificat |
| DmfA | Fichier **réellement généré et contrôlé**, réponse simulée | Envoi réel |
| C4 | PDF réel, transmission simulée | Transmission électronique réelle |
| Exact Online | **Réelle**, sur une instance de démonstration | Validation de l'app par Exact |
| BelCotax (si dans le périmètre) | XML généré, dépôt manuel | Envoi automatique |

Le rapport présente la connexion réelle aux services de la sécurité sociale comme une **évolution immédiate**, rendue simple par l'architecture en interfaces.

## 9. Actions à lancer tout de suite (sans attendre le développement)

1. Télécharger la documentation officielle (documentation fonctionnelle du web service REST Dimona, glossaires et schémas de la bibliothèque technique, instructions DmfA) et la ranger dans `doc/reference/dimona/` et `doc/reference/dmfa/`, avec la date de téléchargement.
2. Créer un compte App Center Exact Online et vérifier l'accès à une instance de démonstration.

## Sources

- [Dimona via web service, sécurité sociale](https://www.socialsecurity.be/site_fr/employer/applics/dimona/introduction/webservice.htm)
- [Documentation fonctionnelle du web service REST Dimona (PDF)](https://www.socialsecurity.be/site_fr/employer/applics/dimona/documents/pdf/documentation_fonctionelle_ws_rest_dimona_FR.pdf)
- [Guide d'intégration de l'API Exact Online, Apideck](https://apideck.com/blog/guide-to-exact-online-api-integration) (source tierce : chiffres à confirmer sur la documentation officielle d'Exact)
