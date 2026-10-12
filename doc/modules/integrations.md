# Module : intégrations externes

> Statut : **à construire**. Décisions : D2 (objectif : connexion réelle), D36, D40.
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

**Risque principal** : l'accès suppose une organisation enregistrée (numéro d'entreprise, gestion des accès) qui agit pour des employeurs. En tant qu'étudiant, il faut vérifier **dès maintenant** si l'école, ton client ou un secrétariat social partenaire peut te donner accès à la simulation. Écrire à `TBDIMONA@smals.be` en expliquant le projet.

## 3. Déclaration trimestrielle ONSS (DmfA)

| Élément | Constat |
|---|---|
| Canal | Envoi de fichiers ou web service via le portail de la sécurité sociale, mêmes prérequis d'accès que la DIMONA **[à vérifier : canal et environnement de test exacts]** |
| Contenu | Pour chaque travailleur et chaque trimestre : périodes d'occupation, rémunérations, codes de prestations, cotisations et réductions |
| Dans SocialFlow | Génération à partir des fiches `ENVOYEE` du trimestre → contrôle de cohérence → envoi → suivi des anomalies |

Proposition : construire d'abord la **génération et le contrôle du fichier**. Ce travail ne dépend d'aucun accès et a de la valeur seul. L'envoi réel vient ensuite si l'accès est obtenu.

## 4. Certificat de chômage C4

Document remis au travailleur à la fin du contrat, avec une version électronique transmise par les canaux de la sécurité sociale **[à vérifier : canal électronique et conditions d'accès]**. Dans SocialFlow : génération du C4 à partir du dossier (dates, motif de fin, rémunérations), PDF dans les documents du collaborateur, transmission électronique si l'accès est obtenu.

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

## 8. Plan de repli (important pour la remise)

| Intégration | Si l'accès réel est obtenu | Sinon, pour la remise |
|---|---|---|
| DIMONA | Envoi réel en simulation officielle | Implémentation simulée fidèle aux formats et statuts officiels + documentation de la démarche d'accès |
| DmfA | Envoi réel | Génération et contrôle du fichier + simulation de la réponse |
| C4 | Transmission électronique | PDF + simulation |
| Exact Online | Synchronisation réelle sur une instance de démonstration | Simulation |
| BelCotax | Dépôt manuel du XML généré | Idem |

Ce plan permet de **démontrer tout le périmètre** même si une administration tarde à répondre. Le rapport présente alors la démarche d'accès comme une évolution immédiate.

## 9. Actions à lancer tout de suite (sans attendre le développement)

1. Écrire à `TBDIMONA@smals.be` : demander l'accès à la simulation DIMONA pour un projet de fin d'études et les conditions (mandat, certificat, Chaman).
2. Demander à ton client (`PRD_CLIENT`) s'il peut agir comme organisation déclarante pour la simulation.
3. Créer un compte App Center Exact Online et vérifier l'accès à une instance de démonstration.

## Sources

- [Dimona via web service, sécurité sociale](https://www.socialsecurity.be/site_fr/employer/applics/dimona/introduction/webservice.htm)
- [Documentation fonctionnelle du web service REST Dimona (PDF)](https://www.socialsecurity.be/site_fr/employer/applics/dimona/documents/pdf/documentation_fonctionelle_ws_rest_dimona_FR.pdf)
- [Guide d'intégration de l'API Exact Online, Apideck](https://apideck.com/blog/guide-to-exact-online-api-integration) (source tierce : chiffres à confirmer sur la documentation officielle d'Exact)
