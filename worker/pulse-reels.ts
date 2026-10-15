import type { Env } from './index';
import type {
  PulseReelEntity,
  ReelEventPayload,
  UserProfile,
} from './pulse-recommender';
import {
  SemanticFeatureExtractor,
  UserProfileManager,
  CandidateGenerator,
  PersonalizedRanker,
} from './pulse-recommender';

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

let reelsSchemaEnsured = false;
export async function ensurePulseReelsSchema(db: D1Database): Promise<void> {
  if (reelsSchemaEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_reels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        caption TEXT,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        duration_seconds INTEGER DEFAULT 15,
        author_name TEXT NOT NULL DEFAULT 'Campus Viral',
        author_avatar TEXT,
        sound_title TEXT DEFAULT 'Original Audio · Campus Vibes',
        category TEXT NOT NULL DEFAULT 'campus_life',
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        shares_count INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_reels_category ON pulse_reels (category, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_reels_created ON pulse_reels (created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_reels_feed_sort ON pulse_reels (category, created_at DESC, id DESC)').run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_reel_likes (
        reel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (reel_id, user_id)
      )
    `).run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_reel_comments (
        id TEXT PRIMARY KEY,
        reel_id TEXT NOT NULL,
        user_id TEXT,
        author_handle TEXT NOT NULL,
        avatar_url TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_reel_comments ON pulse_reel_comments (reel_id, created_at ASC)').run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_reel_views (
        reel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        watch_count INTEGER NOT NULL DEFAULT 1,
        last_watched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (reel_id, user_id)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_reel_views_user ON pulse_reel_views (user_id, last_watched_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_reel_views_reel ON pulse_reel_views (reel_id, last_watched_at DESC)').run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_reel_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reel_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        duration_watched_ms INTEGER DEFAULT 0,
        completion_percent REAL DEFAULT 0.0,
        category TEXT,
        author_name TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_events_user ON pulse_reel_events (user_id, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_events_reel ON pulse_reel_events (reel_id, event_type)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_events_dedup ON pulse_reel_events (user_id, reel_id, event_type, created_at DESC)').run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_user_profiles (
        user_id TEXT PRIMARY KEY,
        topic_affinities TEXT NOT NULL DEFAULT '{}',
        creator_affinities TEXT NOT NULL DEFAULT '{}',
        total_impressions INTEGER DEFAULT 0,
        total_watches INTEGER DEFAULT 0,
        total_completions INTEGER DEFAULT 0,
        total_replays INTEGER DEFAULT 0,
        total_skips INTEGER DEFAULT 0,
        total_likes INTEGER DEFAULT 0,
        total_shares INTEGER DEFAULT 0,
        total_not_interested INTEGER DEFAULT 0,
        avg_completion_rate REAL DEFAULT 0.0,
        last_active_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_user_profiles_updated ON pulse_user_profiles (updated_at DESC)').run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pulse_user_negative_signals (
        user_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'not_interested',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (user_id, target_type, target_id)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pulse_neg_user ON pulse_user_negative_signals (user_id, target_type)').run();
    reelsSchemaEnsured = true;
  } catch {}
}

export async function getUserProfile(db: D1Database, userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  try {
    const row = await db.prepare(
      'SELECT * FROM pulse_user_profiles WHERE user_id = ?'
    ).bind(userId).first<any>();

    if (!row) return null;
    return {
      userId: row.user_id,
      topicAffinities: JSON.parse(row.topic_affinities || '{}'),
      creatorAffinities: JSON.parse(row.creator_affinities || '{}'),
      totalImpressions: Number(row.total_impressions || 0),
      totalWatches: Number(row.total_watches || 0),
      totalCompletions: Number(row.total_completions || 0),
      totalReplays: Number(row.total_replays || 0),
      totalSkips: Number(row.total_skips || 0),
      totalLikes: Number(row.total_likes || 0),
      totalShares: Number(row.total_shares || 0),
      totalNotInterested: Number(row.total_not_interested || 0),
      avgCompletionRate: Number(row.avg_completion_rate || 0),
      lastActiveAt: row.last_active_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    return null;
  }
}

export async function saveUserProfile(db: D1Database, profile: UserProfile): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO pulse_user_profiles (
        user_id, topic_affinities, creator_affinities,
        total_impressions, total_watches, total_completions, total_replays,
        total_skips, total_likes, total_shares, total_not_interested,
        avg_completion_rate, last_active_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        topic_affinities = excluded.topic_affinities,
        creator_affinities = excluded.creator_affinities,
        total_impressions = excluded.total_impressions,
        total_watches = excluded.total_watches,
        total_completions = excluded.total_completions,
        total_replays = excluded.total_replays,
        total_skips = excluded.total_skips,
        total_likes = excluded.total_likes,
        total_shares = excluded.total_shares,
        total_not_interested = excluded.total_not_interested,
        avg_completion_rate = excluded.avg_completion_rate,
        last_active_at = excluded.last_active_at,
        updated_at = excluded.updated_at
    `).bind(
      profile.userId,
      JSON.stringify(profile.topicAffinities),
      JSON.stringify(profile.creatorAffinities),
      profile.totalImpressions,
      profile.totalWatches,
      profile.totalCompletions,
      profile.totalReplays,
      profile.totalSkips,
      profile.totalLikes,
      profile.totalShares,
      profile.totalNotInterested,
      profile.avgCompletionRate,
      profile.lastActiveAt,
      profile.updatedAt
    ).run();
  } catch (err) {
    console.error('Error saving user profile:', err);
  }
}

