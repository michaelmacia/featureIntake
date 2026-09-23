# Feature Intake — Intake & Triage Process

## For business users: how to submit a request

1. Go to the **Feature Intake** form.
2. **About you:** your name, work email and department.
3. **The request:** a short title, the category, **the problem** (what happens today, who is affected, what goes wrong), any solution ideas, and the systems involved.
4. **Impact & urgency:** the business value, how you'll measure success, how many people are affected, the rough annual $ impact, the urgency and any deadline. Tick the box if a legal, regulatory or audit requirement drives it.
5. **Review** your answers and click **Submit**. Keep your reference number (for example `FR-2026-0042`).

![Intake form](../mocks/screenshots/intake-step1.png)

**Tips for a request that moves quickly**
- Describe the **problem**, not only the solution. "Finance re-keys 400 invoices a month" is more useful than "build an SAP connector".
- Put a number on it: hours, errors, customers, dollars.
- Only choose **Critical** for a real external deadline or risk. You'll need to explain why and give a date.
- Your draft saves on your device automatically, so you can come back later.

**What happens next**

| Status | Meaning | What you do |
|---|---|---|
| Submitted | Received, waiting for triage | Nothing |
| In Review | A PM is looking at it | Be available for questions |
| Needs Info | We have a question (see the note) | Reply to the PM. In Phase 2, reply in the app |
| Approved | Accepted into the backlog; a Jira key is added | Follow the Jira item |
| In Delivery | Work has started | — |
| Done | Delivered | Tell us whether it solved the problem |
| Rejected | Not proceeding; the note explains why | You can ask for it to be reopened with new information |

## For triage: how we work the queue

**Cadence**
- **Daily (15 min, rotating PM):** clear *Submitted*. Move each request to *In Review* and assign an owner, or to *Needs Info* with a specific question. Reject clear duplicates with a link.
- **Weekly triage meeting (45 min):** product leads, an engineering lead and a rotating business representative decide on *In Review* items. The outcome is *Approved* (create the Jira epic and paste the key) or *Rejected* (with a reason).
- **Monthly:** review KPIs, the aged *Needs Info* items and the approved-but-not-started items.

**Service levels**

| Measure | Target |
|---|---|
| Submitted → In Review / Needs Info / Rejected | 2 business days |
| Submitted → first decision (Approved / Rejected) | 5 business days (P1: 2) |
| Needs Info without reply | Auto-reject after 10 business days (manual in MVP) |

**Decision guidelines**
- The **priority score** is a starting point. Adjust it with judgement and record why in a note.
- Always approve regulatory items with a firm date, or escalate them the same day.
- **Reject** when the request is a duplicate, out of scope, not worth the cost, or better solved by training or configuration. Always explain the reason and suggest an alternative.
- Mark **Approved** only when a Jira epic exists or will be created within 2 days.

![Triage board](../mocks/screenshots/triage-board.png)

## RACI

| Activity | Requester | Triage PM | Product lead | Eng lead | Business rep |
|---|---|---|---|---|---|
| Submit request | **R/A** | I | | | |
| Initial screening | C | **R/A** | I | | |
| Clarify (Needs Info) | R | **A** | | | |
| Approve / Reject | I | R | **A** | C | C |
| Create Jira epic | | **R** | A | C | |
| Communicate outcome | I | **R** | A | | |
| Maintain scoring model | | C | **A** | C | C |

R = Responsible, A = Accountable, C = Consulted, I = Informed

## Change management and adoption

- **Launch comms:** an announcement from the VP Product, a 2-minute walkthrough video, and a link in the intranet header.
- **Redirect other channels:** PMs reply to emailed requests with the form link. A shared-mailbox auto-reply points to the form.
- **Pilot:** Finance and Sales for 4 weeks, then a survey and fixes before company-wide rollout.
- **Office hours:** a weekly 30-minute drop-in for the first month.
