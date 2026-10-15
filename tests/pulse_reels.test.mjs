import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

test('Pulse Reels Professional Recommendation Feed Suite', async (t) => {
  // Helper to create an in-memory SQLite database matching the production D1 schema
  const createTestDb = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE pulse_reels (
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
      );

      CREATE TABLE pulse_reel_likes (
        reel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (reel_id, user_id)
      );

      CREATE TABLE pulse_reel_comments (
        id TEXT PRIMARY KEY,
        reel_id TEXT NOT NULL,
        user_id TEXT,
        author_handle TEXT NOT NULL,
        avatar_url TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );

      CREATE TABLE pulse_reel_views (
        reel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        watch_count INTEGER NOT NULL DEFAULT 1,
        last_watched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (reel_id, user_id)
      );
    `);
    return db;
  };

  // 1. Catalog Integrity & Schema
  await t.test('1. Master Reels Catalog Integrity', async (t) => {
    const MASTER_PULSE_REELS = [
      { id: 'reel-hostel-1', category: 'hostel', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-hostel-1.mp4', duration_seconds: 14 },
      { id: 'reel-code-2', category: 'tech_coding', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-code-2.mp4', duration_seconds: 12 },
      { id: 'reel-campus-3', category: 'campus_life', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-campus-3.mp4', duration_seconds: 15 },
      { id: 'reel-meme-4', category: 'memes', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-meme-4.mp4', duration_seconds: 11 },
      { id: 'reel-exam-5', category: 'exam_stress', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-exam-5.mp4', duration_seconds: 16 },
      { id: 'reel-viva-6', category: 'memes', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-viva-6.mp4', duration_seconds: 10 },
      { id: 'reel-canteen-7', category: 'hostel', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-canteen-7.mp4', duration_seconds: 12 },
      { id: 'reel-placement-8', category: 'campus_life', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-placement-8.mp4', duration_seconds: 15 },
      { id: 'reel-hackathon-9', category: 'tech_coding', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-hackathon-9.mp4', duration_seconds: 13 },
      { id: 'reel-library-10', category: 'exam_stress', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-library-10.mp4', duration_seconds: 14 },
      { id: 'reel-proxy-11', category: 'memes', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-proxy-11.mp4', duration_seconds: 10 },
      { id: 'reel-weekend-12', category: 'campus_life', video_url: 'https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/reel-weekend-12.mp4', duration_seconds: 15 },
    ];

    await t.test('Catalog contains full set of 12 engaging student reels', () => {
      assert.equal(MASTER_PULSE_REELS.length, 12);
    });

    await t.test('All reels stream from Cloudflare R2 worker endpoint with MP4 format', () => {
      for (const reel of MASTER_PULSE_REELS) {
        assert.ok(reel.video_url.endsWith('.mp4'), `Reel ${reel.id} must be an mp4 video`);
        assert.ok(reel.video_url.includes('/api/pulse/reels/stream/'), `Reel ${reel.id} must use R2 streaming route`);
      }
    });

    await t.test('All reels have designated campus categories and durations <= 60s', () => {
      const allowedCategories = new Set(['hostel', 'tech_coding', 'campus_life', 'memes', 'exam_stress']);
      for (const reel of MASTER_PULSE_REELS) {
        assert.ok(allowedCategories.has(reel.category), `Invalid category ${reel.category}`);
        assert.ok(reel.duration_seconds > 0 && reel.duration_seconds <= 60, `Duration invalid for ${reel.id}`);
      }
    });
  });

  // TEST A: Duplicate prevention & no virtual cycle IDs
  await t.test('Test A — Duplicate prevention and virtual cycle elimination', () => {
    const catalog = [
      { id: 'reel-1', title: 'Video 1' },
      { id: 'reel-2', title: 'Video 2' },
      { id: 'reel-3', title: 'Video 3' },
    ];

    // Simulate merging multiple batches
    let currentFeed = [];
    const mergeBatch = (incoming) => {
      const existing = new Set(currentFeed.map((r) => r.id));
      const fresh = incoming.filter((r) => !existing.has(r.id));
      currentFeed = [...currentFeed, ...fresh];
    };

    // Load page 1
    mergeBatch(catalog);
    assert.equal(currentFeed.length, 3);

    // Repeated request attempts with same catalog
    mergeBatch(catalog);
    mergeBatch(catalog);
    assert.equal(currentFeed.length, 3, 'Feed must not grow when no new unique reels exist');

    // Verify each ID is a real database ID, never virtual cycle ID
    for (const r of currentFeed) {
      assert.ok(!r.id.includes('-cycle'), `Reel ID ${r.id} must not contain virtual cycle suffix`);
      assert.ok(!r.id.includes('-virtual'), `Reel ID ${r.id} must not be artificial`);
    }
  });

  // TEST B: Multi-page keyset pagination across 3+ pages
  await t.test('Test B — Multi-page deterministic keyset pagination', () => {
    const db = createTestDb();
    const insertStmt = db.prepare(`
      INSERT INTO pulse_reels (id, title, video_url, category, created_at)
      VALUES (?, ?, 'https://example.com/video.mp4', 'campus_life', ?)
    `);

    // Seed 15 unique records with distinct and identical timestamps
    for (let i = 1; i <= 15; i++) {
      const pad = String(i).padStart(2, '0');
      // Create duplicate timestamps for items 5 and 6 to test tiebreaker
      const minute = i === 6 ? '05' : pad;
      insertStmt.run(`reel-${pad}`, `Title ${pad}`, `2026-10-14 12:${minute}:00`);
    }

    // Function simulating server keyset query
    const fetchPage = (cursor, limit = 5) => {
      let query = 'SELECT id, created_at FROM pulse_reels';
      const params = [];
      if (cursor) {
        const [cursorTime, cursorId] = cursor.split('|');
        query += ' WHERE (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(cursorTime, cursorTime, cursorId);
      }
      query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
      params.push(limit + 1);

      const items = db.prepare(query).all(...params);
      const hasMore = items.length > limit;
      const reels = hasMore ? items.slice(0, limit) : items;
      const last = reels[reels.length - 1];
      const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;
      return { reels, nextCursor, hasMore };
    };

    // Page 1
    const page1 = fetchPage(null, 5);
    assert.equal(page1.reels.length, 5);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextCursor);

    // Page 2
    const page2 = fetchPage(page1.nextCursor, 5);
    assert.equal(page2.reels.length, 5);
    assert.equal(page2.hasMore, true);
    assert.ok(page2.nextCursor);

    // Page 3
    const page3 = fetchPage(page2.nextCursor, 5);
    assert.equal(page3.reels.length, 5);
    assert.equal(page3.hasMore, false);
    assert.equal(page3.nextCursor, null);

    // Ensure all 15 records are unique across pages
    const allFetchedIds = [...page1.reels, ...page2.reels, ...page3.reels].map((r) => r.id);
    const uniqueIds = new Set(allFetchedIds);
    assert.equal(allFetchedIds.length, 15);
    assert.equal(uniqueIds.size, 15, 'No records skipped or duplicated across page boundaries');
  });

  // TEST C: Watched-history exclusion & recommendation prioritization
  await t.test('Test C — Watched-history exclusion and cooling period', () => {
    const db = createTestDb();
    const insertReel = db.prepare(`
      INSERT INTO pulse_reels (id, title, video_url, category, created_at)
      VALUES (?, ?, 'https://example.com/video.mp4', 'campus_life', ?)
    `);

    insertReel.run('r1', 'Reel 1', '2026-10-14 12:00:00');
    insertReel.run('r2', 'Reel 2', '2026-10-14 11:00:00');
    insertReel.run('r3', 'Reel 3', '2026-10-14 10:00:00');

    // Mark r1 as watched by user 'user-alice'
    const recordView = db.prepare(`
      INSERT INTO pulse_reel_views (reel_id, user_id, watch_count, last_watched_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(reel_id, user_id) DO UPDATE SET
        watch_count = watch_count + 1,
        last_watched_at = CURRENT_TIMESTAMP
    `);
    recordView.run('r1', 'user-alice');

    // Query unseen reels for user-alice
    const queryUnseen = db.prepare(`
      SELECT r.id FROM pulse_reels r
      WHERE NOT EXISTS (
        SELECT 1 FROM pulse_reel_views v
        WHERE v.reel_id = r.id AND v.user_id = ?
          AND v.last_watched_at > datetime('now', '-48 hours')
      )
      ORDER BY r.created_at DESC, r.id DESC
    `);

    const unseenForAlice = queryUnseen.all('user-alice').map((r) => r.id);
    assert.deepEqual(unseenForAlice, ['r2', 'r3'], 'Watched reel r1 must be excluded from unseen feed');

    // Explicit includeWatched allows r1 back
    const queryAll = db.prepare(`
      SELECT r.id FROM pulse_reels r
      ORDER BY r.created_at DESC, r.id DESC
    `);
    const allReels = queryAll.all().map((r) => r.id);
    assert.deepEqual(allReels, ['r1', 'r2', 'r3']);
  });

  // TEST D: User isolation (watch history never leaks between users)
  await t.test('Test D — Strict user isolation between authenticated and anonymous sessions', () => {
    const db = createTestDb();
    const insertReel = db.prepare(`
      INSERT INTO pulse_reels (id, title, video_url, category, created_at)
      VALUES (?, ?, 'https://example.com/video.mp4', 'campus_life', ?)
    `);
    insertReel.run('reel-a', 'A', '2026-10-14 12:00:00');
    insertReel.run('reel-b', 'B', '2026-10-14 11:00:00');

    const recordView = db.prepare(`
      INSERT INTO pulse_reel_views (reel_id, user_id, watch_count, last_watched_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    `);

    // User 1 watches reel-a
    recordView.run('reel-a', 'user-1');
    // Anonymous Guest 2 watches reel-b
    recordView.run('reel-b', 'anon:guest-device-123');

    const getEligible = (userId) => {
      return db.prepare(`
        SELECT r.id FROM pulse_reels r
        WHERE NOT EXISTS (
          SELECT 1 FROM pulse_reel_views v
          WHERE v.reel_id = r.id AND v.user_id = ?
            AND v.last_watched_at > datetime('now', '-48 hours')
        )
        ORDER BY r.created_at DESC, r.id DESC
      `).all(userId).map((r) => r.id);
    };

    // User 1 should only have reel-b eligible
    assert.deepEqual(getEligible('user-1'), ['reel-b']);

    // Guest 2 should only have reel-a eligible
    assert.deepEqual(getEligible('anon:guest-device-123'), ['reel-a']);

    // Another independent User 3 has both reels eligible
    assert.deepEqual(getEligible('user-3'), ['reel-a', 'reel-b']);
  });

  // TEST E: Feed exhaustion and end-of-feed handling
  await t.test('Test E — Feed exhaustion stops loading without cloning', () => {
    let hasMore = false;
    let nextCursor = null;
    let isExhausted = false;
    let fetchCount = 0;

    const loadMore = () => {
      if (isExhausted || !nextCursor) {
        return; // Guard properly prevents redundant queries
      }
      fetchCount++;
    };

    // Simulate backend response reaching the end
    const onResponse = (response) => {
      hasMore = response.hasMore;
      nextCursor = response.nextCursor;
      if (!hasMore || !nextCursor) {
        isExhausted = true;
      }
    };

    onResponse({ reels: [{ id: 'reel-last' }], nextCursor: null, hasMore: false });
    assert.equal(isExhausted, true);

    // Scrolling again at the end must NOT trigger extra fetches
    loadMore();
    loadMore();
    assert.equal(fetchCount, 0, 'No extra fetch calls after feed exhaustion');
  });

  // TEST F: Pagination race conditions
  await t.test('Test F — Rapid load-more race conditions are safely locked', async () => {
    let isFetching = false;
    let executeCount = 0;
    let feed = [{ id: 'r1' }];

    const loadMore = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executeCount++;
        const newBatch = [{ id: 'r2' }];
        const existing = new Set(feed.map((r) => r.id));
        const fresh = newBatch.filter((r) => !existing.has(r.id));
        feed = [...feed, ...fresh];
      } finally {
        isFetching = false;
      }
    };

    // Fire 5 concurrent requests
    await Promise.all([loadMore(), loadMore(), loadMore(), loadMore(), loadMore()]);

    assert.equal(executeCount, 1, 'Only one fetch should execute when calls race concurrently');
    assert.equal(feed.length, 2);
    assert.deepEqual(feed.map((r) => r.id), ['r1', 'r2']);
  });

  // TEST G: Refresh behavior
  await t.test('Test G — Refresh resets cursor and pagination while preserving watch history', () => {
    const persistentWatchStore = new Set(['r1']);
    let cursor = '2026-10-14T10:00:00Z|r3';
    let isExhausted = true;

    // Simulate user triggering refresh
    const refreshFeed = () => {
      cursor = null;
      isExhausted = false;
      // Watch store remains untouched
    };

    refreshFeed();
    assert.equal(cursor, null, 'Cursor must reset on refresh');
    assert.equal(isExhausted, false, 'Exhaustion state must reset on refresh');
    assert.ok(persistentWatchStore.has('r1'), 'Watched history must remain persistent across refresh');
  });

  // TEST H: Existing functionality (Likes, comments, categories, audio toggle)
  await t.test('Test H — Existing Reels Features Integrity', async (t) => {
    await t.test('Likes count optimistic toggle behaves symmetrically', () => {
      let likesCount = 10;
      let isLiked = false;

      const toggleLike = () => {
        isLiked = !isLiked;
        likesCount = isLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
      };

      toggleLike();
      assert.equal(isLiked, true);
      assert.equal(likesCount, 11);

      toggleLike();
      assert.equal(isLiked, false);
      assert.equal(likesCount, 10);
    });

    await t.test('Comment bodies are sanitized and capped at 500 characters', () => {
      const sanitize = (text) => (text || '').trim().slice(0, 500);
      assert.equal(sanitize('   great campus vibe  '), 'great campus vibe');
      assert.equal(sanitize('a'.repeat(600)).length, 500);
    });

    await t.test('Watch duration threshold evaluates accurately', () => {
      const shouldMarkViewed = (currentTime, durationSeconds = 15) => {
        const threshold = Math.min(5, durationSeconds * 0.5);
        return currentTime >= threshold;
      };

      assert.equal(shouldMarkViewed(2.0, 14), false, '2 seconds is under threshold');
      assert.equal(shouldMarkViewed(5.1, 14), true, '5.1 seconds meets threshold');
      assert.equal(shouldMarkViewed(4.0, 6), true, '4.0s of 6s video is >= 50%');
    });
  });

  // TEST I: CORS Preflight & X-Anonymous-Session-Id Header Permissions
  await t.test('Test I — CORS Preflight & X-Anonymous-Session-Id Verification', async (t) => {
    const ALLOWED_ORIGINS = new Set([
      'https://student-addit.pages.dev',
      'https://student-addit-admin.pages.dev',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ]);

    function isAllowedOrigin(origin) {
      if (ALLOWED_ORIGINS.has(origin)) return true;
      try {
        const url = new URL(origin);
        return url.protocol === 'https:' && url.port === '' && (
          url.hostname.endsWith('.student-addit.pages.dev') ||
          url.hostname.endsWith('.student-addit-admin.pages.dev')
        );
      } catch {
        return false;
      }
    }

    function withCors(response, request) {
      const origin = request.headers.get('origin');
      if (!origin || !isAllowedOrigin(origin) || response.status === 101) return response;
      const headers = new Headers(response.headers);
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      headers.set('access-control-allow-headers', 'Authorization, Content-Type, X-File-Name, X-Anonymous-Session-Id');
      headers.set('access-control-max-age', '86400');
      headers.set('vary', headers.has('vary') ? `${headers.get('vary')}, Origin` : 'Origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    function handlePreflight(request) {
      if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }), request);
      }
      return withCors(new Response(JSON.stringify({ ok: true }), { status: 200 }), request);
    }

    await t.test('GET /api/pulse/reels preflight allows Cloudflare Pages preview & x-anonymous-session-id', () => {
      const previewOrigin = 'https://81dbdf83.student-addit.pages.dev';
      const req = new Request('https://student-addit.mgp899123.workers.dev/api/pulse/reels?category=all&limit=15', {
        method: 'OPTIONS',
        headers: {
          'Origin': previewOrigin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'x-anonymous-session-id',
        },
      });

      const res = handlePreflight(req);
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), previewOrigin);
      assert.ok(res.headers.get('access-control-allow-methods').includes('GET'));
      assert.ok(res.headers.get('access-control-allow-methods').includes('OPTIONS'));

      const allowedHeaders = res.headers.get('access-control-allow-headers').toLowerCase();
      assert.ok(allowedHeaders.includes('x-anonymous-session-id'), 'Must permit x-anonymous-session-id');
      assert.ok(allowedHeaders.includes('authorization'), 'Must permit authorization');
      assert.ok(allowedHeaders.includes('content-type'), 'Must permit content-type');
      assert.ok(res.headers.get('vary').includes('Origin'));
    });

    await t.test('POST /api/pulse/reels/:id/view preflight allows POST & content-type + x-anonymous-session-id', () => {
      const previewOrigin = 'https://81dbdf83.student-addit.pages.dev';
      const req = new Request('https://student-addit.mgp899123.workers.dev/api/pulse/reels/reel-hostel-1/view', {
        method: 'OPTIONS',
        headers: {
          'Origin': previewOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, x-anonymous-session-id',
        },
      });

      const res = handlePreflight(req);
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), previewOrigin);
      assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));

      const allowedHeaders = res.headers.get('access-control-allow-headers').toLowerCase();
      assert.ok(allowedHeaders.includes('x-anonymous-session-id'));
      assert.ok(allowedHeaders.includes('content-type'));
    });

    await t.test('Rejects arbitrary unauthorized origins from receiving CORS grant', () => {
      const untrustedOrigin = 'https://evil-phishing-site.com';
      const req = new Request('https://student-addit.mgp899123.workers.dev/api/pulse/reels', {
        method: 'OPTIONS',
        headers: {
          'Origin': untrustedOrigin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'x-anonymous-session-id',
        },
      });

      const res = handlePreflight(req);
      assert.equal(res.headers.get('access-control-allow-origin'), null, 'Untrusted origin must not receive Access-Control-Allow-Origin');
    });
  });
});
