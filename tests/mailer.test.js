const assert = require('node:assert/strict');
const test = require('node:test');
const { sendLoginCode } = require('../utils/mailer');

test('Gmail OTP mailer validates configuration, formats email, and maps SMTP failures safely', async () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    GMAIL_USER: 'verified.sender@gmail.com',
    GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  });

  try {
    let transportConfig;
    let outgoingMessage;
    const delivery = await sendLoginCode('student@example.com', '482193', 'signup', (config) => {
      transportConfig = config;
      return {
        async sendMail(message) {
          outgoingMessage = message;
          return { accepted: [message.to], rejected: [], messageId: 'test-message-id' };
        },
      };
    });

    assert.equal(delivery.accepted, true);
    assert.equal(transportConfig.host, 'smtp.gmail.com');
    assert.equal(transportConfig.port, 465);
    assert.equal(transportConfig.secure, true);
    assert.equal(transportConfig.auth.user, 'verified.sender@gmail.com');
    assert.equal(transportConfig.auth.pass, 'abcdefghijklmnop');
    assert.equal(outgoingMessage.to, 'student@example.com');
    assert.equal(outgoingMessage.subject, 'Verify Your Student Account');
    assert.match(outgoingMessage.text, /482193/);
    assert.match(outgoingMessage.html, /482193/);
    assert.match(outgoingMessage.html, /expires in <strong>5 minutes<\/strong>/);
    assert.equal(JSON.stringify(outgoingMessage).includes('abcdefghijklmnop'), false);

    await assert.rejects(
      sendLoginCode('student@example.com', '482193', 'signup', () => ({
        async sendMail() {
          throw Object.assign(new Error('sensitive transport details'), { code: 'EAUTH' });
        },
      })),
      (error) =>
        error.statusCode === 503 &&
        error.message.includes('Google App Password') &&
        !error.message.includes('sensitive transport details'),
    );

    await assert.rejects(
      sendLoginCode('student@example.com', '482193', 'signup', () => ({
        async sendMail() {
          return { accepted: [], rejected: ['student@example.com'] };
        },
      })),
      (error) => error.statusCode === 400 && error.message.includes('did not accept'),
    );

    delete process.env.GMAIL_APP_PASSWORD;
    await assert.rejects(
      sendLoginCode('student@example.com', '482193', 'signup'),
      (error) => error.statusCode === 503 && error.message.includes('GMAIL_APP_PASSWORD'),
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
