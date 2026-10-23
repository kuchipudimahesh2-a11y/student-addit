import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('WhatsApp-Style Rich Notifications & Sound Suite', () => {
  test('1. Service worker implements WhatsApp rich payload, avatar icons, and action handlers', () => {
    const swPath = resolve('public/sw.js');
    const swContent = readFileSync(swPath, 'utf8');

    // Avatar resolution
    assert.match(swContent, /payload\.icon/, 'Service worker must resolve sender avatar icon');
    // Photo preview resolution
    assert.match(swContent, /payload\.image/, 'Service worker must resolve photo preview image');
    // WhatsApp tag grouping
    assert.match(swContent, /chatTag/, 'Service worker must group notifications using chat tag');
    // Renotify and WhatsApp vibration pattern
    assert.match(swContent, /renotify:\s*true/, 'Service worker must set renotify to true for thread alerts');
    assert.match(swContent, /\[0,\s*200,\s*100,\s*200\]/, 'Service worker must use signature WhatsApp vibration pattern');
    // Quick actions
    assert.match(swContent, /action:\s*'reply'/, 'Service worker must provide inline reply action');
    assert.match(swContent, /action:\s*'mark_read'/, 'Service worker must provide mark as read action');
    // Action event handlers
    assert.match(swContent, /NOTIFICATION_MARK_READ/, 'Service worker must broadcast mark read to client');
    assert.match(swContent, /NOTIFICATION_INLINE_REPLY/, 'Service worker must broadcast inline reply to client');
    // In-app notification broadcast
    assert.match(swContent, /INCOMING_PUSH_NOTIFICATION/, 'Service worker must broadcast push to active client windows');
  });

  test('2. Backend worker formats WhatsApp group names, sender avatars, and rich media indicators', () => {
    const workerPath = resolve('worker/index.ts');
    const workerContent = readFileSync(workerPath, 'utf8');

    // Rich media badges
    assert.match(workerContent, /📷 Photo/, 'Worker must format photo media badge');
    assert.match(workerContent, /🎤 Voice message/, 'Worker must format voice note media badge');
    assert.match(workerContent, /📄 Document/, 'Worker must format document media badge');
    assert.match(workerContent, /🎥 Video/, 'Worker must format video badge');
    assert.match(workerContent, /📊 Poll:/, 'Worker must format poll badge');

    // Push title formatting
    assert.match(workerContent, /\$\{username\}\s*@\s*\$\{groupName\s*\|\|\s*'Group'\}/, 'Worker must format group title as user @ group');
    // Avatar query
    assert.match(workerContent, /SELECT avatar_url FROM users WHERE id = \?/, 'Worker must look up sender avatar for push');
    // Passing richPayload to queue
    assert.match(workerContent, /queueChatPush\(this\.env,.*richPayload\)/, 'Worker must pass richPayload to queueChatPush');
    assert.match(workerContent, /processChatPushEvent\(env,\s*chatEventId,\s*clickUrl,\s*message\.body\?\.richPayload\)/, 'Queue consumer must forward richPayload to processChatPushEvent');
  });

  test('3. Zero-latency Web Audio sound engine implements WhatsApp chime and outgoing tick', () => {
    const soundPath = resolve('src/sound-effects.ts');
    const soundContent = readFileSync(soundPath, 'utf8');

    // Frequencies for WhatsApp incoming chime
    assert.match(soundContent, /880/, 'Sound engine must synthesize primary 880Hz tone');
    assert.match(soundContent, /1760/, 'Sound engine must synthesize 1760Hz shimmer overtone');
    assert.match(soundContent, /440/, 'Sound engine must synthesize 440Hz warm body transient');
    // Outgoing tactile tick
    assert.match(soundContent, /playOutgoingMessageSound/, 'Sound engine must implement outgoing pop/tick');
    // User preference management
    assert.match(soundContent, /adda_chat_sounds_enabled/, 'Sound engine must support sound toggle setting');
    assert.match(soundContent, /adda_chat_vibrate_enabled/, 'Sound engine must support vibration toggle setting');
  });

  test('4. In-App Heads-Up Banner and App.tsx integration', () => {
    const bannerPath = resolve('src/InAppNotificationBanner.tsx');
    const bannerContent = readFileSync(bannerPath, 'utf8');

    assert.match(bannerContent, /whatsapp-heads-up-card/, 'Banner must have WhatsApp card styling');
    assert.match(bannerContent, /whatsapp-heads-up-avatar/, 'Banner must display sender avatar');
    assert.match(bannerContent, /onOpenChat/, 'Banner must support open chat callback');
    assert.match(bannerContent, /Reply/, 'Banner must feature quick reply button');

    const appPath = resolve('src/App.tsx');
    const appContent = readFileSync(appPath, 'utf8');
    assert.match(appContent, /<InAppNotificationBanner/, 'App.tsx must render InAppNotificationBanner');
    assert.match(appContent, /WhatsApp Chat Sounds/, 'App.tsx must expose WhatsApp chat sound controls in settings');
  });

  test('5. Capacitor mobile push channel configuration', () => {
    const capConfigPath = resolve('capacitor.config.ts');
    const capContent = readFileSync(capConfigPath, 'utf8');

    assert.match(capContent, /PushNotifications/, 'Capacitor config must define PushNotifications');
    assert.match(capContent, /LocalNotifications/, 'Capacitor config must define LocalNotifications');
    assert.match(capContent, /whatsapp_notification\.wav/, 'Capacitor config must configure custom sound file');
  });
});
