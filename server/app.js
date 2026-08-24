"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");

const store = require("./store");
const bookingsRouter = require("./routes/bookings");
const adminRouter = require("./routes/admin");

const ROOT = path.join(__dirname, "..");

const app = express();

app.use(express.json());

// Public, unauthenticated read of current site image URLs (used by index.html).
app.get("/api/site-content", async (req, res, next) => {
  try {
    res.json(await store.getSiteContent());
  } catch (err) {
    next(err);
  }
});

app.use("/api", bookingsRouter);
app.use("/api/admin", adminRouter);

// Static files (only reached locally via `node server/index.js` — on Vercel,
// these paths are served directly by the platform's static hosting and never
// hit this function at all, see vercel.json).
app.use("/admin", express.static(path.join(ROOT, "admin")));
app.use(express.static(ROOT, { index: "index.html" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

module.exports = app;
