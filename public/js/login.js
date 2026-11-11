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
  loginForm.hidden = true;
  verifyForm.hidden = false;
  const developmentCode = typeof result.developmentCode === 'string';
  document.getElementById('codeSentTo').textContent = developmentCode
    ? `Development verification code: ${result.developmentCode}. It expires in five minutes.`
    : `Enter the verification code sent to ${pendingEmail}.`;
  verifyForm.elements.code.focus();
  return developmentCode;
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
    const developmentCode = await sendCode();
    feedback.textContent = developmentCode
      ? 'Development mode is active. Copy the code shown above into the verification field.'
      : 'Check your inbox and spam folder. New members must create an account first; club leader accounts are created by an administrator.';
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
    const developmentCode = await sendCode();
    feedback.textContent = developmentCode
      ? 'A new development code is shown above.'
      : 'A new code has been sent.';
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
