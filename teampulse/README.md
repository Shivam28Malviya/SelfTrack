# Team Pulse

Delivery, client impact, attendance and growth for a team, in one place.

People and their projects, a task tracker with real delivery metrics, an
attendance calendar with leave and late logins, a skills heatmap with cover
analysis, certifications, and a flagging rule that says why it flagged someone.

Two rules run through the whole thing: **a metric with no data shows an em
dash, never a zero**, and **row-level access is decided server-side in
`lib/tp/roles.js` and nowhere else**.

- React 18 + Vite + Tailwind, single page, `src/`
- One serverless API function, `api/[...path].js`
- Postgres through `@neondatabase/serverless`, or any Postgres over TCP
- Runs on Cloudflare Workers, on Vercel, or under Node on a laptop

## Running it

Node 18+ and a Postgres. Every command below works the same in bash,
PowerShell and cmd.

```bash
npm install
```

Put a connection string in `.env.local` (gitignored):

```
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres
```

A local Postgres via Docker, if you need one:

```
docker run -d --name teampulse-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

Then, once:

```bash
npm run db:migrate                                  # schema + migrations
npm run db:seed -- --confirm                        # sample team and activity
npm run db:admin -- you@example.com yourpassword    # your account
```

And to run it:

```bash
npm run dev:full        # http://localhost:5174
```

`npm run dev` is Vite with hot reload, but it serves the client only — there is
no API behind it. `npm run dev:full` runs the whole application.

There is no self-signup. Team Pulse holds attendance and performance records,
so accounts are created with `db:admin`, which also links the account to a
person — without that link the app has nobody in scope.

## Deploying

**Cloudflare Workers**

```bash
npm run build
npx wrangler secret put POSTGRES_URL
npx wrangler deploy
```

Signing in needs the paid Workers plan: `bcryptjs` at cost 10 uses more than
the free tier's 10ms CPU budget. The cost is not lowered and the algorithm not
swapped — either would invalidate every existing password.

**Vercel** — push to the repository's production branch. `vercel.json` routes
`/api/*` to the function and everything else to the client.

Either way, apply the schema once after the first deploy:

```bash
curl -X POST https://<your-app>/api/migrate -H "Authorization: Bearer <admin token>"
curl https://<your-app>/api/health          # { ok: true } once the schema is in
```

## How it fits together

| Path | What it holds |
|---|---|
| `api/[...path].js` | every route: authentication, people, tasks, attendance, skills, metrics |
| `lib/tp/roles.js` | who can see which rows — the only place that decides |
| `lib/tp/metrics.js` | every metric formula, aggregated in SQL |
| `lib/tp/attention.js` | the flagging rule, and the signals it returns with each status |
| `lib/db.js` | Neon over HTTP for a Neon host, node-postgres for any other |
| `worker/` | the Cloudflare entry point and the adapter that runs the handler unchanged |
| `db/migrations/` | schema changes, tracked in `_migrations`, each safe to rerun |

Roles map onto the account's `role`: `admin`, `moderator` (manager), `user`
(member). A manager sees their own reporting tree, a member sees themselves.

## Metric definitions

Every formula, the flagging thresholds, the access matrix, the validation
rules and the retention policy are written down in
[`docs/teampulse-spec.md`](docs/teampulse-spec.md).

Two are deliberately absent rather than estimated: **utilization** needs
billable hours, which nothing records, and **overtime** is entered by hand, so
it is always reported with how many people it covers.

## Privacy

Attendance and late-login data is employee monitoring. Reads of another
person's record are logged, exports carry a header naming who asked and when,
retention is published in the footer of every screen, and a flagged person can
see exactly which signals produced their status.

## Tests

```bash
npm test
```

Covers the validators, date arithmetic, CSV handling, task and status rules,
SQL statement splitting, the Workers adapter, the formatters, and the contrast
of every colour pair the interface puts together.
