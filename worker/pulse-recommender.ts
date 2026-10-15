// worker/pulse-recommender.ts
// Adda Pulse Reels Scalable Recommendation Engine

export type PulseReelEntity = {
  id: string;
  title: string;
  caption?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  duration_seconds: number;
  author_name: string;
  author_avatar?: string | null;
  sound_title?: string | null;
  category: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_featured?: number;
  created_at: string;
};

export type ReelEventPayload = {
  reelId: string;
  eventType:
    | 'impression'
    | 'playback_start'
    | 'playback_progress'
    | 'playback_complete'
    | 'replay'
    | 'quick_skip'
    | 'like'
    | 'unlike'
    | 'share'
    | 'comment'
    | 'not_interested'
    | 'report';
  durationWatchedMs?: number;
  completionPercent?: number; // 0.0 to 1.0
  category?: string;
  authorName?: string;
  sessionId?: string;
};

export type UserProfile = {
  userId: string;
  topicAffinities: Record<string, number>;
  creatorAffinities: Record<string, number>;
  totalImpressions: number;
  totalWatches: number;
  totalCompletions: number;
  totalReplays: number;
  totalSkips: number;
  totalLikes: number;
  totalShares: number;
  totalNotInterested: number;
  avgCompletionRate: number;
  lastActiveAt: string;
  updatedAt: string;
};

export type ScoredReelCandidate = {
  reel: PulseReelEntity;
  score: number;
  debugReason?: string;
  candidateSource: 'semantic' | 'creator' | 'behavioral' | 'fresh' | 'exploration' | 'quality';
};

// ----------------------------------------------------------------------------
// 1. SEMANTIC FEATURE PIPELINE & TEXT UNDERSTANDING
// ----------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of',
  'with', 'by', 'from', 'this', 'that', 'it', 'as', 'are', 'was', 'were', 'when',
  'you', 'your', 'we', 'our', 'my', 'me', 'campus', 'adda', 'pulse', 'reel', 'video'
]);

// Conceptual topic clusters to map terms across varying vocabularies
const TOPIC_CONCEPT_MAP: Record<string, string[]> = {
  coding: ['code', 'coding', 'programmer', 'programming', 'dev', 'developer', 'software', 'hackathon', 'compile', 'compiler', 'bug', 'github', 'tech', 'python', 'algorithm', 'script', 'scripting', 'engineer', 'ide', 'terminal'],
  academics: ['exam', 'finals', 'semester', 'study', 'studying', 'library', 'viva', 'lecture', 'professor', 'attendance', 'notes', 'grades', 'books'],
  hostel_life: ['hostel', 'roommate', 'mess', 'maggi', 'canteen', 'samosa', 'tapri', 'chai', 'night', 'cooking', 'midnight', 'warden', 'proxy'],
  humor: ['meme', 'memes', 'relatable', 'funny', 'laugh', 'joke', 'panic', 'sneak', 'proxy', 'legends', 'backbencher'],
  career: ['placement', 'interview', 'job', 'offer', 'internship', 'startup', 'hr', 'resume', 'package', 'company'],
  lifestyle: ['monsoon', 'rain', 'walk', 'sunset', 'morning', 'vibes', 'chill', 'music', 'lofi', 'celebration', 'brotherhood', 'squad']
};

export class SemanticFeatureExtractor {
  /**
   * Tokenizes and normalizes text into significant keywords and concepts
   */
  public static extractTokens(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/#[a-z0-9_]+/g, (match) => ' ' + match.slice(1) + ' ')
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }

  /**
   * Generates a normalized semantic feature vector for a reel from its metadata
   */
  public static extractFeatureVector(reel: {
    title: string;
    caption?: string | null;
    category: string;
    sound_title?: string | null;
    author_name?: string | null;
  }): Record<string, number> {
    const vector: Record<string, number> = {};

    // 1. Direct category feature (strong anchor)
    const normCategory = (reel.category || 'general').toLowerCase();
    vector[`cat:${normCategory}`] = 2.0;

    // 2. Extract tokens from title, caption, and audio
    const combinedText = `${reel.title || ''} ${reel.caption || ''} ${reel.sound_title || ''}`;
    const tokens = this.extractTokens(combinedText);

    for (const token of tokens) {
      vector[token] = (vector[token] || 0) + 1.0;
    }

    // 3. Map tokens into high-level conceptual topic clusters
    for (const [cluster, keywords] of Object.entries(TOPIC_CONCEPT_MAP)) {
      for (const kw of keywords) {
        if (tokens.includes(kw) || combinedText.toLowerCase().includes(kw)) {
          vector[`concept:${cluster}`] = (vector[`concept:${cluster}`] || 0) + 1.5;
        }
      }
    }

    // 4. L2 Normalize the vector so length does not distort similarity
    let sumSq = 0;
    for (const val of Object.values(vector)) {
      sumSq += val * val;
    }
    const magnitude = Math.sqrt(sumSq) || 1.0;
    for (const k of Object.keys(vector)) {
      vector[k] = parseFloat((vector[k] / magnitude).toFixed(4));
    }

    return vector;
  }

