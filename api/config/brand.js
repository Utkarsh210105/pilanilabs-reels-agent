// Everything the script writer is allowed to say about PilaniLabs. Scripts may
// only state offering facts listed here, so a fact missing from this file
// never shows up in a reel. Keep it current when an offering changes.
//
// B2B facts are taken from pilanilabs.com (September 2026).

export const brand = {
  name: 'PilaniLabs',
  // Spoken form for the avatar: TTS reads "PilaniLabs" as one odd word.
  spokenName: 'Pilani Labs',
  legalName: 'Aray Consulting LLP',
  website: 'https://www.pilanilabs.com',
  founder: 'Ajay Goyal',
  // The HeyGen avatar is Ajay's own digital twin, so scripts speak in first
  // person as him.
  presenterName: 'Ajay Goyal',
  presenterNote: 'Founder of PilaniLabs, a senior business leader who trains leaders and everyday people on AI',
  // Facts true of every programme, B2B and B2C.
  howWeTrain: [
    'Cohort-based and personalised AI training, for business leaders and for everyday people',
    'Teaches generative AI concepts and applied AI: using AI tools in real work',
  ],
  proofPoints: [
    'Backed by 30+ years of business leadership experience',
    'Curriculum updated quarterly with emerging AI developments',
    'Practitioner-led programs',
  ],
  socials: {
    linkedin: 'https://www.linkedin.com/company/pilani-labs/',
    x: 'https://x.com/PilaniLabs',
    youtube: 'https://youtube.com/@pilanilabs',
  },

  // Comment-to-DM loop (ManyChat): viewers comment the keyword, ManyChat checks
  // they follow and DMs them the WhatsApp community link, and sends the lead
  // to /api/leads/manychat. Every reel ends with this call to action.
  engagement: {
    enabled: true,
    keyword: 'AI',
    offer: 'the PilaniLabs WhatsApp community link',
    cta: {
      b2c: 'Comment mein "AI" likho, main aapko apni WhatsApp community ka link DM kar dunga',
      b2b: 'Comment "AI" and I will DM you the link to our WhatsApp community for leaders',
    },
  },

  offerings: {
    b2b: [
      {
        id: 'strategy-1day',
        name: 'AI Strategy for Business Leaders (1-Day Executive Intensive)',
        facts: [
          'One full day, in-person or virtual, for CXOs and senior leaders',
          'Six strategic sessions',
          'Participants leave with an AI Strategy Canvas, a 90-day action plan and a prioritised AI use-case list',
        ],
        cta: 'Book a free consultation, link in the caption',
      },
      {
        id: 'mastery-5day',
        name: 'AI Mastery Workshop (5 days)',
        facts: [
          '5 days, 4 hours a day, 20 expert-led hours, in-person or virtual',
          'For C-suite and business decision-makers',
          'Live tool demonstrations and a capstone strategy project',
          'Covers generative AI, agentic AI, workflow automation, and AI governance',
          'Certificate of completion',
        ],
        cta: 'Book a free consultation, link in the caption',
      },
      {
        id: 'enterprise-onsite',
        name: 'Enterprise On-Site Workshop',
        facts: ['A tailored engagement at your organisation, shaped around its industry, goals and AI maturity'],
        cta: 'Book a free consultation, link in the caption',
      },
    ],
    // Prices are never stated in reels (brand decision), so none are listed.
    b2c: [
      {
        id: 'ai-training',
        name: 'PilaniLabs AI Training',
        facts: [
          'Cohort-based AI training: you learn together with a group',
          'Personalised to your goals and your work',
          'Covers generative AI concepts and applied AI: how to actually use AI tools in your job, studies or business',
        ],
        cta: 'Next cohort ki details ke liye link bio mein hai',
      },
    ],
  },
};
