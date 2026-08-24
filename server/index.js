"use strict";

const app = require("./app");

const PORT = Number(process.env.PORT) || 5183;

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[server] SESSION_SECRET is not set in .env — admin login will fail until it is."
  );
}
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  console.warn(
    "[server] POSTGRES_URL is not set in .env — bookings and photo state will fail to load. " +
      "See README.md for local setup."
  );
}

app.listen(PORT, () => {
  console.log("Torinoa server running at http://localhost:" + PORT);
  console.log("Admin dashboard at http://localhost:" + PORT + "/admin");
});
