"use strict";

const crypto = require("crypto");
const db = require("./db");

const MAX_SEATS_PER_SEATING = 8;
const VALID_TIMES = ["6:00 PM", "8:30 PM"];
const ALLOWED_IMAGE_KEYS = [
  "hero",
  "craftMain",
  "craftGallery1",
  "craftGallery2",
  "craftGallery3",
  "craftGallery4",
  "craftGallery5",
];

function isDateClosed(dateKey) {
  // Restaurant is closed Mondays.
  const d = new Date(dateKey + "T00:00:00");
  return d.getDay() === 1;
}

function rowToBooking(r) {
  return {
    id: r.id,
    reference: r.reference,
    dateKey: r.date_key,
    time: r.seating_time,
    guests: r.guests,
    name: r.name,
    phone: r.phone,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined,
  };
}

async function listBookings() {
  const res = await db.query("SELECT * FROM bookings ORDER BY date_key, seating_time, created_at");
  return res.rows.map(rowToBooking);
}

async function activeGuestsFor(dateKey, time) {
  const res = await db.query(
    "SELECT COALESCE(SUM(guests), 0) AS total FROM bookings WHERE date_key = $1 AND seating_time = $2 AND status <> 'cancelled'",
    [dateKey, time]
  );
  return Number(res.rows[0].total);
}

async function getAvailability(dateKey) {
  const closed = isDateClosed(dateKey);
  const slots = {};
  for (const time of VALID_TIMES) {
    const taken = closed ? MAX_SEATS_PER_SEATING : await activeGuestsFor(dateKey, time);
    slots[time] = {
      capacity: MAX_SEATS_PER_SEATING,
      taken,
      remaining: Math.max(0, MAX_SEATS_PER_SEATING - taken),
    };
  }
  return { dateKey, closed, slots };
}

// Advisory locks serialize concurrent bookings for the same date+time slot
// across every serverless instance (they're managed by Postgres itself, not
// in-process memory, which is what a serverless deployment needs).
function slotLockKey(dateKey, time) {
  const hash = crypto.createHash("sha256").update(dateKey + "|" + time).digest();
  return hash.readInt32BE(0); // pg_advisory_xact_lock takes a 32-bit signed int
}

async function createBooking({ dateKey, time, guests, name, phone, notes }) {
  if (!VALID_TIMES.includes(time)) {
    const err = new Error("Invalid seating time.");
    err.statusCode = 400;
    throw err;
  }
  if (isDateClosed(dateKey)) {
    const err = new Error("The restaurant is closed on Mondays.");
    err.statusCode = 400;
    throw err;
  }
  guests = Number(guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_SEATS_PER_SEATING) {
    const err = new Error("Guest count must be between 1 and " + MAX_SEATS_PER_SEATING + ".");
    err.statusCode = 400;
    throw err;
  }
  name = String(name || "").trim();
  phone = String(phone || "").trim();
  notes = String(notes || "").trim().slice(0, 2000);
  if (!name || !phone) {
    const err = new Error("Name and telephone are required.");
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [slotLockKey(dateKey, time)]);

    const sumRes = await client.query(
      "SELECT COALESCE(SUM(guests), 0) AS total FROM bookings WHERE date_key = $1 AND seating_time = $2 AND status <> 'cancelled'",
      [dateKey, time]
    );
    const taken = Number(sumRes.rows[0].total);
    if (taken + guests > MAX_SEATS_PER_SEATING) {
      const err = new Error(
        "Only " + Math.max(0, MAX_SEATS_PER_SEATING - taken) + " seat(s) remain for that seating."
      );
      err.statusCode = 409;
      throw err;
    }

    const suffix = time === "8:30 PM" ? "B" : "A";
    const reference =
      "TRN-" + dateKey.replace(/-/g, "") + "-" + guests + suffix + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
    const id = crypto.randomUUID();

    const insertRes = await client.query(
      `INSERT INTO bookings (id, reference, date_key, seating_time, guests, name, phone, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [id, reference, dateKey, time, guests, name, phone, notes]
    );
    return rowToBooking(insertRes.rows[0]);
  });
}

async function withTransaction(fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function updateBookingStatus(id, status) {
  if (!["pending", "confirmed", "cancelled"].includes(status)) {
    const err = new Error("Invalid status.");
    err.statusCode = 400;
    throw err;
  }
  const res = await db.query(
    "UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
    [status, id]
  );
  if (res.rowCount === 0) {
    const err = new Error("Booking not found.");
    err.statusCode = 404;
    throw err;
  }
  return rowToBooking(res.rows[0]);
}

async function getSiteContent() {
  const res = await db.query("SELECT key, url FROM site_images");
  const byKey = {};
  res.rows.forEach((r) => { byKey[r.key] = r.url; });
  const images = {};
  ALLOWED_IMAGE_KEYS.forEach((k) => { images[k] = byKey[k] || null; });
  return { images };
}

async function setSiteImage(key, url) {
  const prevRes = await db.query("SELECT url FROM site_images WHERE key = $1", [key]);
  const previousUrl = prevRes.rows[0] ? prevRes.rows[0].url : null;
  await db.query(
    `INSERT INTO site_images (key, url) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET url = EXCLUDED.url`,
    [key, url]
  );
  return { previousUrl };
}

module.exports = {
  MAX_SEATS_PER_SEATING,
  VALID_TIMES,
  ALLOWED_IMAGE_KEYS,
  isDateClosed,
  listBookings,
  getAvailability,
  createBooking,
  updateBookingStatus,
  getSiteContent,
  setSiteImage,
};
