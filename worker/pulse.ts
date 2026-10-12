import type { Env } from './index';

type UserSession = {
  id: string;
  name: string;
  username: string;
  gender: 'male' | 'female';
  role?: 'member' | 'admin';
  account_type?: 'public' | 'private';
  avatar_url?: string | null;
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function safeJson<T extends Record<string, any>>(request: Request): Promise<T> {
  return request.json<T>().catch(() => ({} as T));
}

// ============================================================================
// MASTER PULSE CATALOG: 40+ Curated, Highly Engaging, Multi-Channel Pulses
// ============================================================================
const MASTER_PULSE_CATALOG = [
  // --- HOT TAKES ---
  {
    channel: 'hot_takes',
    title: 'Degrees vs Curiosity',
    body: 'A college degree in 2026 is mostly a $30,000 proof of persistence. The people who actually build breakthrough startups and ship viral tools are the ones who spent their nights down documentation rabbit holes.',
    theme: 'velvet',
    pollQ: 'Are college degrees overrated in 2026?',
    pollA: 'Overrated status symbol',
    pollB: 'Still essential foundation',
    author: 'ThePhilosopher'
  },
  {
    channel: 'hot_takes',
    title: 'The 60-Hour Myth',
    body: 'Bragging about working 60 hours a week is not a badge of honor. It usually just means management cannot plan deliverables, or you have not learned how to say a firm "no".',
    theme: 'terracotta',
    pollQ: 'Is hustle culture toxic?',
    pollA: 'Completely toxic',
    pollB: 'Necessary for success',
    author: 'CorporateSurvivor'
  },
  {
    channel: 'hot_takes',
    title: 'Dating App Economics',
    body: 'Dating apps are commercial slot machines. Their business model relies on keeping users lonely so they keep buying subscription boosts. The moment you find love, they lose a paying customer.',
    theme: 'paper',
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
    author: 'QuietEngineer'
  },
  {
    channel: 'hot_takes',
    title: 'The Real Cost of Coffee',
    body: 'Coffee doesn\'t give you energy. It borrows energy from 4:00 PM and charges you interest in the form of a 5:00 PM crash. Water and 8 hours of sleep beat an iced latte every time.',
    theme: 'paper',
    pollQ: 'Could you quit caffeine for 30 days?',
    pollA: 'Easily, no problem',
    pollB: 'Impossible, I would die',
    author: 'CampusGhost'
  },
  {
    channel: 'hot_takes',
    title: 'Performative LinkedIn',
    body: 'LinkedIn has become the most surreal comedy platform on the web. People are writing 8-paragraph inspirational essays because their Uber driver arrived 2 minutes early.',
    theme: 'velvet',
    author: 'TheCorporateSurvivor'
  },
  {
    channel: 'hot_takes',
    title: 'Social Battery Drainage',
    body: 'You do not owe anyone an instant reply to a text message unless it is a life-or-death emergency. Constant accessibility is a modern invention that our brains were never wired to handle.',
    theme: 'terracotta',
    pollQ: 'Is delayed texting acceptable?',
    pollA: '100% fine, take time',
    pollB: 'Rude if online',
    author: 'MidnightOwl'
  },

  // --- SPICY CONFESSIONS ---
  {
    channel: 'confessions',
    title: 'The Quiet Parking Lot',
    body: 'I told my colleagues I had an urgent dentist visit on Tuesday. In reality, I bought a tub of chocolate ice cream, sat in my car behind the grocery store, and enjoyed 90 minutes of total silence.',
    theme: 'paper',
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Secret AI Empathy',
    body: 'I have been using ChatGPT to draft loving, patient responses to my extended family group chat for 4 months. My relatives now think I am the most mature, thoughtful person in the family.',
    theme: 'velvet',
    pollQ: 'Using AI for family texts: genius or evil?',
    pollA: 'Pure genius sanity-saver',
    pollB: 'Emotionally fake',
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Silent Printer Lie',
    body: 'I have known how to unjam the office laser printer since week one. I pretend to look confused every time so I don\'t become the unpaid IT support for the entire floor.',
    theme: 'sage',
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Bollywood Study Mode',
    body: 'I tell everyone I listen to Mozart and ambient lo-fi beats while coding. My Spotify private session is 100% 2011 Bollywood party anthems on repeat.',
    theme: 'terracotta',
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Gym Scam',
    body: 'I told my gym trainer my hamstring was pulled so we could cancel leg day. I walked to the pizza parlor next door immediately afterwards with zero limp.',
    theme: 'paper',
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'The Accidental Reply-All',
    body: 'I almost replied "This could have been an email lol" to a company-wide announcement with 400 people. Caught myself at the confirmation dialog and my soul left my body.',
    theme: 'velvet',
    author: 'Anonymous 🎭'
  },
  {
    channel: 'confessions',
    title: 'Secret Recipe Fraud',
    body: 'Everyone in my college apartment thinks my pasta sauce is a secret family recipe passed down through generations. It is literally store-bought marinara with extra chili flakes and garlic powder.',
    theme: 'terracotta',
    author: 'Anonymous 🎭'
  },

  // --- REAL TALK & CAREER ---
  {
    channel: 'real_talk',
    title: 'The Illusion of Adult Free Time',
    body: 'The biggest shock of adulthood is realizing that "free time" doesn\'t exist. If you feel relaxed, you are 95% likely forgetting laundry, a dental cleaning, or paying your electricity bill.',
    theme: 'paper',
    pollQ: 'Adulting verdict so far:',
    pollA: 'Exhausting daily chore',
    pollB: 'Love the independence',
    author: 'TheCorporateSurvivor'
  },
  {
    channel: 'real_talk',
    title: 'The Boss Lottery',
    body: 'A great boss will shield you from organizational chaos and accelerate your growth by 3 years. A toxic boss will make you doubt your entire intelligence. Choose who you work for over the brand name.',
    theme: 'velvet',
    pollQ: 'What matters more in your 20s?',
    pollA: 'A supportive manager',
    pollB: 'Higher base compensation',
    author: 'CorporateSurvivor'
  },
  {
    channel: 'real_talk',
    title: 'The 6-Month Safety Net',
    body: 'Having 6 months of living expenses saved in a high-yield account does something magical to your posture. You speak up in meetings, you stop tolerating disrespect, and you sleep like a baby.',
    theme: 'terracotta',
    author: 'ThePhilosopher'
  },
  {
    channel: 'real_talk',
    title: 'Making Friends Post-College',
    body: 'Nobody warns you how intentional friendships must be after age 22. In school, proximity created friendships automatically. In adulthood, you have to literally calendar friends like a product roadmap.',
    theme: 'sage',
    author: 'CampusGhost'
  },
  {
    channel: 'real_talk',
    title: 'The 2-Year Promotion Truth',
    body: 'Loyalty tax is real. Staying at the same company usually earns a 4% cost-of-living bump. Interviewing every 2 years often unlocks a 25-40% leap. Don\'t fall in love with a company that will replace you in 2 weeks.',
    theme: 'paper',
    pollQ: 'Job switching strategy:',
    pollA: 'Switch every 2-3 years',
    pollB: 'Build deep tenure inside',
    author: 'TheCorporateSurvivor'
  },
  {
    channel: 'real_talk',
    title: 'Burnout Recovery',
    body: 'Taking a 3-day weekend does not cure 6 months of chronic burnout. Real recovery means redefining what success looks like and learning to detach your self-worth from your productivity.',
    theme: 'velvet',
    author: 'MidnightOwl'
  },

  // --- MIDNIGHT WHISPERS ---
  {
    channel: 'midnight',
    title: 'Letter to My Younger Self',
    body: 'It\'s 2:30 AM and I\'m thinking about who I was 4 years ago. Anxious, desperate for validation, terrified of making the wrong choice. I wish I could tell them: the things you lost made room for the things that saved you.',
    theme: 'sage',
    author: 'MidnightOwl'
  },
  {
    channel: 'midnight',
    title: 'Quiet Goodbyes',
    body: 'Some friendships don\'t end with an argument or explosive betrayal. They just softly drift apart into "happy birthday" texts and occasional Instagram story heart reactions. And that is okay.',
    theme: 'velvet',
    pollQ: 'Have you experienced a quiet friendship fade?',
    pollA: 'Yes, hurts quietly',
    pollB: 'Natural part of life',
    author: 'ThePhilosopher'
  },
  {
    channel: 'midnight',
    title: 'Childhood Nostalgia',
    body: 'You spend your entire childhood rushing to grow up, and then you spend your entire twenties wishing you could experience one single rainy Sunday afternoon with zero responsibilities again.',
    theme: 'terracotta',
    author: 'CampusGhost'
  },
  {
    channel: 'midnight',
    title: 'Unsaid Words',
    body: 'The heaviest things we carry are the words we rehearsed in our heads a thousand times but never found the courage to speak out loud. Say what you mean before the moment passes forever.',
    theme: 'paper',
    author: 'MidnightOwl'
  },
  {
    channel: 'midnight',
    title: 'Late Night Clarity',
    body: 'There is something uniquely comforting about being awake when the entire city is asleep. No notifications, no expectations, just you and your honest thoughts.',
    theme: 'velvet',
    author: 'ThePhilosopher'
  }
];

// Helper to auto-seed if database is low on posts
async function ensureRichContent(env: Env) {
  try {
    const count = await env.DB.prepare('SELECT COUNT(*) as count FROM pulse_posts').first<{ count: number }>();
    if (count && count.count >= 25) return;

    for (const item of MASTER_PULSE_CATALOG) {
      const id = 'seed-' + await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.title + item.body))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));

      await env.DB.prepare(`
        INSERT OR IGNORE INTO pulse_posts (
          id, author_handle, is_anonymous, channel, title, body, card_theme, source, poll_question, poll_option_a, poll_option_b, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'syndicated', ?, ?, ?, datetime('now', '-' || (ABS(RANDOM()) % 72) || ' hours'))
      `).bind(
        id, item.author || 'Anonymous 🎭', item.author.includes('Anonymous') ? 1 : 0,
        item.channel, item.title, item.body, item.theme || 'paper',
        item.pollQ || null, item.pollA || null, item.pollB || null
      ).run();
    }
  } catch (e) {
    console.error('Error auto-seeding pulse catalog', e);
  }
}

