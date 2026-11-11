const crypto = require('node:crypto');
const { sendLoginCode } = require('./mailer');
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

async function issueOtp(database, { email, role, purpose, metadata = null }) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await run(database, 'DELETE FROM otp_challenges WHERE email=? AND role=? AND purpose=?', [
    email,
    role,
    purpose,
  ]);
  await run(database, 'DELETE FROM otp_challenges WHERE expires_at < ?', [
    Date.now() - 24 * 60 * 60 * 1000,
  ]);
  const result = await run(
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
  try {
    await sendLoginCode(email, code, purpose);
  } catch (error) {
    await run(database, 'DELETE FROM otp_challenges WHERE id=?', [Number(result.lastInsertRowid)]);
    const deliveryError =
      (typeof error.code === 'string' && error.code.startsWith('EBREVO')) ||
      error.code === 'EEMAILCONFIG'
        ? error
        : Object.assign(
            new Error('The verification email could not be sent. Please try again later.'),
            { code: 'EEMAILDELIVERY', statusCode: 503 },
          );
    console.error(
      'Verification email delivery failed:',
      deliveryError.code || 'EEMAILDELIVERY',
      deliveryError.message,
    );
    throw deliveryError;
  }
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

module.exports = { consumeOtp, issueOtp };
