export interface PulseCatalogItem {
  channel: 'confessions' | 'hot_takes' | 'real_talk' | 'midnight';
  title: string;
  body: string;
  theme: 'aurora' | 'cyber' | 'receipt' | 'espresso' | 'sunset' | 'sage' | 'velvet' | 'paper';
  fontStyle: 'sans' | 'serif' | 'mono';
  vibeSticker?: string;
  isSpoiler?: boolean;
  pollQ?: string;
  pollA?: string;
  pollB?: string;
  author: string;
}

export const MASTER_PULSE_CATALOG: PulseCatalogItem[] = [
  // ==========================================
  // 1. HOT TAKES & DEBATES (30 items with polls)
  // ==========================================
  {
    channel: 'hot_takes',
    title: 'Degrees vs Curiosity',
    body: 'A college degree in 2026 is mostly a $30,000 proof of persistence. The people who actually build breakthrough startups and ship viral tools are the ones who spent their nights down documentation rabbit holes.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Are college degrees overrated in 2026?',
    pollA: 'Overrated status symbol',
    pollB: 'Still essential foundation',
    author: 'ThePhilosopher'
  },
  {
    channel: 'hot_takes',
    title: 'The 60-Hour Myth',
    body: 'Bragging about working 60 hours a week is not a badge of honor. It usually just means management cannot plan deliverables, or you have not learned how to say a firm "no".',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Is hustle culture toxic?',
    pollA: 'Completely toxic',
    pollB: 'Necessary for success',
    author: 'CorporateSurvivor'
  },
  {
    channel: 'hot_takes',
    title: 'Dating App Economics',
    body: 'Dating apps are commercial slot machines. Their business model relies on keeping users lonely so they keep buying subscription boosts. The moment you find love, they lose a paying customer.',
    theme: 'sunset',
    fontStyle: 'serif',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Do dating apps want you single?',
    pollA: 'Yes, commercial incentive',
    pollB: 'No, they genuinely help',
    author: 'UnfilteredVoice'
  },
  {
    channel: 'hot_takes',
    title: 'Open Floor Offices',
    body: 'Open offices were invented by extroverts who never write deep focus code. Everyone wearing giant noise-canceling headphones in the same room proves the concept was flawed from day one.',
    theme: 'sage',
    fontStyle: 'mono',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Open office or private cubicle?',
    pollA: 'Cubicle / Private nook',
    pollB: 'Open floor collaboration',
    author: 'QuietEngineer'
  },
  {
    channel: 'hot_takes',
    title: 'The Real Cost of Coffee',
    body: 'Coffee doesn\'t give you energy. It borrows energy from 4:00 PM and charges you interest in the form of a 5:00 PM crash. Water and 8 hours of sleep beat an iced latte every time.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '☕ Pure Caffeine',
    pollQ: 'Could you quit caffeine for 30 days?',
    pollA: 'Easily, no problem',
    pollB: 'Impossible, I would die',
    author: 'CampusGhost'
  },
  {
    channel: 'hot_takes',
    title: 'Performative LinkedIn',
    body: 'LinkedIn has become the most surreal comedy platform on the web. People are writing 8-paragraph inspirational essays because their Uber driver arrived 2 minutes early.',
    theme: 'aurora',
    fontStyle: 'serif',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Is LinkedIn unbearable?',
    pollA: 'Unbearable cringe',
    pollB: 'Useful networking tool',
    author: 'TheCorporateSurvivor'
  },
  {
    channel: 'hot_takes',
    title: 'Social Battery Drainage',
    body: 'Being seen as "distant" or "low-energy" when you just don\'t want to answer 5 WhatsApp group chats every hour is wild. Unavailability is basic self-care, not personal beef.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Do you ghost group chats?',
    pollA: 'Constantly on mute',
    pollB: 'Always active & replying',
    author: 'NightRider'
  },
  {
    channel: 'hot_takes',
    title: 'Leetcoding vs Real Engineering',
    body: 'Inverting a binary tree on a whiteboard in 20 minutes tells you nothing about whether someone can debug an asynchronous race condition in production at 3 AM.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Leetcode interviews in 2026:',
    pollA: 'Outdated & broken',
    pollB: 'Fair objective benchmark',
    author: 'CodeNomad'
  },
  {
    channel: 'hot_takes',
    title: 'The Mac vs Linux Truth',
    body: 'MacBooks have the best hardware and trackpads in the world, but Apple charging $200 for an extra 8GB of unified RAM in 2026 is borderline criminal behavior.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Your daily driver:',
    pollA: 'MacBook ecosystem',
    pollB: 'Windows / Linux custom',
    author: 'DevSpec'
  },
  {
    channel: 'hot_takes',
    title: 'Attendance Policies in Higher Ed',
    body: 'Mandatory 75% attendance policies are an admission that the professor\'s lectures cannot compete with a 15-minute YouTube video explaining the exact same derivation at 1.5x speed.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Should attendance be mandatory?',
    pollA: 'Abolish mandatory quota',
    pollB: 'Keep it for discipline',
    author: 'BackbenchScholar'
  },
  {
    channel: 'hot_takes',
    title: 'Early Career Remote Work',
    body: 'Fully remote for your very first job stunts your career trajectory. You miss the hallway conversations, body language, and informal osmosis where 80% of unwritten industry rules are learned.',
    theme: 'aurora',
    fontStyle: 'serif',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Best mode for first job:',
    pollA: 'Hybrid / In-office',
    pollB: '100% Fully Remote',
    author: 'SeniorStaffer'
  },
  {
    channel: 'hot_takes',
    title: 'The AI Code Generator Trap',
    body: 'Using AI to write entire codebases without reading what it generated isn\'t 10x engineering. It\'s 10x technical debt creation. When edge cases break, nobody knows where the levers are.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Will AI replace junior coders?',
    pollA: 'Only the lazy ones',
    pollB: 'Entire junior tier gone',
    author: 'AsyncLoop'
  },
  {
    channel: 'hot_takes',
    title: 'Group Projects Are Flawed',
    body: 'College group projects don\'t simulate real workplace collaboration. In the workplace, dead weight gets managed out. In college, dead weight gets your GPA while you do 100% of the slides.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'In college group projects, you are:',
    pollA: 'The sole carrier',
    pollB: 'The chill contributor',
    author: 'SlideMaster'
  },
  {
    channel: 'hot_takes',
    title: 'Overpriced Textbooks',
    body: 'Charging $120 for an access code that unlocks 10 multiple-choice homework problems written in 2011 is institutionalized robbery.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Did you buy official textbooks this sem?',
    pollA: 'Never, all PDFs online',
    pollB: 'Had to buy access codes',
    author: 'LibGenEnthusiast'
  },
  {
    channel: 'hot_takes',
    title: 'The "Founder" Title Inflation',
    body: 'Putting "Founder & CEO @ Stealth" in your bio when you haven\'t built a prototype, talk to zero users, and just bought a .io domain is the peak tech delusion of our generation.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Title inflation in bios:',
    pollA: 'Hilarious delusion',
    pollB: 'Fake it till you make it',
    author: 'Bootstrapper'
  },
  {
    channel: 'hot_takes',
    title: 'Weekend Slack Notifications',
    body: 'If you send a Slack message at 9:30 PM on a Saturday marked "not urgent, read Monday", you are still forcing the receiver to spend mental RAM processing your request all weekend.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Slack notifications on weekends:',
    pollA: 'Mute & ignore strictly',
    pollB: 'Glance & reply anyway',
    author: 'BoundaryKeeper'
  },
  {
    channel: 'hot_takes',
    title: 'Smartwatches & Fitness Anxiety',
    body: 'Your watch buzzing to tell you that you haven\'t stood up while you\'re in the middle of a critical meeting or crying in your car does not improve cardiovascular health. It induces neurosis.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Wearable health trackers:',
    pollA: 'Addictive anxiety engine',
    pollB: 'Genuinely life-saving',
    author: 'AnalogHeart'
  },
  {
    channel: 'hot_takes',
    title: 'The Clean Desk Delusion',
    body: 'Minimalist desk setups with single monitors and zero cables look great on Pinterest. Real engineering work is 3 terminals, 47 Chrome tabs, half a cold cup of chai, and frantic scratchpads.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '☕ Pure Caffeine',
    pollQ: 'Your actual desk state:',
    pollA: 'Controlled chaotic mess',
    pollB: 'Ultra clean minimalist',
    author: 'KernelPanic'
  },
  {
    channel: 'hot_takes',
    title: 'The Overnight Success Lie',
    body: 'Whenever someone blows up "out of nowhere" on TikTok or GitHub, check their history. There are almost always 5 years of abandoned repositories, zero-view blogs, and silent grind behind it.',
    theme: 'aurora',
    fontStyle: 'serif',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Is luck bigger than consistency?',
    pollA: 'Consistency compounds',
    pollB: 'Right place at right time',
    author: 'PatientBuilder'
  },
  {
    channel: 'hot_takes',
    title: 'Spotify Wrapped Validation',
    body: 'People curate their listening habits in October specifically so their Spotify Wrapped looks mysterious, intellectual, and unbothered when posted to their stories in December.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🎧 Lo-Fi State',
    pollQ: 'Do you care about your Wrapped image?',
    pollA: 'Guilty of curating',
    pollB: 'Don\'t care, pure chaos',
    author: 'AudioPhile'
  },
  {
    channel: 'hot_takes',
    title: 'The Endless Meeting Plague',
    body: '90% of meetings could be replaced by a well-written 3-bullet asynchronous message. People hold meetings because reading and writing require structured thinking, while talking out loud doesn\'t.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Daily meeting burden:',
    pollA: 'Drowning in calls',
    pollB: 'Clean calendar focus',
    author: 'AsyncAdvocate'
  },
  {
    channel: 'hot_takes',
    title: 'College Fest Politics',
    body: 'Organizing a college fest prepares you for corporate bureaucracy better than any MBA. The sponsorship infighting, fake titles, and ego battles are identical to Fortune 500 boardrooms.',
    theme: 'sunset',
    fontStyle: 'serif',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Did fest organizing help your career?',
    pollA: 'Peak political training',
    pollB: 'Wasted free labor',
    author: 'FestLead'
  },
  {
    channel: 'hot_takes',
    title: 'Campus Placements Lottery',
    body: 'Getting the top-tier campus offer isn\'t purely about who is the sharpest coder. It\'s 40% DSA, 30% timing, and 30% whether the interviewer got their morning breakfast and liked your vibe.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Campus placement outcome:',
    pollA: '50% skill, 50% pure luck',
    pollB: 'Pure meritocracy',
    author: 'PlacedSenior'
  },
  {
    channel: 'hot_takes',
    title: 'Dark Mode Everything',
    body: 'Light mode users are either psychopaths or people who only work outside in blinding desert sunlight. Staring at #FFFFFF at 11 PM burns your retinas into early retirement.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌙 2 AM Epiphany',
    pollQ: 'IDE & App color scheme:',
    pollA: '100% Dark Mode',
    pollB: 'Light Mode unapologetic',
    author: 'OLED_Priest'
  },
  {
    channel: 'hot_takes',
    title: 'Self-Help Books Recycling',
    body: 'Every modern non-fiction bestseller could be condensed into a single blog post. The other 240 pages are repetitive anecdotes about Steve Jobs and Greek mythology to justify a $22 price tag.',
    theme: 'sage',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Do self-help books change behavior?',
    pollA: 'Temporary dopamine high',
    pollB: 'Genuinely life-changing',
    author: 'BookwormCynic'
  },
  {
    channel: 'hot_takes',
    title: 'The Real Reason People Want RTO',
    body: 'Middle managers who mandate Return to Office often don\'t miss the culture. They miss feeling important by walking around desks with a clipboard watching other people work.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Remote vs In-office mandate:',
    pollA: 'Trust employees remote',
    pollB: 'Office presence needed',
    author: 'RemoteVeteran'
  },
  {
    channel: 'hot_takes',
    title: 'Certificates vs Portfolios',
    body: 'A recruiter glances at your course certificate for 0.4 seconds. A recruiter clicking a live production link that actually works and solves a problem gets you hired in 48 hours.',
    theme: 'aurora',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    pollQ: 'What lands more interviews?',
    pollA: 'Shipped live projects',
    pollB: 'Recognized certifications',
    author: 'HiringMgr'
  },
  {
    channel: 'hot_takes',
    title: 'The Death of Casual Friendship',
    body: 'In our 20s, everything requires scheduling 3 weeks in advance via Google Calendar. "Hey, I\'m downstairs let\'s grab a quick tea" has vanished, and it\'s silently eroding our happiness.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Do you hang out spontaneously?',
    pollA: 'Rarely, all scheduled',
    pollB: 'Spontaneous anytime',
    author: 'OldSoul'
  },
  {
    channel: 'hot_takes',
    title: 'Tech Stack Churn',
    body: 'Rewriting your entire app in the newest JavaScript framework that dropped on Hacker News this Tuesday will not solve your product-market fit problem. Talk to actual customers.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Stick to boring tech or chase new?',
    pollA: 'Boring proven tech',
    pollB: 'Bleeding edge always',
    author: 'PragmaticDev'
  },
  {
    channel: 'hot_takes',
    title: 'Unpaid Internships in 2026',
    body: 'Companies calling unpaid labor "exposure and learning" in 2026 need to be publicly named and shamed. Exposure does not pay hostel rent or mess bills.',
    theme: 'receipt',
    fontStyle: 'sans',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Unpaid internships should be:',
    pollA: 'Legally banned entirely',
    pollB: 'Acceptable for top brand credit',
    author: 'StudentVoice'
  },

  // ==========================================
  // 2. SPICY CONFESSIONS & TEA (30 frosted spoilers)
  // ==========================================
  {
    channel: 'confessions',
    title: 'Pretending to Know Git',
    body: 'I have been a software engineer for 4 years. Every time Git gives me a rebase conflict that has more than 3 files, I clone the repo fresh into another folder and copy my files over manually.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Ghosted Class Rep',
    body: 'I ran for Class Representative solely to get access to the official attendance register so I could mark myself present for 8:00 AM lab sessions I never attended.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Accidental Resignation',
    body: 'I sent my resignation letter in a draft email that I accidentally hit Send on during a panic attack. I was too proud to admit it was a mistake, so I packed my desk and moved across the country.',
    theme: 'espresso',
    fontStyle: 'serif',
    vibeSticker: '💀 Career Trauma',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Fake Spotify Playlist',
    body: 'I made a private playlist titled "Deep Focus Ambient Lo-Fi" to look intellectual at coffee shops, but inside it is 100% early 2000s Bollywood dance anthems and Justin Bieber.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '🎧 Lo-Fi State',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Cheating the Automated Grader',
    body: 'In sophomore CS lab, the automated autograder had a timeout loophole. I wrote an if-condition matching the exact 5 test case inputs and hardcoded the outputs. Scored 100% while my algorithm was totally blank.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Hidden Job Search',
    body: 'I took 4 "doctor appointments" this month. Every single one was me sitting in a Starbucks bathroom doing virtual rounds for competitor firms while wearing a blazer over pajama bottoms.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Silent Unfollow',
    body: 'I muted my college best friend\'s stories because watching them land their dream FAANG offer while I was getting ghosted by startups made me feel physically sick with jealousy. I hate that I felt that way.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Campus Library Romance',
    body: 'I spent 4 months studying on the 3rd floor of the campus library at 9 AM strictly because my crush always sat at table 14. We never spoke a single word. They graduated last June and I still miss that phantom routine.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Stealing Hostel Wi-Fi Bandwidth',
    body: 'I found the default router admin credentials in our hostel warden\'s office and set a 1 Mbps rate limit on everyone else in my wing during exam week so my gaming downloads wouldn\'t stutter.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌶️ Unfiltered Tea',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Pretending to Be Busy',
    body: 'When people walk past my cubicle, I furiously open VS Code and run `git log` or random grep commands with terminal scrolling so they think I\'m deep in mission-critical debugging.',
    theme: 'paper',
    fontStyle: 'mono',
    vibeSticker: '🔋 Battery: 4%',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Unreturned Borrowed Jacket',
    body: 'I borrowed a leather jacket from my roommate for a date in 2023. I told him I lost it in an auto-rickshaw and paid him half its price. It\'s still in my bottom suitcase at my parent\'s house. I wear it when I visit home.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Phantom Reference Letter',
    body: 'My former professor told me to "write the recommendation letter yourself and I\'ll just sign it". I wrote the most glowing, Pulitzer-prize-level appraisal of my intellect and work ethic. Got accepted into grad school.',
    theme: 'receipt',
    fontStyle: 'serif',
    vibeSticker: '⚡ Aura High',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Fake Family Emergency',
    body: 'I once claimed a fake family wedding in another state just to get 4 uninterrupted days off to sit in my dorm, eat instant noodles, and play Elden Ring without feeling guilty about assignments.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Deleting Production Data',
    body: 'During my second week as an intern, I ran a `DROP TABLE` without a where clause on the staging database. I panicked, blamed it on an overnight AWS region outage, and watched DevOps spend 14 hours fixing it.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Crush on the Teaching Assistant',
    body: 'I deliberately asked basic questions about binary search trees during TA office hours just to hear him explain them with that soft patient voice. I already had an A+ in the course.',
    theme: 'aurora',
    fontStyle: 'serif',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Silent Group Chat Exit',
    body: 'I left our 6-year-old school friends WhatsApp group without saying a word at 3 AM. No fight happened. I just realized none of them knew who I had become, and keeping up the old persona was exhausting.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🌀 Overthinking',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Taking Credit for the Bug Fix',
    body: 'A quiet teammate posted the solution to a critical memory leak in an obscure Slack thread that nobody saw. In the executive standup, I framed it as "my investigation yielded the fix". Got promoted. The guilt still stings.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '💀 Career Trauma',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Phantom Birthday',
    body: 'I changed my birthday on Facebook to a random Tuesday in November just to see which "close friends" actually remembered my real birthday versus who was just replying to an automated reminder. Only 2 passed.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '🌀 Overthinking',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Roommate Food Thefts',
    body: 'Every time my roommate went home for the weekend, I drank small sips of his expensive imported cold brew and refilled it with diluted instant Nescafe so the liquid level stayed exact.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '☕ Pure Caffeine',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Anonymous Poll Voter',
    body: 'Whenever our department conducts "anonymous feedback surveys" on course difficulty, I always vote "Too easy, needs more challenging assignments" purely to spite the slackers in the back row.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌶️ Unfiltered Tea',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Nostalgic Stalking',
    body: 'I still check my ex-girlfriend\'s public Spotify profile every Sunday night to see what songs she\'s adding. If she adds depressing indie folk, I secretly convince myself she\'s thinking about me.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🎧 Lo-Fi State',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Selling Senior Project Code',
    body: 'I sold my senior capstone project to three different junior groups across two other colleges for cash. They all graduated with top marks using my 2024 code.',
    theme: 'paper',
    fontStyle: 'mono',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Fake Gym Attendance',
    body: 'I swipe my keycard at the campus gym 4 days a week, walk into the smoothie bar, sit on the couch reading manga for 45 minutes, and walk back to my dorm with a shaker bottle so my friends think I\'m disciplined.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Accidental Reply-All',
    body: 'I once meant to forward a company-wide email to my work buddy with the comment "what is this clown talking about". I hit Reply-All. 400 people including the VP received it. I claimed my email was hacked by malware.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Secret Pet in the Dorm',
    body: 'I kept a dwarf hamster in a ventilated shoebox inside my closet for 9 months in a strictly "no pets allowed" hostel. My RA inspected my room twice and thought the squeaking was my chair wheel.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '🤫 Classified Secret',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Faking an Offer to Get a Raise',
    body: 'I photoshopped a competitor offer letter with a 35% salary increase, took a screenshot with blurry margins, and casually brought it to my 1-on-1. Management matched it within 48 hours.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Silent Breakup',
    body: 'I broke up with someone not because of any grand argument, but because the way they chewed popcorn during a movie suddenly filled me with profound, insurmountable dread.',
    theme: 'espresso',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The WhatsApp Status Filter',
    body: 'I post cryptic melancholic quotes on my WhatsApp status and set the visibility to "Only Share With 1 Person". When they view it, I immediately delete it.',
    theme: 'aurora',
    fontStyle: 'sans',
    vibeSticker: '🌶️ Unfiltered Tea',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Fake Sick Day Voice',
    body: 'I practice my "congested sick cough" in the bathroom mirror for 5 minutes before calling my manager to take a mental health day so I sound medically authentic.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Secretly Enjoying the Solitude',
    body: 'When all my friends cancelled Friday night plans at the last second, I pretended to be disappointed in the group chat. Inside, I was euphoric. Nothing beats cancelling plans and staying in sweatpants.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🌙 2 AM Epiphany',
    isSpoiler: true,
    author: 'Anonymous 🎭'
  },

  // ==========================================
  // 3. REAL TALK & CAREER (30 items with dilemmas)
  // ==========================================
  {
    channel: 'real_talk',
    title: 'The 2-Year Promotion Truth',
    body: 'Loyalty tax is real. Staying at the same company usually earns a 4% cost-of-living bump. Interviewing every 2 years often unlocks a 25-40% leap. Don\'t fall in love with a company that will replace you in 2 weeks.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Job switching strategy:',
    pollA: 'Switch every 2-3 years',
    pollB: 'Build deep tenure inside',
    author: 'TheCorporateSurvivor'
  },
  {
    channel: 'real_talk',
    title: 'The 40-Year Trap',
    body: 'Most people spend their early 20s thinking they have to figure everything out by 25. Reality check: 80% of senior managers I work with are making it up as they go. Don\'t panic if your career path looks like spaghetti right now.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Do you feel on track for your age?',
    pollA: 'Yes, moving forward',
    pollB: 'No, winging it entirely',
    author: 'TheCorporateSurvivor'
  },
  {
    channel: 'real_talk',
    title: 'Managing Up Is 50% of the Job',
    body: 'Doing brilliant work that your manager doesn\'t understand or see is functionally identical to doing no work at all. Summarize your impact weekly in 3 bullet points.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Do you send weekly progress updates?',
    pollA: 'Yes, proactive visibility',
    pollB: 'No, let the work speak',
    author: 'CareerStrategist'
  },
  {
    channel: 'real_talk',
    title: 'The First Salary Shock',
    body: 'Nobody warns you about gross vs net income. You celebrate an 8 LPA or $85k offer, and then tax deductions, insurance, PF, and city rent swallow 45% before it even lands in your checking account.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'First paycheck reality:',
    pollA: 'Huge shock at deductions',
    pollB: 'Expected it accurately',
    author: 'SalariedStruggler'
  },
  {
    channel: 'real_talk',
    title: 'Burnout Recovery',
    body: 'Taking a 3-day weekend doesn\'t cure chronic burnout. Burnout isn\'t just fatigue—it\'s the emotional exhaustion of doing work that feels meaningless under chronic disrespect. You don\'t need a nap; you need boundaries.',
    theme: 'sunset',
    fontStyle: 'serif',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Have you experienced real burnout?',
    pollA: 'Yes, hit that wall',
    pollB: 'Not yet, managing pacing',
    author: 'MindfulDev'
  },
  {
    channel: 'real_talk',
    title: 'The Cost of Free Food at Work',
    body: 'Free dinner at the office at 8:00 PM is not a company benefit. It\'s a brilliant psychological trap to keep you at your desk for an extra 3 hours for the price of an $8 salad.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Free office dinner perk:',
    pollA: 'Calculated overtime trap',
    pollB: 'Legit great perk',
    author: 'TechCynic'
  },
  {
    channel: 'real_talk',
    title: 'The Good-Worker Curse',
    body: 'The reward for doing great work quickly is never more free time. The reward for doing great work quickly is more work from people who couldn\'t finish theirs.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Are you penalized for efficiency?',
    pollA: 'Always dumped with more work',
    pollB: 'Recognized and promoted',
    author: 'OverachieverTired'
  },
  {
    channel: 'real_talk',
    title: 'Saying "I Don\'t Know"',
    body: 'Junior engineers panic and guess when asked a question they don\'t know. Senior engineers confidently say: "I have no idea, let me investigate and get back to you by 3 PM." Confidence is honesty.',
    theme: 'aurora',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Do you hesitate to say "I don\'t know"?',
    pollA: 'Still feel anxious admitting it',
    pollB: 'Say it comfortably',
    author: 'SeniorStaffer'
  },
  {
    channel: 'real_talk',
    title: 'Friends Who Only Reach Out With Links',
    body: 'You know who your real friends are by age 24. They aren\'t the ones who only message you when they need a referral, an Instagram like, or a loan. Cherish the people who ask how your week went.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Has your inner circle shrunk?',
    pollA: 'Down to 2-3 real ones',
    pollB: 'Still large friend group',
    author: 'CircleSmall'
  },
  {
    channel: 'real_talk',
    title: 'The Side Project Graveyard',
    body: 'Having 20 unfinished side projects with bought domain names isn\'t a failure. It\'s the playground where you learned 90% of your real-world skills. Just make sure you ship at least one this year.',
    theme: 'paper',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    pollQ: 'How many unused domains do you own?',
    pollA: '3 or more sitting idle',
    pollB: 'Zero, buy only when shipping',
    author: 'DomainCollector'
  },
  {
    channel: 'real_talk',
    title: 'Parents\' Dream vs Your Reality',
    body: 'Disappointing your parents by pursuing what you actually care about hurts for 2 years. Living their dream for the rest of your life will hurt for 40 years.',
    theme: 'espresso',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Are you living your own dream?',
    pollA: 'My own path entirely',
    pollB: 'Partially fulfilling family expectations',
    author: 'PathFinder'
  },
  {
    channel: 'real_talk',
    title: 'Emergency Funds Are Freedom',
    body: 'An emergency fund containing 6 months of living expenses isn\'t just boring financial advice. It\'s the psychological armor that allows you to walk away from toxic bosses without terror.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Do you have an emergency fund?',
    pollA: 'Working on building it',
    pollB: 'Fully saved and locked',
    author: 'FrugalBuilder'
  },
  {
    channel: 'real_talk',
    title: 'Networking Isn\'t Brown-Nosing',
    body: 'Real networking isn\'t shaking hands at awkward wine mixers. It\'s being competent, kind, and reliable so that when former colleagues move to great companies, your name is the first they pitch.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    pollQ: 'How did you get your best gig?',
    pollA: 'Referral from past peer',
    pollB: 'Cold job board application',
    author: 'Networker'
  },
  {
    channel: 'real_talk',
    title: 'College CGPA Longevity',
    body: 'Your college CGPA matters for exactly 2 things: your first campus interview and graduate school applications. Three years into the industry, nobody has ever asked what grade I got in Discrete Math.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Does your GPA still define you?',
    pollA: 'Zero relevance now',
    pollB: 'Still stressed about it',
    author: 'AlumReflect'
  },
  {
    channel: 'real_talk',
    title: 'The Trap of Comparison',
    body: 'Comparing your messy behind-the-scenes life to someone\'s curated Instagram vacation or LinkedIn promotion post is like comparing raw footage to a finished Hollywood blockbuster.',
    theme: 'sunset',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Does social media trigger comparison?',
    pollA: 'Yes, need frequent detoxes',
    pollB: 'No, unbothered spectator',
    author: 'SoulSearcher'
  },
  {
    channel: 'real_talk',
    title: 'The Silent Killers of Ambition',
    body: 'The greatest threat to your potential isn\'t catastrophic failure. It\'s comfortable mediocrity—a job that pays just enough to keep you comfortable, with work dull enough to numb your drive.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Are you in comfortable mediocrity?',
    pollA: 'Feeling too comfortable, need change',
    pollB: 'Actively challenged and growing',
    author: 'DriveRestored'
  },
  {
    channel: 'real_talk',
    title: 'Writing Is Thinking',
    body: 'If you cannot write your proposal or idea in plain English across 1 page, you do not understand it yet. Clear writing is the highest-leverage career superpower in the knowledge economy.',
    theme: 'paper',
    fontStyle: 'serif',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Can you write clearly?',
    pollA: 'Writing is my secret weapon',
    pollB: 'Struggle putting thoughts to paper',
    author: 'ClearMind'
  },
  {
    channel: 'real_talk',
    title: 'The 1-on-1 Agenda Secret',
    body: 'If you show up to a 1-on-1 with your manager and say "I have nothing specific today", you surrendered control of your career trajectory. Always bring 2 strategic questions.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Do you set your 1-on-1 agenda?',
    pollA: 'Always drive the meeting',
    pollB: 'Wait for manager to lead',
    author: 'LeaderDev'
  },
  {
    channel: 'real_talk',
    title: 'The Fallacy of Sunk Cost',
    body: 'Just because you spent 3 years in a major or 2 years in a relationship doesn\'t mean you owe it the next 10 years of your life. Cut losses early and pivot without shame.',
    theme: 'aurora',
    fontStyle: 'sans',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Have you walked away from sunk cost?',
    pollA: 'Yes, best decision made',
    pollB: 'Struggling to let go',
    author: 'PivotMaster'
  },
  {
    channel: 'real_talk',
    title: 'Health Before Equity',
    body: 'Stock options and vested RSUs will not replace a damaged spine, ruined eyesight, or chronic gastrointestinal ulcers caused by 14-hour crunch periods. Take care of your vessel.',
    theme: 'sage',
    fontStyle: 'serif',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Have you sacrificed health for work?',
    pollA: 'Regrettably yes',
    pollB: 'Never, boundaries intact',
    author: 'VesselFirst'
  },
  {
    channel: 'real_talk',
    title: 'Job Titles Are Free for Companies',
    body: 'Companies love giving inflated titles like "Vice President of Growth" or "Lead Architect" instead of paying actual market-rate salary. You cannot deposit a title at the bank.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Title vs Paycheck:',
    pollA: 'Show me the cash compensation',
    pollB: 'Title helps next leap',
    author: 'CashFlowDev'
  },
  {
    channel: 'real_talk',
    title: 'Your First Apartment Trap',
    body: 'Do not rent an apartment that consumes more than 35% of your take-home pay just to impress people on Instagram with aesthetic kitchen marble. You will be living on ramen for 12 months.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Is rent eating too much of your income?',
    pollA: 'Way too high in metro cities',
    pollB: 'Kept it lean and manageable',
    author: 'RentRealist'
  },
  {
    channel: 'real_talk',
    title: 'The Imposter Syndrome Antidote',
    body: 'Whenever you feel like a fraud in a boardroom or technical meeting, look around the table. Half the people in that room are secretly hoping nobody asks them a difficult question either.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Do you battle imposter syndrome?',
    pollA: 'Regularly feels like a fraud',
    pollB: 'Overcame it with experience',
    author: 'TruthTeller'
  },
  {
    channel: 'real_talk',
    title: 'The Value of Boredom',
    body: 'Great breakthroughs don\'t happen while doomscrolling reels in 8-second intervals. They happen when your brain is bored on a long walk without headphones and starts connecting distant dots.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🎧 Lo-Fi State',
    pollQ: 'Do you ever walk without your phone?',
    pollA: 'Almost never',
    pollB: 'Daily ritual for clarity',
    author: 'BoredomChampion'
  },
  {
    channel: 'real_talk',
    title: 'The Secret of Good Taste',
    body: 'Nobody begins with impeccable design or engineering taste. You build it by analyzing 1,000 bad implementations and understanding precisely why they failed.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Is taste innate or learned?',
    pollA: 'Learned through volume of work',
    pollB: 'Inborn intuition',
    author: 'DesignCrafter'
  },
  {
    channel: 'real_talk',
    title: 'Saying No to Toxic Relatives',
    body: 'Blood relation does not entitle someone to interrogate your marriage timeline, criticize your salary, or project their unresolved anxieties onto your life over festival dinners.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '🌶️ Unfiltered Tea',
    pollQ: 'Do you set boundaries with relatives?',
    pollA: 'Strict emotional boundaries',
    pollB: 'Endure silently for peace',
    author: 'BoundaryChamp'
  },
  {
    channel: 'real_talk',
    title: 'The Golden Handcuffs',
    body: 'Big tech stock vesting schedules are designed as golden handcuffs. The money is great, but watch out: after 4 years, many engineers realize they haven\'t built anything new and are terrified to leave.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '💀 Career Trauma',
    pollQ: 'Would you take golden handcuffs?',
    pollA: 'Bag the cash, no hesitation',
    pollB: 'Freedom and autonomy first',
    author: 'FAANGDropout'
  },
  {
    channel: 'real_talk',
    title: 'The Power of Being Responsive',
    body: 'Being someone who responds clearly within 2 hours, confirms receipts, and never drops the ball will get you further in business than being an erratic genius who disappears for 4 days.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    pollQ: 'Are you a reliable communicator?',
    pollA: 'Ultra dependable',
    pollB: 'Need to get better at replies',
    author: 'ExecutionPro'
  },
  {
    channel: 'real_talk',
    title: 'The Myth of the 5-Year Plan',
    body: 'In 2021, nobody had ChatGPT or generative AI on their 5-year roadmap. Having rigid 5-year plans in an accelerating world is foolish. Have strong principles and flexible tactics.',
    theme: 'aurora',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    pollQ: 'Do you have a rigid 5-year plan?',
    pollA: 'Principles over rigid plans',
    pollB: 'Detailed 5-year goals written',
    author: 'AgileMind'
  },
  {
    channel: 'real_talk',
    title: 'Treating Sleep Like Medicine',
    body: 'Pulling all-nighters is not a badge of dedication; it is cognitive impairment. Sleeping 8 hours is the single highest-return biological investment you will ever make.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🌙 2 AM Epiphany',
    pollQ: 'Your average sleep per night:',
    pollA: '7-8 solid hours',
    pollB: 'Drowning under 6 hours',
    author: 'SleepAdvocate'
  },

  // ==========================================
  // 4. MIDNIGHT WHISPERS & EPIPHANIES (30 deep thoughts)
  // ==========================================
  {
    channel: 'midnight',
    title: 'Late Night Clarity',
    body: 'There is something uniquely comforting about being awake when the entire city is asleep. No notifications, no expectations, just you and your honest thoughts.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'ThePhilosopher'
  },
  {
    channel: 'midnight',
    title: 'The Parking Lot Epiphany',
    body: 'Sometimes I pull into my apartment driveway after work and just sit in my car with the engine off for 20 minutes in silence. In those 20 minutes, I don\'t belong to my boss, my family, or my responsibilities. I just belong to me.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    pollQ: 'Do you sit in your parked car for peace?',
    pollA: 'Every single week',
    pollB: 'Never, head straight inside',
    author: 'NightRider'
  },
  {
    channel: 'midnight',
    title: 'Digital Loneliness',
    body: 'We are reachable by 500 people through 6 messaging apps at any second, yet finding one person who will pick up the phone without warning feels virtually impossible. We traded intimacy for accessibility.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '🌀 Overthinking',
    author: 'DigitalMonk'
  },
  {
    channel: 'midnight',
    title: 'Growing Out of People',
    body: 'The saddest part of growing up isn\'t the fights or betrayals. It\'s the quiet, unannounced drift where you realize you and your childhood best friend simply have nothing left in common except memories from 2018.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    author: 'MidnightEcho'
  },
  {
    channel: 'midnight',
    title: 'Childhood Nostalgia',
    body: 'Remember coming home from school on a rainy Friday in 2014, your mom making hot snacks, with zero bills to pay and your only worry being who would play cricket at 5 PM? We didn\'t know we were in the golden era.',
    theme: 'sunset',
    fontStyle: 'serif',
    vibeSticker: '🎧 Lo-Fi State',
    author: 'NostalgiaKid'
  },
  {
    channel: 'midnight',
    title: 'The 2 AM Mirror Check',
    body: 'At 2 AM, the persona you put on for classmates, professors, and LinkedIn dissolves completely. It\'s just you looking in the bathroom mirror wondering who the person looking back actually wants to be.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'RawReflections'
  },
  {
    channel: 'midnight',
    title: 'Old Text Threads',
    body: 'Scrolling all the way to the top of an old WhatsApp chat with someone you don\'t speak to anymore feels like reading a novel written by two strangers who happened to share your names.',
    theme: 'paper',
    fontStyle: 'mono',
    vibeSticker: '🌀 Overthinking',
    author: 'GhostWriter'
  },
  {
    channel: 'midnight',
    title: 'The City From the Balcony',
    body: 'Standing on the 7th-floor balcony watching tiny headlights streak across the flyover. Each tiny light is someone with a full life, secret heartbreaks, grocery lists, and existential dreams as intense as mine.',
    theme: 'aurora',
    fontStyle: 'serif',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'UrbanWatcher'
  },
  {
    channel: 'midnight',
    title: 'Bollywood Study Mode',
    body: 'There is a very specific type of late-night engineering study session where only 2000s Bollywood instrumental melodies playing in one earphone can keep your soul tethered to this mortal realm.',
    theme: 'espresso',
    fontStyle: 'sans',
    vibeSticker: '🎧 Lo-Fi State',
    author: 'ChaiStudy'
  },
  {
    channel: 'midnight',
    title: 'The Fear of Wasting Youth',
    body: 'Am I actually living my 20s, or am I just staring at screens and waiting for some invisible curtain to rise so my real life can finally start?',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🌀 Overthinking',
    author: 'Wanderer'
  },
  {
    channel: 'midnight',
    title: 'Unsent Messages in Notes App',
    body: 'Everyone has a secret Notes app file containing paragraphs they wrote with tears in their eyes at 1 AM that will never, ever be sent to the intended recipient.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '🤫 Classified Secret',
    author: 'NotesKeeper'
  },
  {
    channel: 'midnight',
    title: 'The Rain on the Tin Roof',
    body: 'Heavy monsoon rain hitting the hostel roof while wrapped in a thin blanket with no morning alarms set. Some moments feel completely outside of time.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '🎧 Lo-Fi State',
    author: 'RainWhisper'
  },
  {
    channel: 'midnight',
    title: 'The Illusion of Control',
    body: 'We make detailed schedules for the next 6 months as if a single email, a random doctor checkup, or a chance meeting at a bus stop couldn\'t reroute the entire river of our life tomorrow.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'RiverWatcher'
  },
  {
    channel: 'midnight',
    title: 'Walking Alone on Campus at Night',
    body: 'The campus quad at 1 AM feels like an entirely different dimension. The buildings that felt intimidating during daylight become silent monuments under the streetlights.',
    theme: 'paper',
    fontStyle: 'serif',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'NightStroller'
  },
  {
    channel: 'midnight',
    title: 'The People We Will Never See Again',
    body: 'Think about that stranger on the train you had a 4-hour deep conversation with in 2021. You will never cross paths again, yet they know more about your childhood than your coworker of 3 years.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '🌀 Overthinking',
    author: 'TransientBond'
  },
  {
    channel: 'midnight',
    title: 'Silence in a Hyper-Loud World',
    body: 'We are so afraid of silence that the moment there is a 3-second pause, we reach into our pocket for dopamine pellets. Relearning how to sit comfortably in complete silence is true rebellion.',
    theme: 'espresso',
    fontStyle: 'serif',
    vibeSticker: '🔋 Battery: 4%',
    author: 'QuietMind'
  },
  {
    channel: 'midnight',
    title: 'The Songs We Cannot Listen To',
    body: 'There are certain tracks on my playlist that I will instantly skip not because they are bad, but because they hold the concentrated emotional scent of a season of my life I cannot bear to revisit.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🎧 Lo-Fi State',
    author: 'ScentOfSong'
  },
  {
    channel: 'midnight',
    title: 'Parents Getting Older',
    body: 'The most heartbreaking milestone of your mid-20s is looking at your father\'s hands or your mother\'s walk and suddenly realizing they are not invincible superheroes anymore. They are fragile, aging humans.',
    theme: 'sage',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    author: 'TimeFlies'
  },
  {
    channel: 'midnight',
    title: 'The Unfinished Masterpiece',
    body: 'We all have that one story, painting, or project we started when we were 19 that we haven\'t touched in 3 years because we\'re terrified we lack the talent to make it as good as it looks in our imagination.',
    theme: 'aurora',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    author: 'DreamKeeper'
  },
  {
    channel: 'midnight',
    title: 'Late Night Convenience Store Runs',
    body: 'Going to an all-night 24/7 store at 2:30 AM in flip-flops to buy cold milk and spicy chips. The fluorescent humming lights make it feel like a temporary sanctuary outside the universe.',
    theme: 'receipt',
    fontStyle: 'mono',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'NeonShopper'
  },
  {
    channel: 'midnight',
    title: 'Missing a Version of Yourself',
    body: 'I don\'t miss my ex. I miss the enthusiastic, fearless version of myself that existed when I was with them before heartbreak and cynicism set in.',
    theme: 'sunset',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    author: 'SelfNostalgia'
  },
  {
    channel: 'midnight',
    title: 'The Starless Metro Sky',
    body: 'Living in a major tech city where light pollution washes out the stars. Sometimes you just want to stand in a dark village field and remember how tiny our problems are beneath the galaxy.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'StarGazer'
  },
  {
    channel: 'midnight',
    title: 'The 3 AM Coding Zone',
    body: 'When Spotify hits the perfect ambient track and the code is compiling without warnings and the whole world is silent. For 45 minutes, you feel like a wizard bending lightning with your fingertips.',
    theme: 'cyber',
    fontStyle: 'mono',
    vibeSticker: '⚡ Aura High',
    author: 'WizardOfCode'
  },
  {
    channel: 'midnight',
    title: 'Being the Reliable One',
    body: 'Always being the strong, reliable friend who gives advice and handles crises means nobody ever asks you if you\'re secretly falling apart beneath the armor.',
    theme: 'paper',
    fontStyle: 'sans',
    vibeSticker: '🔋 Battery: 4%',
    author: 'TheAnchor'
  },
  {
    channel: 'midnight',
    title: 'Airport Goodbyes',
    body: 'Airport international departures gates hold more raw, desperate, genuine tears and hugs than any religious cathedral in human history.',
    theme: 'velvet',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    author: 'TerminalThoughts'
  },
  {
    channel: 'midnight',
    title: 'The Books We Buy But Never Read',
    body: 'Buying books is the optimistic purchase of time we don\'t have. Staring at the stack on my bedside table at night is like staring at 12 lives I wish I was living simultaneously.',
    theme: 'espresso',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    author: 'Bibliophile'
  },
  {
    channel: 'midnight',
    title: 'The Warmth of Street Food Chai',
    body: 'Standing beside a roadside tea stall at midnight on a cold November night, holding a hot glass with both hands while mist rises into the streetlights. Pure, unadulterated peace.',
    theme: 'sunset',
    fontStyle: 'sans',
    vibeSticker: '☕ Pure Caffeine',
    author: 'ChaiLover'
  },
  {
    channel: 'midnight',
    title: 'The Epiphany of Enough',
    body: 'Maybe success isn\'t landing on Forbes 30 under 30 or running a unicorn. Maybe success is sleeping 8 hours, laughing with people you respect, eating good food, and not dreading Monday morning.',
    theme: 'sage',
    fontStyle: 'sans',
    vibeSticker: '⚡ Aura High',
    author: 'SimplicitySoul'
  },
  {
    channel: 'midnight',
    title: 'The Last Time You Played Outside',
    body: 'One day in childhood, you and your neighborhood friends went outside to play for the very last time, and none of you realized it was the last time.',
    theme: 'paper',
    fontStyle: 'serif',
    vibeSticker: '🌀 Overthinking',
    author: 'ChildhoodGhost'
  },
  {
    channel: 'midnight',
    title: 'The Solitary Midnight Drive',
    body: 'Empty highway, windows rolled halfway down, cold wind rushing across your face, and your favorite album echoing in the cabin. The best therapy that exists.',
    theme: 'velvet',
    fontStyle: 'sans',
    vibeSticker: '🌙 2 AM Epiphany',
    author: 'NightRider'
  }
];
