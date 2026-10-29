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
    document.body.appendChild(this.root);
    document.addEventListener('mousedown', (e) => {
      if (this.open && !this.root.contains(e.target)) this.hide();
    });
  }

  show(items, x, y) {
    if (!items || !items.length) return this.hide();
    this.root.replaceChildren(this.build(items));
    this.root.hidden = false;
    this.open = true;
    const r = this.root.getBoundingClientRect();
    const px = Math.max(4, Math.min(x ?? 8, innerWidth - r.width - 8));
    const py = Math.max(4, Math.min(y ?? 8, innerHeight - r.height - 8));
    this.root.style.left = `${px}px`;
    this.root.style.top = `${py}px`;
  }

  hide() {
    this.root.hidden = true;
    this.open = false;
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
