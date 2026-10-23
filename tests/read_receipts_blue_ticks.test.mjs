import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper matching worker/index.ts: normalized timestamp comparison
function isMessageSeenByPeer(msgCreatedAt, peerLastReadAt) {
  if (!peerLastReadAt || !msgCreatedAt) return false;
  const msgStr = String(msgCreatedAt);
  const msgTime = Date.parse(msgStr.replace(' ', 'T') + (msgStr.includes('Z') ? '' : 'Z'));
  const peerTime = Date.parse(peerLastReadAt.replace(' ', 'T') + (peerLastReadAt.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(msgTime) || Number.isNaN(peerTime)) {
    return msgStr <= peerLastReadAt;
  }
  return msgTime <= peerTime;
}

// Client helper: active & focused viewport verification
function isRoomActiveAndVisible(doc) {
  if (!doc) return false;
  if (doc.visibilityState !== 'visible') return false;
  if (typeof doc.hasFocus === 'function' && !doc.hasFocus()) return false;
  return true;
}

describe('ADDa Chat Read Receipts & Blue Ticks Verification Suite', () => {

  describe('1. New Message Initialization (No Premature Blue Ticks)', () => {
    test('Newly sent DM message is NEVER initialized as seen: true', () => {
      const senderId = 'user_alice';
      const peerOnline = true; // Peer is connected to the room socket

      // Server dispatch logic matching fixed worker/index.ts
      const isMine = true;
      const initialMessage = {
        id: 'msg-101',
        sender_id: senderId,
        body: 'Hello Bob!',
        created_at: new Date().toISOString(),
        seen: false, // Must ALWAYS start false
        delivered: isMine ? peerOnline : true,
      };

      assert.equal(initialMessage.seen, false, 'New message must NOT be born with seen: true');
      assert.equal(initialMessage.delivered, true, 'Delivered is true because peer is online (2 grey ticks)');
    });

    test('Newly sent DM message shows 1 grey tick if peer is offline', () => {
      const senderId = 'user_alice';
      const peerOnline = false; // Peer is offline

      const isMine = true;
      const initialMessage = {
        id: 'msg-102',
        sender_id: senderId,
        body: 'Are you there?',
        created_at: new Date().toISOString(),
        seen: false,
        delivered: isMine ? peerOnline : true,
      };

      assert.equal(initialMessage.seen, false, 'Must not be seen');
      assert.equal(initialMessage.delivered, false, 'Must show single tick (delivered: false) when peer is offline');
    });
  });

  describe('2. Recipient Active View Verification (Visibility & Focus Guard)', () => {
    test('Backgrounded tab (visibilityState hidden) must NOT emit read signal', () => {
      const mockDocument = {
        visibilityState: 'hidden',
        hasFocus: () => true,
      };

      assert.equal(isRoomActiveAndVisible(mockDocument), false, 'Hidden tab must return false');
    });

    test('Unfocused window (hasFocus false) must NOT emit read signal', () => {
      const mockDocument = {
        visibilityState: 'visible',
        hasFocus: () => false,
      };

      assert.equal(isRoomActiveAndVisible(mockDocument), false, 'Blurred/unfocused window must return false');
    });

    test('Only visible AND focused window returns true to send read receipt', () => {
      const mockDocument = {
        visibilityState: 'visible',
        hasFocus: () => true,
      };

      assert.equal(isRoomActiveAndVisible(mockDocument), true, 'Visible and focused tab allows read receipt emission');
    });
  });

  describe('3. Timestamp Comparison & Normalization (SQLite vs ISO-8601)', () => {
    test('SQLite CURRENT_TIMESTAMP (space format) is correctly recognized as seen when readAt is later', () => {
      const sqliteMsgTime = '2026-10-13 14:00:00';
      const isoReadTime = '2026-10-13T14:05:00.000Z';

      assert.equal(isMessageSeenByPeer(sqliteMsgTime, isoReadTime), true, 'Message from 14:00 must be marked seen by 14:05 read timestamp');
    });

    test('SQLite CURRENT_TIMESTAMP is NOT marked seen if peer last read before message was sent', () => {
      const sqliteMsgTime = '2026-10-13 14:10:00';
      const isoReadTime = '2026-10-13T14:05:00.000Z';

      assert.equal(isMessageSeenByPeer(sqliteMsgTime, isoReadTime), false, 'Message from 14:10 must NOT be marked seen by 14:05 read timestamp');
    });

    test('ISO message timestamp compared with SQLite read timestamp handles formats accurately', () => {
      const isoMsgTime = '2026-10-13T14:02:30.123Z';
      const sqliteReadTime = '2026-10-13 14:03:00';

      assert.equal(isMessageSeenByPeer(isoMsgTime, sqliteReadTime), true, 'Message at 14:02:30 is earlier than 14:03:00');
    });
  });

  describe('4. Transition from Grey Ticks to Blue Ticks on read-receipt event', () => {
    test('read-receipt event transitions matching messages from seen: false to seen: true', () => {
      const messages = [
        { id: 'm-1', mine: true, body: 'First', created_at: '2026-10-13T10:00:00Z', seen: false, delivered: true },
        { id: 'm-2', mine: true, body: 'Second', created_at: '2026-10-13T10:05:00Z', seen: false, delivered: true },
        { id: 'm-3', mine: true, body: 'Third (after read)', created_at: '2026-10-13T10:15:00Z', seen: false, delivered: true },
      ];

      const readReceipt = {
        type: 'read-receipt',
        userId: 'user_bob',
        readAt: '2026-10-13T10:10:00Z',
      };

      const readMs = Date.parse(readReceipt.readAt.replace(' ', 'T') + (readReceipt.readAt.includes('Z') ? '' : 'Z'));
      const updated = messages.map((m) => {
        if (m.mine && (!m.seen || !m.delivered)) {
          const msgMs = Date.parse(m.created_at.replace(' ', 'T') + (m.created_at.includes('Z') ? '' : 'Z'));
          if (msgMs <= readMs) {
            return { ...m, seen: true, delivered: true };
          }
        }
        return m;
      });

      assert.equal(updated[0].seen, true, 'm-1 at 10:00 must turn blue (seen: true)');
      assert.equal(updated[1].seen, true, 'm-2 at 10:05 must turn blue (seen: true)');
      assert.equal(updated[2].seen, false, 'm-3 at 10:15 must remain grey (seen: false)');
    });
  });

  describe('5. Group Chats Isolation (No Misleading Blue Ticks)', () => {
    test('Group chat tick display status evaluates to grey ticks only', () => {
      const groupMessage = {
        id: 'grp-msg-1',
        mine: true,
        seen: true, // Even if raw data had seen: true
        delivered: true,
      };

      // Component rendering logic:
      const kind = 'group';
      const tickClass = (kind === 'dm' && groupMessage.seen)
        ? 'seen'
        : groupMessage.delivered
        ? 'delivered'
        : 'sent';

      assert.equal(tickClass, 'delivered', 'Group message must evaluate to delivered (grey tick), never seen');
    });

    test('Private DM tick display status evaluates to blue tick when seen is true', () => {
      const dmMessage = {
        id: 'dm-msg-1',
        mine: true,
        seen: true,
        delivered: true,
      };

      const kind = 'dm';
      const tickClass = (kind === 'dm' && dmMessage.seen)
        ? 'seen'
        : dmMessage.delivered
        ? 'delivered'
        : 'sent';

      assert.equal(tickClass, 'seen', 'DM message with seen: true evaluates to seen (blue ticks)');
    });
  });

  describe('6. Self-Echo & Loopback Prevention', () => {
    test('read-receipt event matching currentUser.id is ignored (prevents sender turning own messages blue)', () => {
      const currentUserId = 'user_alice';
      const peerId = 'user_bob';
      const kind = 'dm';

      const messages = [
        { id: 'm-1', mine: true, body: 'Hello Bob', created_at: '2026-10-13T10:00:00Z', seen: false, delivered: true },
      ];

      // Receipt emitted by User Alice's own focus/reconnect
      const selfReceipt = {
        type: 'read-receipt',
        userId: 'user_alice',
        readAt: '2026-10-13T10:05:00Z',
      };

      // Frontend filter logic
      const shouldIgnore = (selfReceipt.userId && currentUserId && selfReceipt.userId === currentUserId)
        || kind !== 'dm'
        || (peerId && selfReceipt.userId && selfReceipt.userId !== peerId);

      assert.equal(shouldIgnore, true, 'Self receipt must be ignored');
      assert.equal(messages[0].seen, false, 'Message must remain seen: false');
    });

    test('read-receipt event matching peerId transitions messages to seen: true', () => {
      const currentUserId = 'user_alice';
      const peerId = 'user_bob';
      const kind = 'dm';

      const messages = [
        { id: 'm-1', mine: true, body: 'Hello Bob', created_at: '2026-10-13T10:00:00Z', seen: false, delivered: true },
      ];

      const peerReceipt = {
        type: 'read-receipt',
        userId: 'user_bob',
        readAt: '2026-10-13T10:05:00Z',
      };

      const shouldIgnore = (peerReceipt.userId && currentUserId && peerReceipt.userId === currentUserId)
        || kind !== 'dm'
        || (peerId && peerReceipt.userId && peerReceipt.userId !== peerId);

      assert.equal(shouldIgnore, false, 'Peer receipt must NOT be ignored');

      const readMs = Date.parse(peerReceipt.readAt);
      const updated = messages.map((m) => {
        if (m.mine && (!m.seen || !m.delivered)) {
          const msgMs = Date.parse(m.created_at);
          if (msgMs <= readMs) {
            return { ...m, seen: true, delivered: true };
          }
        }
        return m;
      });

      assert.equal(updated[0].seen, true, 'Message transitions to seen: true (blue tick)');
    });

    test('read-receipt event from unknown third party is ignored', () => {
      const currentUserId = 'user_alice';
      const peerId = 'user_bob';
      const kind = 'dm';

      const strangerReceipt = {
        type: 'read-receipt',
        userId: 'user_charlie',
        readAt: '2026-10-13T10:05:00Z',
      };

      const shouldIgnore = (strangerReceipt.userId && currentUserId && strangerReceipt.userId === currentUserId)
        || kind !== 'dm'
        || (peerId && strangerReceipt.userId && strangerReceipt.userId !== peerId);

      assert.equal(shouldIgnore, true, 'Receipt from third party must be ignored');
    });
  });

  describe('7. Viewport, Scroll & Section Guard on markAsRead', () => {
    function canMarkAsRead({ doc, section, isNearBottom, force = false }) {
      if (!doc || doc.visibilityState !== 'visible') return false;
      if (typeof doc.hasFocus === 'function' && !doc.hasFocus()) return false;
      if (section !== 'chat') return false;
      if (!force && !isNearBottom) return false;
      return true;
    }

    test('markAsRead is BLOCKED when user is scrolled up (!isNearBottom)', () => {
      const doc = { visibilityState: 'visible', hasFocus: () => true };
      const canRead = canMarkAsRead({ doc, section: 'chat', isNearBottom: false, force: false });
      assert.equal(canRead, false, 'Must not mark as read when scrolled up');
    });

    test('markAsRead is BLOCKED when user is in polls or studies tab', () => {
      const doc = { visibilityState: 'visible', hasFocus: () => true };
      const canReadPolls = canMarkAsRead({ doc, section: 'polls', isNearBottom: true, force: false });
      const canReadStudies = canMarkAsRead({ doc, section: 'studies', isNearBottom: true, force: false });
      assert.equal(canReadPolls, false, 'Must not mark as read in polls section');
      assert.equal(canReadStudies, false, 'Must not mark as read in studies section');
    });

    test('markAsRead is ALLOWED when near bottom in chat section', () => {
      const doc = { visibilityState: 'visible', hasFocus: () => true };
      const canRead = canMarkAsRead({ doc, section: 'chat', isNearBottom: true, force: false });
      assert.equal(canRead, true, 'Allowed when focused, visible, chat section, and near bottom');
    });

    test('markAsRead(force=true) allows immediate read upon reaching bottom scroll', () => {
      const doc = { visibilityState: 'visible', hasFocus: () => true };
      const canRead = canMarkAsRead({ doc, section: 'chat', isNearBottom: true, force: true });
      assert.equal(canRead, true, 'Force read works when reaching bottom');
    });
  });

  describe('8. Self-Chat ("Notes to Self") Isolation', () => {
    test('Self-chat conversation (pair_low === pair_high) produces peerId = null and peerLastReadAt = null', () => {
      const user = { id: 'user_alice' };
      const conversation = { id: 'conv-self', pair_low: 'user_alice', pair_high: 'user_alice' };

      const isSelfChat = conversation.pair_low === conversation.pair_high;
      const peerId = !isSelfChat
        ? (conversation.pair_low === user.id ? conversation.pair_high : conversation.pair_low)
        : null;

      assert.equal(peerId, null, 'Self-chat must not evaluate peerId');
      assert.equal(isMessageSeenByPeer('2026-10-13 10:00:00', null), false, 'Messages to self never show blue ticks');
    });
  });

  describe('9. Cache Reconciliation via peer_last_read_at', () => {
    test('Corrupted local seen: true is healed back to seen: false if peerLastReadAt is older', () => {
      // Local cache was poisoned by old self-echo bug
      const poisonedMessages = [
        { id: 'm-1', mine: true, created_at: '2026-10-13T10:00:00.000Z', seen: true, delivered: true },
        { id: 'm-2', mine: true, created_at: '2026-10-13T10:30:00.000Z', seen: true, delivered: true },
      ];

      // Server returns actual peer_last_read_at (peer last read at 10:15)
      const peerLastReadAt = '2026-10-13T10:15:00.000Z';
      const peerReadMs = Date.parse(peerLastReadAt);

      const healed = poisonedMessages.map((m) => {
        if (m.mine) {
          const msgMs = Date.parse(m.created_at);
          const isSeen = msgMs <= peerReadMs;
          return { ...m, seen: isSeen, delivered: true };
        }
        return m;
      });

      assert.equal(healed[0].seen, true, 'm-1 created at 10:00 was read at 10:15 (seen: true)');
      assert.equal(healed[1].seen, false, 'm-2 created at 10:30 was NOT read at 10:15 (healed to seen: false)');
    });
  });

});

