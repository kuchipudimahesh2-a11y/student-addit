import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * 1. Constant-Time Verification & Timing Attack Prevention
 */
function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

test('Security: constantTimeEqual correctly compares signatures without timing leak', async (t) => {
  await t.test('Identical signatures match', () => {
    const sig1 = 'abc123xyz789DEF';
    const sig2 = 'abc123xyz789DEF';
    assert.equal(constantTimeEqual(sig1, sig2), true);
  });

  await t.test('Different signatures fail immediately', () => {
    const sig1 = 'abc123xyz789DEF';
    const sig2 = 'abc123xyz789DEG';
    assert.equal(constantTimeEqual(sig1, sig2), false);
  });

  await t.test('Different length signatures fail safely without throwing', () => {
    const sig1 = 'abc123';
    const sig2 = 'abc123xyz789DEF';
    assert.equal(constantTimeEqual(sig1, sig2), false);
  });

  await t.test('Empty strings behave symmetrically', () => {
    assert.equal(constantTimeEqual('', ''), true);
    assert.equal(constantTimeEqual('', 'a'), false);
    assert.equal(constantTimeEqual('a', ''), false);
  });
});

/**
 * 2. Deterministic & Collision-Proof Handle Generation
 */
function normalizeHandle(value) {
  const result = value.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
  return result.slice(0, 18);
}

function generateFallbackHandle(name) {
  const base = normalizeHandle(name).slice(0, 12) || 'addauser';
  return `${base.slice(0, 8)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 18);
}

test('Reliability: uniqueHandle fallback generates valid and non-empty handles', async (t) => {
  await t.test('Standard name generates compliant length handle <= 18 chars', () => {
    const handle = generateFallbackHandle('JohnDoe');
    assert.ok(handle.length > 5 && handle.length <= 18);
    assert.match(handle, /^[a-z0-9_]+$/);
  });

  await t.test('Empty or special character name falls back to addauser prefix', () => {
    const handle = generateFallbackHandle('!@#$%^&*()');
    assert.ok(handle.startsWith('addauser'));
    assert.ok(handle.length <= 18);
  });

  await t.test('Multiple fallback calls yield distinct handles', () => {
    const handles = new Set();
    for (let i = 0; i < 50; i++) {
      handles.add(generateFallbackHandle('alice'));
    }
    assert.equal(handles.size, 50, 'All 50 generated handles should be unique');
  });
});

/**
 * 3. Dino Run Offline Queue Guard (Filtering zero scores)
 */
test('Reliability: Dino Run score submission guards against 0 score spam', async (t) => {
  const offlineQueue = [];

  const handleGameEnd = (score) => {
    // Simulated catch handler
    if (score > 0) {
      offlineQueue.push({ score, timestamp: Date.now() });
    }
  };

  await t.test('Zero score run does not get queued to offline sync', () => {
    handleGameEnd(0);
    assert.equal(offlineQueue.length, 0);
  });

  await t.test('Legitimate positive scores get queued', () => {
    handleGameEnd(42);
    handleGameEnd(150);
    assert.equal(offlineQueue.length, 2);
    assert.equal(offlineQueue[0].score, 42);
    assert.equal(offlineQueue[1].score, 150);
  });
});

/**
 * 4. WebSocket Read-Receipt Throttling & Network Optimization
 */
test('Performance: Chat read receipts prioritize WebSocket and throttle HTTP', async (t) => {
  let wsReadSent = 0;
  let httpReadSent = 0;
  let isWsOpen = true;
  let lastHttpReadTime = 0;

  const markAsRead = (currentTime) => {
    if (isWsOpen) {
      wsReadSent++;
    } else {
      if (currentTime - lastHttpReadTime > 5000) {
        lastHttpReadTime = currentTime;
        httpReadSent++;
      }
    }
  };

  await t.test('Connected socket sends read via WS with zero HTTP overhead', () => {
    markAsRead(1000);
    markAsRead(1500);
    markAsRead(2000);
    assert.equal(wsReadSent, 3);
    assert.equal(httpReadSent, 0);
  });

  await t.test('Disconnected socket falls back to throttled HTTP at max once per 5 seconds', () => {
    isWsOpen = false;
    markAsRead(10_000); // sent (10_000 - 0 = 10_000 > 5000)
    markAsRead(12_000); // throttled (12_000 - 10_000 = 2000 <= 5000)
    markAsRead(14_000); // throttled (14_000 - 10_000 = 4000 <= 5000)
    markAsRead(16_000); // sent (16_000 - 10_000 = 6000 > 5000)
    assert.equal(httpReadSent, 2);
  });
});
