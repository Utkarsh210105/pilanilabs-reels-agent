import { Router } from 'express';
import { createWriteStream } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { probe, runFfmpeg } from '../lib/ffmpeg.js';
import { chooseLogoSpot } from '../lib/logoSpot.js';
import { MEDIA_DIR } from '../pipeline/renderReel.js';

const router = Router();
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const TOOLS_DIR = path.join(MEDIA_DIR, 'tools');
const MAX_BYTES = 1024 ** 3;

// "Add logo": a finished video (e.g. fully edited in HeyGen) in, the same
// video with the PilaniLabs symbol out. Nothing else changes: same size,
// same audio (copied, not re-encoded). Takes roughly 20-60 seconds.
router.post('/add-logo', async (req, res, next) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const input = path.join(TOOLS_DIR, `${id}-in.mp4`);
  try {
    if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return res.status(413).json({ error: 'Video is larger than 1 GB' });
    await mkdir(TOOLS_DIR, { recursive: true });
    await pipeline(req, createWriteStream(input));

    const info = await probe(input).catch(() => null);
    if (!info?.hasVideo) {
      await rm(input, { force: true });
      return res.status(400).json({ error: 'That file is not a video.' });
    }

    const { best, logoWidth } = await chooseLogoSpot(input, info.width, info.height);
    const base = String(req.query.name || 'reel').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}\- _]+/gu, '').trim().slice(0, 60) || 'reel';
    const outName = `${id}-${base.replace(/\s+/g, '-')}_PilaniLabs.mp4`;
    await runFfmpeg([
      '-i', input, '-i', path.join(ASSETS_DIR, 'logo-symbol.png'),
      '-filter_complex', `[1:v]scale=${logoWidth}:-1,format=rgba,colorchannelmixer=aa=0.95[wm];[0:v][wm]overlay=${best.x}:${best.y}:format=auto,format=yuv420p[v]`,
      '-map', '[v]', ...(info.hasAudio ? ['-map', '0:a', '-c:a', 'copy'] : []),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart',
      path.join(TOOLS_DIR, outName),
    ]);
    await rm(input, { force: true });

    res.json({
      file: outName,
      url: `/media/tools/${encodeURIComponent(outName)}`,
      download: `/api/tools/add-logo/${encodeURIComponent(outName)}`,
      spot: best.name,
      width: info.width,
      height: info.height,
      seconds: Math.round(info.duration * 10) / 10,
    });
  } catch (err) {
    await rm(input, { force: true }).catch(() => {});
    next(err);
  }
});

router.get('/add-logo/:file', (req, res) => {
  const file = path.basename(req.params.file);
  if (!/_PilaniLabs\.mp4$/.test(file)) return res.status(404).json({ error: 'Not found' });
  res.download(path.join(TOOLS_DIR, file), file.replace(/^\d+-[a-z0-9]+-/, ''));
});

export default router;
