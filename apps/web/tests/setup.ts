import '@testing-library/jest-dom/vitest';

// Ce fichier tourne pour toute la suite, y compris les tests d'integration
// de l'auth qui utilisent `// @vitest-environment node` (pas de DOM) : les
// stubs jsdom ci-dessous doivent donc rester conditionnels a sa presence.
if (typeof window !== 'undefined') {
  if (!('IntersectionObserver' in window)) {
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error - stub minimal suffisant pour les tests
    window.IntersectionObserver = MockIntersectionObserver;
  }

  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
}
