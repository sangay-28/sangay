const assert = require('node:assert/strict');
const test = require('node:test');
const { getTransportConfig, sendLoginCode, verifyEmailTransport } = require('../utils/mailer');

test('Gmail OTP mailer validates configuration, formats email, and maps SMTP failures safely', async () => {
  const keys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'SMTP_USER',
    'SMTP_PASSWORD',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMTP_HOST: ' smtp.gmail.com ',
    SMTP_PORT: ' 465 ',
    SMTP_SECURE: ' true ',
    GMAIL_USER: ' verified.sender@gmail.com ',
    GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  });
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;

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

    let verifyCalled = false;
    let closeCalled = false;
    await verifyEmailTransport((config) => {
      assert.equal(config.host, 'smtp.gmail.com');
      return {
        async verify() {
          verifyCalled = true;
          return true;
        },
        async sendMail() {
          assert.fail('SMTP verification must not send an email.');
        },
        close() {
          closeCalled = true;
        },
      };
    });
    assert.equal(verifyCalled, true);
    assert.equal(closeCalled, true);

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

    process.env.GMAIL_USER = ' ';
    process.env.GMAIL_APP_PASSWORD = ' ';
    process.env.SMTP_USER = 'legacy.sender@gmail.com';
    process.env.SMTP_PASSWORD = 'wxyz uvwx rstp q123';
    const legacyConfig = getTransportConfig();
    assert.equal(legacyConfig.auth.user, 'legacy.sender@gmail.com');
    assert.equal(legacyConfig.auth.pass, 'wxyzuvwxrstpq123');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
