# Torinoa website

A single restaurant site with a small Node/Express backend for reservations,
owner email notifications, seat-capacity enforcement, and a photo-upload
admin panel.

## Running it

```bash
npm install
npm start
```

The site is served at `http://localhost:5183`, and the admin dashboard at
`http://localhost:5183/admin`.

`.claude/launch.json` is already set up so the Browser preview tool runs the
same command.

## First-time setup (`.env`)

Copy `.env.example` to `.env` and fill in:

- **`SESSION_SECRET`** — any long random string. Generate one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **`ADMIN_USERNAME`** / **`ADMIN_PASSWORD_HASH`** — the owner's login for
  `/admin`. Set the password with:
  `npm run hash-password -- "your-new-password"`, then paste the printed
  hash into `.env`.
- **`OWNER_EMAIL`** — where new-booking notification emails go.
- **`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`** — an SMTP
  account to send those emails from. Any provider's SMTP works: a Gmail
  account with an **App Password** (not your normal password), Outlook,
  or a transactional provider like Resend/SendGrid/Postmark via their SMTP
  relay.

Until SMTP + `OWNER_EMAIL` are filled in, bookings still save and appear in
`/admin` — the server just logs a warning instead of emailing, so nothing
breaks while you get credentials sorted.

`.env` is git-ignored. Never commit it.

## What the backend does

- **Reservations** (`server/routes/bookings.js`, `server/store.js`) — each
  seating (6:00 PM / 8:30 PM) is capped at 8 guests. The server rejects a
  booking that would overflow a seating (`409 Conflict`), independent of
  whatever the browser shows, so capacity can't be double-booked by two
  people submitting at once. Bookings are stored in `data/bookings.json`.
- **Owner notification** — a new booking triggers an email to `OWNER_EMAIL`
  (`server/mailer.js`). The owner can also just check `/admin` — email is a
  convenience, not the only way to see requests.
- **Admin dashboard** (`admin/`) — sign in, see every reservation request
  (date, seating, guests, contact, notes, reference), and mark each
  Confirmed / Cancelled / Pending. This is also where photos are managed.
- **Photo uploads** — the dashboard's Photos tab has 7 slots (hero image +
  6 gallery photos). Uploading a JPEG/PNG/WebP/AVIF there replaces the
  matching placeholder on the live site immediately — no code or file
  editing needed. Files land in `/uploads` and are tracked in
  `data/site-content.json`.

## Notes

- `data/bookings.json`, `data/site-content.json`, and everything under
  `/uploads` are git-ignored — they're runtime data (including guest names
  and phone numbers), not source code.
- Admin sessions use an in-memory store, so signing in again is needed
  after a server restart.
