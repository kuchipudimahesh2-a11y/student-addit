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

import { MASTER_PULSE_CATALOG } from './pulse-catalog';

// Helper to auto-seed if database is low on posts or upgrade existing posts
async function ensureRichContent(env: Env) {
  try {
    const count = await env.DB.prepare('SELECT COUNT(*) as count FROM pulse_posts').first<{ count: number }>();
    if (count && count.count >= MASTER_PULSE_CATALOG.length) return;

    const stmts: D1PreparedStatement[] = [];
    for (const item of MASTER_PULSE_CATALOG) {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.title + item.body))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));
      const id = 'pulse-' + hash;

      stmts.push(
        env.DB.prepare(`
          INSERT OR IGNORE INTO pulse_posts (
            id, author_handle, is_anonymous, channel, title, body, card_theme, gradient_theme,
            font_style, vibe_sticker, is_spoiler, source, poll_question, poll_option_a, poll_option_b, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'syndicated', ?, ?, ?, datetime('now', '-' || (ABS(RANDOM()) % 72) || ' hours'))
        `).bind(
          id, item.author || 'Anonymous 🎭', (item.author && item.author.includes('Anonymous')) ? 1 : 0,
          item.channel, item.title, item.body, item.theme || 'paper', item.theme || 'aurora',
          item.fontStyle || 'sans', item.vibeSticker || null, item.isSpoiler ? 1 : 0,
          item.pollQ || null, item.pollA || null, item.pollB || null
        )
      );
    }

    for (let i = 0; i < stmts.length; i += 40) {
      await env.DB.batch(stmts.slice(i, i + 40));
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
        'INSERT INTO pulse_posts (id, user_id, author_handle, is_anonymous, channel, title, body, card_theme, gradient_theme, font_style, vibe_sticker, is_spoiler, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(postId, user.id, user.username, 0, 'confessions', 'Secret Confession & Reply', content, 'sunset', 'sunset', 'sans', '🤫 Classified Secret', 1, 'anonymous_ask').run();
    }

    return json({ ok: true, published: publishToFeed });
  }

  // --- PULSE FEED: Main Infinite Feed Listing ---
  if (path === '/api/pulse/feed' && method === 'GET') {
    await ensureRichContent(env);

    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'all';
    const sort = url.searchParams.get('sort') || 'fresh'; // 'trending' | 'fresh' | 'debated'
    const vibeFilter = cleanText(url.searchParams.get('vibe'), 50);
    const spoilersOnly = url.searchParams.get('spoilers') === '1';
    const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit') || '15', 10)));

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (channel !== 'all') {
      whereClauses.push('p.channel = ?');
      params.push(channel);
    }

    if (vibeFilter) {
      whereClauses.push('p.vibe_sticker LIKE ?');
      params.push(`%${vibeFilter}%`);
    }

    if (spoilersOnly) {
      whereClauses.push('p.is_spoiler = 1');
    }

    // Exclusion filter: posts already loaded in this viewing session are excluded entirely
    const excludeRaw = cleanText(url.searchParams.get('exclude'), 6000);
    const excludeIds = excludeRaw ? excludeRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 150) : [];
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      whereClauses.push(`p.id NOT IN (${placeholders})`);
      params.push(...excludeIds);
    }

    const seed = parseInt(url.searchParams.get('seed') || '42', 10);

    let orderClause = '';
    const orderParams: unknown[] = [];

    if (sort === 'trending') {
      orderClause = 'ORDER BY (reaction_count * 2 + comment_count * 3) DESC, p.created_at DESC';
    } else if (sort === 'debated') {
      orderClause = 'ORDER BY comment_count DESC, p.created_at DESC';
    } else if (sort === 'fresh') {
      orderClause = 'ORDER BY p.created_at DESC';
    } else {
      // 'foryou' (Default Algorithmic FYP):
      // Deterministically pseudo-shuffled by session seed
      orderClause = `ORDER BY ((unicode(substr(p.id, -1, 1)) * 7919 + unicode(substr(p.id, -2, 1)) * 104729 + ?) % 100000) ASC`;
      orderParams.push(seed);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const baseQuery = `
      SELECT 
        p.id, p.user_id, p.author_handle, p.is_anonymous, p.channel, p.title, p.body,
        p.card_theme, p.gradient_theme, p.font_style, p.vibe_sticker, p.is_spoiler,
        p.source, p.poll_question, p.poll_option_a, p.poll_option_b,
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
      LIMIT ?
    `;

    const fetchLimit = limit + 1;
    const batchRes = await env.DB.prepare(baseQuery).bind(...params, ...orderParams, fetchLimit).all<any>();
    const rawRows = batchRes.results || [];
    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const postIds = rows.map((r: any) => r.id);

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
        gradientTheme: r.gradient_theme || r.card_theme || 'aurora',
        fontStyle: r.font_style || 'sans',
        vibeSticker: r.vibe_sticker || null,
        isSpoiler: Boolean(r.is_spoiler),
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
      hasMore
    });
  }

  // --- POST /api/pulse/posts: Create Post with Full Customization ---
  if (path === '/api/pulse/posts' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to drop a thought.' }, 401);
    const body = await safeJson<{
      title?: string;
      body?: string;
      channel?: string;
      cardTheme?: string;
      gradientTheme?: string;
      fontStyle?: string;
      vibeSticker?: string;
      isSpoiler?: boolean;
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
    
    const validThemes = ['aurora', 'cyber', 'receipt', 'espresso', 'sunset', 'sage', 'velvet', 'paper', 'terracotta'];
    const theme = validThemes.includes(body.gradientTheme || body.cardTheme || '') ? (body.gradientTheme || body.cardTheme)! : 'aurora';
    
    const validFonts = ['sans', 'serif', 'mono'];
    const fontStyle = validFonts.includes(body.fontStyle || '') ? body.fontStyle! : 'sans';
    const vibeSticker = cleanText(body.vibeSticker, 40) || null;
    const isSpoiler = body.isSpoiler ? 1 : 0;
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
        id, user_id, author_handle, is_anonymous, channel, title, body, card_theme, gradient_theme,
        font_style, vibe_sticker, is_spoiler, source, poll_question, poll_option_a, poll_option_b, prompt_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      postId, user.id, user.username, isAnonymous, channel, title, text, theme, theme,
      fontStyle, vibeSticker, isSpoiler, source, pollQ, pollA, pollB, promptId
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

  // --- ENGINE 1: Sync & Bulk Ingest Master Catalog with Dopamine Attributes ---
  if (path === '/api/pulse/sync' && (method === 'POST' || method === 'GET')) {
    const stmts: D1PreparedStatement[] = [];
    for (const item of MASTER_PULSE_CATALOG) {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.title + item.body))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));
      const id = 'pulse-' + hash;

      stmts.push(
        env.DB.prepare(`
          INSERT OR IGNORE INTO pulse_posts (
            id, author_handle, is_anonymous, channel, title, body, card_theme, gradient_theme,
            font_style, vibe_sticker, is_spoiler, source, poll_question, poll_option_a, poll_option_b, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'syndicated', ?, ?, ?, datetime('now', '-' || (ABS(RANDOM()) % 72) || ' hours'))
        `).bind(
          id, item.author || 'Anonymous 🎭', (item.author && item.author.includes('Anonymous')) ? 1 : 0,
          item.channel, item.title, item.body, item.theme || 'aurora', item.theme || 'aurora',
          item.fontStyle || 'sans', item.vibeSticker || null, item.isSpoiler ? 1 : 0,
          item.pollQ || null, item.pollA || null, item.pollB || null
        )
      );
    }

    let insertedCount = 0;
    for (let i = 0; i < stmts.length; i += 40) {
      const results = await env.DB.batch(stmts.slice(i, i + 40));
      for (const res of results) {
        if (res.meta?.changes) insertedCount += res.meta.changes;
      }
    }

    return json({ ok: true, synced: insertedCount });
  }

  return json({ error: 'Not found' }, 404);
}
