import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Push Subscription Cleanup & Single-Origin Deduplication Suite', () => {
  describe('1. Ephemeral Hash Preview Subdomain Detection', () => {
    const isEphemeralHost = (hostname) => /^[a-f0-9]{8}\.student-addit\.pages\.dev$/i.test(hostname);

    it('Correctly identifies 8-character hex Cloudflare Pages preview hashes', () => {
      assert.equal(isEphemeralHost('5c06376f.student-addit.pages.dev'), true);
      assert.equal(isEphemeralHost('a1b2c3d4.student-addit.pages.dev'), true);
      assert.equal(isEphemeralHost('00000000.student-addit.pages.dev'), true);
      assert.equal(isEphemeralHost('ffffffff.student-addit.pages.dev'), true);
    });

    it('Does NOT flag canonical, branch, or production hosts as ephemeral', () => {
      assert.equal(isEphemeralHost('development.student-addit.pages.dev'), false);
      assert.equal(isEphemeralHost('student-addit.pages.dev'), false);
      assert.equal(isEphemeralHost('student-addit.mgp899123.workers.dev'), false);
      assert.equal(isEphemeralHost('localhost'), false);
    });
  });

  describe('2. In-Memory Mock of Push Subscription Pruning Logic', () => {
    class MockPushDb {
      constructor() {
        this.subscriptions = [];
      }

      insert(userId, endpoint, p256dh, auth, pruneOthers = false) {
        if (pruneOthers) {
          this.subscriptions = this.subscriptions.filter((s) => s.userId !== userId);
        }
        const existing = this.subscriptions.find((s) => s.endpoint === endpoint);
        if (existing) {
          existing.userId = userId;
          existing.p256dh = p256dh;
          existing.auth = auth;
          existing.createdAt = Date.now();
        } else {
          this.subscriptions.push({
            id: 'sub-' + (this.subscriptions.length + 1),
            userId,
            endpoint,
            p256dh,
            auth,
            createdAt: Date.now(),
          });
        }
      }

      pruneExcept(userId, currentEndpoint) {
        const initialCount = this.subscriptions.length;
        this.subscriptions = this.subscriptions.filter(
          (s) => s.userId !== userId || s.endpoint === currentEndpoint
        );
        return initialCount - this.subscriptions.length;
      }

      deleteAllForUser(userId) {
        this.subscriptions = this.subscriptions.filter((s) => s.userId !== userId);
      }

      forUser(userId) {
        return this.subscriptions.filter((s) => s.userId === userId);
      }
    }

    it('Prunes older duplicate endpoints when pruneOthers is enabled', () => {
      const db = new MockPushDb();
      // User registers from old preview URL 1
      db.insert('user-1', 'https://fcm.googleapis.com/fcm/send/token1', 'key1', 'auth1');
      // User registers from old preview URL 2
      db.insert('user-1', 'https://fcm.googleapis.com/fcm/send/token2', 'key2', 'auth2');
      assert.equal(db.forUser('user-1').length, 2);

      // User turns on notifications on new development branch with pruneOthers: true
      db.insert('user-1', 'https://fcm.googleapis.com/fcm/send/token3', 'key3', 'auth3', true);
      const remaining = db.forUser('user-1');
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].endpoint, 'https://fcm.googleapis.com/fcm/send/token3');
    });

    it('Explicit prune endpoint deletes all subscriptions except the active one', () => {
      const db = new MockPushDb();
      db.insert('user-2', 'https://fcm.googleapis.com/fcm/send/old1', 'key1', 'auth1');
      db.insert('user-2', 'https://fcm.googleapis.com/fcm/send/old2', 'key2', 'auth2');
      db.insert('user-2', 'https://fcm.googleapis.com/fcm/send/active', 'key3', 'auth3');
      assert.equal(db.forUser('user-2').length, 3);

      const prunedCount = db.pruneExcept('user-2', 'https://fcm.googleapis.com/fcm/send/active');
      assert.equal(prunedCount, 2);
      const remaining = db.forUser('user-2');
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].endpoint, 'https://fcm.googleapis.com/fcm/send/active');
    });

    it('Turn off everywhere deletes all subscriptions for the user', () => {
      const db = new MockPushDb();
      db.insert('user-3', 'https://fcm.googleapis.com/fcm/send/device1', 'key1', 'auth1');
      db.insert('user-3', 'https://fcm.googleapis.com/fcm/send/device2', 'key2', 'auth2');
      db.deleteAllForUser('user-3');
      assert.equal(db.forUser('user-3').length, 0);
    });
  });

  describe('3. Push Notification Base Origin Canonicalization', () => {
    function resolveNotificationUrl(targetPath, origin) {
      const isEphemeral = /^[a-f0-9]{8}\.student-addit\.pages\.dev$/i.test(new URL(origin).hostname);
      const baseOrigin = isEphemeral ? 'https://development.student-addit.pages.dev' : origin;
      return new URL(targetPath, baseOrigin).href;
    }

    it('Replaces ephemeral preview origin with canonical development origin on click', () => {
      const url = resolveNotificationUrl('/?call=123', 'https://5c06376f.student-addit.pages.dev');
      assert.equal(url, 'https://development.student-addit.pages.dev/?call=123');
    });

    it('Retains canonical development origin unchanged', () => {
      const url = resolveNotificationUrl('/?call=123', 'https://development.student-addit.pages.dev');
      assert.equal(url, 'https://development.student-addit.pages.dev/?call=123');
    });

    it('Retains production origin unchanged', () => {
      const url = resolveNotificationUrl('/?call=123', 'https://student-addit.pages.dev');
      assert.equal(url, 'https://student-addit.pages.dev/?call=123');
    });
  });
});
