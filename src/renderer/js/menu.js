// Her menu, drawn in the overlay: the native popup can't take clicks under some Linux compositors.
// The items come from main.js as { id, label, type, checked, enabled, accelerator, submenu }.

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class Menu {
  constructor(host) {
    this.host = host;
    this.open = false;
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.hidden = true;
    document.getElementById('stage').appendChild(this.root);
    this.view = { w: innerWidth, h: innerHeight }; // her world (app.js keeps it current)
    this.origin = { x: 0, y: 0 }; // where her window sits in it
    this.onLayout = null; // () => void, the menu changed size: her window has to catch up now
    document.addEventListener('mousedown', (e) => {
      if (this.open && !this.root.contains(e.target)) this.hide();
    });
    // a submenu opens to the side: put it back inside her world when it wouldn't fit
    this.root.addEventListener('mouseover', (e) => {
      const row = e.target.closest?.('.menu__has-sub');
      if (row && this.root.contains(row)) this.placeSub(row);
    });
  }

  show(items, x, y) {
    if (!items || !items.length) return this.hide();
    this.root.replaceChildren(this.build(items));
    this.root.hidden = false;
    this.open = true;
    this.root.style.maxHeight = '';
    this.root.style.left = '0px';
    this.root.style.top = '0px';
    let r = this.root.getBoundingClientRect();
    // taller than her world: it scrolls, or the last items would hang off the screen (the submenus
    // are fixed, so the scroll can't cut them)
    if (r.height > this.view.h - 8) {
      this.root.style.maxHeight = `${this.view.h - 8}px`;
      r = this.root.getBoundingClientRect();
    }
    const px = Math.max(4, Math.min(x ?? 8, this.view.w - r.width - 8));
    const py = Math.max(4, Math.min(y ?? 8, this.view.h - r.height - 8));
    this.root.style.left = `${px}px`;
    this.root.style.top = `${py}px`;
    this.onLayout?.();
  }

  // Where its row is, inside her world, or flipped left / lifted when it would go past the edge.
  placeSub(row) {
    const sub = row.querySelector(':scope > .menu__list');
    if (!sub || !sub.offsetWidth) return;
    const r = row.getBoundingClientRect();
    const s = sub.getBoundingClientRect();
    const x = r.right + this.origin.x;
    const left = x + s.width <= this.view.w - 4 ? x - 2 : r.left + this.origin.x - s.width + 2;
    const top = Math.max(4, Math.min(r.top + this.origin.y - 6, this.view.h - s.height - 4));
    sub.style.left = `${Math.round(left)}px`;
    sub.style.top = `${Math.round(top)}px`;
  }

  hide() {
    if (!this.open) return;
    this.root.hidden = true;
    this.open = false;
    this.onLayout?.();
  }

  build(items) {
    const list = el('div', 'menu__list');
    for (const it of items) {
      if (it.type === 'separator') {
        list.append(el('div', 'menu__sep'));
        continue;
      }
      const row = it.submenu ? el('div', 'menu__item') : el('button', 'menu__item');
      if (!it.enabled) row.classList.add('is-disabled');
      if (!it.submenu) row.type = 'button';
      const mark = it.type === 'checkbox' ? (it.checked ? '✓' : '') : it.type === 'radio' ? (it.checked ? '●' : '') : '';
      row.append(el('span', 'menu__mark', mark), el('span', 'menu__label', it.label));
      if (it.accelerator) row.append(el('span', 'menu__acc', it.accelerator));
      if (it.submenu) {
        row.classList.add('menu__has-sub');
        row.append(el('span', 'menu__arrow', '›'), this.build(it.submenu));
      } else {
        row.addEventListener('click', () => {
          if (it.enabled) this.host.menuClick(it.id);
          this.hide();
        });
      }
      list.append(row);
    }
    return list;
  }
}
