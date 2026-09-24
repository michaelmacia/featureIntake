import React from 'react';
import styled from 'styled-components';
import { FormHelperText } from '@lowes-tech/bds-react';

export const Page = styled.main`
  max-width: ${({ $narrow }) => ($narrow ? '800px' : '1240px')};
  margin: 0 auto;
  padding: 2rem clamp(1rem, 4vw, 2rem) 4rem;
`;

export const Card = styled.div`
  background: var(--bds-color-surface-default);
  border: 1px solid var(--bds-color-border-subdued);
  border-radius: 8px;
  box-shadow: var(--bds-shadows-shadow-01);
  padding: clamp(1rem, 4vw, 2rem);
`;

export const Lede = styled.p`
  margin: 0.25rem 0 1.5rem;
  color: var(--bds-color-text-secondary);
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => $gap || '1.25rem'};
`;

export const Row = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--bds-color-border-subdued);
  > .spacer { margin-left: auto; font-size: 0.85rem; color: var(--bds-color-text-secondary); }
`;

export const Optional = styled.span`
  font-weight: var(--bds-font-weight-regular);
  color: var(--bds-color-text-secondary);
  font-size: 0.85em;
`;

/** Backyard helper text in the error state, linked to its field via aria-describedby. */
export function FieldError({ id, message }) {
  if (!message) return null;
  return <FormHelperText id={id} state="error">{message}</FormHelperText>;
}
