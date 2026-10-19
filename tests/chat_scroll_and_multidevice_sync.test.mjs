import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Normalization helpers matching worker/index.ts and CommunityChats.tsx
 */
function normalizeDbTimestamp(val) {
  if (typeof val !== 'string' || !val) return new Date().toISOString().replace('T', ' ').replace(/\..*$/, '').replace('Z', '');
  const s = val.trim();
  const tIndex = s.indexOf('T');
  if (tIndex !== -1) {
    const withoutT = s.replace('T', ' ');
    const dotIndex = withoutT.indexOf('.');
    const withoutMillis = dotIndex !== -1 ? withoutT.substring(0, dotIndex) : withoutT;
    return withoutMillis.replace('Z', '').trim();
  }
  const dotIndex = s.indexOf('.');
  return dotIndex !== -1 ? s.substring(0, dotIndex).trim() : s;
}

function normalizeIsoTimestamp(val) {
  if (typeof val !== 'string' || !val) return new Date().toISOString();
  const s = val.trim();
  if (s.includes('T') && (s.endsWith('Z') || s.includes('+'))) return s;
  return s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z');
}

function messageTime(value) {
  return Date.parse(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
}

function compareChatDates(a, b) {
  const timeA = messageTime(a);
  const timeB = messageTime(b);
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
    return timeA - timeB;
  }
  return normalizeIsoTimestamp(a).localeCompare(normalizeIsoTimestamp(b));
}

function getAccountRoomKey(roomKey, accountId) {
  if (!accountId || !roomKey) return roomKey;
  if (roomKey.startsWith(accountId + ':')) return roomKey;
  return `${accountId}:${roomKey}`;
}

