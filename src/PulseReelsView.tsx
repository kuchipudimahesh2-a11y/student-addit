import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent, type TouchEvent } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  X,
  Send,
  LoaderCircle,
  Music,
  Flame,
  Sparkles,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  RotateCcw,
  Compass,
  Eye
} from 'lucide-react';
import './pulse-reels.css';

export type PulseReel = {
  id: string;
  title: string;
  caption?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number;
  authorName: string;
  authorAvatar?: string | null;
  soundTitle?: string | null;
  category: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked: boolean;
  createdAt: string;
};

export type PulseReelComment = {
  id: string;
  reelId: string;
  userId: string | null;
  authorHandle: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
};

const CATEGORIES = [
  { id: 'all', label: '🔥 All Reels' },
  { id: 'campus_life', label: '🎓 Campus Life' },
  { id: 'memes', label: '😂 Memes' },
  { id: 'tech_coding', label: '💻 Tech & Code' },
  { id: 'hostel', label: '🍜 Hostel Life' },
  { id: 'exam_stress', label: '📚 Exam Stress' },
] as const;

const isAddaPagesDomain = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev');
const API_ORIGIN = isAddaPagesDomain ? 'https://student-addit.mgp899123.workers.dev' : '';
const API = `${API_ORIGIN}/api`;

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(num || 0);
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PulseReelsView({
  token,
  currentUser,
  onShareToChat,
}: {
  token: string;
  currentUser: { id: string; name: string; username: string; gender: 'male' | 'female'; avatarUrl?: string | null } | null;
  onShareToChat?: (username: string) => void;
}) {
  const [reels, setReels] = useState<PulseReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isExhausted, setIsExhausted] = useState(false);
  const [includeWatched, setIncludeWatched] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('pulse_reels_muted') === 'true');
  const [flashIcon, setFlashIcon] = useState<'play' | 'pause' | null>(null);
  const [floatingHeart, setFloatingHeart] = useState<{ x: number; y: number; id: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Comments Bottom Sheet
  const [activeReelForComments, setActiveReelForComments] = useState<PulseReel | null>(null);
  const [comments, setComments] = useState<PulseReelComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapTimeoutRef = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const fetchingMoreRef = useRef(false);
  const isExhaustedRef = useRef(false);
  const reqGenRef = useRef(0);
  const lastWheelTimeRef = useRef(0);

  // Viewed reels cache for client session deduplication & threshold tracking
  const viewedReelsRef = useRef<Set<string>>(new Set());

  // Anonymous guest session ID (persisted across unmounts/reloads per device)
  const guestSessionIdRef = useRef<string>('');
  if (!guestSessionIdRef.current) {
    try {
      let id = localStorage.getItem('adda_pulse_guest_id');
      if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'guest-' + Date.now();
        localStorage.setItem('adda_pulse_guest_id', id);
      }
      guestSessionIdRef.current = id;
    } catch {
      guestSessionIdRef.current = 'guest-' + Date.now();
    }
  }

  // Load viewed reels from local storage on mount/identity change
  useEffect(() => {
    try {
      const storageKey = `adda_pulse_watched_${currentUser?.id || guestSessionIdRef.current}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => viewedReelsRef.current.add(id));
        }
      }
    } catch {}
  }, [currentUser?.id]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  }, []);

  // Record a meaningful watch event (>= 5s or >= 50% of duration, or ended)
  const recordReelView = useCallback((reelId: string) => {
    if (viewedReelsRef.current.has(reelId)) return;
    viewedReelsRef.current.add(reelId);

    try {
      const storageKey = `adda_pulse_watched_${currentUser?.id || guestSessionIdRef.current}`;
      const raw = localStorage.getItem(storageKey);
      const set = new Set<string>(raw ? JSON.parse(raw) : []);
      set.add(reelId);
      localStorage.setItem(storageKey, JSON.stringify([...set]));
    } catch {}

    void fetch(`${API}/pulse/reels/${encodeURIComponent(reelId)}/view`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-anonymous-session-id': guestSessionIdRef.current,
      },
    }).catch(() => {});
  }, [currentUser?.id, token]);

  // Video playback timeupdate handler for watch threshold
  const handleVideoTimeUpdate = (reelId: string, durationSeconds?: number) => {
    if (viewedReelsRef.current.has(reelId)) return;
    const videoEl = videoRefs.current.get(reelId);
    if (!videoEl) return;
    const currentTime = videoEl.currentTime;
    const totalDuration = durationSeconds || videoEl.duration || 15;
    const threshold = Math.min(5, totalDuration * 0.5);

    if (currentTime >= threshold) {
      recordReelView(reelId);
    }
  };

  const handleVideoEnded = (reelId: string) => {
    recordReelView(reelId);
  };

  // Fetch initial batch of reels
  const fetchReels = useCallback(async (cat: string, withWatched = false) => {
    const reqGen = ++reqGenRef.current;
    setLoading(true);
    setNextCursor(null);
    setIsExhausted(false);
    isExhaustedRef.current = false;
    setIncludeWatched(withWatched);

    try {
      const params = new URLSearchParams({
        category: cat,
        limit: '15',
      });
      if (withWatched) {
        params.set('includeWatched', 'true');
      }

      const res = await fetch(`${API}/pulse/reels?${params.toString()}`, {
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-anonymous-session-id': guestSessionIdRef.current,
        },
      });

      if (reqGen !== reqGenRef.current) return;

      if (res.ok) {
        const data = await res.json();
        const initial: PulseReel[] = data.reels || [];

        // Deduplicate records using actual, stable database IDs
        const seen = new Set<string>();
        const deduped = initial.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

        setReels(deduped);
        setNextCursor(data.nextCursor || null);
        setActiveIndex(0);

        if (!data.hasMore || !data.nextCursor) {
          setIsExhausted(true);
          isExhaustedRef.current = true;
        }
      } else {
        showToast('Could not load reels');
      }
    } catch (err) {
      if (reqGen === reqGenRef.current) {
        console.error('Failed to load reels', err);
        showToast('Error loading reels');
      }
    } finally {
      if (reqGen === reqGenRef.current) {
        setLoading(false);
      }
    }
  }, [token, showToast]);

  useEffect(() => {
    fetchReels(activeCategory, false);
  }, [fetchReels, activeCategory]);

  // Fetch more reels when approaching bottom and cursor is available
  const loadMoreReels = useCallback(async () => {
    if (fetchingMoreRef.current || isExhaustedRef.current || !nextCursor) return;
    fetchingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        category: activeCategory,
        cursor: nextCursor,
        limit: '15',
      });
      if (includeWatched) {
        params.set('includeWatched', 'true');
      }

      const res = await fetch(`${API}/pulse/reels?${params.toString()}`, {
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-anonymous-session-id': guestSessionIdRef.current,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const incoming: PulseReel[] = data.reels || [];
        if (incoming.length > 0) {
          setReels((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newItems = incoming.filter((r) => !existingIds.has(r.id));
            return [...prev, ...newItems];
          });
        }

        setNextCursor(data.nextCursor || null);
        if (!data.hasMore || !data.nextCursor) {
          setIsExhausted(true);
          isExhaustedRef.current = true;
        }
      }
    } catch (err) {
      console.error('Failed to load more reels', err);
    } finally {
      setLoadingMore(false);
      fetchingMoreRef.current = false;
    }
  }, [nextCursor, activeCategory, token, includeWatched]);

  // Navigation between slides
  const totalSlides = reels.length + (isExhausted && reels.length > 0 ? 1 : 0);

  const goToReel = useCallback((targetIndex: number) => {
    if (reels.length === 0) return;

    // Trigger auto-expansion when nearing the end
    if (targetIndex >= reels.length - 2 && nextCursor && !fetchingMoreRef.current && !isExhaustedRef.current) {
      void loadMoreReels();
    }

    if (targetIndex < 0) {
      targetIndex = 0;
    }
    if (targetIndex >= totalSlides) {
      targetIndex = Math.max(0, totalSlides - 1);
    }

    const targetSlide = containerRef.current?.querySelector(`[data-reel-index="${targetIndex}"]`);
    if (targetSlide) {
      targetSlide.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveIndex(targetIndex);
    }
  }, [reels.length, nextCursor, loadMoreReels, totalSlides]);

  // Desktop Mouse Wheel Navigation
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 320) return;
    if (Math.abs(e.deltaY) > 20) {
      lastWheelTimeRef.current = now;
      if (e.deltaY > 0) {
        goToReel(activeIndex + 1);
      } else if (activeIndex > 0) {
        goToReel(activeIndex - 1);
      }
    }
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null || reels.length === 0) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    touchStartY.current = null;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        goToReel(activeIndex + 1);
      } else if (activeIndex > 0) {
        goToReel(activeIndex - 1);
      }
    }
  };

  // Set Mute Preference
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('pulse_reels_muted', String(next));
      videoRefs.current.forEach((vid) => {
        vid.muted = next;
        if (!next) {
          vid.volume = 1.0;
        }
      });
      return next;
    });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goToReel(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goToReel(activeIndex - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        const currentReel = reels[activeIndex];
        if (currentReel) {
          const videoEl = videoRefs.current.get(currentReel.id);
          if (videoEl) {
            if (videoEl.paused) {
              videoEl.play().catch(() => {});
              setFlashIcon('play');
            } else {
              videoEl.pause();
            }
            setTimeout(() => setFlashIcon(null), 500);
          }
        }
      } else if (e.key === 'm') {
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, goToReel, reels, toggleMute]);

  // IntersectionObserver to auto-play visible video & auto-fetch next cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container || reels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const indexAttr = entry.target.getAttribute('data-reel-index');
          if (!indexAttr) return;
          const idx = parseInt(indexAttr, 10);
          const reel = reels[idx];

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(idx);

            // Auto-load next batch when approaching end of loaded items
            if (idx >= reels.length - 2 && nextCursor && !fetchingMoreRef.current && !isExhaustedRef.current) {
              void loadMoreReels();
            }

            if (reel) {
              const videoEl = videoRefs.current.get(reel.id);
              if (videoEl) {
                videoEl.muted = isMuted;
                videoEl.volume = 1.0;
                videoEl.play().catch(() => {
                  videoEl.muted = true;
                  setIsMuted(true);
                  videoEl.play().catch(() => {});
                });
              }
            }
          } else {
            if (reel) {
              const videoEl = videoRefs.current.get(reel.id);
              if (videoEl) {
                videoEl.pause();
              }
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.6,
      }
    );

    const slides = container.querySelectorAll('.reel-slide');
    slides.forEach((slide) => observer.observe(slide));

    return () => {
      observer.disconnect();
    };
  }, [reels, isMuted, nextCursor, loadMoreReels]);

  // Like Reel Handler
  const handleLikeReel = useCallback(async (reel: PulseReel) => {
    if (!token || !currentUser) {
      showToast('Sign in to like reels');
      return;
    }

    setReels((prev) =>
      prev.map((r) => {
        if (r.id !== reel.id) return r;
        const nextLiked = !r.isLiked;
        return {
          ...r,
          isLiked: nextLiked,
          likesCount: nextLiked ? r.likesCount + 1 : Math.max(0, r.likesCount - 1),
        };
      })
    );

    try {
      const res = await fetch(`${API}/pulse/reels/${reel.id}/like`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setReels((prev) =>
          prev.map((r) => (r.id === reel.id ? { ...r, isLiked: data.liked, likesCount: data.likesCount } : r))
        );
      }
    } catch (err) {
      console.error('Like toggle failed', err);
    }
  }, [token, currentUser, showToast]);

  // Tap & Double-Tap Logic
  const handleTapScreen = useCallback((e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>, reel: PulseReel) => {
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const now = Date.now();
    const lastTap = lastTapRef.current;

    if (lastTap && now - lastTap.time < 300) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = null;

      setFloatingHeart({ x: relX, y: relY, id: now });
      setTimeout(() => {
        setFloatingHeart((prev) => (prev?.id === now ? null : prev));
      }, 850);

      if (!reel.isLiked) {
        void handleLikeReel(reel);
      }
    } else {
      lastTapRef.current = { time: now, x: relX, y: relY };
      tapTimeoutRef.current = window.setTimeout(() => {
        lastTapRef.current = null;
        const videoEl = videoRefs.current.get(reel.id);
        if (videoEl) {
          if (videoEl.paused) {
            videoEl.play().catch(() => {});
            setFlashIcon('play');
          } else {
            videoEl.pause();
            setFlashIcon('pause');
          }
          setTimeout(() => setFlashIcon(null), 500);
        }
      }, 300);
    }
  }, [handleLikeReel]);

  // Share Reel Handler
  const handleShareReel = useCallback(async (reel: PulseReel) => {
    const shareUrl = `${location.origin}/#reel-${reel.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: reel.title,
          text: reel.caption || 'Watch this reel on Adda Pulse!',
          url: shareUrl,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      if (onShareToChat) {
        showToast('Link copied! Paste in any chat or post 📋');
      } else {
        showToast('Reel link copied to clipboard! 📋');
      }
    } catch {
      showToast('Unable to copy link');
    }
  }, [showToast, onShareToChat]);

  // Open Comments Bottom Sheet
  const handleOpenComments = useCallback(async (reel: PulseReel) => {
    setActiveReelForComments(reel);
    setLoadingComments(true);
    setComments([]);
    try {
      const res = await fetch(`${API}/pulse/reels/${reel.id}/comments`, {
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Failed to load comments', err);
    } finally {
      setLoadingComments(false);
    }
  }, [token]);

  // Submit Reel Comment
  const handleSubmitComment = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !currentUser || !activeReelForComments) {
      showToast('Sign in to leave a comment');
      return;
    }
    const text = newCommentText.trim();
    if (!text) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`${API}/pulse/reels/${activeReelForComments.id}/comments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          setComments((prev) => [...prev, data.comment]);
          setNewCommentText('');
          setReels((prev) =>
            prev.map((r) =>
              r.id === activeReelForComments.id ? { ...r, commentsCount: r.commentsCount + 1 } : r
            )
          );
        }
      }
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setSubmittingComment(false);
    }
  }, [token, currentUser, activeReelForComments, newCommentText, showToast]);

  return (
    <div className="reels-feed-container">
      {/* Desktop Next/Previous Floating Chevrons */}
      <div className="reels-desktop-nav">
        <button
          className="reels-nav-arrow-btn"
          disabled={activeIndex <= 0}
          onClick={() => goToReel(activeIndex - 1)}
          title="Previous Reel (or Up Arrow)"
          aria-label="Previous Reel"
        >
          <ChevronUp size={20} />
        </button>
        <span className="reels-nav-counter">
          {loadingMore ? (
            <LoaderCircle className="spin" size={13} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
          ) : totalSlides > 0 ? (
            `${Math.min(activeIndex + 1, totalSlides)}/${totalSlides}`
          ) : (
            ''
          )}
        </span>
        <button
          className="reels-nav-arrow-btn"
          disabled={activeIndex >= totalSlides - 1}
          onClick={() => goToReel(activeIndex + 1)}
          title="Next Reel (or Down Arrow)"
          aria-label="Next Reel"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {/* 1. Category Filter Strip */}
      <div className="reels-category-strip">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`reels-category-pill ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="reels-toast">
          <Sparkles size={14} color="#d95b3e" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 2. Vertical Snap-Scroll Reel Track */}
      {loading ? (
        <div className="reels-state-center">
          <LoaderCircle className="spin" size={28} />
          <span>Loading Reels & Memes…</span>
        </div>
      ) : reels.length === 0 ? (
        <div className="reels-state-center">
          <Flame size={32} color="#d95b3e" />
          <p>No unseen reels found in this category.</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '12px' }}>
            <button className="reels-category-pill active" onClick={() => fetchReels(activeCategory, true)}>
              <Eye size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              Browse All Including Watched
            </button>
            {activeCategory !== 'all' && (
              <button className="reels-category-pill" onClick={() => setActiveCategory('all')}>
                View All Categories
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="reels-scroll-track"
          ref={containerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          {reels.map((reel, idx) => (
            <div
              key={reel.id}
              className="reel-slide"
              data-reel-index={idx}
              onClick={(e) => handleTapScreen(e, reel)}
            >
              {/* Ambient Blurred Video Backdrop */}
              {reel.thumbnailUrl && (
                <img
                  src={reel.thumbnailUrl}
                  alt=""
                  className="reel-video-backdrop"
                  aria-hidden="true"
                  loading="lazy"
                />
              )}

              {/* Vertical Video Element */}
              <video
                ref={(el) => {
                  if (el) videoRefs.current.set(reel.id, el);
                  else videoRefs.current.delete(reel.id);
                }}
                className="reel-video-element"
                src={reel.videoUrl}
                poster={reel.thumbnailUrl || undefined}
                playsInline
                autoPlay={idx === 0}
                loop
                muted={isMuted}
                preload={Math.abs(idx - activeIndex) <= 1 ? 'auto' : 'metadata'}
                crossOrigin="anonymous"
                onTimeUpdate={() => handleVideoTimeUpdate(reel.id, reel.durationSeconds)}
                onEnded={() => handleVideoEnded(reel.id)}
              />

              {/* Gradient Vignette for Readability */}
              <div className="reel-gradient-vignette" />

              {/* Flash Play/Pause Center Indicator */}
              {flashIcon && idx === activeIndex && (
                <div className={`reel-center-flash ${flashIcon ? 'visible' : ''}`}>
                  {flashIcon === 'play' ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}
                </div>
              )}

              {/* Double-Tap Pop Heart */}
              {floatingHeart && idx === activeIndex && (
                <div
                  className="reel-doubletap-heart"
                  style={{ left: floatingHeart.x, top: floatingHeart.y }}
                >
                  <Heart size={82} fill="currentColor" />
                </div>
              )}

              {/* Floating Unmute Hint Prompt */}
              {isMuted && idx === activeIndex && (
                <button
                  type="button"
                  className="reel-sound-unmute-hint"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  title="Click to unmute sound"
                >
                  <Volume2 size={15} />
                  <span>Tap for Sound 🔊</span>
                </button>
              )}

              {/* Top-Right Mute Toggle */}
              <button
                className="reel-audio-pill"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                title={isMuted ? 'Unmute video' : 'Mute video'}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              {/* Right Action Rail */}
              <div className="reel-action-rail" onClick={(e) => e.stopPropagation()}>
                {/* Like Button */}
                <button
                  className={`reel-action-btn ${reel.isLiked ? 'liked' : ''}`}
                  onClick={() => void handleLikeReel(reel)}
                  title="Like Reel"
                >
                  <div className="reel-action-icon-circle">
                    <Heart size={22} fill={reel.isLiked ? 'currentColor' : 'none'} />
                  </div>
                  <span className="reel-action-count">{formatCompactNumber(reel.likesCount)}</span>
                </button>

                {/* Comment Button */}
                <button
                  className="reel-action-btn"
                  onClick={() => void handleOpenComments(reel)}
                  title="View Comments"
                >
                  <div className="reel-action-icon-circle">
                    <MessageCircle size={22} />
                  </div>
                  <span className="reel-action-count">{formatCompactNumber(reel.commentsCount)}</span>
                </button>

                {/* Share Button */}
                <button
                  className="reel-action-btn"
                  onClick={() => void handleShareReel(reel)}
                  title="Share Reel"
                >
                  <div className="reel-action-icon-circle">
                    <Share2 size={20} />
                  </div>
                  <span className="reel-action-count">{formatCompactNumber(reel.sharesCount || 0)}</span>
                </button>
              </div>

              {/* Bottom HUD (Author Info, Title, Caption, Music) */}
              <div className="reel-bottom-hud" onClick={(e) => e.stopPropagation()}>
                <div className="reel-author-row">
                  {reel.authorAvatar ? (
                    <img
                      src={reel.authorAvatar}
                      alt={reel.authorName}
                      className="reel-author-avatar"
                      loading="lazy"
                    />
                  ) : (
                    <div className="reel-author-avatar-fallback">
                      {reel.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="reel-author-meta">
                    <span className="reel-author-name">{reel.authorName}</span>
                    <span className="reel-category-tag">#{reel.category.replace('_', ' ')}</span>
                  </div>
                </div>

                <h2 className="reel-title-text">{reel.title}</h2>
                {reel.caption && <p className="reel-caption-text">{reel.caption}</p>}

                {reel.soundTitle && (
                  <div className="reel-sound-marquee">
                    <Music size={12} />
                    <span>{reel.soundTitle}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* End-Of-Feed Polished Card */}
          {isExhausted && reels.length > 0 && (
            <div
              className="reel-slide reel-slide-end"
              data-reel-index={reels.length}
            >
              <div className="reel-end-card">
                <div className="reel-end-icon-circle">
                  <CheckCircle2 size={36} color="#d95b3e" />
                </div>
                <h2 className="reel-end-title">You're All Caught Up! 🎉</h2>
                <p className="reel-end-subtitle">
                  You've watched all available campus reels in {activeCategory === 'all' ? 'all categories' : `#${activeCategory}`}.
                </p>
                <div className="reel-end-actions">
                  <button
                    className="reel-end-action-btn primary"
                    onClick={() => void fetchReels(activeCategory, false)}
                  >
                    <RotateCcw size={16} />
                    <span>Refresh Feed</span>
                  </button>
                  {activeCategory !== 'all' && (
                    <button
                      className="reel-end-action-btn secondary"
                      onClick={() => setActiveCategory('all')}
                    >
                      <Compass size={16} />
                      <span>Explore All Categories</span>
                    </button>
                  )}
                  <button
                    className="reel-end-action-btn outline"
                    onClick={() => void fetchReels(activeCategory, true)}
                  >
                    <Eye size={16} />
                    <span>Browse Watched Content</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Slide-Up Comments Bottom Sheet */}
      {activeReelForComments && (
        <div className="reels-comments-overlay" onClick={() => setActiveReelForComments(null)}>
          <div className="reels-comments-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="reels-comments-header">
              <div className="reels-comments-title">
                <span>Comments</span>
                <span className="reels-comments-count">({activeReelForComments.commentsCount})</span>
              </div>
              <button
                className="reels-close-btn"
                onClick={() => setActiveReelForComments(null)}
                title="Close comments"
              >
                <X size={18} />
              </button>
            </div>

            <div className="reels-comments-body">
              {loadingComments ? (
                <div className="reels-empty-comments">
                  <LoaderCircle className="spin" size={20} />
                  <p>Loading comments…</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="reels-empty-comments">
                  <p>No comments yet. Be the first to share your take!</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="reel-comment-item">
                    {comment.avatarUrl ? (
                      <img
                        src={comment.avatarUrl}
                        alt={comment.authorHandle}
                        className="reel-comment-avatar"
                      />
                    ) : (
                      <div className="reel-comment-avatar-fallback">
                        {comment.authorHandle.replace('@', '').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="reel-comment-content">
                      <div className="reel-comment-author-row">
                        <span className="reel-comment-handle">{comment.authorHandle}</span>
                        <span className="reel-comment-time">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="reel-comment-text">{comment.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            <form className="reels-comment-input-bar" onSubmit={handleSubmitComment}>
              <input
                type="text"
                className="reels-comment-input"
                placeholder={currentUser ? 'Add a comment...' : 'Sign in to comment'}
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                maxLength={400}
                disabled={!currentUser || submittingComment}
              />
              <button
                type="submit"
                className="reels-comment-submit"
                disabled={!currentUser || !newCommentText.trim() || submittingComment}
                title="Send comment"
              >
                {submittingComment ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
