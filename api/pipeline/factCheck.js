import { chatJson, SCRIPT_MODEL } from '../lib/llm.js';
import { spokenText } from './checks.js';

// Pulls every checkable factual claim out of the spoken script and marks each
// as supported or not by the source text. A wrong number in front of a CXO
// audience costs more credibility than a missed reel, so unsupported claims
// block approval until the reviewer fixes or overrides them.
//
// source: the article text (news), the offering facts (promo), or null
// (custom topic: every claim comes back unverified for a human to check).
export async function checkClaims(segments, source) {
  const script = spokenText(segments);

  const result = await chatJson({
    model: SCRIPT_MODEL,
    temperature: 0,
    maxTokens: 2000,
    system: `You fact-check short video scripts before they are published. List every specific factual claim in the SCRIPT: numbers, dates, prices, names of companies/products/people, what a product can do, what someone announced or said, rankings, "first"/"biggest" claims. Skip opinions, advice ("try this today"), rhetorical questions and the call to action.

${source ? `For each claim decide whether the SOURCE supports it. "supported": true only if the SOURCE states it or it follows directly from it. If the script rounds, exaggerates, changes a number, or adds a detail the SOURCE does not have, it is not supported. Quote the supporting SOURCE words in "evidence" (max 25 words), or say what is wrong. Relative timing words ("just", "this week", "recently") are fine for a recent story; do not list them as claims or fail a claim for them.` : 'There is no source for this script. Mark every claim "supported": null and in "evidence" say what the reviewer should verify.'}

Reply with JSON only: {"claims": [{"claim": "...", "supported": true | false | null, "evidence": "..."}]}`,
    user: `SCRIPT:\n${script}${source ? `\n\nSOURCE:\n${source.slice(0, 10000)}` : ''}`,
  });

  return (Array.isArray(result?.claims) ? result.claims : [])
    .filter((c) => c && c.claim)
    .map((c) => ({
      claim: String(c.claim),
      supported: c.supported === true ? true : c.supported === false ? false : null,
      evidence: String(c.evidence || ''),
    }));
}

export function claimFlags(claims) {
  return claims
    .filter((c) => c.supported !== true)
    .map((c) => c.supported === false
      ? { code: 'unsupported_claim', severity: 'error', message: `Not supported by the source: "${c.claim}". ${c.evidence}` }
      : { code: 'unverified_claim', severity: 'warn', message: `Verify before approving: "${c.claim}". ${c.evidence}` });
}
