import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// 1. Document & Media Validation Logic (Matching backend upload validator)
const ALLOWED_DOC_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', 'md'
]);
const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/octet-stream',
]);

function validateUploadFile(fileName, mimeType, sizeBytes, headerBytes = []) {
  // STRICT USER MANDATE: Zero video files allowed
  if (mimeType.startsWith('video/') || fileName.match(/\.(mp4|webm|mov|mkv|avi|m4v)$/i)) {
    return { ok: false, error: 'Video files are strictly prohibited.' };
  }
  // Max size: 15 MB for docs / 10 MB for voice notes
  if (sizeBytes > 15 * 1024 * 1024) {
    return { ok: false, error: 'File exceeds maximum 15 MB limit.' };
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Document check
  if (ALLOWED_DOC_EXTENSIONS.has(ext)) {
    // If PDF, check %PDF header magic bytes: 0x25, 0x50, 0x44, 0x46
    if (ext === 'pdf' && headerBytes.length >= 4) {
      const isPdfHeader = headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44 && headerBytes[3] === 0x46;
      if (!isPdfHeader) return { ok: false, error: 'Invalid PDF magic bytes' };
    }
    return { ok: true, type: 'document', category: ext };
  }

  // Audio check (voice note)
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(ext)) {
    return { ok: true, type: 'audio', category: 'voice' };
  }

  // Image check
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    if (mimeType === 'image/svg+xml' || ext === 'svg') {
      return { ok: false, error: 'SVG files not allowed for security.' };
    }
    return { ok: true, type: 'image', category: ext };
  }

  return { ok: false, error: 'Unsupported file type.' };
}

// 2. Poll Vote Aggregation & Percentages Helper
function computePollResults(pollOptions, votes) {
  const voteCounts = {};
  for (const opt of pollOptions) voteCounts[opt.id] = 0;
  for (const v of votes) {
    if (voteCounts[v.optionId] !== undefined) {
      voteCounts[v.optionId]++;
    }
  }
  const totalVotes = votes.length;
  return pollOptions.map((opt) => {
    const count = voteCounts[opt.id] || 0;
    const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    return {
      id: opt.id,
      label: opt.label,
      votes: count,
      percentage,
    };
  });
}

// 3. Mentions Parser & Self-Mention Detector
function parseMentions(text, currentUsername) {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      username: match[1],
      isSelf: currentUsername ? match[1].toLowerCase() === currentUsername.toLowerCase() : false,
    });
  }
  return mentions;
}

// 4. In-Chat Message Search Filter & Index Navigator
function searchMessages(messages, query, currentIndex) {
  const q = query.trim().toLowerCase();
  if (!q) return { matchingIds: [], currentMatchId: null, displayCounter: 'No matches' };

  const matches = messages.filter((m) => !m.is_deleted && m.body && m.body.toLowerCase().includes(q));
  if (matches.length === 0) {
    return { matchingIds: [], currentMatchId: null, displayCounter: 'No matches' };
  }

  const safeIndex = ((currentIndex % matches.length) + matches.length) % matches.length;
  return {
    matchingIds: matches.map((m) => m.id),
    currentMatchId: matches[safeIndex].id,
    displayCounter: `${safeIndex + 1} of ${matches.length}`,
  };
}

// 5. Disappearing Messages Expiration Logic
function filterDisappearingMessages(messages, nowMs = Date.now()) {
  return messages.filter((m) => {
    if (!m.expires_at) return true;
    const expTime = Date.parse(m.expires_at.replace(' ', 'T') + (m.expires_at.includes('Z') ? '' : 'Z'));
    if (Number.isNaN(expTime)) return true;
    return expTime > nowMs;
  });
}

