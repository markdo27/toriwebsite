"use strict";

const nodemailer = require("nodemailer");

let transporter = null;
let warnedMissingConfig = false;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendBookingNotification(booking) {
  const ownerEmail = process.env.OWNER_EMAIL;
  const t = getTransporter();

  if (!t || !ownerEmail) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        "[mailer] SMTP_HOST/SMTP_USER/SMTP_PASS or OWNER_EMAIL not set in .env — " +
          "skipping email notifications. New bookings still land in the admin dashboard."
      );
    }
    return { sent: false, reason: "not_configured" };
  }

  const subject = "New reservation request — " + booking.reference;
  const lines = [
    "A new reservation request came in on the Torinoa website.",
    "",
    "Reference: " + booking.reference,
    "Date: " + booking.dateKey,
    "Seating: " + booking.time,
    "Guests: " + booking.guests,
    "Name: " + booking.name,
    "Phone: " + booking.phone,
    booking.notes ? "Notes: " + booking.notes : null,
    "",
    "Confirm or decline it from the admin dashboard at /admin.",
  ].filter(Boolean);

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: ownerEmail,
      subject,
      text: lines.join("\n"),
    });
    return { sent: true };
  } catch (err) {
    console.error("[mailer] Failed to send booking notification:", err.message);
    return { sent: false, reason: "send_failed", error: err.message };
  }
}

module.exports = { sendBookingNotification };
