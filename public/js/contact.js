const contactForm = document.getElementById('contactForm');
contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;
  const feedback = document.getElementById('contactFeedback');
  const button = document.getElementById('sendBtn');
  const payload = {
    name: document.getElementById('contactName').value,
    email: document.getElementById('contactEmail').value,
    subject: document.getElementById('contactSubject').value,
    message: document.getElementById('contactMessage').value,
    consent: document.getElementById('consent').checked,
  };
  button.disabled = true;
  button.textContent = 'Sending…';
  feedback.textContent = '';
  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not send your message.');
    feedback.textContent = result.message;
    contactForm.reset();
  } catch (error) {
    feedback.textContent = error.message || 'Unable to reach the server. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Send Message';
  }
});
