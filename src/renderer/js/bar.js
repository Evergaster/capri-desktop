// The line her text is typed into, in its own window (Linux): her window can't take the keyboard
// (see createBar in main.js). It only carries what's typed back to the overlay, and records her
// voice for Fono's STT when the chat offers it (labels.voice).

import { encodeWav } from './wav.js';

const form = document.querySelector('.bar__form');
const input = document.querySelector('.bar__input');
const meter = document.querySelector('.bar__meter');
const meterBar = meter.querySelector('i');
const mic = document.querySelector('.bar__mic');
const send = document.querySelector('.bar__send');
const close = document.querySelector('.bar__close');

const MAX_MS = 60000;      // a runaway mic is worse than a long message
const IDLE_MS = 12000;     // nothing said: stop waiting, don't send silence to Whisper
const SILENCE_MS = 1600;   // after speech, this much quiet ends the turn
const MIN_SPEECH_MS = 250; // less than this is a click or a chair, not a message
const MIN_PEAK = 0.015;    // below ~-36 dBFS Whisper invents words instead of transcribing
const VOICE_RMS = 0.008;   // speech-ish energy for the VAD and the meter

let labels = {};      // what the panel asked for: { placeholder, send, secret, disabled, voice }
let mode = 'idle';    // idle | starting | recording | transcribing
let session = null;   // the recorder, while recording
let timer = null;
let run = 0;          // a result from an old run must not land in the next one
let starting = false; // getUserMedia is asking; a second click must not start another

const voice = () => labels.voice || null;
const status = (text) => { input.placeholder = text; input.title = text; };

function setMeter(peak) {
  const level = Math.min(1, Math.max(0, peak) * 4); // full bar at a healthy -12 dBFS
  meterBar.style.transform = `scaleX(${level.toFixed(3)})`;
  meter.classList.toggle('is-hot', peak > 0.98);
}

function setMode(next, line = '') {
  mode = next;
  const v = voice();
  mic.hidden = !v;
  mic.textContent = next === 'recording' ? '■' : next === 'starting' || next === 'transcribing' ? '…' : v?.mic || '';
  mic.setAttribute('aria-label', v?.mic || 'voice');
  mic.classList.toggle('is-recording', next === 'recording');
  meter.hidden = next !== 'recording';
  if (next !== 'recording') setMeter(0);
  input.disabled = next !== 'idle' || Boolean(labels.disabled);
  send.disabled = input.disabled;
  status(line || labels.placeholder || '');
}

function stopTracks(s) {
  s.stream.getTracks().forEach((t) => t.stop());
  s.node.onaudioprocess = null;
  s.source.disconnect();
  s.node.disconnect();
  s.mute.disconnect();
  s.ctx.close().catch(() => {});
}

function reset() {
  clearTimeout(timer);
  timer = null;
  if (session) { stopTracks(session); session = null; }
  setMeter(0);
}

function fail(line, code) {
  reset();
  setMode('idle', line);
  input.focus();
  window.bar.notify({ state: 'error', code: code || null, message: line });
}

async function start() {
  if (!voice() || starting || session || mode !== 'idle') return;
  starting = true;
  const my = ++run;
  input.value = '';
  setMode('starting', voice()?.preparing);
  window.bar.notify({ state: 'preparing' }); // cuts her own voice before the mic opens
  try {
    // Raw mono: WebRTC's echo cancellation, noise suppression and AGC are tuned for calls, and they
    // clip onsets and pump the level enough that Whisper mishears. Fono trims and resamples itself.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (my !== run) { stream.getTracks().forEach((t) => t.stop()); return; } // cancelled while asking
    const ctx = new AudioContext();
    await ctx.resume();
    if (my !== run) { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); return; }
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const s = { stream, ctx, source, node, chunks, rate: ctx.sampleRate, peak: 0, talked: 0, quietAt: 0, startedAt: performance.now() };
    node.onaudioprocess = (e) => {
      if (session !== s) return;
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
        sum += data[i] * data[i];
      }
      if (peak > s.peak) s.peak = peak;
      setMeter(peak);
      const now = performance.now();
      if (Math.sqrt(sum / data.length) > VOICE_RMS) {
        s.talked += (data.length / s.rate) * 1000;
        s.quietAt = 0;
      } else if (s.talked > 0) {
        if (!s.quietAt) s.quietAt = now;
        else if (now - s.quietAt >= SILENCE_MS) stop(); // end of the turn: transcribe what was said
      } else if (now - s.startedAt >= IDLE_MS) {
        stop(); // nothing but room noise: don't hand Whisper silence to invent from
      }
    };
    const mute = ctx.createGain();
    mute.gain.value = 0; // recorded, never played back into the room
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    session = s;
    timer = setTimeout(stop, MAX_MS);
    setMode('recording', voice()?.listening);
    window.bar.notify({ state: 'listening' });
  } catch (err) {
    if (my !== run) return;
    const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    fail(denied ? voice()?.micDenied : voice()?.noMic, denied ? 'mic-denied' : 'no-mic');
  } finally {
    if (my === run) starting = false;
  }
}

