// Starts (or restarts) the draw animation on an SVG with class="drawing".
function draw(svg) {
  svg.classList.remove('is-drawing');
  void svg.getBoundingClientRect(); // force reflow so the animation restarts
  svg.classList.add('is-drawing');
}

const drawings = document.querySelectorAll('.drawing');

// Draw each shape when it scrolls into view.
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      draw(entry.target);
      observer.unobserve(entry.target);
    }
  }
}, { threshold: 0.5 });

drawings.forEach((svg) => observer.observe(svg));

document.getElementById('replay').addEventListener('click', () => {
  drawings.forEach(draw);
});
