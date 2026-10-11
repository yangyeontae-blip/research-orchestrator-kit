// Builds narration, timing, captions, and synthesized sound for the v0.5 video.
// Requires: edge-tts (pip) and ffmpeg/ffprobe on PATH. Run: node docs/video/v0.5/build-audio.mjs
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'remotion', 'public');
const voDir = path.join(publicDir, 'vo');
const fps = 30;
const leadIn = 0.7;
const tail = 0.9;
const narration = JSON.parse(await fs.readFile(path.join(here, 'narration.json'), 'utf8'));
await fs.mkdir(voDir, { recursive: true });

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const seconds = file => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
const srtTime = value => {
  const ms = Math.round(value * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

// Split a scene's caption into sentences and spread them over the narration by character count.
function sentences(text) {
  return text.split(/(?<=[.?!])\s+/).map(item => item.trim()).filter(Boolean);
}

const scenes = [];
const captions = [];
let cursor = 0;
for (const [index, scene] of narration.scenes.entries()) {
  const media = path.join(voDir, `${String(index + 1).padStart(2, '0')}-${scene.id}.mp3`);
  run('edge-tts', ['--voice', narration.voice, `--rate=${narration.rate}`, '--text', scene.speech || scene.text, '--write-media', media]);
  const voice = seconds(media);
  const duration = Math.max(scene.min_seconds, leadIn + voice + tail);
  const frames = Math.round(duration * fps);
  scenes.push({ id: scene.id, from: Math.round(cursor * fps), frames, voice: `vo/${path.basename(media)}`, voice_frames: Math.round(voice * fps), lead_frames: Math.round(leadIn * fps) });
  const parts = sentences(scene.text);
  const total = parts.reduce((sum, item) => sum + item.length, 0);
  let at = cursor + leadIn;
  for (const part of parts) {
    const span = voice * part.length / total;
    captions.push({ start: at, end: at + span, text: part });
    at += span;
  }
  cursor += frames / fps;
}

const totalFrames = Math.round(cursor * fps);
await fs.writeFile(path.join(here, 'remotion', 'src', 'timeline.json'), JSON.stringify({ fps, total_frames: totalFrames, scenes, captions: captions.map(item => ({ from: Math.round(item.start * fps), to: Math.round(item.end * fps), text: item.text })) }, null, 2) + '\n');
await fs.writeFile(path.join(here, 'captions.srt'), captions.map((item, i) => `${i + 1}\n${srtTime(item.start)} --> ${srtTime(item.end)}\n${item.text}\n`).join('\n'));

// Synthesized sound only: no third-party music or samples.
const total = cursor.toFixed(2);
const pad = [110, 164.81, 220, 277.18, 329.63, 493.88]
  .map((f, i) => `sin(2*PI*${f}*t)*(0.55+0.45*sin(2*PI*${(0.05 + i * 0.013).toFixed(3)}*t+${i}))`).join('+');
run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='(${pad})/9':s=48000:d=${total}`,
  '-af', `lowpass=f=1400,aecho=0.8:0.7:120|260:0.35|0.22,afade=t=in:d=3,afade=t=out:st=${(cursor - 4).toFixed(2)}:d=4,volume=0.9`,
  '-ac', '2', '-b:a', '64k', path.join(publicDir, 'pad.mp3')]);
const sfx = {
  chime: ['(sin(2*PI*1318.5*t)*exp(-5*t)+0.6*sin(2*PI*1975.5*t)*exp(-7*t)+0.3*sin(2*PI*2637*t)*exp(-9*t))/2.2', 1.6],
  deny: ['(sin(2*PI*82*t)*exp(-7*t)+0.5*sin(2*PI*123*t)*exp(-9*t)+0.25*sin(2*PI*246*t)*exp(-14*t))/1.6', 0.9]
};
for (const [name, [expr, duration]] of Object.entries(sfx)) {
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=${duration}`, '-ac', '2', '-b:a', '160k', path.join(publicDir, `${name}.mp3`)]);
}
run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.9:c=pink:a=0.5', '-af', 'bandpass=f=1800:w=1600,afade=t=in:d=0.45,afade=t=out:st=0.45:d=0.45,volume=0.6', '-ac', '2', '-b:a', '160k', path.join(publicDir, 'whoosh.mp3')]);

process.stdout.write(`${scenes.length} scenes, ${cursor.toFixed(1)} s, ${totalFrames} frames\n`);