async function stop() {
  if (mode !== 'recording' || !session) return;
  clearTimeout(timer);
  timer = null;
  const s = session;
  session = null;
  stopTracks(s);
  const samples = new Float32Array(s.chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of s.chunks) { samples.set(c, at); at += c.length; }
  // A silent clip is what makes Whisper hallucinate a whole sentence: say so instead of sending it.
  if (s.talked < MIN_SPEECH_MS || s.peak < MIN_PEAK) return fail(voice()?.notHeard, 'silent');
  const my = ++run;
  setMode('transcribing', voice()?.transcribing);
  window.bar.notify({ state: 'transcribing' });
  try {
    const res = await window.bar.stt(encodeWav(samples, s.rate));
    if (my !== run) return;
    if (!res?.ok) {
      if (res?.code === 'stopped') { setMode('idle'); return; }
      const v = voice() || {};
      const line = res?.code === 'fono-offline' ? v.voiceOffline
        : res?.code === 'bad-audio' ? v.notHeard
          : `${v.voiceFailed || ''} ${res?.error || ''}`.trim();
      return fail(line || v.voiceFailed, res?.code);
    }
    const text = String(res.text || '').trim();
    if (!text) return fail(voice()?.notHeard, 'empty');
    setMode('idle');
    window.bar.notify({ state: 'idle' });
    input.focus();
    window.bar.submit(text);
  } catch (err) {
    if (my === run) fail(`${voice()?.voiceFailed || ''} ${err?.message || ''}`.trim(), 'error');
  }
}

function cancel() {
  starting = false;
  run++;
  reset();
  window.bar.sttStop();
  setMode('idle');
  window.bar.notify({ state: 'idle' });
}

mic.addEventListener('click', () => {
  if (!voice()) return;
  if (mode === 'starting') cancel();
  else if (mode === 'recording') stop();
  else if (mode === 'transcribing') cancel();
  else start();
});

window.bar.onCancel(() => cancel());

window.bar.onLabels((opts) => {
  const o = opts || {};
  labels = o;
  input.type = o.secret ? 'password' : 'text';
  input.setAttribute('aria-label', o.placeholder || 'Capri');
  send.textContent = o.send || '';
  if (mode === 'idle') {
    input.value = '';
    input.disabled = Boolean(o.disabled);
    send.disabled = Boolean(o.disabled);
    status(o.placeholder || '');
    if (!o.disabled) input.focus();
    mic.hidden = !o.voice;
    mic.textContent = o.voice?.mic || '';
    mic.setAttribute('aria-label', o.voice?.mic || 'voice');
    meter.hidden = true;
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || input.disabled) return;
  input.value = '';
  window.bar.submit(text);
});

input.addEventListener('input', () => {
  if (mode === 'idle') status(labels.placeholder || '');
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode !== 'idle') {
    e.preventDefault();
    cancel();
    return;
  }
  if (e.key === 'Escape') window.bar.escape();
});

close.addEventListener('click', () => {
  if (mode !== 'idle') cancel();
  window.bar.escape();
});
