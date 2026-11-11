const { BrevoClient } = require('@getbrevo/brevo');

function createDeliveryError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  return error;
}

function describeBrevoError(cause, apiKey) {
  const statusCode = cause.statusCode;
  const detail = String(cause.message || 'Unknown provider error')
    .split(apiKey)
    .join('[redacted]');
  if (statusCode === 401) {
    return createDeliveryError(
      'Brevo rejected the API key. Check BREVO_API_KEY in your Render environment.',
      'EBREVO_AUTH',
    );
  }
  if (/sender|from address|from email/i.test(detail)) {
    return createDeliveryError(
      'Brevo rejected the sender address. Verify BREVO_FROM_EMAIL as a sender in your Brevo account.',
      'EBREVO_SENDER',
    );
  }
  if (statusCode === 429) {
    return createDeliveryError(
      'Brevo’s sending limit was reached. Please wait before requesting another code.',
      'EBREVO_RATE_LIMIT',
    );
  }
  return createDeliveryError(
    `Brevo rejected the verification email${statusCode ? ` (${statusCode})` : ''}: ${detail}`,
    'EBREVO_REJECTED',
  );
}

async function sendLoginCode(email, code, purpose, mailerClient) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const senderName = process.env.BREVO_FROM_NAME?.trim() || 'Sherubtse Clubs';
  if (!apiKey || !senderEmail) {
    throw createDeliveryError(
      'Email delivery is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL in Render.',
      'EEMAILCONFIG',
    );
  }

  const intent =
    purpose === 'signup'
      ? 'finish creating your Sherubtse Clubs account'
      : 'sign in to Sherubtse Clubs';
  const client = mailerClient || new BrevoClient({ apiKey, timeoutInSeconds: 15, maxRetries: 0 });
  let result;
  try {
    result = await client.transactionalEmails.sendTransacEmail({
      sender: { email: senderEmail, name: senderName },
      to: [{ email }],
      subject: 'Your Sherubtse Clubs verification code',
      textContent: `Use ${code} to ${intent}. This code expires in 5 minutes. If you did not request it, you can ignore this email.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a"><h2 style="color:#173c2e">Sherubtse Clubs</h2><p>Use this one-time code to ${intent}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#1f563d">${code}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p></div>`,
    });
  } catch (cause) {
    throw describeBrevoError(cause, apiKey);
  }

  if (!result?.messageId) {
    throw createDeliveryError(
      'Brevo did not confirm the verification email request. Please try again.',
      'EBREVO_UNCONFIRMED',
    );
  }
}

module.exports = { sendLoginCode };
