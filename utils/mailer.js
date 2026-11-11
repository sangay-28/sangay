const nodemailer = require('nodemailer');

async function sendLoginCode(email, code, purpose) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM || user;
  if (!host || !user || !password || !from) {
    const error = new Error(
      'Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in .env.',
    );
    error.statusCode = 503;
    throw error;
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass: password },
  });
  const intent =
    purpose === 'signup'
      ? 'finish creating your Sherubtse Clubs account'
      : 'sign in to Sherubtse Clubs';
  await transporter.sendMail({
    from: from.includes('<') ? from : `Sherubtse Clubs <${from}>`,
    to: email,
    subject: 'Your Sherubtse Clubs verification code',
    text: `Use ${code} to ${intent}. This code expires in 5 minutes. If you did not request it, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a"><h2 style="color:#173c2e">Sherubtse Clubs</h2><p>Use this one-time code to ${intent}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#1f563d">${code}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p></div>`,
  });
  await transporter.close();
}

module.exports = { sendLoginCode };
