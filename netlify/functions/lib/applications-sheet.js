const { getSheetsClient, requiredEnv } = require("./google-auth");
const { getEligibleVotingCategoryIds } = require("./vote-config");
const { createHash } = require("crypto");

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
  "Registration Type",
  "Asking Price",
  "Mileage",
  "Transmission",
  "Drivetrain",
  "Major Modifications",
  "Listing Description",
  "Known Issues",
  "Marketplace Display Name",
  "Public Contact Methods",
  "Marketplace Listing Status",
  "Marketplace Photo 2 URL",
  "Marketplace Photo 3 URL",
  "Marketplace Photo 4 URL",
  "Marketplace Photo 5 URL",
  "Payment Confirmation Session ID",
  "Payment Confirmation Payload",
  "Payment Confirmation Email Sent",
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
  registrationType: 24,
  askingPrice: 25,
  mileage: 26,
  transmission: 27,
  drivetrain: 28,
  majorModifications: 29,
  listingDescription: 30,
  knownIssues: 31,
  marketplaceDisplayName: 32,
  publicContactMethods: 33,
  marketplaceListingStatus: 34,
  marketplacePhoto2Url: 35,
  marketplacePhoto3Url: 36,
  marketplacePhoto4Url: 37,
  marketplacePhoto5Url: 38,
  paymentConfirmationSessionId: 39,
  paymentConfirmationPayload: 40,
  paymentConfirmationEmailSent: 41,
};

const LAST_COLUMN_LETTER = "AP";
const FINALE_REGISTRATION_TYPES = new Set(["showCar", "marketplace", "vipParking"]);
const FINALE_TAB_DEFAULT = "Finale Applications";

const columnLetter = (columnIndex) => {
  let column = "";
  let index = columnIndex;

  while (index >= 0) {
    column = String.fromCharCode((index % 26) + 65) + column;
    index = Math.floor(index / 26) - 1;
  }

  return column;
};

const getTabName = (kind = "default") => {
  if (kind === "finale") {
    return process.env.GOOGLE_FINALE_APPLICATIONS_SHEET_TAB || FINALE_TAB_DEFAULT;
  }

  return process.env.GOOGLE_APPLICATIONS_SHEET_TAB || "Applications";
};

const getApplicationsTab = () => getTabName("default");

const sheetKindForApplication = (application = {}) => (
  FINALE_REGISTRATION_TYPES.has(String(application.registrationType || "").trim())
    ? "finale"
    : "default"
);

const applicationsRange = (a1Range, kind = "default") => {
  const escapedTab = getTabName(kind).replace(/'/g, "''");
  return `'${escapedTab}'!${a1Range}`;
};

const getSpreadsheetSheets = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "spreadsheetId,sheets.properties(sheetId,title,gridProperties)",
  });

  return {
    sheetsClient: sheets,
    spreadsheetId,
    tabs: metadata.data.sheets || [],
  };
};

const ensureApplicationsTabExists = async (kind = "default") => {
  const { sheetsClient, spreadsheetId, tabs } = await getSpreadsheetSheets();
  const tabName = getTabName(kind);
  const existing = tabs.find((sheet) => sheet.properties?.title === tabName);

  if (existing) {
    if (existing.properties.gridProperties.columnCount < APPLICATION_COLUMNS.length) {
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: {
                sheetId: existing.properties.sheetId,
                gridProperties: { columnCount: APPLICATION_COLUMNS.length },
              },
              fields: "gridProperties.columnCount",
            },
          }],
        },
      });
    }
    return;
  }

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: { columnCount: APPLICATION_COLUMNS.length },
            },
          },
        },
      ],
    },
  });
};

const ensureApplicationHeaders = async (kind = "default") => {
  await ensureApplicationsTabExists(kind);

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: applicationsRange("1:1", kind),
  });

  const existing = (current.data.values && current.data.values[0]) || [];

  // Never repurpose a user's custom column for receipt state.
  for (let index = COL.paymentConfirmationSessionId; index < APPLICATION_COLUMNS.length; index += 1) {
    const header = String(existing[index] || "").trim();
    if (header && header !== APPLICATION_COLUMNS[index]) {
      throw new Error(`Receipt column ${columnLetter(index)} in ${getTabName(kind)} is already in use.`);
    }
  }

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: applicationsRange(`A1:${LAST_COLUMN_LETTER}1`, kind),
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
    String(existing[index] || "").trim() ? existing[index] : label
  ));
  const needsUpdate = nextHeaders.some((label, index) => (
    (existing[index] || "") !== label
  ));

  if (needsUpdate) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: applicationsRange(`A1:${LAST_COLUMN_LETTER}1`, kind),
      valueInputOption: "RAW",
      requestBody: {
        values: [nextHeaders],
      },
    });
  }
};

