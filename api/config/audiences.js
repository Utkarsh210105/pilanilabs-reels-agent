// One profile per audience. Both post to the same accounts with the same
// avatar, so each audience also gets its own named series: a recurring,
// recognisable format makes the mixed feed look deliberate instead of random.

export const audiences = {
  b2b: {
    id: 'b2b',
    label: 'B2B · CXOs',
    series: { news: 'CXO AI Brief', promo: 'PilaniLabs Workshops', custom: 'CXO AI Brief' },
    language: 'english',
    targetWords: [95, 130],
    listener: 'CXOs, founders, business heads and senior managers in India. Busy, sceptical of hype, care about revenue, cost, risk and competitive advantage.',
    voice: [
      'Speak like a sharp operator briefing a CEO: calm, direct, confident.',
      'Plain business English. Short spoken sentences. No jargon without a one-line meaning.',
      'Always land on "what this means for your business" and one concrete move a leader can make this week.',
    ],
    hookStyles: ['a surprising number from the story', 'a direct question to a leader', 'a contrarian take', 'a "most companies are getting this wrong" line'],
    ctaFallback: 'Follow for your weekly AI brief',
    hashtagHints: ['AIStrategy', 'Leadership', 'CXO', 'GenerativeAI', 'DigitalTransformation'],
  },
  b2c: {
    id: 'b2c',
    label: 'B2C · Everyone',
    series: { news: 'AI in 60 Sec', promo: 'PilaniLabs AI Course', custom: 'AI in 60 Sec' },
    language: 'hinglish',
    targetWords: [90, 130],
    listener: 'Everyday Indians: students, job seekers, working professionals, small business owners, parents. Curious about AI, a bit worried about jobs, want quick practical wins.',
    voice: [
      'Hinglish: natural Hindi-English mix in Roman script. The presenter is a senior, experienced mentor, so warm and encouraging, and he addresses the viewer as "aap", never "tum" or "tu".',
      'Simple words. Explain any tech term in one line like you would to a friend.',
      'Always give the viewer something they can try today, or explain why the news matters to their job, money or safety.',
    ],
    hookStyles: ['"aap ye galti kar rahe ho"', 'a shocking but true fact', '"ye free AI tool..."', 'a job or money question', 'a quick before/after'],
    ctaFallback: 'Aise aur AI tips ke liye follow karo',
    hashtagHints: ['AI', 'ChatGPT', 'AITools', 'LearnAI', 'AIinHindi', 'TechTips'],
  },
};

export const AUDIENCE_IDS = Object.keys(audiences);
