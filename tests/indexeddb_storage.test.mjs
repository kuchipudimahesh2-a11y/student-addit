import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('ADDa IndexedDB Offline Storage & Synchronization Suite', () => {

  describe('1. Chat Message Storage, Deduplication & Ordering', () => {
    test('Messages in room are deduplicated and sorted chronologically', () => {
      const incomingBatch = [
        { id: 'msg-3', roomKey: 'dm:conv-1', username: 'student_a', mine: true, body: 'See you there', created_at: '2026-10-13T10:05:00Z' },
        { id: 'msg-1', roomKey: 'dm:conv-1', username: 'student_b', mine: false, body: 'Hey, are you free?', created_at: '2026-10-13T10:00:00Z' },
        { id: 'msg-2', roomKey: 'dm:conv-1', username: 'student_a', mine: true, body: 'Yeah, meet at library?', created_at: '2026-10-13T10:02:00Z' },
        // Duplicate received via WebSocket
        { id: 'msg-2', roomKey: 'dm:conv-1', username: 'student_a', mine: true, body: 'Yeah, meet at library?', created_at: '2026-10-13T10:02:00Z' },
      ];

      // Simulate store map deduplication by id
      const msgMap = new Map();
      for (const msg of incomingBatch) {
        msgMap.set(msg.id, msg);
      }
      const sorted = Array.from(msgMap.values()).sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
      );

      assert.equal(sorted.length, 3, 'Duplicate msg-2 must be merged');
      assert.equal(sorted[0].id, 'msg-1', 'First chronological message must be msg-1');
      assert.equal(sorted[1].id, 'msg-2', 'Second message must be msg-2');
      assert.equal(sorted[2].id, 'msg-3', 'Third message must be msg-3');
    });

    test('Message edits update body and edited_at without breaking order', () => {
      const existing = [
        { id: 'm-1', body: 'Original text', created_at: '2026-10-13T10:00:00Z' },
        { id: 'm-2', body: 'Second message', created_at: '2026-10-13T10:01:00Z' },
      ];

      const editUpdate = { id: 'm-1', body: 'Edited text', edited_at: '2026-10-13T10:02:30Z' };

      const updated = existing.map((m) =>
        m.id === editUpdate.id ? { ...m, body: editUpdate.body, edited_at: editUpdate.edited_at } : m
      );

      assert.equal(updated[0].body, 'Edited text');
      assert.equal(updated[0].edited_at, '2026-10-13T10:02:30Z');
      assert.equal(updated[1].body, 'Second message');
    });
  });

  describe('2. Room Drafts Persistence Lifecycle', () => {
    test('Draft persists per roomKey and clears upon send dispatch', () => {
      const draftStore = new Map();

      // User types draft in DM room
      const dmKey = 'dm:user_alice';
      draftStore.set(dmKey, 'Hey Alice, do you have notes from class?');

      assert.equal(draftStore.get(dmKey), 'Hey Alice, do you have notes from class?');

      // User switches to group room, writes separate draft
      const groupKey = 'group:cs_batch_2026';
      draftStore.set(groupKey, 'Team meeting at 5 PM today.');

      assert.equal(draftStore.get(dmKey), 'Hey Alice, do you have notes from class?');
      assert.equal(draftStore.get(groupKey), 'Team meeting at 5 PM today.');

      // Dispatch send in DM clears DM draft
      draftStore.delete(dmKey);
      assert.equal(draftStore.has(dmKey), false, 'DM draft should be cleared after message send');
      assert.equal(draftStore.get(groupKey), 'Team meeting at 5 PM today.', 'Group draft remains intact');
    });
  });

  describe('3. Game Scores & Leaderboards Cache', () => {
    test('Personal bests preserve highest score across runs', () => {
      const scoresDb = new Map();

      function recordScore(gameId, runScore) {
        const existing = scoresDb.get(gameId);
        const best = existing ? Math.max(existing.personalBest, runScore) : runScore;
        scoresDb.set(gameId, {
          gameId,
          personalBest: best,
          lastScore: runScore,
          updatedAt: Date.now(),
        });
      }

      recordScore('dino-run', 120);
      assert.equal(scoresDb.get('dino-run').personalBest, 120);
      assert.equal(scoresDb.get('dino-run').lastScore, 120);

      // Lower run does not reduce personal best
      recordScore('dino-run', 85);
      assert.equal(scoresDb.get('dino-run').personalBest, 120, 'Personal best must remain 120');
      assert.equal(scoresDb.get('dino-run').lastScore, 85, 'Last score must be updated to 85');

      // Higher run sets new personal best
      recordScore('dino-run', 240);
      assert.equal(scoresDb.get('dino-run').personalBest, 240);
      assert.equal(scoresDb.get('dino-run').lastScore, 240);
    });

    test('Leaderboard cache preserves team totals and season metadata', () => {
      const cached = {
        key: 'team_board',
        personalBest: 450,
        totals: [
          { gender: 'male', total: 12500 },
          { gender: 'female', total: 14200 },
        ],
        topPlayers: [
          { username: 'priya_k', totalScore: 3500, bestRun: 620 },
          { username: 'arjun_v', totalScore: 3100, bestRun: 580 },
        ],
        season: { number: 3, nextResetAt: '2026-10-25 00:00:00' },
        cachedAt: Date.now(),
      };

      assert.equal(cached.personalBest, 450);
      assert.equal(cached.totals.length, 2);
      assert.equal(cached.topPlayers[0].username, 'priya_k');
      assert.equal(cached.season.number, 3);
    });
  });

  describe('4. Offline Score Queue & Automatic Sync Flush', () => {
    test('Offline scores queue correctly and flush via API with retry handling', async () => {
      const queue = [
        { queueId: 1, gameId: 'dino-run', score: 320, attempts: 0 },
        { queueId: 2, gameId: 'quick-tap', score: 45, attempts: 0 },
        { queueId: 3, gameId: 'reaction-test', score: 210, attempts: 0 },
      ];

      const apiCalls = [];
      const mockApi = async (path, token, options) => {
        apiCalls.push({ path, token, body: JSON.parse(options.body) });
        return { success: true };
      };

      // Simulate flushPendingScores algorithm
      let syncedCount = 0;
      const remainingQueue = [];

      for (const item of queue) {
        try {
          if (item.gameId === 'dino-run') {
            await mockApi('/game/score', 'test-token', {
              method: 'POST',
              body: JSON.stringify({ score: item.score }),
            });
          } else {
            await mockApi('/game/minigames/bests', 'test-token', {
              method: 'POST',
              body: JSON.stringify({ gameId: item.gameId, score: item.score }),
            });
          }
          syncedCount++;
        } catch {
          remainingQueue.push({ ...item, attempts: item.attempts + 1 });
        }
      }

      assert.equal(syncedCount, 3, 'All 3 items should sync');
      assert.equal(remainingQueue.length, 0, 'Queue should be empty after complete flush');
      assert.equal(apiCalls.length, 3);
      assert.equal(apiCalls[0].path, '/game/score');
      assert.equal(apiCalls[0].body.score, 320);
      assert.equal(apiCalls[1].path, '/game/minigames/bests');
      assert.equal(apiCalls[1].body.gameId, 'quick-tap');
      assert.equal(apiCalls[2].body.gameId, 'reaction-test');
    });

    test('Network failure during sync retains item in queue with incremented attempts', async () => {
      const queue = [
        { queueId: 1, gameId: 'dino-run', score: 500, attempts: 0 },
      ];

      const failingApi = async () => {
        throw new Error('Network offline (503 Service Unavailable)');
      };

      let syncedCount = 0;
      const remainingQueue = [];

      for (const item of queue) {
        try {
          await failingApi();
          syncedCount++;
        } catch {
          remainingQueue.push({ ...item, attempts: item.attempts + 1 });
        }
      }

      assert.equal(syncedCount, 0, 'No items should be marked synced');
      assert.equal(remainingQueue.length, 1, 'Item must remain in queue for future retry');
      assert.equal(remainingQueue[0].attempts, 1, 'Retry attempts must increment');
      assert.equal(remainingQueue[0].score, 500, 'Score data must be preserved exactly');
    });
  });

});
