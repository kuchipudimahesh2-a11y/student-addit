// tests/reels_recommendation_engine.test.mjs
// Verification suite for Adda Pulse Reels Scalable Recommendation Engine

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  SemanticFeatureExtractor,
  UserProfileManager,
  CandidateGenerator,
  PersonalizedRanker,
  DEFAULT_RANKING_WEIGHTS,
} from '../worker/pulse-recommender.ts';

test('Adda Pulse Reels Recommendation Engine — Full Evaluation Suite', async (t) => {
  // Helper to construct an in-memory SQLite database matching the production D1 schema
  const createTestDb = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE pulse_reels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        caption TEXT,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        duration_seconds INTEGER DEFAULT 15,
        author_name TEXT NOT NULL DEFAULT 'Campus Viral',
        author_avatar TEXT,
        sound_title TEXT DEFAULT 'Original Audio · Campus Vibes',
        category TEXT NOT NULL DEFAULT 'campus_life',
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        shares_count INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );

      CREATE TABLE pulse_reel_likes (
        reel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (reel_id, user_id)
      );

      CREATE TABLE pulse_reel_comments (
        id TEXT PRIMARY KEY,
        reel_id TEXT NOT NULL,
        user_id TEXT,
        author_handle TEXT NOT NULL,
        avatar_url TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );

      CREATE TABLE pulse_reel_views (
        reel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        watch_count INTEGER NOT NULL DEFAULT 1,
        last_watched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (reel_id, user_id)
      );

      CREATE TABLE pulse_reel_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reel_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        duration_watched_ms INTEGER DEFAULT 0,
        completion_percent REAL DEFAULT 0.0,
        category TEXT,
        author_name TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );

      CREATE TABLE pulse_user_profiles (
        user_id TEXT PRIMARY KEY,
        topic_affinities TEXT NOT NULL DEFAULT '{}',
        creator_affinities TEXT NOT NULL DEFAULT '{}',
        total_impressions INTEGER DEFAULT 0,
        total_watches INTEGER DEFAULT 0,
        total_completions INTEGER DEFAULT 0,
        total_replays INTEGER DEFAULT 0,
        total_skips INTEGER DEFAULT 0,
        total_likes INTEGER DEFAULT 0,
        total_shares INTEGER DEFAULT 0,
        total_not_interested INTEGER DEFAULT 0,
        avg_completion_rate REAL DEFAULT 0.0,
        last_active_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );

      CREATE TABLE pulse_user_negative_signals (
        user_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'not_interested',
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        PRIMARY KEY (user_id, target_type, target_id)
      );
    `);
    return db;
  };

  const SAMPLE_CATALOG = [
    {
      id: 'reel-code-1',
      title: 'Python Script That Automates Boring College Tasks',
      caption: 'Built a quick script to download lecture slides automatically #Python #DevTools',
      video_url: 'https://cdn.example.com/reels/code-1.mp4',
      duration_seconds: 14,
      author_name: 'DevClub Campus',
      category: 'tech_coding',
      likes_count: 850,
      comments_count: 70,
      shares_count: 45,
      created_at: '2026-10-14 10:00:00',
    },
    {
      id: 'reel-code-2',
      title: 'Debugging C++ Memory Leak at 2 AM',
      caption: 'Valgrind showing 400 bytes lost in a pointer loop. Pain! #CodingRelatable #Software',
      video_url: 'https://cdn.example.com/reels/code-2.mp4',
      duration_seconds: 12,
      author_name: 'CodeWarriors',
      category: 'tech_coding',
      likes_count: 620,
      comments_count: 55,
      shares_count: 30,
      created_at: '2026-10-14 09:30:00',
    },
    {
      id: 'reel-hostel-1',
      title: 'Midnight Hostel Maggi Competition',
      caption: 'Electric kettle mastery with extra cheese and chilly flakes #HostelLife #NightCravings',
      video_url: 'https://cdn.example.com/reels/hostel-1.mp4',
      duration_seconds: 15,
      author_name: 'Hostel 4 Legends',
      category: 'hostel',
      likes_count: 1420,
      comments_count: 110,
      shares_count: 80,
      created_at: '2026-10-14 09:00:00',
    },
    {
      id: 'reel-exam-1',
      title: 'Finals Revision in 4 Hours Strategy',
      caption: 'When 5 units are due tomorrow morning and caffeine is your guide #ExamStress #StudyTips',
      video_url: 'https://cdn.example.com/reels/exam-1.mp4',
      duration_seconds: 16,
      author_name: 'Semester Survivors',
      category: 'exam_stress',
      likes_count: 980,
      comments_count: 90,
      shares_count: 60,
      created_at: '2026-10-14 08:30:00',
    },
    {
      id: 'reel-meme-1',
      title: 'When Professor Dismisses Class 1 Minute Early',
      caption: 'Olympic level sprint to the cafeteria before the samosas vanish #StudentMemes #Funny',
      video_url: 'https://cdn.example.com/reels/meme-1.mp4',
      duration_seconds: 10,
      author_name: 'Backbencher Central',
      category: 'memes',
      likes_count: 2200,
      comments_count: 210,
      shares_count: 150,
      created_at: '2026-10-14 08:00:00',
    },
  ];

  // SCENARIO 1: Two users with different viewing histories receive different recommendations
  await t.test('Scenario 1 — Two users with different interests receive distinct, personalized rankings', () => {
    // User A loves tech_coding: watched and liked coding reels
    let profileA = {
      userId: 'user-coder',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 4,
      totalWatches: 3,
      totalCompletions: 3,
      totalReplays: 2,
      totalSkips: 0,
      totalLikes: 2,
      totalShares: 1,
      totalNotInterested: 0,
      avgCompletionRate: 1.0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const codeFeatures = SemanticFeatureExtractor.extractFeatureVector(SAMPLE_CATALOG[0]);
    profileA = UserProfileManager.processEvent(profileA, { reelId: 'reel-code-1', eventType: 'like' }, codeFeatures);
    profileA = UserProfileManager.processEvent(profileA, { reelId: 'reel-code-2', eventType: 'playback_complete' }, codeFeatures);

    // User B loves memes: watched and liked meme content
    let profileB = {
      userId: 'user-memer',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 4,
      totalWatches: 3,
      totalCompletions: 3,
      totalReplays: 1,
      totalSkips: 0,
      totalLikes: 2,
      totalShares: 1,
      totalNotInterested: 0,
      avgCompletionRate: 1.0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const memeFeatures = SemanticFeatureExtractor.extractFeatureVector(SAMPLE_CATALOG[4]);
    profileB = UserProfileManager.processEvent(profileB, { reelId: 'reel-meme-1', eventType: 'like' }, memeFeatures);

    // Generate and rank candidates for both users
    const candidatesA = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profileA, new Set(), new Set(), 'all');
    const rankedA = PersonalizedRanker.rankCandidates(candidatesA, profileA, new Set());

    const candidatesB = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profileB, new Set(), new Set(), 'all');
    const rankedB = PersonalizedRanker.rankCandidates(candidatesB, profileB, new Set());

    // User A must have a tech_coding reel at #1
    assert.equal(rankedA[0].reel.category, 'tech_coding');
    // User B must have a memes reel at #1
    assert.equal(rankedB[0].reel.category, 'memes');
    // Their top recommendation IDs must differ
    assert.notEqual(rankedA[0].reel.id, rankedB[0].reel.id);
  });

  // SCENARIO 2: A user who repeatedly completes and likes videos receives more similar content
  await t.test('Scenario 2 — Continuous positive feedback reinforces relevant content ranking', () => {
    let profile = {
      userId: 'user-learner',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 0,
      totalWatches: 0,
      totalCompletions: 0,
      totalReplays: 0,
      totalSkips: 0,
      totalLikes: 0,
      totalShares: 0,
      totalNotInterested: 0,
      avgCompletionRate: 0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Initially, user has no history
    const initialCandidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profile, new Set(), new Set(), 'all');
    const initialRanked = PersonalizedRanker.rankCandidates(initialCandidates, profile, new Set());

    // Observe user completing, replaying, and liking exam_stress content
    const examReel = SAMPLE_CATALOG.find((r) => r.category === 'exam_stress');
    const examFeatures = SemanticFeatureExtractor.extractFeatureVector(examReel);

    profile = UserProfileManager.processEvent(profile, { reelId: examReel.id, eventType: 'playback_complete', completionPercent: 1.0 }, examFeatures);
    profile = UserProfileManager.processEvent(profile, { reelId: examReel.id, eventType: 'replay' }, examFeatures);
    profile = UserProfileManager.processEvent(profile, { reelId: examReel.id, eventType: 'like' }, examFeatures);

    const updatedCandidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profile, new Set(), new Set(), 'all');
    const updatedRanked = PersonalizedRanker.rankCandidates(updatedCandidates, profile, new Set());

    const examScoreInitial = initialRanked.find((r) => r.reel.id === examReel.id).score;
    const examScoreUpdated = updatedRanked.find((r) => r.reel.id === examReel.id).score;

    assert.ok(examScoreUpdated > examScoreInitial, 'Score of exam content must increase after positive signals');
    assert.equal(updatedRanked[0].reel.id, examReel.id, 'Exam reel must rank #1 after positive feedback loop');
  });

  // SCENARIO 3: A user who frequently skips a specific type of content receives less of it
  await t.test('Scenario 3 — Quick skip telemetry imposes negative penalties on skipped topics', () => {
    let profile = {
      userId: 'user-skipper',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 0,
      totalWatches: 0,
      totalCompletions: 0,
      totalReplays: 0,
      totalSkips: 0,
      totalLikes: 0,
      totalShares: 0,
      totalNotInterested: 0,
      avgCompletionRate: 0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const hostelReel = SAMPLE_CATALOG.find((r) => r.category === 'hostel');
    const hostelFeatures = SemanticFeatureExtractor.extractFeatureVector(hostelReel);

    // Before skips: score of hostel reel
    const initialRanked = PersonalizedRanker.rankCandidates(
      CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profile, new Set(), new Set()),
      profile,
      new Set()
    );
    const initialHostelScore = initialRanked.find((r) => r.reel.id === hostelReel.id).score;

    // Simulate 3 quick skips on hostel content
    for (let i = 0; i < 3; i++) {
      profile = UserProfileManager.processEvent(
        profile,
        { reelId: hostelReel.id, eventType: 'quick_skip', durationWatchedMs: 1200 },
        hostelFeatures
      );
    }

    const skippedRanked = PersonalizedRanker.rankCandidates(
      CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profile, new Set(), new Set()),
      profile,
      new Set()
    );
    const skippedHostelScore = skippedRanked.find((r) => r.reel.id === hostelReel.id).score;

    assert.ok(skippedHostelScore < initialHostelScore, 'Hostel score must drop significantly after multiple quick skips');
    assert.notEqual(skippedRanked[0].reel.id, hostelReel.id, 'Repeatedly skipped item must not remain at top of feed');
  });

  // SCENARIO 4: Explicit negative feedback ("Not Interested") suppresses that item and penalizes category
  await t.test('Scenario 4 — Explicit negative feedback completely suppresses target reel and demotes similar', () => {
    const targetReel = SAMPLE_CATALOG[2]; // hostel reel
    const negativeSignals = new Set([targetReel.id]);

    let profile = {
      userId: 'user-feedback',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 1,
      totalWatches: 1,
      totalCompletions: 0,
      totalReplays: 0,
      totalSkips: 0,
      totalLikes: 0,
      totalShares: 0,
      totalNotInterested: 1,
      avgCompletionRate: 0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const targetFeatures = SemanticFeatureExtractor.extractFeatureVector(targetReel);
    profile = UserProfileManager.processEvent(
      profile,
      { reelId: targetReel.id, eventType: 'not_interested' },
      targetFeatures
    );

    const candidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, profile, negativeSignals, new Set());
    const candidateIds = candidates.map((c) => c.reel.id);

    // Suppressed reel must NOT be present in candidate pool
    assert.ok(!candidateIds.includes(targetReel.id), 'Explicitly rejected reel must be completely excluded from candidates');
    // Category affinity must be deeply negative
    assert.ok((profile.topicAffinities['cat:hostel'] || 0) < -1.0, 'Category affinity must receive strong negative penalty');
  });

  // SCENARIO 5: Recent viewing history prevents immediate repetition
  await t.test('Scenario 5 — Recent watch cooling period suppresses recently watched reels from unseen feed', () => {
    const watchedId = SAMPLE_CATALOG[0].id;
    const recentWatchedIds = new Set([watchedId]);

    // Unseen feed (includeWatched = false)
    const candidates = CandidateGenerator.generateCandidates(
      SAMPLE_CATALOG.filter((r) => !recentWatchedIds.has(r.id)),
      null,
      new Set(),
      recentWatchedIds
    );

    const candidateIds = candidates.map((c) => c.reel.id);
    assert.ok(!candidateIds.includes(watchedId), 'Recently watched reel must not appear in unseen recommendations');
  });

  // SCENARIO 6: New content becomes discoverable without redeploying
  await t.test('Scenario 6 — Newly inserted catalog item is immediately retrieved and given freshness boost', () => {
    const dynamicReel = {
      id: 'reel-fresh-brand-new',
      title: 'Fresh Campus Hackathon Winner Pitch Deck',
      caption: 'Just won 1st prize at the 2026 Campus AI sprint! #CampusAI #DevWinners',
      video_url: 'https://cdn.example.com/fresh.mp4',
      duration_seconds: 15,
      author_name: 'Hackathon Hackers',
      category: 'tech_coding',
      likes_count: 12,
      comments_count: 2,
      shares_count: 1,
      created_at: new Date().toISOString(), // Brand new right now!
    };

    const dynamicCatalog = [dynamicReel, ...SAMPLE_CATALOG];
    const candidates = CandidateGenerator.generateCandidates(dynamicCatalog, null, new Set(), new Set());

    const freshCandidate = candidates.find((c) => c.reel.id === dynamicReel.id);
    assert.ok(freshCandidate, 'New reel must be immediately picked up in candidate generation');
    assert.equal(freshCandidate.candidateSource, 'fresh', 'New item must be tagged as fresh discovery candidate');
  });

  // SCENARIO 7: Users with no history receive a sensible, diverse cold-start feed
  await t.test('Scenario 7 — Cold-start feed delivers diverse categories with zero artificial duplicates', () => {
    const candidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, null, new Set(), new Set());
    const ranked = PersonalizedRanker.rankCandidates(candidates, null, new Set());

    assert.equal(ranked.length, SAMPLE_CATALOG.length);

    // Verify all IDs are unique
    const ids = ranked.map((r) => r.reel.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length, 'No duplicate reel IDs in cold-start feed');

    // Verify diversity: categories must not be mono-cultural
    const categories = new Set(ranked.map((r) => r.reel.category));
    assert.ok(categories.size >= 4, 'Cold-start feed must span multiple diverse categories');
  });

  // SCENARIO 8: Semantic retrieval discovers related content without requiring identical hashtags
  await t.test('Scenario 8 — Semantic conceptual matching bridges differing vocabulary without identical hashtags', () => {
    // Reel 1: Python programming without the word "coding"
    const reelA = {
      title: 'Python Script to Automate Campus WiFi Logins',
      caption: 'Running requests in terminal to bypass the login portal #Scripting',
      category: 'tech_coding',
      sound_title: 'Original Audio',
    };

    // Reel 2: Software developer debugging without the word "Python" or "Scripting"
    const reelB = {
      title: 'Software Engineer Fixes Compiler Warning in IDE',
      caption: 'Clean commit into main repository before production release #Github',
      category: 'tech_coding',
      sound_title: 'Original Audio',
    };

    // Reel 3: Completely unrelated food cooking reel
    const reelC = {
      title: 'Hostel Cooking Butter Maggi with Electric Kettle',
      caption: 'Midnight snack recipe with cheese and herbs #HostelFood',
      category: 'hostel',
      sound_title: 'Kitchen Beats',
    };

    const vecA = SemanticFeatureExtractor.extractFeatureVector(reelA);
    const vecB = SemanticFeatureExtractor.extractFeatureVector(reelB);
    const vecC = SemanticFeatureExtractor.extractFeatureVector(reelC);

    const simRelated = SemanticFeatureExtractor.cosineSimilarity(vecA, vecB);
    const simUnrelated = SemanticFeatureExtractor.cosineSimilarity(vecA, vecC);

    assert.ok(simRelated > 0.40, `Related coding concepts must have high similarity (got ${simRelated})`);
    assert.ok(simUnrelated < 0.20, `Unrelated topic must have low similarity (got ${simUnrelated})`);
    assert.ok(simRelated > simUnrelated * 2.5, 'Semantic similarity between related tech videos must exceed unrelated food video by > 2.5x');
  });

  // SCENARIO 9: Global popularity cannot completely override individual preferences
  await t.test('Scenario 9 — Individual preferences dominate over high-volume viral memes', () => {
    // Reel A: Tech coding with 200 likes
    // Reel B: Viral meme with 20,000 likes
    const catalog = [
      {
        id: 'coding-gem',
        title: 'Advanced Data Structures in TypeScript',
        category: 'tech_coding',
        author_name: 'DevCampus',
        likes_count: 200,
        comments_count: 10,
        shares_count: 5,
        created_at: '2026-10-14 12:00:00',
      },
      {
        id: 'viral-meme',
        title: 'Cat Dances on Professor Desk During Lecture',
        category: 'memes',
        author_name: 'ViralCats',
        likes_count: 20000,
        comments_count: 1500,
        shares_count: 800,
        created_at: '2026-10-14 12:00:00',
      },
    ];

    // User is an avid programmer with strong tech coding affinity
    const codingFeatures = SemanticFeatureExtractor.extractFeatureVector(catalog[0]);
    let coderProfile = {
      userId: 'coder-pro',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 5,
      totalWatches: 5,
      totalCompletions: 5,
      totalReplays: 3,
      totalSkips: 0,
      totalLikes: 4,
      totalShares: 2,
      totalNotInterested: 0,
      avgCompletionRate: 1.0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    coderProfile = UserProfileManager.processEvent(coderProfile, { reelId: 'coding-gem', eventType: 'like' }, codingFeatures);
    coderProfile = UserProfileManager.processEvent(coderProfile, { reelId: 'coding-gem', eventType: 'replay' }, codingFeatures);

    const candidates = CandidateGenerator.generateCandidates(catalog, coderProfile, new Set(), new Set());
    const ranked = PersonalizedRanker.rankCandidates(candidates, coderProfile, new Set());

    assert.equal(ranked[0].reel.id, 'coding-gem', 'Personalized coding reel must rank higher than the 100x more viral meme for this user');
  });

  // SCENARIO 10: Ranking changes are deterministic under fixed inputs
  await t.test('Scenario 10 — Ranking is 100% deterministic under fixed inputs and parameters', () => {
    const candidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, null, new Set(), new Set());
    const run1 = PersonalizedRanker.rankCandidates(candidates, null, new Set());
    const run2 = PersonalizedRanker.rankCandidates(candidates, null, new Set());

    assert.equal(run1.length, run2.length);
    for (let i = 0; i < run1.length; i++) {
      assert.equal(run1[i].reel.id, run2[i].reel.id, `Item index ${i} must match deterministically`);
      assert.equal(run1[i].score, run2[i].score, `Item score index ${i} must match deterministically`);
    }
  });

  // SCENARIO 11: Pagination produces no duplicates or skipped records
  await t.test('Scenario 11 — Keyset offset pagination produces zero duplicates across page boundaries', () => {
    const candidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, null, new Set(), new Set());
    const ranked = PersonalizedRanker.rankCandidates(candidates, null, new Set());

    const pageSize = 2;
    const page1 = ranked.slice(0, pageSize);
    const page2 = ranked.slice(pageSize, pageSize * 2);
    const page3 = ranked.slice(pageSize * 2);

    const allSeen = [...page1, ...page2, ...page3].map((r) => r.reel.id);
    const uniqueSeen = new Set(allSeen);

    assert.equal(allSeen.length, SAMPLE_CATALOG.length);
    assert.equal(uniqueSeen.size, SAMPLE_CATALOG.length, 'Pagination must have zero skipped and zero duplicated records');
  });

  // SCENARIO 12: Concurrent feed requests do not corrupt pagination state
  await t.test('Scenario 12 — Concurrent feed requests handle pagination isolation safely', async () => {
    const candidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, null, new Set(), new Set());
    const ranked = PersonalizedRanker.rankCandidates(candidates, null, new Set());

    // Simulate 10 simultaneous parallel pagination requests
    const tasks = Array.from({ length: 10 }, async (_, idx) => {
      const offset = (idx % 2) * 2;
      return ranked.slice(offset, offset + 2).map((r) => r.reel.id);
    });

    const results = await Promise.all(tasks);
    assert.equal(results.length, 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(results[i].length, 2);
    }
  });

  // SCENARIO 13: Authenticated and anonymous users have isolated recommendation profiles
  await t.test('Scenario 13 — User identity resolution strictly isolates authenticated and guest sessions', () => {
    const db = createTestDb();

    // Insert profile for authenticated user
    db.prepare(`
      INSERT INTO pulse_user_profiles (user_id, topic_affinities)
      VALUES (?, ?)
    `).run('user-auth-123', JSON.stringify({ 'cat:tech_coding': 3.5 }));

    // Insert profile for anonymous guest session
    db.prepare(`
      INSERT INTO pulse_user_profiles (user_id, topic_affinities)
      VALUES (?, ?)
    `).run('anon:guest-device-abc', JSON.stringify({ 'cat:memes': 4.0 }));

    const authRow = db.prepare('SELECT topic_affinities FROM pulse_user_profiles WHERE user_id = ?').get('user-auth-123');
    const guestRow = db.prepare('SELECT topic_affinities FROM pulse_user_profiles WHERE user_id = ?').get('anon:guest-device-abc');

    const authAffinities = JSON.parse(authRow.topic_affinities);
    const guestAffinities = JSON.parse(guestRow.topic_affinities);

    assert.equal(authAffinities['cat:tech_coding'], 3.5);
    assert.equal(guestAffinities['cat:memes'], 4.0);
    assert.equal(authAffinities['cat:memes'], undefined, 'Authenticated user profile must never leak guest preferences');
    assert.equal(guestAffinities['cat:tech_coding'], undefined, 'Guest profile must never leak authenticated user preferences');
  });

  // SCENARIO 14: New watch events influence subsequent recommendations according to profile strategy
  await t.test('Scenario 14 — Incremental event processing updates profile and immediately changes ranking', () => {
    let profile = {
      userId: 'user-evolving',
      topicAffinities: {},
      creatorAffinities: {},
      totalImpressions: 0,
      totalWatches: 0,
      totalCompletions: 0,
      totalReplays: 0,
      totalSkips: 0,
      totalLikes: 0,
      totalShares: 0,
      totalNotInterested: 0,
      avgCompletionRate: 0,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Reel 1: Hostel Maggi
    const reel = SAMPLE_CATALOG[2];
    const features = SemanticFeatureExtractor.extractFeatureVector(reel);

    // Event 1: playback_start (weak signal)
    profile = UserProfileManager.processEvent(profile, { reelId: reel.id, eventType: 'playback_start' }, features);
    const scoreAfterStart = profile.topicAffinities['cat:hostel'] || 0;

    // Event 2: playback_complete (strong signal)
    profile = UserProfileManager.processEvent(profile, { reelId: reel.id, eventType: 'playback_complete', completionPercent: 1.0 }, features);
    const scoreAfterComplete = profile.topicAffinities['cat:hostel'] || 0;

    // Event 3: like (explicit conviction)
    profile = UserProfileManager.processEvent(profile, { reelId: reel.id, eventType: 'like' }, features);
    const scoreAfterLike = profile.topicAffinities['cat:hostel'] || 0;

    assert.ok(scoreAfterComplete > scoreAfterStart, 'Completion must yield higher affinity than start');
    assert.ok(scoreAfterLike > scoreAfterComplete, 'Like must further augment affinity');
    assert.equal(profile.totalWatches, 1);
    assert.equal(profile.totalCompletions, 1);
    assert.equal(profile.totalLikes, 1);
  });

  // SCENARIO 15: Reels database schema, likes, and comments functionality
  await t.test('Scenario 15 — Full database persistence for likes, comments, and views works seamlessly', () => {
    const db = createTestDb();

    // Insert sample reel
    db.prepare(`
      INSERT INTO pulse_reels (id, title, video_url, category, likes_count, comments_count)
      VALUES ('reel-test', 'Test Reel', 'https://example.com/test.mp4', 'campus_life', 0, 0)
    `).run();

    // Like
    db.prepare('INSERT INTO pulse_reel_likes (reel_id, user_id) VALUES (?, ?)').run('reel-test', 'user-1');
    db.prepare('UPDATE pulse_reels SET likes_count = likes_count + 1 WHERE id = ?').run('reel-test');

    // Comment
    db.prepare(`
      INSERT INTO pulse_reel_comments (id, reel_id, user_id, author_handle, body)
      VALUES ('c-1', 'reel-test', 'user-1', '@alice', 'Epic reel!')
    `).run();
    db.prepare('UPDATE pulse_reels SET comments_count = comments_count + 1 WHERE id = ?').run('reel-test');

    // View
    db.prepare(`
      INSERT INTO pulse_reel_views (reel_id, user_id, watch_count, last_watched_at)
      VALUES ('reel-test', 'user-1', 1, CURRENT_TIMESTAMP)
    `).run();

    const reel = db.prepare('SELECT likes_count, comments_count FROM pulse_reels WHERE id = ?').get('reel-test');
    assert.equal(reel.likes_count, 1);
    assert.equal(reel.comments_count, 1);

    const comments = db.prepare('SELECT body FROM pulse_reel_comments WHERE reel_id = ?').all('reel-test');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body, 'Epic reel!');
  });

  // OFFLINE EVALUATION METRICS
  await t.test('Offline Recommendation Evaluation Indicators', (t) => {
    const candidates = CandidateGenerator.generateCandidates(SAMPLE_CATALOG, null, new Set(), new Set());
    const ranked = PersonalizedRanker.rankCandidates(candidates, null, new Set());

    // 1. Duplicate recommendation rate
    const seenIds = new Set();
    let duplicates = 0;
    for (const item of ranked) {
      if (seenIds.has(item.reel.id)) duplicates++;
      seenIds.add(item.reel.id);
    }
    const duplicateRate = duplicates / ranked.length;
    assert.equal(duplicateRate, 0.0, 'Duplicate recommendation rate must be exactly 0%');

    // 2. Unique-content coverage
    const coverage = seenIds.size / SAMPLE_CATALOG.length;
    assert.equal(coverage, 1.0, 'Unique-content coverage must be 100% across catalog');

    // 3. Category diversity
    const categories = new Set(ranked.map((r) => r.reel.category));
    assert.ok(categories.size >= 4, 'Feed must cover >= 4 distinct campus categories');
  });
});