export async function handlePulseApi(
  request: Request,
  env: Env,
  user: UserSession | null,
  path: string
): Promise<Response> {
  const method = request.method;

  // --- ENGINE 4: Public Anonymous Asks Submission ---
  // POST /api/ask/:username
  const askMatch = path.match(/^\/api\/ask\/([a-zA-Z0-9_-]+)$/);
  if (askMatch && method === 'POST') {
    const targetUsername = askMatch[1];
    const target = await env.DB.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').bind(targetUsername).first<{ id: string; username: string }>();
    if (!target) return json({ error: 'User not found.' }, 404);

    const body = await safeJson<{ question?: string }>(request);
    const question = cleanText(body.question, 1000);
    if (!question || question.length < 3) return json({ error: 'Please write a message with at least 3 characters.' }, 400);

    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
    const ipHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIp + ':adda-salt'))
      .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));

    const recent = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM anonymous_asks WHERE recipient_username = ? COLLATE NOCASE AND sender_hash = ? AND created_at > datetime('now', '-1 hour')"
    ).bind(target.username, ipHash).first<{ count: number }>();

    if (recent && recent.count >= 10) {
      return json({ error: 'Too many messages sent recently. Please wait a little while.' }, 429);
    }

    const askId = 'ask-' + crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO anonymous_asks (id, recipient_username, sender_hash, question) VALUES (?, ?, ?, ?)'
    ).bind(askId, target.username, ipHash, question).run();

    return json({ ok: true, message: 'Your secret note was delivered safely and anonymously! 💌' });
  }

  // --- ENGINE 4: Inbox & Reply for Authenticated User ---
  if (path === '/api/ask/inbox' && method === 'GET') {
    if (!user) return json({ error: 'Sign in to see your secret inbox.' }, 401);
    const asks = await env.DB.prepare(
      'SELECT id, recipient_username, question, reply, is_published_to_feed, is_read, created_at FROM anonymous_asks WHERE recipient_username = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 50'
    ).bind(user.username).all();

    await env.DB.prepare(
      "UPDATE anonymous_asks SET is_read = 1 WHERE recipient_username = ? COLLATE NOCASE AND is_read = 0"
    ).bind(user.username).run();

    return json({ asks: asks.results || [] });
  }

  // POST /api/ask/:id/reply
  const replyMatch = path.match(/^\/api\/ask\/([a-zA-Z0-9_-]+)\/reply$/);
  if (replyMatch && method === 'POST') {
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const askId = replyMatch[1];
    const ask = await env.DB.prepare(
      'SELECT * FROM anonymous_asks WHERE id = ? AND recipient_username = ? COLLATE NOCASE'
    ).bind(askId, user.username).first<{ id: string; question: string }>();
    if (!ask) return json({ error: 'Secret note not found.' }, 404);

    const body = await safeJson<{ reply?: string; publishToFeed?: boolean }>(request);
    const replyText = cleanText(body.reply, 1000);
    if (!replyText) return json({ error: 'Reply text cannot be empty.' }, 400);

    const publishToFeed = !!body.publishToFeed;
    await env.DB.prepare(
      'UPDATE anonymous_asks SET reply = ?, is_published_to_feed = ? WHERE id = ?'
    ).bind(replyText, publishToFeed ? 1 : 0, askId).run();

    if (publishToFeed) {
      const postId = 'post-' + crypto.randomUUID();
      const content = `Q: ${ask.question}\n\nA: ${replyText}`;
      await env.DB.prepare(
        'INSERT INTO pulse_posts (id, user_id, author_handle, is_anonymous, channel, title, body, card_theme, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(postId, user.id, user.username, 0, 'confessions', 'Secret Confession & Reply', content, 'terracotta', 'anonymous_ask').run();
    }

    return json({ ok: true, published: publishToFeed });
  }

  // --- PULSE FEED: Main Infinite Feed Listing ---
  if (path === '/api/pulse/feed' && method === 'GET') {
    await ensureRichContent(env);

    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'all';
    const sort = url.searchParams.get('sort') || 'fresh'; // 'trending' | 'fresh' | 'debated'
    const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit') || '15', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

    let whereClause = '';
    const params: unknown[] = [];
    if (channel !== 'all') {
      whereClause = 'WHERE p.channel = ?';
      params.push(channel);
    }

    let orderClause = 'ORDER BY p.created_at DESC';
    if (sort === 'trending') {
      orderClause = 'ORDER BY (reaction_count * 2 + comment_count * 3) DESC, p.created_at DESC';
    } else if (sort === 'debated') {
      orderClause = 'ORDER BY comment_count DESC, p.created_at DESC';
    }

    // Check count of available posts
    const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM pulse_posts p ${whereClause}`).bind(...params).first<{ total: number }>();
    const totalAvailable = countRes?.total || 0;

    let rows: any[] = [];
    let cycle = 0;

    if (totalAvailable > 0) {
      cycle = Math.floor(offset / totalAvailable);
      const effectiveOffset = offset % totalAvailable;

      const baseQuery = `
        SELECT 
          p.id, p.user_id, p.author_handle, p.is_anonymous, p.channel, p.title, p.body,
          p.card_theme, p.source, p.poll_question, p.poll_option_a, p.poll_option_b,
          p.created_at,
          u.avatar_url,
          COALESCE(r.reaction_count, 0) as reaction_count,
          COALESCE(c.comment_count, 0) as comment_count,
          COALESCE(pv_a.votes_a, 0) as votes_a,
          COALESCE(pv_b.votes_b, 0) as votes_b
        FROM pulse_posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as reaction_count FROM pulse_reactions GROUP BY post_id
        ) r ON r.post_id = p.id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as comment_count FROM pulse_comments GROUP BY post_id
        ) c ON c.post_id = p.id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as votes_a FROM pulse_poll_votes WHERE choice = 'a' GROUP BY post_id
        ) pv_a ON pv_a.post_id = p.id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as votes_b FROM pulse_poll_votes WHERE choice = 'b' GROUP BY post_id
        ) pv_b ON pv_b.post_id = p.id
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?
      `;

      const primaryBatch = await env.DB.prepare(baseQuery).bind(...params, limit, effectiveOffset).all<any>();
      rows = primaryBatch.results || [];

      // If we crossed boundary and need more items to fill `limit`, wrap around from beginning
      if (rows.length < limit && totalAvailable > rows.length) {
        const remainder = limit - rows.length;
        const secondBatch = await env.DB.prepare(baseQuery).bind(...params, remainder, 0).all<any>();
        rows = [...rows, ...(secondBatch.results || [])];
      }

      // If cycle > 0, make IDs unique per loop so React keys never collide
      if (cycle > 0) {
        rows = rows.map((r, i) => ({
          ...r,
          id: `${r.id}_cyc${cycle}_${i}`
        }));
      }
    }

    const postIds = rows.map((r: any) => r.id.split('_cyc')[0]); // Use real ID for reaction lookup

    // Fetch reactions breakdown for these posts
    let reactionsMap: Record<string, Record<string, number>> = {};
    let userReactionsMap: Record<string, string[]> = {};
    let userVotesMap: Record<string, string> = {};

    if (postIds.length > 0) {
      const uniqueBaseIds = [...new Set(postIds)];
      const placeholders = uniqueBaseIds.map(() => '?').join(',');
      const reactionBreakdown = await env.DB.prepare(
        `SELECT post_id, reaction_type, COUNT(*) as count FROM pulse_reactions WHERE post_id IN (${placeholders}) GROUP BY post_id, reaction_type`
      ).bind(...uniqueBaseIds).all<{ post_id: string; reaction_type: string; count: number }>();

      for (const row of reactionBreakdown.results || []) {
        if (!reactionsMap[row.post_id]) reactionsMap[row.post_id] = {};
        reactionsMap[row.post_id][row.reaction_type] = row.count;
      }

      if (user) {
        const userReactions = await env.DB.prepare(
          `SELECT post_id, reaction_type FROM pulse_reactions WHERE user_id = ? AND post_id IN (${placeholders})`
        ).bind(user.id, ...uniqueBaseIds).all<{ post_id: string; reaction_type: string }>();

        for (const row of userReactions.results || []) {
          if (!userReactionsMap[row.post_id]) userReactionsMap[row.post_id] = [];
          userReactionsMap[row.post_id].push(row.reaction_type);
        }

        const userVotes = await env.DB.prepare(
          `SELECT post_id, choice FROM pulse_poll_votes WHERE user_id = ? AND post_id IN (${placeholders})`
        ).bind(user.id, ...uniqueBaseIds).all<{ post_id: string; choice: string }>();

        for (const row of userVotes.results || []) {
          userVotesMap[row.post_id] = row.choice;
        }
      }
    }

    // Fetch active prompts to interleave into the feed
    const prompts = await env.DB.prepare('SELECT id, channel, prompt_text FROM pulse_prompts WHERE is_active = 1 LIMIT 5').all();

    const posts = rows.map((r: any) => {
      const baseId = r.id.split('_cyc')[0];
      return {
        id: r.id,
        userId: r.user_id,
        authorHandle: r.is_anonymous ? 'Anonymous 🎭' : r.author_handle,
        avatarUrl: r.is_anonymous ? null : r.avatar_url,
        isAnonymous: Boolean(r.is_anonymous),
        channel: r.channel,
        title: r.title,
        body: r.body,
        cardTheme: r.card_theme || 'paper',
        source: r.source,
        createdAt: r.created_at,
        reactionCounts: reactionsMap[baseId] || {},
        totalReactions: r.reaction_count,
        myReactions: userReactionsMap[baseId] || [],
        commentCount: r.comment_count,
        poll: r.poll_question ? {
          question: r.poll_question,
          optionA: r.poll_option_a,
          optionB: r.poll_option_b,
          votesA: r.votes_a,
          votesB: r.votes_b,
          myVote: userVotesMap[baseId] || null
        } : null
      };
    });

    return json({
      posts,
      prompts: prompts.results || [],
      hasMore: totalAvailable > 0 // ALWAYS true as long as there is content!
    });
  }

  // --- POST /api/pulse/posts: Create Post ---
  if (path === '/api/pulse/posts' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to drop a thought.' }, 401);
    const body = await safeJson<{
      title?: string;
      body?: string;
      channel?: string;
      cardTheme?: string;
      isAnonymous?: boolean;
      pollQuestion?: string;
      pollOptionA?: string;
      pollOptionB?: string;
      promptId?: string;
    }>(request);

    const text = cleanText(body.body, 4000);
    if (!text || text.length < 3) return json({ error: 'Post body must be at least 3 characters long.' }, 400);

    const validChannels = ['confessions', 'hot_takes', 'real_talk', 'midnight'];
    const channel = validChannels.includes(body.channel || '') ? body.channel! : 'confessions';
    const validThemes = ['paper', 'velvet', 'terracotta', 'sage'];
    const cardTheme = validThemes.includes(body.cardTheme || '') ? body.cardTheme! : 'paper';
    const isAnonymous = body.isAnonymous !== false ? 1 : 0;
    const title = cleanText(body.title, 120) || null;

    let pollQ = cleanText(body.pollQuestion, 200) || null;
    let pollA = cleanText(body.pollOptionA, 60) || null;
    let pollB = cleanText(body.pollOptionB, 60) || null;
    if (!pollQ || !pollA || !pollB) {
      pollQ = null; pollA = null; pollB = null;
    }

    const promptId = body.promptId ? cleanText(body.promptId, 50) : null;
    const source = promptId ? 'prompt_response' : 'user';
    const postId = 'post-' + crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO pulse_posts (
        id, user_id, author_handle, is_anonymous, channel, title, body, card_theme, source,
        poll_question, poll_option_a, poll_option_b, prompt_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      postId, user.id, user.username, isAnonymous, channel, title, text, cardTheme, source,
      pollQ, pollA, pollB, promptId
    ).run();

    return json({ ok: true, postId });
  }

  // --- POST /api/pulse/react: Toggle 5-Emoji Reaction ---
  if (path === '/api/pulse/react' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to react.' }, 401);
    const body = await safeJson<{ postId?: string; reactionType?: string }>(request);
    const rawPostId = cleanText(body.postId, 64);
    const postId = rawPostId.split('_cyc')[0]; // Strip cycle decoration
    const reactionType = cleanText(body.reactionType, 20);

    const allowed = ['fire', 'skull', 'popcorn', 'brain', 'heartbreak'];
    if (!allowed.includes(reactionType)) return json({ error: 'Invalid reaction.' }, 400);

    const existing = await env.DB.prepare(
      'SELECT reaction_type FROM pulse_reactions WHERE post_id = ? AND user_id = ? AND reaction_type = ?'
    ).bind(postId, user.id, reactionType).first();

    if (existing) {
      await env.DB.prepare(
        'DELETE FROM pulse_reactions WHERE post_id = ? AND user_id = ? AND reaction_type = ?'
      ).bind(postId, user.id, reactionType).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO pulse_reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)'
      ).bind(postId, user.id, reactionType).run();
    }

    const updated = await env.DB.prepare(
      'SELECT reaction_type, COUNT(*) as count FROM pulse_reactions WHERE post_id = ? GROUP BY reaction_type'
    ).bind(postId).all<{ reaction_type: string; count: number }>();

    const reactionCounts: Record<string, number> = {};
    for (const r of updated.results || []) {
      reactionCounts[r.reaction_type] = r.count;
    }

    const myReactions = await env.DB.prepare(
      'SELECT reaction_type FROM pulse_reactions WHERE post_id = ? AND user_id = ?'
    ).bind(postId, user.id).all<{ reaction_type: string }>();

    return json({
      ok: true,
      reactionCounts,
      myReactions: (myReactions.results || []).map(r => r.reaction_type)
    });
  }

  // --- GET /api/pulse/comments/:postId ---
  const commentsMatch = path.match(/^\/api\/pulse\/comments\/([a-zA-Z0-9_-]+)$/);
  if (commentsMatch && method === 'GET') {
    const rawPostId = commentsMatch[1];
    const postId = rawPostId.split('_cyc')[0];
    const comments = await env.DB.prepare(`
      SELECT c.id, c.post_id, c.user_id, c.author_handle, c.is_anonymous, c.body, c.created_at, u.avatar_url
      FROM pulse_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
      LIMIT 100
    `).bind(postId).all();

    const formatted = (comments.results || []).map((c: any) => ({
      id: c.id,
      postId: c.post_id,
      userId: c.user_id,
      authorHandle: c.is_anonymous ? 'Anonymous 🎭' : c.author_handle,
      avatarUrl: c.is_anonymous ? null : c.avatar_url,
      isAnonymous: Boolean(c.is_anonymous),
      body: c.body,
      createdAt: c.created_at
    }));

    return json({ comments: formatted });
  }

  // --- POST /api/pulse/comments/:postId ---
  if (commentsMatch && method === 'POST') {
    if (!user) return json({ error: 'Sign in to join the conversation.' }, 401);
    const rawPostId = commentsMatch[1];
    const postId = rawPostId.split('_cyc')[0];
    const body = await safeJson<{ body?: string; isAnonymous?: boolean }>(request);
    const text = cleanText(body.body, 2000);
    if (!text || text.length < 1) return json({ error: 'Comment cannot be empty.' }, 400);

    const isAnonymous = body.isAnonymous !== false ? 1 : 0;
    const commentId = 'com-' + crypto.randomUUID();

    await env.DB.prepare(
      'INSERT INTO pulse_comments (id, post_id, user_id, author_handle, is_anonymous, body) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(commentId, postId, user.id, user.username, isAnonymous, text).run();

    return json({
      ok: true,
      comment: {
        id: commentId,
        postId,
        userId: user.id,
        authorHandle: isAnonymous ? 'Anonymous 🎭' : user.username,
        avatarUrl: isAnonymous ? null : user.avatar_url,
        isAnonymous: Boolean(isAnonymous),
        body: text,
        createdAt: new Date().toISOString()
      }
    });
  }

  // --- POST /api/pulse/poll-vote ---
  if (path === '/api/pulse/poll-vote' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to vote.' }, 401);
    const body = await safeJson<{ postId?: string; choice?: string }>(request);
    const rawPostId = cleanText(body.postId, 64);
    const postId = rawPostId.split('_cyc')[0];
    const choice = body.choice === 'b' ? 'b' : 'a';

    await env.DB.prepare(
      'INSERT OR REPLACE INTO pulse_poll_votes (post_id, user_id, choice) VALUES (?, ?, ?)'
    ).bind(postId, user.id, choice).run();

    const votes = await env.DB.prepare(
      'SELECT choice, COUNT(*) as count FROM pulse_poll_votes WHERE post_id = ? GROUP BY choice'
    ).bind(postId).all<{ choice: string; count: number }>();

    let votesA = 0;
    let votesB = 0;
    for (const v of votes.results || []) {
      if (v.choice === 'a') votesA = v.count;
      if (v.choice === 'b') votesB = v.count;
    }

    return json({ ok: true, votesA, votesB, myVote: choice });
  }

  // --- ENGINE 1: Sync & Bulk Ingest Master Catalog ---
  if (path === '/api/pulse/sync' && (method === 'POST' || method === 'GET')) {
    let insertedCount = 0;
    for (const item of MASTER_PULSE_CATALOG) {
      const id = 'syn-' + await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.title + item.body))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));

      const res = await env.DB.prepare(`
        INSERT OR IGNORE INTO pulse_posts (
          id, author_handle, is_anonymous, channel, title, body, card_theme, source, poll_question, poll_option_a, poll_option_b, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'syndicated', ?, ?, ?, datetime('now', '-' || (ABS(RANDOM()) % 72) || ' hours'))
      `).bind(
        id, item.author || 'Anonymous 🎭', item.author.includes('Anonymous') ? 1 : 0,
        item.channel, item.title, item.body, item.theme || 'paper',
        item.pollQ || null, item.pollA || null, item.pollB || null
      ).run();

      if (res.meta?.changes) insertedCount++;
    }

    return json({ ok: true, synced: insertedCount });
  }

  return json({ error: 'Not found' }, 404);
}