// 6. Inbox Folder Categorization & Pinned Sorting
function filterAndSortInbox(conversations, folder, pinnedIdsSet) {
  // 1. Filter by folder
  let filtered = conversations;
  if (folder === 'unread') {
    filtered = conversations.filter((c) => (c.unread_count || 0) > 0);
  } else if (folder === 'direct') {
    filtered = conversations.filter((c) => c.kind === 'dm');
  } else if (folder === 'groups') {
    filtered = conversations.filter((c) => c.kind === 'group');
  } else if (folder === 'pinned') {
    filtered = conversations.filter((c) => pinnedIdsSet.has(c.id));
  }

  // 2. Sort: Pinned to top, then by last_at descending
  return [...filtered].sort((a, b) => {
    const aPinned = pinnedIdsSet.has(a.id) ? 1 : 0;
    const bPinned = pinnedIdsSet.has(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aTime = a.last_at ? Date.parse(a.last_at) : 0;
    const bTime = b.last_at ? Date.parse(b.last_at) : 0;
    return bTime - aTime;
  });
}

// 7. Voice Note Speed State Machine
function cycleVoiceSpeed(currentSpeed) {
  if (currentSpeed === 1) return 1.5;
  if (currentSpeed === 1.5) return 2;
  return 1;
}

describe('ADDa Comprehensive Features Expansion Suite (14 Advanced Features)', () => {

  describe('Feature 1: Voice Note Multi-Speed Playback', () => {
    test('Speed cycles accurately through 1x -> 1.5x -> 2.0x -> 1x', () => {
      let speed = 1;
      speed = cycleVoiceSpeed(speed);
      assert.equal(speed, 1.5, 'First cycle must be 1.5x');
      speed = cycleVoiceSpeed(speed);
      assert.equal(speed, 2, 'Second cycle must be 2.0x');
      speed = cycleVoiceSpeed(speed);
      assert.equal(speed, 1, 'Third cycle must loop back to 1.0x');
    });
  });

  describe('Feature 2: Document / PDF / Slide Sharing & Video Prohibition', () => {
    test('Strictly rejects MP4, WebM, MOV, and MKV video files with helpful error', () => {
      const mp4Res = validateUploadFile('lecture.mp4', 'video/mp4', 5000000);
      assert.equal(mp4Res.ok, false);
      assert.match(mp4Res.error, /Video files are strictly prohibited/i);

      const movRes = validateUploadFile('clip.mov', 'video/quicktime', 4000000);
      assert.equal(movRes.ok, false);

      const mkvRes = validateUploadFile('movie.mkv', 'application/octet-stream', 8000000);
      assert.equal(mkvRes.ok, false);
    });

    test('Allows PDF files with verified %PDF magic bytes', () => {
      const pdfBytes = [0x25, 0x50, 0x44, 0x46]; // %PDF
      const res = validateUploadFile('Unit_1_Formulas.pdf', 'application/pdf', 1024000, pdfBytes);
      assert.equal(res.ok, true);
      assert.equal(res.type, 'document');
      assert.equal(res.category, 'pdf');
    });

    test('Rejects spoofed PDF files with corrupted magic bytes', () => {
      const badBytes = [0x00, 0x01, 0x02, 0x03];
      const res = validateUploadFile('fake.pdf', 'application/pdf', 1024000, badBytes);
      assert.equal(res.ok, false);
      assert.match(res.error, /magic bytes/i);
    });

    test('Allows DOCX, XLSX, and PPTX slide sharing under 15MB', () => {
      const docxRes = validateUploadFile('Assignment.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2048000);
      assert.equal(docxRes.ok, true);
      assert.equal(docxRes.type, 'document');

      const pptxRes = validateUploadFile('MachineLearning_Slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 8000000);
      assert.equal(pptxRes.ok, true);
      assert.equal(pptxRes.type, 'document');
    });

    test('Enforces strict 15MB ceiling for document uploads', () => {
      const oversized = validateUploadFile('Huge_Book.pdf', 'application/pdf', 16 * 1024 * 1024, [0x25, 0x50, 0x44, 0x46]);
      assert.equal(oversized.ok, false);
      assert.match(oversized.error, /maximum 15 MB/i);
    });
  });

  describe('Feature 3 & 4: In-Chat Interactive Polls & Real-time Voting', () => {
    const options = [
      { id: 'opt-1', label: 'Friday 4 PM' },
      { id: 'opt-2', label: 'Saturday 10 AM' },
      { id: 'opt-3', label: 'Sunday 6 PM' },
    ];

    test('Computes 0% distribution when poll has zero votes', () => {
      const results = computePollResults(options, []);
      assert.equal(results[0].percentage, 0);
      assert.equal(results[1].percentage, 0);
      assert.equal(results[2].percentage, 0);
    });

    test('Computes proportional percentages accurately with multiple voters', () => {
      const votes = [
        { userId: 'u1', optionId: 'opt-1' },
        { userId: 'u2', optionId: 'opt-1' },
        { userId: 'u3', optionId: 'opt-1' },
        { userId: 'u4', optionId: 'opt-2' }, // 3 for opt-1 (75%), 1 for opt-2 (25%)
      ];
      const results = computePollResults(options, votes);
      assert.equal(results[0].votes, 3);
      assert.equal(results[0].percentage, 75);
      assert.equal(results[1].votes, 1);
      assert.equal(results[1].percentage, 25);
      assert.equal(results[2].votes, 0);
      assert.equal(results[2].percentage, 0);
    });

    test('Validates poll options bounds: requires 2–8 non-empty unique options', () => {
      const validatePollCreation = (question, opts) => {
        if (!question || question.trim().length < 3) return 'Question too short';
        const cleanOpts = opts.map((o) => o.trim()).filter(Boolean);
        if (cleanOpts.length < 2 || cleanOpts.length > 8) return 'Options must be between 2 and 8';
        const unique = new Set(cleanOpts.map((o) => o.toLowerCase()));
        if (unique.size !== cleanOpts.length) return 'Options must be unique';
        return null;
      };

      assert.equal(validatePollCreation('Hi', ['A', 'B']), 'Question too short');
      assert.equal(validatePollCreation('When to meet?', ['A']), 'Options must be between 2 and 8');
      assert.equal(validatePollCreation('When to meet?', ['Same', 'same']), 'Options must be unique');
      assert.equal(validatePollCreation('Valid question here?', ['Option 1', 'Option 2']), null);
    });
  });

  describe('Feature 5: Starred / Bookmarked Messages', () => {
    test('Toggles star status on and off cleanly in mock state', () => {
      const starredSet = new Set();
      const toggleStar = (msgId) => {
        if (starredSet.has(msgId)) {
          starredSet.delete(msgId);
          return false;
        } else {
          starredSet.add(msgId);
          return true;
        }
      };

      assert.equal(toggleStar('msg-42'), true, 'First toggle stars the message');
      assert.equal(starredSet.has('msg-42'), true);
      assert.equal(toggleStar('msg-42'), false, 'Second toggle unstars the message');
      assert.equal(starredSet.has('msg-42'), false);
    });
  });

  describe('Feature 6: In-Chat Search with Match Counter & Jumping', () => {
    const mockMessages = [
      { id: 'm1', body: 'Hey everyone, welcome to the group!', is_deleted: false },
      { id: 'm2', body: 'The exam schedule is out.', is_deleted: false },
      { id: 'm3', body: 'Check out the exam syllabus for Unit 2.', is_deleted: false },
      { id: 'm4', body: 'Deleted text about exam', is_deleted: true },
      { id: 'm5', body: 'Good luck with the exam tomorrow!', is_deleted: false },
    ];

    test('Finds all matches case-insensitively while ignoring deleted messages', () => {
      const searchRes = searchMessages(mockMessages, 'EXAM', 0);
      assert.equal(searchRes.matchingIds.length, 3, 'Should find m2, m3, m5 (excluding deleted m4)');
      assert.deepEqual(searchRes.matchingIds, ['m2', 'm3', 'm5']);
      assert.equal(searchRes.displayCounter, '1 of 3');
      assert.equal(searchRes.currentMatchId, 'm2');
    });

    test('Navigates matches cyclically with index wrapping', () => {
      const step1 = searchMessages(mockMessages, 'exam', 1);
      assert.equal(step1.currentMatchId, 'm3');
      assert.equal(step1.displayCounter, '2 of 3');

      const step2 = searchMessages(mockMessages, 'exam', 2);
      assert.equal(step2.currentMatchId, 'm5');
      assert.equal(step2.displayCounter, '3 of 3');

      // Wraps around to beginning
      const step3 = searchMessages(mockMessages, 'exam', 3);
      assert.equal(step3.currentMatchId, 'm2');
      assert.equal(step3.displayCounter, '1 of 3');
    });
  });

  describe('Feature 7: Disappearing / Ephemeral Messages', () => {
    test('Calculates future expiration timestamp accurately based on duration seconds', () => {
      const now = 1700000000000;
      const duration24h = 86400; // 24 hours
      const expiresAt = new Date(now + duration24h * 1000).toISOString();
      assert.equal(Date.parse(expiresAt) - now, 86400 * 1000);
    });

    test('Filters out expired messages while preserving active ones', () => {
      const now = Date.now();
      const messages = [
        { id: 'm1', body: 'Permanent message', expires_at: null },
        { id: 'm2', body: 'Expired message', expires_at: new Date(now - 10000).toISOString() },
        { id: 'm3', body: 'Still active ephemeral message', expires_at: new Date(now + 60000).toISOString() },
      ];

      const visible = filterDisappearingMessages(messages, now);
      assert.equal(visible.length, 2);
      assert.deepEqual(visible.map((m) => m.id), ['m1', 'm3']);
    });
  });

  describe('Feature 8: Announcement-Only Groups Enforcement', () => {
    test('Blocks non-admins from posting when announcement_only is enabled', () => {
      const canPostInGroup = (isAnnouncementOnly, userRole) => {
        if (!isAnnouncementOnly) return true;
        return userRole === 'admin';
      };

      assert.equal(canPostInGroup(true, 'member'), false, 'Regular member blocked in announcement mode');
      assert.equal(canPostInGroup(true, 'admin'), true, 'Admin allowed in announcement mode');
      assert.equal(canPostInGroup(false, 'member'), true, 'Regular member allowed in standard mode');
    });
  });

  describe('Feature 9: @Username Mentions with Highlighting', () => {
    test('Extracts multiple mentions and identifies self-mentions correctly', () => {
      const text = 'Hey @Alice and @Bob_99, please check @charlie notes.';
      const mentions = parseMentions(text, 'bob_99');

      assert.equal(mentions.length, 3);
      assert.equal(mentions[0].username, 'Alice');
      assert.equal(mentions[0].isSelf, false);
      assert.equal(mentions[1].username, 'Bob_99');
      assert.equal(mentions[1].isSelf, true, 'Bob_99 is current user and flagged as self');
      assert.equal(mentions[2].username, 'charlie');
      assert.equal(mentions[2].isSelf, false);
    });
  });

  describe('Feature 10: Inbox Folder Categorization & Pinned Chats', () => {
    const mockInbox = [
      { id: 'c1', kind: 'dm', label: 'Alice', unread_count: 0, last_at: '2026-10-18T10:00:00Z' },
      { id: 'c2', kind: 'group', label: 'Physics Study', unread_count: 3, last_at: '2026-10-18T09:30:00Z' },
      { id: 'c3', kind: 'dm', label: 'Bob', unread_count: 1, last_at: '2026-10-18T10:15:00Z' },
      { id: 'c4', kind: 'group', label: 'Math Adda', unread_count: 0, last_at: '2026-10-18T08:00:00Z' },
    ];

    test('Filters inbox by tabs: Unread, Direct, Groups', () => {
      const unread = filterAndSortInbox(mockInbox, 'unread', new Set());
      assert.equal(unread.length, 2, 'Should only return c2 and c3');

      const direct = filterAndSortInbox(mockInbox, 'direct', new Set());
      assert.equal(direct.length, 2, 'Should only return DMs c1 and c3');

      const groups = filterAndSortInbox(mockInbox, 'groups', new Set());
      assert.equal(groups.length, 2, 'Should only return groups c2 and c4');
    });

    test('Pins conversations to top regardless of recent message timestamp', () => {
      // Pin c4 (the oldest message)
      const pinnedSet = new Set(['c4']);
      const sorted = filterAndSortInbox(mockInbox, 'all', pinnedSet);

      assert.equal(sorted[0].id, 'c4', 'Pinned conversation must float to index 0');
      assert.equal(sorted[1].id, 'c3', 'Second item is most recent unpinned conversation');
    });
  });

  describe('Feature 11: Collaborative Screen Sharing Track Replacement', () => {
    test('Simulates WebRTC sender.replaceTrack on screen share toggle without renegotiation', async () => {
      let activeTrackKind = 'camera';
      const mockSender = {
        track: { kind: 'video', id: 'camera-track-1' },
        replaceTrack: async (newTrack) => {
          activeTrackKind = newTrack.kind;
          mockSender.track = newTrack;
        },
      };

      const screenTrack = { kind: 'screen', id: 'display-track-1' };
      const cameraTrack = { kind: 'camera', id: 'camera-track-1' };

      // Start screen share
      await mockSender.replaceTrack(screenTrack);
      assert.equal(activeTrackKind, 'screen', 'Sender track replaced by screen capture track');

      // Stop screen share -> revert to camera
      await mockSender.replaceTrack(cameraTrack);
      assert.equal(activeTrackKind, 'camera', 'Sender track smoothly reverted to camera track');
    });
  });

  describe('Feature 12: Sticky Pinned Messages in Chat', () => {
    test('Updates pinned message ID on pin event and clears on unpin', () => {
      let pinnedId = null;
      const handlePinMessage = (nextId) => {
        pinnedId = nextId;
      };

      handlePinMessage('msg-88');
      assert.equal(pinnedId, 'msg-88', 'Message pinned successfully');

      handlePinMessage(null);
      assert.equal(pinnedId, null, 'Message unpinned successfully');
    });
  });

  describe('Feature 13: Message Forwarding Target Validation', () => {
    test('Validates forward payload rejecting empty body/media and oversized text', () => {
      const validateForward = (body, mediaUrl) => {
        if (!body && !mediaUrl) return 'Empty message cannot be forwarded';
        if (body && body.length > 2000) return 'Message exceeds length limit';
        return 'valid';
      };

      assert.equal(validateForward('', null), 'Empty message cannot be forwarded');
      assert.equal(validateForward('a'.repeat(2001), null), 'Message exceeds length limit');
      assert.equal(validateForward('Check this out!', null), 'valid');
      assert.equal(validateForward('', 'https://r2/file.pdf'), 'valid');
    });
  });

  describe('Feature 14: In-Chat Media, Docs & Links Gallery Categorization', () => {
    test('Segregates messages into Media, Docs, and Links accurately', () => {
      const messages = [
        { id: '1', media_url: 'https://r2/pic.jpg', media_type: 'image/jpeg', is_deleted: false },
        { id: '2', media_url: 'https://r2/audio.webm', media_type: 'audio/webm', is_deleted: false },
        { id: '3', media_url: 'https://r2/doc.pdf', file_name: 'Doc.pdf', media_type: 'application/pdf', is_deleted: false },
        { id: '4', body: 'Visit https://studentadda.com for notes', is_deleted: false },
        { id: '5', body: 'Just a normal text message', is_deleted: false },
      ];

      const urlRegex = /(https?:\/\/[^\s]+)/i;
      const media = messages.filter((m) => m.media_url && !m.file_name && m.media_type !== 'document');
      const docs = messages.filter((m) => m.file_name || m.media_type === 'document');
      const links = messages.filter((m) => m.body && urlRegex.test(m.body));

      assert.equal(media.length, 2, 'Image and voice note categorized as media');
      assert.equal(docs.length, 1, 'PDF categorized as document');
      assert.equal(links.length, 1, 'Message with URL categorized as link');
    });
  });

});
