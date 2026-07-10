/*
 * SocialFlow — Configuration de thème partagée pour toutes les maquettes
 * -------------------------------------------------------------------
 * Ce fichier centralise :
 *  - la config Tailwind (couleurs de marque violet + teal, dark mode par classe)
 *  - la gestion du mode clair/sombre (persistance localStorage + respect OS)
 *  - l'initialisation des icônes Lucide
 *
 * A charger AVANT le CDN Tailwind pour que la config soit prise en compte.
 */

// --- Mode sombre : appliqué le plus tôt possible pour éviter le "flash" ---
(function applyStoredTheme() {
  try {
    const stored = localStorage.getItem('sf-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    /* localStorage indisponible (mode privé strict) : on ignore silencieusement */
  }
})();

// --- Configuration Tailwind (couleurs SocialFlow) ---
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primaire : violet SocialFlow
        brand: {
          50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
          400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9',
          800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
        },
        // Secondaire : teal SocialFlow
        teal: {
          50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
          400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
          800: '#115e59', 900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(16,24,40,.08), 0 4px 16px -4px rgba(16,24,40,.06)',
      },
    },
  },
};

// --- Helpers exposés globalement ---
window.SF = {
  toggleTheme() {
    const root = document.documentElement;
    root.classList.toggle('dark');
    const isDark = root.classList.contains('dark');
    try { localStorage.setItem('sf-theme', isDark ? 'dark' : 'light'); } catch (e) {}
    if (window.lucide) window.lucide.createIcons();
  },
  // (re)génère les icônes Lucide après une modification du DOM
  refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  },
};

// Initialise les icônes dès que le DOM est prêt
document.addEventListener('DOMContentLoaded', () => window.SF.refreshIcons());
