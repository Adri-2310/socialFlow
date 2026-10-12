# Module : personnalisation du cabinet et white-label

> Statut : **à construire**. Décisions : D30, D33, D35.

## 1. Niveaux

| Élément | Starter / Pro | Enterprise (white-label) |
|---|---|---|
| Nom affiché (remplace « SocialFlow » dans les portails de l'équipe et des clients) | ✓ | ✓ |
| Logo, couleur primaire et secondaire | ✓ | ✓ |
| Modèles d'emails | ✓ | ✓ |
| Mention « Propulsé par SocialFlow » (pied de page, emails) | Affichée | **Masquée** |
| Domaine personnalisé (ex. `paie.moncabinet.be`) | — | ✓ |
| Adresse d'envoi des emails sur le domaine du cabinet | — | ✓ **[à confirmer : domaine vérifié chez Resend par cabinet]** |

La console SuperAdmin, les pages marketing et l'inscription restent toujours aux couleurs de SocialFlow.

## 2. Application du thème

- Le thème est résolu **côté serveur** à partir de l'utilisateur connecté (son cabinet) ou, pour un lien de fiche sans compte, du cabinet de la fiche.
- Les couleurs sont injectées comme variables CSS (`--primary`, `--secondary`) sur la racine des portails : les composants shadcn/ui existants en héritent sans modification.
- **Contraste vérifié** à l'enregistrement : refus d'une couleur dont le contraste avec le texte est insuffisant (WCAG AA, 4,5:1), avec suggestion d'une teinte plus foncée.
- Logo : PNG ou SVG, 1 Mo maximum, redimensionné ; SVG nettoyé (pas de script).
- PDF des fiches : logo et couleur primaire du cabinet.

## 3. Modèles d'emails (D30)

```
EmailTemplate
  id, cabinetId, type, sujet, corps, updatedAt, updatedBy
```

- Types : `INVITATION_GESTIONNAIRE`, `INVITATION_ENTREPRISE`, `INVITATION_COLLABORATEUR`, `PRESTATIONS_A_ENCODER`, `PRESTATIONS_RAPPEL`, `FICHES_A_VALIDER`, `VALIDATION_RAPPEL`, `FICHE_DISPONIBLE`, `DEMANDE_TRAITEE`.
- Absence de modèle personnalisé = modèle par défaut de SocialFlow.
- Variables autorisées par type (liste fermée) : `{{cabinet_nom}}`, `{{entreprise_nom}}`, `{{destinataire_prenom}}`, `{{periode}}`, `{{date_limite}}`, `{{lien}}`, `{{nombre_fiches}}`… Une variable inconnue bloque l'enregistrement.
- Le corps est du texte enrichi limité (gras, italique, liens, paragraphes), rendu dans la mise en page email commune (React Email ou équivalent) : le cabinet ne peut pas casser la mise en page ni injecter du HTML.
- Aperçu avec des données fictives et envoi d'un test à soi-même.
- Les emails de sécurité (connexion, mot de passe, 2FA) ne sont **pas** personnalisables.

## 4. Domaine personnalisé (Enterprise)

1. Le cabinet saisit son sous-domaine ; l'application affiche l'enregistrement DNS (CNAME) à créer.
2. Vérification DNS, puis ajout du domaine au projet Vercel (API Vercel) avec certificat HTTPS automatique.
3. Le middleware associe l'hôte de la requête au cabinet : thème et connexion sur ce domaine.
4. Les cookies de session sont propres à chaque domaine : se connecter sur le domaine du cabinet ne connecte pas sur `socialflow` et inversement.

**[à vérifier]** Limites du plan Vercel sur le nombre de domaines personnalisés ; à présenter comme évolution si c'est bloquant.

## 5. Critères d'acceptation

- Un cabinet Starter ou Pro qui tente d'activer le white-label reçoit `403 PLAN_FEATURE_UNAVAILABLE`.
- Aucune couleur enregistrée ne viole le contraste minimal.
- Le rendu d'un modèle ne peut jamais contenir de HTML ou de script fourni par le cabinet.
