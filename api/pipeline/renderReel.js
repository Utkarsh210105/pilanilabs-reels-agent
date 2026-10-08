import { mkdir, rm, writeFile, access, rename, readdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { runFfmpeg, probe } from '../lib/ffmpeg.js';
import { transcribeWords } from '../lib/whisper.js';
import { setJobProgress } from '../lib/jobs.js';
import { alignScript } from './align.js';
import { buildAss, publisherName } from './captions.js';
import { getScript } from './generateScript.js';
import { matchBrollForScript } from './matchBroll.js';

const API_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(API_ROOT, 'media');
const ASSETS_DIR = path.join(API_ROOT, 'assets');

const FPS = 30;
const OUTRO_SECONDS = 1.5;
const COVER = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${FPS},setsar=1`;

const exists = (p) => access(p).then(() => true, () => false);

async function download(url, dest) {
  if (await exists(dest)) return dest;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`Clip download failed (${res.status}) for ${url}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rename(tmp, dest);
  return dest;
}

// Stock clip cut to exactly `seconds`, covered to 1080x1920, no audio. Short
// clips loop; long ones start a second in to skip fade-ins.
async function prepClip(src, out, seconds, clipDuration) {
  const skip = clipDuration > seconds + 1.5 ? 1 : 0;
  await runFfmpeg([
    '-stream_loop', '-1', '-ss', String(skip), '-i', src,
    '-t', seconds.toFixed(3), '-an', '-vf', COVER,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', out,
  ]);
}

async function pickMusic() {
  const dir = path.join(ASSETS_DIR, 'music');
  const files = (await readdir(dir).catch(() => [])).filter((f) => /\.(mp3|m4a|wav)$/i.test(f));
  return files.length ? path.join(dir, files[Math.floor(Math.random() * files.length)]) : null;
}

