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
  Sparkles
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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  }, []);

  // Fetch Reels
  const fetchReels = useCallback(async (cat: string) => {
    setLoading(true);
    try {
      const url = `${API}/pulse/reels?category=${encodeURIComponent(cat)}&limit=15`;
      const res = await fetch(url, {
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setReels(data.reels || []);
      }
    } catch (err) {
      console.error('Failed to load reels', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReels(activeCategory);
  }, [fetchReels, activeCategory]);

  // Set Mute Preference
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('pulse_reels_muted', String(next));
      videoRefs.current.forEach((vid) => {
        vid.muted = next;
      });
      return next;
    });
  }, []);

  // IntersectionObserver to auto-play visible video
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
          if (!reel) return;
          const videoEl = videoRefs.current.get(reel.id);

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(idx);
            if (videoEl) {
              videoEl.muted = isMuted;
              videoEl.play().catch(() => {
                // Browser autoplay policy with sound fallback
                videoEl.muted = true;
                setIsMuted(true);
                videoEl.play().catch(() => {});
              });
            }
          } else {
            if (videoEl) {
              videoEl.pause();
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
  }, [reels, isMuted]);

  // Like Reel Handler
  const handleLikeReel = useCallback(async (reel: PulseReel) => {
    if (!token || !currentUser) {
      showToast('Sign in to like reels');
      return;
    }

    // Optimistic toggle
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
      // Double tap detected!
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = null;

      // Spawn pop heart animation
      setFloatingHeart({ x: relX, y: relY, id: now });
      setTimeout(() => {
        setFloatingHeart((prev) => (prev?.id === now ? null : prev));
      }, 850);

      // Like if not already liked
      if (!reel.isLiked) {
        void handleLikeReel(reel);
      }
    } else {
      lastTapRef.current = { time: now, x: relX, y: relY };
      // Schedule single tap (Play/Pause)
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
          // Update comment count in reel state
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
          <p>No reels found in this category.</p>
          <button className="reels-category-pill active" onClick={() => setActiveCategory('all')}>
            View All Reels
          </button>
        </div>
      ) : (
        <div className="reels-scroll-track" ref={containerRef}>
          {reels.map((reel, idx) => (
            <div
              key={reel.id}
              className="reel-slide"
              data-reel-index={idx}
              onClick={(e) => handleTapScreen(e, reel)}
            >
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
                loop
                muted={isMuted}
                preload={idx <= 1 ? 'auto' : 'metadata'}
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
