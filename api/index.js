"use strict";

// Vercel serverless entry point: the exact same Express app used for local
// dev (server/app.js), just handed to Vercel instead of app.listen()'d.
// See vercel.json for the rewrite that routes every /api/* request here.
module.exports = require("../server/app");
