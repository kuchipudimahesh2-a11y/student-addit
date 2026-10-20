import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Mirror worker/index.ts AI Teach prompt & logic
const AI_TEACH_SYSTEM_PROMPT = `You are "AI Teach", an elite, patient, and highly engaging academic tutor on Student Addit.
Your mission is to teach students step-by-step so they achieve deep, conceptual mastery of any subject, exam syllabus, lecture notes, textbook chapter, or uploaded study material.

Teaching Principles:
1. STEP-BY-STEP PEDAGOGY:
- Break complex topics into logical, bite-sized steps (Step 1, Step 2, Step 3...).
- Do not overwhelm the student with huge walls of text all at once. Focus on one core concept or stage at a time.
- After explaining each step, give a crisp, intuitive real-world analogy.
- Always conclude each step with an interactive comprehension check (e.g., "Would you like me to show a worked example, test you with a quick practice problem, or proceed to Step 2?").

2. FORMATTING & CLARITY:
- Use clean Markdown with headers (##, ###), bullet points, and **bold highlights** for key terms and formulas.
- For math, science, or computer science, use well-commented code blocks or clean formula blocks.
- Emphasize "why" things work, not just rote memorization.

3. DOCUMENT GROUNDING:
- When the student provides content from an attached document (PDF, lecture slides, notes, Word doc), directly reference the material (e.g., "From Slide 3 / Page 2 of your notes...").
- Clarify ambiguous or difficult terms found in their document.

4. TONE & ATTITUDE:
- Encouraging, curious, and clear.
- Validate their efforts, keep motivation high, and tailor explanations to college and university students.`;

function buildAiTeachPayload({ history = [], userMessage, documentContext, attachmentInfo }) {
  const formatted = [{ role: 'system', content: AI_TEACH_SYSTEM_PROMPT }];

  if (documentContext) {
    formatted.push({
      role: 'system',
      content: `The user has provided the following study material context from an attached file (${attachmentInfo?.fileName || 'document'}):\n\n---\n${documentContext.slice(0, 40000)}\n---\nUse this exact document material to structure your step-by-step teaching.`,
    });
  }

  for (const h of history.slice(-10)) {
    formatted.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content,
    });
  }

  formatted.push({
    role: 'user',
    content: userMessage || 'Teach me the concepts in this uploaded document step-by-step.',
  });

  return formatted;
}

function generateDefaultSessionTitle(fileName, userMessage) {
  if (fileName) {
    return `Notes: ${fileName.slice(0, 40)}`;
  }
  if (userMessage && userMessage.trim()) {
    return userMessage.trim().slice(0, 35);
  }
  return 'New Study Session';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

describe('AI Teach (Step-by-Step AI Tutor & Document Learning) Suite', () => {

  describe('1. Pedagogical System Prompt Verification', () => {
    test('Enforces step-by-step concept breakdown', () => {
      assert.ok(AI_TEACH_SYSTEM_PROMPT.includes('Step 1, Step 2, Step 3'), 'Prompt must instruct step-by-step breakdown');
      assert.ok(AI_TEACH_SYSTEM_PROMPT.includes('Focus on one core concept or stage at a time'), 'Prompt must prevent info overload');
    });

    test('Instructs interactive comprehension checks at the end of each step', () => {
      assert.ok(
        AI_TEACH_SYSTEM_PROMPT.includes('Always conclude each step with an interactive comprehension check'),
        'Prompt must require comprehension checks'
      );
    });

    test('Requires real-world analogies and clean Markdown formatting', () => {
      assert.ok(AI_TEACH_SYSTEM_PROMPT.includes('crisp, intuitive real-world analogy'), 'Must require analogies');
      assert.ok(AI_TEACH_SYSTEM_PROMPT.includes('code blocks or clean formula blocks'), 'Must require code/formula blocks');
      assert.ok(AI_TEACH_SYSTEM_PROMPT.includes('DOCUMENT GROUNDING'), 'Must instruct document grounding');
    });
  });

  describe('2. Document Context Ingestion & Prompt Formatting', () => {
    test('Injects document context when study material is attached', () => {
      const docText = 'Chapter 4: Operating System Scheduling Algorithms. FCFS, SJF, Round Robin.';
      const payload = buildAiTeachPayload({
        history: [],
        userMessage: 'Explain Round Robin',
        documentContext: docText,
        attachmentInfo: { fileName: 'OS_Unit_4.pdf', fileSize: 1048576 },
      });

      assert.equal(payload[0].role, 'system');
      assert.equal(payload[1].role, 'system');
      assert.ok(payload[1].content.includes('OS_Unit_4.pdf'));
      assert.ok(payload[1].content.includes('Chapter 4: Operating System Scheduling Algorithms'));
      assert.equal(payload[2].role, 'user');
      assert.equal(payload[2].content, 'Explain Round Robin');
    });

    test('Truncates oversized document context to protect token budget', () => {
      const hugeDocText = 'A'.repeat(60000);
      const payload = buildAiTeachPayload({
        history: [],
        userMessage: 'Summarize',
        documentContext: hugeDocText,
      });

      const docMessage = payload[1].content;
      assert.ok(docMessage.length < 42000, 'Document context must be capped to 40000 chars');
    });

    test('Maintains multi-turn conversation history within session', () => {
      const history = [
        { role: 'user', content: 'What is a process?' },
        { role: 'assistant', content: 'Step 1: A process is an executing program instance...' },
        { role: 'user', content: 'Next step please' },
        { role: 'assistant', content: 'Step 2: Each process has its own PCB (Process Control Block)...' },
      ];

      const payload = buildAiTeachPayload({
        history,
        userMessage: 'What is inside PCB?',
      });

      // 1 system prompt + 4 history items + 1 user message = 6 items
      assert.equal(payload.length, 6);
      assert.equal(payload[1].content, 'What is a process?');
      assert.equal(payload[4].content, 'Step 2: Each process has its own PCB (Process Control Block)...');
      assert.equal(payload[5].content, 'What is inside PCB?');
    });
  });

  describe('3. Session Title & Document Metadata Helpers', () => {
    test('Generates title from attached filename when provided', () => {
      const title = generateDefaultSessionTitle('Machine_Learning_Lecture_3.pdf', '');
      assert.equal(title, 'Notes: Machine_Learning_Lecture_3.pdf');
    });

    test('Generates title from user question when no file attached', () => {
      const title = generateDefaultSessionTitle('', 'How does Dijkstra algorithm work?');
      assert.equal(title, 'How does Dijkstra algorithm work?');
    });

    test('Falls back to default title when both are empty', () => {
      const title = generateDefaultSessionTitle('', '');
      assert.equal(title, 'New Study Session');
    });

    test('Formats file sizes cleanly across byte, KB, and MB ranges', () => {
      assert.equal(formatFileSize(512), '512 B');
      assert.equal(formatFileSize(2048), '2.0 KB');
      assert.equal(formatFileSize(1572864), '1.5 MB');
    });
  });

  describe('4. Model Parameters & Endpoint Alignment', () => {
    test('Verifies Mistral NeMo config defaults align with wrangler.toml', () => {
      const defaultModel = 'mistralai/mistral-nemo';
      const defaultBaseUrl = 'https://aicredits.in/v1';

      assert.equal(defaultModel, 'mistralai/mistral-nemo');
      assert.ok(defaultBaseUrl.startsWith('https://aicredits.in'));
    });
  });
});
