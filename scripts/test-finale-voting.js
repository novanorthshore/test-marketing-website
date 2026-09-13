const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const roster = require('../netlify/functions/lib/finale-voting-roster').listFinaleVotingCars();
const { VOTING_CATEGORIES, VOTING_EVENT_ID, isVotingOpen } = require('../netlify/functions/lib/vote-config');
const originalOpen = process.env.FINALE_VOTING_OPEN;

const loadHandler = (name, replacements = {}) => {
  const handlerPath = require.resolve(`../netlify/functions/${name}`);
  const saved = new Map();
  for (const [relativePath, exports] of Object.entries(replacements)) {
    const modulePath = require.resolve(path.join(root, relativePath));
    saved.set(modulePath, require.cache[modulePath]);
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  }
  delete require.cache[handlerPath];
  const handler = require(handlerPath).handler;
  delete require.cache[handlerPath];
  for (const [modulePath, previous] of saved) {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  }
  return handler;
};
const response = (result) => ({ status: result.statusCode, body: JSON.parse(result.body) });
const postEvent = (selections, code = '123456') => ({
  httpMethod: 'POST',
  headers: { 'user-agent': 'mock-browser' },
  body: JSON.stringify({ phone: '6045551234', code, selections }),
});
const picks = {
  'peoples-choice': roster[0].applicationId,
  'top-build': roster[0].applicationId,
  'top-classic': roster.find((car) => car.eligibleCategoryIds.includes('top-classic')).applicationId,
};

process.env.FINALE_VOTING_OPEN = 'false';
test('fixed roster is sanitized and event-scoped', () => {
  assert.equal(roster.length, 60);
  assert.equal(new Set(roster.map((car) => car.applicationId)).size, 60);
  assert.equal(roster.filter((car) => car.eligibleCategoryIds.includes('top-classic')).length, 10);
  assert(roster.every((car) => car.eligibleCategoryIds.includes('peoples-choice') && car.eligibleCategoryIds.includes('top-build')));
  assert(roster.every((car) => car.photoUrl.startsWith('https://res.cloudinary.com/')));
  assert(roster.every((car) => Object.keys(car).sort().join(',') === 'applicationId,eligibleCategoryIds,instagram,photoUrl,vehicleLabel,vehicleMake,vehicleModel,vehicleYear'));
  assert.equal(VOTING_EVENT_ID, 'nova-finale-001');
  assert.deepEqual(VOTING_CATEGORIES.map((category) => category.id), ['peoples-choice', 'top-build', 'top-classic']);
  const legacyOpen = process.env.VOTING_OPEN;
  process.env.VOTING_OPEN = 'true';
  assert.equal(isVotingOpen(), false);
  if (legacyOpen === undefined) delete process.env.VOTING_OPEN;
  else process.env.VOTING_OPEN = legacyOpen;
  assert(!fs.existsSync(path.join(root, 'block-party-voting.html')));
  const netlifyToml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  assert.match(netlifyToml, /from = "\/block-party-voting"\s+to = "\/finale-voting\.html"/);
  assert.match(netlifyToml, /from = "\/block-party-voting\.html"\s+to = "\/finale-voting\.html"/);
  assert.match(fs.readFileSync(path.join(root, 'finale-event.html'), 'utf8'), /href="finale-voting\.html"/);
});

test('closed listing and submissions make no external calls', async () => {
  const get = loadHandler('get-voting-cars.js');
  const submit = loadHandler('submit-votes.js');
  const listed = response(await get({ httpMethod: 'GET' }));
  assert.equal(listed.status, 403);
  assert.equal(listed.body.open, false);
  assert.equal(listed.body.cars.length, 0);
  assert.equal(response(await submit(postEvent(picks))).status, 403);
});

test('open listing contains only fixed roster and three categories', async () => {
  process.env.FINALE_VOTING_OPEN = 'true';
  const get = loadHandler('get-voting-cars.js', {
    'netlify/functions/lib/voting-redis.js': { isVotingRedisConfigured: () => false },
  });
  const listed = response(await get({ httpMethod: 'GET' }));
  assert.equal(listed.status, 200);
  assert.equal(listed.body.cars.length, 60);
  assert.equal(listed.body.categories.length, 3);
  assert.equal(listed.body.eventId, 'nova-finale-001');
  assert.equal(listed.body.verificationMode, 'twilio');
  assert(!('email' in listed.body.cars[0]));
  process.env.FINALE_VOTING_OPEN = 'false';
});

