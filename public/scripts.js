// A little bit of fun to prove the presentation layer is alive and running
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
const button = document.getElementById('celebrate');
const overlay = document.getElementById('overlay');
const closeModal = document.getElementById('closeModal');
const balloonLayer = document.getElementById('balloons');


function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


const colors = ['#ff6b6b', '#f7b733', '#4ecdc4', '#556fb5', '#ffffff', '#ff9ff3'];
let particles = [];


// Two bursts, like a pair of party poppers going off in the bottom corners.
function popperBurst() {
  const corners = [
    { x: 0, direction: 1 },
    { x: canvas.width, direction: -1 },
  ];


  corners.forEach(({ x, direction }) => {
    for (let i = 0; i < 90; i++) {
      particles.push({
        x,
        y: canvas.height,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: direction * (3 + Math.random() * 6),
        vy: -(9 + Math.random() * 10),
        gravity: 0.28 + Math.random() * 0.12,
        rotation: Math.random() * 360,
        spin: -12 + Math.random() * 24,
      });
    }
  });
}


function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);


  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.rotation += p.spin;


    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  });


  particles = particles.filter((p) => p.y < canvas.height + 40);
  requestAnimationFrame(animateParticles);
}
animateParticles();


// Balloons drifting up from the bottom of the screen.
function spawnBalloons() {
  const balloonColors = ['#ff6b6b', '#f7b733', '#4ecdc4', '#556fb5', '#ff9ff3', '#feca57'];


  for (let i = 0; i < 16; i++) {
    const balloon = document.createElement('div');
    balloon.className = 'balloon';
    balloon.style.left = `${Math.random() * 96}%`;
    balloon.style.background = balloonColors[Math.floor(Math.random() * balloonColors.length)];
    const duration = 4 + Math.random() * 3;
    balloon.style.animationDuration = `${duration}s`;
    balloon.style.animationDelay = `${Math.random() * 0.8}s`;


    balloonLayer.appendChild(balloon);
    balloon.addEventListener('animationend', () => balloon.remove());
  }
}


function celebrate() {
  overlay.classList.add('show');
  popperBurst();
  spawnBalloons();
}


function hideModal() {
  overlay.classList.remove('show');
}


button.addEventListener('click', celebrate);
closeModal.addEventListener('click', hideModal);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) hideModal();
});
