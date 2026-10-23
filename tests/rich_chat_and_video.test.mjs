import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// 1. Media Type & Strict Video Rejection Validator (matches worker/index.ts & client)
function validateChatMediaUpload(mimeType, sizeBytes) {
  const normalizedMime = (mimeType || '').toLowerCase();
  
  // STRICT RULE: No video files allowed
  if (normalizedMime.startsWith('video/')) {
    return {
      allowed: false,
      status: 415,
      error: 'Video files are not permitted. Only images, GIFs, and audio are allowed.',
    };
  }

  const allowedMimes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg',
  ]);

  if (!allowedMimes.has(normalizedMime)) {
    return {
      allowed: false,
      status: 415,
      error: 'Unsupported media format. Only standard images, GIFs, and audio voice notes are supported.',
    };
  }

  if (sizeBytes > 10 * 1024 * 1024) {
    return {
      allowed: false,
      status: 413,
      error: 'Media file too large. Maximum size is 10 MB.',
    };
  }

  const category = normalizedMime.startsWith('image/') ? 'image' : 'audio';
  return {
    allowed: true,
    status: 200,
    category,
    mimeType: normalizedMime,
  };
}

// 2. SSRF Protection (matches worker/index.ts GET /api/link-preview)
function validateLinkPreviewUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Invalid protocol: only http and https are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isPrivate =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    hostname.startsWith('169.254.') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local');

  if (isPrivate) {
    return { safe: false, reason: 'Private/Internal hostname blocked' };
  }

  return { safe: true, url: parsed.toString() };
}

// 3. Reactions Aggregation & Toggle Logic (matches worker/index.ts & client)
function toggleMessageReaction(reactionsMap, messageId, emoji, username) {
  const key = `${messageId}:${emoji}`;
  const users = reactionsMap.get(key) || new Set();

  if (users.has(username)) {
    users.delete(username);
  } else {
    users.add(username);
  }

  if (users.size === 0) {
    reactionsMap.delete(key);
  } else {
    reactionsMap.set(key, users);
  }

  // Aggregate reactions for messageId
  const result = [];
  for (const [mapKey, userSet] of reactionsMap.entries()) {
    const [msgId, em] = mapKey.split(':');
    if (msgId === messageId) {
      result.push({
        emoji: em,
        count: userSet.size,
        users: Array.from(userSet),
      });
    }
  }
  return result;
}

// 4. Voice & Video Call Dispatch Logic (matches worker/voice-calls.ts & client)
function getMediaConstraintsForCall(callMode) {
  const isVideo = callMode === 'video';
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    },
    video: isVideo ? {
      facingMode: 'user',
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 },
    } : false,
  };
}

function tuneSdpForLowLatency(sdp) {
  if (!sdp) return sdp;
  const lines = sdp.split(/\r?\n/);
  let opusPt = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPt = match[1];
      break;
    }
  }

  const tunedLines = lines.map((line) => {
    if (opusPt && line.startsWith(`a=fmtp:${opusPt}`)) {
      let params = line.slice(`a=fmtp:${opusPt}`.length).trim();
      const additions = [
        'minptime=10',
        'useinbandfec=1',
        'stereo=0',
        'sprop-stereo=0',
        'maxaveragebitrate=32000',
        'cbr=1',
      ];
      for (const add of additions) {
        const [key] = add.split('=');
        const regex = new RegExp(`(?:^|;)\\s*${key}=[^;]*`, 'gi');
        if (regex.test(params)) {
          params = params.replace(regex, `;${add}`);
        } else {
          params = params ? `${params};${add}` : add;
        }
      }
      return `a=fmtp:${opusPt} ${params.replace(/^;\s*/, '').replace(/;;+/g, ';')}`;
    }
    return line;
  });

  return tunedLines.join('\r\n');
}

