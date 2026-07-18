# SelfTrack — Project Handoff

Final export as of 2026-07-08. Full project history, architecture, and open items for anyone (human or AI) picking this up next.

---

## 1. What This Project Is

**SelfTrack** — gamified leaderboard app. Users earn points, admins manage the season, weekly/monthly champions get declared, kudos/streaks/achievements drive engagement. Built as React + Vite SPA with a Vercel serverless backend and Postgres (Neon) DB.

- **Live URL:** https://selftrack-eight.vercel.app
- **Repo:** https://github.com/Shivam28Malviya/SelfTrack (branch `master`)
- **Vercel project:** `selftrack` (project id `prj_qUXx7SkptbvSUP3hTenxyvmG0ADS`, team `superhitman` / `team_orwre8M7fdFcXQgsTDrX2VqX`)
- **DB:** Vercel Postgres (Neon), connected via `POSTGRES_URL` env var
- **File storage:** Vercel Blob (`BLOB_READ_WRITE_TOKEN` env var) — reconnected to a **new** store this session

---

## 2. Architecture

### Stack
- React 18 + Vite 5 + Tailwind CSS 3, React Router 6
- No state library — single `AuthContext` is the app's state engine
- Backend: **one** serverless function `api/[...path].js` (catch-all router) — kept to a single function to stay under Vercel Hobby's function-count limit
- `@vercel/postgres`, `bcryptjs`, `@vercel/blob` are the only backend deps

### Key files
| File | Purpose |
|---|---|
| `api/[...path].js` | All API routes — auth, users, points, kudos, meta, notifications, files |
| `lib/auth.js` | Session management: bearer tokens, 30-min TTL, bcrypt hashing |
| `lib/db.js` | Row-to-object mappers for all Postgres tables |
| `lib/state.js` | `buildState()` — assembles full app-state payload sent after every mutation |
| `db/schema.sql` | Full Postgres schema |
| `src/context/AuthContext.jsx` | Central client-side state engine, calls every API endpoint |
| `src/lib/api.js` | Fetch client — bearer token header, 401 auto-redirect to `/login` |
| `vercel.json` | Rewrites: SPA fallback + multi-segment `/api/*` routing |

### DB tables
`users`, `history`, `kudos`, `sessions`, `notifications`, `audit_log`, `seasons`, `weekly_winners`, `meta`, `files`

### Routing gotchas (already solved, don't re-break)
- Helper modules **must** live in top-level `lib/`, never inside `api/` — Vercel deploys every `.js` under `api/` as its own function, which breaks the catch-all and blows the function-count limit.
- `vercel.json` needs an **explicit** rewrite `/api/:path*` → `/api/[...path]?path=:path*`, because Vercel's zero-config routing doesn't match multi-segment API paths on its own.
- SPA fallback rewrite `/((?!api/).*)` → `/index.html` is required or direct navigation to routes like `/profile` 404s at the platform level.

---

## 3. Feature Set (all shipped, in build order)

1. Core leaderboard: points, weekly/monthly/yearly tracking, admin approval for signups
2. Password visibility/update, profile pictures with admin approval, background image
3. XP/levels, achievements, streaks, kudos, notifications, Command Palette, audit log, Hall of Fame, CSV export
4. Full Postgres backend migration (from localStorage), bcrypt passwords, bearer-token sessions
5. WEAVE-style editorial reskin: warm cream/clay theme (replaced dark glassmorphism)
6. Admin rename users, 30-min session TTL, grouped settings, page transitions
7. Winner-based week champion (sourced from admin-declared `weekly_winners`, not raw top scorer), mobile right-panel inline, spectator role, podium rank backgrounds
8. Admin Files page (Vercel Blob) — upload/download/delete zip/pdf/ppt/etc, max 100MB
9. Audit pass: async award feedback, Monday-based week boundaries everywhere, dead-link cleanup, kudos guard, stale-session purge

### Roles
`admin`, `moderator`, `user`, `spectator` (spectators are view-only — excluded from leaderboard/scoring/weekly winners, hidden from regular users)

### Week/season logic
- Weeks are **Monday–Sunday** (`(day + 6) % 7` formula) — applied consistently in `AuthContext`, `gamification.js`, and `Profile.jsx`'s chart
- Week champion = admin-declared entry in `weekly_winners`, matched by week number — **not** the raw top scorer
- Month champion only revealed at the last week of the month

---

## 4. THIS SESSION'S WORK — File Upload Bug (unresolved at close)

### Symptom
Admin Files page upload fails for every file, including files under 100KB.

### Root causes found & fixed
1. **Blob store not connected** (early in session) → `BlobError: No read-write token found`. Fixed by connecting a Blob store + redeploy. *(Later found to need a second, fresh store — see below.)*
2. **Broken `onUploadCompleted` no-op** — `api/[...path].js`'s `/files/upload` handler passed `onUploadCompleted: async () => {}`. Any truthy `onUploadCompleted` makes `@vercel/blob`'s `handleUpload` internally call `getCallbackUrl(req)`, which derives a callback URL from `req.url`. Under this project's rewrite (`/api/[...path]?path=files/upload`), that produces a broken URL — the Blob CDN can't call back to it, so the whole client upload flow errors out. **Fix:** removed `onUploadCompleted` entirely (commit `124aefd`) since the app already persists file metadata via a separate `POST /files` call — the callback was never needed.

