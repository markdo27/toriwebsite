"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const store = require("../store");
const { checkCredentials, requireAdmin } = require("../auth");

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const ALLOWED_IMAGE_KEYS = [
  "hero",
  "craftMain",
  "craftGallery1",
  "craftGallery2",
  "craftGallery3",
  "craftGallery4",
  "craftGallery5",
];
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, crypto.randomUUID() + ext);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WebP, or AVIF images are allowed."));
    }
    cb(null, true);
  },
});

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
  req.session.isAdmin = true;
  req.session.username = username;
  res.json({ ok: true });
});

// POST /api/admin/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/admin/me
router.get("/me", (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

// GET /api/admin/bookings
router.get("/bookings", requireAdmin, (req, res) => {
  const bookings = store.listBookings().sort((a, b) => (a.dateKey + a.time).localeCompare(b.dateKey + b.time));
  res.json({ bookings, maxSeats: store.MAX_SEATS_PER_SEATING });
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
router.get("/photos", requireAdmin, (req, res) => {
  const content = store.getSiteContent();
  res.json({ images: content.images || {}, keys: ALLOWED_IMAGE_KEYS });
});

// POST /api/admin/photos  (multipart form: field "image", body field "key")
router.post("/photos", requireAdmin, upload.single("image"), async (req, res) => {
  const key = req.body && req.body.key;
  if (!ALLOWED_IMAGE_KEYS.includes(key)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Unknown image slot: " + key });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image file was uploaded." });
  }

  try {
    const content = store.getSiteContent();
    const previousUrl = content.images && content.images[key];

    const url = "/uploads/" + req.file.filename;
    await store.setSiteImage(key, url);

    if (previousUrl && previousUrl.startsWith("/uploads/")) {
      const previousPath = path.join(UPLOADS_DIR, path.basename(previousUrl));
      fs.unlink(previousPath, () => {});
    }

    res.json({ key, url });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: "Could not save image." });
  }
});

// DELETE /api/admin/photos/:key — revert a slot back to the placeholder
router.delete("/photos/:key", requireAdmin, async (req, res) => {
  const key = req.params.key;
  if (!ALLOWED_IMAGE_KEYS.includes(key)) {
    return res.status(400).json({ error: "Unknown image slot: " + key });
  }
  const content = store.getSiteContent();
  const previousUrl = content.images && content.images[key];
  await store.setSiteImage(key, null);
  if (previousUrl && previousUrl.startsWith("/uploads/")) {
    fs.unlink(path.join(UPLOADS_DIR, path.basename(previousUrl)), () => {});
  }
  res.json({ key, url: null });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message || "Upload failed." });
  }
  next();
});

module.exports = router;
