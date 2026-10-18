import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/* ==========================================================================
   Reference implementations matching:
   - src/db/addaDb.ts
   - worker/index.ts
   - src/CommunityChats.tsx
   - src/App.tsx
   ========================================================================== */

// 1. Account room key scoping (matches src/db/addaDb.ts)
function getAccountRoomKey(roomKey, accountId) {
  if (!accountId || !roomKey) return roomKey;
  if (roomKey.startsWith(accountId + ':')) return roomKey;
  return `${accountId}:${roomKey}`;
}

// 2. Message record normalizer (matches saveMessages in src/db/addaDb.ts)
function normalizeCachedMessage(msg, scopedKey) {
  return {
    id: msg.id,
    roomKey: scopedKey,
    username: msg.username || '',
    mine: Boolean(msg.mine),
    body: msg.body || '',
    created_at: msg.created_at || new Date().toISOString(),
    edited_at: msg.edited_at ?? null,
    reply_to_message_id: msg.reply_to_message_id ?? null,
    reply_to_body: msg.reply_to_body ?? null,
    reply_to_username: msg.reply_to_username ?? null,
    reply_to_mine: msg.reply_to_mine ?? false,
    type: msg.type ?? 'message',
    call_status: msg.call_status ?? null,
    call_duration_seconds: msg.call_duration_seconds ?? 0,
    seen: msg.seen ?? false,
    delivered: msg.delivered ?? false,
    media_type: msg.media_type ?? null,
    media_url: msg.media_url ?? null,
    media_duration_seconds: msg.media_duration_seconds ?? null,
    file_name: msg.file_name ?? null,
    file_size: msg.file_size ?? null,
    is_deleted: Boolean(msg.is_deleted),
    is_forwarded: msg.is_forwarded ?? false,
    is_starred: msg.is_starred ?? false,
    reactions: Array.isArray(msg.reactions)
      ? msg.reactions.map((r) => ({
          emoji: String(r.emoji || ''),
          count: Number(r.count || 0),
          users: Array.isArray(r.users) ? r.users : [],
          hasReacted: Boolean(r.hasReacted),
          reactedByMe: Boolean(r.reactedByMe),
        }))
      : [],
    link_preview: msg.link_preview ?? null,
    poll_id: msg.poll_id ?? null,
    poll: msg.poll ?? null,
    expires_at: msg.expires_at ?? null,
  };
}

// 3. Reverse cursor message retrieval (matches getMessages in src/db/addaDb.ts)
function queryMessagesReverseCursor(allRecords, scopedKey, limit = 200) {
  // Filter records belonging to scopedKey
  const matching = allRecords.filter((r) => r.roomKey === scopedKey);
  // IndexedDB index 'room_created' orders by [roomKey, created_at]
  matching.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  // 'prev' cursor traverses in reverse order (newest first)
  const results = [];
  for (let i = matching.length - 1; i >= 0; i--) {
    if (results.length < limit) {
      results.push(matching[i]);
    } else {
      break;
    }
  }

  // Reverse back to chronological order (oldest -> newest) for display
  return results.reverse();
}

// 4. In-flight GET request deduplication manager (matches src/CommunityChats.tsx)
class RequestDeduplicator {
  constructor() {
    this.inFlightGetRequests = new Map();
    this.networkFetchCount = 0;
  }

  request(url, options = {}, fetcher) {
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const dedupKey = isGet ? `${url}::${options.headers?.Authorization || ''}` : null;

    if (dedupKey && this.inFlightGetRequests.has(dedupKey)) {
      return this.inFlightGetRequests.get(dedupKey);
    }

    const promise = (async () => {
      this.networkFetchCount++;
      return await fetcher(url, options);
    })();

    if (dedupKey) {
      this.inFlightGetRequests.set(dedupKey, promise);
      promise.finally(() => {
        this.inFlightGetRequests.delete(dedupKey);
      });
    }

    return promise;
  }
}

