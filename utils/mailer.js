const nodemailer = require('nodemailer');

function mailError(kind, message, statusCode = 503) {
  return Object.assign(new Error(message), {
    code: `EOTP_EMAIL_${kind}`,
    statusCode,
  });
}

function getTransportConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const portValue = process.env.SMTP_PORT?.trim();
  const port = Number(portValue);
  const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureValue === 'true';
  const user = process.env.GMAIL_USER?.trim() || process.env.SMTP_USER?.trim();
  const password =
    process.env.GMAIL_APP_PASSWORD?.trim().replace(/\s/g, '') ||
    process.env.SMTP_PASSWORD?.trim().replace(/\s/g, '');

  const missing = [];
  if (!user) missing.push('GMAIL_USER (or SMTP_USER)');
  if (!password) missing.push('GMAIL_APP_PASSWORD (or SMTP_PASSWORD)');
  if (!host) missing.push('SMTP_HOST');
  if (!portValue) missing.push('SMTP_PORT');
  if (!secureValue) missing.push('SMTP_SECURE');
  if (missing.length) {
    throw mailError(
      'CONFIG',
      `Email delivery configuration is missing: ${missing.join(', ')}. Add these values to .env or the hosting environment.`,
    );
  }
  if (
    !Number.isInteger(port) ||
    port !== 465 ||
    secureValue !== 'true' ||
    host !== 'smtp.gmail.com'
  ) {
    throw mailError(
      'CONFIG',
      'Gmail SMTP must use SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, and SMTP_SECURE=true.',
    );
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
}

function createEmailContent(code) {
  return {
    subject: 'Verify Your Student Account',
    text: [
      'Hello,',
      '',
      'Thank you for registering with our Student Portal.',
      '',
      `Your verification code is: ${code}`,
      '',
      'This code expires in 5 minutes.',
      'If you did not request this verification code, please ignore this email.',
      '',
      'Thank you,',
      'Student Portal Team',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verify your student account</title>
  </head>
  <body style="margin:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
          <tr><td style="padding:32px 28px 12px">
            <p style="margin:0 0 12px;color:#53627a;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">Student Portal</p>
            <h1 style="margin:0;color:#172033;font-size:25px;line-height:1.3">Verify your account</h1>
          </td></tr>
          <tr><td style="padding:8px 28px 32px;font-size:16px;line-height:1.6">
            <p style="margin:0 0 16px">Hello,</p>
            <p style="margin:0 0 20px">Thank you for registering with our Student Portal. Enter this verification code in the app:</p>
            <p style="margin:0 0 20px;padding:18px 12px;border-radius:10px;background:#f1f5f9;color:#172033;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
            <p style="margin:0 0 8px;color:#53627a">This code expires in <strong>5 minutes</strong>.</p>
            <p style="margin:0 0 20px;color:#53627a">If you did not request this verification code, please ignore this email.</p>
            <p style="margin:0">Thank you,<br><strong>Student Portal Team</strong></p>
          </td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;color:#7b8798;font-size:12px;line-height:1.5">This is an automated account verification message.</p>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

async function sendLoginCode(email, code, purpose, createTransport = nodemailer.createTransport) {
  const config = getTransportConfig();
  const content = createEmailContent(code);

  try {
    const transporter = createTransport(config);
    const info = await transporter.sendMail({
      from: { name: 'Student Portal', address: config.auth.user },
      to: email,
      ...content,
      headers: { 'X-Student-Portal-Purpose': purpose },
    });
    const accepted = (info.accepted || []).map((address) => String(address).toLowerCase());
    if (!accepted.includes(email.toLowerCase())) {
      throw mailError(
        'RECIPIENT',
        'Gmail did not accept this recipient address. Check the address and try again.',
        400,
      );
    }
    return { accepted: true, messageId: info.messageId };
  } catch (error) {
    throw mapSmtpError(error);
  }
}

function mapSmtpError(error) {
  if (error.code?.startsWith('EOTP_EMAIL_')) return error;
  if (error.code === 'EAUTH') {
    return mailError(
      'AUTH',
      'Gmail SMTP authentication failed. Check GMAIL_USER and use a Google App Password.',
    );
  }
  if (
    [
      'ECONNECTION',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ESOCKET',
      'EDNS',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETLS',
    ].includes(error.code)
  ) {
    return mailError(
      'UNAVAILABLE',
      'Gmail email delivery is temporarily unavailable. Try again later.',
    );
  }
  return mailError('DELIVERY', 'Gmail could not accept the verification email. Try again later.');
}

async function verifyEmailTransport(createTransport = nodemailer.createTransport) {
  let transporter;
  try {
    transporter = createTransport(getTransportConfig());
    await transporter.verify();
    return true;
  } catch (error) {
    throw mapSmtpError(error);
  } finally {
    transporter?.close?.();
  }
}

module.exports = { createEmailContent, getTransportConfig, sendLoginCode, verifyEmailTransport };
