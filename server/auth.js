"use strict";

const bcrypt = require("bcryptjs");

function checkCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUser || !expectedHash) {
    return { ok: false, reason: "not_configured" };
  }
  if (username !== expectedUser) {
    return { ok: false, reason: "invalid" };
  }
  const ok = bcrypt.compareSync(String(password || ""), expectedHash);
  return ok ? { ok: true } : { ok: false, reason: "invalid" };
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Not authenticated." });
}

module.exports = { checkCredentials, requireAdmin };
