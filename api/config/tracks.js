// Tracks: focused content sections within an audience, each with its own
// listener, series name, topic bank and comment keyword (its own ManyChat
// automation and freebie).

export const tracks = {
  'first-job': {
    id: 'first-job',
    audience: 'b2c',
    label: 'First job with AI',
    series: 'Pehli Job with AI',
    listener: 'Unemployed graduates, final-year college students and freshers in India looking for their first job or internship. Anxious about the job market, short on money, on their phones a lot. They want concrete steps that improve their chances this week.',
    voice: [
      'Speak like a supportive senior who has hired people: warm, honest, practical. Address the viewer as "aap".',
      'Every reel gives one concrete thing they can do today with a free AI tool (ChatGPT, Gemini, Claude, Perplexity, Canva), step by step.',
      'Be honest about effort: AI makes them faster and better prepared; it does not get anyone a job by itself.',
    ],
    hookStyles: [
      '"Pehli job chahiye? AI se ye kaam karo"',
      '"Aapka resume 6 second mein reject ho raha hai, kyunki..."',
      '"Freshers ye galti karte hain interview mein"',
      '"Bina experience ke bhi..."',
      '"Recruiter ye cheez dekhta hai, aur AI se 10 minute mein ban jaati hai"',
    ],
    topics: [
      'Resume ko ChatGPT se job description ke hisaab se tailor karna',
      'ATS-friendly resume aur keywords AI se nikaalna',
      'LinkedIn headline aur About section AI se likhna',
      'ChatGPT ke saath mock interview practice (HR aur technical)',
      'Tell me about yourself ka answer AI se banana',
      'Recruiters ko cold email ya LinkedIn message AI se likhna',
      'Bina experience ke portfolio project AI tools se banana',
      'Job description padh ke company research Perplexity se',
      'Interview ke baad thank-you email',
      'Salary aur role ke sawaalon ki taiyari (bina numbers promise kiye)',
      'Internship dhoondhne ke liye AI se daily plan',
      'Freelancing ka pehla gig AI skills se',
      'Entry-level jobs mein companies kaunsi AI skills maang rahi hain',
      'Group discussion aur aptitude ki taiyari AI se',
      'Rejection ke baad feedback aur improvement plan AI se',
      'Canva aur AI se ek page ka professional portfolio',
    ],
    engagement: {
      keyword: 'JOB',
      offer: 'the free PilaniLabs AI job roadmap',
      cta: 'Comment mein "JOB" likho, main aapko free AI job roadmap DM kar dunga',
    },
    // Claims that would mislead job seekers: always errors.
    forbidden: [
      { re: /\b(guarantee|guaranteed|pakki naukri|pakka job|100\s?%\s?(placement|job)|job (pakki|confirm))\b/i, why: 'Promises a job. Nobody can guarantee one.' },
      { re: /\b\d+\s?(lpa|lakh|lakhs|k per month|hazaar mahina)\b|\bsalary of\b/i, why: 'States a salary figure. Do not promise pay.' },
      { re: /\b(fake|jhooth|lie on (your|the) resume|experience bana(o|lo))\b/i, why: 'Suggests faking experience.' },
    ],
  },
};

export const TRACK_IDS = Object.keys(tracks);

// Every comment keyword that has a real ManyChat automation behind it.
export function allKeywords(brand) {
  const list = Object.values(tracks).map((t) => t.engagement?.keyword).filter(Boolean);
  if (brand.engagement?.enabled) list.unshift(brand.engagement.keyword);
  return [...new Set(list)];
}
