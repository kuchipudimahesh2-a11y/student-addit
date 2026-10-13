import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
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
  X
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
  const [sort, setSort] = useState<'foryou' | 'fresh' | 'trending' | 'debated'>('foryou');
  const [selectedPromptFilter, setSelectedPromptFilter] = useState<string | null>(null);
  const [dismissedDailyPrompt, setDismissedDailyPrompt] = useState(false);

  const [posts, setPosts] = useState<PulsePost[]>([]);
  const [dailyPrompt, setDailyPrompt] = useState<DailyPrompt | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const reqGenRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Spoilers revealed
  const [revealedPostIds, setRevealedPostIds] = useState<Set<string>>(() => new Set());

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<PulsePost | null>(null);
  const [comments, setComments] = useState<PulseComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentAnonymous, setCommentAnonymous] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Moderation
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [reportModalData, setReportModalData] = useState<{ targetType: 'post' | 'comment'; targetId: string } | null>(null);
  const [reportReason, setReportReason] = useState('Harassment or inappropriate behavior');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  // Composer Form
  const [formChannel, setFormChannel] = useState<'confessions' | 'hot_takes' | 'real_talk' | 'midnight'>('confessions');
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

  // Keyset Cursor Feed Loader
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
      });

      if (!reset && cursorRef.current) {
        queryParams.set('cursor', cursorRef.current);
      }
      if (selectedPromptFilter) {
        queryParams.set('promptId', selectedPromptFilter);
      }

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
    } catch (err) {
      if (thisGen === reqGenRef.current) {
        setFeedError(err instanceof Error ? err.message : 'Could not load discussions. Please try again.');
      }
    } finally {
      if (thisGen === reqGenRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [channel, sort, selectedPromptFilter, token]);

  useEffect(() => {
    void loadFeed(true);
  }, [channel, sort, selectedPromptFilter]);

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

  // Close menus on outside click
  useEffect(() => {
    const closeMenu = () => setActiveMenuPostId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Reactions
  const handleReact = async (postId: string, reactionType = 'fire') => {
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
        return {
          ...p,
          myReactions: nextMy,
          reactionCounts: nextCounts,
          totalReactions: Math.max(0, p.totalReactions + (hasReacted ? -1 : 1)),
        };
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

  // Poll Vote
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

  // Comments
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
          cardTheme: 'paper',
          gradientTheme: 'paper',
          fontStyle: 'sans',
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
      void loadFeed(true);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  // Delete Post
  const handleDeletePost = async (postId: string) => {
    if (!token || !confirm('Delete this discussion?')) return;
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
    if (!confirm('Block this author? You will no longer see their posts.')) return;
    try {
      await api('/pulse/block', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      alert('Author blocked.');
      setActiveMenuPostId(null);
      void loadFeed(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not block author.');
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
      }, 1800);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Answer Daily Prompt
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
    <div className="pulse-clean-wrap">
      {/* 1. Minimal Clean Header (Matching Adda Chats Header) */}
      <header className="pulse-clean-head">
        <div className="pulse-head-titles">
          <span className="pulse-eyebrow">YOUR COMMUNITY · PULSE</span>
          <h1 className="pulse-title">Pulse<i>.</i></h1>
        </div>

        <div className="pulse-head-actions">
          {currentUser && (
            <button
              className="pulse-icon-button"
              onClick={openInbox}
              title="Anonymous notes inbox"
            >
              <Inbox size={18} />
            </button>
          )}

          <button
            className="pulse-fab"
            onClick={() => { setFormPromptId(null); setShowCreateModal(true); }}
            title="Start a discussion"
          >
            <Plus size={22} />
          </button>
        </div>
      </header>

      {/* 2. Single Segmented Control Navigation (Matching Chats Tabs) */}
      <div className="pulse-nav-strip">
        <div className="pulse-segmented-tabs">
          {(['all', 'confessions', 'hot_takes', 'real_talk', 'midnight'] as const).map((ch) => (
            <button
              key={ch}
              className={`pulse-segmented-tab ${channel === ch ? 'active' : ''}`}
              onClick={() => { setChannel(ch); setSelectedPromptFilter(null); }}
            >
              {ch === 'all'
                ? 'All'
                : ch === 'confessions'
                ? 'Confessions'
                : ch === 'hot_takes'
                ? 'Hot Takes'
                : ch === 'real_talk'
                ? 'Real Talk'
                : 'Midnight'}
            </button>
          ))}
        </div>

        <div className="pulse-sort-dropdown-wrap">
          <select
            className="pulse-sort-dropdown"
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            aria-label="Sort discussions"
          >
            <option value="foryou">For You</option>
            <option value="fresh">Latest</option>
            <option value="trending">Top</option>
            <option value="debated">Debated</option>
          </select>
        </div>
      </div>

      {/* 3. Compact, Refined Daily Prompt Card */}
      {dailyPrompt && !dismissedDailyPrompt && (
        <div className="pulse-daily-compact">
          <div className="pulse-daily-compact-top">
            <span className="pulse-daily-label">
              <Sparkles size={12} /> TODAY'S QUESTION · {dailyPrompt.responseCount} TAKES
            </span>
            <button
              className="pulse-compact-dismiss"
              onClick={() => setDismissedDailyPrompt(true)}
              title="Hide for now"
            >
              <X size={13} />
            </button>
          </div>

          <p className="pulse-daily-question-text">
            "{dailyPrompt.promptText}"
          </p>

          <div className="pulse-daily-compact-actions">
            <button
              className="pulse-text-action primary"
              onClick={() => handleAnswerPrompt(dailyPrompt.id, dailyPrompt.promptText, dailyPrompt.channel)}
            >
              <span>{dailyPrompt.hasAnsweredToday ? 'Add another take' : 'Share your take'}</span>
              <ArrowRight size={13} />
            </button>

            <button
              className="pulse-text-action secondary"
              onClick={() => setSelectedPromptFilter(selectedPromptFilter === dailyPrompt.id ? null : dailyPrompt.id)}
            >
              <span>{selectedPromptFilter === dailyPrompt.id ? 'Show all' : 'View responses'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Network Error Banner */}
      {feedError && (
        <div className="pulse-error-box">
          <AlertCircle size={15} />
          <span>{feedError}</span>
          <button onClick={() => void loadFeed(true)}>Retry</button>
        </div>
      )}

      {/* Active Filter Pill */}
      {selectedPromptFilter && dailyPrompt && (
        <div className="pulse-filter-tag">
          <span>Viewing responses to: <b>"{dailyPrompt.promptText.slice(0, 44)}..."</b></span>
          <button onClick={() => setSelectedPromptFilter(null)}>
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* 4. Stream of Clean, Professional Cards */}
      {loading ? (
        <div className="pulse-status-center">
          <LoaderCircle className="spin" size={22} />
          <span>Loading discussions…</span>
        </div>
      ) : posts.length === 0 ? (
        <div className="pulse-status-center empty">
          <p>No conversations in this channel yet.</p>
          <button className="pulse-button-primary" onClick={() => { setFormPromptId(null); setShowCreateModal(true); }}>
            Start the first conversation
          </button>
        </div>
      ) : (
        <div className="pulse-cards-list">
          {posts.map((post) => {
            const isSpoilerCovered = Boolean(post.isSpoiler) && !revealedPostIds.has(post.id);
            const isMenuOpen = activeMenuPostId === post.id;
            const totalVotes = post.poll ? post.poll.votesA + post.poll.votesB : 0;
            const pctA = totalVotes > 0 && post.poll ? Math.round((post.poll.votesA / totalVotes) * 100) : 50;
            const pctB = totalVotes > 0 && post.poll ? 100 - pctA : 50;

            return (
              <article key={post.id} className="pulse-card" id={`pulse-card-${post.id}`}>
                {/* Author row */}
                <div className="pulse-card-header">
                  <div className="pulse-author-row">
                    <div className={`pulse-avatar ${post.isAnonymous ? 'anon' : ''}`}>
                      {post.isAnonymous ? '🎭' : post.authorHandle.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="pulse-author-info">
                      <strong className="pulse-author-handle">{post.authorHandle}</strong>
                      <span className="pulse-dot">·</span>
                      <span className="pulse-channel-indicator">{post.channel.replace('_', ' ')}</span>
                      <span className="pulse-dot">·</span>
                      <time className="pulse-timestamp">{timeAgo(post.createdAt)}</time>
                    </div>
                  </div>

                  <div className="pulse-card-menu-box" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="pulse-menu-btn"
                      onClick={() => setActiveMenuPostId(isMenuOpen ? null : post.id)}
                      title="Options"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {isMenuOpen && (
                      <div className="pulse-dropdown">
                        {post.isOwner || currentUser?.isAdmin ? (
                          <button className="pulse-dropdown-item danger" onClick={() => handleDeletePost(post.id)}>
                            <Trash2 size={13} />
                            <span>Delete post</span>
                          </button>
                        ) : null}

                        {!post.isAnonymous && post.userId && currentUser && !post.isOwner && (
                          <button className="pulse-dropdown-item" onClick={() => handleBlockUser(post.userId)}>
                            <UserX size={13} />
                            <span>Block @{post.authorHandle}</span>
                          </button>
                        )}

                        {!post.isOwner && (
                          <button
                            className="pulse-dropdown-item"
                            onClick={() => {
                              setReportModalData({ targetType: 'post', targetId: post.id });
                              setActiveMenuPostId(null);
                            }}
                          >
                            <Flag size={13} />
                            <span>Report post</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Post content */}
                {post.title && <h2 className="pulse-card-title">{post.title}</h2>}

                <div className="pulse-card-body-wrap">
                  {isSpoilerCovered && (
                    <div
                      className="pulse-spoiler-curtain"
                      onClick={() => setRevealedPostIds((s) => new Set([...s, post.id]))}
                    >
                      <Eye size={13} />
                      <span>Confidential · Click to uncover</span>
                    </div>
                  )}
                  <p className="pulse-card-text">{post.body}</p>
                </div>

                {/* Poll if attached */}
                {post.poll && (
                  <div className="pulse-poll-container">
                    <div className="pulse-poll-prompt">
                      <HelpCircle size={13} /> {post.poll.question}
                    </div>
                    <div className="pulse-poll-choices">
                      <button
                        className={`pulse-poll-btn ${post.poll.myVote === 'a' ? 'selected' : ''}`}
                        onClick={() => handlePollVote(post.id, 'a')}
                      >
                        {post.poll.myVote && <div className="pulse-poll-fill-bar" style={{ width: `${pctA}%` }} />}
                        <span className="pulse-poll-label">{post.poll.optionA}</span>
                        {post.poll.myVote && <span className="pulse-poll-pct">{pctA}%</span>}
                      </button>

                      <button
                        className={`pulse-poll-btn ${post.poll.myVote === 'b' ? 'selected' : ''}`}
                        onClick={() => handlePollVote(post.id, 'b')}
                      >
                        {post.poll.myVote && <div className="pulse-poll-fill-bar" style={{ width: `${pctB}%` }} />}
                        <span className="pulse-poll-label">{post.poll.optionB}</span>
                        {post.poll.myVote && <span className="pulse-poll-pct">{pctB}%</span>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Clean Footer Row */}
                <div className="pulse-card-footer">
                  <div className="pulse-footer-left">
                    <button
                      className={`pulse-action-btn ${post.myReactions.length > 0 ? 'reacted' : ''}`}
                      onClick={() => handleReact(post.id, 'fire')}
                      title="React"
                    >
                      <span>🔥</span>
                      <span>{post.totalReactions > 0 ? post.totalReactions : 'React'}</span>
                    </button>

                    <button
                      className="pulse-action-btn"
                      onClick={() => openComments(post)}
                      title="Comments"
                    >
                      <MessageSquare size={14} />
                      <span>{post.commentCount > 0 ? post.commentCount : 'Comment'}</span>
                    </button>
                  </div>

                  {!post.isAnonymous && currentUser && post.authorHandle !== currentUser.username && (
                    <button
                      className="pulse-say-hi-btn"
                      onClick={() => onOpenChatWith?.(post.authorHandle)}
                      title={`Message @${post.authorHandle}`}
                    >
                      <Send size={12} />
                      <span>Say Hi</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {/* Pagination */}
          <div ref={sentinelRef} className="pulse-sentinel">
            {loadingMore ? (
              <div className="pulse-loading-more">
                <LoaderCircle className="spin" size={16} />
                <span>Loading more discussions…</span>
              </div>
            ) : hasMore ? (
              <button className="pulse-load-more-btn" onClick={() => void loadFeed(false)}>
                Load more discussions
              </button>
            ) : posts.length > 0 ? (
              <div className="pulse-end-message">
                <span>You're all caught up with the community stream</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Comments Drawer */}
      {activeCommentPost && (
        <div className="pulse-modal-backdrop" onClick={() => setActiveCommentPost(null)}>
          <div className="pulse-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-header">
              <h3>Comments ({comments.length})</h3>
              <button className="pulse-modal-close" onClick={() => setActiveCommentPost(null)}>
                <X size={17} />
              </button>
            </div>

            <div className="pulse-comments-list">
              {loadingComments ? (
                <div className="pulse-status-center">
                  <LoaderCircle className="spin" size={18} />
                </div>
              ) : comments.length === 0 ? (
                <div className="pulse-status-center empty">
                  <p>No comments yet. Share your thoughts!</p>
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="pulse-comment-item">
                    <div className={`pulse-avatar sm ${c.isAnonymous ? 'anon' : ''}`}>
                      {c.isAnonymous ? '🎭' : c.authorHandle.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="pulse-comment-content">
                      <div className="pulse-comment-meta">
                        <strong>{c.authorHandle}</strong>
                        <span className="pulse-dot">·</span>
                        <time>{timeAgo(c.createdAt)}</time>
                        {c.isOwner || currentUser?.isAdmin ? (
                          <button
                            className="pulse-comment-delete"
                            onClick={() => deleteComment(c.id)}
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        ) : (
                          <button
                            className="pulse-comment-report"
                            onClick={() => setReportModalData({ targetType: 'comment', targetId: c.id })}
                            title="Report"
                          >
                            <Flag size={11} />
                          </button>
                        )}
                      </div>
                      <p className="pulse-comment-text">{c.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={submitComment} className="pulse-comment-form">
              <div className="pulse-comment-anon-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={commentAnonymous}
                    onChange={(e) => setCommentAnonymous(e.target.checked)}
                  />
                  <span>Comment Anonymously 🎭</span>
                </label>
              </div>
              <div className="pulse-comment-input-row">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={commentAnonymous ? 'Add an anonymous comment...' : 'Write a comment...'}
                  maxLength={1000}
                />
                <button type="submit" className="pulse-comment-send" disabled={!commentText.trim()}>
                  <Send size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalData && (
        <div className="pulse-modal-backdrop" onClick={() => setReportModalData(null)}>
          <div className="pulse-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-header">
              <h3>Report {reportModalData.targetType === 'post' ? 'Post' : 'Comment'}</h3>
              <button className="pulse-modal-close" onClick={() => setReportModalData(null)}>
                <X size={17} />
              </button>
            </div>

            <form onSubmit={submitReport} className="pulse-report-body">
              {reportNotice ? (
                <div className="pulse-report-success">
                  <Check size={20} />
                  <span>{reportNotice}</span>
                </div>
              ) : (
                <>
                  <p className="pulse-report-help">Why are you reporting this content?</p>
                  <div className="pulse-report-reasons">
                    {[
                      'Harassment or personal attack',
                      'Inappropriate or explicit content',
                      'Spam or self-promotion',
                      'Misinformation or harmful advice',
                      'Hate speech or discrimination'
                    ].map((reason) => (
                      <label key={reason} className="pulse-reason-label">
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

                  <div className="pulse-modal-actions">
                    <button type="button" className="pulse-btn-secondary" onClick={() => setReportModalData(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="pulse-button-primary" disabled={submittingReport}>
                      {submittingReport ? 'Submitting…' : 'Submit Report'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* New Discussion Composer Modal */}
      {showCreateModal && (
        <div className="pulse-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="pulse-modal-card pulse-composer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-header">
              <h3>{formPromptId ? 'Respond to Community Prompt' : 'New Discussion'}</h3>
              <button className="pulse-modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={17} />
              </button>
            </div>

            <form onSubmit={submitPost} className="pulse-composer-form">
              {postError && <div className="pulse-error-box">{postError}</div>}

              <div className="pulse-form-group">
                <label className="pulse-form-label">CHANNEL</label>
                <select
                  className="pulse-form-select"
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as any)}
                >
                  <option value="confessions">🌶️ Confessions</option>
                  <option value="hot_takes">💡 Hot Takes</option>
                  <option value="real_talk">💼 Real Talk</option>
                  <option value="midnight">🌙 Midnight</option>
                </select>
              </div>

              <div className="pulse-form-group">
                <label className="pulse-form-label">TITLE (OPTIONAL)</label>
                <input
                  className="pulse-form-input"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Give your thought a headline..."
                  maxLength={100}
                />
              </div>

              <div className="pulse-form-group">
                <label className="pulse-form-label">YOUR THOUGHT</label>
                <textarea
                  className="pulse-form-textarea"
                  required
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="What's happening? Share candidly..."
                  maxLength={4000}
                />
              </div>

              <div className="pulse-form-group checkbox">
                <label className="pulse-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formHasPoll}
                    onChange={(e) => setFormHasPoll(e.target.checked)}
                  />
                  <span>Attach a mini-poll</span>
                </label>
                {formHasPoll && (
                  <div className="pulse-poll-inputs">
                    <input
                      className="pulse-form-input"
                      required
                      placeholder="Poll question..."
                      value={formPollQ}
                      onChange={(e) => setFormPollQ(e.target.value)}
                      maxLength={150}
                    />
                    <div className="pulse-poll-options-row">
                      <input
                        className="pulse-form-input"
                        required
                        placeholder="Option A"
                        value={formPollA}
                        onChange={(e) => setFormPollA(e.target.value)}
                        maxLength={50}
                      />
                      <input
                        className="pulse-form-input"
                        required
                        placeholder="Option B"
                        value={formPollB}
                        onChange={(e) => setFormPollB(e.target.value)}
                        maxLength={50}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pulse-form-group checkbox">
                <label className="pulse-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formAnonymous}
                    onChange={(e) => setFormAnonymous(e.target.checked)}
                  />
                  <span>Post Anonymously 🎭 (Your handle will be hidden)</span>
                </label>
              </div>

              <button
                type="submit"
                className="pulse-button-primary full"
                disabled={submittingPost}
              >
                {submittingPost ? <LoaderCircle className="spin" size={16} /> : <>Publish Discussion <ArrowUpRight size={15} /></>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Secret Notes Inbox Modal */}
      {showInboxModal && (
        <div className="pulse-modal-backdrop" onClick={() => setShowInboxModal(false)}>
          <div className="pulse-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-header">
              <h3>💌 Secret Notes Inbox</h3>
              <button className="pulse-modal-close" onClick={() => setShowInboxModal(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="pulse-inbox-body">
              {currentUser && (
                <div className="pulse-inbox-link-card">
                  <div>
                    <strong>Your Secret Ask Link</strong>
                    <p>Share on Instagram or WhatsApp to receive honest anonymous notes.</p>
                  </div>
                  <button className="pulse-btn-secondary sm" onClick={copyAskLink}>
                    {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {loadingInbox ? (
                <div className="pulse-status-center">
                  <LoaderCircle className="spin" size={18} />
                </div>
              ) : inboxAsks.length === 0 ? (
                <div className="pulse-status-center empty">
                  <p>No secret questions yet.</p>
                  <small>Copy your link above and share it with friends!</small>
                </div>
              ) : (
                <div className="pulse-inbox-items">
                  {inboxAsks.map((ask) => (
                    <div key={ask.id} className="pulse-inbox-card">
                      <div className="pulse-inbox-meta">
                        <span>ANONYMOUS NOTE</span>
                        <time>{timeAgo(ask.created_at)}</time>
                      </div>
                      <p className="pulse-inbox-q">"{ask.question}"</p>

                      {ask.reply ? (
                        <div className="pulse-inbox-reply-view">
                          <strong>Your Public Reply:</strong>
                          <p>{ask.reply}</p>
                        </div>
                      ) : replyingAskId === ask.id ? (
                        <div className="pulse-inbox-reply-composer">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your answer..."
                            maxLength={1000}
                          />
                          <label className="pulse-checkbox-label">
                            <input
                              type="checkbox"
                              checked={replyPublish}
                              onChange={(e) => setReplyPublish(e.target.checked)}
                            />
                            <span>Publish to public Pulse feed</span>
                          </label>
                          <div className="pulse-inbox-actions">
                            <button
                              className="pulse-button-primary sm"
                              onClick={() => handleReplySubmit(ask.id)}
                              disabled={submittingReply || !replyText.trim()}
                            >
                              {submittingReply ? 'Sending…' : 'Send Answer'}
                            </button>
                            <button
                              className="pulse-btn-secondary sm"
                              onClick={() => { setReplyingAskId(null); setReplyText(''); }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="pulse-btn-secondary sm"
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
      setError(err instanceof Error ? err.message : 'Could not send secret note.');
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
            <strong style={{ fontSize: 16, color: '#232726' }}>Your secret note was sent!</strong>
            <p style={{ fontSize: 12, color: '#767d71' }}>@{targetUsername} will receive it anonymously in their Adda inbox.</p>
            <button className="pulse-button-primary" onClick={() => setSent(false)} style={{ margin: '8px auto 0' }}>
              Send another note
            </button>
          </div>
        ) : (
          <form onSubmit={submitAsk} style={{ display: 'grid', gap: 12 }}>
            {error && <div className="pulse-error-box">{error}</div>}
            <textarea
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Write your honest secret or question for @${targetUsername}...`}
              maxLength={1000}
            />
            <button
              type="submit"
              className="pulse-button-primary full"
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
