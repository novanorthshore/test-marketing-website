/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");

  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, "\n");
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const { createFinaleApplicationsSheet } = require("../netlify/functions/lib/applications-sheet");

createFinaleApplicationsSheet()
  .then((result) => {
    console.log("Finale Applications tab is ready.");
    console.log("Tab:", result.tabName);
    if (result.duplicatedFrom) {
      console.log("Copied design from:", result.duplicatedFrom);
    }
    console.log("Open:", result.url);
  })
  .catch((error) => {
    console.error("FAILED:", error.message);
    process.exit(1);
  });
