const { getSheetsClient, requiredEnv } = require("./google-auth");
const { getEligibleVotingCategoryIds } = require("./vote-config");

const APPLICATION_COLUMNS = [
  "Timestamp",
  "Application ID",
  "Status",
  "Name",
  "Email",
  "Phone",
  "Vehicle Year",
  "Vehicle Make",
  "Vehicle Model",
  "License Plate",
  "Instagram",
  "Description",
  "Photo URL",
  "Drive File ID",
  "Car Number",
  "Category",
  "Display Zone",
  "Acceptance Email Sent",
  "Payment Status",
  "Stripe Session ID",
  "Notes",
  "Voting Category",
  "Modified",
  "Event Info Email Sent",
];

const COL = {
  timestamp: 0,
  applicationId: 1,
  status: 2,
  name: 3,
  email: 4,
  phone: 5,
  vehicleYear: 6,
  vehicleMake: 7,
  vehicleModel: 8,
  licensePlate: 9,
  instagram: 10,
  description: 11,
  photoUrl: 12,
  driveFileId: 13,
  carNumber: 14,
  category: 15,
  displayZone: 16,
  acceptanceEmailSent: 17,
  paymentStatus: 18,
  stripeSessionId: 19,
  notes: 20,
  votingCategory: 21,
  modified: 22,
  eventInfoEmailSent: 23,
};

const LAST_COLUMN_LETTER = "X";

const columnLetter = (columnIndex) => {
  let column = "";
  let index = columnIndex;

  while (index >= 0) {
    column = String.fromCharCode((index % 26) + 65) + column;
    index = Math.floor(index / 26) - 1;
  }

  return column;
};

const getApplicationsTab = () => process.env.GOOGLE_APPLICATIONS_SHEET_TAB || "Applications";

const applicationsRange = (a1Range) => {
  const escapedTab = getApplicationsTab().replace(/'/g, "''");
  return `'${escapedTab}'!${a1Range}`;
};

const ensureApplicationsTabExists = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const tabName = getApplicationsTab();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const exists = (metadata.data.sheets || []).some(
    (sheet) => sheet.properties?.title === tabName
  );

  if (exists) {
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
            },
          },
        },
      ],
    },
  });
};

const ensureApplicationHeaders = async () => {
  await ensureApplicationsTabExists();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: applicationsRange("1:1"),
  });

  const existing = (current.data.values && current.data.values[0]) || [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: applicationsRange(`A1:${LAST_COLUMN_LETTER}1`),
      valueInputOption: "RAW",
      requestBody: {
        values: [APPLICATION_COLUMNS],
      },
    });
    return;
  }

  // Fill blank trailing header cells (e.g. Voting Category / Event Info) without
  // overwriting any header the sheet already has.
  const nextHeaders = APPLICATION_COLUMNS.map((label, index) => (
    String(existing[index] || "").trim() || label
  ));
  const needsUpdate = nextHeaders.some((label, index) => (
    String(existing[index] || "").trim() !== label
  ));

  if (needsUpdate) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: applicationsRange(`A1:${LAST_COLUMN_LETTER}1`),
      valueInputOption: "RAW",
      requestBody: {
        values: [nextHeaders],
      },
    });
  }
};

const getApplicationRows = async () => {
  await ensureApplicationsTabExists();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: applicationsRange(`A:${LAST_COLUMN_LETTER}`),
  });

  return response.data.values || [];
};

const parseApplicationRow = (values, rowNumber) => ({
  rowNumber,
  timestamp: values[COL.timestamp] || "",
  applicationId: String(values[COL.applicationId] || "").trim(),
  status: String(values[COL.status] || "").trim(),
  name: values[COL.name] || "",
  email: String(values[COL.email] || "").trim(),
  phone: values[COL.phone] || "",
  vehicleYear: values[COL.vehicleYear] || "",
  vehicleMake: values[COL.vehicleMake] || "",
  vehicleModel: values[COL.vehicleModel] || "",
  licensePlate: values[COL.licensePlate] || "",
  instagram: values[COL.instagram] || "",
  description: values[COL.description] || "",
  photoUrl: values[COL.photoUrl] || "",
  driveFileId: values[COL.driveFileId] || "",
  carNumber: String(values[COL.carNumber] || "").trim(),
  category: String(values[COL.category] || "").trim(),
  displayZone: String(values[COL.displayZone] || "").trim(),
  acceptanceEmailSent: String(values[COL.acceptanceEmailSent] || "").trim(),
  paymentStatus: String(values[COL.paymentStatus] || "").trim(),
  stripeSessionId: String(values[COL.stripeSessionId] || "").trim(),
  notes: values[COL.notes] || "",
  votingCategory: String(values[COL.votingCategory] || values[COL.category] || "").trim(),
  modifiedFlag: String(values[COL.modified] || "").trim(),
  eventInfoEmailSent: String(values[COL.eventInfoEmailSent] || "").trim(),
});

