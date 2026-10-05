import { chat, FAST_MODEL } from '../lib/llm.js';
import { brand } from '../config/brand.js';

// The text pasted into HeyGen: spoken lines only, one segment per paragraph
// (HeyGen pauses slightly at paragraph breaks, which matches the B-roll cuts).
export function heygenPlainText(segments) {
  return segments
    .map((s) => s.text.replaceAll(brand.name, brand.spokenName))
    .join('\n\n');
}

const cache = new Map();

// HeyGen's Hindi voices mispronounce Hindi written in Roman script ("hai"
// read as English "hi"). Writing the Hindi words in Devanagari while keeping
// English words in Roman fixes most of it; the Namhya engine's
// translateScript did the same for its Hinglish ads.
export async function heygenDevanagariText(script) {
  const key = `${script.id}:${script.version}`;
  if (cache.has(key)) return cache.get(key);

  const plain = heygenPlainText(script.segments);
  const out = await chat({
    model: FAST_MODEL,
    temperature: 0,
    maxTokens: 2500,
    system: `Convert Hinglish text (Hindi written in Roman script, mixed with English) for a Hindi text-to-speech voice. Write every Hindi word in Devanagari. Keep English words, brand names, product names and technical terms (AI, ChatGPT, prompt, resume, job) in Roman script exactly as they are. Do not translate, add or remove anything. Keep the paragraph breaks exactly. Reply with only the converted text.`,
    user: plain,
  });
  const text = out.trim();
  cache.set(key, text);
  return text;
}
