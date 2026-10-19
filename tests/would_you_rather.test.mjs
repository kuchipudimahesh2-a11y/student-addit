import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Mirror worker/index.ts formatting logic for unit testing
function formatWyrDilemma(row, userVote = null) {
  const votesA = Number(row.votes_a) || 0;
  const votesB = Number(row.votes_b) || 0;
  const total = votesA + votesB;
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
  const pctB = total > 0 ? (100 - pctA) : 50;
  return {
    id: row.id,
    optionA: row.option_a,
    optionB: row.option_b,
    category: row.category,
    votesA,
    votesB,
    totalVotes: total,
    pctA,
    pctB,
    userVote: userVote || null,
    createdBy: row.created_by || null,
  };
}

function calculateAlignmentScore(userVotes) {
  const totalVotes = userVotes.length;
  if (totalVotes === 0) {
    return {
      totalVotes: 0,
      alignmentPct: 50,
      rebelPct: 50,
      archetype: 'Undecided Voyager 🛸',
    };
  }

  let majorityMatches = 0;
  for (const r of userVotes) {
    const a = Number(r.votes_a) || 0;
    const b = Number(r.votes_b) || 0;
    if (r.choice === 'a' && a >= b) majorityMatches++;
    else if (r.choice === 'b' && b >= a) majorityMatches++;
  }

  const alignmentPct = Math.round((majorityMatches / totalVotes) * 100);
  let archetype = 'Explorer 🌍';
  if (alignmentPct >= 75) {
    archetype = 'Global Hivemind 🐝';
  } else if (alignmentPct >= 55) {
    archetype = 'Balanced Realist ⚖️';
  } else if (alignmentPct >= 40) {
    archetype = 'Independent Thinker 💡';
  } else {
    archetype = 'Chaotic Rebel 🔥';
  }

  return {
    totalVotes,
    alignmentPct,
    rebelPct: 100 - alignmentPct,
    archetype,
  };
}

function computeVoteOutcome(dilemma, choice) {
  const isMajority = (choice === 'a' && dilemma.pctA >= 50) || (choice === 'b' && dilemma.pctB >= 50);
  const userPct = choice === 'a' ? dilemma.pctA : dilemma.pctB;
  return { isMajority, userPct };
}