### Failed attempt (reverted — do not repeat)
Changed `import { handleUpload } from '@vercel/blob/client'` to `import { handleUpload } from '@vercel/blob'` (main package), reasoning "server code shouldn't import from `/client`". **This was wrong.** Verified directly against `node_modules`:
- `@vercel/blob` (main): exports `del`, `uploadPart` — **no `handleUpload`**
- `@vercel/blob/client`: exports `handleUpload`, `upload`, `put`, etc. — this **is** the correct server-side import for the token-exchange handler, despite the "client" name (it's meant to be called from a server route that the browser's `upload()` calls into)

This broke the entire module (`handleUpload` was `undefined`), which crashed **login** too since it's one catch-all function. Reverted immediately (commit `2c729c6`).

### Where it stands
- User created a **second, brand-new** Blob store and connected it fresh (the first store connection may have been stale/misconfigured).
- Triggered a redeploy (`2ac3992`, empty commit) to pick up the new `BLOB_READ_WRITE_TOKEN`.
- Latest deployment confirmed **READY**: `dpl_DhA1e45NHJhVPeJrnjZx2WhiLohH`, aliased to `selftrack-eight.vercel.app`.
- Checked runtime logs on that deployment — **no upload attempt logged yet**. Waiting on user to actually try it in the browser.
- Added debug instrumentation (commit `24bfa59`) to `src/pages/Files.jsx`: the catch block now does `console.error('[Files upload] failed:', err)` and shows the **real** error message in the toast (`Upload failed: ${msg}`, 8s duration) instead of a generic guess. **This is intentionally left in** — needed to diagnose the next failure. Can be trimmed back to a friendlier message once upload is confirmed working.

### Next steps for whoever resumes
1. Log in as admin on `selftrack-eight.vercel.app`, go to Files, try uploading any small file.
2. Capture three things:
   - Exact toast text (`Upload failed: <message>`)
   - Browser DevTools **Console** error (`[Files upload] failed: ...`)
   - Browser DevTools **Network** tab — find the failing request (likely a `PUT` to `*.blob.vercel-storage.com`), note status code + response body
3. Cross-reference with Vercel runtime logs: `get_runtime_logs` tool, `projectId: prj_qUXx7SkptbvSUP3hTenxyvmG0ADS`, `teamId: team_orwre8M7fdFcXQgsTDrX2VqX`, query `"files"`.
4. **Known risk to check:** the `files` Postgres table may have rows referencing the **old** Blob store's URLs (before the new store was connected). Those old blob objects may 404 on download/delete now since they live in a different store. Consider auditing `select * from files` for stale URLs, or clearing test rows.
5. If the new store's token still doesn't work, double check in the Vercel dashboard that exactly one Blob store is attached to the `selftrack` project (an orphaned old store + a new one both attached could cause ambiguity in which token gets injected).

### Vercel MCP notes for next session
- There are **two different team scopes** in play — an old one (`team_hFBPqBFhgAhvPlv1QWCK5iSW`) that 403s, and the correct one (`team_orwre8M7fdFcXQgsTDrX2VqX`, slug `superhitman`) that actually has access. **Always use `team_orwre8M7fdFcXQgsTDrX2VqX`.**
- `get_runtime_errors` tool 403s entirely under the correct team too (some permission gap) — use `get_runtime_logs` with a deployment/query filter instead.

---

## 5. Git State at Close

- Working tree: **clean**, nothing uncommitted.
- All commits pushed to `origin/master`.
- Most recent commits (newest first):
  ```
  2ac3992 chore: redeploy to pick up new Blob store connection
  24bfa59 chore(files): surface real upload error in toast for debugging
  124aefd fix: remove onUploadCompleted to prevent broken Blob callback URL from rewritten path
  2c729c6 revert: restore handleUpload import from @vercel/blob/client
  366642a fix: import handleUpload from @vercel/blob server package not /client subpath  [reverted by 2c729c6]
  aabc828 chore: trigger redeploy to pick up Blob store connection
  9d41b7a feat: admin Files page — upload/share zip, pdf, ppt via Vercel Blob
  ```

---

## 6. Outstanding / Carried-Forward Items (from earlier in project lifetime)

- **⚠️ Security: rotate Neon DB password.** Early in the project's life, a Neon connection string containing the DB password (`npg_SHick2hJtGL0`, host `ep-weathered-sun-admbqtxe-pooler.c-2.us-east-1.aws.neon.tech`) was pasted into chat. User was told to rotate it via Neon dashboard → Settings → Reset password. **Unconfirmed whether this was done** — verify before treating this credential as safe.
- Seed admin password (`admin123`) was changed by the user through the app UI at some point — actual current admin credentials are known only to the user, not recorded anywhere in this project's history.
- No local dev server was used this session — all changes were made via direct file edits + git push, verified through Vercel's hosted deployments and MCP-based runtime log inspection. If resuming locally, run `npm install` then `npm run dev`.

---

## 7. Environment / Closure Checklist

- [x] Git working tree clean, all pushed
- [x] No local dev servers running
- [x] No open DB connections held by this session (Postgres accessed only via Vercel's pooled connection in serverless functions)
- [ ] **Debug logging still active** in `src/pages/Files.jsx` (`console.error` + verbose error toast) — intentional, remove once upload is confirmed working
- [ ] **Upload feature unverified end-to-end** — this is the one pending test before this feature can be called done
- [ ] Neon password rotation — unconfirmed, verify with user
