'use strict';

// Click diagnosis probe for Capri under Umbriel + XWayland.
//   npm exec electron repro/probe-diag.js -- --ozone-platform=x11
//   npm exec electron repro/probe-diag.js -- --ozone-platform=x11 --plain
//
// Default: same kind of window Capri uses (transparent, frameless, focusable:false,
// alwaysOnTop) with setIgnoreMouseEvents(false) fixed, never toggled.
// --plain: a normal managed window (frame, opaque, focusable, not always-on-top) with a
// button and :active, to tell "XWayland delivers no input" from "the overlay options do it".
//
// One 400x400 window per display, so both eDP-1 and HDMI-A-1 can be checked without moving it.

const path = require('node:path');
const { app, BrowserWindow, screen, ipcMain } = require('electron');

const PLAIN = process.argv.includes('--plain');
const W = 400;
const H = 400;

// Same relaunch trick as src/main/main.js: Electron picks its backend before we run.
function relaunchOnXWayland() {
  if (process.platform !== 'linux' || process.argv.some((a) => a.startsWith('--ozone-platform'))) return false;
  if (!process.env.WAYLAND_DISPLAY || !process.env.DISPLAY) return false;
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] });
  app.exit(0);
  return true;
}

const PAGE = (plain) => `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; font: 15px/1.45 system-ui, sans-serif; }
  body { background: ${plain ? '#1b1726' : 'rgba(27, 23, 38, 0.86)'}; color: #eae6ff; padding: 12px; box-sizing: border-box; }
  h1 { font-size: 15px; margin: 0 0 6px; color: #36ff7a; }
  .big { font: 700 40px/1 ui-monospace, monospace; margin: 4px 0 10px; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; border-bottom: 1px solid #ffffff1a; }
  .k { color: #9d94b8; }
  .v { font-family: ui-monospace, monospace; }
  .hint { margin-top: 10px; color: #b9aee0; font-size: 12px; }
  #btn { margin-top: 8px; padding: 10px 14px; font-size: 16px; }
  #btn:active { background: red; color: #fff; }
</style>
<body>
  <h1 id="title">probe</h1>
  <div class="big" id="state">sin eventos</div>
  <div class="row"><span class="k">mousemove</span><span class="v" id="mm">0</span></div>
  <div class="row"><span class="k">mousedown</span><span class="v" id="md">0</span></div>
  <div class="row"><span class="k">último e.clientX/Y</span><span class="v" id="client">—</span></div>
  <div class="row"><span class="k">cursor pantalla (main)</span><span class="v" id="cursor">—</span></div>
  <div class="row"><span class="k">cursor en ventana</span><span class="v" id="rel">—</span></div>
  <div class="row"><span class="k">inside</span><span class="v" id="inside">—</span></div>
  <div class="row"><span class="k">muestras / cambios</span><span class="v" id="samples">0 / 0</span></div>
  <div class="row"><span class="k">último cambio</span><span class="v" id="changed">—</span></div>
  <div class="row"><span class="k">display</span><span class="v" id="display">—</span></div>
  ${plain ? '<button id="btn">Botón: cambia el título</button>' : '<div class="hint">Pasa el puntero por aquí, luego clic izquierdo y derecho. No cierres: se cierra con Ctrl+C en la terminal.</div>'}
<script>
  const $ = (id) => document.getElementById(id);
  let mm = 0, md = 0, samples = 0, changes = 0, last = null, lastChange = 0;
  addEventListener('mousemove', (e) => {
    mm++;
    $('mm').textContent = mm;
    $('client').textContent = e.clientX + ', ' + e.clientY;
    $('state').textContent = 'mousemove ✓';
    window.probe.event('mousemove', { x: e.clientX, y: e.clientY });
  });
  addEventListener('mousedown', (e) => {
    md++;
    $('md').textContent = md;
    $('state').textContent = 'mousedown ✓ botón ' + e.button;
    $('client').textContent = e.clientX + ', ' + e.clientY;
    window.probe.event('mousedown', { x: e.clientX, y: e.clientY, button: e.button });
  });
  window.probe.onInfo((info) => {
    $('title').textContent = info.title;
    $('display').textContent = info.display;
    document.title = info.title;
  });
  window.probe.onCursor((p) => {
    samples++;
    $('cursor').textContent = p.x + ', ' + p.y;
    $('rel').textContent = p.rx + ', ' + p.ry;
    $('inside').textContent = String(p.inside);
    if (!last || p.x !== last.x || p.y !== last.y) {
      changes++;
      lastChange = performance.now();
      last = { x: p.x, y: p.y };
    }
    $('samples').textContent = samples + ' / ' + changes;
    $('changed').textContent = lastChange ? Math.round(performance.now() - lastChange) + ' ms' : '—';
  });
  ${plain ? `$('btn').addEventListener('click', () => {
    document.title = 'probe plain — clic ' + Date.now();
    $('state').textContent = 'botón pulsado ✓';
    window.probe.event('button', { title: document.title });
  });` : ''}
</script>`;

function createProbe() {
  const windows = [];
  for (const d of screen.getAllDisplays()) {
    const win = new BrowserWindow({
      // side by side when both variants run at once
      x: d.bounds.x + (PLAIN ? 520 : 60),
      y: d.bounds.y + 60,
      width: W,
      height: H,
      ...(PLAIN
        ? { frame: true, transparent: false, backgroundColor: '#1b1726', focusable: true, alwaysOnTop: false, hasShadow: true }
        : {
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          focusable: false,
          hasShadow: false,
          alwaysOnTop: true,
        }),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'probe-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    if (!PLAIN) win.setAlwaysOnTop(true, 'screen-saver');
    // fixed: never toggled, so a lost input shape can't be blamed on the toggle
    win.setIgnoreMouseEvents(false);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE(PLAIN))}`);
    const info = {
      title: `${PLAIN ? 'PLAIN' : 'OVERLAY'} · ${d.label || 'display'} · id ${d.id}`,
      display: `${d.label || '(sin label)'} · id ${d.id} · ${d.bounds.width}x${d.bounds.height} @${d.scaleFactor} · ${d.bounds.x},${d.bounds.y}`,
    };
    win.webContents.on('did-finish-load', () => win.webContents.send('probe:info', info));
    win.once('ready-to-show', () => win.showInactive());
    win.on('page-title-updated', (_e, title) => console.log(`[probe] title: ${title}`));
    windows.push({ win, info, last: null });
    console.log(`[probe] window on ${info.display} at ${win.getBounds().x},${win.getBounds().y}`);
  }

  // One sampler for every window: screen.getCursorScreenPoint, 10 times a second.
  setInterval(() => {
    const p = screen.getCursorScreenPoint();
    for (const { win, info, last } of windows) {
      if (win.isDestroyed()) continue;
      const b = win.getBounds();
      const rx = p.x - b.x;
      const ry = p.y - b.y;
      const inside = rx >= 0 && ry >= 0 && rx < b.width && ry < b.height;
      win.webContents.send('probe:cursor', { x: p.x, y: p.y, rx, ry, inside });
      if (!last || last.x !== p.x || last.y !== p.y) {
        console.log(`[probe] cursor ${p.x},${p.y} inside=${inside} ${info.title}`);
      }
    }
  }, 100);
}

ipcMain.on('probe:event', (_e, { kind, data }) => {
  console.log(`[probe] ${kind} ${JSON.stringify(data)}`);
});

if (!relaunchOnXWayland()) {
  app.whenReady().then(createProbe);
  app.on('window-all-closed', (e) => e.preventDefault());
}
