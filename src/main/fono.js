'use strict';

// Fono's local audio: speech-to-text and text-to-speech, on the same loopback server as its chat.
// The renderer records and plays; the audio and the URL stay here. No key: Fono trusts loopback.

const { failure, fonoOffline, fonoUrl } = require('./llm');

async function post(cfg, route, body, signal, headers) {
  try {
    return await fetch(`${fonoUrl(cfg)}${route}`, { method: 'POST', body, signal, ...(headers && { headers }) });
  } catch (err) {
    if (!signal.aborted) throw fonoOffline(err); // a refused connection: its daemon isn't up
    throw err;
  }
}

// The text of a 16-bit PCM WAV. Fono decodes only RIFF/WAVE (WebM, OGG and MP3 are refused).
async function transcribe(cfg, audio, language, signal) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'voice.wav');
  if (language) form.append('language', language); // skips detection: ~half the wait on CPU
  form.append('temperature', '0'); // no sampling: less of the loop-until-it-sounds-like-words
  const res = await post(cfg, '/audio/transcriptions', form, signal);
  if (!res.ok) throw await failure(res); // Fono's own words: a bad file, a broken STT
  const body = await res.json().catch(() => ({}));
  return String(body.text || '').trim();
}

// Her answer as a WAV. No `voice`: Fono picks the voice, as asked. One file, no streaming.
async function speak(cfg, text, signal) {
  const res = await post(cfg, '/audio/speech', JSON.stringify({ input: text }), signal, { 'content-type': 'application/json' });
  if (!res.ok) throw await failure(res);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { transcribe, speak };
