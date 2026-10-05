import { spawn } from 'child_process';

// Runs ffmpeg (from PATH). cwd lets filter graphs reference files like
// "captions.ass" relatively: Windows drive colons inside a filter argument
// would otherwise need layers of escaping.
export function runFfmpeg(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-y', ...args], { cwd, windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-8000); });
    proc.on('error', (err) => reject(new Error(`Could not start ffmpeg: ${err.message}`)));
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1500)}`))));
  });
}

// Duration, size and whether there is an audio track.
export function probe(file) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('Not a readable video file'));
      try {
        const data = JSON.parse(out);
        const video = data.streams?.find((s) => s.codec_type === 'video');
        resolve({
          duration: Number(data.format?.duration) || 0,
          width: video?.width || 0,
          height: video?.height || 0,
          hasVideo: Boolean(video),
          hasAudio: Boolean(data.streams?.some((s) => s.codec_type === 'audio')),
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}
