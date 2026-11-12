const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApplication } = require('../app');
const { initializeDatabase } = require('../config/database');

test('Gmail-backed OTP registration and login verify securely', async (suite) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-otp-'));
  const database = initializeDatabase(path.join(directory, 'test.sqlite'));
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    OTP_SECRET: process.env.OTP_SECRET,
  };
  process.env.NODE_ENV = 'production';
  process.env.OTP_SECRET = 'otp-test-secret-with-enough-entropy';

  const deliveredCodes = new Map();
  let shouldFailDelivery = false;
  const sendOtpEmail = async (email, code, purpose) => {
    if (shouldFailDelivery) {
      throw Object.assign(new Error('sanitized provider error'), {
        code: 'EOTP_EMAIL_AUTH',
        statusCode: 503,
      });
    }
    deliveredCodes.set(`${email}:${purpose}`, code);
    return { accepted: true };
  };
  const server = require('node:http').createServer(
    createApplication(database, process.cwd(), { sendOtpEmail }),
  );
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

  const firstEmail = 'first-student@example.com';
  const firstRequest = await post('/api/auth/request-otp', signup(firstEmail, 'First Student'));
  assert.equal(firstRequest.status, 200);
  assert.equal(firstRequest.body.emailAccepted, true);
  assert.equal(firstRequest.body.message, 'Gmail accepted the verification email for sending.');
  assert.equal(firstRequest.body.expiresInSeconds, 300);
  assert.equal(firstRequest.body.resendAfterSeconds, 60);
  assert.equal('testCode' in firstRequest.body, false);
  const firstCode = deliveredCodes.get(`${firstEmail}:signup`);
  assert.match(firstCode, /^\d{6}$/);
  let firstChallenge = database
    .prepare('SELECT * FROM otp_challenges WHERE email=? AND purpose=?')
    .get(firstEmail, 'signup');
  assert.notEqual(firstChallenge.code_hash, firstCode);
  assert.match(firstChallenge.code_hash, /^[a-f\d]{64}$/);
  assert.ok(firstChallenge.expires_at > Date.now());

  const cooldownRequest = await post('/api/auth/request-otp', signup(firstEmail, 'First Student'));
  assert.equal(cooldownRequest.status, 429);
  assert.equal('emailAccepted' in cooldownRequest.body, false);

  const failedEmail = 'smtp-failure@example.com';
  shouldFailDelivery = true;
  const failedDelivery = await post('/api/auth/request-otp', signup(failedEmail, 'SMTP Failure'));
  shouldFailDelivery = false;
  assert.equal(failedDelivery.status, 503);
  assert.equal(failedDelivery.body.error, 'sanitized provider error');
  assert.equal('emailAccepted' in failedDelivery.body, false);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM otp_challenges WHERE email=?').get(failedEmail)
      .count,
    0,
  );

  const otherEmail = 'other-student@example.com';
  const otherRequest = await post('/api/auth/request-otp', signup(otherEmail, 'Other Student'));
  assert.equal(otherRequest.status, 200);
  const otherCode = deliveredCodes.get(`${otherEmail}:signup`);
  const verifiedOtherCode =
    otherCode === firstCode ? (firstCode === '111111' ? '222222' : '111111') : otherCode;
  if (verifiedOtherCode !== otherCode) {
    const otherCodeHash = crypto
      .createHmac('sha256', process.env.OTP_SECRET)
      .update(`${otherEmail}:member:signup:${verifiedOtherCode}`)
      .digest('hex');
    database
      .prepare('UPDATE otp_challenges SET code_hash=? WHERE email=? AND purpose=?')
      .run(otherCodeHash, otherEmail, 'signup');
  }

  const crossEmailAttempt = await post('/api/auth/verify-otp', {
    email: otherEmail,
    purpose: 'signup',
    role: 'member',
    code: firstCode,
  });
  assert.equal(crossEmailAttempt.status, 400);
  const otherVerified = await post('/api/auth/verify-otp', {
    email: otherEmail,
    purpose: 'signup',
    role: 'member',
    code: verifiedOtherCode,
  });
  assert.equal(otherVerified.status, 201);
  assert.equal(otherVerified.body.account.email, otherEmail);

  const wrongCode = firstCode === '000000' ? '000001' : '000000';
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
    code: firstCode,
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
    code: firstCode,
  });
  assert.equal(replay.status, 400);

  const loginRequest = await post('/api/auth/request-otp', {
    email: firstEmail,
    role: 'member',
    purpose: 'login',
  });
  assert.equal(loginRequest.status, 200);
  assert.equal('testCode' in loginRequest.body, false);
  const login = await post('/api/auth/verify-otp', {
    email: firstEmail,
    role: 'member',
    purpose: 'login',
    code: deliveredCodes.get(`${firstEmail}:login`),
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

  const attemptLimitEmail = 'attempt-limit@example.com';
  const attemptLimitRequest = await post(
    '/api/auth/request-otp',
    signup(attemptLimitEmail, 'Attempt Limit'),
  );
  assert.equal(attemptLimitRequest.status, 200);
  const attemptLimitCode = deliveredCodes.get(`${attemptLimitEmail}:signup`);
  const wrongAttemptCode = attemptLimitCode === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const attemptResponse = await post('/api/auth/verify-otp', {
      email: attemptLimitEmail,
      purpose: 'signup',
      role: 'member',
      code: wrongAttemptCode,
    });
    assert.equal(attemptResponse.status, 400);
  }
  const afterLimit = await post('/api/auth/verify-otp', {
    email: attemptLimitEmail,
    purpose: 'signup',
    role: 'member',
    code: attemptLimitCode,
  });
  assert.equal(afterLimit.status, 400);
  assert.equal(
    database
      .prepare('SELECT consumed FROM otp_challenges WHERE email=? AND purpose=?')
      .get(attemptLimitEmail, 'signup').consumed,
    1,
  );

  const rateLimitedEmail = 'rate-limited@example.com';
  const rateLimitedRequest = await post(
    '/api/auth/request-otp',
    signup(rateLimitedEmail, 'Rate Limited'),
  );
  assert.equal(rateLimitedRequest.status, 200);
  const rateLimitedCode = deliveredCodes.get(`${rateLimitedEmail}:signup`);
  const invalidCode = rateLimitedCode === '000000' ? '000001' : '000000';
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

test('OTP requests fail honestly and remove challenges when Gmail is not configured', async (suite) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-no-mail-'));
  const database = initializeDatabase(path.join(directory, 'test.sqlite'));
  const configKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const originalConfig = Object.fromEntries(configKeys.map((key) => [key, process.env[key]]));
  for (const key of configKeys) delete process.env[key];

  const server = require('node:http').createServer(createApplication(database, process.cwd()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  suite.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalConfig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const response = await fetch(`${baseUrl}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'student@example.com',
      fullName: 'Student',
      course: 'Science',
      year: 2,
      consent: true,
      purpose: 'signup',
      role: 'member',
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.match(body.error, /Email delivery is not configured/);
  assert.equal(body.emailAccepted, undefined);
  assert.equal(body.testCode, undefined);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM otp_challenges').get().count, 0);
});
