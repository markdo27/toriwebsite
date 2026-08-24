"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");

const store = require("./store");
const bookingsRouter = require("./routes/bookings");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = Number(process.env.PORT) || 5183;
const ROOT = path.join(__dirname, "..");

// data/ and uploads/ hold runtime state that's git-ignored (bookings contain
// guest PII; uploads are user-supplied). A fresh clone won't have them, so
// create them on boot rather than failing the first write.
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "uploads"), { recursive: true });

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[server] SESSION_SECRET is not set in .env — using a random secret for this run " +
      "(admin sessions will not survive a server restart)."
  );
}

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || require("crypto").randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12, // 12 hours
    },
  })
);

// Public, unauthenticated read of current site image URLs (used by index.html).
app.get("/api/site-content", (req, res) => {
  res.json(store.getSiteContent());
});

app.use("/api", bookingsRouter);
app.use("/api/admin", adminRouter);

app.use("/uploads", express.static(path.join(ROOT, "uploads")));
app.use("/admin", express.static(path.join(ROOT, "admin")));
app.use(express.static(ROOT, { index: "index.html" }));

app.listen(PORT, () => {
  console.log("Torinoa server running at http://localhost:" + PORT);
  console.log("Admin dashboard at http://localhost:" + PORT + "/admin");
});