  /**
   * Computes cosine similarity between two feature vectors [-1.0 to 1.0]
   */
  public static cosineSimilarity(
    vecA: Record<string, number>,
    vecB: Record<string, number>
  ): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [key, valA] of Object.entries(vecA)) {
      normA += valA * valA;
      if (vecB[key]) {
        dot += valA * vecB[key];
      }
    }
    for (const valB of Object.values(vecB)) {
      normB += valB * valB;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom <= 0) return 0;
    return dot / denom;
  }
}

// ----------------------------------------------------------------------------
// 2. USER PROFILE MANAGER WITH TIME DECAY & ADAPTIVE FEEDBACK
// ----------------------------------------------------------------------------

export const EVENT_WEIGHTS: Record<ReelEventPayload['eventType'], number> = {
  impression: 0.05,
  playback_start: 0.15,
  playback_progress: 0.6,
  playback_complete: 1.8,
  replay: 2.2,
  like: 2.5,
  share: 3.0,
  comment: 1.8,
  quick_skip: -1.2,
  not_interested: -6.0,
  report: -10.0,
  unlike: -1.5,
};

const HALF_LIFE_DAYS = 7;
const DECAY_RATE = Math.LN2 / (HALF_LIFE_DAYS * 86400 * 1000); // ms decay constant

export class UserProfileManager {
  /**
   * Applies half-life exponential time decay to an affinity map based on elapsed time
   */
  public static applyTimeDecay(
    affinities: Record<string, number>,
    lastUpdatedAtIso: string,
    nowMs: number = Date.now()
  ): Record<string, number> {
    const lastTime = new Date(lastUpdatedAtIso || 0).getTime();
    if (!lastTime || isNaN(lastTime) || nowMs <= lastTime) return { ...affinities };

    const elapsedMs = nowMs - lastTime;
    const decayFactor = Math.exp(-DECAY_RATE * elapsedMs);

    const decayed: Record<string, number> = {};
    for (const [key, value] of Object.entries(affinities)) {
      const newVal = value * decayFactor;
      // Prune insignificant residual noise
      if (Math.abs(newVal) > 0.02) {
        decayed[key] = parseFloat(newVal.toFixed(4));
      }
    }
    return decayed;
  }

  /**
   * Incrementally updates a user's profile with an incoming interaction event
   */
  public static processEvent(
    profile: UserProfile,
    event: ReelEventPayload,
    reelFeatures: Record<string, number>,
    nowIso: string = new Date().toISOString()
  ): UserProfile {
    const nowMs = new Date(nowIso).getTime();

    // 1. Time decay prior affinities
    const topicAffinities = this.applyTimeDecay(profile.topicAffinities, profile.updatedAt, nowMs);
    const creatorAffinities = this.applyTimeDecay(profile.creatorAffinities, profile.updatedAt, nowMs);

    // 2. Compute effective event weight
    let baseWeight = EVENT_WEIGHTS[event.eventType] ?? 0;

    // Modulate progress events by completion percentage if supplied
    if (event.eventType === 'playback_progress' && typeof event.completionPercent === 'number') {
      baseWeight *= Math.min(1.0, Math.max(0.1, event.completionPercent));
    }

    // 3. Update topic affinities using reel feature vector
    for (const [featureKey, featureWeight] of Object.entries(reelFeatures)) {
      const delta = baseWeight * featureWeight;
      const current = topicAffinities[featureKey] || 0;
      // Clamp between -10.0 and +10.0 to prevent outlier runaway
      topicAffinities[featureKey] = Math.max(-10.0, Math.min(10.0, parseFloat((current + delta).toFixed(4))));
    }

    // 4. Update creator affinity
    if (event.authorName) {
      const creatorKey = event.authorName.toLowerCase();
      const currentCreator = creatorAffinities[creatorKey] || 0;
      creatorAffinities[creatorKey] = Math.max(-10.0, Math.min(10.0, parseFloat((currentCreator + baseWeight * 0.8).toFixed(4))));
    }

    // 5. Update behavioral aggregate counters
    let impressions = profile.totalImpressions;
    let watches = profile.totalWatches;
    let completions = profile.totalCompletions;
    let replays = profile.totalReplays;
    let skips = profile.totalSkips;
    let likes = profile.totalLikes;
    let shares = profile.totalShares;
    let notInterested = profile.totalNotInterested;

    switch (event.eventType) {
      case 'impression':
        impressions++;
        break;
      case 'playback_start':
        watches++;
        break;
      case 'playback_complete':
        completions++;
        break;
      case 'replay':
        replays++;
        break;
      case 'quick_skip':
        skips++;
        break;
      case 'like':
        likes++;
        break;
      case 'share':
        shares++;
        break;
      case 'not_interested':
        notInterested++;
        break;
    }

    const totalViews = Math.max(1, watches + skips);
    const avgCompletion = (completions + replays * 0.5) / totalViews;

    return {
      userId: profile.userId,
      topicAffinities,
      creatorAffinities,
      totalImpressions: impressions,
      totalWatches: watches,
      totalCompletions: completions,
      totalReplays: replays,
      totalSkips: skips,
      totalLikes: likes,
      totalShares: shares,
      totalNotInterested: notInterested,
      avgCompletionRate: parseFloat(Math.min(1.0, avgCompletion).toFixed(4)),
      lastActiveAt: nowIso,
      updatedAt: nowIso,
    };
  }
}

