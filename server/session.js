"use strict";

// Stateless admin auth: a signed cookie instead of server-side session
// storage. Serverless functions don't share memory between invocations (or
// even between two requests hitting the same warm instance in some cases),
// so anything server-memory-based like the old express-session MemoryStore
// silently breaks in that environment. An HMAC-signed cookie needs no shared
// state to verify — each request can validate itself.

const crypto = require("crypto");
const cookie = require("cookie");

const COOKIE_NAME = "tn_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET is not set in .env — required to sign admin login cookies.");
  }
  return s;
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function createSessionCookie(username) {
  const payload = JSON.stringify({ u: username, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(encoded);
  const value = encoded + "." + signature;
  return cookie.serialize(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

function clearSessionCookie() {
  return cookie.serialize(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function readSession(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  const value = parsed[COOKIE_NAME];
  if (!value) return null;

  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  let expected;
  try {
    expected = sign(encoded);
  } catch {
    return null;
  }
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;

  return { username: payload.u };
}

module.exports = { createSessionCookie, clearSessionCookie, readSession };
