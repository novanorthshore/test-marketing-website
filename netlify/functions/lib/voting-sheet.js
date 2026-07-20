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
  "Email Hash",
  "Device Hash",
  "Verification Method",
  "Possible Duplicate",
  "Risk Score",
  "Risk Reasons",
  "Fingerprint Hash",
  "Network Hash",
];

const CATEGORY_COLUMNS_START = 3;
const USER_AGENT_COLUMN = CATEGORY_COLUMNS_START + (VOTING_CATEGORIES.length * 2);
const COL = {
  timestamp: 0,
  ballotId: 1,
  phoneHash: 2,
  userAgent: USER_AGENT_COLUMN,
  emailHash: USER_AGENT_COLUMN + 1,
  deviceHash: USER_AGENT_COLUMN + 2,
  verificationMethod: USER_AGENT_COLUMN + 3,
  possibleDuplicate: USER_AGENT_COLUMN + 4,
  riskScore: USER_AGENT_COLUMN + 5,
  riskReasons: USER_AGENT_COLUMN + 6,
  fingerprintHash: USER_AGENT_COLUMN + 7,
  networkHash: USER_AGENT_COLUMN + 8,
};

const LAST_COLUMN_LETTER = String.fromCharCode(64 + VOTE_COLUMNS.length);
const RESULTS_MARKER = "nova-voting-results-v3";
const TALLY_BLOCK_HEIGHT = 40;
const TALLY_START_ROW = 12;

let voteSheetReady = false;

const columnLetter = (columnIndex) => {
  let column = "";
  let index = columnIndex;

  while (index >= 0) {
    column = String.fromCharCode((index % 26) + 65) + column;
    index = Math.floor(index / 26) - 1;
  }

  return column;
};

const getVotesTab = () => process.env.GOOGLE_VOTES_SHEET_TAB || "Votes";
const getResultsTab = () => process.env.GOOGLE_RESULTS_SHEET_TAB || "Results";

