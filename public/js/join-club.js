const clubFromLink = new URLSearchParams(window.location.search).get('club');
const clubField = document.getElementById('club');
fetch('/api/auth/me')
  .then((response) => response.ok ? response.json() : null)
  .then((result) => {
    if (!result || result.account.role !== 'member') return;
    document.getElementById('fullName').value ||= result.account.fullName;
    document.getElementById('applicationEmail').value ||= result.account.email;
    document.getElementById('course').value ||= result.account.course || '';
    if (result.account.year) document.getElementById('year').value = String(result.account.year);
  })
  .catch(() => {});
if (
  clubFromLink &&
  [...clubField.options].some(
    (option) => option.value === clubFromLink || option.text === clubFromLink,
  )
) {
  clubField.value = clubFromLink;
}

async function handleSubmit() {
  const formData = {
    fullName: document.getElementById('fullName').value,
    email: document.getElementById('applicationEmail').value,
    course: document.getElementById('course').value,
    year: document.getElementById('year').value,
    club: document.getElementById('club').value,
    consent: document.getElementById('termsCheck').checked,
  };
  const error = document.getElementById('submitErr');
  const button = document.getElementById('submitBtn');
  error.textContent = '';

  if (!formData.fullName.trim() || !formData.course.trim() || !formData.club) {
    error.textContent = 'Please complete your name, course, and club.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
    error.textContent = 'Please enter a valid email address.';
    return;
  }
  if (!document.getElementById('termsCheck').checked) {
    error.textContent = 'Please agree to the terms and conditions to proceed.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const response = await fetch('/api/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not submit your application.');
    document.getElementById('formContent').hidden = true;
    document.getElementById('successOverlay').classList.add('show');
  } catch (submissionError) {
    error.textContent = submissionError.message || 'Unable to reach the server. Please try again.';
    button.disabled = false;
    button.textContent = 'Join Now';
  }
}

window.handleSubmit = handleSubmit;
