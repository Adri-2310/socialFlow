'use client';

import { useEffect, useRef } from 'react';
import { useInView, animate } from 'framer-motion';

export function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  useEffect(() => {
    const node = ref.current;
    if (!isInView || !node) return;

    const controls = animate(0, value, {
      duration: 1.8,
      ease: 'easeOut',
      onUpdate(latest) {
        node.textContent = `${Math.round(latest).toLocaleString('fr-BE')}${suffix}`;
      },
    });

    return () => controls.stop();
  }, [isInView, value, suffix]);

  return <span ref={ref}>0{suffix}</span>;
}
