const searchablePages = [
  { title: 'Home', description: 'Explore student clubs and activities.', href: 'index.html' },
  { title: 'All Clubs', description: 'Browse and filter clubs by category.', href: 'clubs.html' },
  { title: 'Sherubtse Tarayana', description: 'Community service club.', href: 'Tarayana.html' },
  { title: 'GNH Youth Club', description: 'Promote happiness and wellbeing.', href: 'GNH.html' },
  { title: 'SMS', description: 'Photography, film, and broadcasting.', href: 'SMS.html' },
  {
    title: 'Sherubtse Art Club',
    description: 'Express creativity through art.',
    href: 'Artclub.html',
  },
  {
    title: 'Events',
    description: 'Upcoming activities and past event recaps.',
    href: 'events.html',
  },
  { title: 'Event Registration', description: 'Register for an event.', href: 'register.html' },
  {
    title: 'About Us',
    description: 'Learn about the Sherubtse Clubs community.',
    href: 'About_us.html',
  },
  { title: 'Join a Club', description: 'Submit a membership application.', href: 'join-club.html' },
  { title: 'Contact', description: 'Send a message to the clubs team.', href: 'contact.html' },
];

const queryInput = document.getElementById('searchQuery');
const results = document.getElementById('searchResults');
const searchForm = document.getElementById('searchForm');
queryInput.value = new URLSearchParams(window.location.search).get('q') || '';

function renderSearchResults(query) {
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? searchablePages.filter((page) =>
        `${page.title} ${page.description}`.toLowerCase().includes(normalized),
      )
    : searchablePages;
  results.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = `No pages matched “${query}”. Try a club or event name.`;
    results.append(empty);
    return;
  }
  matches.forEach((page) => {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = page.href;
    const title = document.createElement('strong');
    title.textContent = page.title;
    const description = document.createElement('span');
    description.textContent = page.description;
    link.append(title, description);
    results.append(link);
  });
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  history.replaceState(null, '', `search.html?q=${encodeURIComponent(query)}`);
  renderSearchResults(query);
});
renderSearchResults(queryInput.value);