const getApplicationRows = async (kind = "default") => {
  const { sheetsClient, spreadsheetId, tabs } = await getSpreadsheetSheets();
  const tabName = getTabName(kind);
  const tab = tabs.find((sheet) => sheet.properties?.title === tabName);

  if (!tab) {
    return [];
  }

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: applicationsRange(`A:${columnLetter(Math.min(
      tab.properties.gridProperties.columnCount, APPLICATION_COLUMNS.length,
    ) - 1)}`, kind),
  });

  return response.data.values || [];
};

const parseApplicationRow = (values, rowNumber, kind = "default") => ({
  rowNumber,
  sheetKind: kind,
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
  paymentConfirmationSessionId: String(values[COL.paymentConfirmationSessionId] || "").trim(),
  paymentConfirmationPayload: String(values[COL.paymentConfirmationPayload] || ""),
  paymentConfirmationEmailSent: String(values[COL.paymentConfirmationEmailSent] || "").trim(),
  notes: values[COL.notes] || "",
  votingCategory: String(values[COL.votingCategory] || values[COL.category] || "").trim(),
  modifiedFlag: String(values[COL.modified] || "").trim(),
  eventInfoEmailSent: String(values[COL.eventInfoEmailSent] || "").trim(),
  registrationType: String(values[COL.registrationType] || "").trim(),
  askingPrice: String(values[COL.askingPrice] || "").trim(),
  mileage: String(values[COL.mileage] || "").trim(),
  transmission: String(values[COL.transmission] || "").trim(),
  drivetrain: String(values[COL.drivetrain] || "").trim(),
  majorModifications: String(values[COL.majorModifications] || "").trim(),
  listingDescription: String(values[COL.listingDescription] || "").trim(),
  knownIssues: String(values[COL.knownIssues] || "").trim(),
  marketplaceDisplayName: String(values[COL.marketplaceDisplayName] || "").trim(),
  publicContactMethods: String(values[COL.publicContactMethods] || "").trim(),
  marketplaceListingStatus: String(values[COL.marketplaceListingStatus] || "").trim(),
  marketplacePhotoUrls: [
    values[COL.photoUrl],
    values[COL.marketplacePhoto2Url],
    values[COL.marketplacePhoto3Url],
    values[COL.marketplacePhoto4Url],
    values[COL.marketplacePhoto5Url],
  ].map((value) => String(value || "").trim()).filter(Boolean),
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
  row[COL.registrationType] = application.registrationType || "";
  row[COL.askingPrice] = application.askingPrice || "";
  row[COL.mileage] = application.mileage || "";
  row[COL.transmission] = application.transmission || "";
  row[COL.drivetrain] = application.drivetrain || "";
  row[COL.majorModifications] = application.majorModifications || "";
  row[COL.listingDescription] = application.listingDescription || "";
  row[COL.knownIssues] = application.knownIssues || "";
  row[COL.marketplaceDisplayName] = application.marketplaceDisplayName || "";
  row[COL.publicContactMethods] = (application.publicContactMethods || []).join(",");
  row[COL.marketplaceListingStatus] = application.registrationType === "marketplace" ? "Draft" : "";
  row[COL.marketplacePhoto2Url] = application.marketplacePhotoUrls?.[1]?.photoUrl || "";
  row[COL.marketplacePhoto3Url] = application.marketplacePhotoUrls?.[2]?.photoUrl || "";
  row[COL.marketplacePhoto4Url] = application.marketplacePhotoUrls?.[3]?.photoUrl || "";
  row[COL.marketplacePhoto5Url] = application.marketplacePhotoUrls?.[4]?.photoUrl || "";
  row[COL.notes] = photoUploadFailed
    ? "Submitted via show application form (photo upload failed — ask applicant for photo)"
    : "Submitted via show application form";

  return row;
};

const appendApplication = async ({ applicationId, application, photo, photoUploadFailed = false }) => {
  const kind = sheetKindForApplication(application);
  await ensureApplicationHeaders(kind);

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const rows = await getApplicationRows(kind);
  const nextRowNumber = Math.max(rows.length + 1, 2);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: applicationsRange(`A${nextRowNumber}:${LAST_COLUMN_LETTER}${nextRowNumber}`, kind),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [buildApplicationRow({ applicationId, application, photo, photoUploadFailed })],
    },
  });
};

