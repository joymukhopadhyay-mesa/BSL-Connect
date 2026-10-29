# BSL Connect — architecture and security

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict | Server Components + server actions keep trusted logic on the server. |
| Styling | Tailwind CSS v4 with design tokens in `src/app/globals.css` | One token system for colour, glass surfaces, radii, shadows and motion. |
| Auth | Email one-time codes (Resend) + database sessions (`auth` schema) | Passwordless; proves email ownership; revocable sessions. |
| Data | Neon Postgres with Row Level Security, via `@neondatabase/serverless` (HTTP) | Authorisation lives next to the data; each user query runs as `authenticated`. |
| Files | `public.profile_photos` (one row per student) served by `/api/photos/[id]` | Access mirrors profile visibility through the same RLS. |
| AI | OpenRouter → Google models only, behind `AIProvider` | Swappable provider; server-only; optional. |
| Tests | Vitest + PGlite (real Postgres in WASM) + Playwright | Migrations, RLS and RPCs are tested against actual Postgres. |

Cache Components is intentionally disabled (`next.config.ts`): nearly every page is per-user and authenticated.

## Code map

```
db/migrations/            roles + auth schema, schema, helpers + triggers, RLS, student/admin RPCs, contact RPC, sign-in functions
scripts/                  migrate.mjs (applies migrations), provision-admin.mjs
src/proxy.ts              optimistic redirects on session-cookie presence (not the security boundary)
src/lib/db/               executor (user context transaction) and Neon driver
src/lib/auth/             code/token hashing, cookies, sign-in flow (otp.ts)
src/lib/email/resend.ts   sign-in code email
src/lib/data/session.ts   Data Access Layer: getViewer / requireStudent / requireActiveStudent / requireAdmin
src/lib/matching/         deterministic scoring (scoring.ts, weights.ts) and pair insights (insights.ts)
src/lib/ai/               provider interface, OpenRouter (Google) provider, coach, pair explanation, grounding guard
src/lib/profile/          vocabularies, Zod step schemas, completeness (mirrors SQL)
src/app/(student)/        discover, shortlist, matches, partnership, students/[id], me, settings + actions.ts
src/app/admin/            overview, students, partnerships, reports, export + actions.ts
src/app/onboarding/       8-step profile wizard + actions.ts
src/app/api/              photo upload, AI coach, AI pair explanation, voice transcription
```

## Data model

| Table | Purpose | Who can read | Who can write |
|---|---|---|---|
| `auth.users`, `auth.otp_codes`, `auth.sessions` | accounts, hashed sign-in codes, hashed session tokens | owner only (via `auth.*` functions) | owner only |
| `user_roles` | `student` / `admin` per auth user | self, admins | trigger / `provision_admin` only |
| `staff_allowlist` | coordinator emails allowed to sign up as admins | nobody via API | database owner only |
| `profiles` | one row per student; all profile content | self; admins; active students (published + not suspended); matched participants | self (column-level grant), trigger-validated |
| `profile_photos` | the single photo per student (PK = user id) | anyone who can read the profile | `upload_profile_photo`, `admin_remove_photo` |
| `problem_statements` | company problem statement catalogue (mirrors `src/lib/profile/problem-statements.ts`); students rank three in `profiles.problem_statements`, validated and locked after the deadline by `bsl_profiles_problem_statements` | authenticated users | migrations only |
| `moderation_state` | suspension + reason | admins | `admin_set_suspension` |
| `likes` | private one-way interest | the liker only | `record_decision` |
| `passes` | private passes | the actor only | `record_decision`, `reconsider_pass` |
| `shortlist_ranks` | private ranking of liked students (FK to `likes`) | owner | `set_shortlist_order` |
| `matches` | one row per unordered pair (`student_low < student_high`, unique) | participants, admins | RPCs only |
| `partnership_intents` | one outstanding confirmation per student (PK) | participants, admins | `confirm_partnership`, `withdraw_confirmation` |
| `partnership_members` | one finalised partner per student (PK) | participants, admins | `confirm_partnership`, `admin_cancel_partnership` |
| `reports`, `report_events` | concerns + review history | admins | `submit_report`, `admin_update_report` |
| `audit_log` | append-only record of privileged/state-changing actions (no FKs, survives deletion) | admins | definer functions |
| `account_deletion_requests` | student-requested removal | self, admins | `request_account_deletion` |
| `ai_usage` | per-user hourly AI quota | nobody via API | `consume_ai_quota` |
| `ai_insights` | cached AI pair explanations keyed by both profile versions | the viewer only | `store_ai_insight` |