// ----------------------------------------------------------------------------
// 3. CANDIDATE GENERATION & MULTI-ARM RETRIEVAL
// ----------------------------------------------------------------------------

export class CandidateGenerator {
  /**
   * Generates a diversified candidate pool for the target user
   */
  public static generateCandidates(
    catalog: PulseReelEntity[],
    userProfile: UserProfile | null,
    negativeSignalIds: Set<string>,
    _recentWatchedIds: Set<string> = new Set(),
    requestedCategory: string = 'all'
  ): ScoredReelCandidate[] {
    const candidates: ScoredReelCandidate[] = [];
    const now = Date.now();

    for (const reel of catalog) {
      // 1. Strict negative suppression: Never recommend items marked Not Interested or Reported
      if (negativeSignalIds.has(reel.id) || (reel.author_name && negativeSignalIds.has(`author:${reel.author_name.toLowerCase()}`))) {
        continue;
      }

      // 2. Category filtering if explicit category is requested
      if (requestedCategory !== 'all' && reel.category !== requestedCategory) {
        continue;
      }

      const features = SemanticFeatureExtractor.extractFeatureVector(reel);
      let candidateSource: ScoredReelCandidate['candidateSource'] = 'quality';
      let sourceScore = 0;

      if (userProfile && Object.keys(userProfile.topicAffinities).length > 0) {
        // Arm A: Semantic Topic Similarity
        const semanticSim = SemanticFeatureExtractor.cosineSimilarity(userProfile.topicAffinities, features);
        
        // Arm B: Creator Relationship
        const creatorAffinity = reel.author_name
          ? userProfile.creatorAffinities[reel.author_name.toLowerCase()] || 0
          : 0;

        // Arm C: Fresh Content Discovery (< 48 hours old)
        const reelAgeHours = Math.max(0, (now - new Date(reel.created_at).getTime()) / (1000 * 3600));
        const freshnessBoost = Math.max(0, 1.0 - reelAgeHours / 48);

        // Arm D: Exploration Slot (intentional pseudo-random discovery outside dominant cluster)
        const isExploration = Math.abs(semanticSim) < 0.15;

        if (semanticSim > 0.25) {
          candidateSource = 'semantic';
          sourceScore = semanticSim;
        } else if (creatorAffinity > 0.5) {
          candidateSource = 'creator';
          sourceScore = creatorAffinity;
        } else if (freshnessBoost > 0.5) {
          candidateSource = 'fresh';
          sourceScore = freshnessBoost;
        } else if (isExploration) {
          candidateSource = 'exploration';
          sourceScore = 0.3;
        } else {
          candidateSource = 'quality';
          sourceScore = (reel.likes_count || 0) / 1000;
        }
      } else {
        // Cold-Start: User has no prior history. Mix fresh, high-engagement, and diverse campus items
        const reelAgeHours = Math.max(0, (now - new Date(reel.created_at).getTime()) / (1000 * 3600));
        if (reelAgeHours < 24) {
          candidateSource = 'fresh';
          sourceScore = 0.8;
        } else {
          candidateSource = 'quality';
          sourceScore = (reel.likes_count || 0) / 500;
        }
      }

      candidates.push({
        reel,
        score: sourceScore,
        candidateSource,
      });
    }

    return candidates;
  }
}

// ----------------------------------------------------------------------------
// 4. PERSONALIZED RANKING & MULTI-OBJECTIVE SCORING
// ----------------------------------------------------------------------------

export interface RankingWeights {
  w_topic: number;
  w_creator: number;
  w_completion: number;
  w_freshness: number;
  w_quality: number;
  w_skip_penalty: number;
  w_repetition: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  w_topic: 4.0,
  w_creator: 2.0,
  w_completion: 2.5,
  w_freshness: 1.2,
  w_quality: 1.0,
  w_skip_penalty: 2.5,
  w_repetition: 4.0,
};

