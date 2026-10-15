import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Chat Tic-Tac-Toe Game Session Lifecycle & Closing Suite', () => {
  describe('1. Active Game Endpoint Query Filter', () => {
    class MockDmGameStore {
      constructor() {
        this.games = [];
      }

      insertGame({ id, conversationId, status, createdAt = new Date().toISOString(), updatedAt = new Date().toISOString() }) {
        this.games.push({ id, conversationId, status, createdAt, updatedAt });
      }

      getActiveGame(conversationId) {
        // Correct implementation: only return games that are currently in_progress
        const candidate = this.games
          .filter((g) => g.conversationId === conversationId && g.status === 'in_progress')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (!candidate) return null;

        // Auto-expire if inactive for > 2 hours
        const lastActiveTime = new Date(candidate.updatedAt || candidate.createdAt).getTime();
        if (Date.now() - lastActiveTime > 2 * 60 * 60 * 1000) {
          candidate.status = 'abandoned';
          return null;
        }

        return candidate;
      }
    }

    it('Strictly returns null when the last game was won', () => {
      const store = new MockDmGameStore();
      store.insertGame({ id: 'game-won-1', conversationId: 'dm-123', status: 'won' });
      const active = store.getActiveGame('dm-123');
      assert.equal(active, null, 'Won game must NOT be returned as active');
    });

    it('Strictly returns null when the last game was a draw', () => {
      const store = new MockDmGameStore();
      store.insertGame({ id: 'game-draw-1', conversationId: 'dm-123', status: 'draw' });
      const active = store.getActiveGame('dm-123');
      assert.equal(active, null, 'Draw game must NOT be returned as active');
    });

    it('Strictly returns null when the last game was abandoned', () => {
      const store = new MockDmGameStore();
      store.insertGame({ id: 'game-abandoned-1', conversationId: 'dm-123', status: 'abandoned' });
      const active = store.getActiveGame('dm-123');
      assert.equal(active, null, 'Abandoned game must NOT be returned as active');
    });

    it('Returns the game when it is actively in_progress', () => {
      const store = new MockDmGameStore();
      store.insertGame({ id: 'game-active-1', conversationId: 'dm-123', status: 'in_progress' });
      const active = store.getActiveGame('dm-123');
      assert.ok(active);
      assert.equal(active.id, 'game-active-1');
      assert.equal(active.status, 'in_progress');
    });

    it('Auto-expires and abandons games that have been inactive for more than 2 hours', () => {
      const store = new MockDmGameStore();
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      store.insertGame({ id: 'game-stale-1', conversationId: 'dm-123', status: 'in_progress', createdAt: threeHoursAgo, updatedAt: threeHoursAgo });

      const active = store.getActiveGame('dm-123');
      assert.equal(active, null, 'Stale game must be auto-abandoned and return null');
      const gameInDb = store.games.find((g) => g.id === 'game-stale-1');
      assert.equal(gameInDb?.status, 'abandoned');
    });
  });

  describe('2. Mutual Game Close & Abandon Broadcasts', () => {
    class MockChatRoomSockets {
      constructor() {
        this.sockets = [];
        this.games = new Map();
      }

      connectUser(userId) {
        const messages = [];
        const socket = {
          userId,
          send: (msg) => messages.push(JSON.parse(msg)),
          getMessages: () => messages,
        };
        this.sockets.push(socket);
        return socket;
      }

      handleAction(senderId, payload) {
        if (payload.type === 'game-abandon') {
          const game = this.games.get(payload.gameId);
          if (game) game.status = 'abandoned';
          for (const s of this.sockets) {
            s.send(JSON.stringify({ type: 'game-abandoned', gameId: payload.gameId, abandonedBy: senderId, username: 'player_' + senderId }));
          }
        } else if (payload.type === 'game-close') {
          for (const s of this.sockets) {
            s.send(JSON.stringify({ type: 'game-closed', gameId: payload.gameId, closedBy: senderId }));
          }
        }
      }
    }

    it('Tapping close on an in-progress game broadcasts game-abandoned to both users', () => {
      const room = new MockChatRoomSockets();
      const userA = room.connectUser('user-a');
      const userB = room.connectUser('user-b');
      room.games.set('game-1', { id: 'game-1', status: 'in_progress' });

      // User A clicks X / Close on active game
      room.handleAction('user-a', { type: 'game-abandon', gameId: 'game-1' });

      const msgsA = userA.getMessages();
      const msgsB = userB.getMessages();

      assert.equal(msgsA.length, 1);
      assert.equal(msgsA[0].type, 'game-abandoned');
      assert.equal(msgsA[0].gameId, 'game-1');

      assert.equal(msgsB.length, 1);
      assert.equal(msgsB[0].type, 'game-abandoned');
      assert.equal(msgsB[0].gameId, 'game-1');
      assert.equal(msgsB[0].abandonedBy, 'user-a');

      // Database state updated
      assert.equal(room.games.get('game-1').status, 'abandoned');
    });

    it('Tapping close on a finished game broadcasts game-closed to both users', () => {
      const room = new MockChatRoomSockets();
      const userA = room.connectUser('user-a');
      const userB = room.connectUser('user-b');

      // User A clicks Close on won/draw game
      room.handleAction('user-a', { type: 'game-close', gameId: 'game-finished-1' });

      const msgsA = userA.getMessages();
      const msgsB = userB.getMessages();

      assert.equal(msgsA.length, 1);
      assert.equal(msgsA[0].type, 'game-closed');
      assert.equal(msgsB.length, 1);
      assert.equal(msgsB[0].type, 'game-closed');
    });
  });

  describe('3. Client-Side Dismissed Guard', () => {
    it('Dismissed game ref prevents late-arriving active-game payload from re-opening board', () => {
      let activeGame = { id: 'game-xyz', status: 'in_progress' };
      let dismissedGameId = null;

      // User closes board
      dismissedGameId = activeGame.id;
      activeGame = null;

      // Simulate a late hydration or retry fetch resolving
      const lateFetchedGame = { id: 'game-xyz', status: 'in_progress' };
      if (lateFetchedGame.id !== dismissedGameId) {
        activeGame = lateFetchedGame;
      }

      assert.equal(activeGame, null, 'Board must stay closed and not be resurrected by late response');

      // Starting a new game resets dismissedGameId and allows new board
      dismissedGameId = null;
      const newGame = { id: 'game-new-123', status: 'in_progress' };
      if (newGame.id !== dismissedGameId) {
        activeGame = newGame;
      }
      assert.ok(activeGame);
      assert.equal(activeGame.id, 'game-new-123');
    });
  });
});
