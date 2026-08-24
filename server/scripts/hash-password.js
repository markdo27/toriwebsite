"use strict";

// Usage: npm run hash-password -- "your-new-password"
// Prints a bcrypt hash to paste into .env as ADMIN_PASSWORD_HASH.

const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your-new-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log("\nAdd this to your .env file:\n");
console.log("ADMIN_PASSWORD_HASH=" + hash);
console.log("");
