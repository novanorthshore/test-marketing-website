const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");

const root = path.join(__dirname, "..", "netlify", "functions");
const config = require("../netlify/functions/lib/event-config");
const copy = (value) => JSON.parse(JSON.stringify(value));
const fixture = (overrides = {}) => ({
  applicationId: "app_test", name: "Test Attendee", email: "test@example.invalid",
  status: "Approved", paymentStatus: "", acceptanceEmailSent: "",
  stripeSessionId: "", registrationType: "showCar", rowNumber: 2,
  sheetKind: "finale", vehicleYear: "2020", vehicleMake: "Test", vehicleModel: "Car",
  ...overrides,
});

function load(relative, mocks = {}, env = {}) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const realRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports,
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : realRequire(id),
    process: { env }, Buffer, Date, setTimeout,
    console: { log() {}, warn() {}, error() {} },
  }, { filename });
  return module.exports;
}

function emailModule(send = async () => ({ data: { id: "email_test" } })) {
  return load("lib/email.js", {
    resend: { Resend: class { constructor() { this.emails = { send }; } } },
  }, { RESEND_API_KEY: "test-only" });
}

function approvalRunner(state, options = {}) {
  const sent = [];
  const email = emailModule(async (payload) => { sent.push(copy(payload)); return { data: { id: "test" } }; });
  const handler = load("process-approvals.js", {
    "./lib/applications-sheet": {
      getApprovedUnsentApplications: async () => options.snapshot || [copy(state)],
      getApplicationById: async () => copy(state),
      markPaymentStatus: async (_, status) => { state.paymentStatus = status; return true; },
      markAcceptanceEmailSent: async () => {
        if (options.markerFails) throw Error("Injected timestamp write failure");
        state.acceptanceEmailSent = "sent";
        return true;
      },
      syncApplicationRowColor: async () => {}, syncAllApplicationRowColors: async () => {},
    },
    "./lib/email": email,
    "./lib/tokens": { signToken: () => "test-token" },
  }, { SITE_URL: "https://example.invalid" }).handler;
  return { handler, sent };
}

test("Finale emails use the correct event details with and without assignments", () => {
  const email = emailModule();
  for (const registrationType of ["showCar", "marketplace", "vipParking"]) {
    for (const assignments of [{}, { carNumber: "12", category: "Classic", displayZone: "A" }]) {
      const application = fixture({ registrationType, ...assignments });
      const outputs = [
        email.buildAcceptanceEmail({ application, paymentUrl: "https://example.invalid/pay" }),
        email.buildPaymentConfirmationEmail({ application, sessionId: "cs_test", amountPaid: "15.00 CAD" }),
      ];
      for (const output of outputs) for (const format of ["html", "text"]) {
        assert.match(output[format], /Plaza of Nations/);
        assert.match(output[format], /September 13/);
        assert.doesNotMatch(output[format], /Lloyd Avenue|July 19/);
        assert.match(output[format], /2:00 PM/);
      }
    }
  }
});

test("Block Party emails retain their original event details", () => {
  const email = emailModule();
  const application = fixture({ registrationType: "" });
  for (const output of [email.buildAcceptanceEmail({ application }), email.buildPaymentConfirmationEmail({ application })]) {
    for (const format of ["html", "text"]) {
      assert.match(output[format], /Lloyd Avenue/);
      assert.match(output[format], /July 19/);
      assert.doesNotMatch(output[format], /Plaza of Nations/);
    }
  }
});

test("acceptance template suppresses all payment requests for Paid and Free", () => {
  const email = emailModule();
  for (const paymentStatus of ["Paid", " paid ", "Free", " FREE "]) {
    const output = email.buildAcceptanceEmail({
      application: fixture({ paymentStatus }), paymentUrl: "https://example.invalid/pay",
    });
    for (const format of ["html", "text"]) {
      assert.doesNotMatch(output[format], /Pay \$|Pay here|Amount due|lock the spot|not held|example.invalid\/pay/);
      assert.match(output[format], /no (?:further )?payment (?:is )?required/i);
    }
  }
});

test("approval processing skips Paid, confirms Free, and requests the unpaid price", async () => {
  for (const paymentStatus of ["Paid", "Free", ""]) {
    const state = fixture({ paymentStatus });
    const { handler, sent } = approvalRunner(state);
    assert.equal((await handler()).statusCode, 200);
    assert.equal(sent.length, paymentStatus === "Paid" ? 0 : 1);
    if (paymentStatus === "Free") assert.match(sent[0].text, /no payment (?:is )?required/i);
    if (paymentStatus === "") {
      assert.match(sent[0].text, /Pay \$15\.00 CAD/);
      assert.match(sent[0].text, /show-payment.html\?token=test-token/);
    }
  }
});

