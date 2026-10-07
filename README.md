# SmartCare

> Latest repository audit: see [AUDIT_REPORT.md](./AUDIT_REPORT.md) for verified status, security follow-up, validation results, and environment-dependent gaps. The follow-up authorization migration is not applied automatically.

SmartCare is a patient-centered post-discharge care-plan execution and monitoring platform. It is designed to convert existing healthcare instructions into executable tasks and to continuously monitor whether those tasks are being performed within their defined time windows, completion criteria, and evidence requirements.

The system addresses a real healthcare problem: after discharge, patients often receive many instructions from doctors, nurses, physiotherapists, and care teams. These instructions are frequently fragmented across discharge summaries, prescriptions, follow-up notes, or paper-based checklists. SmartCare organizes those instructions into a structured and trackable care plan so that patient compliance, task completion, and escalation conditions can be monitored systematically.

## Research framing

The intended research contribution is not simply a reminder app, AI assistant, medication alert tool, or generic healthcare dashboard. The concept is a more formal and operational one:

"Temporal Care-Plan Execution and Evidence-Reconciliation Engine"

SmartCare is positioned as an execution-monitoring system that models post-discharge activities as structured tasks with temporal constraints, evidence requirements, recurrence, priorities, dependencies, and escalation rules.

The core pipeline is:

CARE PLAN
  ↓
EXECUTABLE TASKS
  ↓
TIME WINDOWS / CRITERIA / DEPENDENCIES
  ↓
PATIENT + APP + DOCUMENT + IoT + APPOINTMENT EVENTS
  ↓
EVIDENCE RECONCILIATION
  ↓
TASK EXECUTION STATE
  ↓
DEPENDENCY ANALYSIS
  ↓
CARE-PLAN STATUS
  ↓
ESCALATION ENGINE
  ↓
AUTHORIZED CAREGIVER / HEALTHCARE PROFESSIONAL

This is a systems-oriented research concept focused on operational compliance, evidence validation, and care-plan execution monitoring.

## Medical safety boundaries

SmartCare is an execution-monitoring and care-plan support platform. It must not diagnose diseases, prescribe treatment, invent medical instructions, or independently alter clinical decisions.

It may:

- store existing instructions from authorized healthcare sources,
- organize care plans and tasks,
- create executable task records from authorized instructions,
- monitor execution compliance,
- record patient reports,
- collect uploaded documents,
- record appointment events,
- receive IoT or device signals,
- reconcile evidence,
- detect deviations,
- evaluate dependencies,
- trigger predefined escalation workflows.

SmartCare must not:

- diagnose illness,
- prescribe medication or dosage changes,
- modify treatment without authorized clinical input,
- make unsupported clinical severity judgments,
- act as a replacement for healthcare professionals.

All clinical thresholds and escalation logic must be predefined by authorized professionals or configured by research administrators.

## Care plan modes

SmartCare supports two conceptual modes.

### Mode A: Hospital / healthcare professional connected

A doctor or hospital team creates or updates the care plan. The system represents the formal clinical instructions in executable task form.

### Mode B: Patient-controlled / hospital optional

The patient may enter or upload already-existing instructions from sources such as:

- discharge summary,
- prescription,
- appointment card,
- laboratory instructions,
- or other existing documents.

SmartCare organizes and formalizes those instructions without inventing new medical content.

## Main users

### Patient

- view care plan,
- view tasks,
- view occurrences,
- report completion,
- upload evidence,
- receive reminders,
- provide responses,
- connect supported devices.

### Caregiver

- view authorized patient information,
- receive escalations,
- acknowledge escalations,
- record action,
- resolve escalations.

### Healthcare professional

- create care plans,
- update care plans,
- define task criteria,
- define escalation rules,
- review execution,
- review evidence,
- review unresolved deviations.

### System

- generate task occurrences,
- collect events,
- reconcile evidence,
- determine execution states,
- analyze dependencies,
- trigger escalation rules,
- maintain audit history.

## Core task model

Conceptually, each task is represented as:

T_i = (ID, Type, Window, Frequency, Criteria, Evidence, Dependency, Priority, Rules)

Supported task types include:

