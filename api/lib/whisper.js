import { readFile } from 'fs/promises';
import path from 'path';

// Whisper on Groq (whisper-large-v3), with word-level timestamps.
// Groq's free tier caps uploads at 25 MB, so callers send a small mono MP3
// extracted from the video, not the video itself.
export async function transcribeWords(audioFile, { language, prompt } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured');

  const form = new FormData();
  form.append('file', new Blob([await readFile(audioFile)], { type: 'audio/mpeg' }), path.basename(audioFile));
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('temperature', '0');
  if (language) form.append('language', language);
  // The script itself, as a vocabulary hint: Whisper then spells names like
  // "GPT-6" and Roman Hinglish words the way the script does, which is what
  // lets the words line up with the script.
  if (prompt) form.append('prompt', prompt);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Whisper failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return {
      text: data.text || '',
      duration: data.duration || 0,
      words: (data.words || []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
    };
  }
}
