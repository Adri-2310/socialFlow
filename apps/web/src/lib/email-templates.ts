// Modeles d'emails du cabinet (D30, modules/personnalisation.md § 3) : le sujet
// et le corps des emails qu'il envoie, modifiables avec des variables. Module
// pur : validation, rendu et valeurs par defaut, utilises par le serveur ET par
// le formulaire (apercu en direct).
//
// Le corps est un texte enrichi LIMITE : paragraphes, **gras**, *italique* et
// [liens](https://...). Tout le reste est echappe : un cabinet ne peut ni
// casser la mise en page ni injecter du HTML ou un script.

export const TEMPLATE_TYPES = ['INVITATION_GESTIONNAIRE'] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export function isTemplateType(value: string): value is TemplateType {
  return (TEMPLATE_TYPES as readonly string[]).includes(value);
}

export type TemplateVariable = { name: string; label: string };

type TemplateDefinition = {
  label: string;
  description: string;
  // Liste fermee : une variable inconnue bloque l'enregistrement.
  variables: TemplateVariable[];
  defaults: { subject: string; body: string };
  // Valeurs fictives pour l'apercu et l'envoi de test.
  sample: Record<string, string>;
};

export const TEMPLATES: Record<TemplateType, TemplateDefinition> = {
  INVITATION_GESTIONNAIRE: {
    label: 'Invitation d’un gestionnaire',
    description: 'Envoyé quand vous invitez un gestionnaire RH dans votre équipe.',
    variables: [
      { name: 'cabinet_nom', label: 'Nom du cabinet' },
      { name: 'invitant_nom', label: 'Nom de la personne qui invite' },
      { name: 'lien', label: 'Lien pour créer le compte' },
    ],
    defaults: {
      subject: '{{cabinet_nom}} vous invite à rejoindre son équipe',
      body:
        '{{invitant_nom}} vous invite à rejoindre l’équipe de {{cabinet_nom}} en tant que gestionnaire RH. ' +
        'Cliquez ci-dessous pour créer votre compte. Ce lien est valable 7 jours et ne peut être utilisé qu’une seule fois.',
    },
    sample: {
      cabinet_nom: 'Cabinet Exemple',
      invitant_nom: 'Alice Martin',
      // Domaine reserve (.invalid, RFC 2606) : ne mene jamais a un vrai site.
      lien: 'https://exemple.invalid/invitations/accept?token=exemple',
    },
  },
};

export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;

export type TemplateError =
  | { code: 'SUBJECT_REQUIRED' }
  | { code: 'SUBJECT_TOO_LONG' }
  | { code: 'SUBJECT_MULTILINE' }
  | { code: 'BODY_REQUIRED' }
  | { code: 'BODY_TOO_LONG' }
  | { code: 'UNKNOWN_VARIABLE'; variables: string[] };

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

// Variables citees dans un texte, sans doublon.
export function variablesIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE)) found.add(match[1].toLowerCase());
  return [...found];
}

export function validateTemplate(
  type: TemplateType,
  input: { subject: string; body: string },
): { ok: true; value: { subject: string; body: string } } | { ok: false; errors: Record<'subject' | 'body', TemplateError | null> } {
  const subject = input.subject.trim();
  const body = input.body.replace(/\r\n/g, '\n').trim();
  const allowed = new Set(TEMPLATES[type].variables.map((v) => v.name));
  const errors: Record<'subject' | 'body', TemplateError | null> = { subject: null, body: null };

  if (!subject) errors.subject = { code: 'SUBJECT_REQUIRED' };
  else if (/[\r\n]/.test(subject)) errors.subject = { code: 'SUBJECT_MULTILINE' };
  else if (subject.length > SUBJECT_MAX) errors.subject = { code: 'SUBJECT_TOO_LONG' };

  if (!body) errors.body = { code: 'BODY_REQUIRED' };
  else if (body.length > BODY_MAX) errors.body = { code: 'BODY_TOO_LONG' };

  for (const field of ['subject', 'body'] as const) {
    if (errors[field]) continue;
    const unknown = variablesIn(field === 'subject' ? subject : body).filter((v) => !allowed.has(v));
    if (unknown.length > 0) errors[field] = { code: 'UNKNOWN_VARIABLE', variables: unknown };
  }

  if (errors.subject || errors.body) return { ok: false, errors };
  return { ok: true, value: { subject, body } };
}

// --- Rendu ------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Valeur injectee dans un sujet : texte brut, sans retour a la ligne.
function plain(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function renderSubject(template: string, values: Record<string, string>): string {
  return plain(
    template.replace(VARIABLE, (_m, name: string) => plain(values[name.toLowerCase()] ?? '')),
  ).slice(0, SUBJECT_MAX);
}

// Ne laisse passer qu'une adresse http(s) : jamais javascript:, data:, etc.
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const LEFT = '';
const RIGHT = '';

// Corps -> HTML sur : les variables sont remplacees APRES l'echappement du
// texte du cabinet, par des valeurs elles-memes echappees.
export function renderBody(template: string, values: Record<string, string>): string {
  const slots: string[] = [];
  const withSlots = template.replace(/\r\n/g, '\n').replace(VARIABLE, (_m, name: string) => {
    slots.push(values[name.toLowerCase()] ?? '');
    return `${LEFT}${slots.length - 1}${RIGHT}`;
  });

  const fill = (text: string) =>
    text.replace(new RegExp(`${LEFT}(\\d+)${RIGHT}`, 'g'), (_m, i: string) => escapeHtml(slots[Number(i)] ?? ''));
  // Valeur brute d'un emplacement dans une adresse de lien (puis verifiee).
  const rawFill = (text: string) =>
    text.replace(new RegExp(`${LEFT}(\\d+)${RIGHT}`, 'g'), (_m, i: string) => slots[Number(i)] ?? '');

  const inline = (paragraph: string) => {
    let html = escapeHtml(paragraph);
    // [texte](adresse) : l'adresse est controlee, sinon le lien reste du texte.
    html = html.replace(
      new RegExp(`\\[([^\\]\\n]+)\\]\\(((?:https?:\\/\\/|${LEFT})[^\\s)]*)\\)`, 'g'),
      (whole, label: string, target: string) => {
        const url = safeUrl(rawFill(target.replace(/&amp;/g, '&')));
        return url
          ? `<a href="${escapeHtml(url)}" style="color:inherit; font-weight:600; text-decoration:underline;">${label}</a>`
          : whole;
      },
    );
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return fill(html).replace(/\n/g, '<br />');
  };

  return withSlots
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px; color:#475569;">${inline(paragraph)}</p>`)
    .join('\n    ');
}
