# Feature Intake — Data Model

## MVP: document store

Each request is one JSON document in `data/requests.json`:

```json
{
  "seq": 40,
  "requests": [ { "id": "FR-2026-0001", "...": "..." } ]
}
```

`seq` is the last issued sequence number. IDs are `FR-<UTC year>-<seq, 4 digits>`. The sequence does not reset each year, so IDs stay unique even though they are not dense per year.

### FeatureRequest fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| `id` | string | server | `FR-2026-0042` |
| `requesterName` | string 2–100 | requester | trimmed |
| `requesterEmail` | string ≤ 254 | requester | lower-cased |
| `department` | enum | requester | see Enums |
| `title` | string 5–120 | requester | |
| `category` | enum | requester | |
| `problem` | string 20–4000 | requester | |
| `proposedSolution` | string ≤ 4000 | requester | optional |
| `businessValue` | string 20–4000 | requester | |
| `successMetrics` | string ≤ 2000 | requester | optional |
| `affectedSystems` | enum[] ≥ 1 | requester | de-duplicated |
| `usersAffected` | enum | requester | reach bucket |
| `revenueImpact` | enum | requester | annual $ bucket |
| `regulatory` | boolean | requester | |
| `urgency` | enum | requester | |
| `targetDate` | date or "" | requester | ≥ submission date; required if Critical |
| `urgencyReason` | string ≤ 1000 | requester | required if Critical |
| `status` | enum | server / triage | workflow-controlled |
| `priorityScore` | int 0–100 | server | computed at submission |
| `priorityBand` | P1–P4 | server | from score |
| `assignee` | string ≤ 80 | triage | |
| `jiraKey` | string | triage / Jira sync | `FEAT-123` |
| `createdAt`, `updatedAt` | ISO datetime | server | |
| `history[]` | `{at, actor, type, from, to}` | server | `type` ∈ status, assignee, jiraKey |
| `comments[]` | `{at, author, text}` | triage | text ≤ 2000 |

### Enums

| Enum | Values |
|---|---|
| department | Finance, Sales, Marketing, Operations, Customer Support, HR, Legal & Compliance, IT, Product, Other |
| category | New Feature, Enhancement, Integration, Reporting & Analytics, Automation, Compliance / Regulatory, Other |
| affectedSystems | Salesforce, SAP, Workday, ServiceNow, Customer Portal, Mobile App, Data Warehouse, Internal Tools, Other |
| usersAffected | 1-10, 11-50, 51-250, 251-1000, 1000+ |
| revenueImpact | None, Low (< $50K), Medium ($50K-$250K), High ($250K-$1M), Very High (> $1M) |
| urgency | Low, Medium, High, Critical |
| status | Submitted, In Review, Needs Info, Approved, Rejected, In Delivery, Done |

Enums are defined in `public/js/rules.js` and served by `GET /api/meta`. To change a list, edit that one file.

## Phase 2: relational model (PostgreSQL)

```mermaid
erDiagram
  APP_USER ||--o{ FEATURE_REQUEST : submits
  APP_USER ||--o{ FEATURE_REQUEST : "is assigned"
  FEATURE_REQUEST ||--|{ REQUEST_SYSTEM : touches
  SYSTEM ||--o{ REQUEST_SYSTEM : "is touched by"
  FEATURE_REQUEST ||--o{ REQUEST_EVENT : "has history"
  FEATURE_REQUEST ||--o{ COMMENT : has
  FEATURE_REQUEST ||--o{ ATTACHMENT : has
  FEATURE_REQUEST ||--o{ OUTBOX_EVENT : emits
  APP_USER ||--o{ COMMENT : writes

  APP_USER {
    uuid id PK
    text email UK
    text display_name
    text department
    text idp_subject UK
    bool is_triage
  }
  FEATURE_REQUEST {
    text id PK "FR-2026-0042"
    uuid requester_id FK
    uuid assignee_id FK
    text title
    text category
    text problem
    text proposed_solution
    text business_value
    text success_metrics
    text users_affected
    text revenue_impact
    bool regulatory
    text urgency
    date target_date
    text urgency_reason
    text status
    smallint priority_score
    char priority_band
    text jira_key
    timestamptz created_at
    timestamptz updated_at
  }
  SYSTEM {
    smallint id PK
    text name UK
  }
  REQUEST_SYSTEM {
    text request_id FK
    smallint system_id FK
  }
  REQUEST_EVENT {
    bigint id PK
    text request_id FK
    uuid actor_id FK
    text type
    text from_value
    text to_value
    timestamptz at
  }
  COMMENT {
    bigint id PK
    text request_id FK
    uuid author_id FK
    text body
    timestamptz at
  }
  ATTACHMENT {
    uuid id PK
    text request_id FK
    text file_name
    text content_type
    int size_bytes
    text storage_key
  }
  OUTBOX_EVENT {
    bigint id PK
    text request_id FK
    text kind "jira.create | email.status | teams.p1"
    jsonb payload
    int attempts
    timestamptz next_attempt_at
    timestamptz processed_at
  }
```

**Indexes:** `feature_request(status)`, `(priority_band, status)`, `(created_at desc)`, `(requester_id)`, and a GIN trigram index on `title || ' ' || problem` for search.

**Constraints:** `CHECK` constraints mirror the enums. Workflow transitions stay in application code (`rules.js`), so the server and UI share them.

**Migration:** `scripts/migrate-json-to-pg.js` (Phase 2 story) reads `requests.json`, upserts users by email, and inserts requests, systems, events and comments in a single transaction.

## Data classification and retention

| Data | Class | Retention |
|---|---|---|
| Requester name, email | Internal – personal | 3 years after Done/Rejected, then anonymised |
| Request content | Internal | Indefinite (product history) |
| History / comments | Internal – audit | Same as the request |
