#!/usr/bin/env node
'use strict';

// Adds (or removes) Capri's OpenCode plugin: ~/.config/opencode/plugins/capri.js, the file OpenCode
// loads to tell her what a session is doing.
//
//   node scripts/install-opencode-hooks.js            install
//   node scripts/install-opencode-hooks.js --uninstall
//   node scripts/install-opencode-hooks.js --status

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARK = 'capri-opencode-plugin';
const NAME = 'capri.js';

function pluginDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'opencode', 'plugins');
}

function pluginFile() {
  return path.join(pluginDir(), NAME);
}

function template() {
  return path.resolve(__dirname, '..', 'hooks', `${MARK}.js`)
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function install() {
  const file = pluginFile();
  const source = fs.readFileSync(template(), 'utf8');
  fs.mkdirSync(pluginDir(), { recursive: true });
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === source) return { file, changed: false };
  // this file is hers: keep a copy of anything else that was here before replacing it
  if (before !== null && !before.includes(MARK)) {
    fs.copyFileSync(file, `${file}.capri-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  }
  fs.writeFileSync(file, source);
  return { file, changed: true };
}

function uninstall() {
  const file = pluginFile();
  const removed = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARK);
  if (removed) fs.unlinkSync(file);
  return { file, removed };
}

function status() {
  const file = pluginFile();
  try {
    return { file, installed: fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARK) };
  } catch (err) {
    return { file, installed: false, error: err.message };
  }
}

module.exports = { install, uninstall, status };

if (require.main === module) {
  const arg = process.argv[2];
  try {
    if (arg === '--uninstall') {
      const r = uninstall();
      console.log(r.removed ? `Capri plugin removed from ${r.file}` : `No Capri plugin found in ${r.file}`);
    } else if (arg === '--status') {
      const r = status();
      console.log(r.installed ? `Installed at ${r.file}` : `Not installed (${r.file})`);
    } else {
      const r = install();
      console.log(`Capri plugin ${r.changed ? 'installed' : 'already up to date'} at ${r.file}`);
      console.log('Restart OpenCode (or run /reload) for it to load.');
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
