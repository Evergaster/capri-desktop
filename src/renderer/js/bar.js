// The line her text is typed into, in its own window (Linux): her window can't take the keyboard
// (see createBar in main.js). It only carries what's typed back to the overlay.

const form = document.querySelector('.bar__form');
const input = document.querySelector('.bar__input');
const send = document.querySelector('.bar__send');
const close = document.querySelector('.bar__close');

window.bar.onLabels((opts) => {
  const o = opts || {};
  input.type = o.secret ? 'password' : 'text';
  input.placeholder = o.placeholder || '';
  input.setAttribute('aria-label', o.placeholder || 'Capri');
  send.textContent = o.send || '';
  input.disabled = Boolean(o.disabled);
  if (!o.disabled) {
    input.value = '';
    input.focus();
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || input.disabled) return;
  input.value = '';
  window.bar.submit(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.bar.escape();
});

close.addEventListener('click', () => window.bar.escape());
