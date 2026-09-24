import React from 'react';
import styled from 'styled-components';
import { Button } from '@lowes-tech/bds-react';
import { PriorityBadge } from './Badges.jsx';
import { ConceptMock } from './ConceptMock.jsx';
import { Actions, Card, Lede, Page } from './Layout.jsx';

const Done = styled(Card)`
  text-align: center;
  > section { text-align: left; }
`;

/** Confirmation after a request is created, with its AI concept mock. */
export function SubmittedView({ record, onStartOver }) {
  return (
    <Page $narrow>
      <Done>
        <h1>Request received</h1>
        <p>
          Your reference is <strong>{record.id}</strong>. Initial priority{' '}
          <PriorityBadge band={record.priorityBand} score={record.priorityScore} />
        </p>
        <Lede>You'll hear back within 5 business days. Keep your reference handy if you follow up.</Lede>
        <Actions style={{ justifyContent: 'center', borderTop: 0 }}>
          <Button variant="secondary" as="a" href={`/requests#${encodeURIComponent(record.id)}`}>View on triage board</Button>
          <Button variant="primary" onClick={onStartOver}>Submit another</Button>
        </Actions>
        <ConceptMock id={record.id} actor={record.requesterName} />
      </Done>
    </Page>
  );
}
