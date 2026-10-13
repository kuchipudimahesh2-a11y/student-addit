import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  Copy,
  Dice5,
  Eye,
  Filter,
  Flag,
  HelpCircle,
  Inbox,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserX,
  X,
  Zap
} from 'lucide-react';
import './pulse-feed.css';

type User = {
  id: string;
  name: string;
  username: string;
  gender: 'male' | 'female';
  isAdmin?: boolean;
  avatarUrl?: string | null;
};

type PulsePoll = {
  question: string;
  optionA: string;
  optionB: string;
  votesA: number;
  votesB: number;
  myVote: string | null;
};

export type PulsePost = {
  id: string;
  userId?: string | null;
  authorHandle: string;
  avatarUrl?: string | null;
  isAnonymous: boolean;
  isOwner?: boolean;
  channel: 'confessions' | 'hot_takes' | 'real_talk' | 'midnight';
  title?: string | null;
  body: string;
  cardTheme: string;
  gradientTheme?: string;
  fontStyle?: 'sans' | 'serif' | 'mono';
  vibeSticker?: string | null;
  isSpoiler?: boolean;
  source: string;
  promptId?: string | null;
  createdAt: string;
  reactionCounts: Record<string, number>;
  totalReactions: number;
  myReactions: string[];
  commentCount: number;
  poll: PulsePoll | null;
};

type PulsePrompt = {
  id: string;
  channel: string;
  prompt_text: string;
};

type DailyPrompt = {
  id: string;
  channel: string;
  promptText: string;
  date: string;
  responseCount: number;
  hasAnsweredToday: boolean;
};

type PulseComment = {
  id: string;
  postId: string;
  userId?: string | null;
  authorHandle: string;
  avatarUrl?: string | null;
  isAnonymous: boolean;
  isOwner?: boolean;
  body: string;
  createdAt: string;
};

type AnonymousAsk = {
  id: string;
  recipient_username: string;
  question: string;
  reply?: string | null;
  is_published_to_feed: number;
  is_read: number;
  created_at: string;
};

type BurstParticle = {
  id: number;
  emoji: string;
  x: number;
  y: number;
  dx: number;
  dx2: number;
};

const isAddaPagesDomain = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev');
const API_ORIGIN = isAddaPagesDomain ? 'https://student-addit.mgp899123.workers.dev' : '';
const API = `${API_ORIGIN}/api`;

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.') as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