- Medication
- Laboratory test
- Appointment
- Document
- Exercise / physiotherapy
- Measurement
- Wound care
- Questionnaire / communication
- Other

Each task can include:

- allowed time window,
- recurrence schedule,
- completion criteria,
- evidence requirements,
- dependency relationships,
- priority level,
- escalation rules.

## Temporal model

A task may include an allowed time window:

W = [S, E]

Where:

- S = allowed start time
- E = allowed end time
- t = event time

Execution states are determined as follows:

- ON_TIME: S <= t <= E
- LATE: t > E when late completion is permitted
- MISSED: deadline passed and valid completion evidence is absent

Important rule: SmartCare must not mark a task as missed before its deadline has passed.

## Project idea in one sentence

SmartCare is a digital post-discharge care management system that converts healthcare instructions into executable tasks, reconciles evidence from patient and system sources, and detects execution deviations before they escalate into serious care risks.

## What has been implemented so far

This repository reflects an early-stage research MVP with a Next.js/React client, Supabase authentication and persistence, role-aware workspaces, and deterministic care-execution domain modules. Live database policies and deployment integrations still require environment-specific verification.

### Phase 5 execution-engine summary

The execution engine now evaluates temporal windows, recurrence generation, dependency readiness, and evidence reconciliation in a deterministic way. The engine supports patient, caregiver, and IoT evidence streams without treating caregiver-originated evidence as patient evidence, and it preserves provenance and timezone-aware deadline logic throughout reconciliation.

## Phase-wise development status

### Phase 1: Project foundation and environment setup

This phase established the base technical architecture.

Completed work:

- Created a Next.js application using the App Router.
- Configured the frontend stack for the project.
- Integrated Supabase as the cloud data layer.
- Added environment-based configuration for database access.
- Created a reusable Supabase client under `lib/supabase/client.ts`.
- Added a Supabase connectivity check endpoint in `app/api/test-supabase/route.ts`.

Outcome:

The application now has a stable foundation for persistent data storage and component-based UI development.

### Phase 2: Dashboard and care-plan overview

The project was expanded into a patient portal experience.

Completed work:

- Built the home dashboard in `app/page.tsx`.
- Added summary cards and a visual care-plan overview.
- Loaded care plans from Supabase.
- Joined each care plan with the corresponding patient record.
- Added navigation to create a new care plan and view existing plans.

Outcome:

The app now presents a dashboard-style overview of post-discharge care activity and supports a clear entry point into individual care plan records.

### Phase 3: Care plan creation workflow

This phase created the ability to generate actual patient care-plan records.

Completed work:

- Implemented the care-plan creation form in `app/care-plans/new/page.tsx`.
- Captured patient details and care plan metadata.
- Inserted patient records into the `patients` database table.
- Inserted care-plan records into the `care_plans` table.
- Redirected users to the newly created plan detail page on successful submission.

Outcome:

The system can now support the creation of patient-specific care plans as the basis for downstream task execution monitoring.

### Phase 4: Care-plan detail and task execution view

This stage moved the project from static records to a real operational care-plan interface.

Completed work:

- Built the deep detail page in `app/care-plans/[id]/page.tsx`.
- Loaded care-plan and patient data from Supabase.
- Fetched tasks, occurrences, events, documents, dependencies, and escalations for the selected care plan.
- Built a task-centric view for execution monitoring.
- Added state computation logic that evaluates task occurrences based on available evidence.

Outcome:

This is the core functional phase of SmartCare: the platform is now able to show what task is scheduled, what evidence exists, and what execution state the task currently holds.

### Phase 5: Task creation and recurrence generation

A core assumption of SmartCare is that healthcare instructions are transformed into scheduled executable tasks.

Completed work:

- Added the task creation interface in `app/tasks/new/page.tsx`.
- Supports fields such as:
  - task type,
  - name,
  - description,
  - date range,
  - allowed start/end time,
  - recurrence frequency,
  - priority,
  - completion criteria,
  - verification method,
  - dependency type.
- Created tasks under a selected care plan.
- Generated task occurrences based on recurrence configuration.
- Implemented support for:
  - once tasks,
  - daily tasks,
  - weekly tasks,
  - every-N-days schedules,
  - selected weekdays,
  - excluded dates and multiple time windows.
