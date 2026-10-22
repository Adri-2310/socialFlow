import type { EmailTheme } from '@/lib/email/email-brand';
import { emailTheme, type CabinetEmailBrand } from '@/lib/email/email-brand';
import { TEMPLATES, renderBody, renderSubject, type TemplateType } from '@/lib/email/email-templates';

// Gabarit HTML des emails de SocialFlow et des cabinets : pur, sans envoi ni
// acces donnees. Utilise par lib/email/email.ts pour envoyer, ET par l'apercu des
// modeles d'emails du cabinet, pour que l'apercu soit exactement le mail recu.

export const BRAND_GRADIENT = 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 45%, #0f766e 100%)';
export const CTA_GRADIENT = 'linear-gradient(135deg, #4f46e5 0%, #00c49f 100%)';

// `theme` : identite du cabinet pour les emails envoyes en son nom (D33).
// Absent = identite SocialFlow (securite, plateforme).
export function emailShell(content: string, theme?: EmailTheme | null): string {
  const headerBg = theme?.headerBg ?? '#4c1d95';
  const headerFg = theme?.headerFg ?? '#ffffff';
  const ctaBg = theme?.ctaBg ?? '#4f46e5';
  const headerBackground = theme
    ? `background-color:${headerBg};`
    : `background-color:#4c1d95; background-image:${BRAND_GRADIENT};`;
  const brandMark = theme
    ? `${
        theme.logoUrl
          ? `<img src="${escapeHtml(theme.logoUrl)}" alt="" height="36" style="display:inline-block; height:36px; width:auto; max-width:160px; vertical-align:middle; margin-right:12px; border:0;" />`
          : ''
      }<span class="email-brand" style="font-size:19px; font-weight:700; color:${headerFg}; vertical-align:middle;">${escapeHtml(theme.brandName ?? '')}</span>`
    : `<span class="email-brand" style="font-size:19px; font-weight:700; color:#ffffff;">Social<span style="color:#5eead4;">Flow</span></span>`;
  const footer = theme
    ? `© 2026 ${escapeHtml(theme.footer)}`
    : '© 2026 SocialFlow — Tous droits réservés.';

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>
      /* Outlook.com (desktop + web) applique son propre mode sombre et
         reinterprete les couleurs inline, y compris quand color-scheme dit
         "light". [data-ogsc]/[data-ogsb] sont les hooks qu'Outlook ajoute
         lui-meme au DOM en mode sombre : on les cible pour reimposer nos
         couleurs de marque en !important. */
      [data-ogsc] .email-wrap, [data-ogsb] .email-wrap { background-color: #f1f0f5 !important; }
      [data-ogsc] .email-card, [data-ogsb] .email-card { background-color: #ffffff !important; }
      [data-ogsc] .email-header, [data-ogsb] .email-header { background-color: ${headerBg} !important; }
      [data-ogsc] .email-brand, [data-ogsc] .email-brand span { color: ${headerFg} !important; }
      [data-ogsc] .email-button-cell, [data-ogsb] .email-button-cell { background-color: ${ctaBg} !important; }
      [data-ogsc] .email-button-link { color: ${theme?.ctaFg ?? '#ffffff'} !important; }
      [data-ogsc] .email-otp-box, [data-ogsb] .email-otp-box { background-color: #f8f7fc !important; }
      [data-ogsc] .email-otp-code { color: #4c1d95 !important; }
      [data-ogsc] .email-body, [data-ogsb] .email-body { background-color: #ffffff !important; }
      [data-ogsc] .email-body,
      [data-ogsc] .email-body p,
      [data-ogsc] .email-body h1,
      [data-ogsc] .email-body span { color: #334155 !important; }
    </style>
  </head>
  <body class="email-wrap" style="margin:0; padding:32px 16px; background-color:#f1f0f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" class="email-card" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 12px 32px rgba(76,29,149,0.12);">
            <tr>
              <td bgcolor="${headerBg}" class="email-header" style="${headerBackground} padding:28px 32px;">
                ${brandMark}
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-body" style="padding:32px; background-color:#ffffff; color:#334155; font-size:14px; line-height:1.6;">
                ${content}
              </td>
            </tr>
          </table>
          <p style="margin-top:20px; font-size:12px; color:#94a3b8;">${footer}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// `name` vient de updateUser({name}) sans contrainte serveur : contrairement
// a `url`/`oldEmail`/`newEmail` (generes par better-auth ou valides comme
// adresses email), c'est du texte libre qu'un utilisateur peut definir a
// volonte - a echapper avant interpolation dans du HTML (voir audit
// securite, doc/analysis/AUDIT_SECURITE_AUTH.md, finding #6).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ctaButton(label: string, url: string, theme?: EmailTheme | null): string {
  const bg = theme?.ctaBg ?? '#4f46e5';
  const fg = theme?.ctaFg ?? '#ffffff';
  const background = theme
    ? `background-color:${bg};`
    : `background-color:#4f46e5; background-image:${CTA_GRADIENT};`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td bgcolor="${bg}" class="email-button-cell" style="border-radius:12px; ${background}">
                <a href="${url}" class="email-button-link" style="display:inline-block; padding:13px 28px; font-size:14px; font-weight:600; color:${fg}; text-decoration:none;">${label}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// Apercu d'un email : meme HTML que l'envoi, mais les liens ne sont PAS
// cliquables. L'attribut `href` est retire (une balise <a> sans adresse n'est
// pas un lien) et une regle CSS desactive le pointeur et le curseur "main".
// Fait dans le HTML plutot que par du JavaScript, qui ne tourne pas dans un
// cadre isole.
export function inertLinks(html: string): string {
  const withoutHref = html.replace(/\shref="[^"]*"/gi, '');
  const style =
    '<style>a{pointer-events:none !important;cursor:default !important;}</style>';
  return withoutHref.includes('</head>')
    ? withoutHref.replace('</head>', `${style}</head>`)
    : `${style}${withoutHref}`;
}

// Email d'invitation d'un gestionnaire (D30, D33, D68) : sujet et HTML complets,
// tels qu'ils partent. `template` : modele personnalise du cabinet, sinon celui
// par defaut. Le titre, le bouton et la mention de securite restent fixes.
export function buildGestionnaireInvitation(input: {
  brand: CabinetEmailBrand;
  inviterName: string;
  url: string;
  template?: { subject: string; body: string } | null;
  subjectPrefix?: string;
  portalUrl?: string;
}): { subject: string; html: string } {
  return buildInvitation({ type: 'INVITATION_GESTIONNAIRE', ...input });
}

// Invitation de l'administrateur d'une entreprise cliente (D4, D5) : meme
// gabarit, avec le nom de l'entreprise.
export function buildEntrepriseInvitation(input: {
  brand: CabinetEmailBrand;
  inviterName: string;
  entrepriseName: string;
  url: string;
  template?: { subject: string; body: string } | null;
  subjectPrefix?: string;
  portalUrl?: string;
}): { subject: string; html: string } {
  return buildInvitation({ type: 'INVITATION_ENTREPRISE', ...input });
}

// Invitation d'un salarié à son espace (roles/03 § 4.3) : même gabarit, avec son prénom et le
// nom de son entreprise. Pas de nom d'invitant : c'est le cabinet qui écrit au salarié.
export function buildCollaborateurInvitation(input: {
  brand: CabinetEmailBrand;
  prenom: string;
  entrepriseName: string;
  url: string;
  template?: { subject: string; body: string } | null;
  subjectPrefix?: string;
  portalUrl?: string;
}): { subject: string; html: string } {
  return buildInvitation({ type: 'INVITATION_COLLABORATEUR', inviterName: '', ...input });
}

// Apercu d'un modele quel que soit son type : l'editeur n'a pas a connaitre les
// variables propres a chaque invitation.
export function buildTemplatePreview(
  type: TemplateType,
  input: {
    brand: CabinetEmailBrand;
    template: { subject: string; body: string };
  },
): { subject: string; html: string } {
  const sample = TEMPLATES[type].sample;
  return buildInvitation({
    type,
    brand: input.brand,
    inviterName: sample.invitant_nom,
    entrepriseName: sample.entreprise_nom,
    prenom: sample.prenom,
    url: sample.lien,
    template: input.template,
    // Domaine reserve : ne mene jamais a un vrai site.
    portalUrl: 'https://portail.invalid/connexion/votre-cabinet',
  });
}

// Rappel du portail de connexion : apres l'invitation, la personne se connecte par la
// page du cabinet, pas par SocialFlow (D76). Adresse http(s) uniquement.
function portalLine(portalUrl: string | undefined, cabinetName: string): string {
  if (!portalUrl || !/^https?:\/\//.test(portalUrl)) return '';
  const href = escapeHtml(portalUrl);
  return `<p style="margin:20px 0 0; font-size:13px; color:#475569;">Pour vous reconnecter par la suite, utilisez le portail de ${cabinetName} : <a href="${href}" style="color:inherit; font-weight:600; text-decoration:underline;">${href}</a></p>`;
}

// Email de bienvenue apres la creation du compte (D76) : rappelle l'adresse du portail du
// cabinet, seul endroit ou la personne se connecte. Envoye au nom du cabinet.
export function buildWelcomeAccount(input: {
  brand: CabinetEmailBrand;
  name: string;
  portalUrl: string;
  entrepriseName?: string | null;
}): { subject: string; html: string } {
  const { brand } = input;
  const theme = emailTheme(brand);
  const accent = theme?.headerBg ?? '#6d28d9';
  const cabinet = escapeHtml(brand.name);
  const safeUrl = /^https?:\/\//.test(input.portalUrl) ? escapeHtml(input.portalUrl) : null;
  const where = input.entrepriseName
    ? `l’espace de ${escapeHtml(input.entrepriseName)}`
    : `l’espace de ${cabinet}`;

  const html = emailShell(
    `
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${accent};">Bienvenue</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre compte est créé</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(input.name)},</p>
    <p style="margin:0 0 12px; color:#475569;">Votre compte pour accéder à ${where} est prêt. Pour vous connecter, utilisez toujours le portail de ${cabinet} : conservez cet email ou ajoutez l’adresse à vos favoris.</p>
    <div style="height:12px;"></div>
    ${safeUrl ? ctaButton('Ouvrir mon portail', safeUrl, theme) : ''}
    ${safeUrl ? `<p style="margin:20px 0 0; font-size:13px; color:#475569; word-break:break-all;">${safeUrl}</p>` : ''}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n’êtes pas à l’origine de cette création de compte, contactez ${cabinet}.</p>
  `,
    theme,
  );

  return { subject: `Bienvenue chez ${brand.name}`, html };
}

// Prevenu l'ancien administrateur d'une entreprise (D78) : son acces a ete remplace. Au nom
// du cabinet ; aucune donnee du remplacant n'y figure.
export function buildAdminReplaced(input: {
  brand: CabinetEmailBrand;
  name: string;
  entrepriseName: string;
}): { subject: string; html: string } {
  const { brand } = input;
  const theme = emailTheme(brand);
  const accent = theme?.headerBg ?? '#6d28d9';
  const cabinet = escapeHtml(brand.name);
  const entreprise = escapeHtml(input.entrepriseName);

  const html = emailShell(
    `
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${accent};">Accès au compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre accès a été remplacé</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(input.name)},</p>
    <p style="margin:0; color:#475569;">${cabinet} a désigné un nouvel administrateur pour l’espace de ${entreprise}. Votre compte est désormais désactivé et vous ne pouvez plus vous y connecter. Si vous pensez qu’il s’agit d’une erreur, contactez ${cabinet}.</p>
  `,
    theme,
  );

  return { subject: `Votre accès à l’espace de ${input.entrepriseName} a été remplacé`, html };
}

function buildInvitation(input: {
  type: TemplateType;
  brand: CabinetEmailBrand;
  inviterName: string;
  entrepriseName?: string;
  // Prénom du salarié (invitation COLLABORATEUR).
  prenom?: string;
  url: string;
  template?: { subject: string; body: string } | null;
  subjectPrefix?: string;
  // Portail de connexion du cabinet (D76), pour se reconnecter apres la creation du compte.
  portalUrl?: string;
}): { subject: string; html: string } {
  const { brand, inviterName, url, type } = input;
  const theme = emailTheme(brand);
  const accent = theme?.headerBg ?? '#6d28d9';
  const name = escapeHtml(brand.name);
  const content = input.template ?? TEMPLATES[type].defaults;
  const values: Record<string, string> = {
    cabinet_nom: brand.name,
    invitant_nom: inviterName,
    lien: url,
    ...(input.entrepriseName ? { entreprise_nom: input.entrepriseName } : {}),
    ...(input.prenom ? { prenom: input.prenom } : {}),
  };
  const title =
    type === 'INVITATION_COLLABORATEUR'
      ? 'Accédez à votre espace salarié'
      : type === 'INVITATION_ENTREPRISE' && input.entrepriseName
        ? `Accédez à l’espace de ${escapeHtml(input.entrepriseName)}`
        : `Vous êtes invité à rejoindre ${name}`;

  const html = emailShell(
    `
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${accent};">Invitation</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">${title}</h1>
    ${renderBody(content.body, values)}
    <div style="height:12px;"></div>
    ${ctaButton('Accepter l’invitation', url, theme)}
    ${portalLine(input.portalUrl, name)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous ne connaissez pas ${name} ou n'attendiez pas cette invitation, ignorez simplement cet email.</p>
  `,
    theme,
  );

  return { subject: `${input.subjectPrefix ?? ''}${renderSubject(content.subject, values)}`, html };
}
