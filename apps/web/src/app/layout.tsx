import type { Metadata, Viewport } from 'next';
import { Inter, Merriweather, Fira_Code } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const fontSerif = Merriweather({
  subsets: ['latin'],
  variable: '--font-serif',
});

const fontMono = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'SocialFlow — La paie belge, enfin fluide',
  description:
    'SocialFlow : plateforme SaaS de gestion de la paie et des déclarations sociales pour secrétariats sociaux et cabinets RH belges. ONSS, DIMONA, fiches de paie automatisées.',
  robots: 'index, follow',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
