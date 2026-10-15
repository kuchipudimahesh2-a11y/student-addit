import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Chat Genuine Online Presence & WhatsApp Typing Indicator Suite', () => {
  describe('1. Peer Online Presence Resolution', () => {
    class MockCallInboxDO {
      constructor(sockets = []) {
        this.sockets = sockets;
      }
      isOnline() {
        return this.sockets.length > 0;
      }
    }

    class MockChatRoomDO {
      constructor() {
        this.sockets = [];
        this.conversations = new Map();
        this.inboxes = new Map();
      }

      addConversation(id, pairLow, pairHigh) {
        this.conversations.set(id, { pairLow, pairHigh });
      }

      setInbox(userId, inbox) {
        this.inboxes.set(userId, inbox);
      }

      connect(socket, { userId, username, kind, roomId }) {
        socket.meta = { userId, username, kind, roomId };
        this.sockets.push(socket);

        const onlineUserIds = Array.from(new Set(this.sockets.map((s) => s.meta.userId)));
        let peerOnline = false;

        if (kind === 'dm') {
          const conv = this.conversations.get(roomId);
          const peerId = conv ? (conv.pairLow === userId ? conv.pairHigh : conv.pairLow) : '';
          if (peerId === userId) {
            peerOnline = true; // self-chat
          } else if (peerId && onlineUserIds.includes(peerId)) {
            peerOnline = true; // in same room
          } else if (peerId) {
            const inbox = this.inboxes.get(peerId);
            peerOnline = Boolean(inbox?.isOnline()); // global inbox presence
          }
        }

        socket.send(JSON.stringify({
          type: 'connected',
          peerOnline: kind === 'dm' ? peerOnline : undefined,
          onlineUserIds,
        }));

        for (const other of this.sockets) {
          if (other === socket) continue;
          other.send(JSON.stringify({
            type: 'presence',
            joinedUserId: userId,
            peerOnline: true,
            onlineUserIds,
          }));
        }
      }

      disconnect(socket) {
        this.sockets = this.sockets.filter((s) => s !== socket);
        const closedUserId = socket.meta.userId;
        const kind = socket.meta.kind;
        const roomId = socket.meta.roomId;
        const onlineUserIds = Array.from(new Set(this.sockets.map((s) => s.meta.userId)));

        let peerStillOnline = false;
        if (kind === 'dm') {
          if (onlineUserIds.includes(closedUserId)) {
            peerStillOnline = true;
          } else {
            const inbox = this.inboxes.get(closedUserId);
            peerStillOnline = Boolean(inbox?.isOnline());
          }
        }

        for (const other of this.sockets) {
          other.send(JSON.stringify({
            type: 'presence',
            leftUserId: closedUserId,
            peerOnline: peerStillOnline,
            onlineUserIds,
          }));
        }
      }
    }

    class MockSocket {
      constructor(id) {
        this.id = id;
        this.messages = [];
      }
      send(payload) {
        this.messages.push(JSON.parse(payload));
      }
    }

    it('Resolves peer as Online when peer is connected in the same DM room', () => {
      const room = new MockChatRoomDO();
      room.addConversation('conv-1', 'user-A', 'user-B');

      const socketA = new MockSocket('ws-A');
      const socketB = new MockSocket('ws-B');

      // User A connects first (User B offline)
      room.connect(socketA, { userId: 'user-A', username: 'alice', kind: 'dm', roomId: 'conv-1' });
      assert.equal(socketA.messages[0].type, 'connected');
      assert.equal(socketA.messages[0].peerOnline, false, 'User A sees User B as Offline initially');

      // User B connects to the room
      room.connect(socketB, { userId: 'user-B', username: 'bob', kind: 'dm', roomId: 'conv-1' });
      assert.equal(socketB.messages[0].type, 'connected');
      assert.equal(socketB.messages[0].peerOnline, true, 'User B sees User A as Online');

      // User A receives presence update that peer is Online
      const presenceUpdate = socketA.messages.find((m) => m.type === 'presence' && m.joinedUserId === 'user-B');
      assert.ok(presenceUpdate, 'User A must receive presence update when User B joins');
      assert.equal(presenceUpdate.peerOnline, true);
    });

    it('Resolves peer as Online when peer is active in the app via CallInbox', () => {
      const room = new MockChatRoomDO();
      room.addConversation('conv-2', 'user-A', 'user-C');

      // User C has an active inbox connection in CallInbox
      const inboxC = new MockCallInboxDO(['ws-inbox-c']);
      room.setInbox('user-C', inboxC);

      const socketA = new MockSocket('ws-A');
      room.connect(socketA, { userId: 'user-A', username: 'alice', kind: 'dm', roomId: 'conv-2' });

      assert.equal(socketA.messages[0].type, 'connected');
      assert.equal(socketA.messages[0].peerOnline, true, 'User C is detected Online via CallInbox even if not in room');
    });

    it('Resolves peer as Offline when neither in room nor active in CallInbox', () => {
      const room = new MockChatRoomDO();
      room.addConversation('conv-3', 'user-A', 'user-D');

      // User D has empty inbox (closed app)
      const inboxD = new MockCallInboxDO([]);
      room.setInbox('user-D', inboxD);

      const socketA = new MockSocket('ws-A');
      room.connect(socketA, { userId: 'user-A', username: 'alice', kind: 'dm', roomId: 'conv-3' });

      assert.equal(socketA.messages[0].peerOnline, false);
    });

    it('Resolves self-chat as Online', () => {
      const room = new MockChatRoomDO();
      room.addConversation('conv-self', 'user-A', 'user-A');

      const socketA = new MockSocket('ws-A');
      room.connect(socketA, { userId: 'user-A', username: 'alice', kind: 'dm', roomId: 'conv-self' });

      assert.equal(socketA.messages[0].peerOnline, true, 'Message yourself is always Online');
    });

    it('Broadcasts peer presence update when peer disconnects', () => {
      const room = new MockChatRoomDO();
      room.addConversation('conv-4', 'user-A', 'user-B');
      const inboxB = new MockCallInboxDO([]); // User B closed app completely
      room.setInbox('user-B', inboxB);

      const socketA = new MockSocket('ws-A');
      const socketB = new MockSocket('ws-B');

      room.connect(socketA, { userId: 'user-A', username: 'alice', kind: 'dm', roomId: 'conv-4' });
      room.connect(socketB, { userId: 'user-B', username: 'bob', kind: 'dm', roomId: 'conv-4' });

      // User B closes tab/socket
      room.disconnect(socketB);

      const leaveEvent = socketA.messages.find((m) => m.type === 'presence' && m.leftUserId === 'user-B');
      assert.ok(leaveEvent, 'User A receives leave presence notification');
      assert.equal(leaveEvent.peerOnline, false, 'User B is now Offline');
    });
  });

  describe('2. Real-Time Typing Indicators & WhatsApp 3-Dot Floating Animation', () => {
    class TypingManager {
      constructor(senderId, username, socketsGetter) {
        this.senderId = senderId;
        this.username = username;
        this.socketsGetter = socketsGetter;
        this.lastTypingSent = 0;
      }

      emitTyping(isTyping, now = Date.now()) {
        if (isTyping) {
          if (this.lastTypingSent > 0 && now - this.lastTypingSent < 1800) {
            return false; // throttled
          }
          this.lastTypingSent = now;
        } else {
          this.lastTypingSent = 0;
        }

        const sockets = this.socketsGetter();
        for (const s of sockets) {
          if (s.userId === this.senderId) continue; // Exclude self
          s.onMessage({
            type: 'typing',
            userId: this.senderId,
            username: this.username,
            isTyping,
          });
        }
        return true;
      }
    }

    class ClientTypingState {
      constructor() {
        this.isTyping = false;
        this.timeoutId = null;
      }

      handleTypingFrame(frame) {
        if (frame.isTyping) {
          this.isTyping = true;
          if (this.timeoutId) clearTimeout(this.timeoutId);
          this.timeoutId = setTimeout(() => {
            this.isTyping = false;
          }, 3500);
        } else {
          this.isTyping = false;
          if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
          }
        }
      }

      handleMessageFrame() {
        // Receipt of incoming message immediately dismisses typing indicator
        this.isTyping = false;
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
      }
    }

    it('Broadcasts typing events to peer and excludes sender', () => {
      const receivedByB = [];
      const receivedByA = [];

      const sockets = [
        { userId: 'user-A', onMessage: (msg) => receivedByA.push(msg) },
        { userId: 'user-B', onMessage: (msg) => receivedByB.push(msg) },
      ];

      const typingManagerA = new TypingManager('user-A', 'alice', () => sockets);
      const sent = typingManagerA.emitTyping(true, 1000);

      assert.equal(sent, true);
      assert.equal(receivedByA.length, 0, 'Sender User A must NOT receive their own typing event');
      assert.equal(receivedByB.length, 1, 'Peer User B must receive typing event');
      assert.equal(receivedByB[0].type, 'typing');
      assert.equal(receivedByB[0].userId, 'user-A');
      assert.equal(receivedByB[0].username, 'alice');
      assert.equal(receivedByB[0].isTyping, true);
    });

    it('Throttles rapid typing keystrokes within 1.8 seconds', () => {
      const receivedByB = [];
      const sockets = [
        { userId: 'user-A', onMessage: () => {} },
        { userId: 'user-B', onMessage: (msg) => receivedByB.push(msg) },
      ];

      const typingManagerA = new TypingManager('user-A', 'alice', () => sockets);

      // Keystroke 1 at t=1000ms
      assert.equal(typingManagerA.emitTyping(true, 1000), true);
      assert.equal(receivedByB.length, 1);

      // Keystroke 2 at t=1300ms (only 300ms later -> must throttle)
      assert.equal(typingManagerA.emitTyping(true, 1300), false);
      assert.equal(receivedByB.length, 1, 'Throttled keystroke must not emit');

      // Keystroke 3 at t=2900ms (1900ms later -> allowed)
      assert.equal(typingManagerA.emitTyping(true, 2900), true);
      assert.equal(receivedByB.length, 2, 'Keystroke after 1.8s window must emit');
    });

    it('Immediately resets typing indicator when isTyping: false is emitted (e.g. on blur or clear)', () => {
      const clientB = new ClientTypingState();

      // Peer begins typing
      clientB.handleTypingFrame({ type: 'typing', isTyping: true });
      assert.equal(clientB.isTyping, true);

      // Peer stops typing (erased text or blurred)
      clientB.handleTypingFrame({ type: 'typing', isTyping: false });
      assert.equal(clientB.isTyping, false);
      assert.equal(clientB.timeoutId, null);
    });

    it('Auto-dismisses typing indicator after 3.5 seconds of inactivity', async () => {
      const clientB = new ClientTypingState();

      clientB.handleTypingFrame({ type: 'typing', isTyping: true });
      assert.equal(clientB.isTyping, true);

      // Wait 3.6 seconds
      await new Promise((resolve) => setTimeout(resolve, 3600));

      assert.equal(clientB.isTyping, false, 'Typing indicator must auto-dismiss after 3.5 seconds');
    });

    it('Immediately dismisses typing indicator when message arrives from peer', () => {
      const clientB = new ClientTypingState();

      clientB.handleTypingFrame({ type: 'typing', isTyping: true });
      assert.equal(clientB.isTyping, true);

      // Peer sends message
      clientB.handleMessageFrame();
      assert.equal(clientB.isTyping, false, 'Message receipt must immediately clear typing indicator');
    });
  });
});