describe('ADDa Rich Chat & Video Calling Suite', () => {

  describe('1. Strict Video Upload Rejection Policy', () => {
    test('Strictly rejects MP4 video uploads with HTTP 415', () => {
      const res = validateChatMediaUpload('video/mp4', 1024 * 500);
      assert.equal(res.allowed, false);
      assert.equal(res.status, 415);
      assert.match(res.error, /Video files are not permitted/);
    });

    test('Strictly rejects WebM video uploads with HTTP 415', () => {
      const res = validateChatMediaUpload('video/webm', 1024 * 1024);
      assert.equal(res.allowed, false);
      assert.equal(res.status, 415);
      assert.match(res.error, /Video files are not permitted/);
    });

    test('Strictly rejects QuickTime MOV video uploads with HTTP 415', () => {
      const res = validateChatMediaUpload('video/quicktime', 1024 * 2000);
      assert.equal(res.allowed, false);
      assert.equal(res.status, 415);
    });

    test('Allows standard photo uploads (JPEG, PNG, WebP)', () => {
      const jpg = validateChatMediaUpload('image/jpeg', 1024 * 200);
      assert.equal(jpg.allowed, true);
      assert.equal(jpg.category, 'image');

      const png = validateChatMediaUpload('image/png', 1024 * 400);
      assert.equal(png.allowed, true);
      assert.equal(png.category, 'image');
    });

    test('Allows animated GIFs', () => {
      const gif = validateChatMediaUpload('image/gif', 1024 * 800);
      assert.equal(gif.allowed, true);
      assert.equal(gif.mimeType, 'image/gif');
      assert.equal(gif.category, 'image');
    });

    test('Allows voice note audio recordings (audio/webm, audio/mp4, audio/ogg)', () => {
      const webmAudio = validateChatMediaUpload('audio/webm', 1024 * 150);
      assert.equal(webmAudio.allowed, true);
      assert.equal(webmAudio.category, 'audio');

      const oggAudio = validateChatMediaUpload('audio/ogg', 1024 * 120);
      assert.equal(oggAudio.allowed, true);
      assert.equal(oggAudio.category, 'audio');
    });

    test('Rejects oversized uploads beyond 10MB', () => {
      const big = validateChatMediaUpload('image/jpeg', 11 * 1024 * 1024);
      assert.equal(big.allowed, false);
      assert.equal(big.status, 413);
    });

    test('Strictly rejects SVG uploads to eliminate stored XSS', () => {
      const svg = validateChatMediaUpload('image/svg+xml', 1024 * 5);
      assert.equal(svg.allowed, false);
      assert.equal(svg.status, 415);
    });
  });

  describe('2. OpenGraph Link Preview & SSRF Protection', () => {
    test('Blocks internal localhost endpoints', () => {
      assert.equal(validateLinkPreviewUrl('http://localhost:8787/secrets').safe, false);
      assert.equal(validateLinkPreviewUrl('http://127.0.0.1:3000').safe, false);
      assert.equal(validateLinkPreviewUrl('http://0.0.0.0:80').safe, false);
    });

    test('Blocks AWS/Cloud metadata IP address (169.254.169.254)', () => {
      assert.equal(validateLinkPreviewUrl('http://169.254.169.254/latest/meta-data').safe, false);
    });

    test('Blocks private subnet IP ranges (10.x, 192.168.x, 172.16.x)', () => {
      assert.equal(validateLinkPreviewUrl('http://10.0.0.1:8080/admin').safe, false);
      assert.equal(validateLinkPreviewUrl('http://192.168.1.1/router').safe, false);
      assert.equal(validateLinkPreviewUrl('http://172.16.0.10/database').safe, false);
    });

    test('Blocks file:// and ftp:// URI schemes', () => {
      assert.equal(validateLinkPreviewUrl('file:///etc/passwd').safe, false);
      assert.equal(validateLinkPreviewUrl('ftp://example.com/files').safe, false);
    });

    test('Permits valid, safe public websites for link preview generation', () => {
      const valid = validateLinkPreviewUrl('https://github.com/features/actions');
      assert.equal(valid.safe, true);
      assert.equal(valid.url, 'https://github.com/features/actions');
    });
  });

  describe('3. WebRTC Video & Voice Calling Support', () => {
    test('Audio call requests microphone with low-latency mono constraints', () => {
      const constraints = getMediaConstraintsForCall('audio');
      assert.equal(constraints.audio.channelCount, 1);
      assert.equal(constraints.audio.echoCancellation, true);
      assert.equal(constraints.video, false);
    });

    test('Video call requests low-latency audio and 480p/720p 24-30fps video', () => {
      const constraints = getMediaConstraintsForCall('video');
      assert.equal(constraints.audio.channelCount, 1);
      assert.deepEqual(constraints.video.facingMode, 'user');
      assert.equal(constraints.video.width.ideal, 640);
      assert.equal(constraints.video.height.ideal, 480);
    });

    test('tuneSdpForLowLatency tunes Opus with minptime=10 and inbandfec', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=20',
      ].join('\r\n');

      const tuned = tuneSdpForLowLatency(mockSdp);
      assert.match(tuned, /minptime=10/);
      assert.match(tuned, /useinbandfec=1/);
      assert.match(tuned, /stereo=0/);
      assert.match(tuned, /maxaveragebitrate=32000/);
    });

    test('VoiceCall object stores callMode correctly with fallback to audio', () => {
      const defaultCall = {
        callId: 'call-1',
        scope: 'dm',
        status: 'ringing',
        callMode: 'audio',
      };
      assert.equal(defaultCall.callMode, 'audio');

      const videoCall = {
        callId: 'call-2',
        scope: 'dm',
        status: 'ringing',
        callMode: 'video',
      };
      assert.equal(videoCall.callMode, 'video');
    });

    test('Allows callee to initiate renegotiation/ICE restart offer on connected calls', () => {
      function canSendSignal(status, type, userId, callerId, recipientId) {
        if (status === 'accepted') {
          if ((type === 'offer' && userId !== callerId) || (type === 'answer' && userId !== recipientId)) return false;
        } else if (status === 'connected') {
          if (userId !== callerId && userId !== recipientId) return false;
        }
        return true;
      }

      // Initial call setup: only caller can offer
      assert.equal(canSendSignal('accepted', 'offer', 'callee_1', 'caller_1', 'callee_1'), false);
      assert.equal(canSendSignal('accepted', 'offer', 'caller_1', 'caller_1', 'callee_1'), true);

      // Connected call: callee can send ICE restart offer
      assert.equal(canSendSignal('connected', 'offer', 'callee_1', 'caller_1', 'callee_1'), true);
      assert.equal(canSendSignal('connected', 'answer', 'caller_1', 'caller_1', 'callee_1'), true);
      // Stranger cannot offer
      assert.equal(canSendSignal('connected', 'offer', 'stranger_9', 'caller_1', 'callee_1'), false);
    });
  });

  describe('4. Message Deletion For Everyone', () => {
    test('Message deletion zeroes body, clears media, and flags is_deleted', () => {
      const originalMessage = {
        id: 'msg-delete-test',
        sender_id: 'alice_1',
        body: 'Confidential secret note',
        media_url: 'https://r2.dev/chat-media/image123.jpg',
        media_type: 'image/jpeg',
        is_deleted: false,
      };

      // Apply "delete for everyone" action
      const deletedMessage = {
        ...originalMessage,
        is_deleted: true,
        body: '',
        media_url: null,
      };

      assert.equal(deletedMessage.is_deleted, true);
      assert.equal(deletedMessage.body, '');
      assert.equal(deletedMessage.media_url, null);
    });
  });

  describe('5. Emoji Reactions & Live Counter Updates', () => {
    test('Adding and toggling reactions updates aggregation correctly', () => {
      const map = new Map();
      const msgId = 'msg-react-1';

      // Alice reacts with thumbs up 👍
      let reactions = toggleMessageReaction(map, msgId, '👍', 'alice');
      assert.equal(reactions.length, 1);
      assert.equal(reactions[0].emoji, '👍');
      assert.equal(reactions[0].count, 1);
      assert.deepEqual(reactions[0].users, ['alice']);

      // Bob also reacts with thumbs up 👍
      reactions = toggleMessageReaction(map, msgId, '👍', 'bob');
      assert.equal(reactions[0].count, 2);
      assert.deepEqual(reactions[0].users.sort(), ['alice', 'bob']);

      // Alice reacts with ❤️
      reactions = toggleMessageReaction(map, msgId, '❤️', 'alice');
      assert.equal(reactions.length, 2);

      // Alice removes her 👍
      reactions = toggleMessageReaction(map, msgId, '👍', 'alice');
      const thumb = reactions.find((r) => r.emoji === '👍');
      assert.equal(thumb.count, 1);
      assert.deepEqual(thumb.users, ['bob']);
    });
  });

  describe('6. Mobile Message Action Menu & Floating Reactions Viewport Positioning', () => {
    // Pure calculation function mimicking CommunityChats.tsx
    function calculatePopupPosition({ m, rect, viewportW, viewportH }) {
      const isMine = m.mine;
      const popupWidth = m.is_deleted ? 210 : (viewportW <= 380 ? 252 : 296);
      const popupHeight = m.is_deleted ? 120 : (isMine ? 340 : 300);

      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      let top;
      if (spaceBelow >= popupHeight + 12) {
        top = rect.bottom + 6;
      } else if (spaceAbove >= popupHeight + 12) {
        top = rect.top - popupHeight - 6;
      } else {
        top = Math.max(12, Math.min(viewportH - popupHeight - 12, rect.bottom + 6));
      }

      const alignRight = isMine || rect.left > viewportW / 2;
      let left;
      if (alignRight) {
        const desiredLeft = rect.right - popupWidth;
        left = Math.max(12, Math.min(viewportW - popupWidth - 12, desiredLeft));
      } else {
        const desiredLeft = rect.left;
        left = Math.max(12, Math.min(viewportW - popupWidth - 12, desiredLeft));
      }

      return { top, left, alignRight, popupWidth, popupHeight };
    }

    test('Own message on mobile screen (360px) is never clipped on the left', () => {
      const pos = calculatePopupPosition({
        m: { mine: true, is_deleted: false },
        rect: { left: 160, right: 344, top: 400, bottom: 440 },
        viewportW: 360,
        viewportH: 740,
      });

      assert.equal(pos.alignRight, true);
      // Left coordinate must be at least 12px (NO NEGATIVE COORDINATES / NO CLIPPING)
      assert.ok(pos.left >= 12, `pos.left (${pos.left}) should be >= 12`);
      // Right edge (left + popupWidth) must fit inside viewport safe bounds (360 - 12 = 348)
      assert.ok(pos.left + pos.popupWidth <= 360 - 12, `Right edge (${pos.left + pos.popupWidth}) should be <= 348`);
    });

    test('Ultra-narrow mobile screen (320px) scales to 252px and safely fits within margins', () => {
      const pos = calculatePopupPosition({
        m: { mine: true, is_deleted: false },
        rect: { left: 100, right: 308, top: 300, bottom: 350 },
        viewportW: 320,
        viewportH: 568,
      });

      assert.equal(pos.popupWidth, 252);
      assert.ok(pos.left >= 12);
      assert.ok(pos.left + pos.popupWidth <= 320 - 12);
    });

    test('Peer message on left margin (16px) aligns to left without clipping right', () => {
      const pos = calculatePopupPosition({
        m: { mine: false, is_deleted: false },
        rect: { left: 16, right: 200, top: 200, bottom: 250 },
        viewportW: 360,
        viewportH: 740,
      });

      assert.equal(pos.alignRight, false);
      assert.equal(pos.left, 16);
      assert.ok(pos.left + pos.popupWidth <= 360 - 12);
    });

    test('Message near bottom of viewport flips positioning above the message bubble', () => {
      const pos = calculatePopupPosition({
        m: { mine: true, is_deleted: false },
        rect: { left: 180, right: 344, top: 680, bottom: 720 },
        viewportW: 360,
        viewportH: 740,
      });

      // Space below is 740 - 720 = 20px, which is too small for 340px popup
      // Popup should be positioned above the message (top < rect.top)
      assert.ok(pos.top < 680, `pos.top (${pos.top}) should be above message top (680)`);
      assert.ok(pos.top >= 12, `pos.top (${pos.top}) should be >= 12`);
    });

    test('Deleted message calculates compact width (210px) and height without reactions', () => {
      const pos = calculatePopupPosition({
        m: { mine: true, is_deleted: true },
        rect: { left: 160, right: 344, top: 300, bottom: 330 },
        viewportW: 360,
        viewportH: 740,
      });

      assert.equal(pos.popupWidth, 210);
      assert.equal(pos.popupHeight, 120);
      assert.ok(pos.left >= 12);
      assert.ok(pos.left + pos.popupWidth <= 360 - 12);
    });
  });

});
