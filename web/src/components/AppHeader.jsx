import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';

const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.5rem clamp(1rem, 4vw, 2rem);
  background: var(--bds-color-surface-dark-blue);
  color: var(--bds-color-text-primary-inverse);
`;

const Brand = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: inherit;
  text-decoration: none;
  font-weight: var(--bds-font-weight-medium);
  font-size: 1.05rem;
  padding: 0.5rem 0;
`;

const Mark = styled.span`
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bds-color-surface-blue);
`;

const Nav = styled.nav`
  display: flex;
  gap: 0.25rem;
`;

const Item = styled(NavLink)`
  color: var(--bds-color-text-secondary-inverse);
  text-decoration: none;
  padding: 0.75rem 0.9rem;
  border-radius: 6px;
  font-weight: var(--bds-font-weight-medium);
  &:hover { color: var(--bds-color-text-primary-inverse); }
  &[aria-current='page'] {
    color: var(--bds-color-text-primary-inverse);
    box-shadow: inset 0 -3px 0 var(--bds-color-surface-blue);
    border-radius: 0;
  }
`;

export function AppHeader() {
  return (
    <Bar>
      <Brand to="/" end>
        <Mark aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </Mark>
        Feature Intake
      </Brand>
      <Nav aria-label="Main">
        <Item to="/" end>Submit request</Item>
        <Item to="/requests">Triage board</Item>
      </Nav>
    </Bar>
  );
}
