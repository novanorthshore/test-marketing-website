/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const envPath = path.join(__dirname, "..", ".env");
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

const { getDriveClient } = require("../netlify/functions/lib/google-auth");

const run = async () => {
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  console.log("Service account:", serviceAccount);
  console.log("Drive folder ID:", folderId || "(missing)");

  const projectId = serviceAccount?.split("@")[1]?.split(".")[0];
  console.log("Expected GCP project ID from service account:", projectId);
  console.log("");
  console.log("Enable Drive API in THIS project:");
  console.log(`https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${projectId}`);
  console.log("");

  const drive = await getDriveClient();
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  const file = await drive.files.create({
    requestBody: {
      name: "nova-drive-test.png",
      parents: [folderId],
    },
    media: {
      mimeType: "image/png",
      body: Readable.from(tinyPng),
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  console.log("SUCCESS: uploaded test file");
  console.log("File ID:", file.data.id);
  console.log("View URL:", file.data.webViewLink);
};

run().catch((error) => {
  console.error("FAILED:", error.message);
  if (error.errors?.[0]?.message) {
    console.error("Detail:", error.errors[0].message);
  }
  process.exit(1);
});
