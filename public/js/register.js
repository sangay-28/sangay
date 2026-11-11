const registrationForm = document.getElementById('registerForm');
const registrationSuccess = document.getElementById('successMsg');
const eventSelect = document.getElementById('eventSelect');
const selectedEvent = new URLSearchParams(window.location.search).get('event');
fetch('/api/auth/me')
  .then((response) => response.ok ? response.json() : null)
  .then((result) => {
    if (!result || result.account.role !== 'member') return;
    const [firstName, ...lastName] = result.account.fullName.split(' ');
    document.getElementById('firstName').value ||= firstName;
    document.getElementById('lastName').value ||= lastName.join(' ');
    document.getElementById('email').value ||= result.account.email;
    const years = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
    if (years[result.account.year]) document.getElementById('year').value = years[result.account.year];
  })
  .catch(() => {});
if (selectedEvent && eventSelect.querySelector(`option[value="${CSS.escape(selectedEvent)}"]`)) {
  eventSelect.value = selectedEvent;
}

const feedback = document.createElement('p');
feedback.id = 'registrationFeedback';
feedback.setAttribute('role', 'status');
feedback.setAttribute('aria-live', 'polite');
registrationForm.prepend(feedback);

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!registrationForm.reportValidity()) return;
  const button = registrationForm.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  const data = {
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    studentId: document.getElementById('studentId').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    department: document.getElementById('department').value,
    year: document.getElementById('year').value,
    eventId: eventSelect.value,
    role: document.getElementById('role').value,
    message: document.getElementById('message').value,
    consent: document.getElementById('terms').checked,
  };
  feedback.textContent = '';
  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const response = await fetch('/api/event-registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not submit your registration.');
    registrationForm.hidden = true;
    registrationSuccess.classList.add('show');
  } catch (error) {
    feedback.textContent = error.message || 'Unable to reach the server. Please try again.';
    button.disabled = false;
    button.textContent = originalText;
  }
});
