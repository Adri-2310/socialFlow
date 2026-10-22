import { z } from 'zod';

// Périodes de paie (D90, D91). Les codes d'erreur par champ reprennent ceux des dossiers
// (`invalidFieldCode`, `invalidFields` de lib/schemas/salarie.ts).

export const STATUTS_PERIODE = ['OUVERTE', 'VERROUILLEE'] as const;

// Bornes de bon sens sur l'entrée : le mois ouvrable (passé, courant ou suivant) est vérifié par
// le service avec la date du jour.
export const ouvrirPeriodeSchema = z.object({
  annee: z.number().int().min(2000).max(2100),
  mois: z.number().int().min(1).max(12),
});

// D91 : décaler la date limite d'une période. Toute date valide, pas seulement du mois.
export const dateLimiteSchema = z.object({
  dateLimite: z.iso.date().refine((d) => d >= '2000-01-01' && d <= '2100-12-31'),
});
