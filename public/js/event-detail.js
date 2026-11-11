const eventCatalog = {
  'model-un': {
    title: 'Model UN Conference 2026',
    category: 'Academic',
    date: 'March 25–26, 2026',
    time: '8:00 AM – 5:00 PM',
    venue: 'Sherubtse Hall, Kanglung',
    image: 'images2/discussion.jpeg',
    summary:
      'Students represent nations, debate world issues, and craft resolutions in a simulation of global diplomacy.',
    description:
      'The Sherubtse Model United Nations Conference brings students together for committee sessions, research, formal debate, and resolution drafting.',
    organizer: 'Sherubtse MUN Club',
    register: true,
  },
  'art-exhibition': {
    title: 'Art Exhibition 2026',
    category: 'Cultural',
    date: 'April 5, 2026',
    time: 'To be announced',
    venue: 'Art Block',
    image: 'images2/Arts exibition.jpeg',
    summary: 'Student artists share creative work from across departments.',
    description:
      'Explore paintings, drawings, and other work created by the Sherubtse student community.',
    organizer: 'Sherubtse Art Club',
    register: true,
  },
  'culture-night': {
    title: 'Culture Night',
    category: 'Social',
    date: 'April 12, 2026',
    time: 'To be announced',
    venue: 'Main Hall',
    image: 'images2/cultural.jpeg',
    summary: 'A campus celebration of the cultures and traditions of Bhutan.',
    description:
      'Students share performances, traditional dress, music, and cultural stories from their home regions.',
    organizer: 'Cultural Unit',
    register: true,
  },
  'indoor-tournament': {
    title: 'Indoor Tournament 2026',
    category: 'Sports',
    date: 'April 20, 2026',
    time: 'To be announced',
    venue: 'Sports Hall',
    image: 'images2/tt.jpeg',
    summary: 'Students compete in indoor games and represent their teams.',
    description:
      'The tournament brings campus teams together for friendly competition and an active day at Sherubtse.',
    organizer: 'Sherubtse Clubs',
    register: true,
  },
  debate: {
    title: 'Debate Competition',
    category: 'Academic',
    date: 'May 3, 2026',
    time: 'To be announced',
    venue: 'Seminar Hall',
    image: 'images2/debate.jpeg',
    summary: 'Students develop arguments and test their ideas in structured debate.',
    description:
      'Teams research a motion, present their cases, and respond to opposing arguments before a panel.',
    organizer: 'Sherubtse Clubs',
    register: true,
  },
  marathon: {
    title: 'Annual Marathon',
    category: 'Sports',
    date: 'May 10, 2026',
    time: 'To be announced',
    venue: 'Campus Trail',
    image: 'images2/run.jpeg',
    summary: 'Run the scenic trails around the Kanglung campus.',
    description:
      'The annual campus marathon welcomes students to take part in a community run around Kanglung.',
    organizer: 'Sherubtse Clubs',
    register: true,
  },
  'un-workshop': {
    title: 'UN Workshop',
    category: 'Academic',
    date: 'Date to be announced',
    time: 'To be announced',
    venue: 'Sherubtse College',
    image: 'images2/panel.jpeg',
    summary: 'A student workshop on global issues and the work of the United Nations.',
    description:
      'Participants learn about international cooperation and discuss current global challenges.',
    organizer: 'UN Club',
    register: true,
  },
  'music-fest': {
    title: 'Music Festival',
    category: 'Cultural',
    date: 'Past event',
    time: 'Event concluded',
    venue: 'Sherubtse College',
    image: 'images2/speak.jpeg',
    summary: 'A recap of a campus music celebration.',
    description:
      'Students and performers came together for music and live performances at Sherubtse.',
    organizer: 'Sherubtse Clubs',
    register: false,
  },
  'cricket-cup': {
    title: 'Cricket Cup',
    category: 'Sports',
    date: 'Past event',
    time: 'Event concluded',
    venue: 'Sherubtse College',
    image: 'images2/games.jpeg',
    summary: 'A recap of the campus cricket competition.',
    description: 'Student teams competed in a friendly cricket tournament on campus.',
    organizer: 'Sherubtse Clubs',
    register: false,
  },
  'science-fair': {
    title: 'Science Fair',
    category: 'Academic',
    date: 'Past event',
    time: 'Event concluded',
    venue: 'Sherubtse College',
    image: 'images2/demo.jpeg',
    summary: 'A recap of student research and science demonstrations.',
    description:
      'Students presented projects, experiments, and demonstrations to the campus community.',
    organizer: 'Sherubtse Clubs',
    register: false,
  },
};

