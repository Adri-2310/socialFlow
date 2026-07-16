'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ShieldCheck, CreditCard, LifeBuoy } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

const categories = [
  {
    icon: ShieldCheck,
    label: 'Conformité & sécurité',
    items: [
      {
        question: 'SocialFlow est-il conforme à la législation sociale belge ?',
        answer:
          'Oui. Les calculs de cotisations ONSS, le précompte professionnel et les déclarations DIMONA/C4 suivent les barèmes officiels, mis à jour à chaque évolution réglementaire.',
      },
      {
        question: 'Mes données sont-elles hébergées en Europe ?',
        answer:
          "Oui, l'ensemble des données est hébergé dans l'Union européenne, avec chiffrement au repos et en transit, conformément au RGPD.",
      },
      {
        question: 'Comment les mises à jour légales sont-elles gérées ?',
        answer:
          'Les barèmes ONSS et les règles de précompte professionnel sont mis à jour automatiquement dès leur publication officielle, sans aucune action requise de votre part.',
      },
    ],
  },
  {
    icon: CreditCard,
    label: 'Tarifs & facturation',
    items: [
      {
        question: 'Comment fonctionne la facturation ?',
        answer:
          'La facturation est mensuelle ou annuelle (avec 20% de réduction), sans engagement. Vous pouvez résilier à tout moment depuis votre espace.',
      },
      {
        question: 'Puis-je essayer SocialFlow gratuitement ?',
        answer:
          'Oui, un essai de 30 jours sans carte bancaire vous donne accès à toutes les fonctionnalités du plan Pro.',
      },
      {
        question: 'Puis-je changer de plan à tout moment ?',
        answer:
          "Oui, vous pouvez passer d'un plan à l'autre en un clic depuis votre espace, avec un ajustement au prorata de la période en cours.",
      },
    ],
  },
  {
    icon: LifeBuoy,
    label: 'Support & migration',
    items: [
      {
        question: 'Puis-je migrer mes clients existants ?',
        answer:
          "Absolument. L'import CSV/Excel de vos entreprises et employés est inclus, et notre équipe vous accompagne pendant l'onboarding.",
      },
      {
        question: 'Quel support est disponible en cas de problème ?',
        answer:
          'Un support par email et chat en français et néerlandais, avec une réponse sous 24h ouvrées. Le support est prioritaire pour les clients Enterprise.',
      },
    ],
  },
];

export function FAQ() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="space-y-12">
        {categories.map((category, catIndex) => {
          const CategoryIcon = category.icon;
          return (
            <div key={category.label}>
              <FadeIn delay={catIndex * 0.05}>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CategoryIcon className="h-5 w-5" />
                  </span>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                    {category.label}
                  </h2>
                </div>
              </FadeIn>
              <div className="space-y-3">
                {category.items.map((faq, i) => {
                  const id = `${catIndex}-${i}`;
                  const isOpen = openId === id;
                  return (
                    <FadeIn key={faq.question} delay={catIndex * 0.05 + i * 0.05}>
                      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
                        <button
                          onClick={() => setOpenId(isOpen ? null : id)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-foreground"
                        >
                          {faq.question}
                          <motion.span
                            animate={{ rotate: isOpen ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="shrink-0"
                          >
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          </motion.span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 text-sm text-muted-foreground">
                                {faq.answer}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </FadeIn>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
