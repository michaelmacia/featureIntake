import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Button, Link, Option, Search, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TextField,
} from '@lowes-tech/bds-react';
import { ENUMS } from '@shared/rules.js';
import { api, fmtDate, readLocal, writeLocal } from '../api.js';
import { PriorityBadge, StatusBadge } from '../components/Badges.jsx';
import { Lede, Page } from '../components/Layout.jsx';
import { RequestDetail } from './RequestDetail.jsx';

const ACTOR_KEY = 'featureIntake.actor';

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
  h1 { margin: 0; }
  > :last-child { width: min(260px, 100%); }
`;

const Kpis = styled.section`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
`;

const Kpi = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 1rem 1.1rem;
  background: var(--bds-color-surface-default);
  border: 1px solid var(--bds-color-border-subdued);
  border-radius: 8px;
  span:first-child { font-size: 0.85rem; color: var(--bds-color-text-secondary); }
  strong { font-size: 2rem; font-weight: var(--bds-font-weight-medium); font-variant-numeric: tabular-nums; }
  strong.alert { color: var(--bds-color-text-red); }
  span:last-child { font-size: 0.8rem; color: var(--bds-color-text-tertiary); }
`;

const Toolbar = styled.section`
  display: grid;
  grid-template-columns: minmax(240px, 2fr) repeat(3, minmax(150px, 1fr)) auto;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 1rem;
  @media (max-width: 900px) { grid-template-columns: 1fr 1fr; > :first-child { grid-column: 1 / -1; } }
  a { text-decoration: none; }
`;

const TableWrap = styled.div`
  overflow-x: auto;
  background: var(--bds-color-surface-default);
  border-radius: 8px;
  table { min-width: 860px; }
`;

// Backyard cells truncate with an ellipsis; let the request title and its details wrap instead.
const Wrap = styled.div`
  white-space: normal;
  overflow-wrap: anywhere;
`;

const Sub = styled.div`
  font-size: 0.8rem;
  color: var(--bds-color-text-secondary);
  margin-top: 0.15rem;
`;

const Mono = styled.span`
  font-family: 'Roboto Mono', ui-monospace, Consolas, monospace;
  font-size: 0.85rem;
`;

const SortButton = styled.button`
  all: unset;
  cursor: pointer;
  font-weight: inherit;
  &:focus-visible { outline: 2px solid var(--bds-color-border-interactive); }
`;

const Empty = styled.p`
  text-align: center;
  padding: 2rem;
  margin: 0;
  color: var(--bds-color-text-secondary);
`;

// [sort key, label, width %]. Backyard's Table uses a fixed layout sized by these percentages.
const COLUMNS = [
  ['createdAt', 'ID / submitted', 13],
  ['title', 'Request', 37],
  ['priorityScore', 'Priority', 12],
  ['status', 'Status', 12],
  ['targetDate', 'Needed by', 11],
  [null, 'Assignee', 15],
];

