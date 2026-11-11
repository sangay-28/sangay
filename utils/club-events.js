const CLUB_EVENTS = {
  'model-un': {
    title: 'Model UN Conference 2026',
    category: 'Academic',
    date: 'March 25–26, 2026',
    club: 'UN Club',
    status: 'Upcoming',
  },
  'art-exhibition': {
    title: 'Art Exhibition 2026',
    category: 'Cultural',
    date: 'April 5, 2026',
    club: 'Sherubtse Art Club',
    status: 'Upcoming',
  },
  'culture-night': {
    title: 'Culture Night',
    category: 'Social',
    date: 'April 12, 2026',
    club: 'Cultural Unit',
    status: 'Upcoming',
  },
  'indoor-tournament': {
    title: 'Indoor Tournament 2026',
    category: 'Sports',
    date: 'April 20, 2026',
    club: 'Taekwondo Club',
    status: 'Upcoming',
  },
  debate: {
    title: 'Debate Competition',
    category: 'Academic',
    date: 'May 3, 2026',
    club: 'Democracy Club',
    status: 'Upcoming',
  },
  marathon: {
    title: 'Annual Marathon',
    category: 'Sports',
    date: 'May 10, 2026',
    club: 'Taekwondo Club',
    status: 'Upcoming',
  },
  'un-workshop': {
    title: 'UN Workshop',
    category: 'Academic',
    date: 'Date to be announced',
    club: 'UN Club',
    status: 'Upcoming',
  },
  'music-fest': {
    title: 'Music Festival',
    category: 'Cultural',
    date: 'Past event',
    club: 'Cultural Unit',
    status: 'Completed',
  },
  'cricket-cup': {
    title: 'Cricket Cup',
    category: 'Sports',
    date: 'Past event',
    club: 'Taekwondo Club',
    status: 'Completed',
  },
  'science-fair': {
    title: 'Science Fair',
    category: 'Academic',
    date: 'Past event',
    club: 'Democracy Club',
    status: 'Completed',
  },
};

const REGISTRABLE_EVENT_IDS = new Set([
  'model-un', 'art-exhibition', 'culture-night', 'indoor-tournament', 'debate', 'marathon', 'un-workshop',
]);

module.exports = { CLUB_EVENTS, REGISTRABLE_EVENT_IDS };