const eventId = new URLSearchParams(window.location.search).get('id') || 'model-un';
const event = eventCatalog[eventId];
if (!event) {
  const message = document.createElement('p');
  message.textContent = 'This event link may be out of date.';
  const eventsLink = document.createElement('a');
  eventsLink.href = 'events.html';
  eventsLink.className = 'btn-primary';
  eventsLink.textContent = 'Browse events';
  document.querySelector('.detail-layout').replaceChildren(message, eventsLink);
  document.querySelector('.page-hero h1').textContent = 'Event not found';
  document.querySelector('.page-hero p').textContent = 'Choose an event from the events page.';
} else {
  document.title = `${event.title} | Sherubtse Clubs`;
  document.querySelector('.page-hero h1').textContent = event.title;
  document.querySelector('.page-hero p').textContent =
    `${event.category} · ${event.date} · ${event.venue}`;
  document.querySelector('.breadcrumb span').textContent = event.title;
  document.querySelector('.detail-img img').src = event.image;
  document.querySelector('.detail-img img').alt = event.title;
  const main = document.querySelector('.detail-main');
  const badge = main.querySelector('.badge');
  badge.className = `badge badge-${event.category.toLowerCase()}`;
  badge.textContent = event.category;
  const paragraphs = main.querySelectorAll(':scope > p');
  paragraphs[0].textContent = event.summary;
  paragraphs[1].textContent = event.description;
  const sections = main.querySelectorAll(':scope > h3');
  const expectationsByCategory = {
    Academic: [
      'Explore the event topic and learn from other students',
      'Take part in presentations or discussion',
      'Connect with the Sherubtse community',
    ],
    Cultural: [
      'Enjoy student performances and creative work',
      'Learn about traditions and stories shared by students',
      'Connect with the campus community',
    ],
    Social: [
      'Meet students from across campus',
      'Take part in shared activities and performances',
      'Celebrate the Sherubtse community',
    ],
    Sports: [
      'Join a friendly campus competition',
      'Support teams and participants',
      'Take part in an active community event',
    ],
  };
  const replaceList = (oldList, items) => {
    const list = document.createElement('ul');
    items.forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      list.append(item);
    });
    oldList.replaceWith(list);
  };
  replaceList(sections[0].nextElementSibling, expectationsByCategory[event.category]);
  sections[1].nextElementSibling.textContent = event.register
    ? 'Students interested in this event can use the registration form or contact the organizer for eligibility and availability.'
    : 'This event has concluded. Browse the gallery for a selection of event photos.';
  replaceList(sections[2].nextElementSibling, [event.date, event.time, event.venue]);

  const metaValues = [
    event.date,
    event.time,
    event.venue,
    'See event coordinator',
    event.category,
    event.organizer,
  ];
  document.querySelectorAll('.sidebar-meta-item span').forEach((item, index) => {
    item.textContent = metaValues[index];
  });
  document.querySelector('.spots-label').textContent = event.register
    ? 'Check with the organizer for current availability.'
    : 'Registration for this event has closed.';
  document.querySelector('.spots-fill').style.width = '0%';
  const registerButtons = [
    ...main.querySelectorAll('a.btn-primary'),
    ...document.querySelectorAll('.detail-sidebar .sidebar-card:nth-child(2) a.btn-primary'),
  ];
  registerButtons.forEach((link) => {
    if (!event.register) {
      link.remove();
      return;
    }
    link.href = `register.html?event=${encodeURIComponent(eventId)}`;
  });
  if (!event.register) {
    const recapLink = document.createElement('a');
    recapLink.className = 'btn-primary';
    recapLink.href = `gallery.html?event=${encodeURIComponent(eventId)}`;
    recapLink.textContent = 'View Event Gallery';
    main.append(recapLink);
    document.querySelector('.detail-sidebar .sidebar-card:nth-child(2)').hidden = true;
  }
}

document.querySelectorAll('[data-share]').forEach((button) => {
  button.addEventListener('click', async (clickEvent) => {
    clickEvent.preventDefault();
    const url = window.location.href;
    const title = event?.title || document.title;
    const action = button.dataset.share;
    const shareUrls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    };
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
        button.setAttribute('aria-label', 'Event link copied');
        window.setTimeout(() => button.setAttribute('aria-label', 'Copy event link'), 1800);
      } catch {
        window.prompt('Copy this event link:', url);
      }
      return;
    }
    window.open(shareUrls[action], '_blank', 'noopener,noreferrer');
  });
});
