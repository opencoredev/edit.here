'use client';

import { useMemo, type ComponentProps } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { resolveButtonPartStyle } from "../../lib/component-parts";
import type { ButtonVariant } from "../../lib/theme-model";
import { ThemedButton } from "./button";
import { useGraphicalTheme } from "./graphical-provider";

// Split out of consumer.tsx so the app shell can load Button without every other family.

export function Button({
  variant = 'primary',
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: ButtonVariant }) {
  const { document, colorMode } = useGraphicalTheme();
  const appearances = useMemo(
    () => ({
      rest: resolveButtonPartStyle(document, colorMode, 'rest', variant),
      hover: resolveButtonPartStyle(document, colorMode, 'hover', variant),
      focus: resolveButtonPartStyle(document, colorMode, 'focus', variant),
      disabled: resolveButtonPartStyle(
        document,
        colorMode,
        'disabled',
        variant,
      ),
    }),
    [document, colorMode, variant],
  );
  return <ThemedButton {...props} appearances={appearances} />;
}

// Button already merges the label part into every variant and state.
export function ButtonLabel(props: ComponentProps<'span'>) {
  return <span {...props} />;
}
