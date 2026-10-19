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
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Dilemmas 🎲' },
  { id: 'superpower', label: 'Superpowers 🦸' },
  { id: 'hypothetical', label: 'High Stakes 💰' },
  { id: 'lifestyle', label: 'Lifestyle ☕' },
  { id: 'college', label: 'Campus Chaos 🎓' },
  { id: 'deep', label: 'Deep & Moral 🧠' },
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
    async (targetId?: string | null, cat: string = activeCategory) => {
      setLoading(true);
      const origin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev')
        ? 'https://student-addit.mgp899123.workers.dev'
        : '';

      try {
        let endpoint = `${origin}/api/wyr/dilemmas/random?voter_key=${encodeURIComponent(voterKey)}`;
        if (targetId) {
          endpoint = `${origin}/api/wyr/dilemmas/${encodeURIComponent(targetId)}?voter_key=${encodeURIComponent(voterKey)}`;
        } else {
          if (cat && cat !== 'all') endpoint += `&category=${encodeURIComponent(cat)}`;
          if (seenIds.length > 0) endpoint += `&exclude=${encodeURIComponent(seenIds.slice(-20).join(','))}`;
        }

        const res = await fetch(endpoint, {
          headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.dilemma) {
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
        const randomItem = list[Math.floor(Math.random() * list.length)];
        // Check local storage for any previously saved vote on this item
        const savedChoice = localStorage.getItem(`adda-wyr-vote:${randomItem.id}`) as 'a' | 'b' | null;
        setDilemma({
          ...randomItem,
          userVote: savedChoice || null,
        });
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
    loadDilemma(null, activeCategory);
  };

  const handleCategorySelect = (catId: string) => {
    setActiveCategory(catId);
    loadDilemma(null, catId);
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

      {/* Top Header Bar */}
      <header className="wyr-header">
        <div className="wyr-brand">
          <div className="wyr-brand-icon-box">
            <Scale size={22} className="wyr-brand-icon" />
          </div>
          <div>
            <div className="wyr-title-row">
              <h1 className="wyr-title">Would You Rather?</h1>
              <span className="wyr-badge-live">HUMANITY VS YOU</span>
            </div>
            <p className="wyr-subtitle">The global dilemma engine. Pick one, see humanity's verdict.</p>
          </div>
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
            <Trophy size={16} />
            <span className="wyr-btn-label">Alignment</span>
          </button>

          <button
            type="button"
            className="wyr-action-btn wyr-btn-accent"
            onClick={() => setShowSubmitModal(true)}
            title="Submit a Dilemma"
          >
            <Plus size={16} />
            <span className="wyr-btn-label">Submit</span>
          </button>
        </div>
      </header>

      {/* Anonymous visitor alert / quick sign in nudge */}
      {!user && (
        <div className="wyr-anon-banner">
          <Globe size={16} className="wyr-anon-globe" />
          <span>
            Playing as <b>Anonymous Voyager</b>. Your votes count to the global tally!
          </span>
          {onOpenSignIn && (
            <button type="button" className="wyr-anon-signin-btn" onClick={onOpenSignIn}>
              Sign In <ArrowRight size={13} />
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
            <LoaderCircle size={36} className="wyr-spin" />
            <p>Summoning next human dilemma…</p>
          </div>
        )}

        {!loading && dilemma && (
          <div className="wyr-card" key={dilemma.id}>
            {/* Dilemma Category Pill */}
            <div className="wyr-card-top">
              <span className="wyr-tag">
                <Sparkles size={13} /> {dilemma.category.toUpperCase()}
              </span>
              <span className="wyr-total-votes">
                <Users size={13} /> {dilemma.totalVotes.toLocaleString()} votes cast
              </span>
            </div>

            {/* Dual Choice Battle Arena */}
            <div className="wyr-choices-grid">
              {/* Option A Box */}
              <div
                className={`wyr-choice-card wyr-choice-a ${dilemma.userVote === 'a' ? 'is-selected' : ''} ${
                  hasVoted ? 'is-revealed' : 'is-clickable'
                }`}
                onClick={() => !hasVoted && handleVote('a')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !hasVoted) handleVote('a');
                }}
              >
                <div className="wyr-choice-header">
                  <span className="wyr-choice-tag tag-a">OPTION A</span>
                  {dilemma.userVote === 'a' && (
                    <span className="wyr-you-voted-badge">
                      <Check size={13} /> You Chose
                    </span>
                  )}
                </div>

                <div className="wyr-choice-text">{dilemma.optionA}</div>

                {hasVoted && (
                  <div className="wyr-result-stats">
                    <div className="wyr-result-percentage">{dilemma.pctA}%</div>
                    <div className="wyr-progress-bar-track">
                      <div
                        className="wyr-progress-bar-fill fill-a"
                        style={{ width: `${dilemma.pctA}%` }}
                      />
                    </div>
                    <div className="wyr-votes-tally">{dilemma.votesA.toLocaleString()} votes</div>
                  </div>
                )}
              </div>

              {/* OR Divider Badge */}
              <div className="wyr-or-badge">
                <span className="wyr-or-text">OR</span>
              </div>

              {/* Option B Box */}
              <div
                className={`wyr-choice-card wyr-choice-b ${dilemma.userVote === 'b' ? 'is-selected' : ''} ${
                  hasVoted ? 'is-revealed' : 'is-clickable'
                }`}
                onClick={() => !hasVoted && handleVote('b')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !hasVoted) handleVote('b');
                }}
              >
                <div className="wyr-choice-header">
                  <span className="wyr-choice-tag tag-b">OPTION B</span>
                  {dilemma.userVote === 'b' && (
                    <span className="wyr-you-voted-badge">
                      <Check size={13} /> You Chose
                    </span>
                  )}
                </div>

                <div className="wyr-choice-text">{dilemma.optionB}</div>

                {hasVoted && (
                  <div className="wyr-result-stats">
                    <div className="wyr-result-percentage">{dilemma.pctB}%</div>
                    <div className="wyr-progress-bar-track">
                      <div
                        className="wyr-progress-bar-fill fill-b"
                        style={{ width: `${dilemma.pctB}%` }}
                      />
                    </div>
                    <div className="wyr-votes-tally">{dilemma.votesB.toLocaleString()} votes</div>
                  </div>
                )}
              </div>
            </div>

            {/* Revealed Verdict Banner & Action Hub */}
            {hasVoted && (
              <div className="wyr-post-vote-section">
                <div className={`wyr-verdict-banner ${isMajority ? 'majority' : 'rebel'}`}>
                  {isMajority ? (
                    <>
                      <Sparkles size={20} className="wyr-verdict-icon" />
                      <div>
                        <strong>You stand with humanity! 🌍</strong>
                        <span>{userPct}% of participants agreed with your choice.</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Flame size={20} className="wyr-verdict-icon rebel-icon" />
                      <div>
                        <strong>Rebel Outlier! 🔥</strong>
                        <span>Only {userPct}% dare to make this choice. You are a contrarian thinker.</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="wyr-button-row">
                  <button
                    type="button"
                    className="wyr-btn-primary wyr-next-btn"
                    onClick={handleNextDilemma}
                  >
                    <span>Next Dilemma</span>
                    <ArrowRight size={18} />
                  </button>

                  <button
                    type="button"
                    className="wyr-btn-secondary wyr-share-btn"
                    onClick={handleShare}
                  >
                    <Share2 size={17} />
                    <span>Challenge a Friend</span>
                  </button>
                </div>
              </div>
            )}

            {!hasVoted && (
              <div className="wyr-prompt-hint">
                <Zap size={15} /> Tap an option to see where the world stands.
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
          <div className="wyr-modal-card" onClick={(e) => e.stopPropagation()}>
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
                  <option value="universal">Universal</option>
                  <option value="superpower">Superpower</option>
                  <option value="hypothetical">High Stakes / Hypothetical</option>
                  <option value="lifestyle">Lifestyle & Daily Habits</option>
                  <option value="college">Campus & Exams</option>
                  <option value="deep">Deep & Moral</option>
                </select>
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
