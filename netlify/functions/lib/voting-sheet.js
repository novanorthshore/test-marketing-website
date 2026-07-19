const { createHmac } = require("crypto");
const { getSheetsClient, requiredEnv } = require("./google-auth");
const { VOTING_CATEGORIES } = require("./vote-config");

const VOTE_COLUMNS = [
  "Timestamp",
  "Ballot ID",
  "Phone Hash",
  ...VOTING_CATEGORIES.flatMap((category) => [
    `${category.label} ID`,
    `${category.label} Car`,
  ]),
  "User Agent",
];

const COL = {
  timestamp: 0,
  ballotId: 1,
  phoneHash: 2,
  userAgent: VOTE_COLUMNS.length - 1,
};

const LAST_COLUMN_LETTER = String.fromCharCode(64 + VOTE_COLUMNS.length);

const getVotesTab = () => process.env.GOOGLE_VOTES_SHEET_TAB || "Votes";

const votesRange = (a1Range) => {
  const escapedTab = getVotesTab().replace(/'/g, "''");
  return `'${escapedTab}'!${a1Range}`;
};

const ensureVotesTabExists = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const tabName = getVotesTab();
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

const ensureVoteHeaders = async () => {
  await ensureVotesTabExists();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: votesRange("1:1"),
  });

  if (current.data.values && current.data.values.length > 0 && current.data.values[0].length > 0) {
    const existing = current.data.values[0].map((value) => String(value || "").trim());
    const matches = VOTE_COLUMNS.length === existing.length
      && VOTE_COLUMNS.every((header, index) => header === existing[index]);
    if (matches) {
      return;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: votesRange(`A1:${LAST_COLUMN_LETTER}1`),
    valueInputOption: "RAW",
    requestBody: {
      values: [VOTE_COLUMNS],
    },
  });
};

const getVoteRows = async () => {
  await ensureVotesTabExists();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: votesRange(`A:${LAST_COLUMN_LETTER}`),
  });

  return response.data.values || [];
};

const hashPhone = (phoneE164) => {
  const secret = requiredEnv("VOTE_PHONE_HASH_SECRET");
  return createHmac("sha256", secret).update(String(phoneE164 || "").trim()).digest("hex");
};

const hasPhoneVoted = async (phoneE164) => {
  const phoneHash = hashPhone(phoneE164);
  const rows = await getVoteRows();

  return rows.some((values, index) => (
    index > 0 && String(values[COL.phoneHash] || "").trim() === phoneHash
  ));
};

const buildBallotRow = ({
  ballotId,
  phoneHash,
  selections,
  carLabelsById,
  userAgent,
}) => {
  const row = new Array(VOTE_COLUMNS.length).fill("");

  row[COL.timestamp] = new Date().toISOString();
  row[COL.ballotId] = ballotId;
  row[COL.phoneHash] = phoneHash;
  row[COL.userAgent] = String(userAgent || "").slice(0, 240);

  VOTING_CATEGORIES.forEach((category, index) => {
    const applicationId = selections[category.id] || "";
    const idColumn = 3 + (index * 2);
    const carColumn = idColumn + 1;
    row[idColumn] = applicationId;
    row[carColumn] = carLabelsById[applicationId] || "";
  });

  return row;
};

const appendBallot = async ({
  ballotId,
  phoneE164,
  selections,
  carLabelsById,
  userAgent,
}) => {
  await ensureVoteHeaders();

  // Check-then-write can race under heavy concurrency; acceptable for show-day scale.
  if (await hasPhoneVoted(phoneE164)) {
    const error = new Error("This phone number has already voted.");
    error.code = "ALREADY_VOTED";
    throw error;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const rows = await getVoteRows();
  const nextRowNumber = Math.max(rows.length + 1, 2);
  const phoneHash = hashPhone(phoneE164);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: votesRange(`A${nextRowNumber}:${LAST_COLUMN_LETTER}${nextRowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [buildBallotRow({
        ballotId,
        phoneHash,
        selections,
        carLabelsById,
        userAgent,
      })],
    },
  });

  return { ballotId, phoneHash };
};

module.exports = {
  VOTE_COLUMNS,
  appendBallot,
  hasPhoneVoted,
  hashPhone,
};