test('submission accepts same car twice and rejects bad ballots and codes', async () => {
  process.env.FINALE_VOTING_OPEN = 'true';
  let appendCalls = 0;
  let submittedLabels;
  let duplicate = false;
  let codeValid = true;
  let failAppend = false;
  const submit = loadHandler('submit-votes.js', {
    'netlify/functions/lib/voting-sheet.js': {
      hasPhoneVoted: async () => duplicate,
      hashPhone: () => 'mock-hash',
      isRetryableSheetsError: (error) => error.message === 'busy',
      appendBallot: async ({ carLabelsById }) => {
        appendCalls += 1;
        submittedLabels = carLabelsById;
        if (failAppend) throw new Error('busy');
      },
    },
    'netlify/functions/lib/twilio-verify.js': {
      normalizePhoneE164: () => '+16045551234',
      checkVoteVerificationCode: async () => ({ valid: codeValid }),
    },
    'netlify/functions/lib/voting-redis.js': { isVotingRedisConfigured: () => false },
    'netlify/functions/lib/voting-risk.js': { buildRiskHashes: () => ({ fingerprintHash: '', networkHash: '' }) },
  });
  assert.equal(response(await submit(postEvent(picks))).status, 200);
  assert.equal(appendCalls, 1);
  assert.match(submittedLabels[roster[0].applicationId], new RegExp(roster[0].applicationId));
  assert.equal(response(await submit(postEvent({ 'peoples-choice': picks['peoples-choice'] }))).status, 400);
  assert.equal(response(await submit(postEvent({ ...picks, 'top-build': 'invalid-id' }))).status, 400);
  const nonClassic = roster.find((car) => !car.eligibleCategoryIds.includes('top-classic'));
  assert.equal(response(await submit(postEvent({ ...picks, 'top-classic': nonClassic.applicationId }))).status, 400);
  codeValid = false;
  assert.equal(response(await submit(postEvent(picks))).status, 400);
  codeValid = true;
  duplicate = true;
  assert.equal(response(await submit(postEvent(picks))).status, 409);
  duplicate = false;
  failAppend = true;
  assert.equal(response(await submit(postEvent(picks))).status, 503);
  assert.equal(appendCalls, 2);
  process.env.FINALE_VOTING_OPEN = 'false';
});

test('results and sync require an admin token', async () => {
  const results = loadHandler('get-voting-results.js');
  const sync = loadHandler('sync-votes-to-sheet.js');
  assert.equal(response(await results({ httpMethod: 'GET', headers: {} })).status, 403);
  assert.equal(response(await sync({ httpMethod: 'POST', headers: {} })).status, 403);
});

test('results use the fixed Finale roster behind the admin token', async () => {
  const originalToken = process.env.VOTING_ADMIN_TOKEN;
  process.env.VOTING_ADMIN_TOKEN = 'test-admin-token';
  const results = loadHandler('get-voting-results.js', {
    'netlify/functions/lib/voting-redis.js': {
      isVotingRedisConfigured: () => true,
      getRedisTallies: async () => ({ [`top-classic:${picks['top-classic']}`]: 3 }),
    },
  });
  const output = response(await results({ httpMethod: 'GET', headers: { 'x-voting-admin-token': 'test-admin-token' } }));
  assert.equal(output.status, 200);
  assert.equal(output.body.categories.length, 3);
  assert.equal(output.body.categories[2].leader.car, roster.find((car) => car.applicationId === picks['top-classic']).vehicleLabel);
  if (originalToken === undefined) delete process.env.VOTING_ADMIN_TOKEN;
  else process.env.VOTING_ADMIN_TOKEN = originalToken;
});

