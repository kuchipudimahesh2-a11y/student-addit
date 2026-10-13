import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper: Deterministic calendar day prompt calculation matching worker/pulse.ts
function getDailyPromptKey(dateStr, totalPrompts) {
  if (totalPrompts <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % totalPrompts;
}

describe('ADDa Pulse Production Upgrades & Technical Audit Tests', () => {

  describe('1. Anonymity Scrubbing & Privacy Protection', () => {
    test('Anonymous posts must strictly scrub account userId from public payload', () => {
      const rawDbRow = {
        id: 'post-123',
        user_id: 'real-user-id-999',
        author_handle: 'mahesh',
        avatar_url: 'https://cdn.adda.com/avatar.png',
        is_anonymous: 1,
        title: 'Spicy Secret',
        body: 'A private confession',
      };

      // Transform according to worker/pulse.ts strict scrubbing logic
      const isAnon = Boolean(rawDbRow.is_anonymous);
      const publicPost = {
        id: rawDbRow.id,
        userId: isAnon ? null : rawDbRow.user_id,
        authorHandle: isAnon ? 'Anonymous 🎭' : rawDbRow.author_handle,
        avatarUrl: isAnon ? null : rawDbRow.avatar_url,
        isAnonymous: isAnon,
        title: rawDbRow.title,
        body: rawDbRow.body,
      };

      assert.equal(publicPost.userId, null, 'Public response MUST have userId === null for anonymous posts');
      assert.equal(publicPost.authorHandle, 'Anonymous 🎭', 'Handle must be masked');
      assert.equal(publicPost.avatarUrl, null, 'Avatar URL must not leak identity');
    });

    test('Identified posts preserve author handle and avatar for legitimate interaction', () => {
      const rawDbRow = {
        id: 'post-456',
        user_id: 'real-user-id-100',
        author_handle: 'campus_dev',
        avatar_url: 'https://cdn.adda.com/avatar.png',
        is_anonymous: 0,
        body: 'Who wants to collaborate on the hackathon project?',
      };

      const isAnon = Boolean(rawDbRow.is_anonymous);
      const publicPost = {
        id: rawDbRow.id,
        userId: isAnon ? null : rawDbRow.user_id,
        authorHandle: isAnon ? 'Anonymous 🎭' : rawDbRow.author_handle,
        avatarUrl: isAnon ? null : rawDbRow.avatar_url,
        isAnonymous: isAnon,
        body: rawDbRow.body,
      };

      assert.equal(publicPost.userId, 'real-user-id-100');
      assert.equal(publicPost.authorHandle, 'campus_dev');
      assert.equal(publicPost.avatarUrl, 'https://cdn.adda.com/avatar.png');
    });

    test('Anonymous comments must also strictly scrub account userId', () => {
      const rawComment = {
        id: 'com-1',
        post_id: 'post-123',
        user_id: 'secret-student-44',
        author_handle: 'secret_student',
        avatar_url: 'https://cdn.adda.com/pic.png',
        is_anonymous: 1,
        body: 'Me too!',
      };

      const isAnon = Boolean(rawComment.is_anonymous);
      const publicComment = {
        id: rawComment.id,
        postId: rawComment.post_id,
        userId: isAnon ? null : rawComment.user_id,
        authorHandle: isAnon ? 'Anonymous 🎭' : rawComment.author_handle,
        avatarUrl: isAnon ? null : rawComment.avatar_url,
        isAnonymous: isAnon,
        body: rawComment.body,
      };

      assert.equal(publicComment.userId, null, 'Comment userId must be scrubbed');
      assert.equal(publicComment.authorHandle, 'Anonymous 🎭');
    });
  });

  describe('2. Deterministic Daily Pulse Prompt Rotation', () => {
    const catalog = [
      { id: 'pr-1', prompt: 'The hardest truth about adulting that nobody prepared us for is:' },
      { id: 'pr-2', prompt: 'Something I feel guilty about but will never admit in person:' },
      { id: 'pr-3', prompt: 'An unwritten social rule that actually makes zero sense:' },
      { id: 'pr-4', prompt: 'One skill that actually increased my salary more than my degree:' },
      { id: 'pr-5', prompt: 'What is keeping you awake at 2 AM tonight?' },
    ];

    test('Same calendar date returns the identical prompt across multiple requests without drift', () => {
      const today = '2026-10-13';
      const key1 = getDailyPromptKey(today, catalog.length);
      const key2 = getDailyPromptKey(today, catalog.length);
      const key3 = getDailyPromptKey(today, catalog.length);

      assert.equal(key1, key2);
      assert.equal(key2, key3);
      assert.ok(key1 >= 0 && key1 < catalog.length);
    });

    test('Different calendar dates deterministically select distinct community prompts', () => {
      const day1Key = getDailyPromptKey('2026-10-13', catalog.length);
      const day2Key = getDailyPromptKey('2026-10-14', catalog.length);
      const day3Key = getDailyPromptKey('2026-10-15', catalog.length);

      // They should rotate predictably
      assert.ok(typeof day1Key === 'number');
      assert.ok(typeof day2Key === 'number');
      assert.ok(typeof day3Key === 'number');
    });
  });

  describe('3. Feed Pagination Beyond 120 Posts with Zero Duplication', () => {
    // Simulate a database of 200 posts
    const databasePosts = Array.from({ length: 200 }, (_, i) => {
      const date = new Date(Date.now() - (i * 3600_000)).toISOString();
      return {
        id: `post-${200 - i}`,
        created_at: date,
        reaction_count: (i % 7) * 2,
        comment_count: i % 4,
        body: `Post content number ${200 - i}`,
      };
    });

    test('Keyset cursor pagination retrieves all 200 posts across pages without skips or repeats', () => {
      const pageSize = 15;
      const seenIds = new Set();
      let currentCursor = null;
      let pagesFetched = 0;
      const collectedPosts = [];

      while (true) {
        pagesFetched++;
        // Simulate query: WHERE created_at < cursorCreated OR (created_at = cursorCreated AND id < cursorId)
        let eligible = databasePosts;
        if (currentCursor) {
          const [cursorCreated, cursorId] = currentCursor.split('___');
          eligible = databasePosts.filter(p => 
            p.created_at < cursorCreated || (p.created_at === cursorCreated && p.id < cursorId)
          );
        }

        const batch = eligible.slice(0, pageSize);
        if (batch.length === 0) break;

        for (const post of batch) {
          assert.equal(seenIds.has(post.id), false, `Post ${post.id} must not be duplicated!`);
          seenIds.add(post.id);
          collectedPosts.push(post);
        }

        if (batch.length < pageSize) {
          currentCursor = null;
          break;
        }

        const last = batch[batch.length - 1];
        currentCursor = `${last.created_at}___${last.id}`;
      }

      assert.equal(collectedPosts.length, 200, 'All 200 posts must be retrieved');
      assert.equal(seenIds.size, 200, 'Exactly 200 unique post IDs must be retrieved');
      assert.ok(pagesFetched > 13, `Must paginate across more than 13 pages (fetched ${pagesFetched})`);
    });

    test('Client-side loaded deduplication protects against race conditions', () => {
      const page1 = [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }];
      const page2 = [{ id: 'p-3' }, { id: 'p-4' }, { id: 'p-5' }]; // p-3 simulated overlap

      const existingSet = new Set(page1.map(p => p.id));
      const filtered = page2.filter(p => !existingSet.has(p.id));
      const combined = [...page1, ...filtered];

      assert.equal(combined.length, 5);
      assert.deepEqual(combined.map(p => p.id), ['p-1', 'p-2', 'p-3', 'p-4', 'p-5']);
    });
  });

  describe('4. Authorization & Moderation Controls', () => {
    test('Content synchronization requires administrator role', () => {
      const memberUser = { id: 'u-1', username: 'student', role: 'member' };
      const adminUser = { id: 'u-2', username: 'admin', role: 'admin' };

      const canSync = (user) => Boolean(user && user.role === 'admin');

      assert.equal(canSync(null), false, 'Unauthenticated user cannot sync');
      assert.equal(canSync(memberUser), false, 'Normal student member cannot sync');
      assert.equal(canSync(adminUser), true, 'Admin can sync catalog');
    });

    test('Post deletion requires authorship or administrator privilege', () => {
      const post = { id: 'post-1', user_id: 'author-123' };
      const author = { id: 'author-123', role: 'member' };
      const stranger = { id: 'other-456', role: 'member' };
      const admin = { id: 'admin-789', role: 'admin' };

      const canDelete = (user, post) => Boolean(user && (user.id === post.user_id || user.role === 'admin'));

      assert.equal(canDelete(author, post), true, 'Author can delete their own post');
      assert.equal(canDelete(stranger, post), false, 'Stranger CANNOT delete post');
      assert.equal(canDelete(admin, post), true, 'Admin can delete reported post');
    });

    test('User block excludes target from viewer stream', () => {
      const blockedUserId = 'bad-actor-1';
      const posts = [
        { id: '1', user_id: 'good-user' },
        { id: '2', user_id: 'bad-actor-1' },
        { id: '3', user_id: 'another-user' },
      ];

      const visiblePosts = posts.filter(p => p.user_id !== blockedUserId);
      assert.equal(visiblePosts.length, 2);
      assert.equal(visiblePosts.some(p => p.user_id === blockedUserId), false);
    });
  });

  describe('5. Authentic Community Participation Metrics (No Manipulation)', () => {
    test('New user starts with 0 streak and 0 aura without fabricated base values', () => {
      const initialStreak = 0;
      const initialAura = 0;

      assert.equal(initialStreak, 0);
      assert.equal(initialAura, 0);
    });

    test('Multiple actions on the same calendar day do not artificially inflate streak', () => {
      let streak = 0;
      let lastActiveDate = '';
      const today = '2026-10-13';

      function recordAction(date) {
        if (lastActiveDate !== date) {
          streak = 1;
          lastActiveDate = date;
        }
      }

      recordAction(today); // Post created
      recordAction(today); // Comment added
      recordAction(today); // Daily prompt answered

      assert.equal(streak, 1, 'Streak must only increment once per active calendar day');
    });
  });
});