const listApplications = async (kind) => {
  if (kind === "default") {
    await ensureApplicationHeaders(kind);
  }

  const rows = await getApplicationRows(kind);

  return rows
    .map((values, index) => parseApplicationRow(values, index + 1, kind))
    .filter((row, index) => index > 0 && row.applicationId);
};

const getApprovedUnsentApplications = async () => {
  const [finaleRows, defaultRows] = await Promise.all([
    listApplications("finale"),
    listApplications("default"),
  ]);

  return [...finaleRows, ...defaultRows].filter((row) => (
    row.status.toLowerCase() === "approved" &&
    !row.acceptanceEmailSent
  ));
};

const getApprovedUnsentEventInfoApplications = async () => {
  const rows = await listApplications("default");

  return rows.filter((row) => (
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
    range: applicationsRange(`A:${columnLetter(COL.marketplacePhoto5Url)}`),
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

const publicMarketplaceContact = (application) => {
  const allowed = new Set(String(application.publicContactMethods || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
  const contact = {};

  if (allowed.has("phone") && application.phone) contact.phone = application.phone;
  if (allowed.has("email") && application.email) contact.email = application.email;
  if (allowed.has("instagram") && application.instagram) contact.instagram = application.instagram;

  return contact;
};

const isPublishedMarketplaceListing = (row) => (
  row.registrationType.toLowerCase() === "marketplace" &&
  row.status.toLowerCase() === "approved" &&
  row.paymentStatus.toLowerCase() === "paid" &&
  row.marketplaceListingStatus.toLowerCase() === "published" &&
  row.marketplacePhotoUrls.length > 0
);

const toPublicMarketplaceListing = (row) => ({
  id: createHash("sha256").update(row.applicationId).digest("hex").slice(0, 16),
  vehicle: {
    year: String(row.vehicleYear || "").trim(),
    make: String(row.vehicleMake || "").trim(),
    model: String(row.vehicleModel || "").trim(),
  },
  askingPrice: row.askingPrice,
  mileage: row.mileage,
  transmission: row.transmission,
  drivetrain: row.drivetrain,
  modifications: row.majorModifications,
  knownIssues: row.knownIssues,
  story: row.listingDescription,
  seller: {
    name: row.marketplaceDisplayName,
    contact: publicMarketplaceContact(row),
  },
  photos: row.marketplacePhotoUrls,
  submittedAt: row.timestamp,
});

const listPublishedMarketplaceListings = async () => {
  const rows = await listApplications("finale");

  return rows
    .filter(isPublishedMarketplaceListing)
    .map(toPublicMarketplaceListing)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
};

const getApplicationById = async (applicationId) => {
  const normalizedId = String(applicationId || "").trim();
  if (!normalizedId) {
    return null;
  }

  for (const kind of ["finale", "default"]) {
    const rows = await getApplicationRows(kind);
    const index = rows.findIndex((values, rowIndex) => (
      rowIndex > 0 && String(values[COL.applicationId] || "").trim() === normalizedId
    ));

    if (index !== -1) {
      return parseApplicationRow(rows[index], index + 1, kind);
    }
  }

  return null;
};

const setCellValue = async (rowNumber, columnIndex, value, kind = "default") => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: applicationsRange(`${columnLetter(columnIndex)}${rowNumber}`, kind),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[value]],
    },
  });
};

const markAcceptanceEmailSent = async (
  applicationId,
  timestamp = new Date().toISOString(),
) => {
  const row = await getApplicationById(applicationId);
  if (!row) {
    return false;
  }

  await setCellValue(row.rowNumber, COL.acceptanceEmailSent, timestamp, row.sheetKind);
  return true;
};

const markEventInfoEmailSent = async (
  applicationId,
  timestamp = new Date().toISOString(),
) => {
  const row = await getApplicationById(applicationId);
  if (!row) {
    return false;
  }

  await setCellValue(row.rowNumber, COL.eventInfoEmailSent, timestamp, row.sheetKind);
  return true;
};

