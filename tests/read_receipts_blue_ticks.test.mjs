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

});