// Whisper on the uploaded HeyGen video, lined up with the script's words.
export async function timeScript(script, workDir) {
  const avatar = path.join(MEDIA_DIR, script.avatar_video);
  const info = await probe(avatar);
  const audio = path.join(workDir, 'voice.mp3');
  await runFfmpeg(['-i', avatar, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);
  const prompt = script.segments.map((s) => s.text).join(' ').slice(0, 700);
  const asr = await transcribeWords(audio, { language: script.audience === 'b2b' ? 'en' : undefined, prompt });
  return alignScript(script.segments, asr.words, info.duration);
}

export async function renderReel(scriptId, jobId) {
  const progress = (stage) => jobId && setJobProgress(jobId, stage);
  let script = await getScript(scriptId);
  if (!script.avatar_video) throw new Error('Upload the HeyGen video first');

  const dir = path.join(MEDIA_DIR, scriptId);
  const work = path.join(dir, `work-${Date.now()}`);
  await mkdir(work, { recursive: true });
  try {
    await progress('Transcribing the voice');
    const timings = await timeScript(script, work);
    await pool.query('UPDATE scripts SET timings = $1 WHERE id = $2', [JSON.stringify(timings), scriptId]);

    // B-roll is normally picked on approve; pick now if that was skipped or
    // the script was edited since.
    const brollSegs = script.segments.map((s, i) => [s, i]).filter(([s]) => s.visual === 'broll');
    const missing = brollSegs.some(([s, i]) => {
      const b = script.broll?.[String(i)];
      return !b || b.status !== 'picked' || b.text !== s.text || b.query !== s.broll_query;
    });
    if (missing && process.env.PEXELS_API_KEY) {
      await progress('Finding B-roll');
      script = (await matchBrollForScript(scriptId)).script;
    }

    await progress('Preparing B-roll clips');
    const cacheDir = path.join(MEDIA_DIR, 'cache');
    await mkdir(cacheDir, { recursive: true });
    const overlays = [];
    for (const [seg, i] of brollSegs) {
      const pick = script.broll?.[String(i)];
      const t = timings.segments[i];
      if (!pick?.clip || !t || t.end - t.start < 0.5) continue;
      const src = await download(pick.clip.video_url, path.join(cacheDir, `${pick.clip.source}-${pick.clip.id}.mp4`));
      const out = path.join(work, `broll-${i}.mp4`);
      await prepClip(src, out, t.end - t.start, pick.clip.duration);
      overlays.push({ file: out, start: t.start, end: t.end });
    }

    let news = null;
    if (script.kind === 'news' && script.news_item_id) {
      const { rows: [n] } = await pool.query('SELECT url, source, title FROM news_items WHERE id = $1', [script.news_item_id]);
      if (n) news = { title: n.title, source: publisherName(n.url, n.source) };
    }
    await writeFile(path.join(work, 'captions.ass'), buildAss({ timings, segments: script.segments, news }), 'utf8');

    await progress('Rendering the reel');
    const avatar = path.join(MEDIA_DIR, script.avatar_video);
    const music = await pickMusic();
    const total = timings.duration + OUTRO_SECONDS;
    const inputs = ['-i', avatar];
    overlays.forEach((o) => inputs.push('-i', o.file));
    const badgeIdx = 1 + overlays.length;
    const logoIdx = badgeIdx + 1;
    // The bare symbol (transparent, soft white edge so the navy reads on dark
    // footage), not the old emblem-on-grey badge.
    inputs.push('-i', path.join(ASSETS_DIR, 'logo-symbol.png'), '-i', path.join(ASSETS_DIR, 'logo-source.jpg'));
    const musicIdx = logoIdx + 1;
    if (music) inputs.push('-stream_loop', '-1', '-i', music);

    const f = [`[0:v]${COVER}[v0]`];
    overlays.forEach((o, k) => {
      f.push(`[${k + 1}:v]setpts=PTS-STARTPTS+${o.start.toFixed(3)}/TB[b${k}]`);
      f.push(`[v${k}][b${k}]overlay=0:0:enable='between(t,${o.start.toFixed(3)},${o.end.toFixed(3)})':eof_action=pass[v${k + 1}]`);
    });
    const vb = `v${overlays.length}`;
    f.push(`[${vb}]subtitles=captions.ass[sub]`);
    f.push(`[${badgeIdx}:v]scale=92:-1,format=rgba,colorchannelmixer=aa=0.95[wm]`);
    f.push(`[sub][wm]overlay=W-w-40:230:format=auto,format=yuv420p[main]`);
    f.push(`color=c=0xEEEEEE:s=1080x1920:r=${FPS}:d=${OUTRO_SECONDS}[obg]`);
    f.push(`[${logoIdx}:v]scale=720:-1[olg]`);
    f.push(`[obg][olg]overlay=(W-w)/2:(H-h)/2,format=yuv420p,setsar=1[outro]`);
    f.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo[voice]`);
    f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${OUTRO_SECONDS}[sil]`);
    f.push(`[main][voice][outro][sil]concat=n=2:v=1:a=1[vout][aout0]`);
    let audioOut = 'aout0';
    if (music) {
      f.push(`[${musicIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.07,atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 2).toFixed(3)}:d=2[mus]`);
      f.push('[aout0][mus]amix=inputs=2:duration=first:normalize=0[aout]');
      audioOut = 'aout';
    }

    const finalName = `final-${Date.now()}.mp4`;
    await runFfmpeg([
      ...inputs,
      '-filter_complex', f.join(';'),
      '-map', '[vout]', '-map', `[${audioOut}]`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      path.join(dir, finalName),
    ], { cwd: work });

    const rel = `${scriptId}/${finalName}`;
    const previous = script.final_video;
    const { rows } = await pool.query(
      `UPDATE scripts SET final_video = $1, rendered_at = now(),
         status = CASE WHEN status = 'approved' THEN 'rendered' ELSE status END, updated_at = now()
       WHERE id = $2 RETURNING final_video`,
      [rel, scriptId],
    );
    if (previous && previous !== rel) await rm(path.join(MEDIA_DIR, previous), { force: true }).catch(() => {});
    return {
      final_video: rows[0].final_video,
      seconds: Math.round(total * 10) / 10,
      broll_used: overlays.length,
      broll_lines: brollSegs.length,
      match_ratio: timings.match_ratio,
      music: music ? path.basename(music) : null,
    };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