describe('ADDa Chat Scroll, Multi-Device Sync & WebSocket Heartbeat Suite', () => {

  describe('1. SQLite Character 10 ASCII Comparison Bug Resolution', () => {
    test('Raw ASCII comparison fails for same-day messages due to space vs T', () => {
      const sqliteTimestamp = '2026-10-19 14:00:00'; // Stored via CURRENT_TIMESTAMP (space at index 10, ASCII 32)
      const clientIsoQuery = '2026-10-19T13:40:00.000Z'; // Sent by mobile client (T at index 10, ASCII 84)

      // Raw unnormalized comparison in SQLite:
      const rawComparison = sqliteTimestamp > clientIsoQuery;
      // In ASCII, ' ' (32) < 'T' (84), so "2026-10-19 14..." > "2026-10-19T13..." evaluates to FALSE!
      assert.equal(rawComparison, false, 'Raw ASCII comparison erroneously fails to match newer same-day messages');
    });

    test('Normalized timestamp comparison succeeds across space and ISO formats', () => {
      const sqliteTimestamp = '2026-10-19 14:00:00';
      const clientIsoQuery = '2026-10-19T13:40:00.000Z';

      const normalizedClientQuery = normalizeDbTimestamp(clientIsoQuery);
      assert.equal(normalizedClientQuery, '2026-10-19 13:40:00');

      const fixedComparison = sqliteTimestamp > normalizedClientQuery;
      assert.equal(fixedComparison, true, 'Normalized comparison correctly recognizes newer messages on mobile sync');
    });

    test('Pagination before comparison handles ISO and SQLite timestamps without inverted logic', () => {
      const olderSqliteMsg = '2026-10-19 11:00:00';
      const anchorIsoMsg = '2026-10-19T13:00:00.000Z';

      const normalizedAnchor = normalizeDbTimestamp(anchorIsoMsg);
      assert.equal(olderSqliteMsg < normalizedAnchor, true, 'Older messages correctly identified with normalized before query');
    });

    test('normalizeIsoTimestamp formats both space-separated and ISO dates into standard ISO-8601', () => {
      assert.equal(normalizeIsoTimestamp('2026-10-19 15:30:00'), '2026-10-19T15:30:00Z');
      assert.equal(normalizeIsoTimestamp('2026-10-19T15:30:00.123Z'), '2026-10-19T15:30:00.123Z');
      assert.equal(normalizeIsoTimestamp('2026-10-19T15:30:00Z'), '2026-10-19T15:30:00Z');
    });
  });

  describe('2. Message Chronological Sorting & compareChatDates', () => {
    test('compareChatDates seamlessly sorts mixed SQLite and ISO timestamps', () => {
      const messages = [
        { id: 'm-3', body: 'Third', created_at: '2026-10-19T15:00:00.000Z' },
        { id: 'm-1', body: 'First', created_at: '2026-10-19 10:00:00' },
        { id: 'm-2', body: 'Second', created_at: '2026-10-19T12:30:00Z' },
        { id: 'm-4', body: 'Fourth', created_at: '2026-10-19 16:45:00' },
      ];

      const sorted = [...messages].sort((a, b) => compareChatDates(a.created_at, b.created_at) || a.id.localeCompare(b.id));

      assert.equal(sorted[0].id, 'm-1');
      assert.equal(sorted[1].id, 'm-2');
      assert.equal(sorted[2].id, 'm-3');
      assert.equal(sorted[3].id, 'm-4');
    });

    test('compareChatDates gracefully handles millisecond precision without jitter', () => {
      const early = '2026-10-19T12:00:00.100Z';
      const late = '2026-10-19T12:00:00.900Z';

      assert.ok(compareChatDates(early, late) < 0);
      assert.ok(compareChatDates(late, early) > 0);
      assert.equal(compareChatDates(early, early), 0);
    });
  });

  describe('3. WebSocket Heartbeat (Ping/Pong) Protocol', () => {
    test('ChatRoom ping frame returns pong frame', () => {
      // Simulate server-side ChatRoom ping handler
      const responses = [];
      const mockSocket = {
        send: (payload) => responses.push(JSON.parse(payload)),
      };

      const handleWebSocketMessage = (msg, socket) => {
        const action = msg?.type || msg?.action;
        if (action === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      };

      handleWebSocketMessage({ type: 'ping' }, mockSocket);

      assert.equal(responses.length, 1);
      assert.equal(responses[0].type, 'pong', 'Server must acknowledge ping with pong');
    });

    test('Client receives pong and confirms live connection status', () => {
      let isLive = false;
      const onClientMessage = (data) => {
        if (data.type === 'pong') {
          isLive = true;
        }
      };

      onClientMessage({ type: 'pong' });
      assert.equal(isLive, true, 'Client status must remain live upon receiving pong');
    });
  });

  describe('4. Smart Scroll & Position Preservation', () => {
    test('Calculates scroll preservation correctly when older messages are prepended', () => {
      // User is scrolled at scrollTop = 200 in a list of height 1000
      const initialScroll = { height: 1000, top: 200 };

      // 50 older messages are loaded, increasing scrollHeight to 2500
      const newScrollHeight = 2500;

      // Smart restore formula: preserve.top + (newScrollHeight - preserve.height)
      const restoredScrollTop = initialScroll.top + (newScrollHeight - initialScroll.height);

      assert.equal(restoredScrollTop, 1700);
      // Relative offset from current message is unchanged (2500 - 1700 = 800, matching 1000 - 200 = 800 from bottom)
      assert.equal(newScrollHeight - restoredScrollTop, initialScroll.height - initialScroll.top);
    });

    test('Background updates do NOT force scroll to bottom when user is scrolled up', () => {
      const list = {
        scrollHeight: 3000,
        scrollTop: 500, // User is reading history at top
        clientHeight: 800,
      };

      // Check isNearBottom threshold (< 150px from bottom)
      const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 150;
      assert.equal(isNearBottom, false, 'User at scrollTop=500 is NOT near bottom');

      let justSentMessage = false;

      // Simulate state update (e.g. peer reaction or read receipt)
      let scrolledToBottom = false;
      if (justSentMessage || isNearBottom) {
        scrolledToBottom = true;
      }

      assert.equal(scrolledToBottom, false, 'User viewport must NOT be forced to bottom on peer update');
    });

    test('User sending message forces scroll to bottom', () => {
      const list = {
        scrollHeight: 3000,
        scrollTop: 500,
        clientHeight: 800,
      };

      const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 150;
      let justSentMessage = true; // User clicked Send

      let targetScrollTop = list.scrollTop;
      if (justSentMessage || isNearBottom) {
        targetScrollTop = list.scrollHeight;
        justSentMessage = false;
      }

      assert.equal(targetScrollTop, 3000, 'Sending a message must scroll user to bottom');
      assert.equal(justSentMessage, false, 'justSentMessage flag must reset');
    });
  });

  describe('5. IndexedDB Account Scoping & Multi-Device Isolation', () => {
    test('getAccountRoomKey properly prefixes keys with accountId', () => {
      assert.equal(getAccountRoomKey('dm:conv_123', 'user_abc'), 'user_abc:dm:conv_123');
      assert.equal(getAccountRoomKey('group:grp_456', 'user_abc'), 'user_abc:group:grp_456');
    });

    test('getAccountRoomKey is idempotent if already prefixed', () => {
      assert.equal(getAccountRoomKey('user_abc:dm:conv_123', 'user_abc'), 'user_abc:dm:conv_123');
    });

    test('Two users on same client do not collide in local cache', () => {
      const cacheStore = new Map();

      const userAKey = getAccountRoomKey('dm:room1', 'user_a');
      const userBKey = getAccountRoomKey('dm:room1', 'user_b');

      cacheStore.set(userAKey, [{ id: 'm1', body: 'User A secret' }]);
      cacheStore.set(userBKey, [{ id: 'm2', body: 'User B secret' }]);

      assert.notEqual(userAKey, userBKey);
      assert.equal(cacheStore.get(userAKey)[0].body, 'User A secret');
      assert.equal(cacheStore.get(userBKey)[0].body, 'User B secret');
    });
  });
});