test('Redis tally reads the Finale event key', async () => {
  const priorUrl = process.env.UPSTASH_REDIS_REST_URL;
  const priorToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const priorFetch = global.fetch;
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  let command;
  global.fetch = async (_url, options) => {
    command = JSON.parse(options.body);
    return { ok: true, json: async () => ({ result: [] }) };
  };
  try {
    await require('../netlify/functions/lib/voting-redis').getRedisTallies();
    assert.deepEqual(command, ['HGETALL', 'nova:voting:{nova-finale-001}:tallies']);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = priorUrl;
    if (priorToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = priorToken;
  }
});

test('vote storage reads dedicated Finale sheet tabs regardless of legacy settings', async () => {
  const authPath = require.resolve('../netlify/functions/lib/google-auth');
  const sheetPath = require.resolve('../netlify/functions/lib/voting-sheet');
  const originalAuth = require.cache[authPath];
  const originalSheet = require.cache[sheetPath];
  const oldVotesTab = process.env.GOOGLE_VOTES_SHEET_TAB;
  const oldResultsTab = process.env.GOOGLE_RESULTS_SHEET_TAB;
  process.env.GOOGLE_VOTES_SHEET_TAB = 'Votes';
  process.env.GOOGLE_RESULTS_SHEET_TAB = 'Results';
  const ranges = [];
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [
      { properties: { sheetId: 1, title: 'Finale Votes' } },
      { properties: { sheetId: 2, title: 'Finale Results' } },
    ] } }),
    values: {
      get: async ({ range }) => {
        ranges.push(range);
        if (range.endsWith('Z1')) return { data: { values: [['nova-finale-voting-results-v1']] } };
        return { data: { values: [] } };
      },
      update: async () => ({}),
    },
  } };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
    getSheetsClient: async () => sheets,
    requiredEnv: () => 'test-secret',
  } };
  delete require.cache[sheetPath];
  try {
    const voteSheet = require(sheetPath);
    assert.equal(await voteSheet.hasPhoneVoted('+16045551234'), false);
    assert(ranges.some((range) => range.startsWith("'Finale Votes'!")));
    assert(ranges.some((range) => range.startsWith("'Finale Results'!")));
    assert(ranges.every((range) => !range.startsWith("'Votes'!") && !range.startsWith("'Results'!")));
  } finally {
    if (originalAuth) require.cache[authPath] = originalAuth;
    else delete require.cache[authPath];
    if (originalSheet) require.cache[sheetPath] = originalSheet;
    else delete require.cache[sheetPath];
    if (oldVotesTab === undefined) delete process.env.GOOGLE_VOTES_SHEET_TAB;
    else process.env.GOOGLE_VOTES_SHEET_TAB = oldVotesTab;
    if (oldResultsTab === undefined) delete process.env.GOOGLE_RESULTS_SHEET_TAB;
    else process.env.GOOGLE_RESULTS_SHEET_TAB = oldResultsTab;
  }
});

test('SMS request handles invalid phones, duplicate numbers, and delivery failures', async () => {
  process.env.FINALE_VOTING_OPEN = 'true';
  let duplicate = false;
  let deliveryFails = false;
  const send = loadHandler('send-vote-code.js', {
    'netlify/functions/lib/voting-sheet.js': {
      hasPhoneVoted: async () => duplicate,
      hashPhone: () => 'mock-hash',
      isRetryableSheetsError: () => false,
    },
    'netlify/functions/lib/twilio-verify.js': {
      normalizePhoneE164: (value) => value === 'bad' ? null : '+16045551234',
      sendVoteVerificationCode: async () => { if (deliveryFails) throw new Error('Twilio unavailable'); },
    },
    'netlify/functions/lib/voting-redis.js': { isVotingRedisConfigured: () => false },
    'netlify/functions/lib/email-otp.js': { hashIp: () => 'mock-ip' },
  });
  const event = (phone) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ phone }) });
  assert.equal(response(await send(event('bad'))).status, 400);
  duplicate = true;
  assert.equal(response(await send(event('6045551234'))).status, 409);
  duplicate = false;
  deliveryFails = true;
  assert.equal(response(await send(event('6045551234'))).status, 500);
  process.env.FINALE_VOTING_OPEN = 'false';
});

test.after(() => {
  if (originalOpen === undefined) delete process.env.FINALE_VOTING_OPEN;
  else process.env.FINALE_VOTING_OPEN = originalOpen;
});
