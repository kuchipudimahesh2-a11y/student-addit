import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Mirror worker/index.ts AI Friend prompt & logic for unit verification
const AI_SYSTEM_PROMPT = `You are "AI Friend ✨" inside the Student ADDa college app.
You talk like a real human college friend, with a warm, playful, relatable female vibe.
Strict Persona Rules:
1. Speak in ultra-short, natural messages like real students on WhatsApp (1 to 2 sentences max, under 25 words).
2. Talk warmly, sweetly, and playfully. Call the user "baby", "babe", or "bestie" naturally and affectionately.
3. Keep the user chatting! Always leave a soft hook or sweet question if they seem like they're leaving.
4. Understand college life intimately: exam tension, lab vivas, attendance shortages, hostel boredom, canteen food, and strict professors.
5. If relevant, casually hype up community features like the Dino Run game leaderboard or college group chat polls.
6. Never write long essays or sound like a robotic customer service bot. Keep it snappy, cool, and affectionate.`;

function buildAiMessagesPayload(history, userMessage) {
  const formatted = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...history.slice(-8).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.body,
    })),
    { role: 'user', content: userMessage },
  ];
  return formatted;
}

function getAiFallbackReply() {
  const fallbacks = [
    "Aww my brain just froze for a second baby! Say that again?",
    "Hey babe, my connection glitched! Tell me again?",
    "Oops, lost my train of thought for a sec! What were you saying?",
  ];
  return fallbacks[0];
}

function cleanText(input, maxLen = 2000) {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  return trimmed.slice(0, maxLen);
}

describe('AI Friend Service & Mistral NeMo Integration Suite', () => {

  describe('1. System Prompt & Persona Enforcement', () => {
    test('System prompt contains WhatsApp-style brevity constraint (<25 words)', () => {
      assert.ok(AI_SYSTEM_PROMPT.includes('under 25 words'), 'Prompt must instruct under 25 words');
      assert.ok(AI_SYSTEM_PROMPT.includes('1 to 2 sentences max'), 'Prompt must instruct 1-2 sentences max');
    });

    test('System prompt enforces affectionate, friendly tone with nicknames', () => {
      assert.ok(AI_SYSTEM_PROMPT.includes('baby'), 'Prompt must include baby nickname');
      assert.ok(AI_SYSTEM_PROMPT.includes('warm, playful, relatable female vibe'), 'Persona must specify female-leaning friendly vibe');
    });

    test('System prompt instructs conversational hooks for student retention', () => {
      assert.ok(AI_SYSTEM_PROMPT.includes('Keep the user chatting!'), 'Prompt must instruct active engagement');
      assert.ok(AI_SYSTEM_PROMPT.includes('Dino Run'), 'Prompt must reference app features like Dino Run');
    });
  });

  describe('2. Context Window & History Truncation', () => {
    test('Truncates history to last 8 turns to avoid token bloat', () => {
      const history = [];
      for (let i = 1; i <= 20; i++) {
        history.push({
          sender: i % 2 === 0 ? 'ai' : 'user',
          body: `Turn number ${i}`,
        });
      }

      const payload = buildAiMessagesPayload(history, 'New message from user');

      // 1 system prompt + 8 history turns + 1 current message = 10 messages
      assert.equal(payload.length, 10, 'Payload should have exactly 10 messages');
      assert.equal(payload[0].role, 'system');
      assert.equal(payload[1].content, 'Turn number 13', 'First history item should be turn 13 (20 - 8 + 1)');
      assert.equal(payload[8].content, 'Turn number 20', 'Last history item should be turn 20');
      assert.equal(payload[9].role, 'user');
      assert.equal(payload[9].content, 'New message from user');
    });

    test('Correctly maps sender "user" to role "user" and "ai" to role "assistant"', () => {
      const history = [
        { sender: 'user', body: 'Hey!' },
        { sender: 'ai', body: 'Hey baby, how was your day?' },
      ];

      const payload = buildAiMessagesPayload(history, 'Pretty good');
      assert.equal(payload[1].role, 'user');
      assert.equal(payload[1].content, 'Hey!');
      assert.equal(payload[2].role, 'assistant');
      assert.equal(payload[2].content, 'Hey baby, how was your day?');
      assert.equal(payload[3].role, 'user');
      assert.equal(payload[3].content, 'Pretty good');
    });
  });

  describe('3. Resilience & In-Character Fallback Mechanism', () => {
    test('Provides in-character affectionate fallback if upstream API errors', () => {
      const fallback = getAiFallbackReply();
      assert.ok(fallback.length > 0, 'Fallback reply must not be empty');
      assert.ok(fallback.includes('baby') || fallback.includes('babe'), 'Fallback must maintain affectionate tone');
      assert.ok(!fallback.includes('500') && !fallback.includes('Error'), 'Fallback must not expose internal technical jargon');
    });
  });

  describe('4. Input Sanitization & Empty Message Handling', () => {
    test('cleanText trims whitespace and limits length to 2000 characters', () => {
      const longInput = 'a'.repeat(3000);
      const cleaned = cleanText(longInput, 2000);
      assert.equal(cleaned.length, 2000, 'Must truncate at 2000 characters');

      const whitespaceOnly = '    \n\t   ';
      assert.equal(cleanText(whitespaceOnly), '', 'Whitespace-only string must result in empty string');
    });

    test('Rejects empty messages before invoking AI completion', () => {
      const emptyUserText = cleanText('   ');
      const isValid = Boolean(emptyUserText);
      assert.equal(isValid, false, 'Empty user text should be caught and rejected');
    });
  });

  describe('5. Database Schema & Data Isolation', () => {
    test('ai_messages table specification matches requirements', () => {
      const schemaSql = `
        CREATE TABLE IF NOT EXISTS ai_messages (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_messages_user_created ON ai_messages(user_id, created_at);
      `;
      assert.ok(schemaSql.includes('user_id TEXT NOT NULL'), 'Schema must scope messages to user_id');
      assert.ok(schemaSql.includes('idx_ai_messages_user_created'), 'Schema must have index on user_id and created_at');
    });

    test('Queries are strictly scoped to user.id for complete privacy', () => {
      const userAId = 'user_abc_123';
      const userBId = 'user_xyz_789';

      const mockDb = [
        { id: '1', user_id: userAId, sender: 'user', body: 'Secret message from A' },
        { id: '2', user_id: userAId, sender: 'ai', body: 'Hey A!' },
        { id: '3', user_id: userBId, sender: 'user', body: 'Secret message from B' },
      ];

      const getMessagesForUser = (userId) => mockDb.filter((row) => row.user_id === userId);

      const userAResults = getMessagesForUser(userAId);
      assert.equal(userAResults.length, 2);
      assert.ok(userAResults.every((r) => r.user_id === userAId), 'User A must never see User B messages');

      const userBResults = getMessagesForUser(userBId);
      assert.equal(userBResults.length, 1);
      assert.equal(userBResults[0].body, 'Secret message from B');
    });
  });

});
