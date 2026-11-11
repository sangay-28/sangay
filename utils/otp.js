const crypto = require('node:crypto');
const { get, run } = require('./database-query');

const CODE_TTL_MS = 5 * 60 * 1000;
let temporarySecret;

function secret() {
  if (process.env.OTP_SECRET) return process.env.OTP_SECRET;
  temporarySecret ||= crypto.randomBytes(32).toString('hex');
  return temporarySecret;
}

function codeHash(email, role, purpose, code) {
  return crypto
    .createHmac('sha256', secret())
    .update(`${email}:${role}:${purpose}:${code}`)
    .digest('hex');
}

function isOtpTestModeEnabled() {
  return process.env.OTP_TEST_MODE === 'true';
}

async function issueOtp(database, { email, role, purpose, metadata = null }) {
  if (!isOtpTestModeEnabled()) {
    const error = new Error(
      'OTP testing mode is disabled. Set OTP_TEST_MODE=true only for private testing; this does not verify email ownership.',
    );
    error.code = 'EOTP_TEST_MODE_DISABLED';
    error.statusCode = 503;
    throw error;
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await run(database, 'DELETE FROM otp_challenges WHERE email=? AND role=? AND purpose=?', [
    email,
    role,
    purpose,
  ]);
  await run(database, 'DELETE FROM otp_challenges WHERE expires_at < ?', [
    Date.now() - 24 * 60 * 60 * 1000,
  ]);
  await run(
    database,
    `INSERT INTO otp_challenges (email,role,purpose,code_hash,metadata,expires_at)
    VALUES (?,?,?,?,?,?) RETURNING id`,
    [
      email,
      role,
      purpose,
      codeHash(email, role, purpose, code),
      metadata ? JSON.stringify(metadata) : null,
      Date.now() + CODE_TTL_MS,
    ],
  );
  return { code };
}

async function consumeOtp(database, { email, role, purpose, code }) {
  const challenge = await get(
    database,
    `SELECT * FROM otp_challenges
    WHERE email=? AND role=? AND purpose=? AND consumed=0 ORDER BY id DESC LIMIT 1`,
    [email, role, purpose],
  );
  if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= 5) {
    if (challenge)
      await run(database, 'UPDATE otp_challenges SET consumed=1 WHERE id=?', [challenge.id]);
    return null;
  }
  const actual = Buffer.from(codeHash(email, role, purpose, code), 'hex');
  const expected = Buffer.from(challenge.code_hash, 'hex');
  const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  if (!valid) {
    const attempts = challenge.attempts + 1;
    await run(database, 'UPDATE otp_challenges SET attempts=?, consumed=? WHERE id=?', [
      attempts,
      attempts >= 5 ? 1 : 0,
      challenge.id,
    ]);
    return null;
  }
  await run(database, 'UPDATE otp_challenges SET consumed=1 WHERE id=?', [challenge.id]);
  return { metadata: challenge.metadata ? JSON.parse(challenge.metadata) : null };
}

module.exports = { consumeOtp, isOtpTestModeEnabled, issueOtp };
