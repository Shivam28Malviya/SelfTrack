# Team Pulse

A team-performance app at `/tp` — people, delivery, attendance, skills and
certifications — sharing a shell with SelfTrack, the points leaderboard with
files and clipboards that this repository started as.

It runs on **Vercel** and on **Cloudflare Workers** from the same source.

- React 18 + Vite + Tailwind, single-page, `src/`. The repository is still
  named SelfTrack; the product is Team Pulse
- One serverless router per module: `api/[...path].js` (leaderboard) and
  `api/tp/[...path].js` (TeamPulse)
- Postgres on Neon through `@neondatabase/serverless`; file storage on Supabase
- Session-token auth in `lib/auth.js`, 30-minute expiry

## Running locally

Node 18+ and a Postgres to point at. Every command below is the same on macOS,
Linux and Windows PowerShell: nothing uses `export`, and nothing relies on the
`VAR=value command` form, which PowerShell cannot parse.

```bash
git clone https://github.com/Shivam28Malviya/SelfTrack.git TeamPulse
cd TeamPulse
npm install
```

Put a connection string in `.env.local` (gitignored). Any of these works:

```bash
# A local Postgres, e.g. via Docker:
#   docker run -d --name teampulse-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
echo 'POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres' > .env.local

# ...or the real Neon database, pulled from Vercel:
#   vercel env pull .env.local
```

Then, once:

```bash
npm run db:migrate                              # creates the schema
npm run db:seed:tp -- --confirm                 # sample team + activity (never run on production)
npm run db:admin -- you@example.com yourpassword
```

And to run it:

```bash
npm run dev:full        # builds the client, serves everything on http://localhost:5174
```

Sign in with the address you just passed to `db:admin`; Team Pulse is at `/tp`.

`npm run dev` is the Vite dev server with hot reload, but it serves the client
only — there is no API behind it. `npm run dev:full` is the one that runs the
whole app, because it mounts the same handlers that run in production rather
than a stand-in.

A note on the database: `@neondatabase/serverless` speaks HTTP to Neon, so
`lib/db.js` picks its transport from the connection string and uses
node-postgres for an ordinary host. It also pins the `DATE` and `TIME` parsers
to return raw strings, because node-postgres would otherwise hand back `Date`
objects where the Neon driver returns `'YYYY-MM-DD'` — a difference that makes
local behaviour quietly disagree with production.

`npm test` covers validators, date maths, CSV handling, task and status rules,
the Workers adapter, SQL statement splitting, formatters, and the contrast of
every colour pair the UI puts together.

## Database

The leaderboard schema is `db/schema.sql`. TeamPulse adds numbered migrations
in `db/migrations/`, tracked in a `_migrations` table so reruns are cheap.

```bash
node --env-file=.env.local scripts/migrate.mjs      # schema + pending migrations
```

Note that `@vercel/postgres` talks to Neon over HTTPS and cannot open a plain
Postgres connection, so this only works with a real Neon URL — it will not run
against a local Postgres.

## Deploying to Cloudflare Workers

```bash
npm run build
npx wrangler secret put POSTGRES_URL                # the Neon pooled URL
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy                                 # or: npm run cf:deploy
```

`npm run cf:dev` runs it locally on `localhost:8787`, including the static
assets and both API routers.

How it fits together:

- `worker/index.js` reproduces what `vercel.json` does — `/api/tp/*` to the
  TeamPulse router, `/api/*` to the leaderboard router, everything else to the
  built SPA with an `index.html` fallback so a reload on `/tp/people` works. A
  request for a path that looks like a file still 404s rather than returning
  HTML, so a missing script fails as a missing script.
- `worker/adapter.js` runs the existing Vercel-style `(req, res)` handlers
  unchanged. Neither router was rewritten, so the two deployments cannot drift.
- `lib/db.js` uses the Neon driver's stateless HTTP transport. This matters on
  Workers: a pooled WebSocket cannot be reused across requests there, while an
  HTTP client can. `@vercel/postgres` cannot run on Workers at all — it reads
  `process.env` at module scope and rejects any host that is not a
  Vercel-issued pooled URL — so it is gone, and the Neon driver it wrapped is
  now a direct dependency.

### Two things to know

**Signing in needs the paid Workers plan.** `bcryptjs` at cost 10 burns roughly
50–200ms of CPU. The free tier caps a request at 10ms, so signup and login would
fail while every other route worked. The paid plan allows far more and is fine.
The hashing cost is not lowered and the algorithm is not swapped: either would
invalidate every existing password.

**One statement per request.** Neon's HTTP transport uses the extended protocol,
which accepts a single statement, so SQL scripts are split by
`lib/tp/sqlSplit.js` before being applied — it tracks string literals,
dollar-quoted blocks and comments, so a semicolon inside any of them does not
split a statement. There is no transaction across the statements of a
migration, which is why every one is written `if not exists`: a partly applied
migration is finished by running it again.

## Deploying to Vercel

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
npm run db:seed:tp -- --confirm
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
