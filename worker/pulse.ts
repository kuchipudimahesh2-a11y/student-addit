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

    // Rate-limiting check: max 10 asks per hour from same IP to this user
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

    // Mark unread as read
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

  // --- PULSE FEED: Main Feed Listing ---
  if (path === '/api/pulse/feed' && method === 'GET') {
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'all';
    const sort = url.searchParams.get('sort') || 'fresh'; // 'trending' | 'fresh' | 'debated'
    const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit') || '25', 10)));
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

    // Subquery to calculate reactions and comments efficiently
    const query = `
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

    params.push(limit, offset);
    const rows = await env.DB.prepare(query).bind(...params).all<any>();
    const postIds = (rows.results || []).map((r: any) => r.id);

    // Fetch reactions breakdown for these posts
    let reactionsMap: Record<string, Record<string, number>> = {};
    let userReactionsMap: Record<string, string[]> = {};
    let userVotesMap: Record<string, string> = {};

    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      const reactionBreakdown = await env.DB.prepare(
        `SELECT post_id, reaction_type, COUNT(*) as count FROM pulse_reactions WHERE post_id IN (${placeholders}) GROUP BY post_id, reaction_type`
      ).bind(...postIds).all<{ post_id: string; reaction_type: string; count: number }>();

      for (const row of reactionBreakdown.results || []) {
        if (!reactionsMap[row.post_id]) reactionsMap[row.post_id] = {};
        reactionsMap[row.post_id][row.reaction_type] = row.count;
      }

      if (user) {
        const userReactions = await env.DB.prepare(
          `SELECT post_id, reaction_type FROM pulse_reactions WHERE user_id = ? AND post_id IN (${placeholders})`
        ).bind(user.id, ...postIds).all<{ post_id: string; reaction_type: string }>();

        for (const row of userReactions.results || []) {
          if (!userReactionsMap[row.post_id]) userReactionsMap[row.post_id] = [];
          userReactionsMap[row.post_id].push(row.reaction_type);
        }

        const userVotes = await env.DB.prepare(
          `SELECT post_id, choice FROM pulse_poll_votes WHERE user_id = ? AND post_id IN (${placeholders})`
        ).bind(user.id, ...postIds).all<{ post_id: string; choice: string }>();

        for (const row of userVotes.results || []) {
          userVotesMap[row.post_id] = row.choice;
        }
      }
    }

    // Engine 3: Fetch active prompts to interleave into the feed
    const prompts = await env.DB.prepare('SELECT id, channel, prompt_text FROM pulse_prompts WHERE is_active = 1 LIMIT 5').all();

    const posts = (rows.results || []).map((r: any) => ({
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
      reactionCounts: reactionsMap[r.id] || {},
      totalReactions: r.reaction_count,
      myReactions: userReactionsMap[r.id] || [],
      commentCount: r.comment_count,
      poll: r.poll_question ? {
        question: r.poll_question,
        optionA: r.poll_option_a,
        optionB: r.poll_option_b,
        votesA: r.votes_a,
        votesB: r.votes_b,
        myVote: userVotesMap[r.id] || null
      } : null
    }));

    return json({
      posts,
      prompts: prompts.results || [],
      hasMore: rows.results.length === limit
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
    const postId = cleanText(body.postId, 64);
    const reactionType = cleanText(body.reactionType, 20);

    const allowed = ['fire', 'skull', 'popcorn', 'brain', 'heartbreak'];
    if (!allowed.includes(reactionType)) return json({ error: 'Invalid reaction.' }, 400);

    // Check if user already reacted
    const existing = await env.DB.prepare(
      'SELECT reaction_type FROM pulse_reactions WHERE post_id = ? AND user_id = ? AND reaction_type = ?'
    ).bind(postId, user.id, reactionType).first();

    if (existing) {
      // Toggle off
      await env.DB.prepare(
        'DELETE FROM pulse_reactions WHERE post_id = ? AND user_id = ? AND reaction_type = ?'
      ).bind(postId, user.id, reactionType).run();
    } else {
      // Toggle on
      await env.DB.prepare(
        'INSERT INTO pulse_reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)'
      ).bind(postId, user.id, reactionType).run();
    }

    // Return updated reaction counts
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
    const postId = commentsMatch[1];
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
    const postId = commentsMatch[1];
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
    const postId = cleanText(body.postId, 64);
    const choice = body.choice === 'b' ? 'b' : 'a';

    // Insert or replace vote
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

  // --- ENGINE 1: Syndicated Content Sync ---
  // Ingests / ensures fresh content without breaking rate limits
  if (path === '/api/pulse/sync' && (method === 'POST' || method === 'GET')) {
    // Curated syndicated bank of fresh content for offline / fast fallback
    const curatedBank = [
      {
        channel: 'hot_takes',
        title: 'Networking is Overrated',
        body: 'Cold emailing people for coffee chats has a 3% success rate. Building something impressive in public and sharing the process gets people messaging you first.',
        pollQ: 'Which works better in 2026?',
        pollA: 'Build in public',
        pollB: 'Traditional networking',
        theme: 'velvet'
      },
      {
        channel: 'confessions',
        title: 'Pretending to Know Git',
        body: 'I have been a software engineer for 4 years. Every time Git gives me a rebase conflict that has more than 3 files, I clone the repo fresh into another folder and copy my files over manually.',
        theme: 'paper'
      },
      {
        channel: 'real_talk',
        title: 'Salary Transparency',
        body: 'The single biggest jump in my compensation happened not by staying loyal for a 5% raise, but by interviewing every 18 months. Companies have zero budget for retention but infinite budget for hiring.',
        pollQ: 'Best way to increase salary?',
        pollA: 'Switch jobs regularly',
        pollB: 'Grow inside one company',
        theme: 'terracotta'
      },
      {
        channel: 'midnight',
        title: 'Sunday Scaries',
        body: 'If you dread Sunday nights because of Monday mornings, it is not laziness. Your nervous system is trying to tell you that your current environment is draining you. Listen to it.',
        theme: 'sage'
      },
      {
        channel: 'confessions',
        title: 'Camera Off Culture',
        body: '90% of the reason I prefer remote work is that I can eat cereal during all-hands meetings with my camera off and nobody will ever know.',
        theme: 'paper'
      }
    ];

    let insertedCount = 0;
    for (const item of curatedBank) {
      const id = 'syn-' + await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.title + item.body))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));

      const res = await env.DB.prepare(`
        INSERT OR IGNORE INTO pulse_posts (
          id, author_handle, is_anonymous, channel, title, body, card_theme, source, poll_question, poll_option_a, poll_option_b
        ) VALUES (?, 'Syndicated Pulse', 1, ?, ?, ?, ?, 'syndicated', ?, ?, ?)
      `).bind(
        id, item.channel, item.title, item.body, item.theme, item.pollQ || null, item.pollA || null, item.pollB || null
      ).run();

      if (res.meta?.changes) insertedCount++;
    }

    return json({ ok: true, synced: insertedCount });
  }

  return json({ error: 'Not found' }, 404);
}
