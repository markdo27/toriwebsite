# Torinoa website

A restaurant site with a small backend for reservations, owner email
notifications, seat-capacity enforcement, and a photo-upload admin panel —
built to deploy on **Vercel**.

## Architecture

- **Frontend**: static `index.html` / `css/` / `js/` / `assets/`, plus a
  static `admin/` dashboard. Served directly by Vercel's static hosting.
- **Backend**: one Express app (`server/app.js`) used two ways:
  - Locally, `server/index.js` runs it as a normal Node server
    (`app.listen`).
  - On Vercel, `api/index.js` exports the same app as a serverless
    function; `vercel.json` routes every `/api/*` request to it.
- **Data**: Postgres (bookings, and which photo replaces which
  placeholder) — a serverless function's filesystem is read-only and
  wiped between invocations, so nothing can be saved to a local file or
  disk the way the very first version of this app did.
- **Photo uploads**: Vercel Blob storage, for the same reason — uploaded
  files can't live on local disk in a serverless deployment.
- **Admin login**: a signed cookie (HMAC, stateless) instead of
  server-side sessions — serverless instances don't share memory, so a
  session store that lived in server memory would randomly log people out.

## Deploying to Vercel

1. **Push this repo to GitHub** (already done — `markdo27/toriwebsite`),
   then import it in the Vercel dashboard (New Project → import the repo).
   Vercel auto-detects the Node serverless function in `api/` and the
   static files at the root; no build command is needed.

2. **Add a Postgres database.** In the project's **Storage** tab →
   *Create Database* → **Postgres** → *Connect to Project*. This
   automatically sets `POSTGRES_URL` (and a couple of related vars) for
   you — nothing to copy by hand.

3. **Add Blob storage.** Same **Storage** tab → *Create* → **Blob** →
   *Connect to Project*. This sets `BLOB_READ_WRITE_TOKEN` for you.

4. **Set the remaining environment variables** (Project → Settings →
   Environment Variables):

   | Variable | What it's for |
   |---|---|
   | `SESSION_SECRET` | Signs the admin login cookie. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `ADMIN_USERNAME` | Owner's dashboard login username |
   | `ADMIN_PASSWORD_HASH` | Owner's dashboard login password, hashed — see below |
   | `OWNER_EMAIL` | Where new-booking notification emails go |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | An SMTP account to send those emails from (Gmail App Password, Outlook, or any transactional provider's SMTP relay) |

   Set a password hash with:
   ```bash
   npm run hash-password -- "your-new-password"
   ```
   then paste the printed value in as `ADMIN_PASSWORD_HASH`.

5. **Deploy.** Vercel redeploys automatically on every push to the
   connected branch.

Until SMTP + `OWNER_EMAIL` are set, bookings still save and show up in
`/admin` — the server just skips the email instead of failing the
booking.

## Local development

```bash
npm install
vercel link          # first time only — links this folder to the Vercel project
vercel env pull .env.local   # pulls POSTGRES_URL, BLOB_READ_WRITE_TOKEN, etc. from Vercel
```

Copy anything `vercel env pull` didn't cover (it won't have secrets you
haven't set in the dashboard yet) into `.env` — see `.env.example`. Then:

```bash
npm start
```

Site: `http://localhost:5183` · Admin: `http://localhost:5183/admin`

You don't strictly need a Vercel project to develop locally — any Postgres
connection string works for `POSTGRES_URL` (a free one from
[Neon](https://neon.tech) or [Supabase](https://supabase.com) is fine for
testing), but photo uploads specifically need a real `BLOB_READ_WRITE_TOKEN`
from Vercel, since Blob is a Vercel-specific product.

## What the backend does

- **Reservations** (`server/routes/bookings.js`, `server/store.js`) — each
  seating (6:00 PM / 8:30 PM) is capped at 8 guests. Capacity is checked
  and the row inserted inside a single Postgres transaction guarded by an
  advisory lock on that date+time, so two people booking the last seats at
  the same instant can't both succeed — correct even across multiple
  serverless instances, which don't share memory.
- **Owner notification** — a new booking emails `OWNER_EMAIL`
  (`server/mailer.js`), awaited before the request finishes (a serverless
  function can be frozen right after it responds, which would otherwise
  silently kill a "fire and forget" email send).
- **Admin dashboard** (`admin/`) — sign in, see every reservation request,
  mark each Confirmed / Cancelled / Pending, and manage photos.
- **Photo uploads** — 7 slots (hero image + 6 gallery photos) in the
  dashboard's Photos tab. Uploading replaces the matching placeholder on
  the live site immediately; files are stored in Vercel Blob and their
  public URLs saved in Postgres.

## Notes

- `.env`, `.env.local`, and `.vercel/` are git-ignored.
- Admin cookies are signed and stateless — no server-side session store,
  so nothing to lose on a redeploy or cold start. They expire after 12
  hours.
