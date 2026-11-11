let activeClubCategory = 'All';

function applyClubFilters() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  document.querySelectorAll('#clubsGrid .club-card').forEach((card) => {
    const matchesCategory =
      activeClubCategory === 'All' || card.dataset.category === activeClubCategory;
    const matchesQuery = card.textContent.toLowerCase().includes(query);
    card.hidden = !(matchesCategory && matchesQuery);
  });
}

function filterClubs() {
  applyClubFilters();
}

function setFilter(category, button) {
  activeClubCategory = category;
  document.querySelectorAll('.filter-tabs .tab').forEach((tab) => tab.classList.remove('active'));
  button.classList.add('active');
  applyClubFilters();
}

window.filterClubs = filterClubs;
window.setFilter = setFilter;

document.querySelectorAll('.club-card .join-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const club = button.closest('.club-card').querySelector('h3').textContent.trim();
    window.location.href = `join-club.html?club=${encodeURIComponent(club)}`;
  });
});

document.getElementById('resetClubFilters').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  setFilter('All', document.querySelector('.filter-tabs .tab[data-category="All"]'));
});
