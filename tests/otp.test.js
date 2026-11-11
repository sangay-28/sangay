const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApplication } = require('../app');
const { initializeDatabase } = require('../config/database');

test('development OTP registration and login are secure and production fails closed', async (suite) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-otp-'));
  const database = initializeDatabase(path.join(directory, 'test.sqlite'));
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    RENDER: process.env.RENDER,
    OTP_SECRET: process.env.OTP_SECRET,
  };
  process.env.NODE_ENV = 'development';
  delete process.env.RENDER;
  process.env.OTP_SECRET = 'otp-test-secret-with-enough-entropy';

  const server = require('node:http').createServer(createApplication(database, process.cwd()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  suite.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function post(endpoint, body) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookies: response.headers.getSetCookie(),
    };
  }

  const signup = (email, fullName) => ({
    email,
    fullName,
    course: 'Computer Science',
    year: 2,
    consent: true,
    purpose: 'signup',
    role: 'member',
  });

  process.env.NODE_ENV = 'production';
  const productionRequest = await post(
    '/api/auth/request-otp',
    signup('production@example.com', 'Production User'),
  );
  assert.equal(productionRequest.status, 503);
  assert.equal('developmentCode' in productionRequest.body, false);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM otp_challenges').get().count, 0);
  const productionVerify = await post('/api/auth/verify-otp', {
    email: 'production@example.com',
    purpose: 'signup',
    role: 'member',
    code: '123456',
  });
  assert.equal(productionVerify.status, 503);

  process.env.NODE_ENV = 'development';
  const firstEmail = 'first-student@example.com';
  const firstRequest = await post('/api/auth/request-otp', signup(firstEmail, 'First Student'));
  assert.equal(firstRequest.status, 200);
  assert.match(firstRequest.body.developmentCode, /^\d{6}$/);
  assert.equal(firstRequest.body.message, 'Development OTP generated. It expires in five minutes.');
  let firstChallenge = database
    .prepare('SELECT * FROM otp_challenges WHERE email=? AND purpose=?')
    .get(firstEmail, 'signup');
  assert.notEqual(firstChallenge.code_hash, firstRequest.body.developmentCode);
  assert.match(firstChallenge.code_hash, /^[a-f\d]{64}$/);
  assert.ok(firstChallenge.expires_at > Date.now());

  const cooldownRequest = await post('/api/auth/request-otp', signup(firstEmail, 'First Student'));
  assert.equal(cooldownRequest.status, 429);
  assert.equal('developmentCode' in cooldownRequest.body, false);

  const otherEmail = 'other-student@example.com';
  const otherRequest = await post('/api/auth/request-otp', signup(otherEmail, 'Other Student'));
  assert.equal(otherRequest.status, 200);
  const otherCode =
    otherRequest.body.developmentCode === firstRequest.body.developmentCode
      ? firstRequest.body.developmentCode === '111111'
        ? '222222'
        : '111111'
      : otherRequest.body.developmentCode;
  const otherCodeHash = crypto
    .createHmac('sha256', process.env.OTP_SECRET)
    .update(`${otherEmail}:member:signup:${otherCode}`)
    .digest('hex');
  database
    .prepare('UPDATE otp_challenges SET code_hash=? WHERE email=? AND purpose=?')
    .run(otherCodeHash, otherEmail, 'signup');

  const crossEmailAttempt = await post('/api/auth/verify-otp', {
    email: otherEmail,
    purpose: 'signup',
    role: 'member',
    code: firstRequest.body.developmentCode,
  });
  assert.equal(crossEmailAttempt.status, 400);
  const otherVerified = await post('/api/auth/verify-otp', {
    email: otherEmail,
    purpose: 'signup',
    role: 'member',
    code: otherCode,
  });
  assert.equal(otherVerified.status, 201);
  assert.equal(otherVerified.body.account.email, otherEmail);

  const wrongCode = firstRequest.body.developmentCode === '000000' ? '000001' : '000000';
  const wrongAttempt = await post('/api/auth/verify-otp', {
    email: firstEmail,
    purpose: 'signup',
    role: 'member',
    code: wrongCode,
  });
  assert.equal(wrongAttempt.status, 400);
  const firstVerified = await post('/api/auth/verify-otp', {
    email: firstEmail,
    purpose: 'signup',
    role: 'member',
    code: firstRequest.body.developmentCode,
  });
  assert.equal(firstVerified.status, 201);
  assert.equal(firstVerified.body.account.email, firstEmail);
  assert.ok(firstVerified.cookies.some((cookie) => cookie.startsWith('clubs_portal=')));
  firstChallenge = database
    .prepare('SELECT consumed FROM otp_challenges WHERE email=? AND purpose=?')
    .get(firstEmail, 'signup');
  assert.equal(firstChallenge.consumed, 1);
  const replay = await post('/api/auth/verify-otp', {
    email: firstEmail,
    purpose: 'signup',
    role: 'member',
    code: firstRequest.body.developmentCode,
  });
  assert.equal(replay.status, 400);

  const loginRequest = await post('/api/auth/request-otp', {
    email: firstEmail,
    role: 'member',
    purpose: 'login',
  });
  assert.equal(loginRequest.status, 200);
  assert.match(loginRequest.body.developmentCode, /^\d{6}$/);
  const login = await post('/api/auth/verify-otp', {
    email: firstEmail,
    role: 'member',
    purpose: 'login',
    code: loginRequest.body.developmentCode,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.account.email, firstEmail);

  const expiredEmail = 'expired-student@example.com';
  const expiredCode = '314159';
  const expiredHash = crypto
    .createHmac('sha256', process.env.OTP_SECRET)
    .update(`${expiredEmail}:member:signup:${expiredCode}`)
    .digest('hex');
  database
    .prepare(
      `INSERT INTO otp_challenges (email,role,purpose,code_hash,metadata,expires_at)
      VALUES (?,'member','signup',?,?,?)`,
    )
    .run(expiredEmail, expiredHash, JSON.stringify({ fullName: 'Expired User' }), Date.now() - 1);
  const expired = await post('/api/auth/verify-otp', {
    email: expiredEmail,
    purpose: 'signup',
    role: 'member',
    code: expiredCode,
  });
  assert.equal(expired.status, 400);

  const rateLimitedEmail = 'rate-limited@example.com';
  const rateLimitedRequest = await post(
    '/api/auth/request-otp',
    signup(rateLimitedEmail, 'Rate Limited'),
  );
  const invalidCode = rateLimitedRequest.body.developmentCode === '000000' ? '000001' : '000000';
  let lastAttempt;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    lastAttempt = await post('/api/auth/verify-otp', {
      email: rateLimitedEmail,
      purpose: 'signup',
      role: 'member',
      code: invalidCode,
    });
  }
  assert.equal(lastAttempt.status, 400);
  const limitedAttempt = await post('/api/auth/verify-otp', {
    email: rateLimitedEmail,
    purpose: 'signup',
    role: 'member',
    code: invalidCode,
  });
  assert.equal(limitedAttempt.status, 429);
});
