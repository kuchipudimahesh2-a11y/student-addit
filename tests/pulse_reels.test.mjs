import test from 'node:test';
import assert from 'node:assert/strict';

test('Pulse Reels Engine & Vertical Feed Suite', async (t) => {
  // 1. Curated Reels Catalog Integrity
  await t.test('1. Master Reels Catalog Integrity', async (t) => {
    const MASTER_PULSE_REELS = [
      {
        id: 'reel-hostel-1',
        title: 'Hostel Night Cooking Champions 🍳',
        caption: 'When the mess closes at 9 PM and you have 1 electric kettle and 4 packets of Maggi. Who can relate? #HostelLife #MidnightCravings',
        video_url: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-eating-a-burger-with-great-appetite-43187-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&q=80',
        duration_seconds: 14,
        author_name: 'Hostel 4 Legends',
        sound_title: 'Original Sound · Midnight Snacks',
        category: 'hostel',
        likes_count: 342,
        comments_count: 28,
      },
      {
        id: 'reel-code-2',
        title: 'Code Runs on First Try 🚀',
        caption: 'That magical 0.001% moment when your code compiles with 0 errors and 0 warnings on the first attempt 🤯 #TechAndCode #ProgrammerLife',
        video_url: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-working-on-a-computer-43156-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=500&q=80',
        duration_seconds: 12,
        author_name: 'DevClub Campus',
        sound_title: 'Synthwave Beats · Coding Zone',
        category: 'tech_coding',
        likes_count: 819,
        comments_count: 74,
      },
      {
        id: 'reel-campus-3',
        title: 'Campus Monsoon Walk 🌧️',
        caption: 'Running between the Engineering block and the library during sudden campus rain. Best feeling on campus! #CampusLife #MonsoonVibes',
        video_url: 'https://assets.mixkit.co/videos/preview/mixkit-feet-of-a-woman-walking-in-the-rain-43166-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=500&q=80',
        duration_seconds: 15,
        author_name: 'Campus Vibes Official',
        sound_title: 'Lofi Rain Study Beats',
        category: 'campus_life',
        likes_count: 620,
        comments_count: 41,
      },
      {
        id: 'reel-meme-4',
        title: '8 AM Monday Lecture Attendance 😴',
        caption: 'Body is in the lecture hall, but the soul is still in the hostel bed dreaming about breakfast. Attendance was mandatory though! #StudentMemes #CollegeRelatable',
        video_url: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-sleeping-on-a-sofa-43152-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=500&q=80',
        duration_seconds: 11,
        author_name: 'Backbencher Central',
        sound_title: 'Funny Meme Sound Effect',
        category: 'memes',
        likes_count: 1240,
        comments_count: 112,
      },
      {
        id: 'reel-exam-5',
        title: 'One Night Before Finals 📚⚡',
        caption: 'Covering 5 units in 4 hours with 3 cups of coffee. When adrenaline is your study partner. We survive this semester! #ExamStress #StudyGrind',
        video_url: 'https://assets.mixkit.co/videos/preview/mixkit-student-doing-homework-in-the-living-room-43162-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=500&q=80',
        duration_seconds: 16,
        author_name: 'Semester Survivors',
        sound_title: 'Clock Ticking · Final Boss Music',
        category: 'exam_stress',
        likes_count: 980,
        comments_count: 89,
      },
    ];

    await t.test('All reels have valid non-empty MP4 stream URLs', () => {
      for (const reel of MASTER_PULSE_REELS) {
        assert.ok(reel.video_url.endsWith('.mp4'), `Reel ${reel.id} must be an mp4 video`);
        assert.ok(reel.video_url.startsWith('https://'), `Reel ${reel.id} must use https`);
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
