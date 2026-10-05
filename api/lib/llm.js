// Claude via OpenRouter — the same account the Namhya engine already uses for
// vision tagging. Scripts for an executive audience need stronger English than
// the Groq models the engine used for Hinglish UGC, and Claude handles both.
//
// Model ids come from env so they can be swapped without a deploy.
export const SCRIPT_MODEL = process.env.SCRIPT_MODEL || 'anthropic/claude-sonnet-4.5';
export const FAST_MODEL = process.env.FAST_MODEL || 'anthropic/claude-haiku-4.5';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function stripFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// OpenRouter reserves credit against max_tokens per request, not actual use
// (this drained a balance in the Namhya engine), so every call sets a cap
// sized to its real output.
export async function chat({ model = SCRIPT_MODEL, system, user, maxTokens = 2000, temperature = 0.7 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'PilaniLabs Reels Agent',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const body = await res.text();
      if (RETRYABLE.has(res.status) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) ** 2));
        continue;
      }
      throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(`OpenRouter: ${JSON.stringify(data.error).slice(0, 500)}`);
    const choice = data.choices?.[0];
    const text = choice?.message?.content;
    if (!text) throw new Error('OpenRouter returned no content');
    if (choice.finish_reason === 'length') {
      throw new Error(`Model output hit the ${maxTokens}-token cap and was cut off`);
    }
    return text;
  }
}

// `user` is a string, or an array of OpenAI-style content parts for vision:
// [{ type: 'text', text }, { type: 'image_url', image_url: { url } }].
function appendText(user, text) {
  return Array.isArray(user) ? [...user, { type: 'text', text }] : `${user}\n\n${text}`;
}

// Same as chat(), but the reply must be a JSON object. One retry with the
// parse error attached if the model wraps it in prose.
export async function chatJson(opts) {
  const text = await chat(opts);
  try {
    return JSON.parse(stripFence(text));
  } catch (err) {
    const retry = await chat({
      ...opts,
      user: appendText(opts.user, `Your previous reply was not valid JSON (${err.message}). Reply with only the JSON object.`),
    });
    return JSON.parse(stripFence(retry));
  }
}
