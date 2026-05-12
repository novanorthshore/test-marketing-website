const { google } = require("googleapis");

const SHEET_COLUMNS = [
  "Timestamp",
  "Payment Status",
  "Stripe Session ID",
  "Stripe Payment Intent ID",
  "RSVP Type",
  "Amount Paid",
  "Name",
  "Email",
  "Vehicle Year",
  "Vehicle Make",
  "Vehicle Model",
  "License Plate",
  "Instagram",
  "Photography Package",
  "Event Name",
  "Check-in Status",
  "Notes",
];

let sheetsClient;

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getSheetTab = () => process.env.GOOGLE_SHEET_TAB || "Confirmed RSVPs";

const sheetRange = (a1Range) => {
  const escapedTab = getSheetTab().replace(/'/g, "''");
  return `'${escapedTab}'!${a1Range}`;
};

const getSheetsClient = async () => {
  if (sheetsClient) {
    return sheetsClient;
  }

  const auth = new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
};

const ensureHeaders = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange("1:1"),
  });

  if (current.data.values && current.data.values.length > 0 && current.data.values[0].length > 0) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange("A1:Q1"),
    valueInputOption: "RAW",
    requestBody: {
      values: [SHEET_COLUMNS],
    },
  });
};

const getSessionRow = async (sessionId) => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange("A:Q"),
  });

  const rows = response.data.values || [];
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && row[2] === sessionId);

  if (index === -1) {
    return null;
  }

  return {
    rowNumber: index + 1,
    values: rows[index],
  };
};

const getConfirmedEmailRow = async (email, eventName) => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange("A:Q"),
  });

  const normalizedEmail = String(email || "").toLowerCase();
  const rows = response.data.values || [];
  const index = rows.findIndex((row, rowIndex) => {
    if (rowIndex === 0) {
      return false;
    }

    const paymentStatus = String(row[1] || "").toLowerCase();
    const rowEmail = String(row[7] || "").toLowerCase();
    const rowEventName = row[14] || "";
    return paymentStatus === "paid" && rowEmail === normalizedEmail && rowEventName === eventName;
  });

  if (index === -1) {
    return null;
  }

  return {
    rowNumber: index + 1,
    values: rows[index],
  };
};

const appendConfirmedRsvp = async (rowValues) => {
  await ensureHeaders();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetRange("A:Q"),
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [rowValues],
    },
  });
};

const markSessionNotes = async (sessionId, notes) => {
  const sessionRow = await getSessionRow(sessionId);
  if (!sessionRow) {
    return;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(`Q${sessionRow.rowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[notes]],
    },
  });
};

module.exports = {
  SHEET_COLUMNS,
  appendConfirmedRsvp,
  getConfirmedEmailRow,
  getSessionRow,
  markSessionNotes,
};