const buildApplicationRow = ({ applicationId, application, photo, photoUploadFailed = false }) => {
  const row = new Array(APPLICATION_COLUMNS.length).fill("");

  row[COL.timestamp] = new Date().toISOString();
  row[COL.applicationId] = applicationId;
  row[COL.status] = "Pending";
  row[COL.name] = application.name;
  row[COL.email] = application.email;
  row[COL.phone] = application.phone;
  row[COL.vehicleYear] = application.vehicleYear;
  row[COL.vehicleMake] = application.vehicleMake;
  row[COL.vehicleModel] = application.vehicleModel;
  row[COL.licensePlate] = application.licensePlate;
  row[COL.instagram] = application.instagram || "";
  row[COL.description] = application.description || "";
  row[COL.photoUrl] = photo?.photoUrl || "";
  row[COL.driveFileId] = photo?.fileId || "";
  row[COL.notes] = photoUploadFailed
    ? "Submitted via show application form (photo upload failed — ask applicant for photo)"
    : "Submitted via show application form";

  return row;
};

const appendApplication = async ({ applicationId, application, photo, photoUploadFailed = false }) => {
  await ensureApplicationHeaders();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const rows = await getApplicationRows();
  const nextRowNumber = Math.max(rows.length + 1, 2);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: applicationsRange(`A${nextRowNumber}:${LAST_COLUMN_LETTER}${nextRowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [buildApplicationRow({ applicationId, application, photo, photoUploadFailed })],
    },
  });
};

const getApprovedUnsentApplications = async () => {
  await ensureApplicationHeaders();

  const rows = await getApplicationRows();

  return rows
    .map((values, index) => parseApplicationRow(values, index + 1))
    .filter((row, index) => (
      index > 0 &&
      row.applicationId &&
      row.status.toLowerCase() === "approved" &&
      !row.acceptanceEmailSent
    ));
};

const getApprovedUnsentEventInfoApplications = async () => {
  await ensureApplicationHeaders();

  const rows = await getApplicationRows();

  return rows
    .map((values, index) => parseApplicationRow(values, index + 1))
    .filter((row, index) => (
      index > 0 &&
      row.applicationId &&
      row.status.toLowerCase() === "approved" &&
      row.email &&
      !row.eventInfoEmailSent
    ));
};

const buildVehicleLabel = (application) => [
  application.vehicleYear,
  application.vehicleMake,
  application.vehicleModel,
].map((part) => String(part || "").trim()).filter(Boolean).join(" ");

const listApprovedVotingCars = async () => {
  // Fast path: one Sheets values.get — skip tab/header ensure (already set up in production).
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: applicationsRange(`A:${LAST_COLUMN_LETTER}`),
  });
  const rows = response.data.values || [];

  return rows
    .map((values, index) => parseApplicationRow(values, index + 1))
    .filter((row, index) => (
      index > 0 &&
      row.applicationId &&
      row.status.toLowerCase() === "approved" &&
      String(row.photoUrl || "").trim()
    ))
    .map((row) => {
      const votingCategory = String(row.votingCategory || row.category || "").trim();
      const modifiedFlag = String(row.modifiedFlag || "").trim();

      return {
        applicationId: row.applicationId,
        carNumber: row.carNumber || "",
        vehicleLabel: buildVehicleLabel(row),
        vehicleYear: String(row.vehicleYear || "").trim(),
        vehicleMake: String(row.vehicleMake || "").trim(),
        vehicleModel: String(row.vehicleModel || "").trim(),
        licensePlate: String(row.licensePlate || "").trim(),
        instagram: String(row.instagram || "").trim(),
        photoUrl: String(row.photoUrl || "").trim(),
        votingCategory,
        modifiedFlag,
        eligibleCategoryIds: getEligibleVotingCategoryIds({ votingCategory, modifiedFlag }),
      };
    })
    .sort((a, b) => {
      const aNumber = Number.parseInt(a.carNumber, 10);
      const bNumber = Number.parseInt(b.carNumber, 10);
      const aHasNumber = Number.isFinite(aNumber);
      const bHasNumber = Number.isFinite(bNumber);

      if (aHasNumber && bHasNumber && aNumber !== bNumber) {
        return aNumber - bNumber;
      }

      if (aHasNumber !== bHasNumber) {
        return aHasNumber ? -1 : 1;
      }

      return a.vehicleLabel.localeCompare(b.vehicleLabel);
    });
};

const getApplicationById = async (applicationId) => {
  const normalizedId = String(applicationId || "").trim();
  if (!normalizedId) {
    return null;
  }

  const rows = await getApplicationRows();
  const index = rows.findIndex((values, rowIndex) => (
    rowIndex > 0 && String(values[COL.applicationId] || "").trim() === normalizedId
  ));

  if (index === -1) {
    return null;
  }

  return parseApplicationRow(rows[index], index + 1);
};

const setCellValue = async (rowNumber, columnIndex, value) => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: applicationsRange(`${columnLetter(columnIndex)}${rowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[value]],
    },
  });
};

