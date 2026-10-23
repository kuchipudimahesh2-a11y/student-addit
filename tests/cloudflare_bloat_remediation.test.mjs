import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('Cloudflare Bloat Remediation Verification Suite', async (t) => {
  await t.test('1. Queue Consumer Configuration is Batched', () => {
    const wranglerContent = fs.readFileSync(path.join(projectRoot, 'wrangler.toml'), 'utf8');
    assert.match(wranglerContent, /queue\s*=\s*"adda-push-delivery"[\s\S]*?max_batch_size\s*=\s*25/, 'Queue consumer must batch up to 25 items');
    assert.match(wranglerContent, /queue\s*=\s*"adda-push-delivery"[\s\S]*?max_concurrency\s*=\s*5/, 'Queue consumer must allow concurrency >= 5');
  });

  await t.test('2. Service Worker does not bypass Edge Cache with no-store', () => {
    const swContent = fs.readFileSync(path.join(projectRoot, 'public', 'sw.js'), 'utf8');
    assert.doesNotMatch(swContent, /fetch\([^)]*cache:\s*['"]no-store['"]/, 'Service worker fetches must not enforce cache: no-store');
  });

  await t.test('3. ChatRoom Durable Object Broadcasts Typing In-Memory', () => {
    const workerContent = fs.readFileSync(path.join(projectRoot, 'worker', 'index.ts'), 'utf8');
    const typingIndex = workerContent.indexOf("action === 'typing'");
    const dmIndex = workerContent.indexOf("SELECT pair_low, pair_high FROM dm_conversations");
    assert.ok(typingIndex > -1, 'action === typing must exist in worker');
    assert.ok(typingIndex < dmIndex, 'action === typing must be evaluated BEFORE querying dm_conversations in D1');
  });

  await t.test('4. GET Messages Endpoints are Read-Only (No D1 Mutations)', () => {
    const workerContent = fs.readFileSync(path.join(projectRoot, 'worker', 'index.ts'), 'utf8');
    const getGroupMessagesIndex = workerContent.indexOf("if (action === 'messages' && request.method === 'GET')");
    const getDmMessagesIndex = workerContent.indexOf("if (dmPath[2] === 'messages' && request.method === 'GET')");
    
    // Check next 200 chars after both GET handlers to ensure no INSERT into chat_read_states
    const groupSnippet = workerContent.slice(getGroupMessagesIndex, getGroupMessagesIndex + 300);
    const dmSnippet = workerContent.slice(getDmMessagesIndex, getDmMessagesIndex + 300);
    
    assert.doesNotMatch(groupSnippet, /INSERT INTO chat_read_states/, 'Group GET messages must not write to chat_read_states');
    assert.doesNotMatch(dmSnippet, /INSERT INTO chat_read_states/, 'DM GET messages must not write to chat_read_states');
  });

  await t.test('5. Voice Note Player Uses preload="none" to Prevent Byte Range Storm', () => {
    const chatContent = fs.readFileSync(path.join(projectRoot, 'src', 'CommunityChats.tsx'), 'utf8');
    assert.match(chatContent, /<audio[^>]*preload="none"/, 'Voice note audio must use preload="none"');
    assert.doesNotMatch(chatContent, /<audio[^>]*preload="metadata"/, 'Voice note audio must not use preload="metadata"');
  });

  await t.test('6. Link Preview Component Includes Client In-Memory Cache', () => {
    const chatContent = fs.readFileSync(path.join(projectRoot, 'src', 'CommunityChats.tsx'), 'utf8');
    assert.match(chatContent, /const linkPreviewCache\s*=\s*new Map/, 'Link preview cache map must exist');
    assert.match(chatContent, /linkPreviewCache\.get\(url\)/, 'LinkPreviewCard must check cache before network fetch');
  });

  await t.test('7. Chat Socket Pool Retains Up to 6 Rooms', () => {
    const chatContent = fs.readFileSync(path.join(projectRoot, 'src', 'CommunityChats.tsx'), 'utf8');
    assert.match(chatContent, /chatSocketPool\.size\s*>=\s*6/, 'Socket pool must allow up to 6 concurrent chat rooms before eviction');
  });

  await t.test('8. TURN Credential Generator Caches in Memory', () => {
    const voiceContent = fs.readFileSync(path.join(projectRoot, 'worker', 'voice-calls.ts'), 'utf8');
    assert.match(voiceContent, /cachedIceServers/, 'Voice call service must store cachedIceServers in memory');
    assert.match(voiceContent, /Date\.now\(\)\s*<\s*cachedIceServers\.expiresAt/, 'Voice calls must return cached ICE servers within validity window');
  });

  await t.test('9. PWA Static Assets have Cache-Control Headers', () => {
    const workerContent = fs.readFileSync(path.join(projectRoot, 'worker', 'index.ts'), 'utf8');
    assert.match(workerContent, /url\.pathname\.startsWith\('\/icons\/'\)\s*\|\|\s*url\.pathname\s*===\s*'\/manifest\.webmanifest'/, 'Worker must handle PWA icons and manifest');
    assert.match(workerContent, /cache-control['"]?,\s*['"]public,\s*max-age=86400/, 'PWA icons must have public max-age cache header');
  });

  await t.test('10. WebSocket Ping Intervals allow DO Hibernation', () => {
    const chatContent = fs.readFileSync(path.join(projectRoot, 'src', 'CommunityChats.tsx'), 'utf8');
    const appContent = fs.readFileSync(path.join(projectRoot, 'src', 'App.tsx'), 'utf8');
    assert.match(chatContent, /50_000\);/, 'CommunityChats ping interval must be >= 50s');
    assert.match(appContent, /50_000\);/, 'App.tsx random chat ping interval must be >= 50s');
  });
});