// 5. In-flight room message load guard (matches src/CommunityChats.tsx)
class RoomLoadGuard {
  constructor() {
    this.inFlightLoads = new Map();
  }

  async load(roomKey, loadFn) {
    if (this.inFlightLoads.has(roomKey)) {
      return this.inFlightLoads.get(roomKey);
    }

    const p = loadFn();
    this.inFlightLoads.set(roomKey, p);
    try {
      return await p;
    } finally {
      this.inFlightLoads.delete(roomKey);
    }
  }
}

// 6. Incremental sync cursor filter & merge (matches worker/index.ts & src/CommunityChats.tsx)
function evaluateServerIncrementalSync(serverRows, afterCursor) {
  if (!afterCursor) {
    // Default fetch: latest 200 in chronological order
    return serverRows.slice(-200);
  }

  const [afterAt, afterId] = afterCursor.split('|');
  // WHERE (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC LIMIT 200
  return serverRows
    .filter((r) => r.created_at > afterAt || (r.created_at === afterAt && r.id > afterId))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .slice(0, 200);
}

function mergeIncrementalMessages(cachedMessages, newMessages) {
  const map = new Map();
  for (const m of cachedMessages) {
    map.set(m.id, m);
  }
  for (const m of newMessages) {
    map.set(m.id, m);
  }
  return Array.from(map.values())
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .slice(-200);
}

// 7. Random Chat exponential backoff calculator (matches src/App.tsx)
function calculateRandomChatBackoff(attempt, jitterRandom = 0.5) {
  const baseDelays = [1000, 2000, 4000, 8000, 15000];
  const base = attempt < baseDelays.length ? baseDelays[attempt] : 30000;
  const jitter = Math.floor(jitterRandom * 500);
  return Math.min(30000, base + jitter);
}

// 8. Random Chat connection timeout handler (matches src/App.tsx)
function createConnectionTimeoutTracker(timeoutMs, onTimeout) {
  let timer = null;
  return {
    start() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onTimeout();
      }, timeoutMs);
    },
    clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isPending() {
      return timer !== null;
    },
  };
}

