const { google } = require("googleapis");

let authClient;

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getAuthClient = async () => {
  if (authClient) {
    return authClient;
  }

  authClient = new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  await authClient.authorize();
  return authClient;
};

const getSheetsClient = async () => {
  const auth = await getAuthClient();
  return google.sheets({ version: "v4", auth });
};

const getDriveClient = async () => {
  const auth = await getAuthClient();
  return google.drive({ version: "v3", auth });
};

module.exports = {
  getAuthClient,
  getDriveClient,
  getSheetsClient,
  requiredEnv,
};
