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

const columnName = (columnIndex) => {
  let column = "";
  let index = columnIndex;

  while (index >= 0) {
    column = String.fromCharCode((index % 26) + 65) + column;
    index = Math.floor(index / 26) - 1;
  }

  return column;
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

const getSheetRows = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange("A:AE"),
  });

  return response.data.values || [];
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

const getStandardRowValues = (row) => ({
  paymentStatus: String(row[1] || "").trim().toLowerCase(),
  sessionId: row[2],
  email: String(row[7] || "").trim().toLowerCase(),
  eventName: String(row[14] || "").trim(),
  notes: row[16] || "",
  notesColumnIndex: 16,
});

const getShiftedRowValues = (row) => ({
  paymentStatus: String(row[15] || "").trim().toLowerCase(),
  sessionId: row[16],
  email: String(row[21] || "").trim().toLowerCase(),
  eventName: String(row[28] || "").trim(),
  notes: row[30] || "",
  notesColumnIndex: 30,
});

const getRecognizedRowLayouts = (row) => [
  getStandardRowValues(row),
  getShiftedRowValues(row),
];

const getSessionRow = async (sessionId) => {
  const rows = await getSheetRows();
  let matchingLayout = null;
  const index = rows.findIndex((row, rowIndex) => {
    if (rowIndex === 0) {
      return false;
    }

    matchingLayout = getRecognizedRowLayouts(row).find((layout) => layout.sessionId === sessionId) || null;
    return Boolean(matchingLayout);
  });

  if (index === -1) {
    return null;
  }

  return {
    rowNumber: index + 1,
    values: rows[index],
    layout: matchingLayout,
  };
};

const getConfirmedEmailRow = async (email, eventName) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const rows = await getSheetRows();
  const index = rows.findIndex((row, rowIndex) => {
    if (rowIndex === 0) {
      return false;
    }

    return getRecognizedRowLayouts(row).some((layout) => (
      layout.paymentStatus === "paid" &&
      layout.email === normalizedEmail &&
      layout.eventName === eventName
    ));
  });

  if (index === -1) {
    return null;
  }

  return {
    rowNumber: index + 1,
    values: rows[index],
  };
};

const getConfirmedRsvpCount = async (eventName) => {
  await ensureHeaders();

  const rows = await getSheetRows();
  return rows.filter((row, rowIndex) => {
    if (rowIndex === 0) {
      return false;
    }

    return getRecognizedRowLayouts(row).some((layout) => (
      layout.paymentStatus === "paid" && layout.eventName === eventName
    ));
  }).length;
};

const appendConfirmedRsvp = async (rowValues) => {
  await ensureHeaders();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const rows = await getSheetRows();
  const nextRowNumber = Math.max(rows.length + 1, 2);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(`A${nextRowNumber}:Q${nextRowNumber}`),
    valueInputOption: "USER_ENTERED",
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
  const notesColumn = columnName(sessionRow.layout?.notesColumnIndex || 16);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(`${notesColumn}${sessionRow.rowNumber}`),
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
  getConfirmedRsvpCount,
  getSessionRow,
  markSessionNotes,
};
