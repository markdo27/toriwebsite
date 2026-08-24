"use strict";

const express = require("express");
const store = require("../store");
const { sendBookingNotification } = require("../mailer");

const router = express.Router();

function isValidDateKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// GET /api/availability?start=YYYY-MM-DD&days=21
router.get("/availability", async (req, res, next) => {
  const start = req.query.start;
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 21));

  if (!isValidDateKey(start)) {
    return res.status(400).json({ error: "start must be a YYYY-MM-DD date." });
  }

  try {
    const base = new Date(start + "T00:00:00");
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      const dateKey =
        d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      dates.push(await store.getAvailability(dateKey));
    }
    res.json({ start, days, maxSeats: await store.getDefaultMaxGuests(), dates });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings
router.post("/bookings", async (req, res) => {
  const { dateKey, time, guests, name, phone, notes } = req.body || {};

  if (!isValidDateKey(dateKey)) {
    return res.status(400).json({ error: "dateKey must be a YYYY-MM-DD date." });
  }

  try {
    const booking = await store.createBooking({ dateKey, time, guests, name, phone, notes });

    // Awaited on purpose: a serverless function can be frozen the instant the
    // response is sent, which would silently kill a fire-and-forget send.
    await sendBookingNotification(booking).catch(() => {});

    res.status(201).json({
      id: booking.id,
      reference: booking.reference,
      dateKey: booking.dateKey,
      time: booking.time,
      guests: booking.guests,
      status: booking.status,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Could not create booking." });
  }
});

module.exports = router;