const markPaymentStatus = async (applicationId, status, sessionId) => {
  const row = await getApplicationById(applicationId);
  if (!row) {
    return false;
  }

  if (sessionId) {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: requiredEnv("GOOGLE_SHEET_ID"),
      range: applicationsRange(`S${row.rowNumber}:T${row.rowNumber}`, row.sheetKind),
      valueInputOption: "RAW",
      requestBody: { values: [[status, sessionId]] },
    });
  } else {
    await setCellValue(row.rowNumber, COL.paymentStatus, status, row.sheetKind);
  }

  return true;
};

const preparePaymentConfirmation = async (applicationId, sessionId, payload) => {
  const initialRow = await getApplicationById(applicationId);
  if (!initialRow) throw new Error(`Application ${applicationId} was not found.`);
  await ensureApplicationHeaders(initialRow.sheetKind);
  const row = await getApplicationById(applicationId);
  if (!row) throw new Error(`Application ${applicationId} was not found.`);

  if (row.paymentConfirmationSessionId && row.paymentConfirmationSessionId !== sessionId) {
    throw new Error(`Application ${applicationId} already has a receipt for another Stripe session.`);
  }
  if (row.paymentConfirmationSessionId === sessionId && row.paymentConfirmationPayload) {
    return {
      payload: JSON.parse(row.paymentConfirmationPayload),
      sent: Boolean(row.paymentConfirmationEmailSent),
    };
  }
  if (row.paymentConfirmationEmailSent || row.paymentConfirmationPayload) {
    throw new Error(`Application ${applicationId} has incomplete receipt tracking data.`);
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: requiredEnv("GOOGLE_SHEET_ID"),
    // A concurrent webhook may already have marked the receipt sent. Never clear it.
    range: applicationsRange(`AN${row.rowNumber}:AO${row.rowNumber}`, row.sheetKind),
    valueInputOption: "RAW",
    requestBody: { values: [[sessionId, JSON.stringify(payload)]] },
  });

  return { payload, sent: false };
};

const markPaymentConfirmationSent = async (applicationId, sessionId) => {
  const row = await getApplicationById(applicationId);
  if (!row || row.paymentConfirmationSessionId !== sessionId || !row.paymentConfirmationPayload) {
    throw new Error(`Receipt state changed for application ${applicationId}.`);
  }
  await setCellValue(row.rowNumber, COL.paymentConfirmationEmailSent, new Date().toISOString(), row.sheetKind);
};

const ROW_COLORS = {
  green: { red: 198 / 255, green: 239 / 255, blue: 206 / 255 },
  red: { red: 255 / 255, green: 199 / 255, blue: 206 / 255 },
  white: { red: 1, green: 1, blue: 1 },
};

const cachedSheetIds = {};

