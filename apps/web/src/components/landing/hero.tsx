import Link from 'next/link';
import { ArrowRight, PlayCircle, Check, ShieldCheck } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"></div>
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Conforme ONSS &amp; DIMONA — Belgique
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            La paie belge,<br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">enfin fluide.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            SocialFlow réunit vos secrétariats sociaux, gestionnaires, entreprises clientes et salariés sur une seule plateforme. Générez des fiches de paie conformes, suivez vos échéances ONSS et automatisez vos déclarations DIMONA.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
            >
              Démarrer l&apos;essai 30 jours <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <PlayCircle className="h-4 w-4" /> Voir la démo
            </a>
          </div>
          <div className="mt-6 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-secondary" /> Sans carte bancaire
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-secondary" /> Support en FR &amp; NL
            </span>
          </div>
        </div>

        {/* Mock dashboard */}
        <div className="relative">
          <div className="rounded-2xl border border-border bg-card p-2 shadow-xl">
            <div className="rounded-xl bg-muted p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400"></span>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400"></span>
                </div>
                <span className="text-xs text-muted-foreground">app.socialflow.be</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Fiches ce mois', value: '1 284', change: '+12,4%' },
                  { label: 'Échéance ONSS', value: 'J-3', change: '2 en attente' },
                  { label: 'Clients actifs', value: '47', change: '+3' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{item.value}</p>
                    <p className="text-xs font-medium text-secondary">
                      {item.change}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Volume de paie — 6 mois</p>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    EUR
                  </span>
                </div>
                <div className="flex h-24 items-end gap-2">
                  {[40, 55, 48, 70, 82, 95].map((height, i) => (
                    <div
                      key={i}
                      className="w-full rounded-t bg-primary"
                      style={{ height: `${height}%`, opacity: 0.4 + (i * 0.12) }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-4 -left-4 hidden rounded-xl border border-border bg-card p-3 shadow-md sm:block">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/20 text-secondary">
                ✓
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground">DIMONA envoyée</p>
                <p className="text-[10px] text-muted-foreground">il y a 2 min</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
