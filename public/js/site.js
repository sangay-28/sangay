const hamburger = document.querySelector('.hamburger');
if (hamburger) {
  hamburger.addEventListener('click', () => {
    const navigation = document.querySelector('.nav-links');
    const open = navigation.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
  });
}
