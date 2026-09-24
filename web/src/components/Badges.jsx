import React from 'react';
import styled from 'styled-components';
import { Badge } from '@lowes-tech/bds-react';

// Backyard Badge colours: dark-blue | blue | light-blue | interactive | green | red | gold | lfp-yellow | neutral
const STATUS_COLOR = {
  'Submitted': 'light-blue',
  'In Review': 'interactive',
  'Needs Info': 'gold',
  'Approved': 'green',
  'In Delivery': 'dark-blue',
  'Done': 'green',
  'Rejected': 'neutral',
};

const BAND_COLOR = { P1: 'red', P2: 'gold', P3: 'blue', P4: 'neutral' };

export function StatusBadge({ status }) {
  return (
    <Badge color={STATUS_COLOR[status] || 'neutral'} variant={status === 'Done' ? 'filled' : 'outlined'}>
      {status}
    </Badge>
  );
}

const Score = styled.span`
  margin-left: 0.4rem;
  font-size: 0.85rem;
  color: var(--bds-color-text-secondary);
  font-variant-numeric: tabular-nums;
`;

export function PriorityBadge({ band, score }) {
  return (
    <span>
      <Badge color={BAND_COLOR[band] || 'neutral'} variant="filled" bold>{band}</Badge>
      {score !== undefined && <Score>{score}/100</Score>}
    </span>
  );
}
