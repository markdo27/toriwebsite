"use strict";

const crypto = require("crypto");
const db = require("./db");

const DEFAULT_MAX_GUESTS = 8;
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

const SECTION_KEYS = ["concept", "craft", "visit", "reserve"];

// Multiline keys use manual line breaks (rendered as <br>); everything else
// is plain single-line text.
const MULTILINE_TEXT_KEYS = ["concept.headline", "craft.headline", "reserve.headline"];

const DEFAULT_TEXT = {
  "hero.kicker": "Yakitori Omakase · Eight Seats",
  "hero.cityLabel": "Ho Chi Minh",
  "hero.ctaLabel": "Reserve a Seat",

  "concept.eyebrow": "01 — The Concept",
  "concept.headline": "Eight seats,\none fire,\none evening.",
  "concept.body1":
    "Torinoa is a counter, not a dining room. Eight guests sit shoulder to shoulder before the binchotan, and the evening moves at the pace of the coals. There is no menu to choose from — the chef serves what the morning market gave him, skewer by skewer, in the order the fire prefers.",
  "concept.body2":
    "We are in soft opening. Seatings are limited, reservations are confirmed by phone, and the room runs to a single start time so that no course is served twice.",
  "concept.note":
    "Soft opening — the counter seats eight per service. Please arrive within ten minutes of your seating; the fire does not wait.",

  "craft.eyebrow": "02 — The Craft",
  "craft.headline": "White charcoal,\nseasonal hands.",
  "craft.intro":
    "Binchotan burns without smoke and without flame — only heat, held steady by the wrist. Everything else is timing.",
  "craft.captionMain": "Featured — the room, end to end",
  "craft.caption1": "The counter — arm's length from the coals",
  "craft.caption2": "Charcoal, held steady",
  "craft.caption3": "Whatever the market gave",
  "craft.caption4": "Plating, course by course",
  "craft.caption5": "The chef at the fire",

  "visit.eyebrow": "03 — Before You Come",
  "visit.headline": "Essentials, plainly stated.",
  "visit.card1Label": "Dietary restrictions",
  "visit.card1Title": "The menu cannot be altered.",
  "visit.card1Body":
    "Omakase is served in a fixed sequence, and much of the bird cannot be substituted. Tell us of allergies or restrictions when you reserve — if we cannot serve you properly, we would rather say so before you travel.",
  "visit.card1Fineprint": "No substitutions · No à la carte",
  "visit.card2Label": "Reservations & location",
  "visit.card2Title": "By telephone only.",
  "visit.hoursNote": "Seatings at 6:00 PM and 8:30 PM, Tuesday through Sunday. Eight seats per service.",

  "reserve.eyebrow": "04 — Reserve",
  "reserve.headline": "Take a seat\nat the counter.",
  "reserve.intro":
    "Eight seats per service, two services an evening. Requests are held for fifteen minutes while we confirm by telephone.",
  "reserve.fineprint":
    "Confirmation is by telephone. Requests are not final until we call you back on 081 671 7375.",

  "footer.tagline": "A binchotan yakitori counter for eight guests, in soft opening in Saigon Ward.",
  "footer.note": "Eight seats per service. No substitutions, no à la carte. Reservations confirmed by telephone.",
};

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

