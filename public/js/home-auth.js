const signInLink = document.getElementById('signInLink');
const signUpLink = document.getElementById('signUpLink');
const signedInNav = document.getElementById('signedInNav');
const signedInName = document.getElementById('signedInName');
const signedInWelcome = document.getElementById('signedInWelcome');
const signOutButton = document.getElementById('signOutButton');

function showSignedIn(account) {
  const name = account.fullName || 'there';
  signInLink.hidden = true;
  signUpLink.hidden = true;
  signedInNav.hidden = false;
  signedInName.textContent = `Hi, ${name}`;
  signedInWelcome.textContent = `Welcome back, ${name}! You’re signed in.`;
  signedInWelcome.hidden = false;
}

function showSignedOut() {
  signInLink.hidden = false;
  signUpLink.hidden = false;
  signedInNav.hidden = true;
  signedInWelcome.hidden = true;
}

fetch('/api/auth/me')
  .then(async (response) => {
    if (!response.ok) throw new Error('No active session');
    const result = await response.json();
    showSignedIn(result.account);
  })
  .catch(showSignedOut);

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    showSignedOut();
  } finally {
    signOutButton.disabled = false;
  }
});