function timeAgo(value: string) {
  const date = new Date(value.endsWith('Z') ? value : value + 'Z');
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const REACTION_EMOJIS: { type: string; emoji: string; label: string }[] = [
  { type: 'fire', emoji: '🔥', label: 'Spicy' },
  { type: 'skull', emoji: '💀', label: 'Relatable' },
  { type: 'popcorn', emoji: '🍿', label: 'Drama' },
  { type: 'brain', emoji: '🧠', label: 'Truth' },
  { type: 'heartbreak', emoji: '💔', label: 'Felt That' },
];

const THEME_OPTIONS = [
  { id: 'aurora', label: 'Aurora', emoji: '🌅' },
  { id: 'cyber', label: 'Cyber', emoji: '🖤' },
  { id: 'receipt', label: 'Receipt', emoji: '📜' },
  { id: 'espresso', label: 'Espresso', emoji: '☕' },
  { id: 'sunset', label: 'Sunset', emoji: '🌇' },
  { id: 'sage', label: 'Sage', emoji: '🌿' },
  { id: 'velvet', label: 'Velvet', emoji: '🌌' },
  { id: 'paper', label: 'Paper', emoji: '📄' },
];

const VIBE_STICKERS = [
  '🔋 Battery: 4%',
  '🌙 2 AM Epiphany',
  '☕ Pure Caffeine',
  '🌀 Overthinking',
  '🌶️ Unfiltered Tea',
  '💀 Career Trauma',
  '🤫 Classified Secret',
  '🎧 Lo-Fi State',
];

export function PulseFeed({
  token,
  currentUser,
  onOpenChatWith,
}: {
  token: string;
  currentUser: User | null;
  onOpenChatWith?: (username: string) => void;
}) {
  const [channel, setChannel] = useState<'all' | 'confessions' | 'hot_takes' | 'real_talk' | 'midnight'>('all');
  const [sort, setSort] = useState<'foryou' | 'trending' | 'fresh' | 'debated'>('foryou');
  const [vibeFilter, setVibeFilter] = useState<string>('');
  const [spoilersOnly, setSpoilersOnly] = useState(false);
  const [selectedPromptFilter, setSelectedPromptFilter] = useState<string | null>(null);
  const [sessionSeed, setSessionSeed] = useState(() => Math.floor(Math.random() * 90000) + 1000);

  const [askBannerDismissed, setAskBannerDismissed] = useState(false);
  const [posts, setPosts] = useState<PulsePost[]>([]);
  const [prompts, setPrompts] = useState<PulsePrompt[]>([]);
  const [dailyPrompt, setDailyPrompt] = useState<DailyPrompt | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const reqGenRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Verified Participation & Genuine Streak Progression (No Fake Baselines)
  const userKey = currentUser?.username || 'guest';
  const [aura, setAura] = useState(() => {
    const val = localStorage.getItem(`adda-pulse-aura-${userKey}`);
    return val ? Math.max(0, parseInt(val, 10)) : 0;
  });
  const [streak, setStreak] = useState(() => {
    const val = localStorage.getItem(`adda-pulse-streak-${userKey}`);
    return val ? Math.max(0, parseInt(val, 10)) : 0;
  });
  const [auraPop, setAuraPop] = useState<string | null>(null);

  const recordVerifiedParticipation = (pts: number, reason: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const lastDateKey = `adda-pulse-date-${userKey}`;
    const lastDate = localStorage.getItem(lastDateKey) || '';

    setAura((prev) => {
      const next = prev + pts;
      localStorage.setItem(`adda-pulse-aura-${userKey}`, String(next));
      return next;
    });

    if (lastDate !== today) {
      setStreak((s) => {
        let nextStreak = 1;
        if (lastDate) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          nextStreak = lastDate === yesterday ? s + 1 : 1;
        }
        localStorage.setItem(`adda-pulse-streak-${userKey}`, String(nextStreak));
        return nextStreak;
      });
      localStorage.setItem(lastDateKey, today);
    }

    setAuraPop(`+${pts} Aura · ${reason}`);
    setTimeout(() => setAuraPop(null), 2500);
  };

  // Double-tap & Particles
  const [particles, setParticles] = useState<BurstParticle[]>([]);
  const [tappedPostId, setTappedPostId] = useState<string | null>(null);
  const lastTapRef = useRef<{ [id: string]: number }>({});
  const [revealedPostIds, setRevealedPostIds] = useState<Set<string>>(() => new Set());

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<PulsePost | null>(null);
  const [comments, setComments] = useState<PulseComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentAnonymous, setCommentAnonymous] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Moderation & Action Menu State
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [reportModalData, setReportModalData] = useState<{ targetType: 'post' | 'comment'; targetId: string } | null>(null);
  const [reportReason, setReportReason] = useState('Harassment or inappropriate behavior');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  // Composer Form
  const [formChannel, setFormChannel] = useState<'confessions' | 'hot_takes' | 'real_talk' | 'midnight'>('confessions');
  const [formTheme, setFormTheme] = useState<string>('aurora');
  const [formFont, setFormFont] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [formVibe, setFormVibe] = useState<string>('🌶️ Unfiltered Tea');
  const [formIsSpoiler, setFormIsSpoiler] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formAnonymous, setFormAnonymous] = useState(true);
  const [formPromptId, setFormPromptId] = useState<string | null>(null);
  const [formHasPoll, setFormHasPoll] = useState(false);
  const [formPollQ, setFormPollQ] = useState('');
  const [formPollA, setFormPollA] = useState('');
  const [formPollB, setFormPollB] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postError, setPostError] = useState('');

  // Inbox & Secret Asks
  const [inboxAsks, setInboxAsks] = useState<AnonymousAsk[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [replyingAskId, setReplyingAskId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyPublish, setReplyPublish] = useState(true);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Keyset Cursor Feed Loader (Zero Duplicates, No 120-item cap)
  const loadFeed = useCallback(async (reset = false) => {
    const thisGen = ++reqGenRef.current;
    setFeedError(null);

    if (reset) {
      setLoading(true);
      cursorRef.current = null;
    } else {
      setLoadingMore(true);
    }

    try {
      const queryParams = new URLSearchParams({
        channel,
        sort,
        limit: '15',
        seed: String(sessionSeed),
      });

      if (!reset && cursorRef.current) {
        queryParams.set('cursor', cursorRef.current);
      }
      if (selectedPromptFilter) {
        queryParams.set('promptId', selectedPromptFilter);
      }
      if (vibeFilter) queryParams.set('vibe', vibeFilter);
      if (spoilersOnly) queryParams.set('spoilers', '1');

      const res = await api<{
        posts: PulsePost[];
        prompts: PulsePrompt[];
        dailyPrompt: DailyPrompt | null;
        nextCursor: string | null;
        hasMore: boolean;
      }>(`/pulse/feed?${queryParams.toString()}`, token);

      if (thisGen !== reqGenRef.current) return;

      const newBatch = res.posts || [];
      if (reset) {
        setPosts(newBatch);
      } else {
        setPosts((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          const fresh = newBatch.filter((p) => !existing.has(p.id));
          return [...prev, ...fresh];
        });
      }

      cursorRef.current = res.nextCursor;
      setHasMore(Boolean(res.hasMore && res.nextCursor));
      if (res.dailyPrompt) setDailyPrompt(res.dailyPrompt);
      if (res.prompts) setPrompts(res.prompts);
    } catch (err) {
      if (thisGen === reqGenRef.current) {
        setFeedError(err instanceof Error ? err.message : 'Could not sync pulse feed. Tap retry.');
      }
    } finally {
      if (thisGen === reqGenRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [channel, sort, vibeFilter, spoilersOnly, selectedPromptFilter, sessionSeed, token]);

  useEffect(() => {
    void loadFeed(true);
  }, [channel, sort, vibeFilter, spoilersOnly, selectedPromptFilter]);

  // Infinite Scroll Trigger
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadFeed(false);
        }
      },
      { rootMargin: '450px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadFeed]);

  // Close card menus on outside click
  useEffect(() => {
    const closeMenu = () => setActiveMenuPostId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Handle Reactions
  const handleReact = async (postId: string, reactionType: string) => {
    if (!token) return;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const hasReacted = p.myReactions.includes(reactionType);
        const nextMy = hasReacted
          ? p.myReactions.filter((r) => r !== reactionType)
          : [...p.myReactions, reactionType];
        const currentCount = p.reactionCounts[reactionType] || 0;
        const nextCounts = {
          ...p.reactionCounts,
          [reactionType]: Math.max(0, currentCount + (hasReacted ? -1 : 1)),
        };
        return { ...p, myReactions: nextMy, reactionCounts: nextCounts, totalReactions: Math.max(0, p.totalReactions + (hasReacted ? -1 : 1)) };
      })
    );

    try {
      const res = await api<{ ok: boolean; reactionCounts: Record<string, number>; myReactions: string[] }>(
        '/pulse/react',
        token,
        {
          method: 'POST',
          body: JSON.stringify({ postId, reactionType }),
        }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, reactionCounts: res.reactionCounts, myReactions: res.myReactions }
            : p
        )
      );
    } catch {
      void loadFeed(true);
    }
  };

  // Double-tap Particle Burst
  const handleCardTap = (e: ReactPointerEvent<HTMLElement>, post: PulsePost) => {
    const now = Date.now();
    const last = lastTapRef.current[post.id] || 0;
    if (now - last < 320) {
      lastTapRef.current[post.id] = 0;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      setTappedPostId(post.id);
      setTimeout(() => setTappedPostId(null), 300);

      void handleReact(post.id, 'fire');

      const emojis = ['🔥', '💀', '🍿', '🧠', '💔', '✨', '⚡'];
      const newBatch: BurstParticle[] = Array.from({ length: 6 }, (_, i) => ({
        id: Date.now() + i,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        x: clickX,
        y: clickY,
        dx: (Math.random() - 0.5) * 80,
        dx2: (Math.random() - 0.5) * 140,
      }));

      setParticles((prev) => [...prev, ...newBatch]);
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => !newBatch.some((nb) => nb.id === p.id)));
      }, 900);
    } else {
      lastTapRef.current[post.id] = now;
    }
  };

  // Reveal Spoiler
  const revealSpoiler = (postId: string) => {
    setRevealedPostIds((prev) => new Set([...prev, postId]));
  };

  // Roll Random Spark
  const handleSparkRandom = () => {
    if (posts.length === 0) return;
    const randomIdx = Math.floor(Math.random() * posts.length);
    const post = posts[randomIdx];
    const el = document.getElementById(`pulse-card-${post.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTappedPostId(post.id);
      setTimeout(() => setTappedPostId(null), 500);
    }
  };

  // Mini-Poll Vote
  const handlePollVote = async (postId: string, choice: 'a' | 'b') => {
    if (!token) return;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId || !p.poll || p.poll.myVote) return p;
        return {
          ...p,
          poll: {
            ...p.poll,
            myVote: choice,
            votesA: choice === 'a' ? p.poll.votesA + 1 : p.poll.votesA,
            votesB: choice === 'b' ? p.poll.votesB + 1 : p.poll.votesB,
          },
        };
      })
    );

    try {
      const res = await api<{ ok: boolean; votesA: number; votesB: number; myVote: string }>(
        '/pulse/poll-vote',
        token,
        {
          method: 'POST',
          body: JSON.stringify({ postId, choice }),
        }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId && p.poll
            ? {
                ...p,
                poll: {
                  ...p.poll,
                  votesA: res.votesA,
                  votesB: res.votesB,
                  myVote: res.myVote,
                },
              }
            : p
        )
      );
    } catch {
      void loadFeed(true);
    }
  };

  // Comments Management
  const openComments = async (post: PulsePost) => {
    setActiveCommentPost(post);
    setLoadingComments(true);
    try {
      const res = await api<{ comments: PulseComment[] }>(`/pulse/comments/${post.id}`, token);
      setComments(res.comments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !activeCommentPost || !commentText.trim()) return;
    try {
      const res = await api<{ ok: boolean; comment: PulseComment }>(
        `/pulse/comments/${activeCommentPost.id}`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ body: commentText, isAnonymous: commentAnonymous }),
        }
      );
      setComments((prev) => [...prev, res.comment]);
      setCommentText('');
      recordVerifiedParticipation(10, 'Comment Shared 💬');
      setPosts((prev) =>
        prev.map((p) =>
          p.id === activeCommentPost.id ? { ...p, commentCount: p.commentCount + 1 } : p
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not add comment.');
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!token || !confirm('Delete this comment?')) return;
    try {
      await api(`/pulse/comments/${commentId}`, token, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      if (activeCommentPost) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === activeCommentPost.id ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p
          )
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete comment.');
    }
  };

  // Post Submission
  const submitPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !formBody.trim()) return;
    setSubmittingPost(true);
    setPostError('');
    try {
      await api('/pulse/posts', token, {
        method: 'POST',
        body: JSON.stringify({
          channel: formChannel,
          cardTheme: formTheme,
          gradientTheme: formTheme,
          fontStyle: formFont,
          vibeSticker: formVibe || undefined,
          isSpoiler: formIsSpoiler,
          title: formTitle.trim() || undefined,
          body: formBody.trim(),
          isAnonymous: formAnonymous,
          promptId: formPromptId || undefined,
          pollQuestion: formHasPoll ? formPollQ : undefined,
          pollOptionA: formHasPoll ? formPollA : undefined,
          pollOptionB: formHasPoll ? formPollB : undefined,
        }),
      });

      setShowCreateModal(false);
      setFormTitle('');
      setFormBody('');
      setFormPromptId(null);
      setFormHasPoll(false);

      if (formPromptId) {
        recordVerifiedParticipation(20, 'Daily Pulse Answered 🌅');
      } else {
        recordVerifiedParticipation(15, 'Thought Dropped 🚀');
      }

      void loadFeed(true);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  // Delete Post (Author or Admin)
  const handleDeletePost = async (postId: string) => {
    if (!token || !confirm('Are you sure you want to delete this thought from Pulse?')) return;
    try {
      await api(`/pulse/posts/${postId}`, token, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setActiveMenuPostId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete post.');
    }
  };

  // Block Author
  const handleBlockUser = async (targetUserId?: string | null) => {
    if (!token || !targetUserId) return;
    if (!confirm('Block this student? You will no longer see their posts or comments.')) return;
    try {
      await api('/pulse/block', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      alert('User blocked.');
      setActiveMenuPostId(null);
      void loadFeed(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not block user.');
    }
  };

  // Report Content
  const submitReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !reportModalData) return;
    setSubmittingReport(true);
    try {
      const res = await api<{ ok: boolean; message: string }>('/pulse/report', token, {
        method: 'POST',
        body: JSON.stringify({
          targetType: reportModalData.targetType,
          targetId: reportModalData.targetId,
          reason: reportReason,
        }),
      });
      setReportNotice(res.message);
      setTimeout(() => {
        setReportNotice(null);
        setReportModalData(null);
      }, 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Answer Daily or Interleaved Prompt
  const handleAnswerPrompt = (promptId: string, promptText: string, suggestedChannel?: string) => {
    setFormPromptId(promptId);
    if (suggestedChannel && ['confessions', 'hot_takes', 'real_talk', 'midnight'].includes(suggestedChannel)) {
      setFormChannel(suggestedChannel as any);
    }
    setFormBody(`"${promptText}"\n\n`);
    setShowCreateModal(true);
  };

  // Inbox Modal & Replies
  const openInbox = async () => {
    setShowInboxModal(true);
    if (!token) return;
    setLoadingInbox(true);
    try {
      const res = await api<{ asks: AnonymousAsk[] }>('/ask/inbox', token);
      setInboxAsks(res.asks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInbox(false);
    }
  };

  const handleReplySubmit = async (askId: string) => {
    if (!token || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      await api(`/ask/${askId}/reply`, token, {
        method: 'POST',
        body: JSON.stringify({ reply: replyText, publishToFeed: replyPublish }),
      });
      setInboxAsks((prev) =>
        prev.map((a) => (a.id === askId ? { ...a, reply: replyText, is_published_to_feed: replyPublish ? 1 : 0 } : a))
      );
      setReplyingAskId(null);
      setReplyText('');
      recordVerifiedParticipation(15, 'Secret Answered 💌');
      if (replyPublish) void loadFeed(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not send reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  const copyAskLink = () => {
    if (!currentUser) return;
    const url = `${location.origin}/#ask/${currentUser.username}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2400);
    });
  };

  return (
    <div className="pulse-page">
      {/* Floating Aura Notification */}
      {auraPop && (
        <div className="pulse-floating-toast">
          <Zap size={14} color="#f59e0b" />
          <span>{auraPop}</span>
        </div>
      )}

      {/* Header with Verified Community Metrics */}
      <header className="pulse-header">
        <div className="pulse-header-title">
          <h1>
            Pulse<i>.</i>
          </h1>
          <div className="pulse-metrics-pill" title="Community Activity & Verified Participation">
            <span>🔥 {streak} Streak</span>
            <span>·</span>
            <span style={{ color: 'var(--orange)' }}>⚡ {aura} Aura</span>
          </div>
        </div>

        <div className="pulse-header-actions">
          <button
            className="pulse-btn pulse-btn-spark"
            onClick={handleSparkRandom}
            title="Focus on a random thought"
          >
            <Dice5 size={14} /> <span>Spark</span>
          </button>
          {currentUser && (
            <button className="pulse-btn pulse-btn-secondary" onClick={openInbox} title="Your Anonymous Inbox">
              <Inbox size={14} /> <span>Inbox</span>
            </button>
          )}
          <button className="pulse-btn pulse-btn-primary" onClick={() => { setFormPromptId(null); setShowCreateModal(true); }}>
            <Plus size={15} /> <span>Drop</span>
          </button>
        </div>
      </header>

      {/* Daily Pulse Spotlight Hero Banner (Product Differentiation) */}
      {dailyPrompt && (
        <section className="pulse-daily-hero">
          <div className="pulse-daily-head">
            <div className="pulse-daily-badge">
              <Calendar size={13} />
              <span>DAILY PULSE · {dailyPrompt.date}</span>
            </div>
            <div className="pulse-daily-count">
              <span>{dailyPrompt.responseCount} student takes</span>
            </div>
          </div>

          <h2 className="pulse-daily-question">
            "{dailyPrompt.promptText}"
          </h2>

          <div className="pulse-daily-foot">
            <div className="pulse-daily-actions">
              <button
                className="pulse-btn pulse-btn-primary"
                onClick={() => handleAnswerPrompt(dailyPrompt.id, dailyPrompt.promptText, dailyPrompt.channel)}
              >
                <Sparkles size={14} />
                <span>{dailyPrompt.hasAnsweredToday ? 'Add Another Take' : 'Share Your Voice'}</span>
              </button>

              <button
                className={`pulse-btn ${selectedPromptFilter === dailyPrompt.id ? 'pulse-btn-spark' : 'pulse-btn-secondary'}`}
                onClick={() => setSelectedPromptFilter(selectedPromptFilter === dailyPrompt.id ? null : dailyPrompt.id)}
              >
                <Filter size={13} />
                <span>{selectedPromptFilter === dailyPrompt.id ? 'Show All Posts' : 'View Today’s Answers'}</span>
              </button>
            </div>

            {dailyPrompt.hasAnsweredToday && (
              <span className="pulse-daily-done">
                <Check size={13} /> You participated today
              </span>
            )}
          </div>
        </section>
      )}

      {/* Secret Link Banner for Current User */}
      {currentUser && !askBannerDismissed && (
        <div className="pulse-ask-banner">
          <div className="pulse-ask-banner-info">
            <div className="pulse-ask-banner-icon">
              <Sparkles size={14} />
            </div>
            <div className="pulse-ask-banner-text">
              <strong>Your Anonymous Secret Link is Live</strong>
              <span>Share on Instagram or WhatsApp: classmates send honest notes safely to your inbox.</span>
            </div>
          </div>
          <div className="pulse-ask-banner-actions">
            <button className="pulse-btn" onClick={copyAskLink}>
              {copiedLink ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              className="pulse-banner-dismiss"
              onClick={() => setAskBannerDismissed(true)}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Unified Channels & Sort Filters Strip */}
      <div className="pulse-filters-bar">
        <div className="pulse-channels-scroll">
          <button
            className={`pulse-channel-chip ${channel === 'all' && !spoilersOnly && !vibeFilter ? 'active' : ''}`}
            onClick={() => { setChannel('all'); setSpoilersOnly(false); setVibeFilter(''); }}
          >
            🌐 All
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'confessions' ? 'active' : ''}`}
            onClick={() => { setChannel('confessions'); setSpoilersOnly(false); setVibeFilter(''); }}
          >
            🌶️ Confessions
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'hot_takes' ? 'active' : ''}`}
            onClick={() => { setChannel('hot_takes'); setSpoilersOnly(false); setVibeFilter(''); }}
          >
            💡 Hot Takes
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'real_talk' ? 'active' : ''}`}
            onClick={() => { setChannel('real_talk'); setSpoilersOnly(false); setVibeFilter(''); }}
          >
            💼 Real Talk
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'midnight' ? 'active' : ''}`}
            onClick={() => { setChannel('midnight'); setSpoilersOnly(false); setVibeFilter(''); }}
          >
            🌙 Midnight
          </button>
          <button
            className={`pulse-channel-chip ${spoilersOnly ? 'active' : ''}`}
            onClick={() => { setSpoilersOnly(!spoilersOnly); setVibeFilter(''); }}
            style={{ borderColor: 'var(--orange)' }}
          >
            🤫 Spoilers
          </button>
        </div>

        <div className="pulse-strip-divider" />

        <div className="pulse-sort-group">
          <button
            className={`pulse-sort-btn ${sort === 'foryou' ? 'active' : ''}`}
            onClick={() => setSort('foryou')}
            title="Algorithmically recommended for you"
          >
            ✨ For You
          </button>
          <button
            className={`pulse-sort-btn ${sort === 'trending' ? 'active' : ''}`}
            onClick={() => setSort('trending')}
            title="Ranked by active engagement"
          >
            🔥 Top
          </button>
          <button
            className={`pulse-sort-btn ${sort === 'fresh' ? 'active' : ''}`}
            onClick={() => setSort('fresh')}
            title="Most recent discussions"
          >
            ⏱️ Fresh
          </button>
          <button
            className={`pulse-sort-btn ${sort === 'debated' ? 'active' : ''}`}
            onClick={() => setSort('debated')}
            title="Active comment threads"
          >
            💬 Debated
          </button>
        </div>
      </div>

      {/* Network Error Recovery Banner */}
      {feedError && (
        <div className="pulse-error-banner">
          <AlertCircle size={15} />
          <span>{feedError}</span>
          <button className="pulse-btn" onClick={() => void loadFeed(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Active Filter Pill */}
      {selectedPromptFilter && dailyPrompt && (
        <div className="pulse-active-filter-indicator">
          <span>Showing responses for: <b>"{dailyPrompt.promptText.slice(0, 48)}..."</b></span>
          <button onClick={() => setSelectedPromptFilter(null)}>
            <X size={12} /> Clear Filter
          </button>
        </div>
      )}

      {/* Stream of Posts */}
      {loading ? (
        <div className="pulse-loading-state">
          <LoaderCircle className="spin" size={24} />
          <div style={{ marginTop: 10, fontSize: 12 }}>Tuning into the pulse...</div>
        </div>
      ) : posts.length === 0 ? (
        <div className="pulse-empty-state">
          <p>No student conversations found here yet. Be the first to spark one!</p>
          <button className="pulse-btn pulse-btn-primary" onClick={() => { setFormPromptId(null); setShowCreateModal(true); }}>
            Drop the first thought
          </button>
        </div>
      ) : (
        <div className="pulse-stream">
          {posts.map((post, idx) => {
            const promptItem = prompts[idx % prompts.length];
            const showPromptHere = idx > 0 && idx % 5 === 0 && promptItem && !selectedPromptFilter;

            const totalVotes = post.poll ? post.poll.votesA + post.poll.votesB : 0;
            const pctA = totalVotes > 0 && post.poll ? Math.round((post.poll.votesA / totalVotes) * 100) : 50;
            const pctB = totalVotes > 0 && post.poll ? 100 - pctA : 50;

            const themeClass = post.gradientTheme || post.cardTheme || 'aurora';
            const fontClass = `font-style-${post.fontStyle || 'sans'}`;
            const isSpoilerCovered = Boolean(post.isSpoiler) && !revealedPostIds.has(post.id);
            const isTapped = tappedPostId === post.id;
            const isMenuOpen = activeMenuPostId === post.id;

            return (
              <div key={post.id} id={`pulse-card-${post.id}`}>
                {/* Interleaved Community Prompt Card */}
                {showPromptHere && (
                  <div
                    className="pulse-prompt-card"
                    onClick={() => handleAnswerPrompt(promptItem.id, promptItem.prompt_text, promptItem.channel)}
                  >
                    <div className="pulse-prompt-kicker">
                      <Zap size={13} /> COMMUNITY SPARK · TAP TO ANSWER
                    </div>
                    <div className="pulse-prompt-text">{promptItem.prompt_text}</div>
                    <div className="pulse-prompt-action">
                      Complete this prompt <ArrowRight size={13} />
                    </div>
                  </div>
                )}

                {/* Main Thought Card */}
                <article
                  className={`pulse-card pulse-theme-${themeClass} ${isTapped ? 'is-tapped' : ''}`}
                  onPointerDown={(e) => handleCardTap(e, post)}
                  style={{ position: 'relative' }}
                >
                  {/* Floating Double-Tap Particles */}
                  {particles.map((p) => (
                    <span
                      key={p.id}
                      className="pulse-burst-particle"
                      style={{
                        left: p.x,
                        top: p.y,
                        ['--dx' as any]: `${p.dx}px`,
                        ['--dx2' as any]: `${p.dx2}px`,
                      }}
                    >
                      {p.emoji}
                    </span>
                  ))}

                  <div className="pulse-card-header">
                    <div className="pulse-card-meta">
                      <span className="pulse-channel-tag">{post.channel.replace('_', ' ')}</span>

                      {/* Genuine Student Voice vs Curated Content Badge */}
                      {post.source === 'prompt_response' ? (
                        <span className="pulse-source-badge prompt">💬 Prompt Reply</span>
                      ) : post.source === 'anonymous_ask' ? (
                        <span className="pulse-source-badge ask">💌 Secret Note</span>
                      ) : post.source === 'syndicated' || post.source === 'persona' ? (
                        <span className="pulse-source-badge curated">📌 Curated Topic</span>
                      ) : (
                        <span className="pulse-source-badge student">🎓 Student Voice</span>
                      )}

                      {post.vibeSticker && (
                        <span className="pulse-vibe-pill">{post.vibeSticker}</span>
                      )}

                      <div className="pulse-card-author">
                        <div className={`pulse-author-avatar ${post.isAnonymous ? 'anon' : ''}`}>
                          {post.isAnonymous ? '?' : post.authorHandle.slice(0, 1).toUpperCase()}
                        </div>
                        <strong>{post.authorHandle}</strong>
                      </div>
                    </div>

                    <div className="pulse-card-header-right">
                      <time className="pulse-card-time">{timeAgo(post.createdAt)}</time>

                      {/* Card Action / Moderation Menu */}
                      <div className="pulse-card-menu-container" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="pulse-menu-trigger"
                          onClick={() => setActiveMenuPostId(isMenuOpen ? null : post.id)}
                          title="Options"
                        >
                          <MoreHorizontal size={15} />
                        </button>

                        {isMenuOpen && (
                          <div className="pulse-menu-dropdown">
                            {post.isOwner || currentUser?.isAdmin ? (
                              <button
                                className="pulse-menu-item danger"
                                onClick={() => handleDeletePost(post.id)}
                              >
                                <Trash2 size={13} />
                                <span>Delete Thought</span>
                              </button>
                            ) : null}

                            {!post.isAnonymous && post.userId && currentUser && !post.isOwner && (
                              <button
                                className="pulse-menu-item"
                                onClick={() => handleBlockUser(post.userId)}
                              >
                                <UserX size={13} />
                                <span>Block Author</span>
                              </button>
                            )}

                            {!post.isOwner && (
                              <button
                                className="pulse-menu-item"
                                onClick={() => {
                                  setReportModalData({ targetType: 'post', targetId: post.id });
                                  setActiveMenuPostId(null);
                                }}
                              >
                                <Flag size={13} />
                                <span>Report Content</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Body with Tap-to-Reveal Spoiler Wrapper */}
                  <div className="pulse-card-spoiler-wrap">
                    {isSpoilerCovered && (
                      <div
                        className="pulse-spoiler-overlay"
                        onClick={(e) => {
                          e.stopPropagation();
                          revealSpoiler(post.id);
                        }}
                      >
                        <div className="pulse-spoiler-prompt">
                          <Eye size={13} /> Tap to reveal secret 🤫
                        </div>
                        <div className="pulse-spoiler-hint">Frosted for suspense · Click to uncover</div>
                      </div>
                    )}

                    {post.title && <h2 className="pulse-card-title">{post.title}</h2>}
                    <div className={`pulse-card-body ${fontClass}`}>{post.body}</div>
                  </div>

                  {/* Interactive Mini-Poll */}
                  {post.poll && (
                    <div className="pulse-poll-box">
                      <div className="pulse-poll-title">
                        <HelpCircle size={14} /> {post.poll.question}
                      </div>
                      <div className="pulse-poll-options">
                        <button
                          className={`pulse-poll-btn ${post.poll.myVote === 'a' ? 'voted-mine' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handlePollVote(post.id, 'a'); }}
                        >
                          {post.poll.myVote && <div className="pulse-poll-fill" style={{ width: `${pctA}%` }} />}
                          <span className="pulse-poll-btn-label">{post.poll.optionA}</span>
                          {post.poll.myVote && <span className="pulse-poll-btn-pct">{pctA}%</span>}
                        </button>

                        <button
                          className={`pulse-poll-btn ${post.poll.myVote === 'b' ? 'voted-mine' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handlePollVote(post.id, 'b'); }}
                        >
                          {post.poll.myVote && <div className="pulse-poll-fill" style={{ width: `${pctB}%` }} />}
                          <span className="pulse-poll-btn-label">{post.poll.optionB}</span>
                          {post.poll.myVote && <span className="pulse-poll-btn-pct">{pctB}%</span>}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Card Footer: 5 Reactions & Actions */}
                  <div className="pulse-card-footer">
                    <div className="pulse-reactions-bar">
                      {REACTION_EMOJIS.map((r) => {
                        const count = post.reactionCounts[r.type] || 0;
                        const isMine = post.myReactions.includes(r.type);
                        return (
                          <button
                            key={r.type}
                            className={`pulse-react-pill ${isMine ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReact(post.id, r.type);
                            }}
                            title={r.label}
                          >
                            <span>{r.emoji}</span>
                            {count > 0 && <span className="pulse-react-count">{count}</span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pulse-card-actions">
                      <button
                        className="pulse-action-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          openComments(post);
                        }}
                      >
                        <MessageSquare size={14} />
                        <span>{post.commentCount > 0 ? post.commentCount : 'Comment'}</span>
                      </button>

                      {/* Bridge to 1-on-1 chats if public author */}
                      {!post.isAnonymous && currentUser && post.authorHandle !== currentUser.username && (
                        <button
                          className="pulse-action-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenChatWith?.(post.authorHandle);
                          }}
                          title={`Say hi to @${post.authorHandle}`}
                        >
                          <Send size={13} />
                          <span>Say Hi</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </div>
            );
          })}

          {/* Pagination Sentinel */}
          <div ref={sentinelRef} style={{ minHeight: 60, display: 'grid', placeItems: 'center', margin: '20px 0 40px' }}>
            {loadingMore ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 12 }}>
                <LoaderCircle className="spin" size={16} />
                <span>Streaming next discussions...</span>
              </div>
            ) : hasMore ? (
              <button className="pulse-btn" onClick={() => void loadFeed(false)}>
                Load more thoughts <ArrowRight size={14} />
              </button>
            ) : posts.length > 0 ? (
              <div className="pulse-caught-up-card">
                <div className="pulse-caught-up-badge">
                  <Sparkles size={15} /> All Caught Up! 🎉
                </div>
                <h3>You've explored all {posts.length} discussions in this stream!</h3>
                <p>Zero duplicate cards. New community confessions, polls, and hot takes stream in as students post them.</p>
                <div className="pulse-caught-up-actions">
                  <button className="pulse-btn pulse-btn-primary" onClick={() => { setFormPromptId(null); setShowCreateModal(true); }}>
                    <Plus size={14} /> Drop a Thought
                  </button>
                  <button
                    className="pulse-btn"
                    onClick={() => {
                      setSessionSeed(Math.floor(Math.random() * 90000) + 1000);
                      void loadFeed(true);
                    }}
                  >
                    <Dice5 size={14} /> Shuffle Stream
                  </button>
                  {channel !== 'all' && (
                    <button
                      className="pulse-btn"
                      onClick={() => {
                        setChannel('all');
                        setSpoilersOnly(false);
                        setVibeFilter('');
                      }}
                    >
                      🌐 All Channels
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Comments Drawer / Modal */}
      {activeCommentPost && (
        <div className="pulse-modal-backdrop" onClick={() => setActiveCommentPost(null)}>
          <div className="pulse-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-head">
              <h3>Comments ({comments.length})</h3>
              <button className="pulse-modal-close" onClick={() => setActiveCommentPost(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="pulse-modal-content">
              {loadingComments ? (
                <div style={{ textAlign: 'center', padding: 30 }}>
                  <LoaderCircle className="spin" />
                </div>
              ) : comments.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', margin: '20px 0' }}>
                  No comments yet. Share your thoughts or advice!
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="pulse-comment-row">
                    <div className={`pulse-author-avatar ${c.isAnonymous ? 'anon' : ''}`}>
                      {c.isAnonymous ? '?' : c.authorHandle.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="pulse-comment-body">
                      <div className="pulse-comment-meta">
                        <strong>{c.authorHandle}</strong>
                        <time>{timeAgo(c.createdAt)}</time>
                        {c.isOwner || currentUser?.isAdmin ? (
                          <button
                            className="pulse-comment-delete-btn"
                            onClick={() => deleteComment(c.id)}
                            title="Delete comment"
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : (
                          <button
                            className="pulse-comment-report-btn"
                            onClick={() => setReportModalData({ targetType: 'comment', targetId: c.id })}
                            title="Report comment"
                          >
                            <Flag size={12} />
                          </button>
                        )}
                      </div>
                      <p>{c.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={submitComment} className="pulse-comment-composer">
              <div className="pulse-comment-composer-top">
                <label className="pulse-identity-toggle">
                  <input
                    type="checkbox"
                    checked={commentAnonymous}
                    onChange={(e) => setCommentAnonymous(e.target.checked)}
                  />
                  <span>Comment Anonymously 🎭</span>
                </label>
              </div>
              <div className="pulse-comment-composer-input">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={commentAnonymous ? 'Speak freely (Anonymous)...' : 'Write a comment...'}
                  maxLength={1000}
                />
                <button type="submit" className="pulse-btn pulse-btn-primary" disabled={!commentText.trim()}>
                  <Send size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reporting Modal */}
      {reportModalData && (
        <div className="pulse-modal-backdrop" onClick={() => setReportModalData(null)}>
          <div className="pulse-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-head">
              <h3>Report {reportModalData.targetType === 'post' ? 'Post' : 'Comment'}</h3>
              <button className="pulse-modal-close" onClick={() => setReportModalData(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitReport} style={{ padding: 16 }}>
              {reportNotice ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--green, #22c55e)' }}>
                  <Check size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                  <strong>{reportNotice}</strong>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                    Help us keep Adda supportive and safe for students. Why are you reporting this?
                  </p>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                    {[
                      'Harassment or personal attack',
                      'Inappropriate or explicit content',
                      'Spam, advertising, or self-promotion',
                      'Misinformation or harmful advice',
                      'Hate speech or discrimination'
                    ].map((reason) => (
                      <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="report_reason"
                          checked={reportReason === reason}
                          onChange={() => setReportReason(reason)}
                        />
                        <span>{reason}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="pulse-btn"
                      onClick={() => setReportModalData(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="pulse-btn pulse-btn-primary"
                      disabled={submittingReport}
                    >
                      {submittingReport ? <LoaderCircle className="spin" size={13} /> : 'Submit Report'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Create Thought Modal / Customization Studio */}
      {showCreateModal && (
        <div className="pulse-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="pulse-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-head">
              <h3>{formPromptId ? 'Answer Community Prompt' : 'Drop a Thought on Pulse'}</h3>
              <button className="pulse-modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitPost} className="pulse-create-form">
              {postError && <div className="form-error">{postError}</div>}

              <div className="pulse-field-group">
                <label>TOPIC CHANNEL</label>
                <select
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as any)}
                >
                  <option value="confessions">🌶️ Spicy Confessions & Tea</option>
                  <option value="hot_takes">💡 Unpopular Opinions & Hot Takes</option>
                  <option value="real_talk">💼 Career, Salary & Adulting Real Talk</option>
                  <option value="midnight">🌙 Midnight Whispers & Vulnerability</option>
                </select>
              </div>

              {/* Theme Picker */}
              <div className="pulse-field-group">
                <label>CARD AESTHETIC THEME</label>
                <div className="pulse-theme-picker" style={{ flexWrap: 'wrap' }}>
                  {THEME_OPTIONS.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className={`pulse-theme-choice pulse-theme-${t.id} ${formTheme === t.id ? 'selected' : ''}`}
                      onClick={() => setFormTheme(t.id)}
                      style={{ minWidth: 70 }}
                    >
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Typography Style */}
              <div className="pulse-field-group">
                <label>TYPOGRAPHY STYLE</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['sans', 'serif', 'mono'] as const).map((font) => (
                    <button
                      type="button"
                      key={font}
                      className={`pulse-btn ${formFont === font ? 'pulse-btn-primary' : 'pulse-btn-secondary'}`}
                      style={{ flex: 1, textTransform: 'capitalize', fontSize: 11 }}
                      onClick={() => setFormFont(font)}
                    >
                      {font === 'sans' ? 'Modern Sans' : font === 'serif' ? 'Editorial Serif' : 'Typewriter Mono'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vibe Sticker */}
              <div className="pulse-field-group">
                <label>VIBE STICKER</label>
                <select value={formVibe} onChange={(e) => setFormVibe(e.target.value)}>
                  <option value="">No Sticker</option>
                  {VIBE_STICKERS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Spoiler Toggle */}
              <div className="pulse-field-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formIsSpoiler}
                    onChange={(e) => setFormIsSpoiler(e.target.checked)}
                  />
                  <span>Frosted Tap-to-Reveal Spoiler 🤫 (Card will be blurred until clicked)</span>
                </label>
              </div>

              <div className="pulse-field-group">
                <label>OPTIONAL HEADLINE</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Unpopular take, A secret from campus, etc."
                  maxLength={100}
                />
              </div>

              <div className="pulse-field-group">
                <label>YOUR THOUGHT / TAKE</label>
                <textarea
                  required
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Speak your mind. Keep it real, spicy, or curious..."
                  maxLength={4000}
                />
              </div>

              {/* Live Preview Card */}
              {formBody.trim() && (
                <div style={{ borderTop: '1px dashed #dcd7c8', paddingTop: 12 }}>
                  <label style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#888', marginBottom: 6, display: 'block' }}>
                    LIVE PREVIEW
                  </label>
                  <div className={`pulse-card pulse-theme-${formTheme}`} style={{ margin: 0 }}>
                    <div className="pulse-card-header">
                      <div className="pulse-card-meta">
                        <span className="pulse-channel-tag">{formChannel}</span>
                        {formVibe && <span className="pulse-vibe-pill">{formVibe}</span>}
                        <div className="pulse-card-author">
                          <strong>{formAnonymous ? 'Anonymous 🎭' : currentUser?.username || 'You'}</strong>
                        </div>
                      </div>
                    </div>
                    {formTitle && <h2 className="pulse-card-title">{formTitle}</h2>}
                    <div className={`pulse-card-body font-style-${formFont}`}>{formBody}</div>
                  </div>
                </div>
              )}

              <div className="pulse-field-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formHasPoll}
                    onChange={(e) => setFormHasPoll(e.target.checked)}
                  />
                  <span>Attach an interactive mini-poll</span>
                </label>
                {formHasPoll && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    <input
                      required
                      placeholder="Poll question (e.g. Should attendance criteria be abolished?)"
                      value={formPollQ}
                      onChange={(e) => setFormPollQ(e.target.value)}
                      maxLength={150}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        required
                        placeholder="Option A (e.g. Yes, absolutely)"
                        value={formPollA}
                        onChange={(e) => setFormPollA(e.target.value)}
                        maxLength={50}
                      />
                      <input
                        required
                        placeholder="Option B (e.g. No, keep it)"
                        value={formPollB}
                        onChange={(e) => setFormPollB(e.target.value)}
                        maxLength={50}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pulse-field-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formAnonymous}
                    onChange={(e) => setFormAnonymous(e.target.checked)}
                  />
                  <span>Post 100% Anonymously 🎭 (Identity strictly protected)</span>
                </label>
              </div>

              <button
                type="submit"
                className="pulse-btn pulse-btn-primary"
                style={{ width: '100%', height: 42, justifyContent: 'center' }}
                disabled={submittingPost}
              >
                {submittingPost ? <LoaderCircle className="spin" size={16} /> : <>Publish to Pulse <ArrowUpRight size={16} /></>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Secret Inbox Drawer / Modal */}
      {showInboxModal && (
        <div className="pulse-modal-backdrop" onClick={() => setShowInboxModal(false)}>
          <div className="pulse-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-head">
              <h3>💌 Secret Notes Inbox</h3>
              <button className="pulse-modal-close" onClick={() => setShowInboxModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="pulse-modal-content">
              {currentUser && (
                <div style={{ background: '#f0ece1', padding: 12, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: '#666' }}>Your Ask Link: <b>adda.pages.dev/#ask/{currentUser.username}</b></span>
                  <button className="pulse-btn" onClick={copyAskLink}>
                    {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                    {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}

              {loadingInbox ? (
                <div style={{ textAlign: 'center', padding: 30 }}>
                  <LoaderCircle className="spin" />
                </div>
              ) : inboxAsks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#888' }}>
                  <p>No secret questions yet!</p>
                  <p style={{ fontSize: 11 }}>Copy your link above and share it with friends.</p>
                </div>
              ) : (
                <div className="pulse-inbox-list">
                  {inboxAsks.map((ask) => (
                    <div key={ask.id} className="pulse-inbox-item">
                      <div className="pulse-inbox-item-head">
                        <span>ANONYMOUS ASK</span>
                        <time>{timeAgo(ask.created_at)}</time>
                      </div>
                      <div className="pulse-inbox-q">"{ask.question}"</div>

                      {ask.reply ? (
                        <div className="pulse-inbox-reply-box">
                          <strong>Your Public Reply:</strong>
                          <p style={{ margin: '4px 0 0' }}>{ask.reply}</p>
                        </div>
                      ) : replyingAskId === ask.id ? (
                        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your candid answer..."
                            style={{ minHeight: 70, padding: 8, borderRadius: 4, border: '1px solid #d8d3c4', fontSize: 12 }}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={replyPublish}
                              onChange={(e) => setReplyPublish(e.target.checked)}
                            />
                            <span>Publish this Q&A to the public Pulse Feed</span>
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="pulse-btn pulse-btn-primary"
                              onClick={() => handleReplySubmit(ask.id)}
                              disabled={submittingReply || !replyText.trim()}
                            >
                              {submittingReply ? <LoaderCircle className="spin" size={13} /> : 'Send Answer'}
                            </button>
                            <button
                              className="pulse-btn"
                              onClick={() => { setReplyingAskId(null); setReplyText(''); }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="pulse-btn pulse-btn-secondary"
                          style={{ alignSelf: 'flex-start', marginTop: 4 }}
                          onClick={() => { setReplyingAskId(ask.id); setReplyText(''); }}
                        >
                          Answer this note
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PublicAskScreen({
  targetUsername,
  onBackToApp,
}: {
  targetUsername: string;
  onBackToApp: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submitAsk = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setSending(true);
    setError('');
    try {
      await api(`/ask/${targetUsername}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ question: question.trim() }),
      });
      setSent(true);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send secret question.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="public-ask-screen">
      <div className="public-ask-card">
        <div className="public-ask-kicker">
          <span>💌</span> ADDA ANONYMOUS ASK
        </div>
        <h1>
          Send a secret note to <i>@{targetUsername}</i>
        </h1>
        <p>
          Ask anything or tell them what you’ve always wanted to say. 100% anonymous, no account required.
        </p>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '24px 0', display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 32 }}>✨</div>
            <strong style={{ fontSize: 16, color: '#2b302c' }}>Your secret note was sent!</strong>
            <p style={{ fontSize: 12, color: '#777' }}>@{targetUsername} will receive it anonymously in their Adda inbox.</p>
            <button className="pulse-btn pulse-btn-primary" onClick={() => setSent(false)} style={{ margin: '8px auto 0' }}>
              Send another note
            </button>
          </div>
        ) : (
          <form onSubmit={submitAsk} style={{ display: 'grid', gap: 12 }}>
            {error && <div className="form-error">{error}</div>}
            <textarea
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Write your honest secret or question for @${targetUsername}...`}
              maxLength={1000}
            />
            <button
              type="submit"
              className="pulse-btn pulse-btn-primary"
              style={{ height: 44, justifyContent: 'center', fontSize: 13 }}
              disabled={sending || !question.trim()}
            >
              {sending ? <LoaderCircle className="spin" size={16} /> : <>Send Anonymously 🚀</>}
            </button>
          </form>
        )}

        <div className="public-ask-foot">
          <span>100% Anonymous & Identity-Protected</span>
          <button
            onClick={onBackToApp}
            style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            Open Adda App →
          </button>
        </div>
      </div>
    </main>
  );
}
