const nodemailer = require('nodemailer');

async function sendLoginCode(email, code, purpose) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const intent =
    purpose === 'signup'
      ? 'finish creating your Sherubtse Clubs account'
      : 'sign in to Sherubtse Clubs';
  const subject = 'Your Sherubtse Clubs verification code';
  const text = `Use ${code} to ${intent}. This code expires in 5 minutes. If you did not request it, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a"><h2 style="color:#173c2e">Sherubtse Clubs</h2><p>Use this one-time code to ${intent}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#1f563d">${code}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p></div>`;

  if (resendApiKey) {
    const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [email], subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const details = typeof body.message === 'string' ? body.message : response.statusText;
      const error = new Error(`Resend rejected the email (${response.status}): ${details}`);
      error.code = 'ERESEND';
      error.statusCode = 503;
      throw error;
    }
    return;
  }

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
  try {
    await transporter.sendMail({
      from: from.includes('<') ? from : `Sherubtse Clubs <${from}>`,
      to: email,
      subject,
      text,
      html,
    });
  } finally {
    transporter.close();
  }
}

module.exports = { sendLoginCode };