const markAcceptanceEmailSent = async (applicationId, timestamp = new Date().toISOString()) => {
  const row = await getApplicationById(applicationId);
  if (!row) {
    return false;
  }

  await setCellValue(row.rowNumber, COL.acceptanceEmailSent, timestamp);
  return true;
};

const markEventInfoEmailSent = async (applicationId, timestamp = new Date().toISOString()) => {
  const row = await getApplicationById(applicationId);
  if (!row) {
    return false;
  }

  await setCellValue(row.rowNumber, COL.eventInfoEmailSent, timestamp);
  return true;
};

const markPaymentStatus = async (applicationId, status, sessionId) => {
  const row = await getApplicationById(applicationId);
  if (!row) {
    return false;
  }

  await setCellValue(row.rowNumber, COL.paymentStatus, status);

  if (sessionId) {
    await setCellValue(row.rowNumber, COL.stripeSessionId, sessionId);
  }

  return true;
};

const ROW_COLORS = {
  green: { red: 198 / 255, green: 239 / 255, blue: 206 / 255 },
  red: { red: 255 / 255, green: 199 / 255, blue: 206 / 255 },
  white: { red: 1, green: 1, blue: 1 },
};

let cachedApplicationsSheetId = null;

const getApplicationsSheetId = async () => {
  if (cachedApplicationsSheetId !== null) {
    return cachedApplicationsSheetId;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const tabName = getApplicationsTab();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });

  const sheet = (metadata.data.sheets || []).find(
    (entry) => entry.properties?.title === tabName
  );

  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Applications tab "${tabName}" not found.`);
  }

  cachedApplicationsSheetId = sheet.properties.sheetId;
  return cachedApplicationsSheetId;
};

const setRowBackgroundColor = async (rowNumber, color) => {
  if (rowNumber < 2) {
    return;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const sheetId = await getApplicationsSheetId();

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowNumber - 1,
              endRowIndex: rowNumber,
              startColumnIndex: 0,
              endColumnIndex: APPLICATION_COLUMNS.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: color,
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    },
  });
};

const syncApplicationRowColor = async (application) => {
  if (!application?.rowNumber || application.rowNumber < 2) {
    return;
  }

  const status = String(application.status || "").trim().toLowerCase();
  const paymentStatus = String(application.paymentStatus || "").trim().toLowerCase();

  if (status === "approved" && (paymentStatus === "paid" || paymentStatus === "free")) {
    await setRowBackgroundColor(application.rowNumber, ROW_COLORS.green);
    return;
  }

  if (status === "approved") {
    await setRowBackgroundColor(application.rowNumber, ROW_COLORS.red);
    return;
  }

  await setRowBackgroundColor(application.rowNumber, ROW_COLORS.white);
};

const syncAllApplicationRowColors = async () => {
  await ensureApplicationHeaders();

  const rows = await getApplicationRows();

  for (let index = 1; index < rows.length; index += 1) {
    const application = parseApplicationRow(rows[index], index + 1);
    if (!application.applicationId) {
      continue;
    }

    await syncApplicationRowColor(application);
  }
};

module.exports = {
  APPLICATION_COLUMNS,
  appendApplication,
  getApplicationById,
  getApprovedUnsentApplications,
  getApprovedUnsentEventInfoApplications,
  listApprovedVotingCars,
  markAcceptanceEmailSent,
  markEventInfoEmailSent,
  markPaymentStatus,
  syncApplicationRowColor,
  syncAllApplicationRowColors,
};
