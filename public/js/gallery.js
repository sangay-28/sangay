const galleries = {
  'music-fest': {
    title: 'Music Festival Gallery',
    eventTitle: 'Music Festival',
    images: [
      ['images2/speak.jpeg', 'Students speaking at a campus event'],
      ['images2/cultural.jpeg', 'Cultural performance at Sherubtse'],
      ['images2/Arts exibition.jpeg', 'Student exhibition'],
    ],
  },
  'cricket-cup': {
    title: 'Cricket Cup Gallery',
    eventTitle: 'Cricket Cup',
    images: [
      ['images2/games.jpeg', 'Students playing a campus game'],
      ['images2/tt.jpeg', 'Indoor sports competition'],
      ['images2/run.jpeg', 'Students taking part in a sports event'],
    ],
  },
  'science-fair': {
    title: 'Science Fair Gallery',
    eventTitle: 'Science Fair',
    images: [
      ['images2/demo.jpeg', 'Students demonstrating a project'],
      ['images2/panel.jpeg', 'Students attending a presentation'],
      ['images2/discussion.jpeg', 'Students discussing a project'],
    ],
  },
};

const eventId = new URLSearchParams(window.location.search).get('event') || 'music-fest';
const gallery = galleries[eventId];
const grid = document.getElementById('galleryGrid');
if (!gallery) {
  document.getElementById('galleryTitle').textContent = 'Gallery not found';
  document.getElementById('galleryIntro').textContent = 'Choose a gallery from the events page.';
  grid.innerHTML = '<p class="gallery-empty">No gallery is available for this event.</p>';
  document.getElementById('recapLink').href = 'events.html';
} else {
  document.title = `${gallery.title} | Sherubtse Clubs`;
  document.getElementById('galleryTitle').textContent = gallery.title;
  document.getElementById('galleryIntro').textContent =
    `A selection of photos from ${gallery.eventTitle}.`;
  document.getElementById('recapLink').href = `event-detail.html?id=${encodeURIComponent(eventId)}`;
  gallery.images.forEach(([src, alt]) => {
    const figure = document.createElement('figure');
    figure.className = 'gallery-item';
    const image = document.createElement('img');
    image.src = src;
    image.alt = alt;
    image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = alt;
    figure.append(image, caption);
    grid.append(figure);
  });
}
