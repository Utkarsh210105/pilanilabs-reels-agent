import { spawn } from 'child_process';

// Where to put the logo on a finished video (e.g. a HeyGen edit with its own
// titles and text boxes): candidate spots are scored by how much edge detail
// (text, graphics) sits under them across the video, sampled twice a second.
// The spot that is clear most often wins.

const LOGO_W = 92;
const LOGO_H = 150;

// Positions for a 1080x1920 frame, scaled for other sizes. All keep clear of
// the Instagram header (top ~220px) and the action buttons and caption
// (bottom ~650px on the right, ~420px across).
const CANDIDATES = [
  { name: 'right, upper third', x: 1080 - LOGO_W - 30, y: 560 },
  { name: 'top right', x: 1080 - LOGO_W - 40, y: 230 },
  { name: 'right, middle', x: 1080 - LOGO_W - 30, y: 880 },
  { name: 'top left', x: 40, y: 230 },
];

function edgeSeries(file, { x, y, w, h }) {
  return new Promise((resolve, reject) => {
    const vf = `fps=2,crop=${w}:${h}:${x}:${y},edgedetect=low=0.1:high=0.3,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`;
    const proc = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', vf, '-f', 'null', '-'], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('Could not analyse the video'));
      resolve([...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1])));
    });
  });
}

export async function chooseLogoSpot(file, width, height) {
  const sx = width / 1080;
  const sy = height / 1920;
  const results = [];
  for (const c of CANDIDATES) {
    const box = { x: Math.round(c.x * sx), y: Math.round(c.y * sy), w: Math.round(LOGO_W * sx), h: Math.round(LOGO_H * sy) };
    const series = await edgeSeries(file, box);
    const busy = series.filter((v) => v > 4).length / Math.max(1, series.length);
    const mean = series.reduce((a, b) => a + b, 0) / Math.max(1, series.length);
    results.push({ ...c, x: box.x, y: box.y, busy, mean });
  }
  results.sort((a, b) => a.busy - b.busy || a.mean - b.mean);
  return { best: results[0], all: results, logoWidth: Math.round(LOGO_W * sx) };
}
