const upcomingButton = document.getElementById('upcomingBtn');
const pastButton = document.getElementById('pastBtn');

if (upcomingButton && pastButton) {
  const eventCards = [...document.querySelectorAll('.event-card')];
  const showEvents = (status) => {
    upcomingButton.classList.toggle('active', status === 'upcoming');
    pastButton.classList.toggle('active', status === 'past');
    eventCards.forEach((card) => {
      card.style.display = card.dataset.status === status ? '' : 'none';
    });
  };

  upcomingButton.addEventListener('click', () => showEvents('upcoming'));
  pastButton.addEventListener('click', () => showEvents('past'));
  showEvents('upcoming');
}
