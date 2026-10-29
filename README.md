# SelfTrack

A small team app on Vercel: a points leaderboard with files and clipboards, plus
**TeamPulse**, a team-performance module at `/tp`.

- React 18 + Vite + Tailwind, single-page, `src/`
- One serverless router per module: `api/[...path].js` (leaderboard) and
  `api/tp/[...path].js` (TeamPulse)
- Postgres on Neon through `@vercel/postgres`; file storage on Supabase
- Session-token auth in `lib/auth.js`, 30-minute expiry

## Running locally

```bash
npm install
vercel env pull .env.local     # POSTGRES_URL, Supabase keys
npm run dev                    # http://localhost:5173
npm test                       # unit tests (node --test)
npm run build
```

`npm test` covers validators, date maths, CSV handling, task and status rules,
formatters, and the contrast of every colour pair the UI puts together.

## Database

The leaderboard schema is `db/schema.sql`. TeamPulse adds numbered migrations
in `db/migrations/`, tracked in a `_migrations` table so reruns are cheap.

```bash
node --env-file=.env.local scripts/migrate.mjs      # schema + pending migrations
```

Note that `@vercel/postgres` talks to Neon over HTTPS and cannot open a plain
Postgres connection, so this only works with a real Neon URL — it will not run
against a local Postgres.

## Deploying

Vercel builds `master` on push.

### When a build fails with `Resource provisioning failed`

The symptom is a deployment that goes to ERROR in under a second with **no build
log at all**. The build never starts, so it is not the code and there is nothing
in the logs to read.

Check, in this order:

1. **Is the Vercel project paused?** `GET /v9/projects/selftrack` reporting
   `"live": false` means it is. A paused project will not provision compute for
   a new deployment, and every push fails this way, production and preview
   alike. Unpause it in the project's settings, or via the API, then redeploy.
2. **Is the linked Supabase project paused?** Free projects pause after
   inactivity. Resume it and wait for `ACTIVE_HEALTHY` — it passes through
   `COMING_UP` and `RESTORING`, which takes a couple of minutes.

Both have happened here. A paused Vercel project was the cause of a run of six
consecutive failures; the repository's history also contains three failures
followed by a commit titled "redeploy now that Supabase is resumed", so the
Supabase case is real too — but resuming Supabase alone did not fix the run of
six, which is what pointed at the project being paused.

Either way the live site keeps serving: a failed deployment never takes the
production alias, so the previous good build stays up.

### After the first deploy carrying TeamPulse

The `tp_` tables have to be created once. Because the database is only reachable
from inside the deployment, an admin applies them through the app:

```bash
curl -X POST https://<your-app>/api/tp/migrate -H "Authorization: Bearer <admin token>"
curl https://<your-app>/api/tp/health          # { ok: true } once the schema is in
```

`GET /api/tp/migrate` reports what is pending without applying anything. Both
are admin-only, idempotent, and recorded in the audit trail.

Then link a login to a person, or TeamPulse has nobody to scope to:

```sql
update tp_person set user_id = (select id from users where email = '<you>')
 where name = '<their name>';
```

A `users.role` of `admin` maps to TeamPulse admin and `moderator` to manager.
Optional sample data, which refuses to run without the flag:

```bash
TP_SEED=1 node --env-file=.env.local scripts/seed-teampulse.mjs
```

## TeamPulse

Screens: overview, people, delivery, attendance, skills, entries and the audit
trail, quick log, settings, and `/tp/today` for phones.

Every metric formula, the flagging rule, the role and row-access matrix, the
validation rules and the retention policy are written down in
[`docs/teampulse-spec.md`](docs/teampulse-spec.md). Two rules run through the
whole module: **a metric with no data shows an em dash, never a zero**, and
**row access is decided server-side in `lib/tp/roles.js` and nowhere else**.

Attendance and late-login data is employee monitoring. Reads of another
person's record are logged, exports are watermarked with who asked and when,
and retention is published in the footer of every screen.