- Stores the creating device's IANA timezone on generated occurrences.
- Caps generated schedules to prevent accidentally creating unbounded occurrence sets.

Outcome:

SmartCare can convert care-plan instructions into actionable recurring tasks and generate their execution instances over time.

### Phase 6: Evidence collection and execution monitoring

This is where the system begins to operationalize care-plan execution.

Completed work:

- Added patient completion reporting using `PATIENT_REPORT` events.
- Added IoT simulation events using `IOT_SIMULATION` with values such as `detected` and `not_detected`.
- Added document upload support for image and file-based evidence.
- Stored uploaded files in a Supabase storage bucket named `reports`.
- Recorded evidence metadata in the `documents` table.
- Evaluated execution states including:
  - `PENDING`
  - `ON_TIME`
  - `LATE`
  - `BEFORE_WINDOW`
  - `UNCONFIRMED`
  - `CONFLICTING`
  - `DOCUMENT_RECORDED`
  - `REPORTED`

Outcome:

The system understands whether a task is incomplete, completed on time, late, unverified, or conflicting, based on patient events and supporting evidence.

### Phase 7: Escalation, dependency analysis, and risk detection

This is the current advanced logic layer of the project.

Completed work:

- Added escalation creation logic for tasks requiring intervention.
- Supports escalation triggers such as `UNCONFIRMED`, `CONFLICTING`, and `LATE`.
- Prevents duplicate active escalations for the same task occurrence.
- Adds an authenticated cron endpoint backed by an atomic Supabase RPC for scheduled evaluation and deduplication.
- Queues durable in-app notifications for authorized caregiver or clinician accounts and supports delivery/acknowledgement status.
- Added dependency tracking between prerequisite and dependent tasks.
- Evaluated dependency risk states such as `READY`, `AT_RISK`, and `BLOCKED`.
- Added caregiver and clinical dashboards for authorized patient records, escalation acknowledgement/resolution, deviations, and evidence counts.
- Added role-based route gates and signed report links.
- Added analytics over authorized care records, including execution states, evidence sources, dependency state, and escalation resolution time.

Outcome:

SmartCare now has a broader execution, access-control, escalation, and research-analytics prototype. Scheduled evaluation still requires a hosting scheduler and server-side configuration.

### Phase 8: Role-specific workspaces and navigation

- Added role-aware home routing for patient, caregiver, clinician, and administrator accounts.
- Replaced the generic landing page with a patient-first dashboard showing real authorized care plans, today's occurrence progress, upcoming tasks, and available documents.
- Added a distinct administration console for existing role assignments, patient access grants, audit activity, plan history, notification monitoring, and system metrics.
- Restricted care-plan and task creation routes to clinician and administrator roles in the application shell; database RLS remains the underlying data-access control.
- Added responsive navigation that presents the sections available to each role.

### Phase 9: History, audit, and access administration

- Added an authorized care-plan history view that displays version metadata and tracked snapshot fields.
- Added administrator workflows to assign SmartCare roles to existing Supabase Auth users and grant or revoke patient access.
- Added administrator audit and notification status views using the existing database policies.

These screens rely on the existing migration and RLS policies. Client-side role routing is a usability boundary, not a substitute for server/database authorization.

### Phase 10: SmartCare visual identity and responsive UI

- Added centralized emerald, sage, warm-neutral, and charcoal design tokens, plus an optional persisted dark theme.
- Replaced legacy blue utility styling in the care-plan, task, research, notification, and dashboard surfaces with the SmartCare palette.
- Added a geometric continuity mark and wordmark, desktop workspace sidebar, compact horizontal mobile navigation, and a redesigned sign-in experience.
- Refreshed the patient dashboard hierarchy and patient-friendly execution labels while preserving the deterministic domain states.
- Added subtle page, progress, notification, and interactive-state transitions, with reduced-motion support.
- Applied shared palette and typography styling to existing care-plan, caregiver, clinician, task, and research views without changing their data or domain logic.

## Current features in the application

The prototype currently supports:

- patient dashboard overview,
- role-specific patient/caregiver/clinician/administrator workspaces,
- care plan creation,
- patient-task association,
- recurring task generation,
- occurrence tracking,
- patient-reported completion,
- IoT simulation evidence,
- document upload and evidence recording,
- execution-state evaluation,
- dependency analysis,
- escalation workflows,
- task monitoring in a care-plan detail interface,
- password authentication and role-based route access,
- caregiver and clinician dashboards,
- authorized-data research analytics,
- private signed report access,
- persistent in-app escalation notifications,
- role/access administration and care-plan history review,
- a protected endpoint for scheduled escalation evaluation,
- audit/version history schema and deterministic unit tests.

## Architecture summary

The project uses a layered architecture suitable for a research prototype:

- frontend: Next.js + React + TypeScript
- styling: Tailwind CSS
- database and backend services: Supabase
- deterministic domain logic: `lib/smartcare/` (evidence, execution, dependency, escalation, recurrence, and evaluation modules)
- data model: existing patient/care-plan/task tables plus additive security, notification, audit, version, and escalation-deduplication tables
- evidence input: patient/application events, uploaded documents, appointment adapters, and IoT simulation/adapters
- background evaluation: `POST /api/cron/escalations`, authorized with a server-only bearer secret
- integration boundaries: pluggable adapters for notification, document processing, structured responses, IoT, and appointment systems

This is enough for the project to function as a proof-of-concept and demonstration of the care-plan execution model.

## Project structure

```text
smartcare/
├── app/
│   ├── api/cron/escalations/route.ts
│   ├── api/escalations/route.ts
│   ├── caregiver/ and clinical/ dashboards
│   ├── care-plans/ and tasks/ workflows
│   ├── components/ (dashboards, notification center)
│   ├── login/ and research/
│   └── auth-shell.tsx
├── lib/
│   ├── smartcare/ (domain engines and integration adapters)
│   └── supabase/ (browser client and session/role context)
├── scripts/run-tests.mjs
├── supabase/migrations/
├── tests/smartcare.test.mjs
├── package.json
└── README.md
```

## Technology stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase

## Setup instructions

### Prerequisites

- Node.js 20.9+ (required by the installed Next.js 16 release)
- npm
- A Supabase project with the required tables and storage bucket configured.

### Environment variables

Create a `.env.local` file with:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_key