export class PersonalizedRanker {
  /**
   * Scores and ranks candidates using multi-objective personalization with diversity reranking
   */
  public static rankCandidates(
    candidates: ScoredReelCandidate[],
    userProfile: UserProfile | null,
    recentWatchedIds: Set<string>,
    weights: RankingWeights = DEFAULT_RANKING_WEIGHTS
  ): ScoredReelCandidate[] {
    const scoredList: ScoredReelCandidate[] = [];
    const now = Date.now();

    for (const candidate of candidates) {
      const reel = candidate.reel;
      const features = SemanticFeatureExtractor.extractFeatureVector(reel);

      // 1. Topic & Semantic Affinity Score
      let topicAffinity = 0;
      let creatorAffinity = 0;
      let skipPenalty = 0;

      if (userProfile) {
        topicAffinity = SemanticFeatureExtractor.cosineSimilarity(userProfile.topicAffinities, features);
        if (reel.author_name) {
          creatorAffinity = userProfile.creatorAffinities[reel.author_name.toLowerCase()] || 0;
        }

        // If user frequently skips this topic or category, apply negative skip penalty
        const categoryKey = `cat:${reel.category.toLowerCase()}`;
        if ((userProfile.topicAffinities[categoryKey] || 0) < -0.5) {
          skipPenalty += Math.abs(userProfile.topicAffinities[categoryKey]);
        }
      }

      // 2. Freshness Score (exponential decay over 7 days)
      const ageHours = Math.max(0, (now - new Date(reel.created_at).getTime()) / (1000 * 3600));
      const freshness = Math.exp(-ageHours / (24 * 7));

      // 3. Quality & Engagement Baseline (normalized ratio)
      const engagement = Math.log10(1 + (reel.likes_count || 0) + (reel.comments_count || 0) * 2 + (reel.shares_count || 0) * 3) / 4.0;

      // 4. Repetition Penalty: heavily penalize reels watched recently
      let repetitionPenalty = 0;
      if (recentWatchedIds.has(reel.id)) {
        repetitionPenalty = 1.0;
      }

      // 5. Multi-Objective Score Equation
      const finalScore =
        weights.w_topic * topicAffinity +
        weights.w_creator * (creatorAffinity > 0 ? creatorAffinity : 0) +
        weights.w_freshness * freshness +
        weights.w_quality * engagement -
        weights.w_skip_penalty * skipPenalty -
        weights.w_repetition * repetitionPenalty;

      // 6. Diagnostic Explanation
      let debugReason = `${candidate.candidateSource} | `;
      if (topicAffinity > 0.3) {
        debugReason += `high topic match (${topicAffinity.toFixed(2)})`;
      } else if (creatorAffinity > 0.4) {
        debugReason += `fav creator (${reel.author_name})`;
      } else if (freshness > 0.7) {
        debugReason += `fresh discovery (${Math.round(ageHours)}h old)`;
      } else if (candidate.candidateSource === 'exploration') {
        debugReason += `exploratory recommendation`;
      } else {
        debugReason += `campus trending quality`;
      }

      scoredList.push({
        reel,
        score: parseFloat(finalScore.toFixed(4)),
        debugReason,
        candidateSource: candidate.candidateSource,
      });
    }

    // Deterministic Sort: Primary by score DESC, Secondary by created_at DESC, Tertiary by ID DESC
    scoredList.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.0001) {
        return b.score - a.score;
      }
      const timeDiff = new Date(b.reel.created_at).getTime() - new Date(a.reel.created_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.reel.id.localeCompare(a.reel.id);
    });

    // 7. Topic & Creator Diversity Re-ranking (avoid >2 consecutive reels from same author/category)
    return this.applyDiversityGuard(scoredList);
  }

  /**
   * Prevents monotonous runs of identical author or category
   */
  private static applyDiversityGuard(ranked: ScoredReelCandidate[]): ScoredReelCandidate[] {
    if (ranked.length <= 2) return ranked;

    const result: ScoredReelCandidate[] = [];
    const pool = [...ranked];

    while (pool.length > 0) {
      const last1 = result[result.length - 1];
      const last2 = result[result.length - 2];

      // Find the best candidate that doesn't violate consecutive constraints
      let pickedIdx = 0;
      for (let i = 0; i < Math.min(pool.length, 5); i++) {
        const candidate = pool[i];
        const sameAuthor = last1?.reel.author_name === candidate.reel.author_name && last2?.reel.author_name === candidate.reel.author_name;
        const sameCategory = last1?.reel.category === candidate.reel.category && last2?.reel.category === candidate.reel.category;

        if (!sameAuthor && !sameCategory) {
          pickedIdx = i;
          break;
        }
      }

      result.push(pool.splice(pickedIdx, 1)[0]);
    }

    return result;
  }
}
