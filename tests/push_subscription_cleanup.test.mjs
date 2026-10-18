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

  describe('4. Android Status Bar Transparent Monochrome Badge Compliance', () => {
    it('Verifies adda-badge-96.png exists, is 96x96, and has alpha channel for Android OS tinting', async () => {
      const fs = await import('node:fs');
      const badgePath = 'public/icons/adda-badge-96.png';
      assert.equal(fs.existsSync(badgePath), true, 'adda-badge-96.png must exist');

      let meta;
      try {
        const sharp = (await import('sharp')).default;
        meta = await sharp(badgePath).metadata();
      } catch {
        const buf = fs.readFileSync(badgePath);
        const colorType = buf.readUInt8(25);
        meta = {
          width: buf.readUInt32BE(16),
          height: buf.readUInt32BE(20),
          hasAlpha: colorType === 6 || colorType === 4,
          channels: colorType === 6 ? 4 : (colorType === 2 ? 3 : (colorType === 4 ? 2 : 1)),
        };
      }
      assert.equal(meta.width, 96, 'Badge width must be 96px');
      assert.equal(meta.height, 96, 'Badge height must be 96px');
      assert.equal(meta.hasAlpha, true, 'Badge must possess an alpha channel for Android status bar tinting');
      assert.equal(meta.channels, 4, 'Badge must be 4-channel RGBA');
    });
  });

  describe('5. Android Chrome User-Visible Push (Zero Silent Push Warnings)', () => {
    function processPushEvent(payload, origin = 'https://student-addit.pages.dev') {
      const iconUrl = new URL('/icons/adda-192.png', origin).href;
      const badgeUrl = new URL('/icons/adda-badge-96.png', origin).href;

      if (payload.type === 'dismiss_call') {
        const callTag = payload.tag || (payload.callId ? 'incoming-call-' + payload.callId : 'call-status');
        const callerName = payload.callerUsername || 'Someone';
        return {
          title: 'Missed Call',
          options: {
            body: `${callerName} called you on adda`,
            icon: iconUrl,
            badge: badgeUrl,
            tag: callTag,
            requireInteraction: false,
            renotify: false,
          },
        };
      }

      const isCall = payload.type === 'incoming_call';
      const title = payload.title || (isCall ? 'Incoming Voice Call' : 'A note from adda');
      return {
        title,
        options: {
          body: payload.body || 'New notification',
          icon: iconUrl,
          badge: badgeUrl,
          tag: payload.tag || (isCall && payload.callId ? 'incoming-call-' + payload.callId : 'adda-announcement'),
        },
      };
    }

    it('Transitions dismiss_call payload into a visible Missed Call notification with the same tag', () => {
      const notification = processPushEvent({
        type: 'dismiss_call',
        callId: 'call-xyz-123',
        callerUsername: 'rahul',
      });

      assert.equal(notification.title, 'Missed Call');
      assert.equal(notification.options.body, 'rahul called you on adda');
      assert.equal(notification.options.tag, 'incoming-call-call-xyz-123');
      assert.equal(notification.options.requireInteraction, false);
      assert.match(notification.options.icon, /^https:\/\/student-addit\.pages\.dev\/icons\/adda-192\.png$/);
      assert.match(notification.options.badge, /^https:\/\/student-addit\.pages\.dev\/icons\/adda-badge-96\.png$/);
    });

    it('Guarantees absolute URLs for icon and badge so Android system background loader succeeds', () => {
      const notification = processPushEvent({
        type: 'incoming_call',
        callId: 'call-456',
        title: 'Incoming Voice Call',
        body: 'Someone is calling you',
      });

      assert.equal(notification.options.icon.startsWith('https://'), true);
      assert.equal(notification.options.badge.startsWith('https://'), true);
      assert.equal(notification.options.badge.endsWith('/icons/adda-badge-96.png'), true);
    });
  });
});

