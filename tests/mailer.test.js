const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sendLoginCode } = require('../utils/mailer');

function setResendEnvironment(t, values) {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
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

test('requires the Resend API key and sender configuration', async (t) => {
  setResendEnvironment(t, {});
  await assert.rejects(sendLoginCode('student@example.com', '123456', 'signup'), {
    code: 'EEMAILCONFIG',
    statusCode: 503,
  });
});

test('turns Resend testing-recipient rejection into an actionable error', async (t) => {
  setResendEnvironment(t, {
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'onboarding@resend.dev',
  });
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.get('authorization'), 'Bearer re_test_key');
    const payload = JSON.parse(options.body);
    assert.equal(payload.from, 'onboarding@resend.dev');
    assert.deepEqual(payload.to, ['student@example.com']);
    return new Response(
      JSON.stringify({
        statusCode: 403,
        message: 'You can only send testing emails to your own email address (owner@example.com).',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
  });

  await assert.rejects(sendLoginCode('student@example.com', '123456', 'signup'), (error) => {
    assert.equal(error.code, 'ERESEND_TEST_RECIPIENT');
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /only delivers to the email address on your Resend account/);
    assert.doesNotMatch(error.message, /owner@example\.com/);
    return true;
  });
});

test('treats only a confirmed Resend email id as a successful send', async (t) => {
  setResendEnvironment(t, {
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'onboarding@resend.dev',
  });
  t.mock.method(
    global,
    'fetch',
    async () =>
      new Response(JSON.stringify({ id: 'email_test_id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  await assert.doesNotReject(sendLoginCode('owner@example.com', '123456', 'login'));
});
