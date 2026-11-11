const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sendLoginCode } = require('../utils/mailer');

function setBrevoEnvironment(t, values) {
  const previous = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    BREVO_FROM_EMAIL: process.env.BREVO_FROM_EMAIL,
    BREVO_FROM_NAME: process.env.BREVO_FROM_NAME,
  };
  for (const key of Object.keys(previous)) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function createMailerClient(sendTransacEmail) {
  return { transactionalEmails: { sendTransacEmail } };
}

test('requires a Brevo API key and sender address', async (t) => {
  setBrevoEnvironment(t, {});
  await assert.rejects(sendLoginCode('student@example.com', '123456', 'signup'), {
    code: 'EEMAILCONFIG',
    statusCode: 503,
  });
});

test('sends the OTP to the requested recipient using the verified sender settings', async (t) => {
  setBrevoEnvironment(t, {
    BREVO_API_KEY: 'brevo_test_key',
    BREVO_FROM_EMAIL: 'verified@example.com',
    BREVO_FROM_NAME: 'Sherubtse Clubs',
  });
  let sentPayload;
  const client = createMailerClient(async (payload) => {
    sentPayload = payload;
    return { messageId: 'brevo-message-id' };
  });

  await assert.doesNotReject(sendLoginCode('student@example.com', '123456', 'signup', client));
  assert.deepEqual(sentPayload.sender, {
    email: 'verified@example.com',
    name: 'Sherubtse Clubs',
  });
  assert.deepEqual(sentPayload.to, [{ email: 'student@example.com' }]);
  assert.match(sentPayload.textContent, /123456/);
  assert.match(sentPayload.textContent, /expires in 5 minutes/);
});

test('returns a clear sender-verification error and redacts API keys', async (t) => {
  setBrevoEnvironment(t, {
    BREVO_API_KEY: 'brevo_private_test_key',
    BREVO_FROM_EMAIL: 'unverified@example.com',
  });
  const providerError = Object.assign(
    new Error('Sender email brevo_private_test_key is not verified.'),
    { statusCode: 400 },
  );
  const client = createMailerClient(async () => {
    throw providerError;
  });

  await assert.rejects(sendLoginCode('student@example.com', '123456', 'login', client), (error) => {
    assert.equal(error.code, 'EBREVO_SENDER');
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /Verify BREVO_FROM_EMAIL/);
    assert.doesNotMatch(error.message, /brevo_private_test_key/);
    return true;
  });
});

test('does not report success if Brevo gives no message ID', async (t) => {
  setBrevoEnvironment(t, {
    BREVO_API_KEY: 'brevo_test_key',
    BREVO_FROM_EMAIL: 'verified@example.com',
  });
  const client = createMailerClient(async () => ({ messageId: undefined }));

  await assert.rejects(sendLoginCode('student@example.com', '123456', 'login', client), {
    code: 'EBREVO_UNCONFIRMED',
    statusCode: 503,
  });
});
