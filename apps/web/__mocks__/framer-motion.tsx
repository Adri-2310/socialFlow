import React from 'react';

const MOTION_PROPS = [
  'animate',
  'initial',
  'exit',
  'transition',
  'whileInView',
  'whileHover',
  'whileTap',
  'viewport',
  'layout',
  'layoutId',
  'variants',
];

function stripMotionProps(props: Record<string, unknown>) {
  const domProps: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!MOTION_PROPS.includes(key)) domProps[key] = props[key];
  }
  return domProps;
}

function createMotionComponent(tag: string) {
  const Component = React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
    const { children, ...rest } = props;
    return React.createElement(
      tag,
      { ...stripMotionProps(rest), ref },
      children as React.ReactNode,
    );
  });
  Component.displayName = `motion.${tag}`;
  return Component;
}

const cache: Record<string, ReturnType<typeof createMotionComponent>> = {};

export const motion = new Proxy({} as Record<string, ReturnType<typeof createMotionComponent>>, {
  get: (_target, prop: string) => {
    if (!cache[prop]) cache[prop] = createMotionComponent(prop);
    return cache[prop];
  },
});

export function AnimatePresence({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}
