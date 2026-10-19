import React, { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  Flame,
  Globe,
  LoaderCircle,
  Plus,
  RefreshCw,
  Scale,
  Share2,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import './would-you-rather.css';

export type WyrDilemma = {
  id: string;
  optionA: string;
  optionB: string;
  category: string;
  votesA: number;
  votesB: number;
  totalVotes: number;
  pctA: number;
  pctB: number;
  userVote: 'a' | 'b' | null;
  createdBy?: string | null;
};

export type WyrStats = {
  totalVotes: number;
  alignmentPct: number;
  rebelPct: number;
  archetype: string;
  globalDilemmasCount: number;
  totalGlobalVotes: number;
};

// Embedded offline fallback dilemmas pack (bulletproof resilience)
const FALLBACK_DILEMMAS: WyrDilemma[] = [
  {
    id: 'wyr-fallback-1',
    optionA: 'Always know when someone is lying to you',
    optionB: 'Always get away with any lie you tell',
    category: 'superpower',
    votesA: 1420,
    votesB: 890,
    totalVotes: 2310,
    pctA: 61,
    pctB: 39,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-2',
    optionA: 'Have photographic memory of everything you see',
    optionB: 'Be able to speak every language on Earth fluently',
    category: 'superpower',
    votesA: 950,
    votesB: 1680,
    totalVotes: 2630,
    pctA: 36,
    pctB: 64,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-3',
    optionA: 'Win $10,000,000 in cash right now',
    optionB: 'Go back to age 10 with all your current knowledge',
    category: 'hypothetical',
    votesA: 1830,
    votesB: 1540,
    totalVotes: 3370,
    pctA: 54,
    pctB: 46,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-4',
    optionA: 'Never have to sleep again with zero fatigue',
    optionB: 'Never have to eat or drink again with peak nutrition',
    category: 'lifestyle',
    votesA: 2110,
    votesB: 640,
    totalVotes: 2750,
    pctA: 77,
    pctB: 23,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-5',
    optionA: 'Have a 1-minute real-life rewind button',
    optionB: 'Have a real-life pause button for up to 10 minutes',
    category: 'superpower',
    votesA: 1780,
    votesB: 1490,
    totalVotes: 3270,
    pctA: 54,
    pctB: 46,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-6',
    optionA: 'Always be 15 minutes late to everything',
    optionB: 'Always be 25 minutes early to everything',
    category: 'lifestyle',
    votesA: 620,
    votesB: 1980,
    totalVotes: 2600,
    pctA: 24,
    pctB: 76,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-7',
    optionA: 'Ace every exam without studying for more than 10 minutes',
    optionB: 'Get paid $2,000 every single month for simply attending class',
    category: 'college',
    votesA: 1430,
    votesB: 2180,
    totalVotes: 3610,
    pctA: 40,
    pctB: 60,
    userVote: null,
    createdBy: null,
  },
  {
    id: 'wyr-fallback-8',
    optionA: 'Fight 1 horse-sized duck in an arena',
    optionB: 'Fight 100 duck-sized horses in an arena',
    category: 'absurd',
    votesA: 1210,
    votesB: 1940,
    totalVotes: 3150,
    pctA: 38,
    pctB: 62,
    userVote: null,
    createdBy: '@legendary_student',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Dilemmas 🎲' },
  { id: 'community', label: 'Community 🌍' },
  { id: 'superpower', label: 'Superpowers 🦸' },
  { id: 'hypothetical', label: 'High Stakes 💰' },
  { id: 'lifestyle', label: 'Lifestyle ☕' },
  { id: 'college', label: 'Campus Chaos 🎓' },
  { id: 'deep', label: 'Deep & Moral 🧠' },
  { id: 'absurd', label: 'Absurd & Wild 🦄' },
];

function getOrCreateAnonVoterKey(): string {
  if (typeof window === 'undefined') return 'anon:server';
  let key = localStorage.getItem('adda-wyr-anon-key');
  if (!key) {
    key = `anon:${crypto.randomUUID()}`;
    localStorage.setItem('adda-wyr-anon-key', key);
  }
  return key;
}

export function getStoredVotedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const listRaw = localStorage.getItem('adda-wyr-voted-list');
    const set = new Set<string>(listRaw ? JSON.parse(listRaw) : []);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('adda-wyr-vote:')) {
        set.add(key.replace('adda-wyr-vote:', ''));
      }
    }
    return Array.from(set);
  } catch {
    return [];
  }
}

