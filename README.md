# BSL Connect

A private, mobile-first partner-discovery platform for MESA School of Business **Business Strategy Labs**. Verified students build rich professional profiles, discover classmates, express private interest, form mutual matches, rank their shortlist and confirm exactly one BSL partner. Programme coordinators oversee the cohort, reports and partnerships.

**Production:** https://bsl-connect.vercel.app

- **Architecture, data model and security boundaries:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Compatibility engine and AI layer:** [docs/MATCHING.md](docs/MATCHING.md)

## Stack

| Concern | Service |
|---|---|
| Hosting | Vercel, with functions in `sin1` (Singapore) |
| Database | Neon Postgres (`bsl-connect` project, `aws-ap-southeast-1`), with Row Level Security |
| Sign-in | Email one-time codes, sent through Resend; sessions stored in the database |
| Photos | Stored in Postgres (`profile_photos`, one row per student), served by an authenticated route |
| AI | OpenRouter → Google models only (`google/gemini-3.7-flash`), pinned to Google Vertex / AI Studio |

## Features

| Area | Routes |
|---|---|
| Sign-in with a 6-digit email code | `/sign-in` |
| Onboarding (8 steps, save and resume, AI coach, voice dictation) | `/onboarding?step=1…8` |
| Discovery (swipe or buttons, keyboard, filters, full-profile sheet, undo, mutual-match moment) | `/discover` |
| Full profile with compatibility insights, AI explanation and report | `/students/[id]` |
| Ranked shortlist and revisiting passed profiles | `/shortlist` |
| Mutual matches and confirmation flow | `/matches`, `/matches/[id]` |
| Confirmed partnership and review request | `/partnership` |
| Own profile, visibility, editing | `/me` |
| Settings, privacy, how it works, sign-out, account removal | `/settings` |
| Admin: overview and funnel | `/admin` |
| Admin: students, detail and moderation | `/admin/students`, `/admin/students/[id]` |
| Admin: partnerships and cancellation review | `/admin/partnerships` |
| Admin: report queue with history | `/admin/reports` |
| Admin: CSV export | `/admin/export` |