Photos: one row per student in `profile_photos`; uploading replaces it. A photo is readable exactly when the reader can read the profile that owns it.

## Partnership state machine

```
           like (one-way, private)         reciprocal like
(nothing) ───────────────────────► liked ─────────────────► mutual
                                                              │  confirm (A)
                                                              ▼
                                                   pending_confirmation
                                         confirm (B) │    │ withdraw → mutual
                                                     ▼    │ decline  → declined
                                                 finalised
                                                     │ admin cancel (audited)
                                                     ▼
                                                 cancelled
When a pair is finalised, every other open match involving either student → closed
(reason partner_finalised_elsewhere). If that partnership is later cancelled,
those matches reopen where the other student is still available.
```

Guarantees and where they come from:

- **Exactly one match per pair:** `unique (student_low, student_high)` + `on conflict do nothing`.
- **No lost matches when two students like each other at the same moment:** `record_decision` takes per-student advisory locks before reading the reverse like.
- **At most one outstanding confirmation per student:** primary key on `partnership_intents.student_id`.
- **At most one finalised partner per student:** primary key on `partnership_members.student_id`. Even if application checks were bypassed, a second finalisation fails with a unique violation.
- **No deadlocks:** every state-changing RPC takes the student advisory locks first, in ascending key order, then row locks.
- **Ranking never creates a match:** `set_shortlist_order` only writes `shortlist_ranks`.
- **No forced partnerships:** admins can cancel a finalised partnership but have no RPC to create one.

## Security boundaries

1. **Domain enforcement in three layers.** Client and server action (`src/lib/auth/domain.ts`, anchored regex), `auth.request_otp` (no code is issued for other domains), and the `bsl_enforce_signup_domain` trigger on `auth.users`, so no code path can create a non-MESA account. Staff use `staff_allowlist`.
   **Sign-in:** 6-digit codes from a CSPRNG, stored as HMAC-SHA256 (keyed by `AUTH_SECRET`), valid for 10 minutes, single-use, locked after 5 wrong attempts, limited to one per 60 s and five per hour per address, and 30 per hour per hashed IP. Sessions use a 256-bit random token in an HttpOnly, Secure, SameSite=Lax cookie; only its SHA-256 is stored, and sign-out revokes it in the database.
2. **Roles are never taken from client metadata.** `user_roles` is written only by a trigger (`student`) or `private.provision_admin` (database owner).
3. **The proxy is not the boundary.** Each page, action and route handler calls the Data Access Layer, which validates the session token against `auth.sessions`. Every query then runs in a transaction that sets the user's claims and `SET LOCAL ROLE authenticated`, so RLS applies. The owner role (which bypasses RLS) is used only for the `auth.*` sign-in functions.
4. **Admin authorisation in the database.** Every admin RPC calls `private.require_admin()`. Students get a 404 for `/admin` routes, but a forged request also fails in Postgres.
5. **Minimal grants.** `anon` has no table access; `authenticated` gets select on what RLS allows and column-level update on `profiles`, and has no access to the `auth` schema tables. All multi-row state changes are `SECURITY DEFINER` RPCs with `search_path = ''`.
6. **Private data stays private.** One-way likes, passes, rankings, reports, moderation notes and the audit log are invisible to other students. Emails appear only to mutual-match participants (`match_contact`) and admins.
7. **No privileged keys in the app beyond the database URL.** Account deletion is the `admin_delete_account` RPC, which re-checks admin status.
8. **AI isolation.** Server-only key; no tools; no database access. Untrusted text is escaped and wrapped, output is schema-validated and checked for invented specifics.
9. **User content** is rendered as React text, never as HTML. CSV exports neutralise formula injection.
10. **Headers:** `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a permissions policy (microphone allowed for this site only, for voice dictation; camera and location blocked). `X-Powered-By` is removed.

## Data retention and account removal

- A student requests removal from Settings. Their profile is hidden at once and outstanding confirmations are withdrawn.
- An admin completes removal from **Admin → Students → Account removal requests**, which calls `admin_delete_account`.
- Deleting the account cascades to the profile, photo, likes, passes, rankings, matches, intents, sessions, AI cache and usage rows.
- A finalised partnership must be cancelled (audited) before removal, so the partner isn't left in an inconsistent state.
- `audit_log` keeps the user id and action (no profile content) for accountability.
- AI prompts are never stored. Only structured pair explanations are cached, for 30 days or until either profile changes.
