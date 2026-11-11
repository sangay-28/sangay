const { Resend } = require('resend');

function createDeliveryError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  return error;
}

async function sendLoginCode(email, code, purpose) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw createDeliveryError(
      'Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM in the Render environment.',
      'EEMAILCONFIG',
    );
  }

  const intent =
    purpose === 'signup'
      ? 'finish creating your Sherubtse Clubs account'
      : 'sign in to Sherubtse Clubs';
  const resend = new Resend(apiKey);
  let result;
  try {
    result = await resend.emails.send({
      from,
      to: [email],
      subject: 'Your Sherubtse Clubs verification code',
      text: `Use ${code} to ${intent}. This code expires in 5 minutes. If you did not request it, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a"><h2 style="color:#173c2e">Sherubtse Clubs</h2><p>Use this one-time code to ${intent}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#1f563d">${code}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p></div>`,
    });
  } catch (cause) {
    const error = createDeliveryError(
      'Could not connect to Resend to send the verification email. Try again later.',
      'ERESEND_NETWORK',
    );
    error.cause = cause;
    throw error;
  }

  if (result.error) {
    const statusCode = result.error.statusCode;
    const detail = result.error.message || 'Unknown provider error';
    if (statusCode === 403 && /only send testing emails to your own email/i.test(detail)) {
      throw createDeliveryError(
        'Resend testing mode only delivers to the email address on your Resend account. To send codes to other students, verify a domain in Resend and set RESEND_FROM to an address on that domain.',
        'ERESEND_TEST_RECIPIENT',
      );
    }

    // Never include request headers or credentials in logs or client responses.
    const safeDetail = detail.split(apiKey).join('[redacted]');
    throw createDeliveryError(
      `Resend rejected the verification email${statusCode ? ` (${statusCode})` : ''}: ${safeDetail}`,
      'ERESEND_REJECTED',
    );
  }

  if (!result.data?.id) {
    throw createDeliveryError(
      'Resend did not confirm the verification email request. Please try again.',
      'ERESEND_UNCONFIRMED',
    );
  }
}

module.exports = { sendLoginCode };