# Server-only. Required for clinician escalation actions and scheduled evaluation.
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
SMARTCARE_CRON_SECRET=generate_a_long_random_secret
```

Never prefix server secrets with `NEXT_PUBLIC_` or expose them in client code.

### Database setup and account provisioning

The repository migration is additive for the existing core tables, but it replaces existing row-level-security policies on `patients`, `care_plans`, `tasks`, `task_occurrences`, `events`, `documents`, `dependencies`, and `escalations`. It assumes the existing tables and columns used by the application already exist, including UUID identifiers. Review it against a database backup and the actual Supabase schema before applying it.

The project owner confirms that `supabase/migrations/202610060001_smartcare_security_and_history.sql` was manually applied to the development Supabase project, that `public.smartcare_audit_log` was confirmed after deployment, and that an ADMIN account can sign in. Do not reapply that migration or infer its absence from local migration-history tooling. This workspace cannot independently query the live database: `.env.local` contains only the Supabase URL and publishable client key, and the shared browser currently redirects to sign-in without a session. The owner also requested verification of the other migration objects; they remain not independently verified here. A security audit identified that the escalation RPC should be limited to the server role and clinician notification reads should be scoped to authorized care plans. Migration `202610060002_smartcare_escalation_authorization.sql` implements those restrictions; deployment status is not confirmed. Migration `202610060003_smartcare_patient_access_visibility.sql` lets a PATIENT role view access grants for their own linked patient record so the patient care-team panel can list linked account identifiers, roles, and grant status; this migration is not applied or live-verified. Review actual migration history/schema and apply only migrations confirmed missing, in a non-production environment. Provision `smartcare_user_roles` rows and `smartcare_patient_access` grants for each account; a signed-in user without an assigned role or patient grant cannot use protected workflows. Old task occurrences without a timezone are intentionally skipped by the scheduled evaluator until safely backfilled.

### Authenticated validation checkpoint — 2026-10-07

No authenticated role workflow was exercised in this checkpoint. The shared local browser remained at `/login`; the only local Supabase configuration inspected was the public URL and publishable key, and no server credential or authenticated test-session was available. The project owner reports a successfully authenticated development ADMIN account and the confirmed migration-001 deployment, but those actions were not reproduced in this workspace. No migration was applied by this checkpoint.

| Role | Implemented source behavior | Authenticated validation still required |
|---|---|---|
| ADMIN | Role-aware landing page and admin route; role/access administration, patient list, audit/version/notification views; elevated database policies are defined in migration 001. | Sign in and retain session; verify role lookup/nav and all admin data loads; grant/revoke patient access and assign roles; verify ADMIN-only routes/actions and audit records; ensure direct requests and APIs reject unauthorized actions. |
| PATIENT | Dashboard queries care plans/tasks/evidence through the caller's Supabase client; profile displays authenticated email and linked patient name; measurements explicitly state unavailable; appointments are derived only from upcoming care-plan tasks whose `type` contains `APPOINTMENT`. | Verify the account sees only its linked patient/plan data; test loading/empty/error/populated screens, plan navigation, next task and progress; verify cross-patient denial and no hidden-route privilege; test caregiver visibility only after confirming migration 003. |
| CAREGIVER | Dashboard queries care plans, patients, tasks, evidence, dependencies and escalations using the caller's client; no role-specific client-side patient filtering is applied. | Verify only explicitly granted patients are returned; revoke access and confirm disappearance; test task/alert/escalation visibility and permitted acknowledgement/resolution; verify direct patient/plan requests for an unlinked patient are denied. |
| CLINICIAN | Dashboard queries care plans and their patients through the caller's client; plan/task creation, evidence, dependencies, escalations, history and analytics are present; escalation API checks role and RLS-visible records. | Verify patient scope and cross-patient denial; test plan/task create/read/update/version, evidence, escalation API authorization/state checks, notification scope, analytics, and denial of admin-only navigation/actions. |

**Source-level findings (not live RLS proof):** role routing is enforced by the client shell as a UX gate; data authorization must come from Supabase RLS. Caregiver/clinician dashboard queries have no audience-dependent local patient filtering: they render only rows returned by their Supabase queries. The patient dashboard selects own patient-access rows using the signed-in user ID, then asks for other grants only for those patient IDs. Migration 001's current source policy permits a user to read their own grant and ADMIN to read all grants; migration 003 expands that policy for a PATIENT to read grants on their own active PATIENT-linked record. The latter is not live-applied and has not been tested. Source review cannot confirm the deployed policies, table grants, or role assignments.

The care-team panel currently displays a caregiver account's trailing user-ID characters, role context and grant status because no account-display-name field is queried. This is not a verified identity label. Measurement values are not fabricated or simulated; no measurement table/query was found in the inspected application and migrations, and the UI displays an unavailable/empty message. Upcoming appointments use care-plan occurrence/task records only; there is no external appointment feed.

**Database deployment status:** migration 001 is manually applied and `smartcare_audit_log` is confirmed per the project owner's report. This workspace has no direct live SQL result to independently attest it. Migration 002 is UNKNOWN. The project owner states migration 003 has NOT been applied; its deployment state is still not independently queried. Do not reapply migration 001 or apply migrations 002/003 until their live status and actual schema are checked through the authorized Supabase tooling.

Configure the hosting scheduler to send an authenticated POST request to /api/cron/escalations with the configured cron authorization header. The endpoint requires the server-only Supabase service-role key and the migration RPC. Do not expose either secret to browsers. The route is implemented, but no hosting cron provider is configured by this repository.

Clinician/admin-initiated escalation requests go through `POST /api/escalations`. The route verifies the Supabase bearer token, role, RLS-visible care-plan/task/occurrence, and recomputed execution state before using the service-role RPC. Applying the authorization follow-up migration is required to prevent direct authenticated RPC calls; this repository does not apply migrations to a live database automatically.

### Install dependencies

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

Run the deterministic domain tests with:

```bash
npm test
```

## How the system is intended to work in practice

1. A patient is created in the system.
2. A care plan is created for that patient.
3. Authorized healthcare instructions are transformed into tasks.
4. Each task has time windows, recurrence, dependencies, and evidence requirements.
5. The patient reports completion through the app or uploads evidence.
6. Device or IoT signals may supplement those reports.
7. The system reconciles all evidence.
8. If evidence is missing or conflicting, the system is able to flag the task state.
9. If an escalation is created, the database queues an in-app notification for active caregiver/clinician grants, and the scheduled endpoint can evaluate occurrences even when no care-plan page is open.

This process makes the app a formal execution-monitoring layer around care-plan compliance.

## Roadmap status and remaining work

### 16-phase product upgrade status

This tracker follows the requested phase order and distinguishes repository implementation from live deployment validation.

| Phase | Status | Current evidence / remaining work |
|---|---|---|
| 1. Audit and stabilization | COMPLETE — LIVE VERIFY/CONFIGURE REMAINS | Repository audit and `AUDIT_REPORT.md` are complete. Owner reports migration 001 was manually applied and live objects confirmed; this workspace cannot independently query Supabase. Migrations 002 and 003 require status verification before deployment and role/security checks. |
| 2. Patient experience | IMPLEMENTED IN SOURCE — AUTHENTICATED VALIDATION BLOCKED | Patient navigation links to dashboard, plans, tasks, upcoming care/appointments, documents, profile, access, and measurements. Profile uses the signed-in email and linked patient record; measurements show an unavailable state rather than simulated values. Caregiver grants are visible only to the extent allowed by deployed RLS; the additional patient-owned-grant policy in migration 003 is not applied. Appointments are derived from plan task occurrences, not an external feed. Authenticated workflow/viewport checks remain outstanding. |
| 3. Clinician platform | IMPLEMENTED — NOT FULLY VALIDATED | Existing clinician dashboard, plan/task builder/detail, evidence, dependencies, escalations, history, and analytics are present; dashboard includes patient list and today's tasks. Authenticated workflow/role isolation remains untested. |
| 4. Caregiver platform | IMPLEMENTED — NOT FULLY VALIDATED | Existing RLS-backed caregiver dashboard surfaces linked patients, today's tasks, alerts, and escalation actions. Live patient-access checks remain untested. |
| 5. Execution engine | IMPLEMENTED — TEST COVERAGE EXPANDED | Deterministic time-window and recurrence engines remain in use; automated tests now include DST repeated-hour/nonexistent-time cases. No AI execution decisions. |
| 6. Evidence reconciliation | IMPLEMENTED — TEST COVERAGE EXPANDED | Tests now cover matching report+IoT, missing required IoT, contradictory IoT, document evidence, appointment evidence, and late completion. Live data workflows remain untested. |
| 7. Dependencies and plan health | IMPLEMENTED — PARTIALLY VALIDATED | Existing READY/AT_RISK/BLOCKED dependency evaluation is tested and shown in clinician workspace; care-plan-level health classifications are not represented as a distinct persisted feature. |
| 8. Escalation and notifications | IMPLEMENTED — DEPLOYMENT VALIDATION REQUIRED | Deterministic rules, deduplication tests, in-app notification lifecycle, acknowledgement, and protected API exist. Live migration 002 status and recipient delivery are not verified; external channels are unconfigured. |
| 9. Documents and appointments | IMPLEMENTED — EXTERNAL CONFIGURATION REQUIRED | Private document upload/signed-access paths and appointment evidence adapter exist. No external appointment provider/system integration is configured; storage policies need live tests. |
| 10. Analytics | IMPLEMENTED — DATA/ACCESS VALIDATION REQUIRED | Existing analytics derive metrics from authorized query results rather than hardcoded totals. No live role-specific dataset validation was possible. |
| 11. IoT architecture | IMPLEMENTED — EXTERNAL CONFIGURATION REQUIRED | Normalization and development simulation paths exist; physical devices/gateways are not connected or validated. |
| 12. AI/voice adapter | PARTIAL — EXTERNAL CONFIGURATION REQUIRED | Structured-response adapter requires patient confirmation before recording a patient report. No AI/voice provider integration is configured. |
| 13. Document intelligence | PARTIAL — EXTERNAL CONFIGURATION REQUIRED | Extracted instruction candidates are held for review before approval; no OCR/provider integration is configured. |
| 14. Security hardening | SOURCE REVIEWED — LIVE VALIDATION REQUIRED | Source migration policies and server authorization were reviewed; migration 001 status is owner-reported, 002/003 live status is unknown. No authenticated role/RLS/storage penetration testing was possible. |
| 15. Automated testing | PARTIAL — REPOSITORY SUITE PASSING | 14 deterministic tests pass, including temporal/DST and evidence coverage. Database integration, API role authorization, patient access, and versioning integration tests remain outstanding. |
| 16. Final validation | NOT COMPLETE | Requires authenticated role accounts and live database/storage access for end-to-end pipeline and responsive/accessibility checks. |

### Implemented in the repository

- Care-plan, task, occurrence, evidence, and document workflows.
- Deterministic execution/evidence reconciliation, timezone-aware deadlines, recurrence generation, and dependency analysis.
- Supabase authentication integration, role-aware route gates, security/access-control migration, dashboards, and authorized-data analytics.
- Distinct patient and administrator workspaces; caregiver and clinician dashboards; admin role/access assignment, audit and notification monitoring.
- Shared responsive emerald/sage visual identity, persisted light/dark theme, premium sign-in screen, accessible role navigation, and reduced-motion-aware interactions.
- Atomic escalation deduplication, a protected scheduled-evaluation route, persistent in-app notification queueing, and notification acknowledgement.
- Audit/version-history database schema and integration adapters.
- Research-evaluation utilities and a Node-based deterministic domain test suite.

### Partially implemented or awaiting environment setup

- The project owner reports migration 001 was manually applied, `smartcare_audit_log` was confirmed, and an ADMIN account can sign in. This workspace could not independently query the listed live objects because no server credentials or authenticated session are available; it did not reapply migration 001. Migrations 002 and 003 need safe live-status verification before deployment. Live role/access, RLS, storage, and database-function tests are still outstanding.
- The role-specific dashboards, administration/history views, and visual redesign were build- and lint-checked. The sign-in screen was visually inspected at desktop and 390px mobile widths; authenticated dashboard rendering was not exercised against live Supabase data in this workspace.
- The cron route is implemented, but an external scheduler must be configured and exercised. Existing occurrences without a timezone are skipped until safely backfilled.
- In-app notifications are persisted and visible in the application. Email, SMS, voice, browser push, provider retries, and production delivery monitoring are not configured.
- IoT, appointment, document-processing/OCR, and structured-response adapters provide integration boundaries; real vendor/device/model integrations are not configured. AI-generated structured responses require patient confirmation before they count as execution evidence.
- Care-plan version history, admin audit review, and access-change auditing have database and UI support. Audit coverage and retention policies still need a deployment-specific review.
- Analytics are implemented over authorized records; research results still require controlled, consented study data and formal evaluation.

### Before any clinical or production use

- Verify the actual Supabase schema and status of migrations 002 and 003 without reapplying migration 001; test least-privilege access using representative patient, caregiver, clinician, and administrator accounts.
- Review and apply only genuinely missing follow-up migrations in a non-production environment first; provision and revoke roles/access grants through an audited administrative workflow.
- Configure and monitor the scheduler and any delivery providers; define retries, retention, incident response, and availability expectations.
- Complete clinical governance, privacy/security review, consent, accessibility, and safety validation. This research prototype is not a medical device or a substitute for clinical judgment.
- Validate all escalation thresholds and workflows with authorized clinical stakeholders. Current rules are deterministic prototype defaults, not clinically validated advice.

## Summary

SmartCare is a practical healthcare systems project that tackles a meaningful problem: ensuring that post-discharge instructions are not only recorded, but actually executed and monitored. The system formalizes care instructions as tasks, tracks time windows and evidence, reconciles patient-reported and device-reported data, and identifies when a task is late, unverified, conflicting, or dependent on another step.

The current state of this repository is an early-stage research prototype for temporal care-plan execution and evidence reconciliation. Its core deterministic workflows, authentication integration, dashboards, analytics, escalation endpoint, and in-app notification path are implemented in code. Live database security, external services, scheduled deployment, clinical validation, and production readiness remain explicit follow-up work; they should not be treated as completed merely because integration scaffolding exists.
