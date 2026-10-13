import type { Env } from './index';
import { MASTER_PULSE_CATALOG } from './pulse-catalog';

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

// Deterministic calendar day prompt calculation
function getDailyPromptKey(dateStr: string, totalPrompts: number): number {
  if (totalPrompts <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % totalPrompts;
}

// Admin-only, idempotent starter catalog seeder
async function seedCatalogIdempotent(env: Env): Promise<number> {
  const stmts: D1PreparedStatement[] = [];
  for (const item of MASTER_PULSE_CATALOG) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.title + item.body))
      .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));
    const id = 'pulse-' + hash;

    stmts.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO pulse_posts (
          id, author_handle, is_anonymous, channel, title, body, card_theme, gradient_theme,
          font_style, vibe_sticker, is_spoiler, source, poll_question, poll_option_a, poll_option_b,
          reaction_count, comment_count, is_deleted, is_hidden, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'syndicated', ?, ?, ?, 0, 0, 0, 0, datetime('now', '-' || (ABS(RANDOM()) % 72) || ' hours'))
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
  return insertedCount;
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
        'INSERT INTO pulse_posts (id, user_id, author_handle, is_anonymous, channel, title, body, card_theme, gradient_theme, font_style, vibe_sticker, is_spoiler, source, reaction_count, comment_count, is_deleted, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)'
      ).bind(postId, user.id, user.username, 0, 'confessions', 'Secret Confession & Reply', content, 'sunset', 'sunset', 'sans', '🤫 Classified Secret', 1, 'anonymous_ask').run();
    }

    return json({ ok: true, published: publishToFeed });
  }

  // --- PULSE FEED: Main Infinite Keyset Feed Listing ---
  if (path === '/api/pulse/feed' && method === 'GET') {
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'all';
    const sort = url.searchParams.get('sort') || 'fresh'; // 'foryou' | 'trending' | 'fresh' | 'debated'
    const vibeFilter = cleanText(url.searchParams.get('vibe'), 50);
    const spoilersOnly = url.searchParams.get('spoilers') === '1';
    const promptFilter = cleanText(url.searchParams.get('promptId'), 64);
    const cursor = cleanText(url.searchParams.get('cursor'), 128);
    const limit = Math.min(40, Math.max(5, parseInt(url.searchParams.get('limit') || '15', 10)));

    const whereClauses: string[] = ['p.is_deleted = 0', 'p.is_hidden = 0'];
    const params: unknown[] = [];

    // Filter out users blocked by the authenticated user
    if (user) {
      whereClauses.push('(p.user_id IS NULL OR p.user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE user_id = ?))');
      params.push(user.id);
    }

    if (channel !== 'all') {
      whereClauses.push('p.channel = ?');
      params.push(channel);
    }

    if (promptFilter) {
      whereClauses.push('p.prompt_id = ?');
      params.push(promptFilter);
    }

    if (vibeFilter) {
      whereClauses.push('p.vibe_sticker LIKE ?');
      params.push(`%${vibeFilter}%`);
    }

    if (spoilersOnly) {
      whereClauses.push('p.is_spoiler = 1');
    }

    let orderClause = '';
    const orderParams: unknown[] = [];

    // Parse Keyset Cursor
    if (sort === 'fresh') {
      if (cursor && cursor.includes('___')) {
        const [cursorCreated, cursorId] = cursor.split('___');
        if (cursorCreated && cursorId) {
          whereClauses.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
          params.push(cursorCreated, cursorCreated, cursorId);
        }
      }
      orderClause = 'ORDER BY p.created_at DESC, p.id DESC';
    } else if (sort === 'trending') {
      if (cursor && cursor.includes('___')) {
        const parts = cursor.split('___');
        if (parts.length === 3) {
          const cursorScore = parseInt(parts[0], 10) || 0;
          const cursorCreated = parts[1];
          const cursorId = parts[2];
          whereClauses.push(`(
            (p.reaction_count * 2 + p.comment_count * 3) < ? 
            OR ((p.reaction_count * 2 + p.comment_count * 3) = ? AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?)))
          )`);
          params.push(cursorScore, cursorScore, cursorCreated, cursorCreated, cursorId);
        }
      }
      orderClause = 'ORDER BY (p.reaction_count * 2 + p.comment_count * 3) DESC, p.created_at DESC, p.id DESC';
    } else if (sort === 'debated') {
      if (cursor && cursor.includes('___')) {
        const parts = cursor.split('___');
        if (parts.length === 3) {
          const cursorComments = parseInt(parts[0], 10) || 0;
          const cursorCreated = parts[1];
          const cursorId = parts[2];
          whereClauses.push(`(
            p.comment_count < ? 
            OR (p.comment_count = ? AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?)))
          )`);
          params.push(cursorComments, cursorComments, cursorCreated, cursorCreated, cursorId);
        }
      }
      orderClause = 'ORDER BY p.comment_count DESC, p.created_at DESC, p.id DESC';
    } else {
      // 'foryou' (Default Algorithmic FYP with session seed)
      const seed = parseInt(url.searchParams.get('seed') || '42', 10);
      orderClause = `ORDER BY ((unicode(substr(p.id, -1, 1)) * 7919 + unicode(substr(p.id, -2, 1)) * 104729 + ?) % 100000) ASC, p.id ASC`;
      orderParams.push(seed);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Handle offset for For-You pseudo-random shuffle
    let offsetClause = '';
    let currentOffset = 0;
    if (sort === 'foryou' && cursor && cursor.startsWith('offset_')) {
      currentOffset = Math.max(0, parseInt(cursor.replace('offset_', ''), 10) || 0);
      offsetClause = `OFFSET ${currentOffset}`;
    }

    // High performance query: directly uses indexed columns without 4 unbounded join subqueries!
    const baseQuery = `
      SELECT 
        p.id, p.user_id, p.author_handle, p.is_anonymous, p.channel, p.title, p.body,
        p.card_theme, p.gradient_theme, p.font_style, p.vibe_sticker, p.is_spoiler,
        p.source, p.poll_question, p.poll_option_a, p.poll_option_b, p.prompt_id,
        p.created_at, p.reaction_count, p.comment_count,
        u.avatar_url
      FROM pulse_posts p
      LEFT JOIN users u ON p.user_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT ? ${offsetClause}
    `;

    const fetchLimit = limit + 1;
    const batchRes = await env.DB.prepare(baseQuery).bind(...params, ...orderParams, fetchLimit).all<any>();
    const rawRows = batchRes.results || [];
    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const postIds = rows.map((r: any) => r.id);

    // Compute next cursor for stable pagination
    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const last = rows[rows.length - 1];
      if (sort === 'fresh') {
        nextCursor = `${last.created_at}___${last.id}`;
      } else if (sort === 'trending') {
        const score = (last.reaction_count || 0) * 2 + (last.comment_count || 0) * 3;
        nextCursor = `${score}___${last.created_at}___${last.id}`;
      } else if (sort === 'debated') {
        nextCursor = `${last.comment_count || 0}___${last.created_at}___${last.id}`;
      } else {
        nextCursor = `offset_${currentOffset + rows.length}`;
      }
    }

    // Fetch reactions breakdown and user states ONLY for the fetched page of post IDs
    let reactionsMap: Record<string, Record<string, number>> = {};
    let userReactionsMap: Record<string, string[]> = {};
    let userVotesMap: Record<string, string> = {};
    let pollVotesMap: Record<string, { a: number; b: number }> = {};

    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      
      const [reactionBreakdown, pollBreakdown] = await Promise.all([
        env.DB.prepare(
          `SELECT post_id, reaction_type, COUNT(*) as count FROM pulse_reactions WHERE post_id IN (${placeholders}) GROUP BY post_id, reaction_type`
        ).bind(...postIds).all<{ post_id: string; reaction_type: string; count: number }>(),
        env.DB.prepare(
          `SELECT post_id, choice, COUNT(*) as count FROM pulse_poll_votes WHERE post_id IN (${placeholders}) GROUP BY post_id, choice`
        ).bind(...postIds).all<{ post_id: string; choice: string; count: number }>()
      ]);

      for (const row of reactionBreakdown.results || []) {
        if (!reactionsMap[row.post_id]) reactionsMap[row.post_id] = {};
        reactionsMap[row.post_id][row.reaction_type] = row.count;
      }

      for (const row of pollBreakdown.results || []) {
        if (!pollVotesMap[row.post_id]) pollVotesMap[row.post_id] = { a: 0, b: 0 };
        if (row.choice === 'a') pollVotesMap[row.post_id].a = row.count;
        if (row.choice === 'b') pollVotesMap[row.post_id].b = row.count;
      }

      if (user) {
        const [userReactions, userVotes] = await Promise.all([
          env.DB.prepare(
            `SELECT post_id, reaction_type FROM pulse_reactions WHERE user_id = ? AND post_id IN (${placeholders})`
          ).bind(user.id, ...postIds).all<{ post_id: string; reaction_type: string }>(),
          env.DB.prepare(
            `SELECT post_id, choice FROM pulse_poll_votes WHERE user_id = ? AND post_id IN (${placeholders})`
          ).bind(user.id, ...postIds).all<{ post_id: string; choice: string }>()
        ]);

        for (const row of userReactions.results || []) {
          if (!userReactionsMap[row.post_id]) userReactionsMap[row.post_id] = [];
          userReactionsMap[row.post_id].push(row.reaction_type);
        }

        for (const row of userVotes.results || []) {
          userVotesMap[row.post_id] = row.choice;
        }
      }
    }

    // Daily Pulse Prompt Engine: Deterministic for current calendar day
    const todayDate = new Date().toISOString().slice(0, 10);
    const activePromptsRes = await env.DB.prepare(
      'SELECT id, channel, prompt_text FROM pulse_prompts WHERE is_active = 1 ORDER BY id ASC'
    ).all<{ id: string; channel: string; prompt_text: string }>();
    const activePrompts = activePromptsRes.results || [];

    let dailyPrompt: {
      id: string;
      channel: string;
      promptText: string;
      date: string;
      responseCount: number;
      hasAnsweredToday: boolean;
    } | null = null;

    if (activePrompts.length > 0) {
      const promptIdx = getDailyPromptKey(todayDate, activePrompts.length);
      const chosen = activePrompts[promptIdx];

      const countRes = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM pulse_posts WHERE prompt_id = ? AND is_deleted = 0'
      ).bind(chosen.id).first<{ count: number }>();

      let hasAnswered = false;
      if (user) {
        const answeredRes = await env.DB.prepare(
          'SELECT 1 FROM pulse_posts WHERE prompt_id = ? AND user_id = ? AND is_deleted = 0 LIMIT 1'
        ).bind(chosen.id, user.id).first();
        hasAnswered = !!answeredRes;
      }

      dailyPrompt = {
        id: chosen.id,
        channel: chosen.channel,
        promptText: chosen.prompt_text,
        date: todayDate,
        responseCount: countRes?.count || 0,
        hasAnsweredToday: hasAnswered,
      };
    }

    // Map rows with strict identity scrubbing
    const posts = rows.map((r: any) => {
      const isAnon = Boolean(r.is_anonymous);
      const pv = pollVotesMap[r.id] || { a: 0, b: 0 };
      return {
        id: r.id,
        // SECURITY: Never leak account userId for anonymous posts!
        userId: isAnon ? null : r.user_id,
        authorHandle: isAnon ? 'Anonymous 🎭' : r.author_handle,
        avatarUrl: isAnon ? null : r.avatar_url,
        isAnonymous: isAnon,
        isOwner: user ? user.id === r.user_id : false,
        channel: r.channel,
        title: r.title,
        body: r.body,
        cardTheme: r.card_theme || 'paper',
        gradientTheme: r.gradient_theme || r.card_theme || 'aurora',
        fontStyle: r.font_style || 'sans',
        vibeSticker: r.vibe_sticker || null,
        isSpoiler: Boolean(r.is_spoiler),
        source: r.source || 'user',
        promptId: r.prompt_id || null,
        createdAt: r.created_at,
        reactionCounts: reactionsMap[r.id] || {},
        totalReactions: r.reaction_count || 0,
        myReactions: userReactionsMap[r.id] || [],
        commentCount: r.comment_count || 0,
        poll: r.poll_question ? {
          question: r.poll_question,
          optionA: r.poll_option_a,
          optionB: r.poll_option_b,
          votesA: pv.a,
          votesB: pv.b,
          myVote: userVotesMap[r.id] || null
        } : null
      };
    });

    return json({
      posts,
      prompts: activePrompts,
      dailyPrompt,
      nextCursor,
      hasMore
    });
  }

  // --- POST /api/pulse/posts: Create Post with Full Customization & Anti-Spam ---
  if (path === '/api/pulse/posts' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to drop a thought.' }, 401);

    // Anti-spam rate limiting: 1 post per 20 seconds
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM pulse_posts WHERE user_id = ? AND created_at > datetime('now', '-20 seconds')"
    ).bind(user.id).first<{ count: number }>();
    if (recent && recent.count > 0) {
      return json({ error: 'Please wait a few seconds before sharing another thought.' }, 429);
    }

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
        font_style, vibe_sticker, is_spoiler, source, poll_question, poll_option_a, poll_option_b, prompt_id,
        reaction_count, comment_count, is_deleted, is_hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
    `).bind(
      postId, user.id, user.username, isAnonymous, channel, title, text, theme, theme,
      fontStyle, vibeSticker, isSpoiler, source, pollQ, pollA, pollB, promptId
    ).run();

    return json({ ok: true, postId });
  }

  // --- DELETE /api/pulse/posts/:id: Author or Admin Soft-Delete ---
  const postDeleteMatch = path.match(/^\/api\/pulse\/posts\/([a-zA-Z0-9_-]+)$/);
  if (postDeleteMatch && method === 'DELETE') {
    if (!user) return json({ error: 'Sign in required.' }, 401);
    const postId = postDeleteMatch[1];
    const post = await env.DB.prepare('SELECT id, user_id FROM pulse_posts WHERE id = ?').bind(postId).first<{ id: string; user_id: string }>();
    if (!post) return json({ error: 'Post not found.' }, 404);

    if (post.user_id !== user.id && user.role !== 'admin') {
      return json({ error: 'You do not have permission to delete this post.' }, 403);
    }

    await env.DB.prepare('UPDATE pulse_posts SET is_deleted = 1 WHERE id = ?').bind(postId).run();
    return json({ ok: true, deletedPostId: postId });
  }

  // --- POST /api/pulse/react: Toggle 5-Emoji Reaction ---
  if (path === '/api/pulse/react' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to react.' }, 401);
    const body = await safeJson<{ postId?: string; reactionType?: string }>(request);
    const postId = cleanText(body.postId, 64);
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

    // Keep cached reaction_count synchronized
    await env.DB.prepare(
      'UPDATE pulse_posts SET reaction_count = (SELECT COUNT(*) FROM pulse_reactions WHERE post_id = ?) WHERE id = ?'
    ).bind(postId, postId).run();

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

  // --- GET /api/pulse/comments/:postId: Comments Thread ---
  const commentsMatch = path.match(/^\/api\/pulse\/comments\/([a-zA-Z0-9_-]+)$/);
  if (commentsMatch && method === 'GET') {
    const postId = commentsMatch[1];
    const comments = await env.DB.prepare(`
      SELECT c.id, c.post_id, c.user_id, c.author_handle, c.is_anonymous, c.body, c.created_at, u.avatar_url
      FROM pulse_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? AND c.is_deleted = 0 AND c.is_hidden = 0
      ORDER BY c.created_at ASC
      LIMIT 100
    `).bind(postId).all();

    const formatted = (comments.results || []).map((c: any) => {
      const isAnon = Boolean(c.is_anonymous);
      return {
        id: c.id,
        postId: c.post_id,
        // SECURITY: Never leak account userId for anonymous comments!
        userId: isAnon ? null : c.user_id,
        authorHandle: isAnon ? 'Anonymous 🎭' : c.author_handle,
        avatarUrl: isAnon ? null : c.avatar_url,
        isAnonymous: isAnon,
        isOwner: user ? user.id === c.user_id : false,
        body: c.body,
        createdAt: c.created_at
      };
    });

    return json({ comments: formatted });
  }

  // --- POST /api/pulse/comments/:postId: Add Comment & Anti-Spam ---
  if (commentsMatch && method === 'POST') {
    if (!user) return json({ error: 'Sign in to join the conversation.' }, 401);
    const postId = commentsMatch[1];

    // Anti-spam rate limiting: 1 comment per 5 seconds
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM pulse_comments WHERE user_id = ? AND created_at > datetime('now', '-5 seconds')"
    ).bind(user.id).first<{ count: number }>();
    if (recent && recent.count > 0) {
      return json({ error: 'Please slow down a moment between comments.' }, 429);
    }

    const body = await safeJson<{ body?: string; isAnonymous?: boolean }>(request);
    const text = cleanText(body.body, 2000);
    if (!text || text.length < 1) return json({ error: 'Comment cannot be empty.' }, 400);

    const isAnonymous = body.isAnonymous !== false ? 1 : 0;
    const commentId = 'com-' + crypto.randomUUID();

    await env.DB.prepare(
      'INSERT INTO pulse_comments (id, post_id, user_id, author_handle, is_anonymous, body, is_deleted, is_hidden) VALUES (?, ?, ?, ?, ?, ?, 0, 0)'
    ).bind(commentId, postId, user.id, user.username, isAnonymous, text).run();

    // Increment cached comment_count on pulse_posts
    await env.DB.prepare(
      'UPDATE pulse_posts SET comment_count = (SELECT COUNT(*) FROM pulse_comments WHERE post_id = ? AND is_deleted = 0) WHERE id = ?'
    ).bind(postId, postId).run();

    return json({
      ok: true,
      comment: {
        id: commentId,
        postId,
        userId: isAnonymous ? null : user.id,
        authorHandle: isAnonymous ? 'Anonymous 🎭' : user.username,
        avatarUrl: isAnonymous ? null : user.avatar_url,
        isAnonymous: Boolean(isAnonymous),
        isOwner: true,
        body: text,
        createdAt: new Date().toISOString()
      }
    });
  }

  // --- DELETE /api/pulse/comments/:id: Author or Admin Soft-Delete Comment ---
  const commentDeleteMatch = path.match(/^\/api\/pulse\/comments\/([a-zA-Z0-9_-]+)$/);
  if (commentDeleteMatch && method === 'DELETE') {
    if (!user) return json({ error: 'Sign in required.' }, 401);
    const commentId = commentDeleteMatch[1];
    const comment = await env.DB.prepare('SELECT id, post_id, user_id FROM pulse_comments WHERE id = ?').bind(commentId).first<{ id: string; post_id: string; user_id: string }>();
    if (!comment) return json({ error: 'Comment not found.' }, 404);

    if (comment.user_id !== user.id && user.role !== 'admin') {
      return json({ error: 'You do not have permission to delete this comment.' }, 403);
    }

    await env.DB.prepare('UPDATE pulse_comments SET is_deleted = 1 WHERE id = ?').bind(commentId).run();

    // Re-synchronize cached comment_count on pulse_posts
    await env.DB.prepare(
      'UPDATE pulse_posts SET comment_count = (SELECT COUNT(*) FROM pulse_comments WHERE post_id = ? AND is_deleted = 0) WHERE id = ?'
    ).bind(comment.post_id, comment.post_id).run();

    return json({ ok: true, deletedCommentId: commentId });
  }

  // --- POST /api/pulse/poll-vote ---
  if (path === '/api/pulse/poll-vote' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to vote.' }, 401);
    const body = await safeJson<{ postId?: string; choice?: string }>(request);
    const postId = cleanText(body.postId, 64);
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

  // --- POST /api/pulse/report: Student Community Reporting ---
  if (path === '/api/pulse/report' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to report content.' }, 401);
    const body = await safeJson<{ targetType?: string; targetId?: string; reason?: string }>(request);
    const targetType = body.targetType === 'comment' ? 'comment' : 'post';
    const targetId = cleanText(body.targetId, 64);
    const reason = cleanText(body.reason, 500);

    if (!targetId) return json({ error: 'Target ID is required.' }, 400);
    if (!reason || reason.length < 3) return json({ error: 'Please provide a clear reason for the report (at least 3 characters).' }, 400);

    // Anti-spam: max 5 reports per 10 minutes
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM pulse_reports WHERE reporter_id = ? AND created_at > datetime('now', '-10 minutes')"
    ).bind(user.id).first<{ count: number }>();
    if (recent && recent.count >= 5) {
      return json({ error: 'You have submitted several reports recently. Our moderation team is looking into them.' }, 429);
    }

    const reportId = 'rep-' + crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO pulse_reports (id, reporter_id, target_type, target_id, reason, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(reportId, user.id, targetType, targetId, reason, 'pending').run();

    return json({ ok: true, message: 'Thank you for reporting. Our moderation team will review this shortly.' });
  }

  // --- POST /api/pulse/block: Block or Mute Unwanted Users ---
  if (path === '/api/pulse/block' && method === 'POST') {
    if (!user) return json({ error: 'Sign in to block users.' }, 401);
    const body = await safeJson<{ targetUserId?: string }>(request);
    const targetUserId = cleanText(body.targetUserId, 64);

    if (!targetUserId) return json({ error: 'User identifier is required.' }, 400);
    if (targetUserId === user.id) return json({ error: 'You cannot block yourself.' }, 400);

    await env.DB.prepare(
      'INSERT OR IGNORE INTO user_blocks (user_id, blocked_user_id) VALUES (?, ?)'
    ).bind(user.id, targetUserId).run();

    return json({ ok: true, message: 'User blocked. You will no longer see content from this account.' });
  }

  // --- POST /api/pulse/sync: Admin-Guarded Idempotent Catalog Seeder ---
  if (path === '/api/pulse/sync') {
    if (method !== 'POST') {
      return json({ error: 'Method Not Allowed. Sync mutations require POST with administrator credentials.' }, 405);
    }

    if (!user || user.role !== 'admin') {
      return json({ error: 'Forbidden: Administrator privileges required to synchronize catalog.' }, 403);
    }

    const synced = await seedCatalogIdempotent(env);
    return json({ ok: true, synced, message: `Successfully synchronized ${synced} catalog starter items.` });
  }

  return json({ error: 'Not found' }, 404);
}
