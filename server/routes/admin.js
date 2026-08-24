"use strict";

const express = require("express");
const multer = require("multer");
const { put, del } = require("@vercel/blob");
const store = require("../store");
const { checkCredentials, requireAdmin } = require("../auth");
const { createSessionCookie, clearSessionCookie, readSession } = require("../session");

const router = express.Router();

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WebP, or AVIF images are allowed."));
    }
    cb(null, true);
  },
});

function extFor(mimetype) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[mimetype] || "jpg";
}

// POST /api/admin/login
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const result = checkCredentials(username, password);
  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 401;
    const message =
      result.reason === "not_configured"
        ? "Admin login isn't configured yet. Set ADMIN_USERNAME and ADMIN_PASSWORD_HASH in .env."
        : "Incorrect username or password.";
    return res.status(status).json({ error: message });
  }
  res.setHeader("Set-Cookie", createSessionCookie(username));
  res.json({ ok: true });
});

// POST /api/admin/logout
router.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.json({ ok: true });
});

// GET /api/admin/me
router.get("/me", (req, res) => {
  res.json({ authenticated: !!readSession(req) });
});

// GET /api/admin/bookings
router.get("/bookings", requireAdmin, async (req, res, next) => {
  try {
    const bookings = await store.listBookings();
    res.json({ bookings, maxSeats: store.MAX_SEATS_PER_SEATING });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/bookings/:id  { status }
router.patch("/bookings/:id", requireAdmin, async (req, res) => {
  try {
    const booking = await store.updateBookingStatus(req.params.id, req.body && req.body.status);
    res.json({ booking });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Could not update booking." });
  }
});

// GET /api/admin/photos
router.get("/photos", requireAdmin, async (req, res, next) => {
  try {
    const content = await store.getSiteContent();
    res.json({ images: content.images || {}, keys: store.ALLOWED_IMAGE_KEYS });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/photos  (multipart form: field "image", body field "key")
router.post("/photos", requireAdmin, upload.single("image"), async (req, res) => {
  const key = req.body && req.body.key;
  if (!store.ALLOWED_IMAGE_KEYS.includes(key)) {
    return res.status(400).json({ error: "Unknown image slot: " + key });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image file was uploaded." });
  }

  try {
    const pathname = "torinoa/" + key + "-" + Date.now() + "." + extFor(req.file.mimetype);
    const blob = await put(pathname, req.file.buffer, {
      access: "public",
      contentType: req.file.mimetype,
      // Explicit on purpose: if more than one Blob store is ever connected to
      // this project, OIDC (store-ID-based) auth takes precedence over this
      // token by default, which can silently resolve to the wrong store.
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const { previousUrl } = await store.setSiteImage(key, blob.url);

    if (previousUrl) {
      del(previousUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {}); // best-effort cleanup, don't fail the request over it
    }

    res.json({ key, url: blob.url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not save image." });
  }
});

// DELETE /api/admin/photos/:key — revert a slot back to the placeholder
router.delete("/photos/:key", requireAdmin, async (req, res) => {
  const key = req.params.key;
  if (!store.ALLOWED_IMAGE_KEYS.includes(key)) {
    return res.status(400).json({ error: "Unknown image slot: " + key });
  }
  try {
    const { previousUrl } = await store.setSiteImage(key, null);
    if (previousUrl) {
      del(previousUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
    }
    res.json({ key, url: null });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not remove image." });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message || "Upload failed." });
  }
  next();
});

module.exports = router;
