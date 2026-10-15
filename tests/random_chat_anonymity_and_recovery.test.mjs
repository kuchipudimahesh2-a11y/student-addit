import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// 1. Random Chat vs DM Push Notification Payload Generator (matches worker/voice-calls.ts dispatchCallPush)
function buildCallPushPayload(row, callerUsername) {
  const isRandom = row.scope === 'random';
  let callerName = 'Stranger';
  if (!isRandom) {
    callerName = callerUsername ? '#' + callerUsername : 'Someone';
  }
  const isVideo = row.call_mode === 'video';

  return {
    type: 'incoming_call',
    callId: row.id,
    caller: callerName,
    title: `${isVideo ? '📹 Incoming video call' : '📞 Incoming call'} from ${callerName}`,
    body: isRandom ? 'Tap to answer your Random Chat call on adda' : 'Tap to answer on adda',
    tag: `incoming-call-${row.id}`,
    data: {
      type: 'incoming_call',
      callId: row.id,
      callMode: isVideo ? 'video' : 'audio',
      scope: row.scope,
      url: `/?call=${encodeURIComponent(row.id)}`,
    },
  };
}

// 2. Mini-game Best Score Evaluation (matches src/App.tsx submitBest)
function evaluateBestScore(gameId, currentBest, newScore) {
  const isReaction = gameId === 'reaction-test';
  const isImprovement = currentBest === undefined || (isReaction ? newScore < currentBest : newScore > currentBest);
  return isImprovement ? newScore : currentBest;
}

// 3. Random Chat Session Reconnect Handler (matches worker/index.ts resumeMatch)
function handleRandomResume(existingSocket, requestedMatchId, activeMatchId) {
  if (!requestedMatchId || activeMatchId !== requestedMatchId) {
    return { outcome: 'reject', reason: 'session-expired' };
  }
  let closedPrevious = false;
  if (existingSocket && existingSocket.readyState === 1) { // WebSocket.OPEN
    closedPrevious = true;
    existingSocket.close(1000, 'Replaced by new connection');
  }
  return { outcome: 'resume', closedPrevious };
}

describe('Random Chat Anonymity & Resilience Verification Suite', () => {
  describe('1. Random Chat Calling Privacy & Push Anonymity', () => {
    test('Random voice call push notification strictly masks caller as Stranger', () => {
      const row = {
        id: 'call-101',
        scope: 'random',
        call_mode: 'audio',
      };
      const payload = buildCallPushPayload(row, 'john_doe_99');

      assert.equal(payload.caller, 'Stranger');
      assert.equal(payload.title, '📞 Incoming call from Stranger');
      assert.equal(payload.body, 'Tap to answer your Random Chat call on adda');
      assert.equal(payload.data.scope, 'random');
      assert.ok(!JSON.stringify(payload).includes('john_doe_99'), 'Real username must NEVER be leaked in Random Chat call push');
    });

    test('Random video call push notification strictly masks caller as Stranger with video title', () => {
      const row = {
        id: 'call-102',
        scope: 'random',
        call_mode: 'video',
      };
      const payload = buildCallPushPayload(row, 'alice_secret_id');

      assert.equal(payload.caller, 'Stranger');
      assert.equal(payload.title, '📹 Incoming video call from Stranger');
      assert.equal(payload.body, 'Tap to answer your Random Chat call on adda');
      assert.ok(!JSON.stringify(payload).includes('alice_secret_id'), 'Real username must NEVER be leaked in Random Video Call');
    });

    test('Private DM calls correctly display recipient username with hash', () => {
      const row = {
        id: 'call-103',
        scope: 'dm',
        call_mode: 'audio',
      };
      const payload = buildCallPushPayload(row, 'mahesh');

      assert.equal(payload.caller, '#mahesh');
      assert.equal(payload.title, '📞 Incoming call from #mahesh');
      assert.equal(payload.body, 'Tap to answer on adda');
    });
  });

  describe('2. Random Chat Reconnect Without already-active Lockout', () => {
    test('Reconnecting with existing open socket replaces previous connection cleanly', () => {
      const mockExistingSocket = {
        readyState: 1, // OPEN
        closedWith: null,
        close(code, reason) {
          this.readyState = 3; // CLOSED
          this.closedWith = { code, reason };
        },
      };

      const result = handleRandomResume(mockExistingSocket, 'match-456', 'match-456');

      assert.equal(result.outcome, 'resume');
      assert.equal(result.closedPrevious, true);
      assert.equal(mockExistingSocket.closedWith.code, 1000);
      assert.equal(mockExistingSocket.closedWith.reason, 'Replaced by new connection');
    });

    test('Mismatched matchId is rejected as session-expired', () => {
      const result = handleRandomResume(null, 'old-match', 'current-match');
      assert.equal(result.outcome, 'reject');
      assert.equal(result.reason, 'session-expired');
    });
  });

  describe('3. Mini-game Reaction Test Score Logic', () => {
    test('Reaction test retains lower score as personal best', () => {
      const firstRun = evaluateBestScore('reaction-test', undefined, 280);
      assert.equal(firstRun, 280);

      // Slower reaction (320ms) must NOT overwrite 280ms
      const secondRun = evaluateBestScore('reaction-test', firstRun, 320);
      assert.equal(secondRun, 280, 'Reaction test personal best must stay at fastest (lowest) time');

      // Faster reaction (240ms) must overwrite 280ms
      const thirdRun = evaluateBestScore('reaction-test', secondRun, 240);
      assert.equal(thirdRun, 240, 'Faster reaction time must become new personal best');
    });

    test('Standard games retain higher score as personal best', () => {
      const firstRun = evaluateBestScore('dino-run', undefined, 500);
      assert.equal(firstRun, 500);

      // Lower score (300) must NOT overwrite 500
      const secondRun = evaluateBestScore('dino-run', firstRun, 300);
      assert.equal(secondRun, 500);

      // Higher score (800) must overwrite 500
      const thirdRun = evaluateBestScore('dino-run', secondRun, 800);
      assert.equal(thirdRun, 800);
    });
  });
});
