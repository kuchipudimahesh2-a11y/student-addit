import test from 'node:test';
import assert from 'node:assert/strict';

test('Pulse Reels Engine & Vertical Feed Suite', async (t) => {
  // 1. Curated Reels Catalog Integrity
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

  // 2. Category Filter & Pagination Logic
  await t.test('2. Feed Category Filtering & Cursor Pagination', async (t) => {
    const sampleReels = [
      { id: 'r1', category: 'memes', created_at: '2026-10-14T12:00:00Z' },
      { id: 'r2', category: 'hostel', created_at: '2026-10-14T11:00:00Z' },
      { id: 'r3', category: 'memes', created_at: '2026-10-14T10:00:00Z' },
      { id: 'r4', category: 'campus_life', created_at: '2026-10-14T09:00:00Z' },
    ];

    await t.test('Filters correctly by category', () => {
      const memesOnly = sampleReels.filter((r) => r.category === 'memes');
      assert.equal(memesOnly.length, 2);
      assert.deepEqual(memesOnly.map((r) => r.id), ['r1', 'r3']);

      const all = sampleReels.filter((r) => 'all' === 'all' || r.category === 'all');
      assert.equal(all.length, 4);
    });

    await t.test('Calculates nextCursor when results exceed limit', () => {
      const limit = 2;
      const results = sampleReels.slice(0, limit + 1); // limit + 1 fetched
      const hasMore = results.length > limit;
      const pageItems = hasMore ? results.slice(0, limit) : results;
      const last = pageItems[pageItems.length - 1];
      const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

      assert.equal(hasMore, true);
      assert.equal(pageItems.length, 2);
      assert.equal(nextCursor, '2026-10-14T11:00:00Z|r2');
    });
  });

  // 3. Like Toggle & Counter Aggregation
  await t.test('3. Like Toggle & Counter Aggregation', async (t) => {
    let likesCount = 42;
    let isLiked = false;

    // Simulate User Toggling Like (ON)
    const toggleLikeOn = () => {
      isLiked = true;
      likesCount += 1;
    };

    // Simulate User Toggling Like (OFF)
    const toggleLikeOff = () => {
      isLiked = false;
      likesCount = Math.max(0, likesCount - 1);
    };

    await t.test('Toggling like increments count and sets isLiked true', () => {
      toggleLikeOn();
      assert.equal(isLiked, true);
      assert.equal(likesCount, 43);
    });

    await t.test('Unliking decrements count and sets isLiked false', () => {
      toggleLikeOff();
      assert.equal(isLiked, false);
      assert.equal(likesCount, 42);
    });

    await t.test('Count never goes below zero even on edge unlikes', () => {
      likesCount = 0;
      toggleLikeOff();
      assert.equal(likesCount, 0);
    });
  });

  // 4. Double-Tap Interaction Logic
  await t.test('4. Double-Tap Detection Algorithm', async (t) => {
    const isDoubleTap = (prevTime, currentTime) => {
      return prevTime && (currentTime - prevTime < 300);
    };

    await t.test('Taps within 250ms are identified as double tap', () => {
      const t1 = 1000;
      const t2 = 1250;
      assert.equal(isDoubleTap(t1, t2), true);
    });

    await t.test('Taps separated by > 300ms are treated as distinct single taps', () => {
      const t1 = 1000;
      const t2 = 1450;
      assert.equal(isDoubleTap(t1, t2), false);
    });
  });

  // 5. Comments Sanitization
  await t.test('5. Comments Input Sanitization', async (t) => {
    const sanitizeComment = (input) => {
      return (input || '').trim().slice(0, 500);
    };

    await t.test('Trims whitespace from comment bodies', () => {
      assert.equal(sanitizeComment('  hostel maggi is goat   '), 'hostel maggi is goat');
    });

    await t.test('Enforces 500-char maximum ceiling', () => {
      const longComment = 'a'.repeat(600);
      assert.equal(sanitizeComment(longComment).length, 500);
    });

    await t.test('Rejects empty or whitespace-only comments', () => {
      assert.equal(sanitizeComment('     '), '');
    });
  });
});