const getApplicationsSheetId = async (kind = "default") => {
  if (cachedSheetIds[kind] !== undefined) {
    return cachedSheetIds[kind];
  }

  const tabName = getTabName(kind);
  const { tabs } = await getSpreadsheetSheets();
  const sheet = tabs.find((entry) => entry.properties?.title === tabName);

  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Applications tab "${tabName}" not found.`);
  }

  cachedSheetIds[kind] = sheet.properties.sheetId;
  return cachedSheetIds[kind];
};

const setRowBackgroundColor = async (rowNumber, color, kind = "default") => {
  if (rowNumber < 2) {
    return;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const sheetId = await getApplicationsSheetId(kind);

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

  const kind = application.sheetKind || "default";

  if (status === "approved" && (paymentStatus === "paid" || paymentStatus === "free")) {
    await setRowBackgroundColor(application.rowNumber, ROW_COLORS.green, kind);
    return;
  }

  if (status === "approved") {
    await setRowBackgroundColor(application.rowNumber, ROW_COLORS.red, kind);
    return;
  }

  await setRowBackgroundColor(application.rowNumber, ROW_COLORS.white, kind);
};

const syncAllApplicationRowColors = async () => {
  const applications = [
    ...(await listApplications("finale")),
    ...(await listApplications("default")),
  ];

  for (const application of applications) {
    await syncApplicationRowColor(application);
  }
};

const listValidation = (values) => ({
  condition: {
    type: "ONE_OF_LIST",
    values: values.map((value) => ({ userEnteredValue: value })),
  },
  showCustomUi: true,
  strict: true,
});

const applyFinaleSheetDesign = async (targetSheetId, sourceSheetId, sourceColumnCount) => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const requests = [];

  if (sourceSheetId || sourceSheetId === 0) {
    const copyThrough = Math.max(1, Math.min(sourceColumnCount || COL.registrationType, COL.registrationType));
    requests.push({
      copyPaste: {
        source: {
          sheetId: sourceSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: copyThrough,
        },
        destination: {
          sheetId: targetSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: copyThrough,
        },
        pasteType: "PASTE_FORMAT",
      },
    });
  }

  requests.push(
    {
      copyPaste: {
        source: {
          sheetId: targetSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        destination: {
          sheetId: targetSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: COL.registrationType,
          endColumnIndex: APPLICATION_COLUMNS.length,
        },
        pasteType: "PASTE_FORMAT",
      },
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: targetSheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: APPLICATION_COLUMNS.length,
          },
        },
      },
    },
    {
      setDataValidation: {
        range: {
          sheetId: targetSheetId,
          startRowIndex: 1,
          startColumnIndex: COL.status,
          endColumnIndex: COL.status + 1,
        },
        rule: listValidation(["Pending", "Approved", "Rejected", "Waitlist"]),
      },
    },
    {
      setDataValidation: {
        range: {
          sheetId: targetSheetId,
          startRowIndex: 1,
          startColumnIndex: COL.marketplaceListingStatus,
          endColumnIndex: COL.marketplaceListingStatus + 1,
        },
        rule: listValidation(["Draft", "Published", "Hidden", "Sold"]),
      },
    },
    {
      setDataValidation: {
        range: {
          sheetId: targetSheetId,
          startRowIndex: 1,
          startColumnIndex: COL.paymentStatus,
          endColumnIndex: COL.paymentStatus + 1,
        },
        rule: listValidation(["Paid", "Free"]),
      },
    },
    {
      setDataValidation: {
        range: {
          sheetId: targetSheetId,
          startRowIndex: 1,
          startColumnIndex: COL.registrationType,
          endColumnIndex: COL.registrationType + 1,
        },
        rule: listValidation(["showCar", "marketplace", "vipParking"]),
      },
    },
  );

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
};

const createFinaleApplicationsSheet = async () => {
  const targetName = getTabName("finale");
  const sourceName = getTabName("default");
  let { sheetsClient, spreadsheetId, tabs } = await getSpreadsheetSheets();
  const source = tabs.find((sheet) => sheet.properties?.title === sourceName);
  let target = tabs.find((sheet) => sheet.properties?.title === targetName);
  const existingRows = target ? await getApplicationRows("finale") : [];
  const hasData = existingRows.slice(1).some((row) => String(row[COL.applicationId] || "").trim());
  let duplicatedFrom = null;

  if (target && !hasData && source) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: target.properties.sheetId } }],
      },
    });
    target = null;
    cachedSheetIds.finale = undefined;
  }

  if (!target && source) {
    const duplicated = await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            duplicateSheet: {
              sourceSheetId: source.properties.sheetId,
              newSheetName: targetName,
            },
          },
        ],
      },
    });

    target = {
      properties: duplicated.data.replies?.[0]?.duplicateSheet?.properties,
    };
    duplicatedFrom = sourceName;
    cachedSheetIds.finale = target.properties.sheetId;

    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId,
      range: applicationsRange(`A2:${LAST_COLUMN_LETTER}`, "finale"),
    });
  }

  await ensureApplicationsTabExists("finale");

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: applicationsRange(`A1:${LAST_COLUMN_LETTER}1`, "finale"),
    valueInputOption: "RAW",
    requestBody: {
      values: [APPLICATION_COLUMNS],
    },
  });

  const sheetId = await getApplicationsSheetId("finale");
  await applyFinaleSheetDesign(
    sheetId,
    source?.properties?.sheetId,
    source?.properties?.gridProperties?.columnCount,
  );

  return {
    spreadsheetId,
    tabName: targetName,
    sheetId,
    duplicatedFrom,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
  };
};

module.exports = {
  APPLICATION_COLUMNS,
  appendApplication,
  createFinaleApplicationsSheet,
  getApplicationById,
  getApprovedUnsentApplications,
  getApprovedUnsentEventInfoApplications,
  listApprovedVotingCars,
  listPublishedMarketplaceListings,
  isPublishedMarketplaceListing,
  toPublicMarketplaceListing,
  markAcceptanceEmailSent,
  markEventInfoEmailSent,
  markPaymentStatus,
  preparePaymentConfirmation,
  markPaymentConfirmationSent,
  syncApplicationRowColor,
  syncAllApplicationRowColors,
};
