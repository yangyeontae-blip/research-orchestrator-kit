// Builds timing, captions, music, and sound effects for the v0.7 video.
// Narration uses edge-tts, then gTTS (set GTTS_CLI if gtts-cli is not on PATH); without either, scenes are timed
// for reading and the video carries the script as captions. Run: node docs/video/v0.7/build-audio.mjs [--no-tts]
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'remotion', 'public');
const voDir = path.join(publicDir, 'vo');
const fps = 30;
const leadIn = 0.6;
const tail = 1.0;
const readingRate = 7.5; // Korean characters per second for comfortable caption reading
const narration = JSON.parse(await fs.readFile(path.join(here, 'narration.json'), 'utf8'));
await fs.rm(voDir, { recursive: true, force: true });
await fs.mkdir(voDir, { recursive: true });

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const seconds = file => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
const srtTime = value => {
  const ms = Math.round(value * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const sentences = text => text.split(/(?<=[.?!])\s+/).map(item => item.trim()).filter(Boolean);

// Voices in order of preference: Microsoft Edge neural TTS, then Google TTS (gTTS, sped up slightly), then captions only.
const engines = {
  'edge-tts': (text, media) => run('edge-tts', ['--voice', narration.voice, `--rate=${narration.rate}`, '--text', text, '--write-media', media]),
  gtts: (text, media) => {
    const raw = `${media}.raw.mp3`;
    run(process.env.GTTS_CLI || 'gtts-cli', ['--lang', 'ko', text, '--output', raw]);
    run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', `atempo=${narration.gtts_tempo || 1.18},silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse`, '-ac', '2', '-b:a', '96k', media]);
    execFileSync(process.execPath, ['-e', 'require("fs").rmSync(process.argv[1])', raw]);
  }
};
const order = process.argv.includes('--no-tts') ? [] : ['edge-tts', 'gtts'].filter(name => !process.argv.includes(`--no-${name}`));
let engine = null;
for (const name of order) {
  try {
    engines[name](narration.scenes[0].speech || narration.scenes[0].text, path.join(voDir, 'probe.mp3'));
    engine = name;
    break;
  } catch {
    process.stdout.write(`${name} unavailable\n`);
  }
}
await fs.rm(path.join(voDir, 'probe.mp3'), { force: true });
let tts = Boolean(engine);
const scenes = [];
const captions = [];
let cursor = 0;
for (const [index, scene] of narration.scenes.entries()) {
  const media = path.join(voDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.mp3`);
  let voice = null;
  if (tts) {
    engines[engine](scene.speech || scene.text, media);
    voice = seconds(media);
  }
  const spoken = voice ?? scene.text.replace(/\s+/g, '').length / readingRate;
  const duration = Math.max(scene.min_seconds, leadIn + spoken + tail);
  const frames = Math.round(duration * fps);
  scenes.push({ id: scene.id, from: Math.round(cursor * fps), frames, voice: voice ? `vo/${path.basename(media)}` : null, lead_frames: Math.round(leadIn * fps) });
  const parts = sentences(scene.text);
  const total = parts.reduce((sum, item) => sum + item.length, 0);
  let at = cursor + leadIn;
  for (const part of parts) {
    const span = spoken * part.length / total;
    captions.push({ start: at, end: at + span, text: part });
    at += span;
  }
  cursor += frames / fps;
}
if (!tts) for (const scene of scenes) scene.voice = null;

const totalFrames = Math.round(cursor * fps);
await fs.writeFile(path.join(here, 'remotion', 'src', 'timeline.json'), JSON.stringify({ fps, total_frames: totalFrames, narrated: engine, scenes, captions: captions.map(item => ({ from: Math.round(item.start * fps), to: Math.round(item.end * fps), text: item.text })) }, null, 2) + '\n');
await fs.writeFile(path.join(here, 'captions.srt'), captions.map((item, i) => `${i + 1}\n${srtTime(item.start)} --> ${srtTime(item.end)}\n${item.text}\n`).join('\n'));

// Music is synthesized sample by sample: a 96 BPM pad, plucked arpeggio, soft kick and hats with ducking.
const rate = 48000;
const length = Math.ceil(cursor * rate);
const left = new Float32Array(length);
const right = new Float32Array(length);
const beat = 60 / 96;
const bar = beat * 4;
const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]; // Am F C G (MIDI)
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const fadeIn = 3, fadeOut = 4;
let noise = 1;
for (let i = 0; i < length; i++) {
  const t = i / rate;
  const chord = chords[Math.floor(t / bar) % chords.length];
  const inBar = t % bar;
  const inBeat = t % beat;
  const envelope = Math.min(1, t / fadeIn) * Math.min(1, (cursor - t) / fadeOut);
  const duck = 0.55 + 0.45 * Math.min(1, inBeat / 0.22);
  let pad = 0;
  for (const [n, midi] of chord.entries()) {
    const f = hz(midi - 12);
    pad += (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.003 * t) + 0.15 * Math.sin(2 * Math.PI * f * 3.01 * t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.11 * t + n));
  }
  pad *= 0.045 * Math.min(1, inBar / 0.6 + 0.35);
  const step = Math.floor(t / (beat / 2));
  const stepT = t % (beat / 2);
  const note = chord[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]] + 12;
  const pluck = Math.sin(2 * Math.PI * hz(note) * t) * Math.exp(-7 * stepT) * 0.09 * (t > 4 ? 1 : t / 4);
  const kick = (inBeat < 0.25 && Math.floor(t / beat) % 2 === 0 && t > 6) ? Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-28 * inBeat)) * inBeat) * Math.exp(-11 * inBeat) * 0.32 : 0;
  noise = (noise * 16807) % 2147483647;
  const offbeat = (t + beat / 2) % beat;
  const hat = t > 10 && offbeat < 0.05 ? ((noise / 2147483647) * 2 - 1) * Math.exp(-90 * offbeat) * 0.05 : 0;
  const mix = (pad * duck + kick + hat) * envelope;
  left[i] = mix + pluck * envelope * 0.8;
  right[i] = mix + pluck * envelope * 1.0 + 0.6 * pad * duck * envelope * Math.sin(2 * Math.PI * 0.07 * t) * 0.2;
}
const wav = Buffer.alloc(44 + length * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + length * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 4, 40);
for (let i = 0; i < length; i++) {
  wav.writeInt16LE(Math.max(-1, Math.min(1, left[i])) * 32767, 44 + i * 4);
  wav.writeInt16LE(Math.max(-1, Math.min(1, right[i])) * 32767, 46 + i * 4);
}
const wavPath = path.join(here, 'music.tmp.wav');
await fs.writeFile(wavPath, wav);
run('ffmpeg', ['-y', '-v', 'error', '-i', wavPath, '-af', 'aecho=0.8:0.6:180:0.18,loudnorm=I=-20:TP=-2', '-ac', '2', '-b:a', '64k', path.join(publicDir, 'music.mp3')]);
await fs.rm(wavPath);

const sfx = {
  chime: ['(sin(2*PI*1318.5*t)*exp(-5*t)+0.6*sin(2*PI*1975.5*t)*exp(-7*t)+0.3*sin(2*PI*2637*t)*exp(-9*t))/2.2', 1.6],
  deny: ['(sin(2*PI*82*t)*exp(-7*t)+0.5*sin(2*PI*123*t)*exp(-9*t)+0.25*sin(2*PI*246*t)*exp(-14*t))/1.6', 0.9],
  tick: ['sin(2*PI*2200*t)*exp(-70*t)*0.6', 0.12]
};
for (const [name, [expr, duration]] of Object.entries(sfx)) {
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=${duration}`, '-ac', '2', '-b:a', '128k', path.join(publicDir, `${name}.mp3`)]);
}
run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.9:c=pink:a=0.5', '-af', 'bandpass=f=1800:w=1600,afade=t=in:d=0.45,afade=t=out:st=0.45:d=0.45,volume=0.6', '-ac', '2', '-b:a', '128k', path.join(publicDir, 'whoosh.mp3')]);

process.stdout.write(`${scenes.length} scenes, ${cursor.toFixed(1)} s, narration: ${engine || 'captions only'}\n`);