export default function BoardPage() {
  const [filters, setFilters] = useState({ q: '', status: '', department: '', priority: '' });
  const [sort, setSort] = useState('-createdAt');
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actor, setActor] = useState(() => readLocal(ACTOR_KEY, ''));
  const [openId, setOpenId] = useState(() => decodeURIComponent(window.location.hash.slice(1)) || null);

  useEffect(() => { document.title = 'Triage board · Feature Intake'; }, []);

  // Follow #FR-… links clicked while the board is already open (e.g. from a pasted or shared URL).
  useEffect(() => {
    const onHash = () => setOpenId(decodeURIComponent(window.location.hash.slice(1)) || null);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const query = new URLSearchParams(Object.entries({ ...filters, sort }).filter(([, v]) => v)).toString();

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api(`/api/requests?${query}`), api('/api/stats')]);
      setItems(list.items);
      setStats(s);
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
    }
  }, [query]);

  // Debounce so typing in search doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, filters.q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  function openDetail(id) {
    setOpenId(id);
    window.history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  }
  function closeDetail() {
    setOpenId(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const toggleSort = (key) => setSort((s) => (s === `-${key}` ? key : `-${key}`));
  const ariaSort = (key) => (sort.replace('-', '') === key ? (sort.startsWith('-') ? 'descending' : 'ascending') : undefined);

  return (
    <Page>
      <Head>
        <div>
          <h1>Triage board</h1>
          <Lede style={{ margin: 0 }}>Review, prioritise and route incoming requests.</Lede>
        </div>
        <TextField
          id="actor"
          label="Acting as"
          value={actor}
          maxLength={80}
          onChange={(e) => { setActor(e.target.value); writeLocal(ACTOR_KEY, e.target.value); }}
        />
      </Head>

      {stats && (
        <Kpis aria-label="Summary">
          <Kpi><span>Open requests</span><strong>{stats.open}</strong><span>{stats.total} total</span></Kpi>
          <Kpi><span>Awaiting triage</span><strong>{stats.byStatus.Submitted}</strong><span>status Submitted</span></Kpi>
          <Kpi><span>Needs info</span><strong>{stats.byStatus['Needs Info']}</strong><span>waiting on requester</span></Kpi>
          <Kpi>
            <span>Open P1</span>
            <strong className={stats.openByPriority.P1 ? 'alert' : ''}>{stats.openByPriority.P1}</strong>
            <span>{stats.openByPriority.P2} open P2</span>
          </Kpi>
        </Kpis>
      )}

      <Toolbar aria-label="Filters">
        <Search
          id="q"
          placeholder="Search title, ID, requester, Jira key…"
          aria-label="Search requests"
          onChange={setFilter('q')}
          onClearClick={() => setFilters((f) => ({ ...f, q: '' }))}
        />
        <Select id="f-status" label="Status" value={filters.status} onChange={setFilter('status')}>
          {[<Option key="" value="">All statuses</Option>, <Option key="open" value="open">All open</Option>,
            ...ENUMS.status.map((s) => <Option key={s} value={s}>{s}</Option>)]}
        </Select>
        <Select id="f-department" label="Department" value={filters.department} onChange={setFilter('department')}>
          {[<Option key="" value="">All departments</Option>, ...ENUMS.department.map((d) => <Option key={d} value={d}>{d}</Option>)]}
        </Select>
        <Select id="f-priority" label="Priority" value={filters.priority} onChange={setFilter('priority')}>
          {[<Option key="" value="">All priorities</Option>, ...['P1', 'P2', 'P3', 'P4'].map((p) => <Option key={p} value={p}>{p}</Option>)]}
        </Select>
        <Button as="a" variant="secondary" href={`/api/requests/export.csv?${query}`}>Export CSV</Button>
      </Toolbar>

      {loadError && <Empty role="alert">Could not load requests: {loadError}</Empty>}

      <TableWrap>
        <Table variant="outlined">
          <TableHead>
            <TableRow>
              {COLUMNS.map(([key, label, width]) => (
                <TableHeader key={label} width={width} aria-sort={key ? ariaSort(key) : undefined}>
                  {key ? (
                    <SortButton type="button" onClick={() => toggleSort(key)}>
                      {label}{ariaSort(key) === 'descending' ? ' ▼' : ariaSort(key) === 'ascending' ? ' ▲' : ''}
                    </SortButton>
                  ) : label}
                </TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {(items || []).map((r) => (
              <TableRow key={r.id}>
                <TableCell><Mono>{r.id}</Mono><Sub>{fmtDate(r.createdAt)}</Sub></TableCell>
                <TableCell>
                  <Wrap>
                    <Link onClick={() => openDetail(r.id)} bold>{r.title}</Link>
                    <Sub>{r.department} · {r.category} · {r.requesterName}</Sub>
                  </Wrap>
                </TableCell>
                <TableCell><PriorityBadge band={r.priorityBand} score={r.priorityScore} /></TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>{r.targetDate ? fmtDate(r.targetDate) : '—'}</TableCell>
                <TableCell>{r.assignee || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items && items.length === 0 && <Empty>No requests match these filters.</Empty>}
      </TableWrap>

      {openId && <RequestDetail id={openId} actor={actor} onClose={closeDetail} onChanged={load} />}
    </Page>
  );
}
