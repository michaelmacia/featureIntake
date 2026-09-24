import { createGlobalStyle } from 'styled-components';
import { Fonts, Roboto } from '@lowes-tech/bds-react';
import { ThemeVariables } from '@lowes-tech/bds-tokens';

/*
 * Backyard setup (per the design system README): its CSS custom properties (--bds-*),
 * the bundled Roboto faces and its typography rules. App layout below uses those tokens.
 */
export const GlobalStyles = createGlobalStyle`
  ${ThemeVariables}
  ${Roboto}
  ${Fonts}

  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bds-color-surface-subdued);
    color: var(--bds-color-text-primary);
    font-family: Roboto, system-ui, sans-serif;
  }
  a { color: var(--bds-color-text-interactive); }
  :focus-visible { outline: 2px solid var(--bds-color-border-interactive); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;
