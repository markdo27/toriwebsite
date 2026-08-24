"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const SITE_CONTENT_FILE = path.join(DATA_DIR, "site-content.json");

const MAX_SEATS_PER_SEATING = 8;
const VALID_TIMES = ["6:00 PM", "8:30 PM"];

// Simple async write queue per file so concurrent requests never interleave
// read-modify-write cycles (JSON files aren't safe for concurrent writers).
const queues = new Map();
function withFileLock(file, task) {
  const prior = queues.get(file) || Promise.resolve();
  const next = prior.then(task, task);
  queues.set(file, next.catch(() => {}));
  return next;
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = file + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function isDateClosed(dateKey) {
  // Restaurant is closed Mondays.
  const d = new Date(dateKey + "T00:00:00");
  return d.getDay() === 1;
}

function listBookings() {
  return readJson(BOOKINGS_FILE, []);
}

function activeGuestsFor(bookings, dateKey, time) {
  return bookings
    .filter((b) => b.dateKey === dateKey && b.time === time && b.status !== "cancelled")
    .reduce((sum, b) => sum + b.guests, 0);
}

function getAvailability(dateKey) {
  const bookings = listBookings();
  const closed = isDateClosed(dateKey);
  const slots = {};
  for (const time of VALID_TIMES) {
    const taken = closed ? MAX_SEATS_PER_SEATING : activeGuestsFor(bookings, dateKey, time);
    slots[time] = {
      capacity: MAX_SEATS_PER_SEATING,
      taken,
      remaining: Math.max(0, MAX_SEATS_PER_SEATING - taken),
    };
  }
  return { dateKey, closed, slots };
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

  return withFileLock(BOOKINGS_FILE, () => {
    const bookings = readJson(BOOKINGS_FILE, []);
    const taken = activeGuestsFor(bookings, dateKey, time);
    if (taken + guests > MAX_SEATS_PER_SEATING) {
      const err = new Error(
        "Only " + Math.max(0, MAX_SEATS_PER_SEATING - taken) + " seat(s) remain for that seating."
      );
      err.statusCode = 409;
      throw err;
    }

    const suffix = time === "8:30 PM" ? "B" : "A";
    const reference = "TRN-" + dateKey.replace(/-/g, "") + "-" + guests + suffix + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();

    const booking = {
      id: crypto.randomUUID(),
      reference,
      dateKey,
      time,
      guests,
      name,
      phone,
      notes,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    bookings.push(booking);
    writeJsonAtomic(BOOKINGS_FILE, bookings);
    return booking;
  });
}

async function updateBookingStatus(id, status) {
  if (!["pending", "confirmed", "cancelled"].includes(status)) {
    const err = new Error("Invalid status.");
    err.statusCode = 400;
    throw err;
  }
  return withFileLock(BOOKINGS_FILE, () => {
    const bookings = readJson(BOOKINGS_FILE, []);
    const booking = bookings.find((b) => b.id === id);
    if (!booking) {
      const err = new Error("Booking not found.");
      err.statusCode = 404;
      throw err;
    }
    booking.status = status;
    booking.updatedAt = new Date().toISOString();
    writeJsonAtomic(BOOKINGS_FILE, bookings);
    return booking;
  });
}

function getSiteContent() {
  return readJson(SITE_CONTENT_FILE, { images: {} });
}

async function setSiteImage(key, url) {
  return withFileLock(SITE_CONTENT_FILE, () => {
    const content = readJson(SITE_CONTENT_FILE, { images: {} });
    content.images = content.images || {};
    content.images[key] = url;
    writeJsonAtomic(SITE_CONTENT_FILE, content);
    return content;
  });
}

module.exports = {
  MAX_SEATS_PER_SEATING,
  VALID_TIMES,
  isDateClosed,
  listBookings,
  getAvailability,
  createBooking,
  updateBookingStatus,
  getSiteContent,
  setSiteImage,
};
