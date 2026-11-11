const roleInput = document.querySelector('[name="role"]');
const loginForm = document.getElementById('loginForm');
const verifyForm = document.getElementById('verifyForm');
const feedback = document.getElementById('feedback');
let pendingEmail = '';

function destinationAfterSignIn(accountRole) {
  return accountRole === 'leader' ? 'leader.html' : 'index.html';
}

async function sendCode() {
  const role = roleInput.value;
  const response = await fetch('/api/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pendingEmail, purpose: 'login', role }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not send a code.');
  if (typeof result.testCode !== 'string' || !/^\d{6}$/.test(result.testCode)) {
    throw new Error('The server did not provide a test code. No email was sent. Check OTP_TEST_MODE in Render.');
  }
  loginForm.hidden = true;
  verifyForm.hidden = false;
  document.getElementById('codeSentTo').textContent =
    `TEST MODE - verification code: ${result.testCode}. Expires in five minutes. This code does not verify email ownership.`;
  verifyForm.elements.code.focus();
  return true;
}

document.querySelectorAll('.role').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.role')
      .forEach((item) => item.classList.toggle('active', item === button));
    roleInput.value = button.dataset.role;
    document.getElementById('memberSignup').hidden = roleInput.value !== 'member';
    document.getElementById('leaderNote').hidden = roleInput.value !== 'leader';
    verifyForm.hidden = true;
    loginForm.hidden = false;
    feedback.textContent = '';
  }),
);

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  pendingEmail = loginForm.elements.email.value.trim();
  const button = loginForm.querySelector('button[type="submit"]');
  feedback.textContent = 'Sending a verification code…';
  button.disabled = true;
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
        email: pendingEmail,
        purpose: 'login',
        role: roleInput.value,
        code: verifyForm.elements.code.value.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Code verification failed.');
    window.location.href = destinationAfterSignIn(result.account.role);
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
