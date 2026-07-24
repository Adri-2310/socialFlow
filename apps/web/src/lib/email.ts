import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const BRAND_GRADIENT = 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 45%, #0f766e 100%)';
const CTA_GRADIENT = 'linear-gradient(135deg, #4f46e5 0%, #00c49f 100%)';

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#f1f0f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 12px 32px rgba(76,29,149,0.12);">
            <tr>
              <td bgcolor="#4c1d95" style="background-color:#4c1d95; background-image:${BRAND_GRADIENT}; padding:28px 32px;">
                <span style="font-size:19px; font-weight:700; color:#ffffff;">Social<span style="color:#5eead4;">Flow</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#334155; font-size:14px; line-height:1.6;">
                ${content}
              </td>
            </tr>
          </table>
          <p style="margin-top:20px; font-size:12px; color:#94a3b8;">© 2026 SocialFlow — Tous droits réservés.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td bgcolor="#4f46e5" style="border-radius:12px; background-color:#4f46e5; background-image:${CTA_GRADIENT};">
                <a href="${url}" style="display:inline-block; padding:13px 28px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${label}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export async function sendMagicLinkEmail(email: string, url: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre lien de connexion</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour vous connecter à votre espace SocialFlow. Ce lien est valable 5 minutes et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Se connecter', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Votre lien de connexion SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendOTPEmail(email: string, otp: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre code de connexion</h1>
    <p style="margin:0 0 24px; color:#475569;">Saisissez ce code dans SocialFlow pour vous connecter. Il est valable 5 minutes.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" bgcolor="#f8f7fc" style="padding:20px; border-radius:14px; background-color:#f8f7fc; border:1px solid #ede9fe;">
          <span style="font-size:32px; font-weight:700; letter-spacing:10px; color:#4c1d95; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${otp}</span>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Votre code de connexion SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendVerificationEmail(email: string, url: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Vérification d'email</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez votre adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour confirmer cette adresse email sur votre compte SocialFlow.</p>
    ${ctaButton('Confirmer mon email', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Confirmez votre adresse email SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendChangeEmailConfirmationEmail(
  oldEmail: string,
  newEmail: string,
  url: string,
) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez le changement d'adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Une demande de changement d'adresse email a été faite sur votre compte SocialFlow, de <strong>${oldEmail}</strong> vers <strong>${newEmail}</strong>. Cliquez ci-dessous pour l'autoriser.</p>
    ${ctaButton('Autoriser le changement', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre adresse restera inchangée.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: oldEmail,
    subject: "Confirmez le changement d'adresse email SocialFlow",
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendResetPasswordEmail(email: string, url: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Réinitialisez votre mot de passe</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Réinitialiser le mot de passe', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Réinitialisez votre mot de passe SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}