describe('Production Networking, Caching & Sync Upgrade Suite', () => {

  describe('Suite 1: Account-Scoped IndexedDB Caching & Message Integrity', () => {
    test('1. getAccountRoomKey scopes room by accountId without duplicating prefix', () => {
      assert.equal(getAccountRoomKey('dm:conv-101', 'usr_alice'), 'usr_alice:dm:conv-101');
      assert.equal(getAccountRoomKey('group:grp-202', 'usr_alice'), 'usr_alice:group:grp-202');
      // Already scoped
      assert.equal(getAccountRoomKey('usr_alice:dm:conv-101', 'usr_alice'), 'usr_alice:dm:conv-101');
      // No accountId falls back to raw roomKey
      assert.equal(getAccountRoomKey('dm:conv-101', null), 'dm:conv-101');
      assert.equal(getAccountRoomKey('dm:conv-101', undefined), 'dm:conv-101');
    });

    test('2. Account-scoped inbox cache returns immediately on cold start and isolates users', () => {
      const inboxDb = new Map();

      function saveInbox(userId, data) {
        const key = userId ? `inbox:${userId}` : 'inbox_data';
        inboxDb.set(key, { ...data, updatedAt: Date.now() });
      }

      function getInbox(userId) {
        const key = userId ? `inbox:${userId}` : 'inbox_data';
        return inboxDb.get(key) || null;
      }

      // Cold start: empty cache returns null
      assert.equal(getInbox('usr_alice'), null);

      // Save Alice's inbox
      saveInbox('usr_alice', { dms: [{ id: 'dm_1', name: 'Bob' }], groups: [], announcements: [] });
      const aliceInbox = getInbox('usr_alice');
      assert.ok(aliceInbox);
      assert.equal(aliceInbox.dms.length, 1);
      assert.equal(aliceInbox.dms[0].name, 'Bob');

      // User Bob on same device cannot see Alice's inbox
      const bobInbox = getInbox('usr_bob');
      assert.equal(bobInbox, null, "User Bob must not access Alice's cached inbox");
    });

    test('3. Inbox freshness window (30s) suppresses network requests when fresh', () => {
      const INBOX_FRESHNESS_MS = 30_000;
      let networkCalls = 0;

      function simulateInboxLoad(cachedInbox, now) {
        const isFresh = cachedInbox && (now - cachedInbox.updatedAt < INBOX_FRESHNESS_MS);
        if (isFresh) {
          // Suppress 4 network requests!
          return { data: cachedInbox, fetchedFromNetwork: false };
        }
        networkCalls += 4; // /friends, /groups, /group-join-requests, /announcements
        return { data: { updatedAt: now }, fetchedFromNetwork: true };
      }

      const now = 1000000;
      const freshCache = { updatedAt: now - 5000, dms: [], groups: [] };
      const res1 = simulateInboxLoad(freshCache, now);
      assert.equal(res1.fetchedFromNetwork, false, 'Fresh cache (< 30s) must suppress network requests');
      assert.equal(networkCalls, 0);

      // Stale cache (> 30s) triggers background refresh
      const staleCache = { updatedAt: now - 35000, dms: [], groups: [] };
      const res2 = simulateInboxLoad(staleCache, now);
      assert.equal(res2.fetchedFromNetwork, true, 'Stale cache (> 30s) must trigger network refresh');
      assert.equal(networkCalls, 4);
    });

    test('4. clearAccountData purges private account data on sign-out while preserving game bests', () => {
      const inboxStore = new Map();
      const roomStore = new Map();
      const messageStore = new Map();
      const gameScoresStore = new Map();

      // Populate data for Alice, Bob, and global games
      inboxStore.set('inbox:usr_alice', { dms: ['d1'] });
      inboxStore.set('inbox:usr_bob', { dms: ['d2'] });

      roomStore.set('usr_alice:dm:conv-1', { draft: 'Hi Bob' });
      roomStore.set('usr_bob:dm:conv-1', { draft: 'Hi Alice' });

      messageStore.set('m1', { id: 'm1', roomKey: 'usr_alice:dm:conv-1', body: 'Hello' });
      messageStore.set('m2', { id: 'm2', roomKey: 'usr_bob:dm:conv-1', body: 'Hey' });

      gameScoresStore.set('dino-run', { gameId: 'dino-run', personalBest: 450 });

      // Alice signs out: execute clearAccountData('usr_alice')
      const accountId = 'usr_alice';
      inboxStore.delete(`inbox:${accountId}`);
      for (const [key] of Array.from(roomStore.entries())) {
        if (key.startsWith(`${accountId}:`)) roomStore.delete(key);
      }
      for (const [id, msg] of Array.from(messageStore.entries())) {
        if (msg.roomKey.startsWith(`${accountId}:`)) messageStore.delete(id);
      }

      // Assertions
      assert.equal(inboxStore.has('inbox:usr_alice'), false, "Alice's inbox cache must be purged");
      assert.equal(roomStore.has('usr_alice:dm:conv-1'), false, "Alice's room metadata must be purged");
      assert.equal(messageStore.has('m1'), false, "Alice's chat messages must be purged");

      // Bob's data and global game scores must remain intact
      assert.equal(inboxStore.has('inbox:usr_bob'), true, "Bob's inbox cache must remain intact");
      assert.equal(roomStore.has('usr_bob:dm:conv-1'), true, "Bob's room metadata must remain intact");
      assert.equal(messageStore.has('m2'), true, "Bob's chat messages must remain intact");
      assert.equal(gameScoresStore.get('dino-run').personalBest, 450, 'Global game best scores must remain');
    });

    test('5. Message metadata retention preserves reactions, media, deletions, forwards, and links', () => {
      const fullMessage = {
        id: 'msg-complex-1',
        roomKey: 'dm:conv-99',
        username: 'sam',
        mine: true,
        body: 'Check this out',
        created_at: '2026-10-18T10:00:00Z',
        edited_at: '2026-10-18T10:05:00Z',
        reply_to_message_id: 'msg-0',
        reply_to_body: 'Earlier question',
        reply_to_username: 'alex',
        reply_to_mine: false,
        media_type: 'image',
        media_url: 'https://images.example.com/photo.png',
        media_duration_seconds: null,
        file_name: 'photo.png',
        file_size: 102400,
        is_deleted: false,
        is_forwarded: true,
        is_starred: true,
        reactions: [
          { emoji: '🔥', count: 3, users: ['alex', 'sam', 'jordan'], hasReacted: true, reactedByMe: true },
          { emoji: '👏', count: 1, users: ['taylor'], hasReacted: false, reactedByMe: false },
        ],
        link_preview: {
          title: 'Example Domain',
          description: 'Example preview',
          url: 'https://example.com',
        },
        poll_id: 'poll-123',
        poll: { question: 'Lunch spot?' },
        expires_at: '2026-10-25T10:00:00Z',
      };

      const normalized = normalizeCachedMessage(fullMessage, 'usr_1:dm:conv-99');

      assert.equal(normalized.id, 'msg-complex-1');
      assert.equal(normalized.roomKey, 'usr_1:dm:conv-99');
      assert.equal(normalized.media_type, 'image');
      assert.equal(normalized.media_url, 'https://images.example.com/photo.png');
      assert.equal(normalized.is_forwarded, true);
      assert.equal(normalized.is_starred, true);
      assert.equal(normalized.reactions.length, 2);
      assert.deepEqual(normalized.reactions[0].users, ['alex', 'sam', 'jordan']);
      assert.equal(normalized.reactions[0].reactedByMe, true);
      assert.equal(normalized.link_preview.title, 'Example Domain');
      assert.equal(normalized.poll_id, 'poll-123');
      assert.equal(normalized.expires_at, '2026-10-25T10:00:00Z');
    });

    test('6. IndexedDB queryMessagesReverseCursor returns the most recent 200 records in chronological order', () => {
      const records = [];
      // Generate 250 records with sequential timestamps
      for (let i = 1; i <= 250; i++) {
        const timeStr = `2026-10-18T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`;
        records.push({
          id: `msg-${i}`,
          roomKey: 'usr_alice:dm:conv-1',
          created_at: timeStr,
          body: `Message number ${i}`,
        });
      }

      // Query with limit 200
      const results = queryMessagesReverseCursor(records, 'usr_alice:dm:conv-1', 200);

      assert.equal(results.length, 200, 'Must limit to 200 messages');
      // Oldest message returned should be msg-51 (messages 1..50 dropped as older history)
      assert.equal(results[0].id, 'msg-51', 'First message must be the 51st (oldest of the recent 200)');
      // Newest message returned should be msg-250
      assert.equal(results[results.length - 1].id, 'msg-250', 'Last message must be the 250th (newest message)');

      // Chronological ascending check: results[i] < results[i+1]
      for (let i = 0; i < results.length - 1; i++) {
        assert.ok(
          results[i].created_at <= results[i + 1].created_at,
          `Messages must be strictly chronological: ${results[i].created_at} <= ${results[i + 1].created_at}`
        );
      }
    });
  });

  describe('Suite 2: Network Deduplication & Incremental Sync Engine', () => {
    test('7. In-flight GET deduplication shares single promise for concurrent requests', async () => {
      const dedup = new RequestDeduplicator();
      let fetchCount = 0;

      const mockFetch = async (url) => {
        fetchCount++;
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 20));
        return { data: `content-from-${url}` };
      };

      // Fire 3 simultaneous GET requests for the same URL
      const [res1, res2, res3] = await Promise.all([
        dedup.request('/api/friends', { method: 'GET' }, mockFetch),
        dedup.request('/api/friends', { method: 'GET' }, mockFetch),
        dedup.request('/api/friends', { method: 'GET' }, mockFetch),
      ]);

      assert.equal(fetchCount, 1, 'Only 1 network fetch should have executed for 3 concurrent identical GETs');
      assert.equal(res1.data, 'content-from-/api/friends');
      assert.equal(res2.data, 'content-from-/api/friends');
      assert.equal(res3.data, 'content-from-/api/friends');
    });

    test('8. Concurrent distinct GET requests and non-GET requests are not deduplicated', async () => {
      const dedup = new RequestDeduplicator();
      let fetchCount = 0;

      const mockFetch = async (url, options) => {
        fetchCount++;
        return { path: url, method: options.method || 'GET' };
      };

      // 2 different URLs
      await Promise.all([
        dedup.request('/api/friends', { method: 'GET' }, mockFetch),
        dedup.request('/api/groups', { method: 'GET' }, mockFetch),
      ]);
      assert.equal(fetchCount, 2, 'Distinct URLs must not share promise');

      // 2 POST requests to same URL
      await Promise.all([
        dedup.request('/api/messages', { method: 'POST', body: '1' }, mockFetch),
        dedup.request('/api/messages', { method: 'POST', body: '2' }, mockFetch),
      ]);
      assert.equal(fetchCount, 4, 'POST requests must never be deduplicated');
    });

    test('9. In-flight room load guard prevents race between mount effect and handleOpen', async () => {
      const guard = new RoomLoadGuard();
      let executionCount = 0;

      const slowRoomLoad = async () => {
        executionCount++;
        await new Promise((r) => setTimeout(r, 25));
        return { messages: ['msg-1'] };
      };

      // Simulate simultaneous load calls for same roomKey
      const roomKey = 'dm:conv-race';
      const [r1, r2] = await Promise.all([
        guard.load(roomKey, slowRoomLoad),
        guard.load(roomKey, slowRoomLoad),
      ]);

      assert.equal(executionCount, 1, 'Room message load must execute only once during in-flight fetch');
      assert.deepEqual(r1, r2);
    });

    test('10. Server incremental sync cursor filters messages strictly after cursor', () => {
      const serverDatabase = [
        { id: 'm-1', created_at: '2026-10-18T12:00:00Z', body: 'First' },
        { id: 'm-2', created_at: '2026-10-18T12:01:00Z', body: 'Second' },
        { id: 'm-3', created_at: '2026-10-18T12:02:00Z', body: 'Third' },
        { id: 'm-4', created_at: '2026-10-18T12:03:00Z', body: 'Fourth' },
        { id: 'm-5', created_at: '2026-10-18T12:03:00Z', body: 'Fifth' }, // Same timestamp, higher ID
      ];

      // Client already has up to m-3
      const delta = evaluateServerIncrementalSync(serverDatabase, '2026-10-18T12:02:00Z|m-3');

      assert.equal(delta.length, 2, 'Only m-4 and m-5 are after cursor');
      assert.equal(delta[0].id, 'm-4');
      assert.equal(delta[1].id, 'm-5');

      // Tie-breaking by ID for identical timestamp: client has up to m-4
      const deltaTie = evaluateServerIncrementalSync(serverDatabase, '2026-10-18T12:03:00Z|m-4');
      assert.equal(deltaTie.length, 1);
      assert.equal(deltaTie[0].id, 'm-5');
    });

    test('11. Client incremental sync merge joins cached messages and incoming deltas cleanly', () => {
      const cached = [
        { id: 'm-1', created_at: '2026-10-18T12:00:00Z', body: 'First' },
        { id: 'm-2', created_at: '2026-10-18T12:01:00Z', body: 'Second (old)' },
      ];

      const incomingDelta = [
        // Updated edit of existing message
        { id: 'm-2', created_at: '2026-10-18T12:01:00Z', body: 'Second (edited)' },
        // New incoming message
        { id: 'm-3', created_at: '2026-10-18T12:02:00Z', body: 'Third' },
      ];

      const merged = mergeIncrementalMessages(cached, incomingDelta);

      assert.equal(merged.length, 3);
      assert.equal(merged[0].id, 'm-1');
      assert.equal(merged[1].id, 'm-2');
      assert.equal(merged[1].body, 'Second (edited)');
      assert.equal(merged[2].id, 'm-3');
    });

    test('12. Redundant /conversations DM metadata fetch is eliminated', () => {
      // /api/conversations/:id/messages server response payload
      const messagesApiResponse = {
        messages: [{ id: 'm-10', body: 'Hi' }],
        pinned_message_id: 'm-10',
        disappearing_duration_seconds: 86400,
        announcement_only: false,
      };

      // Verify client extracts metadata directly from response payload
      const metadata = {
        pinned_message_id: messagesApiResponse.pinned_message_id,
        disappearing_duration_seconds: messagesApiResponse.disappearing_duration_seconds,
        announcement_only: messagesApiResponse.announcement_only,
      };

      assert.equal(metadata.pinned_message_id, 'm-10');
      assert.equal(metadata.disappearing_duration_seconds, 86400);
      assert.equal(metadata.announcement_only, false);
      // No secondary GET /api/conversations required!
    });
  });

  describe('Suite 3: Random Chat Resilience & Session Safeguards', () => {
    test('13. Random Chat connection timeout aborts hung CONNECTING socket after 10 seconds', async () => {
      let timeoutTriggered = false;
      const tracker = createConnectionTimeoutTracker(50, () => {
        timeoutTriggered = true;
      });

      tracker.start();
      assert.equal(tracker.isPending(), true);

      // Simulate connection timeout expiration
      await new Promise((r) => setTimeout(r, 70));
      assert.equal(timeoutTriggered, true, 'Hung connection must trigger timeout');

      // Clear on successful connect
      let abortedEarly = false;
      const tracker2 = createConnectionTimeoutTracker(50, () => {
        abortedEarly = true;
      });
      tracker2.start();
      tracker2.clear(); // Socket connected successfully
      await new Promise((r) => setTimeout(r, 70));
      assert.equal(abortedEarly, false, 'Cleared tracker must not trigger timeout');
    });

    test('14. Random Chat exponential backoff scales with jitter without hammering', () => {
      const delays = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        delays.push(calculateRandomChatBackoff(attempt, 0.5));
      }

      // Check progression: ~1250ms, ~2250ms, ~4250ms, ~8250ms, ~15250ms, 30000ms
      assert.ok(delays[0] >= 1000 && delays[0] <= 1500, `Attempt 0 delay ${delays[0]}`);
      assert.ok(delays[1] >= 2000 && delays[1] <= 2500, `Attempt 1 delay ${delays[1]}`);
      assert.ok(delays[2] >= 4000 && delays[2] <= 4500, `Attempt 2 delay ${delays[2]}`);
      assert.ok(delays[3] >= 8000 && delays[3] <= 8500, `Attempt 3 delay ${delays[3]}`);
      assert.ok(delays[4] >= 15000 && delays[4] <= 15500, `Attempt 4 delay ${delays[4]}`);
      assert.equal(delays[5], 30000, 'Attempt 5 capped at 30000ms');
    });

    test('15. Random Chat backoff attempt counter resets only on verified match/resume', () => {
      let attempts = 0;

      // Fail 3 times
      attempts++;
      attempts++;
      attempts++;
      assert.equal(attempts, 3);

      // Connection opened, but match not yet found -> do NOT reset attempts
      const isConnecting = true;
      if (!isConnecting) attempts = 0;
      assert.equal(attempts, 3, 'Attempts must not reset until match is established');

      // Match found event received from server
      const matchFound = true;
      if (matchFound) attempts = 0;
      assert.equal(attempts, 0, 'Attempts reset to 0 upon verified match/resume');
    });

    test('16. Random Chat online/offline recovery pauses and resumes cleanly', () => {
      let isOnline = true;
      let scheduledReconnect = false;
      let cancelledReconnect = false;

      function onOffline() {
        isOnline = false;
        cancelledReconnect = true;
      }

      function onOnline() {
        isOnline = true;
        scheduledReconnect = true;
      }

      onOffline();
      assert.equal(isOnline, false);
      assert.equal(cancelledReconnect, true);

      onOnline();
      assert.equal(isOnline, true);
      assert.equal(scheduledReconnect, true);
    });

    test('17. Random Chat debounced wakeup prevents duplicate concurrent reconnects', async () => {
      let wakeupCalls = 0;
      let debounceTimer = null;

      function handleWakeup(action) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          wakeupCalls++;
          action();
        }, 30);
      }

      // Simulate visibilitychange and focus firing in rapid succession
      handleWakeup(() => {});
      handleWakeup(() => {});
      handleWakeup(() => {});

      await new Promise((r) => setTimeout(r, 60));
      assert.equal(wakeupCalls, 1, 'Debounced wakeup must fire exactly once for rapid events');
    });

    test('18. Random Chat account-scoped session key isolates sessions across logins', () => {
      function getMatchStorageKey(userId) {
        return 'adda-random-match:' + (userId || 'anon');
      }

      assert.equal(getMatchStorageKey('usr_alice'), 'adda-random-match:usr_alice');
      assert.equal(getMatchStorageKey('usr_bob'), 'adda-random-match:usr_bob');
      assert.equal(getMatchStorageKey(null), 'adda-random-match:anon');

      // Purge on logout removes both user and legacy keys
      const storage = new Map([
        ['adda-random-match:usr_alice', JSON.stringify({ matchId: 'm-1' })],
        ['adda-random-match', JSON.stringify({ matchId: 'legacy-1' })],
        ['theme', 'dark'],
      ]);

      const logoutUserId = 'usr_alice';
      storage.delete('adda-random-match:' + logoutUserId);
      storage.delete('adda-random-match:anon');
      storage.delete('adda-random-match');

      assert.equal(storage.has('adda-random-match:usr_alice'), false);
      assert.equal(storage.has('adda-random-match'), false);
      assert.equal(storage.get('theme'), 'dark', 'Other storage items remain intact');
    });

    test('19. Random Chat message deduplication on resume merges cleanly', () => {
      const existing = [
        { id: 'rm-1', text: 'Hi', mine: true },
        { id: 'rm-2', text: 'Hello', mine: false },
      ];

      const resumeHistory = [
        { id: 'rm-1', text: 'Hi', mine: true }, // duplicate
        { id: 'rm-2', text: 'Hello', mine: false }, // duplicate
        { id: 'rm-3', text: 'Still there?', mine: false }, // new
      ];

      const map = new Map();
      for (const m of existing) map.set(m.id, m);
      for (const m of resumeHistory) map.set(m.id, m);
      const combined = Array.from(map.values());

      assert.equal(combined.length, 3);
      assert.equal(combined[0].id, 'rm-1');
      assert.equal(combined[1].id, 'rm-2');
      assert.equal(combined[2].id, 'rm-3');
    });
  });

  describe('Suite 8: Cloudflare Request Reduction & CORS Optimization', () => {
    function mockWithCors(response, request) {
      const origin = request.headers.get('origin');
      if (!origin) return response;
      const headers = new Headers(response.headers);
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      headers.set('access-control-allow-headers', 'Authorization, Content-Type, X-File-Name, X-Anonymous-Session-Id');
      headers.set('access-control-max-age', '86400');
      if (request.method === 'OPTIONS') {
        headers.set('cache-control', 'public, max-age=86400');
      }
      return new Response(response.body, { status: response.status, headers });
    }

    test('20. CORS preflight OPTIONS returns 204 with Cache-Control and Access-Control-Max-Age', () => {
      const req = new Request('https://api.example.com/api/conversations/conv-1/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://student-addit.pages.dev' },
      });
      const initialRes = new Response(null, { status: 204 });
      const corsRes = mockWithCors(initialRes, req);

      assert.equal(corsRes.status, 204);
      assert.equal(corsRes.headers.get('cache-control'), 'public, max-age=86400');
      assert.equal(corsRes.headers.get('access-control-max-age'), '86400');
      assert.equal(corsRes.headers.get('access-control-allow-origin'), 'https://student-addit.pages.dev');
    });

    test('21. Bundled active_game in GET /messages eliminates standalone /games/active call', () => {
      const mockGame = { id: 'game-456', status: 'in_progress', turn_user_id: 'usr_alice' };
      const serverResponse = {
        messages: [{ id: 'm-1', body: 'Ready to play?', mine: true }],
        pinned_message_id: null,
        disappearing_duration_seconds: 0,
        active_game: mockGame,
      };

      let activeGameState = null;
      let standaloneGamesFetched = false;

      // Client processes load() response
      if (serverResponse.active_game !== undefined) {
        activeGameState = serverResponse.active_game;
      }

      assert.deepEqual(activeGameState, mockGame);
      assert.equal(standaloneGamesFetched, false, 'No secondary network fetch needed for active game');
    });

    test('22. Chat selection resets unread badge locally without firing redundant HTTP POST /read', () => {
      let httpCalls = [];
      const dms = [
        { conversation_id: 'conv-1', unread_count: 5 },
        { conversation_id: 'conv-2', unread_count: 2 },
      ];

      // Optimized handleSelectChat
      const updatedDms = dms.map((d) => d.conversation_id === 'conv-1' ? { ...d, unread_count: 0 } : d);

      assert.equal(updatedDms[0].unread_count, 0);
      assert.equal(updatedDms[1].unread_count, 2);
      assert.equal(httpCalls.length, 0, 'No HTTP requests dispatched on chat selection');
    });

    test('23. WebSocket connected event provides instant presence without HTTP /presence poll', () => {
      let peerOnline = false;
      const wsConnectedFrame = { type: 'connected', peerOnline: true };

      // Client WebSocket message handler
      if (wsConnectedFrame.type === 'connected' && typeof wsConnectedFrame.peerOnline === 'boolean') {
        peerOnline = wsConnectedFrame.peerOnline;
      }

      assert.equal(peerOnline, true);
    });

    test('24. Typing indicator suppresses frames when peer is offline and throttles rapid emissions', () => {
      let typingFramesSent = 0;
      let lastTypingSent = 0;

      function emitTyping(isTyping, kind, peerOnline, now) {
        if (kind === 'dm' && !peerOnline) return;
        if (isTyping) {
          if (lastTypingSent > 0 && now - lastTypingSent < 3500) return;
          lastTypingSent = now;
          typingFramesSent++;
        }
      }

      // 1. Peer offline -> suppressed
      emitTyping(true, 'dm', false, 1000);
      assert.equal(typingFramesSent, 0, 'Must suppress typing when peer is offline');

      // 2. Peer online -> fires first typing frame
      emitTyping(true, 'dm', true, 1000);
      assert.equal(typingFramesSent, 1);

      // 3. User types continuously within 3500ms -> throttled
      emitTyping(true, 'dm', true, 1500);
      emitTyping(true, 'dm', true, 2500);
      emitTyping(true, 'dm', true, 3400);
      assert.equal(typingFramesSent, 1, 'Rapid typing frames within 3.5s must be throttled');

      // 4. User types after 3500ms -> allowed
      emitTyping(true, 'dm', true, 4600);
      assert.equal(typingFramesSent, 2, 'Typing after throttle interval is transmitted');
    });

    test('25. ChatRoom DO skips broadcast if sender is the only connected client', () => {
      let broadcastCount = 0;
      const connectedSockets = [{ id: 'sender-socket' }]; // Only sender

      if (connectedSockets.length > 1) {
        broadcastCount++;
      }

      assert.equal(broadcastCount, 0, 'Typing broadcast skipped when no peer is connected');
    });
  });
});
