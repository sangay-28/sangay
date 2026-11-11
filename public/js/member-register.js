const registerForm = document.getElementById('registerForm');
const verifyForm = document.getElementById('verifyForm');
const feedback = document.getElementById('feedback');
let signupData;

function destinationAfterSignup() {
  return 'index.html';
}

async function sendCode() {
  const response = await fetch('/api/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...signupData, purpose: 'signup', role: 'member' }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not send a verification code.');
  if (typeof result.testCode !== 'string' || !/^\d{6}$/.test(result.testCode)) {
    throw new Error('The server did not provide a test code. No email was sent. Check OTP_TEST_MODE in Render.');
  }
  registerForm.hidden = true;
  verifyForm.hidden = false;
  document.getElementById('codeSentTo').textContent =
    `TEST MODE - verification code: ${result.testCode}. Expires in five minutes. This code does not verify email ownership.`;
  verifyForm.elements.code.focus();
  return true;
}

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(registerForm);
  signupData = Object.fromEntries(form);
  signupData.year = Number(signupData.year);
  signupData.consent = registerForm.elements.consent.checked;
  const button = registerForm.querySelector('button[type="submit"]');
  button.disabled = true;
  feedback.textContent = 'Sending verification code…';
  try {
    const testCode = await sendCode();
    feedback.textContent = testCode
      ? 'Your verification code is ready. Enter the code displayed below.'
      : '';
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

verifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = verifyForm.querySelector('button[type="submit"]');
  button.disabled = true;
  feedback.textContent = 'Verifying code…';
  try {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signupData.email,
        purpose: 'signup',
        role: 'member',
        code: verifyForm.elements.code.value.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Code verification failed.');
    window.location.href = destinationAfterSignup();
  } catch (error) {
    feedback.textContent = error.message;
    button.disabled = false;
  }
});

document.getElementById('resendButton').addEventListener('click', async () => {
  const button = document.getElementById('resendButton');
  button.disabled = true;
  try {
    const testCode = await sendCode();
    feedback.textContent = testCode
      ? 'Your new verification code is ready. Enter the code displayed above.'
      : '';
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