async function getDefaultMaxGuests(client) {
  const c = client || db;
  const res = await c.query("SELECT value FROM site_settings WHERE key = 'default_max_guests'");
  const n = res.rows[0] ? parseInt(res.rows[0].value, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_GUESTS;
}

async function setDefaultMaxGuests(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    const err = new Error("Default guest capacity must be a whole number between 1 and 100.");
    err.statusCode = 400;
    throw err;
  }
  await db.query(
    `INSERT INTO site_settings (key, value) VALUES ('default_max_guests', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(n)]
  );
  return n;
}

async function getCapacityOverrides() {
  const res = await db.query("SELECT date_key, max_guests FROM capacity_overrides ORDER BY date_key");
  return res.rows.map((r) => ({ dateKey: r.date_key, maxGuests: r.max_guests }));
}

async function setCapacityOverride(dateKey, maxGuests) {
  maxGuests = Number(maxGuests);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const err = new Error("dateKey must be a YYYY-MM-DD date.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(maxGuests) || maxGuests < 0 || maxGuests > 100) {
    const err = new Error("Capacity override must be a whole number between 0 and 100.");
    err.statusCode = 400;
    throw err;
  }
  await db.query(
    `INSERT INTO capacity_overrides (date_key, max_guests) VALUES ($1, $2)
     ON CONFLICT (date_key) DO UPDATE SET max_guests = EXCLUDED.max_guests`,
    [dateKey, maxGuests]
  );
  return { dateKey, maxGuests };
}

async function deleteCapacityOverride(dateKey) {
  await db.query("DELETE FROM capacity_overrides WHERE date_key = $1", [dateKey]);
}

async function effectiveMaxGuests(dateKey, client) {
  const c = client || db;
  const res = await c.query("SELECT max_guests FROM capacity_overrides WHERE date_key = $1", [dateKey]);
  if (res.rows[0]) return res.rows[0].max_guests;
  return getDefaultMaxGuests(client);
}

async function getAvailability(dateKey) {
  const closed = isDateClosed(dateKey);
  const max = await effectiveMaxGuests(dateKey);
  const slots = {};
  for (const time of VALID_TIMES) {
    const taken = closed ? max : await activeGuestsFor(dateKey, time);
    slots[time] = {
      capacity: max,
      taken,
      remaining: Math.max(0, max - taken),
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
  if (!Number.isInteger(guests) || guests < 1 || guests > 100) {
    const err = new Error("Guest count must be a whole number between 1 and 100.");
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

    const max = await effectiveMaxGuests(dateKey, client);
    if (guests > max) {
      const err = new Error("This seating allows at most " + max + " guest(s).");
      err.statusCode = 400;
      throw err;
    }

    const sumRes = await client.query(
      "SELECT COALESCE(SUM(guests), 0) AS total FROM bookings WHERE date_key = $1 AND seating_time = $2 AND status <> 'cancelled'",
      [dateKey, time]
    );
    const taken = Number(sumRes.rows[0].total);
    if (taken + guests > max) {
      const err = new Error("Only " + Math.max(0, max - taken) + " seat(s) remain for that seating.");
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
  const [imagesRes, textRes, sectionsRes, maxGuests] = await Promise.all([
    db.query("SELECT key, url FROM site_images"),
    db.query("SELECT key, value FROM site_text"),
    db.query("SELECT key, visible FROM site_sections"),
    getDefaultMaxGuests(),
  ]);

  const images = {};
  ALLOWED_IMAGE_KEYS.forEach((k) => { images[k] = null; });
  imagesRes.rows.forEach((r) => { images[r.key] = r.url; });

  const text = Object.assign({}, DEFAULT_TEXT);
  textRes.rows.forEach((r) => { if (r.value !== null) text[r.key] = r.value; });

  const sections = {};
  SECTION_KEYS.forEach((k) => { sections[k] = true; });
  sectionsRes.rows.forEach((r) => { sections[r.key] = r.visible; });

  return { images, text, sections, maxGuests };
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

async function getTextContent() {
  const res = await db.query("SELECT key, value FROM site_text");
  const text = Object.assign({}, DEFAULT_TEXT);
  res.rows.forEach((r) => { if (r.value !== null) text[r.key] = r.value; });
  return text;
}

async function setTextContent(key, value) {
  if (!(key in DEFAULT_TEXT)) {
    const err = new Error("Unknown content key: " + key);
    err.statusCode = 400;
    throw err;
  }
  value = String(value == null ? "" : value).slice(0, 4000);
  await db.query(
    `INSERT INTO site_text (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
  return value;
}

async function resetTextContent(key) {
  if (!(key in DEFAULT_TEXT)) {
    const err = new Error("Unknown content key: " + key);
    err.statusCode = 400;
    throw err;
  }
  await db.query("DELETE FROM site_text WHERE key = $1", [key]);
  return DEFAULT_TEXT[key];
}

async function getSectionVisibility() {
  const res = await db.query("SELECT key, visible FROM site_sections");
  const sections = {};
  SECTION_KEYS.forEach((k) => { sections[k] = true; });
  res.rows.forEach((r) => { sections[r.key] = r.visible; });
  return sections;
}

async function setSectionVisibility(key, visible) {
  if (!SECTION_KEYS.includes(key)) {
    const err = new Error("Unknown section: " + key);
    err.statusCode = 400;
    throw err;
  }
  await db.query(
    `INSERT INTO site_sections (key, visible) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET visible = EXCLUDED.visible`,
    [key, !!visible]
  );
  return !!visible;
}

module.exports = {
  DEFAULT_MAX_GUESTS,
  VALID_TIMES,
  ALLOWED_IMAGE_KEYS,
  SECTION_KEYS,
  DEFAULT_TEXT,
  MULTILINE_TEXT_KEYS,
  isDateClosed,
  listBookings,
  getAvailability,
  createBooking,
  updateBookingStatus,
  getSiteContent,
  setSiteImage,
  getTextContent,
  setTextContent,
  resetTextContent,
  getSectionVisibility,
  setSectionVisibility,
  getDefaultMaxGuests,
  setDefaultMaxGuests,
  getCapacityOverrides,
  setCapacityOverride,
  deleteCapacityOverride,
};
