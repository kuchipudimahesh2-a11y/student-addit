import type { Env } from './index';

export type UserSession = {
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

// Curated high-engagement watermark-free vertical student reels (Streamed from Cloudflare R2)
export const MASTER_PULSE_REELS = [
  {
    id: 'reel-hostel-1',
    title: 'Hostel Night Cooking Champions 🍳',
    caption: 'When the mess closes at 9 PM and you have 1 electric kettle and 4 packets of Maggi. Who can relate? #HostelLife #MidnightCravings',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-hostel-1.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80',
    duration_seconds: 14,
    author_name: 'Hostel 4 Legends',
    author_avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80',
    sound_title: 'Original Sound · Midnight Maggi',
    category: 'hostel',
    likes_count: 542,
    comments_count: 48,
  },
  {
    id: 'reel-code-2',
    title: 'Code Runs on First Try 🚀',
    caption: 'That magical 0.001% moment when your code compiles with 0 errors and 0 warnings on the first attempt 🤯 #TechAndCode #ProgrammerLife',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-code-2.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80',
    duration_seconds: 12,
    author_name: 'DevClub Campus',
    author_avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&q=80',
    sound_title: 'Synthwave Beats · Coding Zone',
    category: 'tech_coding',
    likes_count: 819,
    comments_count: 74,
  },
  {
    id: 'reel-campus-3',
    title: 'Campus Monsoon Walk 🌧️',
    caption: 'Running between the Engineering block and the library during sudden campus rain. Best feeling on campus! #CampusLife #MonsoonVibes',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-campus-3.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&q=80',
    duration_seconds: 15,
    author_name: 'Campus Vibes Official',
    author_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
    sound_title: 'Lofi Rain Study Beats',
    category: 'campus_life',
    likes_count: 620,
    comments_count: 41,
  },
  {
    id: 'reel-meme-4',
    title: '8 AM Monday Lecture Attendance 😴',
    caption: 'Body is in the lecture hall, but the soul is still in the hostel bed dreaming about breakfast. Attendance was mandatory though! #StudentMemes #CollegeRelatable',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-meme-4.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=600&q=80',
    duration_seconds: 11,
    author_name: 'Backbencher Central',
    author_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
    sound_title: 'Funny Meme Sound Effect',
    category: 'memes',
    likes_count: 1240,
    comments_count: 112,
  },
  {
    id: 'reel-exam-5',
    title: 'One Night Before Finals 📚⚡',
    caption: 'Covering 5 units in 4 hours with 3 cups of coffee. When adrenaline is your study partner. We survive this semester! #ExamStress #StudyGrind',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-exam-5.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&q=80',
    duration_seconds: 16,
    author_name: 'Semester Survivors',
    author_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
    sound_title: 'Clock Ticking · Final Boss Music',
    category: 'exam_stress',
    likes_count: 980,
    comments_count: 89,
  },
  {
    id: 'reel-viva-6',
    title: 'External Examiner in Viva Voce 😳',
    caption: 'When the external examiner flips straight to page 1 of your project report and asks "define this term from 1st semester" 💀 #CollegeViva #EngineeringMemes',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-viva-6.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&q=80',
    duration_seconds: 10,
    author_name: 'Viva Panic Room',
    author_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
    sound_title: 'Heartbeat · Dramatic Tension',
    category: 'memes',
    likes_count: 1450,
    comments_count: 130,
  },
  {
    id: 'reel-canteen-7',
    title: 'The 11:30 AM Canteen Samosa Sprint 🥟🏃',
    caption: 'When the professor dismisses class 5 minutes early and you have to sprint before the fresh batch of samosas sells out! #CanteenRush #CampusFood',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-canteen-7.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
    duration_seconds: 12,
    author_name: 'Canteen Regulars',
    author_avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&q=80',
    sound_title: 'Sprint Theme · Fast Beats',
    category: 'hostel',
    likes_count: 730,
    comments_count: 53,
  },
  {
    id: 'reel-placement-8',
    title: 'Hostel Room After Placement Offer 🎉',
    caption: 'The entire wing bursts into your room with sweets and dhols after the HR email arrives. Unmatched hostel brotherhood! #PlacementSeason #HostelCelebration',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-placement-8.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&q=80',
    duration_seconds: 15,
    author_name: 'Hostel 2 Family',
    author_avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&q=80',
    sound_title: 'Dhol Beats · Victory Celebration',
    category: 'campus_life',
    likes_count: 1890,
    comments_count: 195,
  },
  {
    id: 'reel-hackathon-9',
    title: '3 AM at Campus 24hr Hackathon 💻☕',
    caption: 'Our team has had 6 Red Bulls, 2 boxes of pizza, and 0 commits to main. But the pitch deck is looking phenomenal! #HackathonLife #DevGrind',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-hackathon-9.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&q=80',
    duration_seconds: 13,
    author_name: 'Hackathon Hackers',
    author_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&q=80',
    sound_title: 'Cyberpunk Lofi · Midnight Coding',
    category: 'tech_coding',
    likes_count: 1120,
    comments_count: 98,
  },
  {
    id: 'reel-library-10',
    title: 'Silent Zone in Central Library 🤫',
    caption: 'Finding that one hidden desk in the 3rd floor corner with the power socket that actually works. Peak productivity unlocked! #StudyAesthetic #LibraryVibes',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-library-10.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&q=80',
    duration_seconds: 14,
    author_name: 'Library Corner Club',
    author_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
    sound_title: 'Ambient Rain & Chill Tape',
    category: 'exam_stress',
    likes_count: 670,
    comments_count: 39,
  },
  {
    id: 'reel-proxy-11',
    title: 'Calling Proxy for the Roommate 🎭',
    caption: 'Changing your voice pitch by 2 octaves so the professor doesn\'t notice you answered roll call twice in a row. #ProxyMasters #CollegeHacks',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-proxy-11.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80',
    duration_seconds: 10,
    author_name: 'Wing 3 Proxies',
    author_avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&q=80',
    sound_title: 'Mission Sneak · Spy Sound',
    category: 'memes',
    likes_count: 1620,
    comments_count: 142,
  },
  {
    id: 'reel-weekend-12',
    title: 'Sunset Tapri Chai with the Squad ☕🌅',
    caption: 'Debating life, exams, and future startups over a 10 rupee cutting chai outside college gate. Best 4 years of life. #CampusDiaries #ChaiPeCharcha',
    video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-weekend-12.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&q=80',
    duration_seconds: 15,
    author_name: 'Tapri Gang',
    author_avatar: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&q=80',
    sound_title: 'Acoustic Sunset Guitar',
    category: 'campus_life',
    likes_count: 2150,
    comments_count: 184,
  },
];

export async function seedReelsCatalogIdempotent(env: Env): Promise<number> {
  const stmts: D1PreparedStatement[] = [];
  for (const item of MASTER_PULSE_REELS) {
    stmts.push(
      env.DB.prepare(`
        INSERT INTO pulse_reels (
          id, title, caption, video_url, thumbnail_url, duration_seconds,
          author_name, author_avatar, sound_title, category, likes_count, comments_count, is_featured, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', '-' || (ABS(RANDOM()) % 48) || ' hours'))
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          caption = excluded.caption,
          video_url = excluded.video_url,
          thumbnail_url = excluded.thumbnail_url,
          author_name = excluded.author_name,
          author_avatar = excluded.author_avatar,
          sound_title = excluded.sound_title,
          category = excluded.category
      `).bind(
        item.id, item.title, item.caption, item.video_url, item.thumbnail_url,
        item.duration_seconds, item.author_name, item.author_avatar, item.sound_title,
        item.category, item.likes_count, item.comments_count
      )
    );
  }
  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
  return stmts.length;
}

export async function handlePulseReelsRoutes(
  request: Request,
  env: Env,
  session: UserSession | null,
  path: string
): Promise<Response> {
  const url = new URL(request.url);

  // 1. GET / HEAD /api/pulse/reels/stream/:filename (Stream MP4 from Cloudflare R2 with HTTP 206 range support)
  const streamMatch = path.match(/^\/api\/pulse\/reels\/stream\/([^/]+)$/);
  if ((request.method === 'GET' || request.method === 'HEAD') && streamMatch) {
    const filename = streamMatch[1];
    const reelKey = `reels/${filename}`;
    
    try {
      const object = await env.STUDIES_BUCKET.get(reelKey, {
        range: request.headers,
        onlyIf: request.headers,
      });

      if (!object) {
        return new Response('Reel video not found in R2 storage', { status: 404 });
      }

      const headers = new Headers();
      const isImage = filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.webp');
      headers.set('content-type', isImage ? 'image/jpeg' : 'video/mp4');
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      headers.set('access-control-allow-origin', '*');
      headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
      headers.set('access-control-allow-headers', 'Range, Content-Type');
      headers.set('accept-ranges', 'bytes');

      if (request.method === 'HEAD') {
        headers.set('content-length', String(object.size));
        return new Response(null, { status: 200, headers });
      }

      if (!('body' in object)) {
        return new Response('Reel video not found in R2 storage', { status: 404 });
      }

      if (object.range && typeof (object.range as any).offset === 'number' && typeof (object.range as any).length === 'number') {
        const offset = (object.range as any).offset;
        const length = (object.range as any).length;
        headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
        headers.set('content-length', String(length));
        return new Response(object.body, { status: 206, headers });
      }

      headers.set('content-length', String(object.size));
      return new Response(object.body, { status: 200, headers });
    } catch (err) {
      console.error('R2 streaming error:', err);
      return new Response('Error streaming video', { status: 500 });
    }
  }

  // 2. GET /api/pulse/reels (feed with cursor pagination & category filter)
  if (request.method === 'GET' && path === '/api/pulse/reels') {
    const category = url.searchParams.get('category') || 'all';
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const isShuffle = url.searchParams.get('shuffle') === 'true' && !cursor;

    let query = `
      SELECT r.*,
        EXISTS (
          SELECT 1 FROM pulse_reel_likes l
          WHERE l.reel_id = r.id AND l.user_id = ?
        ) AS is_liked
      FROM pulse_reels r
    `;
    const params: (string | number)[] = [session?.id || ''];

    const whereClauses: string[] = [];

    if (category && category !== 'all') {
      whereClauses.push('r.category = ?');
      params.push(category);
    }

    if (cursor) {
      const [cursorTime, cursorId] = cursor.split('|');
      if (cursorTime && cursorId) {
        whereClauses.push('(r.created_at < ? OR (r.created_at = ? AND r.id < ?))');
        params.push(cursorTime, cursorTime, cursorId);
      }
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    if (isShuffle) {
      query += ' ORDER BY RANDOM() LIMIT ?';
    } else {
      query += ' ORDER BY r.created_at DESC, r.id DESC LIMIT ?';
    }
    params.push(limit + 1);

    const stmt = env.DB.prepare(query).bind(...params);
    const { results } = await stmt.all<any>();
    const items = results || [];

    const hasMore = items.length > limit;
    const reels = hasMore ? items.slice(0, limit) : items;
    const last = reels[reels.length - 1];
    const nextCursor = (hasMore && last) ? `${last.created_at}|${last.id}` : null;

    return json({
      reels: reels.map((r: any) => ({
        id: r.id,
        title: r.title,
        caption: r.caption,
        videoUrl: r.video_url,
        thumbnailUrl: r.thumbnail_url,
        durationSeconds: r.duration_seconds,
        authorName: r.author_name,
        authorAvatar: r.author_avatar,
        soundTitle: r.sound_title,
        category: r.category,
        likesCount: Number(r.likes_count || 0),
        commentsCount: Number(r.comments_count || 0),
        sharesCount: Number(r.shares_count || 0),
        isLiked: Boolean(r.is_liked),
        createdAt: r.created_at,
      })),
      nextCursor,
    });
  }

  // 3. POST /api/pulse/reels/:id/like (toggle like)
  const likeMatch = path.match(/^\/api\/pulse\/reels\/([^/]+)\/like$/);
  if (request.method === 'POST' && likeMatch) {
    if (!session?.id) return json({ error: 'Please sign in to like reels.' }, 401);
    const reelId = likeMatch[1];

    const existing = await env.DB.prepare(
      'SELECT 1 FROM pulse_reel_likes WHERE reel_id = ? AND user_id = ?'
    ).bind(reelId, session.id).first();

    let liked = false;
    if (existing) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM pulse_reel_likes WHERE reel_id = ? AND user_id = ?').bind(reelId, session.id),
        env.DB.prepare('UPDATE pulse_reels SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').bind(reelId),
      ]);
      liked = false;
    } else {
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO pulse_reel_likes (reel_id, user_id) VALUES (?, ?)').bind(reelId, session.id),
        env.DB.prepare('UPDATE pulse_reels SET likes_count = likes_count + 1 WHERE id = ?').bind(reelId),
      ]);
      liked = true;
    }

    const updated = await env.DB.prepare('SELECT likes_count FROM pulse_reels WHERE id = ?').bind(reelId).first<{ likes_count: number }>();
    return json({ ok: true, liked, likesCount: Number(updated?.likes_count || 0) });
  }

  // 4. GET /api/pulse/reels/:id/comments
  const commentsMatch = path.match(/^\/api\/pulse\/reels\/([^/]+)\/comments$/);
  if (request.method === 'GET' && commentsMatch) {
    const reelId = commentsMatch[1];
    const { results } = await env.DB.prepare(`
      SELECT id, reel_id, user_id, author_handle, avatar_url, body, created_at
      FROM pulse_reel_comments
      WHERE reel_id = ?
      ORDER BY created_at ASC
      LIMIT 100
    `).bind(reelId).all<any>();

    return json({
      comments: (results || []).map((c: any) => ({
        id: c.id,
        reelId: c.reel_id,
        userId: c.user_id,
        authorHandle: c.author_handle,
        avatarUrl: c.avatar_url,
        body: c.body,
        createdAt: c.created_at,
        isMine: session?.id ? c.user_id === session.id : false,
      })),
    });
  }

  // 5. POST /api/pulse/reels/:id/comments
  if (request.method === 'POST' && commentsMatch) {
    if (!session?.id) return json({ error: 'Please sign in to comment on reels.' }, 401);
    const reelId = commentsMatch[1];
    const bodyData = await request.json<{ body?: string }>().catch(() => ({ body: '' as string | undefined }));
    const commentText = (bodyData?.body || '').trim().slice(0, 500);
    if (!commentText) return json({ error: 'Comment cannot be empty.' }, 400);

    const commentId = 'rc-' + crypto.randomUUID();
    const authorHandle = session.username ? `@${session.username}` : (session.name || 'Student');

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO pulse_reel_comments (id, reel_id, user_id, author_handle, avatar_url, body)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(commentId, reelId, session.id, authorHandle, session.avatar_url || null, commentText),
      env.DB.prepare('UPDATE pulse_reels SET comments_count = comments_count + 1 WHERE id = ?').bind(reelId),
    ]);

    return json({
      ok: true,
      comment: {
        id: commentId,
        reelId,
        userId: session.id,
        authorHandle,
        avatarUrl: session.avatar_url,
        body: commentText,
        createdAt: new Date().toISOString(),
        isMine: true,
      },
    });
  }

  // 6. POST /api/pulse/reels/sync (force resync catalog)
  if (request.method === 'POST' && path === '/api/pulse/reels/sync') {
    const seeded = await seedReelsCatalogIdempotent(env);
    return json({ ok: true, seeded });
  }

  return json({ error: 'Not found' }, 404);
}