const votesRange = (a1Range) => {
  const escapedTab = getVotesTab().replace(/'/g, "''");
  return `'${escapedTab}'!${a1Range}`;
};

const resultsRange = (a1Range) => {
  const escapedTab = getResultsTab().replace(/'/g, "''");
  return `'${escapedTab}'!${a1Range}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableSheetsError = (error) => {
  const status = Number(error?.code || error?.response?.status || 0);
  const message = String(error?.message || "");
  return status === 429
    || status === 500
    || status === 503
    || /quota exceeded|rate limit|backend error|internal error|timed out/i.test(message);
};

const withSheetsRetry = async (label, fn, { attempts = 5, baseDelayMs = 400 } = {}) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableSheetsError(error) || attempt === attempts) {
        throw error;
      }

      const delay = baseDelayMs * (2 ** (attempt - 1)) + Math.floor(Math.random() * 200);
      console.warn("Sheets retry", {
        label,
        attempt,
        delay,
        message: error.message,
      });
      await sleep(delay);
    }
  }

  throw lastError;
};

const ensureSheetTabExists = async (tabName) => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const metadata = await withSheetsRetry("spreadsheets.get tabs", () => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  }));

  const exists = (metadata.data.sheets || []).some(
    (sheet) => sheet.properties?.title === tabName
  );

  if (exists) {
    return;
  }

  await withSheetsRetry("addSheet", () => sheets.spreadsheets.batchUpdate({
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
  }));
};

const ensureVotesTabExists = async () => ensureSheetTabExists(getVotesTab());

const getVotesSheetId = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const tabName = getVotesTab();
  const metadata = await withSheetsRetry("spreadsheets.get sheetId", () => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  }));

  const match = (metadata.data.sheets || []).find(
    (sheet) => sheet.properties?.title === tabName
  );

  if (!match?.properties?.sheetId && match?.properties?.sheetId !== 0) {
    throw new Error(`Votes tab "${tabName}" was not found.`);
  }

  return match.properties.sheetId;
};

const buildResultsGrid = () => {
  const votesTab = getVotesTab().replace(/'/g, "''");
  const lastTallyRow = TALLY_START_ROW
    + (VOTING_CATEGORIES.length * TALLY_BLOCK_HEIGHT)
    - 1;
  const grid = Array.from({ length: lastTallyRow }, () => (
    ["", "", "", "", "", "", ""]
  ));

  grid[0] = ["Nova Block Party — Live Results", "", "", "", "", "", ""];
  grid[1] = [
    "Current leaders and full standings update automatically from the Votes tab.",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  grid[2] = ["", "", "", "", "", "", ""];
  grid[3] = [
    "CATEGORY",
    "1ST PLACE",
    "VOTES",
    "2ND PLACE",
    "VOTES",
    "3RD PLACE",
    "VOTES",
  ];

  VOTING_CATEGORIES.forEach((category, index) => {
    const tallyTitleRow = TALLY_START_ROW + (index * TALLY_BLOCK_HEIGHT);
    const tallyHeaderRow = tallyTitleRow + 1;
    const tallyFormulaRow = tallyTitleRow + 2;
    const tallyEndRow = tallyTitleRow + TALLY_BLOCK_HEIGHT - 2;
    const carColumnIndex = 3 + (index * 2) + 1;
    const carColumn = columnLetter(carColumnIndex);

    grid[4 + index] = [
      category.label,
      // Row 1 of QUERY output is headers ("Car" / "Votes"); row 2 is the leader.
      `=IFERROR(INDEX(A${tallyFormulaRow}:A${tallyEndRow},2),"Waiting for votes")`,
      `=IFERROR(INDEX(B${tallyFormulaRow}:B${tallyEndRow},2),"")`,
      `=IFERROR(INDEX(A${tallyFormulaRow}:A${tallyEndRow},3),"")`,
      `=IFERROR(INDEX(B${tallyFormulaRow}:B${tallyEndRow},3),"")`,
      `=IFERROR(INDEX(A${tallyFormulaRow}:A${tallyEndRow},4),"")`,
      `=IFERROR(INDEX(B${tallyFormulaRow}:B${tallyEndRow},4),"")`,
    ];

    grid[tallyTitleRow - 1] = [
      `${category.label} — full standings`,
      "",
      "",
      "",
      "",
      "",
      "",
    ];
    grid[tallyHeaderRow - 1] = ["", "", "", "", "", "", ""];
    grid[tallyFormulaRow - 1] = [
      `=IFERROR(QUERY('${votesTab}'!${carColumn}2:${carColumn},"select Col1, count(Col1) where Col1 is not null and Col1 <> '' group by Col1 order by count(Col1) desc label Col1 'Car', count(Col1) 'Votes'",0),"No votes yet")`,
      "",
      "",
      "",
      "",
      "",
      "",
    ];
  });

  return grid;
};

const ensureResultsSheet = async () => {
  await ensureSheetTabExists(getResultsTab());

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = await withSheetsRetry("results marker get", () => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: resultsRange("Z1"),
  }));

  const marker = String(current.data.values?.[0]?.[0] || "").trim();
  if (marker === RESULTS_MARKER) {
    return;
  }

  const grid = buildResultsGrid();
  const endRow = grid.length;

  await withSheetsRetry("results clear", () => sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: resultsRange(`A1:G${Math.max(endRow, 200)}`),
  }));

  await withSheetsRetry("results write", () => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: resultsRange(`A1:G${endRow}`),
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: grid,
    },
  }));

  await withSheetsRetry("results marker write", () => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: resultsRange("Z1"),
    valueInputOption: "RAW",
    requestBody: {
      values: [[RESULTS_MARKER]],
    },
  }));
};

const ensureVoteHeaders = async ({ force = false } = {}) => {
  if (voteSheetReady && !force) {
    return;
  }

  await ensureVotesTabExists();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = await withSheetsRetry("vote headers get", () => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: votesRange("1:1"),
  }));

  if (current.data.values && current.data.values.length > 0 && current.data.values[0].length > 0) {
    const existing = current.data.values[0].map((value) => String(value || "").trim());
    const matches = VOTE_COLUMNS.length === existing.length
      && VOTE_COLUMNS.every((header, index) => header === existing[index]);
    if (!matches) {
      await withSheetsRetry("vote headers update", () => sheets.spreadsheets.values.update({
        spreadsheetId,
        range: votesRange(`A1:${LAST_COLUMN_LETTER}1`),
        valueInputOption: "RAW",
        requestBody: {
          values: [VOTE_COLUMNS],
        },
      }));
    }
  } else {
    await withSheetsRetry("vote headers create", () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: votesRange(`A1:${LAST_COLUMN_LETTER}1`),
      valueInputOption: "RAW",
      requestBody: {
        values: [VOTE_COLUMNS],
      },
    }));
  }

  await ensureResultsSheet();
  voteSheetReady = true;
};

const getPhoneHashRows = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await withSheetsRetry("phone hashes get", () => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: votesRange("C:C"),
  }));

  return response.data.values || [];
};

const getBallotIdRows = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const response = await withSheetsRetry("ballot ids get", () => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: votesRange(`B:${LAST_COLUMN_LETTER}`),
  }));

  return response.data.values || [];
};

const hashPhone = (phoneE164) => {
  const secret = requiredEnv("VOTE_PHONE_HASH_SECRET");
  return createHmac("sha256", secret).update(String(phoneE164 || "").trim()).digest("hex");
};

const hasPhoneVoted = async (phoneE164) => {
  await ensureVoteHeaders();
  const phoneHash = hashPhone(phoneE164);
  const rows = await getPhoneHashRows();

  return rows.some((values, index) => (
    index > 0 && String(values[0] || "").trim() === phoneHash
  ));
};

const getEmailDeviceHashRows = async () => {
  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const emailColumn = columnLetter(COL.emailHash);
  const deviceColumn = columnLetter(COL.deviceHash);
  const response = await withSheetsRetry("email device hashes get", () => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: votesRange(`${emailColumn}:${deviceColumn}`),
  }));

  return response.data.values || [];
};

const hasEmailOrDeviceVoted = async ({ emailHash, deviceHash }) => {
  await ensureVoteHeaders();
  const rows = await getEmailDeviceHashRows();

  return rows.some((values, index) => (
    index > 0
    && (
      (emailHash && String(values[0] || "").trim() === emailHash)
      || (deviceHash && String(values[1] || "").trim() === deviceHash)
    )
  ));
};

const deleteVotesRows = async (rowNumbers) => {
  const uniqueDescending = [...new Set(rowNumbers)]
    .filter((rowNumber) => Number.isFinite(rowNumber) && rowNumber > 1)
    .sort((a, b) => b - a);

  if (!uniqueDescending.length) {
    return;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const sheetId = await getVotesSheetId();

  await withSheetsRetry("delete duplicate vote rows", () => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: uniqueDescending.map((rowNumber) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    },
  }));
};

const buildBallotRow = ({
  ballotId,
  phoneHash = "",
  emailHash = "",
  deviceHash = "",
  verificationMethod = "twilio",
  possibleDuplicate = false,
  riskScore = 0,
  riskReasons = "",
  fingerprintHash = "",
  networkHash = "",
  selections,
  carLabelsById,
  userAgent,
}) => {
  const row = new Array(VOTE_COLUMNS.length).fill("");

  row[COL.timestamp] = new Date().toISOString();
  row[COL.ballotId] = ballotId;
  row[COL.phoneHash] = phoneHash;
  row[COL.userAgent] = String(userAgent || "").slice(0, 240);
  row[COL.emailHash] = emailHash;
  row[COL.deviceHash] = deviceHash;
  row[COL.verificationMethod] = verificationMethod;
  row[COL.possibleDuplicate] = possibleDuplicate ? "YES" : "";
  row[COL.riskScore] = Number(riskScore || 0);
  row[COL.riskReasons] = String(riskReasons || "");
  row[COL.fingerprintHash] = fingerprintHash;
  row[COL.networkHash] = networkHash;

  VOTING_CATEGORIES.forEach((category, index) => {
    const applicationId = selections[category.id] || "";
    const idColumn = CATEGORY_COLUMNS_START + (index * 2);
    const carColumn = idColumn + 1;
    row[idColumn] = applicationId;
    row[carColumn] = carLabelsById[applicationId] || "";
  });

  return row;
};

const mirrorBallotToSheet = async ({
  ballotId,
  phoneE164 = "",
  emailHash = "",
  deviceHash = "",
  verificationMethod = "twilio",
  possibleDuplicate = false,
  riskScore = 0,
  riskReasons = "",
  fingerprintHash = "",
  networkHash = "",
  selections,
  carLabelsById,
  userAgent,
}) => {
  await ensureVoteHeaders();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const ballotRow = buildBallotRow({
    ballotId,
    phoneHash: phoneE164 ? hashPhone(phoneE164) : "",
    emailHash,
    deviceHash,
    verificationMethod,
    possibleDuplicate,
    riskScore,
    riskReasons,
    fingerprintHash,
    networkHash,
    selections,
    carLabelsById,
    userAgent,
  });

  await withSheetsRetry("mirror Redis ballot", () => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: votesRange(`A:${LAST_COLUMN_LETTER}`),
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [ballotRow],
    },
  }), { attempts: 2, baseDelayMs: 250 });
};

const syncRedisBallotsToSheet = async (ballots) => {
  await ensureVoteHeaders();

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const existingResponse = await withSheetsRetry(
    "get existing ballot ids for final sync",
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: votesRange("B:B"),
    })
  );
  const existingIds = new Set(
    (existingResponse.data.values || [])
      .slice(1)
      .map((values) => String(values[0] || "").trim())
      .filter(Boolean)
  );
  const missing = (Array.isArray(ballots) ? ballots : []).filter(
    (ballot) => ballot?.ballotId && !existingIds.has(String(ballot.ballotId))
  );

  if (!missing.length) {
    return {
      redisBallots: Array.isArray(ballots) ? ballots.length : 0,
      alreadyPresent: existingIds.size,
      added: 0,
    };
  }

  const rows = missing.map((ballot) => {
    const verificationMethod = ballot.verificationMethod === "email"
      ? "email"
      : "twilio";
    return buildBallotRow({
      ballotId: ballot.ballotId,
      phoneHash: verificationMethod === "twilio" ? ballot.identityHash : "",
      emailHash: verificationMethod === "email" ? ballot.identityHash : "",
      deviceHash: ballot.deviceHash || "",
      verificationMethod,
      possibleDuplicate: Boolean(ballot.possibleDuplicate),
      riskScore: ballot.riskScore || 0,
      riskReasons: ballot.riskReasons || "",
      fingerprintHash: ballot.fingerprintHash || "",
      networkHash: ballot.networkHash || "",
      selections: ballot.selections || {},
      carLabelsById: ballot.carLabelsById || {},
      userAgent: ballot.userAgent || "",
    });
  });

  await withSheetsRetry("append final Redis ballot sync", () => (
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: votesRange(`A:${LAST_COLUMN_LETTER}`),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    })
  ));

  return {
    redisBallots: Array.isArray(ballots) ? ballots.length : 0,
    alreadyPresent: existingIds.size,
    added: rows.length,
  };
};

/**
 * Append a ballot with concurrency-safe uniqueness:
 * 1) Fast pre-check
 * 2) Append (never overwrites another voter's row)
 * 3) Re-read hashes; keep earliest row for this identity/device, delete extras
 */
const appendBallot = async ({
  ballotId,
  phoneE164 = "",
  emailHash = "",
  deviceHash = "",
  verificationMethod = "twilio",
  possibleDuplicate = false,
  riskScore = 0,
  riskReasons = "",
  fingerprintHash = "",
  networkHash = "",
  selections,
  carLabelsById,
  userAgent,
}) => {
  await ensureVoteHeaders();

  const phoneHash = phoneE164 ? hashPhone(phoneE164) : "";

  const alreadyVoted = phoneE164
    ? await hasPhoneVoted(phoneE164)
    : await hasEmailOrDeviceVoted({ emailHash, deviceHash });

  if (alreadyVoted) {
    const error = new Error("This phone number has already voted.");
    error.code = "ALREADY_VOTED";
    throw error;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const ballotRow = buildBallotRow({
    ballotId,
    phoneHash,
    emailHash,
    deviceHash,
    verificationMethod,
    possibleDuplicate,
    riskScore,
    riskReasons,
    fingerprintHash,
    networkHash,
    selections,
    carLabelsById,
    userAgent,
  });

  await withSheetsRetry("append ballot", () => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: votesRange(`A:${LAST_COLUMN_LETTER}`),
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [ballotRow],
    },
  }));

  // Post-commit uniqueness: concurrent submits for the same identity can both append.
  const ballotRows = await getBallotIdRows();
  const matches = [];

  ballotRows.forEach((values, index) => {
    if (index === 0) {
      return;
    }

    const rowBallotId = String(values[0] || "").trim();
    const rowPhoneHash = String(values[1] || "").trim();
    // Range begins at B. Email/device are O/P in the sheet, so 13/14 here.
    const rowEmailHash = String(values[13] || "").trim();
    const rowDeviceHash = String(values[14] || "").trim();
    const identityMatches = (
      (phoneHash && rowPhoneHash === phoneHash)
      || (emailHash && rowEmailHash === emailHash)
      || (deviceHash && rowDeviceHash === deviceHash)
    );

    if (identityMatches) {
      matches.push({
        rowNumber: index + 1,
        ballotId: rowBallotId,
      });
    }
  });

  if (!matches.length) {
    // Extremely unlikely (read lag); treat as success — ballot was appended.
    return { ballotId, phoneHash, emailHash, deviceHash };
  }

  matches.sort((a, b) => a.rowNumber - b.rowNumber);
  const keeper = matches[0];
  const duplicates = matches.slice(1);

  if (duplicates.length) {
    await deleteVotesRows(duplicates.map((match) => match.rowNumber));
  }

  if (keeper.ballotId !== ballotId) {
    const error = new Error("This phone number has already voted.");
    error.code = "ALREADY_VOTED";
    throw error;
  }

  return { ballotId, phoneHash, emailHash, deviceHash };
};

module.exports = {
  VOTE_COLUMNS,
  appendBallot,
  ensureResultsSheet,
  ensureVoteHeaders,
  hasEmailOrDeviceVoted,
  hasPhoneVoted,
  hashPhone,
  mirrorBallotToSheet,
  syncRedisBallotsToSheet,
  withSheetsRetry,
  isRetryableSheetsError,
};