test("approval processing respects changes after the initial scan", async () => {
  for (const change of [{ paymentStatus: "Paid" }, { status: "Rejected" }, { acceptanceEmailSent: "sent" }]) {
    const { handler, sent } = approvalRunner(fixture(change), { snapshot: [fixture()] });
    await handler();
    assert.equal(sent.length, 0);
  }
});

test("failed acceptance marker followed by payment never causes a second payment request", async () => {
  const state = fixture();
  const runner = approvalRunner(state, { markerFails: true });
  await runner.handler();
  assert.equal(runner.sent.length, 1);
  state.paymentStatus = "Paid";
  await runner.handler();
  assert.equal(runner.sent.length, 1);
});

// Exercise real sheet helpers against an in-memory implementation of the Sheets API.
function sheetStore(application = fixture()) {
  const columns = require("../netlify/functions/lib/applications-sheet").APPLICATION_COLUMNS;
  const originalHeaders = columns.slice(0, 39);
  originalHeaders[3] = "Custom name heading";
  const row = Array(39).fill("");
  for (const [index, field] of [[1, "applicationId"], [2, "status"], [3, "name"], [4, "email"], [17, "acceptanceEmailSent"], [18, "paymentStatus"], [19, "stripeSessionId"], [24, "registrationType"]]) row[index] = application[field];
  row[38] = "https://example.invalid/last-photo.jpg";
  const state = { rows: [originalHeaders, row], width: 39, writes: [], failSent: 0, failPayload: 0 };
  const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const values = {
    get: async ({ range }) => {
      const finalColumn = range.split(":").at(-1).match(/^([A-Z]+)/)?.[1];
      if (finalColumn) assert.ok(colIndex(finalColumn) < state.width, "read must fit current grid");
      return { data: { values: copy(range.endsWith("1:1") ? [state.rows[0]] : state.rows) } };
    },
    update: async ({ range, requestBody, valueInputOption }) => {
      const cell = range.split("!")[1].split(":")[0].match(/^([A-Z]+)(\d+)$/);
      assert.ok(cell, `Unexpected update range: ${range}`);
      const column = colIndex(cell[1]), rowIndex = Number(cell[2]) - 1;
      const data = requestBody.values[0];
      assert.ok(column + data.length <= state.width, "write must fit expanded grid");
      const sentIndex = columns.indexOf("Payment Confirmation Email Sent");
      const payloadIndex = columns.indexOf("Payment Confirmation Payload");
      if (rowIndex > 0 && column <= sentIndex && data[sentIndex - column] && state.failSent-- > 0) throw Error("Injected receipt marker failure");
      if (rowIndex > 0 && column <= payloadIndex && data[payloadIndex - column] && state.failPayload-- > 0) throw Error("Injected payload save failure");
      state.writes.push({ range, data: copy(data), valueInputOption });
      if (state.beforeWrite) await state.beforeWrite({ range, data });
      state.rows[rowIndex] ||= [];
      data.forEach((value, index) => { state.rows[rowIndex][column + index] = value; });
      return { data: {} };
    },
  };
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: "Finale Applications", sheetId: 1, gridProperties: { columnCount: state.width } } }] } }),
    values,
    batchUpdate: async ({ requestBody }) => {
      for (const request of requestBody.requests) {
        if (request.updateSheetProperties?.properties.gridProperties?.columnCount) state.width = request.updateSheetProperties.properties.gridProperties.columnCount;
        else if (request.repeatCell) throw Error("Injected formatting failure");
        else throw Error("Unexpected sheet mutation");
      }
      return { data: {} };
    },
  } };
  const api = load("lib/applications-sheet.js", {
    "./google-auth": { getSheetsClient: async () => sheets, requiredEnv: () => "test-sheet" },
  });
  return { api, state, originalHeaders: copy(originalHeaders), originalRow: copy(row) };
}

function webhookRunner(store, send) {
  const email = emailModule(send);
  const session = { id: "cs_test", payment_status: "paid", amount_total: 1500, currency: "cad", metadata: { applicationId: "app_test", eventId: config.FINALE_CONFIG.id } };
  const handler = load("stripe-webhook.js", {
    stripe: () => ({
      checkout: { sessions: { retrieve: async () => copy(session) } },
      webhooks: { constructEvent: () => ({ type: "checkout.session.completed", id: "evt_test", data: { object: copy(session) } }) },
    }),
    "./lib/applications-sheet": store.api,
    "./lib/email": email,
  }, { STRIPE_SECRET_KEY: "test-only", STRIPE_WEBHOOK_SECRET: "test-only" }).handler;
  return () => handler({ httpMethod: "POST", headers: { "stripe-signature": "test" }, body: "test" });
}