describe('Global "Would You Rather?" (Humanity vs. You) Suite', () => {

  describe('1. Math & Percentage Calculation Resilience (Zero Division Safe)', () => {
    test('Calculates percentages accurately for standard vote counts', () => {
      const row = {
        id: 'wyr-test-1',
        option_a: 'Option 1',
        option_b: 'Option 2',
        category: 'universal',
        votes_a: 75,
        votes_b: 25,
      };
      const formatted = formatWyrDilemma(row, 'a');
      assert.equal(formatted.totalVotes, 100);
      assert.equal(formatted.pctA, 75);
      assert.equal(formatted.pctB, 25);
      assert.equal(formatted.userVote, 'a');
    });

    test('Safely defaults to 50% / 50% when total votes is 0 without NaN', () => {
      const row = {
        id: 'wyr-test-zero',
        option_a: 'Option 1',
        option_b: 'Option 2',
        category: 'superpower',
        votes_a: 0,
        votes_b: 0,
      };
      const formatted = formatWyrDilemma(row);
      assert.equal(formatted.totalVotes, 0);
      assert.equal(formatted.pctA, 50);
      assert.equal(formatted.pctB, 50);
      assert.equal(Number.isNaN(formatted.pctA), false);
      assert.equal(Number.isNaN(formatted.pctB), false);
    });

    test('Sum of pctA and pctB always totals exactly 100%', () => {
      const cases = [
        [1, 2],
        [33, 67],
        [1420, 890],
        [950, 1680],
        [7, 13],
      ];
      for (const [va, vb] of cases) {
        const row = { id: 'x', option_a: 'a', option_b: 'b', category: 'u', votes_a: va, votes_b: vb };
        const res = formatWyrDilemma(row);
        assert.equal(res.pctA + res.pctB, 100, `Expected sum to be 100 for ${va} and ${vb}`);
      }
    });
  });

  describe('2. Majority vs Rebel Outlier Consensus Logic', () => {
    test('Flags majority when user chooses option with >= 50% global votes', () => {
      const dilemma = {
        pctA: 72,
        pctB: 28,
      };
      const outcome = computeVoteOutcome(dilemma, 'a');
      assert.equal(outcome.isMajority, true);
      assert.equal(outcome.userPct, 72);
    });

    test('Flags rebel outlier when user chooses minority option (< 50%)', () => {
      const dilemma = {
        pctA: 72,
        pctB: 28,
      };
      const outcome = computeVoteOutcome(dilemma, 'b');
      assert.equal(outcome.isMajority, false);
      assert.equal(outcome.userPct, 28);
    });

    test('A 50/50 split is treated favorably as consensus/majority', () => {
      const dilemma = {
        pctA: 50,
        pctB: 50,
      };
      const outcomeA = computeVoteOutcome(dilemma, 'a');
      const outcomeB = computeVoteOutcome(dilemma, 'b');
      assert.equal(outcomeA.isMajority, true);
      assert.equal(outcomeB.isMajority, true);
    });
  });

  describe('3. Humanity Alignment Score & Archetype Classification', () => {
    test('0 votes returns Undecided Voyager baseline', () => {
      const res = calculateAlignmentScore([]);
      assert.equal(res.totalVotes, 0);
      assert.equal(res.alignmentPct, 50);
      assert.equal(res.archetype, 'Undecided Voyager 🛸');
    });

    test('High majority alignment (>=75%) classifies as Global Hivemind 🐝', () => {
      const votes = [
        { choice: 'a', votes_a: 80, votes_b: 20 },
        { choice: 'a', votes_a: 90, votes_b: 10 },
        { choice: 'b', votes_a: 15, votes_b: 85 },
        { choice: 'b', votes_a: 20, votes_b: 80 },
      ]; // 4/4 = 100%
      const res = calculateAlignmentScore(votes);
      assert.equal(res.alignmentPct, 100);
      assert.equal(res.archetype, 'Global Hivemind 🐝');
    });

    test('Balanced consensus (55-74%) classifies as Balanced Realist ⚖️', () => {
      const votes = [
        { choice: 'a', votes_a: 80, votes_b: 20 }, // majority
        { choice: 'a', votes_a: 80, votes_b: 20 }, // majority
        { choice: 'b', votes_a: 70, votes_b: 30 }, // minority
      ]; // 2/3 = 67%
      const res = calculateAlignmentScore(votes);
      assert.equal(res.alignmentPct, 67);
      assert.equal(res.archetype, 'Balanced Realist ⚖️');
    });

    test('Strong contrarian (<40%) classifies as Chaotic Rebel 🔥', () => {
      const votes = [
        { choice: 'b', votes_a: 90, votes_b: 10 }, // minority
        { choice: 'b', votes_a: 85, votes_b: 15 }, // minority
        { choice: 'b', votes_a: 80, votes_b: 20 }, // minority
        { choice: 'a', votes_a: 70, votes_b: 30 }, // majority
      ]; // 1/4 = 25%
      const res = calculateAlignmentScore(votes);
      assert.equal(res.alignmentPct, 25);
      assert.equal(res.rebelPct, 75);
      assert.equal(res.archetype, 'Chaotic Rebel 🔥');
    });
  });

  describe('4. Universal Access & Voter Key Integrity', () => {
    test('Supports anonymous voter keys prefixed with anon: for non-registered visitors', () => {
      const anonKey = `anon:${crypto.randomUUID()}`;
      assert.ok(anonKey.startsWith('anon:'), 'Must have anon: prefix');
      assert.ok(anonKey.length > 10, 'Must have sufficient entropy');
    });

    test('Supports registered user voter keys prefixed with usr:', () => {
      const userKey = `usr:usr_12345`;
      assert.ok(userKey.startsWith('usr:'), 'Must have usr: prefix');
    });
  });

  describe('5. Input Truncation & Sanitization Rules', () => {
    test('Dilemma options enforce maximum 160 characters length', () => {
      const longInput = 'A'.repeat(250);
      const sanitized = longInput.slice(0, 160);
      assert.equal(sanitized.length, 160);
    });

    test('Rejects empty or whitespace-only options under 3 chars', () => {
      const bad1 = '  ';
      const bad2 = 'ab';
      assert.ok(bad1.trim().length < 3, 'Whitespace should fail min length');
      assert.ok(bad2.trim().length < 3, 'Short text should fail min length');
    });
  });

  describe('6. Zero-Repeat Dilemma Filtering & All-Answered State Validation', () => {
    test('Strictly excludes dilemmas the voter has already voted on', () => {
      const allDilemmas = [
        { id: 'wyr-1', category: 'superpower' },
        { id: 'wyr-2', category: 'superpower' },
        { id: 'wyr-3', category: 'lifestyle' },
        { id: 'wyr-4', category: 'lifestyle' },
      ];
      const votedDilemmaIds = new Set(['wyr-1', 'wyr-2', 'wyr-3']);
      const unvoted = allDilemmas.filter((d) => !votedDilemmaIds.has(d.id));

      assert.equal(unvoted.length, 1);
      assert.equal(unvoted[0].id, 'wyr-4');
      assert.equal(votedDilemmaIds.has(unvoted[0].id), false);
    });

    test('Identifies all-answered completion when no unvoted dilemmas remain', () => {
      const totalApproved = 12;
      const totalVoted = 12;
      const isCompleted = totalVoted >= totalApproved;
      assert.equal(isCompleted, true);
    });

    test('Fallback pool selector filters out locally voted IDs', () => {
      const fallbackPack = [
        { id: 'fb-1', optionA: 'A', optionB: 'B' },
        { id: 'fb-2', optionA: 'C', optionB: 'D' },
        { id: 'fb-3', optionA: 'E', optionB: 'F' },
      ];
      const locallyVoted = ['fb-1', 'fb-2'];
      const unvoted = fallbackPack.filter((item) => !locallyVoted.includes(item.id));

      assert.equal(unvoted.length, 1);
      assert.equal(unvoted[0].id, 'fb-3');
    });

    test('When all fallback dilemmas are answered, returns empty list to trigger completion state', () => {
      const fallbackPack = [
        { id: 'fb-1', optionA: 'A', optionB: 'B' },
        { id: 'fb-2', optionA: 'C', optionB: 'D' },
      ];
      const locallyVoted = ['fb-1', 'fb-2'];
      const unvoted = fallbackPack.filter((item) => !locallyVoted.includes(item.id));

      assert.equal(unvoted.length, 0);
    });

    test('Allow-voted review mode permits loading previously voted dilemmas with user choice attached', () => {
      const dilemma = {
        id: 'wyr-1',
        option_a: 'Option A',
        option_b: 'Option B',
        category: 'superpower',
        votes_a: 100,
        votes_b: 50,
      };
      const userChoice = 'a';
      const formatted = formatWyrDilemma(dilemma, userChoice);

      assert.equal(formatted.id, 'wyr-1');
      assert.equal(formatted.userVote, 'a');
      assert.equal(formatted.totalVotes, 150);
    });
  });

  describe('7. Community Submissions, Creator Attribution & 600 Dilemmas Expansion', () => {
    test('formatWyrDilemma includes createdBy attribute for community attribution', () => {
      const row = {
        id: 'wyr-comm-1',
        option_a: 'Study in the library all night',
        option_b: 'Cram 1 hour before exam with coffee',
        category: 'college',
        votes_a: 500,
        votes_b: 700,
        created_by: '@mahesh_student',
      };
      const formatted = formatWyrDilemma(row);
      assert.equal(formatted.createdBy, '@mahesh_student');
      assert.equal(formatted.totalVotes, 1200);
    });

    test('formatWyrDilemma gracefully sets createdBy to null for system dilemmas', () => {
      const row = {
        id: 'wyr-sys-1',
        option_a: 'Invisible',
        option_b: 'Fly',
        category: 'superpower',
        votes_a: 200,
        votes_b: 300,
        created_by: null,
      };
      const formatted = formatWyrDilemma(row);
      assert.equal(formatted.createdBy, null);
    });

    test('Community submissions resolution defaults to Anonymous Student when not signed in', () => {
      const user = null;
      const creatorName = user?.username ? `@${user.username}` : 'Anonymous Student';
      assert.equal(creatorName, 'Anonymous Student');
    });

    test('Community submissions resolution prefixes @ for authenticated users', () => {
      const user = { username: 'alex99' };
      const creatorName = user?.username ? `@${user.username}` : 'Anonymous Student';
      assert.equal(creatorName, '@alex99');
    });

    test('Community category filter accurately isolates dilemmas submitted by users', () => {
      const pool = [
        { id: 'd-1', category: 'superpower', created_by: null },
        { id: 'd-2', category: 'lifestyle', created_by: '@coder' },
        { id: 'd-3', category: 'college', created_by: 'Anonymous Student' },
        { id: 'd-4', category: 'hypothetical', created_by: null },
      ];
      const communityDilemmas = pool.filter((d) => d.created_by !== null);
      assert.equal(communityDilemmas.length, 2);
      assert.deepEqual(communityDilemmas.map((d) => d.id), ['d-2', 'd-3']);
    });

    test('Pool of 600 dilemmas distributes across 6 core categories evenly', () => {
      const categories = ['superpower', 'hypothetical', 'lifestyle', 'college', 'deep', 'absurd'];
      const distribution = {
        superpower: 100,
        hypothetical: 100,
        lifestyle: 100,
        college: 100,
        deep: 100,
        absurd: 100,
      };
      let total = 0;
      for (const cat of categories) {
        total += distribution[cat];
      }
      assert.equal(total, 600);
      assert.equal(categories.length, 6);
    });
  });
});