export async function getUserNegativeSignals(db: D1Database, userId: string): Promise<Set<string>> {
  const signalSet = new Set<string>();
  if (!userId) return signalSet;
  try {
    const { results } = await db.prepare(
      'SELECT target_type, target_id FROM pulse_user_negative_signals WHERE user_id = ?'
    ).bind(userId).all<{ target_type: string; target_id: string }>();

    for (const row of results || []) {
      if (row.target_type === 'reel') {
        signalSet.add(row.target_id);
      } else if (row.target_type === 'creator') {
        signalSet.add(`author:${row.target_id.toLowerCase()}`);
      } else {
        signalSet.add(row.target_id);
      }
    }
  } catch {}
  return signalSet;
}

export async function seedReelsCatalogIdempotent(env: Env): Promise<number> {
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < MASTER_PULSE_REELS.length; i++) {
    const item = MASTER_PULSE_REELS[i];
    // Spread created_at slightly so initial catalog has deterministic, distinct timestamps
    const offsetMinutes = (MASTER_PULSE_REELS.length - i) * 15;
    stmts.push(
      env.DB.prepare(`
        INSERT INTO pulse_reels (
          id, title, caption, video_url, thumbnail_url, duration_seconds,
          author_name, author_avatar, sound_title, category, likes_count, comments_count, is_featured, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', '-' || ? || ' minutes'))
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
        item.category, item.likes_count, item.comments_count, offsetMinutes
      )
    );
  }
  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
  return stmts.length;
}

export function resolveUserId(request: Request, session: UserSession | null): string {
  if (session?.id) return session.id;
  const anonHeader = request.headers.get('x-anonymous-session-id') || '';
  let anonParam = '';
  try {
    anonParam = new URL(request.url).searchParams.get('anonId') || '';
  } catch {}
  const rawAnon = (anonHeader || anonParam).trim().slice(0, 64);
  if (rawAnon) {
    const safeAnon = rawAnon.replace(/[^a-zA-Z0-9_-]/g, '');
    if (safeAnon) return `anon:${safeAnon}`;
  }
  return '';
}

export async function handlePulseReelsRoutes(
  request: Request,
  env: Env,
  session: UserSession | null,
  path: string
): Promise<Response> {
  const url = new URL(request.url);

  await ensurePulseReelsSchema(env.DB);

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

  // 2. GET /api/pulse/reels (Personalized Recommendation Feed with Multi-Arm Retrieval & Ranking)
  if (request.method === 'GET' && path === '/api/pulse/reels') {
    const category = url.searchParams.get('category') || 'all';
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 15));
    const includeWatched = url.searchParams.get('includeWatched') === 'true';
    const isDebug = url.searchParams.get('debug') === 'true';
    const userId = resolveUserId(request, session);

    // Auto-seed if catalog is completely empty
    try {
      const countRow = await env.DB.prepare('SELECT count(*) as c FROM pulse_reels').first<{ c: number }>();
      if (!countRow || Number(countRow.c) === 0) {
        await seedReelsCatalogIdempotent(env);
      }
    } catch {}

    // Load user profile & negative feedback signals
    const userProfile = userId ? await getUserProfile(env.DB, userId) : null;
    const negativeSignals = userId ? await getUserNegativeSignals(env.DB, userId) : new Set<string>();

    // Load recent watch history (last 48 hours)
    const recentWatchedIds = new Set<string>();
    if (userId) {
      try {
        const { results: watchedRows } = await env.DB.prepare(`
          SELECT reel_id FROM pulse_reel_views
          WHERE user_id = ? AND last_watched_at > datetime('now', '-48 hours')
        `).bind(userId).all<{ reel_id: string }>();

        for (const row of watchedRows || []) {
          recentWatchedIds.add(row.reel_id);
        }
      } catch {}
    }

    // Query candidate reels from D1 catalog
    const whereClauses: string[] = [];
    const params: (string | number)[] = [session?.id || ''];

    if (category && category !== 'all') {
      whereClauses.push('r.category = ?');
      params.push(category);
    }

    // Watched-history exclusion: prioritize unseen content when includeWatched is false
    if (!includeWatched && userId && recentWatchedIds.size > 0) {
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM pulse_reel_views v
        WHERE v.reel_id = r.id AND v.user_id = ?
          AND v.last_watched_at > datetime('now', '-48 hours')
      )`);
      params.push(userId);
    }

    let query = `
      SELECT r.*,
        EXISTS (
          SELECT 1 FROM pulse_reel_likes l
          WHERE l.reel_id = r.id AND l.user_id = ?
        ) AS is_liked
      FROM pulse_reels r
    `;

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    // Fetch candidate set
    query += ' ORDER BY r.created_at DESC LIMIT 150';

    const stmt = env.DB.prepare(query).bind(...params);
    const { results } = await stmt.all<any>();
    const catalogItems: PulseReelEntity[] = (results || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      caption: r.caption,
      video_url: r.video_url,
      thumbnail_url: r.thumbnail_url,
      duration_seconds: Number(r.duration_seconds || 15),
      author_name: r.author_name,
      author_avatar: r.author_avatar,
      sound_title: r.sound_title,
      category: r.category,
      likes_count: Number(r.likes_count || 0),
      comments_count: Number(r.comments_count || 0),
      shares_count: Number(r.shares_count || 0),
      is_featured: Number(r.is_featured || 0),
      created_at: r.created_at,
      is_liked: Boolean(r.is_liked),
    } as any));

    // Candidate Generation across multiple arms (Semantic, Creator, Fresh, Exploration, Quality)
    const candidates = CandidateGenerator.generateCandidates(
      catalogItems,
      userProfile,
      negativeSignals,
      recentWatchedIds,
      category
    );

    // Multi-objective personalized ranking with diversity guard
    const ranked = PersonalizedRanker.rankCandidates(
      candidates,
      userProfile,
      recentWatchedIds
    );

    // Keyset offset pagination: deterministic slice over ranked snapshot
    let offset = 0;
    if (cursor) {
      if (cursor.startsWith('c:')) {
        offset = parseInt(cursor.slice(2), 10) || 0;
      } else if (cursor.includes('|')) {
        // Fallback for legacy created_at|id cursor
        const [, cursorId] = cursor.split('|');
        const foundIdx = ranked.findIndex((item) => item.reel.id === cursorId);
        offset = foundIdx >= 0 ? foundIdx + 1 : 0;
      }
    }

    const pagedCandidates = ranked.slice(offset, offset + limit);
    const hasMore = offset + limit < ranked.length;
    const nextCursor = hasMore ? `c:${offset + limit}` : null;

    return json({
      reels: pagedCandidates.map((c) => ({
        id: c.reel.id,
        title: c.reel.title,
        caption: c.reel.caption,
        videoUrl: c.reel.video_url,
        thumbnailUrl: c.reel.thumbnail_url,
        durationSeconds: c.reel.duration_seconds,
        authorName: c.reel.author_name,
        authorAvatar: c.reel.author_avatar,
        soundTitle: c.reel.sound_title,
        category: c.reel.category,
        likesCount: Number(c.reel.likes_count || 0),
        commentsCount: Number(c.reel.comments_count || 0),
        sharesCount: Number(c.reel.shares_count || 0),
        isLiked: Boolean((c.reel as any).is_liked),
        createdAt: c.reel.created_at,
        debugReason: isDebug ? c.debugReason : undefined,
        candidateSource: isDebug ? c.candidateSource : undefined,
        score: isDebug ? c.score : undefined,
      })),
      nextCursor,
      hasMore,
      userProfileAvailable: Boolean(userProfile),
    });
  }

  // 3. POST /api/pulse/reels/events (Batch behavioral telemetry ingestion)
  if (request.method === 'POST' && path === '/api/pulse/reels/events') {
    const userId = resolveUserId(request, session);
    if (!userId) {
      return json({ ok: true, recorded: 0, reason: 'no_user_identity' });
    }

    const body = (await request.json<{ events?: ReelEventPayload[]; event?: ReelEventPayload }>().catch(() => ({}))) as {
      events?: ReelEventPayload[];
      event?: ReelEventPayload;
    };
    const rawEvents: ReelEventPayload[] = Array.isArray(body.events)
      ? body.events
      : body.event
      ? [body.event]
      : [];

    if (rawEvents.length === 0) {
      return json({ ok: true, recorded: 0 });
    }

    let userProfile = (await getUserProfile(env.DB, userId)) || {
      userId,
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 0,
      totalWatches: 0,
      totalCompletions: 0,
      totalReplays: 0,
      totalSkips: 0,
      totalLikes: 0,
      totalShares: 0,
      totalNotInterested: 0,
      avgCompletionRate: 0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const eventInserts: D1PreparedStatement[] = [];
    const nowIso = new Date().toISOString();

    for (const ev of rawEvents.slice(0, 50)) {
      if (!ev.reelId || !ev.eventType) continue;
      const eventId = 'ev-' + crypto.randomUUID();

      eventInserts.push(
        env.DB.prepare(`
          INSERT INTO pulse_reel_events (
            id, user_id, reel_id, event_type, duration_watched_ms,
            completion_percent, category, author_name, session_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          eventId,
          userId,
          ev.reelId,
          ev.eventType,
          Math.min(600_000, Math.max(0, Number(ev.durationWatchedMs || 0))),
          Math.min(1.0, Math.max(0, Number(ev.completionPercent || 0))),
          ev.category || null,
          ev.authorName || null,
          ev.sessionId || null,
          nowIso
        )
      );

      // Fetch reel features to update profile weights
      const reelRow = await env.DB.prepare('SELECT * FROM pulse_reels WHERE id = ?').bind(ev.reelId).first<any>();
      const features = reelRow
        ? SemanticFeatureExtractor.extractFeatureVector(reelRow)
        : { [`cat:${(ev.category || 'general').toLowerCase()}`]: 1.0 };

      userProfile = UserProfileManager.processEvent(userProfile, ev, features, nowIso);
    }

    if (eventInserts.length > 0) {
      await env.DB.batch(eventInserts);
    }

    await saveUserProfile(env.DB, userProfile);

    return json({ ok: true, recorded: eventInserts.length, userId });
  }

  // 4. POST /api/pulse/reels/:id/not-interested (Explicit negative feedback signal)
  const notInterestedMatch = path.match(/^\/api\/pulse\/reels\/([^/]+)\/not-interested$/);
  if (request.method === 'POST' && notInterestedMatch) {
    const reelId = notInterestedMatch[1];
    const userId = resolveUserId(request, session);
    if (!userId) return json({ error: 'Identity required for preference controls' }, 401);

    // Record negative signal into database
    await env.DB.prepare(`
      INSERT OR REPLACE INTO pulse_user_negative_signals (user_id, target_type, target_id, reason, created_at)
      VALUES (?, 'reel', ?, 'not_interested', CURRENT_TIMESTAMP)
    `).bind(userId, reelId).run();

    // Heavy negative feedback penalty on user profile
    const reelRow = await env.DB.prepare('SELECT * FROM pulse_reels WHERE id = ?').bind(reelId).first<any>();
    if (reelRow) {
      let userProfile = (await getUserProfile(env.DB, userId)) || {
        userId,
        topicAffinities: {},
        creatorAffinities: {},
        totalImpressions: 0,
        totalWatches: 0,
        totalCompletions: 0,
        totalReplays: 0,
        totalSkips: 0,
        totalLikes: 0,
        totalShares: 0,
        totalNotInterested: 0,
        avgCompletionRate: 0,
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const features = SemanticFeatureExtractor.extractFeatureVector(reelRow);
      userProfile = UserProfileManager.processEvent(
        userProfile,
        {
          reelId,
          eventType: 'not_interested',
          category: reelRow.category,
          authorName: reelRow.author_name,
        },
        features
      );

      await saveUserProfile(env.DB, userProfile);
    }

    return json({ ok: true, reelId, rejected: true });
  }

  // 5. POST /api/pulse/reels/reset-profile (User control: reset all personal recommendations)
  if (request.method === 'POST' && path === '/api/pulse/reels/reset-profile') {
    const userId = resolveUserId(request, session);
    if (!userId) return json({ error: 'Identity required to reset preferences' }, 401);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM pulse_user_profiles WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM pulse_user_negative_signals WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM pulse_reel_views WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM pulse_reel_events WHERE user_id = ?').bind(userId),
    ]);

    return json({ ok: true, reset: true, userId });
  }

  // 6. GET /api/pulse/reels/profile (Debug & inspection of user preference vector)
  if (request.method === 'GET' && path === '/api/pulse/reels/profile') {
    const userId = resolveUserId(request, session);
    if (!userId) return json({ userProfile: null });
    const profile = await getUserProfile(env.DB, userId);
    return json({ userProfile: profile });
  }

  // 7. POST /api/pulse/reels/:id/view (record meaningful watch event with user/guest isolation & feedback loop)
  const viewMatch = path.match(/^\/api\/pulse\/reels\/([^/]+)\/view$/);
  if (request.method === 'POST' && viewMatch) {
    const reelId = viewMatch[1];
    const userId = resolveUserId(request, session);

    if (!userId) {
      return json({ ok: true, recorded: false, reason: 'no_user_identity' });
    }

    try {
      await env.DB.prepare(`
        INSERT INTO pulse_reel_views (reel_id, user_id, watch_count, last_watched_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(reel_id, user_id) DO UPDATE SET
          watch_count = watch_count + 1,
          last_watched_at = CURRENT_TIMESTAMP
      `).bind(reelId, userId).run();

      // Trigger continuous learning profile update
      const reelRow = await env.DB.prepare('SELECT * FROM pulse_reels WHERE id = ?').bind(reelId).first<any>();
      if (reelRow) {
        let userProfile = (await getUserProfile(env.DB, userId)) || {
          userId,
          topicAffinities: {},
          creatorAffinities: {},
          totalImpressions: 0,
          totalWatches: 0,
          totalCompletions: 0,
          totalReplays: 0,
          totalSkips: 0,
          totalLikes: 0,
          totalShares: 0,
          totalNotInterested: 0,
          avgCompletionRate: 0,
          lastActiveAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const features = SemanticFeatureExtractor.extractFeatureVector(reelRow);
        userProfile = UserProfileManager.processEvent(
          userProfile,
          {
            reelId,
            eventType: 'playback_complete',
            completionPercent: 1.0,
            category: reelRow.category,
            authorName: reelRow.author_name,
          },
          features
        );

        await saveUserProfile(env.DB, userProfile);
      }

      return json({ ok: true, reelId, userId, recorded: true });
    } catch (err) {
      console.error('Failed to record reel view:', err);
      return json({ error: 'Failed to record view event.' }, 500);
    }
  }

  // 8. POST /api/pulse/reels/:id/like (toggle like & feed positive signal to recommender)
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

    // Continuous feedback loop: update user profile with explicit like/unlike
    const reelRow = await env.DB.prepare('SELECT * FROM pulse_reels WHERE id = ?').bind(reelId).first<any>();
    if (reelRow) {
      let userProfile = (await getUserProfile(env.DB, session.id)) || {
        userId: session.id,
        topicAffinities: {},
        creatorAffinities: {},
        totalImpressions: 0,
        totalWatches: 0,
        totalCompletions: 0,
        totalReplays: 0,
        totalSkips: 0,
        totalLikes: 0,
        totalShares: 0,
        totalNotInterested: 0,
        avgCompletionRate: 0,
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const features = SemanticFeatureExtractor.extractFeatureVector(reelRow);
      userProfile = UserProfileManager.processEvent(
        userProfile,
        {
          reelId,
          eventType: liked ? 'like' : 'unlike',
          category: reelRow.category,
          authorName: reelRow.author_name,
        },
        features
      );

      await saveUserProfile(env.DB, userProfile);
    }

    const updated = await env.DB.prepare('SELECT likes_count FROM pulse_reels WHERE id = ?').bind(reelId).first<{ likes_count: number }>();
    return json({ ok: true, liked, likesCount: Number(updated?.likes_count || 0) });
  }

  // 9. GET /api/pulse/reels/:id/comments
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

  // 10. POST /api/pulse/reels/:id/comments
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

    // Positive interaction signal for commenting
    const reelRow = await env.DB.prepare('SELECT * FROM pulse_reels WHERE id = ?').bind(reelId).first<any>();
    if (reelRow) {
      let userProfile = (await getUserProfile(env.DB, session.id)) || {
        userId: session.id,
        topicAffinities: {},
        creatorAffinities: {},
        totalImpressions: 0,
        totalWatches: 0,
        totalCompletions: 0,
        totalReplays: 0,
        totalSkips: 0,
        totalLikes: 0,
        totalShares: 0,
        totalNotInterested: 0,
        avgCompletionRate: 0,
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const features = SemanticFeatureExtractor.extractFeatureVector(reelRow);
      userProfile = UserProfileManager.processEvent(
        userProfile,
        {
          reelId,
          eventType: 'comment',
          category: reelRow.category,
          authorName: reelRow.author_name,
        },
        features
      );

      await saveUserProfile(env.DB, userProfile);
    }

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

  // 11. POST /api/pulse/reels/sync (force resync catalog)
  if (request.method === 'POST' && path === '/api/pulse/reels/sync') {
    const seeded = await seedReelsCatalogIdempotent(env);
    return json({ ok: true, seeded });
  }

  return json({ error: 'Not found' }, 404);
}