test("receipt failure retries despite Paid status and formatting failure; replay sends nothing", async () => {
  const store = sheetStore();
  let calls = 0;
  const run = webhookRunner(store, async () => ++calls === 1 ? { error: { message: "Injected Resend failure" } } : { data: { id: "email_test" } });
  assert.equal((await run()).statusCode, 500);
  assert.equal(store.state.rows[1][18], "Paid");
  assert.equal(store.state.rows[1][19], "cs_test");
  assert.equal((await run()).statusCode, 200);
  assert.equal(calls, 2);
  assert.equal((await run()).statusCode, 200);
  assert.equal(calls, 2);
});

test("successful send with failed marker reuses exact persisted payload and key", async () => {
  const store = sheetStore();
  store.state.failSent = 1;
  const sends = [];
  const run = webhookRunner(store, async (payload, options) => { sends.push(copy({ payload, options })); return { data: { id: "email_test" } }; });
  assert.equal((await run()).statusCode, 500);
  store.state.rows[1][3] = "Changed name";
  store.state.rows[1][4] = "changed@example.invalid";
  assert.equal((await run()).statusCode, 200);
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0], sends[1]);
  assert.equal(sends[0].options.idempotencyKey, "payment-confirmation/cs_test");
  assert.equal((await run()).statusCode, 200);
  assert.equal(sends.length, 2);
});

test("payload persistence failure prevents sending until a successful retry", async () => {
  const store = sheetStore();
  store.state.failPayload = 1;
  let sends = 0;
  const run = webhookRunner(store, async () => { sends++; return { data: { id: "email_test" } }; });
  assert.equal((await run()).statusCode, 500);
  assert.equal(sends, 0);
  assert.equal((await run()).statusCode, 200);
  assert.equal(sends, 1);
});

test("receipt columns preserve old data and record payment plus session in one write", async () => {
  const store = sheetStore(fixture({ paymentStatus: "Paid", stripeSessionId: "cs_test" }));
  const run = webhookRunner(store, async () => ({ data: { id: "email_test" } }));
  assert.equal((await run()).statusCode, 200);
  assert.deepEqual(store.state.rows[0].slice(0, 39), store.originalHeaders);
  assert.deepEqual(store.state.rows[1].slice(0, 39), store.originalRow);
  assert.ok(store.state.rows[1].length > 39);
  await store.api.markPaymentStatus("app_test", "Paid", "cs_test");
  const paymentWrite = store.state.writes.at(-1);
  assert.equal(paymentWrite.range, "'Finale Applications'!S2:T2");
  assert.deepEqual(paymentWrite.data, ["Paid", "cs_test"]);
});

test("paid application cannot open a new checkout", async () => {
  const handler = load("create-show-checkout.js", {
    stripe: () => { throw Error("Must not create Stripe client"); },
    "./lib/applications-sheet": { getApplicationById: async () => fixture({ paymentStatus: "Paid" }) },
    "./lib/tokens": { verifyToken: () => ({ ok: true, data: { applicationId: "app_test" } }) },
  }).handler;
  const response = await handler({ httpMethod: "POST", body: JSON.stringify({ token: "test" }) });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).alreadyPaid, true);
});

test("conflicting receipt headers are preserved and prevent sending", async () => {
  const store = sheetStore();
  store.state.width = 42;
  store.state.rows[0][39] = "Staff notes";
  store.state.rows[1][39] = "Keep this note";
  let sends = 0;
  const run = webhookRunner(store, async () => { sends++; return { data: { id: "test" } }; });
  assert.equal((await run()).statusCode, 500);
  assert.equal(sends, 0);
  assert.equal(store.state.rows[0][39], "Staff notes");
  assert.equal(store.state.rows[1][39], "Keep this note");
});

test("a different Stripe session cannot overwrite recorded payment or receipt", async () => {
  const store = sheetStore(fixture({ paymentStatus: "Paid", stripeSessionId: "cs_other" }));
  const run = webhookRunner(store, async () => { throw Error("Must not send"); });
  assert.equal((await run()).statusCode, 500);
  assert.equal(store.state.rows[1][19], "cs_other");
  assert.equal(store.state.writes.length, 0);
});

test("receipt preparation does not erase another webhook's completed marker", async () => {
  const store = sheetStore();
  store.state.beforeWrite = async ({ range }) => {
    if (range.includes("!AN2:")) store.state.rows[1][41] = "2026-09-05T12:00:00.000Z";
  };
  const email = emailModule();
  await store.api.preparePaymentConfirmation("app_test", "cs_test", email.buildPaymentConfirmationPayload({ application: fixture(), sessionId: "cs_test" }));
  assert.equal(store.state.rows[1][41], "2026-09-05T12:00:00.000Z");
});