export function recordVotedId(id: string) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const set = new Set<string>(getStoredVotedIds());
    set.add(id);
    localStorage.setItem('adda-wyr-voted-list', JSON.stringify(Array.from(set)));
  } catch {}
}

interface WyrErrorBoundaryProps {
  children: ReactNode;
}

interface WyrErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class WyrErrorBoundary extends Component<WyrErrorBoundaryProps, WyrErrorBoundaryState> {
  constructor(props: WyrErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): WyrErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WouldYouRather crashed safely caught by WyrErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="wyr-error-fallback">
          <div className="wyr-error-card">
            <Scale size={42} className="wyr-error-icon" />
            <h3>Dilemma Engine Recovered</h3>
            <p>A momentary glitch occurred. Tap below to refresh your dilemmas.</p>
            <button
              type="button"
              className="wyr-btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.hash = '#wyr';
              }}
            >
              <RefreshCw size={18} /> Reset & Play
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface WouldYouRatherProps {
  token?: string;
  user?: { id: string; name: string; username: string } | null;
  onOpenSignIn?: () => void;
  initialDilemmaId?: string | null;
}

export function WouldYouRather({ token, user, onOpenSignIn, initialDilemmaId }: WouldYouRatherProps) {
  const voterKey = user?.id ? `usr:${user.id}` : getOrCreateAnonVoterKey();

  const [dilemma, setDilemma] = useState<WyrDilemma | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [allAnswered, setAllAnswered] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState('');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [stats, setStats] = useState<WyrStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Submit form state
  const [newOptionA, setNewOptionA] = useState('');
  const [newOptionB, setNewOptionB] = useState('');
  const [newCategory, setNewCategory] = useState('universal');
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? '' : cur));
    }, 2800);
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const origin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev')
        ? 'https://student-addit.mgp899123.workers.dev'
        : '';
      const res = await fetch(`${origin}/api/wyr/stats?voter_key=${encodeURIComponent(voterKey)}`, {
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Local fallback calculations from seen items
      setStats({
        totalVotes: seenIds.length,
        alignmentPct: 62,
        rebelPct: 38,
        archetype: 'Balanced Realist ⚖️',
        globalDilemmasCount: 12,
        totalGlobalVotes: 24500,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [voterKey, seenIds.length]);

  const loadDilemma = useCallback(
    async (targetId?: string | null, cat: string = activeCategory, allowVoted: boolean = false) => {
      setLoading(true);
      const origin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev')
        ? 'https://student-addit.mgp899123.workers.dev'
        : '';

      const storedVoted = getStoredVotedIds();

      try {
        let endpoint = `${origin}/api/wyr/dilemmas/random?voter_key=${encodeURIComponent(voterKey)}`;
        if (targetId) {
          endpoint = `${origin}/api/wyr/dilemmas/${encodeURIComponent(targetId)}?voter_key=${encodeURIComponent(voterKey)}`;
        } else {
          if (cat && cat !== 'all') endpoint += `&category=${encodeURIComponent(cat)}`;
          if (allowVoted) endpoint += '&allow_voted=1';
          const excludeList = Array.from(new Set([...seenIds, ...storedVoted])).filter(Boolean);
          if (excludeList.length > 0) {
            endpoint += `&exclude=${encodeURIComponent(excludeList.slice(-25).join(','))}`;
          }
        }

        const res = await fetch(endpoint, {
          headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.allAnswered || data?.completed) {
            setAllAnswered(true);
            setDilemma(null);
            setLoading(false);
            return;
          }
          if (data?.dilemma) {
            setAllAnswered(false);
            setDilemma(data.dilemma);
            setSeenIds((prev) => (prev.includes(data.dilemma.id) ? prev : [...prev, data.dilemma.id]));
            setLoading(false);
            return;
          }
        }
        throw new Error('API unavailable or empty');
      } catch (err) {
        // Fallback to offline curated pack
        console.warn('WYR using fallback dilemma:', err);
        const filtered =
          cat === 'all'
            ? FALLBACK_DILEMMAS
            : FALLBACK_DILEMMAS.filter((d) => d.category === cat || d.category === 'universal');
        const list = filtered.length > 0 ? filtered : FALLBACK_DILEMMAS;

        // Strictly pick only unvoted dilemmas from fallback pool unless allowVoted is explicitly requested
        let unvotedList = list;
        if (!allowVoted) {
          unvotedList = list.filter((item) => !storedVoted.includes(item.id) && !seenIds.includes(item.id));
          if (unvotedList.length === 0) {
            unvotedList = FALLBACK_DILEMMAS.filter((item) => !storedVoted.includes(item.id) && !seenIds.includes(item.id));
          }
        }

        if (unvotedList.length === 0) {
          setAllAnswered(true);
          setDilemma(null);
          setLoading(false);
          return;
        }

        const randomItem = unvotedList[Math.floor(Math.random() * unvotedList.length)];
        const savedChoice = allowVoted
          ? (localStorage.getItem(`adda-wyr-vote:${randomItem.id}`) as 'a' | 'b' | null)
          : null;
        setAllAnswered(false);
        setDilemma({
          ...randomItem,
          userVote: savedChoice || null,
        });
        setSeenIds((prev) => (prev.includes(randomItem.id) ? prev : [...prev, randomItem.id]));
        setLoading(false);
      }
    },
    [activeCategory, seenIds, voterKey]
  );

  useEffect(() => {
    // Check hash for initial dilemma
    const hash = window.location.hash;
    let deepLinkedId: string | null = null;
    if (hash.startsWith('#wyr=') && hash.length > 5) {
      deepLinkedId = hash.slice(5).trim();
    } else if (initialDilemmaId) {
      deepLinkedId = initialDilemmaId;
    }
    loadDilemma(deepLinkedId, activeCategory);
  }, []);

  const handleVote = async (choice: 'a' | 'b') => {
    if (!dilemma || voting || dilemma.userVote) return;
    setVoting(true);

    // Haptic feedback if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([25, 30, 25]);
      } catch {}
    }

    // Save locally immediately
    localStorage.setItem(`adda-wyr-vote:${dilemma.id}`, choice);
    recordVotedId(dilemma.id);

    // Optimistic UI calculation
    const newVotesA = choice === 'a' ? dilemma.votesA + 1 : dilemma.votesA;
    const newVotesB = choice === 'b' ? dilemma.votesB + 1 : dilemma.votesB;
    const newTotal = newVotesA + newVotesB;
    const newPctA = Math.round((newVotesA / newTotal) * 100);
    const newPctB = 100 - newPctA;

    setDilemma((prev) =>
      prev
        ? {
            ...prev,
            votesA: newVotesA,
            votesB: newVotesB,
            totalVotes: newTotal,
            pctA: newPctA,
            pctB: newPctB,
            userVote: choice,
          }
        : null
    );

    try {
      const origin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev')
        ? 'https://student-addit.mgp899123.workers.dev'
        : '';
      const res = await fetch(`${origin}/api/wyr/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          dilemmaId: dilemma.id,
          choice,
          voterKey,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.dilemma) {
          setDilemma(data.dilemma);
        }
      }
    } catch (err) {
      console.warn('Vote recorded locally, sync failed:', err);
    } finally {
      setVoting(false);
    }
  };

  const handleNextDilemma = () => {
    window.location.hash = '#wyr';
    loadDilemma(null, activeCategory, false);
  };

  const handleCategorySelect = (catId: string) => {
    setActiveCategory(catId);
    setAllAnswered(false);
    loadDilemma(null, catId, false);
  };

  const handleReplay = () => {
    setAllAnswered(false);
    loadDilemma(null, activeCategory, true);
  };

  const handleShare = async () => {
    if (!dilemma) return;
    const shareUrl = `${window.location.origin}/#wyr=${dilemma.id}`;
    const userChoiceText =
      dilemma.userVote === 'a'
        ? dilemma.optionA
        : dilemma.userVote === 'b'
        ? dilemma.optionB
        : null;

    const shareTitle = `Would You Rather? ⚖️`;
    const shareText = userChoiceText
      ? `I chose: "${userChoiceText}" on Student Addit! What would you pick? Vote here:`
      : `Would you rather: "${dilemma.optionA}" OR "${dilemma.optionB}"? Vote here:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `${shareText}\n${shareUrl}`,
          url: shareUrl,
        });
        showToast('Shared successfully!');
        return;
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          // fall through to clipboard
        } else {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      showToast('⚔️ Challenge link copied to clipboard!');
    } catch {
      showToast('Link copied!');
    }
  };

  const handleSubmitDilemma = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newOptionA.trim().length < 3 || newOptionB.trim().length < 3) {
      showToast('Both options must be at least 3 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const origin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev')
        ? 'https://student-addit.mgp899123.workers.dev'
        : '';
      const res = await fetch(`${origin}/api/wyr/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          optionA: newOptionA.trim(),
          optionB: newOptionB.trim(),
          category: newCategory,
          voterKey,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast('🎉 Dilemma submitted to the global community!');
        setNewOptionA('');
        setNewOptionB('');
        setShowSubmitModal(false);
        if (data.id) {
          setAllAnswered(false);
          loadDilemma(data.id);
        }
      } else {
        showToast('Could not submit right now.');
      }
    } catch {
      showToast('Network error submitting dilemma.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasVoted = Boolean(dilemma?.userVote);
  const isMajority =
    hasVoted && dilemma
      ? (dilemma.userVote === 'a' && dilemma.pctA >= 50) || (dilemma.userVote === 'b' && dilemma.pctB >= 50)
      : false;
  const userPct =
    hasVoted && dilemma
      ? dilemma.userVote === 'a'
        ? dilemma.pctA
        : dilemma.pctB
      : 0;

  return (
    <div className="wyr-container">
      {/* Toast banner */}
      {toastMsg && <div className="wyr-toast">{toastMsg}</div>}

      {/* Sleek Compact Top Bar */}
      <header className="wyr-header">
        <div className="wyr-brand">
          <div className="wyr-brand-icon-box">
            <Scale size={18} />
          </div>
          <span className="wyr-brand-title">Would You Rather?</span>
          <span className="wyr-badge-live">HUMANITY VS YOU</span>
        </div>

        <div className="wyr-header-actions">
          <button
            type="button"
            className="wyr-action-btn"
            onClick={() => {
              fetchStats();
              setShowStatsModal(true);
            }}
            title="My Humanity Alignment Stats"
          >
            <Trophy size={14} className="wyr-trophy-gold" />
            <span className="wyr-btn-label">{stats?.alignmentPct ? `${stats.alignmentPct}%` : 'Alignment'}</span>
          </button>

          <button
            type="button"
            className="wyr-action-btn wyr-btn-accent"
            onClick={() => setShowSubmitModal(true)}
            title="Submit a Dilemma"
          >
            <Plus size={15} />
            <span className="wyr-btn-label">Submit</span>
          </button>
        </div>
      </header>

      {/* Anonymous visitor alert / quick sign in nudge */}
      {!user && (
        <div className="wyr-anon-banner">
          <span className="wyr-anon-text">
            <Globe size={13} className="wyr-anon-globe" />
            <b>Anonymous Voyager</b> (Votes counted globally)
          </span>
          {onOpenSignIn && (
            <button type="button" className="wyr-anon-signin-btn" onClick={onOpenSignIn}>
              Sign In <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="wyr-categories-scroller" role="tablist" aria-label="Dilemma Categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.id}
            className={`wyr-cat-pill ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategorySelect(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main Dilemma Interactive Arena */}
      <main className="wyr-arena">
        {loading && (
          <div className="wyr-loading-card">
            <LoaderCircle size={32} className="wyr-spin" />
            <p>Summoning next dilemma…</p>
          </div>
        )}

        {!loading && allAnswered && (
          <div className="wyr-completed-card">
            <div className="wyr-completed-glow" />
            <div className="wyr-completed-badge">
              <Trophy size={34} className="wyr-trophy-gold wyr-bounce" />
            </div>
            <h2 className="wyr-completed-title">You've Answered All Dilemmas! 🎉</h2>
            <p className="wyr-completed-sub">
              You've weighed in on every active dilemma facing humanity. See your alignment archetype below or create a new dilemma to challenge the world!
            </p>

            <div className="wyr-completed-stats-pill">
              <span className="wyr-pill-stat">
                <strong>{stats?.totalVotes || getStoredVotedIds().length}</strong> Answered
              </span>
              <span className="wyr-pill-dot">•</span>
              <span className="wyr-pill-stat">
                <strong>{stats?.alignmentPct || 65}%</strong> Alignment
              </span>
              <span className="wyr-pill-dot">•</span>
              <span className="wyr-pill-stat wyr-pill-accent">
                {stats?.archetype || 'Balanced Realist ⚖️'}
              </span>
            </div>

            <div className="wyr-completed-actions">
              <button
                type="button"
                className="wyr-btn-primary"
                onClick={() => setShowSubmitModal(true)}
              >
                <Plus size={16} />
                <span>Create a Dilemma</span>
              </button>

              <button
                type="button"
                className="wyr-btn-secondary"
                onClick={handleReplay}
              >
                <RefreshCw size={15} />
                <span>Replay & Review All</span>
              </button>

              <button
                type="button"
                className="wyr-btn-secondary"
                onClick={() => {
                  fetchStats();
                  setShowStatsModal(true);
                }}
              >
                <Trophy size={15} className="wyr-trophy-gold" />
                <span>View Full Analysis</span>
              </button>
            </div>
          </div>
        )}

        {!loading && !allAnswered && dilemma && (
          <div className="wyr-battle-stage" key={dilemma.id}>
            {/* Dilemma Category & Total Votes */}
            <div className="wyr-stage-meta">
              <div className="wyr-stage-tags">
                <span className="wyr-tag">
                  <Sparkles size={11} /> {dilemma.category.toUpperCase()}
                </span>
                {dilemma.createdBy && (
                  <span className="wyr-creator-tag" title="Community Contributor">
                    <Globe size={11} /> by {dilemma.createdBy}
                  </span>
                )}
              </div>
              <span className="wyr-total-votes">
                <Users size={12} /> {dilemma.totalVotes.toLocaleString()} votes cast
              </span>
            </div>

            {/* Dual Choice Battle Arena */}
            <div className="wyr-choices-grid">
              {/* Option A Box (Electric Coral / Crimson) */}
              <div
                className={`wyr-choice-card wyr-choice-a ${dilemma.userVote === 'a' ? 'is-selected' : ''} ${
                  hasVoted ? 'is-revealed' : 'is-clickable'
                } ${hasVoted && dilemma.pctA > dilemma.pctB ? 'is-winner' : ''}`}
                onClick={() => !hasVoted && handleVote('a')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !hasVoted) handleVote('a');
                }}
              >
                <div className="wyr-choice-header">
                  <div className="wyr-badge-combo">
                    <span className="wyr-choice-tag tag-a">OPTION A</span>
                    {hasVoted && dilemma.pctA > dilemma.pctB && (
                      <span className="wyr-winner-badge">👑 WINNING</span>
                    )}
                  </div>
                  {dilemma.userVote === 'a' && (
                    <span className="wyr-you-voted-badge">
                      <Check size={11} /> You Chose
                    </span>
                  )}
                </div>

                <div className="wyr-choice-text">{dilemma.optionA}</div>

                {hasVoted && (
                  <div className="wyr-result-stats">
                    <div className="wyr-result-row">
                      <span className="wyr-result-percentage a">{dilemma.pctA}%</span>
                      <span className="wyr-votes-tally">{dilemma.votesA.toLocaleString()} votes</span>
                    </div>
                    <div className="wyr-progress-bar-track">
                      <div
                        className="wyr-progress-bar-fill fill-a"
                        style={{ width: `${dilemma.pctA}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Electric Clash VS Centerpiece */}
              <div className="wyr-vs-badge" aria-label="Versus">
                <span className="wyr-vs-pulse" />
                <span className="wyr-vs-text">VS</span>
              </div>

              {/* Option B Box (Electric Cyan / Azure) */}
              <div
                className={`wyr-choice-card wyr-choice-b ${dilemma.userVote === 'b' ? 'is-selected' : ''} ${
                  hasVoted ? 'is-revealed' : 'is-clickable'
                } ${hasVoted && dilemma.pctB > dilemma.pctA ? 'is-winner' : ''}`}
                onClick={() => !hasVoted && handleVote('b')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !hasVoted) handleVote('b');
                }}
              >
                <div className="wyr-choice-header">
                  <div className="wyr-badge-combo">
                    <span className="wyr-choice-tag tag-b">OPTION B</span>
                    {hasVoted && dilemma.pctB > dilemma.pctA && (
                      <span className="wyr-winner-badge">👑 WINNING</span>
                    )}
                  </div>
                  {dilemma.userVote === 'b' && (
                    <span className="wyr-you-voted-badge">
                      <Check size={11} /> You Chose
                    </span>
                  )}
                </div>

                <div className="wyr-choice-text">{dilemma.optionB}</div>

                {hasVoted && (
                  <div className="wyr-result-stats">
                    <div className="wyr-result-row">
                      <span className="wyr-result-percentage b">{dilemma.pctB}%</span>
                      <span className="wyr-votes-tally">{dilemma.votesB.toLocaleString()} votes</span>
                    </div>
                    <div className="wyr-progress-bar-track">
                      <div
                        className="wyr-progress-bar-fill fill-b"
                        style={{ width: `${dilemma.pctB}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic Tug-of-War Split Meter */}
            {hasVoted && (
              <div className="wyr-tug-wrapper">
                <div className="wyr-tug-header">
                  <span className="wyr-tug-label a">Option A • {dilemma.pctA}%</span>
                  <span className="wyr-tug-center">GLOBAL BATTLE SPLIT</span>
                  <span className="wyr-tug-label b">{dilemma.pctB}% • Option B</span>
                </div>
                <div className="wyr-tug-track">
                  <div className="wyr-tug-fill fill-a" style={{ width: `${dilemma.pctA}%` }} />
                  <div className="wyr-tug-fill fill-b" style={{ width: `${dilemma.pctB}%` }} />
                  <div className="wyr-tug-pin" style={{ left: `${dilemma.pctA}%` }} />
                </div>
              </div>
            )}

            {/* Revealed Verdict Banner & Action Hub */}
            {hasVoted && (
              <div className="wyr-post-vote-section">
                <div className={`wyr-verdict-banner ${isMajority ? 'majority' : 'rebel'}`}>
                  {isMajority ? (
                    <>
                      <Sparkles size={16} className="wyr-verdict-icon" />
                      <span><strong>Majority Pick ({userPct}%)!</strong> You stand with humanity.</span>
                    </>
                  ) : (
                    <>
                      <Flame size={16} className="wyr-verdict-icon rebel-icon" />
                      <span><strong>Rebel Outlier ({userPct}%)!</strong> Contrarian pick.</span>
                    </>
                  )}
                </div>

                <div className="wyr-button-row">
                  <button
                    type="button"
                    className="wyr-btn-primary wyr-next-btn"
                    onClick={handleNextDilemma}
                  >
                    <span>Next Dilemma 🎲</span>
                    <ArrowRight size={16} />
                  </button>

                  <button
                    type="button"
                    className="wyr-btn-secondary wyr-share-btn"
                    onClick={handleShare}
                  >
                    <Share2 size={15} />
                    <span>Challenge</span>
                  </button>
                </div>
              </div>
            )}

            {!hasVoted && (
              <div className="wyr-prompt-hint">
                <Zap size={14} /> Tap an option to see where the world stands.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Alignment Stats Modal */}
      {showStatsModal && (
        <div className="wyr-modal-backdrop" onClick={() => setShowStatsModal(false)}>
          <div className="wyr-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="wyr-modal-header">
              <div className="wyr-modal-title-group">
                <Trophy className="wyr-trophy-gold" size={24} />
                <h2>Humanity Alignment Score</h2>
              </div>
              <button
                type="button"
                className="wyr-modal-close"
                onClick={() => setShowStatsModal(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="wyr-modal-body">
              {statsLoading ? (
                <div className="wyr-modal-loading">
                  <LoaderCircle size={30} className="wyr-spin" />
                  <p>Calculating alignment with humanity…</p>
                </div>
              ) : (
                <>
                  <div className="wyr-archetype-box">
                    <span className="wyr-archetype-label">YOUR PSYCHOLOGICAL ARCHETYPE</span>
                    <h3 className="wyr-archetype-title">{stats?.archetype || 'Balanced Realist ⚖️'}</h3>
                    <p className="wyr-archetype-desc">
                      Based on {stats?.totalVotes ?? 0} dilemmas answered across the global student network.
                    </p>
                  </div>

                  <div className="wyr-stats-grid">
                    <div className="wyr-stat-item">
                      <span className="wyr-stat-number">{stats?.alignmentPct ?? 50}%</span>
                      <span className="wyr-stat-label">Conformity Index</span>
                      <small className="wyr-stat-sub">Agreed with majority</small>
                    </div>

                    <div className="wyr-stat-item">
                      <span className="wyr-stat-number">{stats?.rebelPct ?? 50}%</span>
                      <span className="wyr-stat-label">Rebel Score</span>
                      <small className="wyr-stat-sub">Independent outliers</small>
                    </div>

                    <div className="wyr-stat-item">
                      <span className="wyr-stat-number">{stats?.totalVotes ?? 0}</span>
                      <span className="wyr-stat-label">Total Answered</span>
                      <small className="wyr-stat-sub">Dilemmas resolved</small>
                    </div>
                  </div>

                  <div className="wyr-global-stat-footer">
                    <Globe size={16} />
                    <span>
                      {stats?.totalGlobalVotes?.toLocaleString() ?? '24,500'} global decisions recorded across{' '}
                      {stats?.globalDilemmasCount ?? '12'} dilemmas.
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="wyr-modal-actions">
              <button
                type="button"
                className="wyr-btn-primary"
                onClick={() => setShowStatsModal(false)}
              >
                Back to Playing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit New Dilemma Modal */}
      {showSubmitModal && (
        <div className="wyr-modal-backdrop" onClick={() => setShowSubmitModal(false)}>
          <div className="wyr-modal-card wyr-submit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wyr-modal-header">
              <div className="wyr-modal-title-group">
                <Plus size={22} />
                <h2>Create a Global Dilemma</h2>
              </div>
              <button
                type="button"
                className="wyr-modal-close"
                onClick={() => setShowSubmitModal(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitDilemma} className="wyr-modal-form">
              <div className="wyr-creator-indicator">
                <Globe size={13} />
                <span>
                  Posting as <strong>{user?.username ? `@${user.username}` : 'Anonymous Student'}</strong>
                  {!user && ' (Sign in to feature your verified @handle)'}
                </span>
              </div>

              <div className="wyr-form-group">
                <label htmlFor="wyr-opt-a">Option A (The First Choice)</label>
                <input
                  id="wyr-opt-a"
                  type="text"
                  maxLength={140}
                  placeholder="e.g. Have photographic memory of everything"
                  value={newOptionA}
                  onChange={(e) => setNewOptionA(e.target.value)}
                  required
                />
              </div>

              <div className="wyr-form-group">
                <label htmlFor="wyr-opt-b">Option B (The Counter Choice)</label>
                <input
                  id="wyr-opt-b"
                  type="text"
                  maxLength={140}
                  placeholder="e.g. Speak every language on Earth fluently"
                  value={newOptionB}
                  onChange={(e) => setNewOptionB(e.target.value)}
                  required
                />
              </div>

              <div className="wyr-form-group">
                <label htmlFor="wyr-opt-cat">Category</label>
                <select
                  id="wyr-opt-cat"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  <option value="universal">Universal 🎲</option>
                  <option value="superpower">Superpower 🦸</option>
                  <option value="hypothetical">High Stakes / Hypothetical 💰</option>
                  <option value="lifestyle">Lifestyle & Daily Habits ☕</option>
                  <option value="college">Campus & Exams 🎓</option>
                  <option value="deep">Deep & Moral 🧠</option>
                  <option value="absurd">Absurd & Wild 🦄</option>
                </select>
              </div>

              {/* Live Clash Arena Preview */}
              <div className="wyr-preview-container">
                <span className="wyr-preview-header">LIVE ARENA PREVIEW</span>
                <div className="wyr-preview-arena">
                  <div className="wyr-preview-box preview-a">
                    <span className="wyr-preview-tag a">OPTION A</span>
                    <p className="wyr-preview-text">{newOptionA.trim() || 'First choice will appear here…'}</p>
                  </div>
                  <div className="wyr-preview-vs">VS</div>
                  <div className="wyr-preview-box preview-b">
                    <span className="wyr-preview-tag b">OPTION B</span>
                    <p className="wyr-preview-text">{newOptionB.trim() || 'Counter choice will appear here…'}</p>
                  </div>
                </div>
              </div>

              <div className="wyr-modal-actions">
                <button
                  type="button"
                  className="wyr-btn-secondary"
                  onClick={() => setShowSubmitModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newOptionA.trim() || !newOptionB.trim()}
                  className="wyr-btn-primary"
                >
                  {submitting ? 'Publishing…' : 'Publish to World 🌍'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