## Local setup

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see [Environment variables](#environment-variables)), then:

```bash
npm run db:migrate
```

```bash
npm run dev
```

The app runs at http://localhost:3000. To develop without Resend, leave `RESEND_API_KEY` empty and set `EMAIL_DEV_LOG=true`; sign-in codes are then printed to the server console.

## Database

Migrations live in `db/migrations/` and are applied in filename order by `npm run db:migrate`. Applied files are recorded in `private.schema_migrations`, so re-running is safe.

The app connects as the database owner. Every user-scoped query runs in a single transaction that first sets the user's id and switches to the restricted `authenticated` role (`src/lib/db/executor.ts`), so RLS applies to every query.

## Administrators

Admins never self-promote. Grant access from a machine with `DATABASE_URL` set:

```bash
npm run admin:grant -- coordinator@mesaschool.co
```

Or run this in the Neon SQL editor:

```sql
select private.provision_admin('coordinator@mesaschool.co');
```

If the person hasn't signed in yet, their address is allowlisted and becomes an admin on first sign-in. To revoke access, run `npm run admin:grant -- <email> --revoke`.

**Students who administer.** A `@pg27.mesaschool.co` address given admin access keeps a full student profile and also gets the admin dashboard. Switch between them with **Admin** in the student navigation and **Student view** in the admin header.

Conflict-of-interest rules are enforced in the database. Such an admin can't moderate themselves: suspension, photo removal, reports about or filed by them, their own partnership, and their own account deletion are all blocked. Reports, moderation notes and audit entries about them are also hidden from them. Add a second administrator, for example a faculty coordinator, to handle anything involving them.

**Team addresses on other MESA domains.** An address such as `learning@mesaschool.co` becomes a staff admin with no student profile. To give it student access as well, allowlist it with the participation flag:

```bash
npm run admin:grant -- learning@mesaschool.co --participate
```

This is the only way a student account can exist outside `@pg27.mesaschool.co`, and only the database owner can set it. The same self-moderation rules apply. Note that a shared mailbox signs in with whoever can read its codes, and its email is shown to students it matches with.

**Current admins:** `joy_mukhopadhyay@pg27.mesaschool.co` (student + admin) and `learning@mesaschool.co` (student + admin, allowlisted; becomes active on first sign-in).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | no | direct connection for migrations |
| `AUTH_SECRET` | yes | at least 32 random characters; keys the code and IP hashes |
| `RESEND_API_KEY` | yes | Resend API key |
| `EMAIL_FROM` | yes | a sender on a Resend-verified domain |
| `OPENROUTER_API_KEY` | for AI | server only |
| `OPENROUTER_MODEL` | no | default `google/gemini-3.7-flash`; must start with `google/` |
| `OPENROUTER_STT_MODEL` | no | voice dictation model; default `google/gemini-3.7-flash` (reads audio); must start with `google/`, otherwise the default is used |
| `OPENROUTER_REASONING_EFFORT` | no | `low` by default |
| `AI_PROVIDER` | no | `openrouter` (default) or `none` |
| `NEXT_PUBLIC_SITE_URL` | no | falls back to Vercel's production URL |

All secrets are read server-side only. Never commit `.env.local`.

## Email

Sign-in codes are sent from `BSL Connect <noreply@flexplaying.com>`, the domain verified in the connected Resend account.

To send from a MESA domain instead, verify it in Resend, then change `EMAIL_FROM` in Vercel and redeploy. Codes:

- are 6 digits and expire after 10 minutes;
- work once and lock after 5 wrong attempts;
- are limited to one per 60 seconds and five per hour per address.

## AI

Every request goes through OpenRouter to `google/gemini-3.7-flash`, with `provider.only = ["google-vertex", "google-ai-studio"]` and fallbacks disabled.

| Feature | Approximate cost per call | Per-user limit |
|---|---|---|
| Profile-coach suggestion | ≈ $0.001 | 30 per hour |
| Pair explanation | ≈ $0.002–0.004 (cached until either profile changes) | 40 per hour |
| Voice dictation (one recording of up to 90 s) | ≈ $0.003 for a 15-second clip; roughly $0.01 for a full 90-second one (estimate) | 40 per hour |

The voice figure comes from one real 15-second test clip (about $0.0027 at Google's upstream rates; 388 audio tokens plus about 140 reasoning tokens) scaled up to 90 seconds. It is an estimate until real usage is measured.

Costs are estimates based on the model's listed pricing ($0.75 / $3.75 per million input/output tokens). When the account is out of credits (HTTP 402), AI features show as unavailable and nothing is retried. Everything else keeps working.

## Testing

```bash
npm run check
```

`npm run check` runs the type check, lint, and unit and database tests. The database tests apply the real migrations to PGlite (Postgres in WASM) and exercise RLS, RPCs, sign-in codes, sessions and the partnership state machine.

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

End-to-end tests start `next dev` with a placeholder database. They cover public pages, route protection, API 401s and layout at 320, 375, 768 and 1440 px.

## Deployment (Vercel)

The project is linked as `joy-mesa-xp/bsl-connect`. To redeploy:

```bash
npx vercel deploy --prod --scope joy-mesa-xp
```

To run the migrations after pulling schema changes:

```bash
npm run db:migrate
```

Environment variables are managed in Vercel → Project → Settings → Environment Variables. They are currently set for **Production** only.

## Known limitations

- **Concurrency:** the database tests run on PGlite's single connection. They verify that conflicting states are impossible, but they don't run truly parallel transactions.
- **Photos:** the photo confirmation is a self-declaration; there's no facial recognition by design. Photos are limited to 4 MB, and the in-app cropper produces about 200 KB.
- **Notifications:** there are no emails for new matches or confirmations; students see them in the app.
