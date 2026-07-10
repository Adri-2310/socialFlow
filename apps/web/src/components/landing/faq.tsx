'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: 'SocialFlow est-il conforme à la législation sociale belge ?',
      answer:
        'Oui. Les calculs de cotisations ONSS, le précompte professionnel et les déclarations DIMONA/C4 suivent les barèmes officiels, mis à jour à chaque évolution réglementaire.',
    },
    {
      question: 'Puis-je migrer mes clients existants ?',
      answer:
        'Absolument. L\'import CSV/Excel de vos entreprises et employés est inclus, et notre équipe vous accompagne pendant l\'onboarding.',
    },
    {
      question: 'Mes données sont-elles hébergées en Europe ?',
      answer:
        'Oui, l\'ensemble des données est hébergé dans l\'Union européenne, avec chiffrement au repos et en transit, conformément au RGPD.',
    },
  ];

  return (
    <section id="faq" className="border-t border-border bg-muted py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Questions fréquentes
        </h2>
        <div className="mt-10 space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={faq.question}
              className="rounded-xl border border-border bg-card"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-medium text-foreground"
              >
                {faq.question}
                <ChevronDown
                  className="h-5 w-5 shrink-0 transition"
                  style={{
                    transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>
              {openIndex === index && (
                <div className="px-5 pb-4 text-sm text-muted-foreground">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
