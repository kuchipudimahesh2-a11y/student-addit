import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  HelpCircle,
  Inbox,
  LoaderCircle,
  MessageSquare,
  Plus,
  Radio,
  Send,
  Sparkles,
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
  userId?: string;
  authorHandle: string;
  avatarUrl?: string | null;
  isAnonymous: boolean;
  channel: 'confessions' | 'hot_takes' | 'real_talk' | 'midnight';
  title?: string | null;
  body: string;
  cardTheme: 'paper' | 'velvet' | 'terracotta' | 'sage';
  source: string;
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

type PulseComment = {
  id: string;
  postId: string;
  userId: string;
  authorHandle: string;
  avatarUrl?: string | null;
  isAnonymous: boolean;
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

const REACTION_EMOJIS: { type: string; emoji: string; label: string }[] = [
  { type: 'fire', emoji: '🔥', label: 'Spicy' },
  { type: 'skull', emoji: '💀', label: 'Relatable' },
  { type: 'popcorn', emoji: '🍿', label: 'Drama' },
  { type: 'brain', emoji: '🧠', label: 'Truth' },
  { type: 'heartbreak', emoji: '💔', label: 'Felt That' },
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
  const [sort, setSort] = useState<'trending' | 'fresh' | 'debated'>('fresh');
  const [posts, setPosts] = useState<PulsePost[]>([]);
  const [prompts, setPrompts] = useState<PulsePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<PulsePost | null>(null);
  const [comments, setComments] = useState<PulseComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentAnonymous, setCommentAnonymous] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Composer Form
  const [formChannel, setFormChannel] = useState<'confessions' | 'hot_takes' | 'real_talk' | 'midnight'>('confessions');
  const [formTheme, setFormTheme] = useState<'paper' | 'velvet' | 'terracotta' | 'sage'>('paper');
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formAnonymous, setFormAnonymous] = useState(true);
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

  // Fetch Feed
  const loadFeed = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }
      const nextOffset = reset ? 0 : offset;
      const res = await api<{ posts: PulsePost[]; prompts: PulsePrompt[]; hasMore: boolean }>(
        `/pulse/feed?channel=${channel}&sort=${sort}&limit=15&offset=${nextOffset}`,
        token
      );
      if (reset) {
        setPosts(res.posts || []);
      } else {
        setPosts((prev) => [...prev, ...(res.posts || [])]);
      }
      setPrompts(res.prompts || []);
      setHasMore(res.hasMore);
      setOffset(nextOffset + (res.posts || []).length);
    } catch (e) {
      console.error('Failed to load pulse feed', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [channel, sort, offset, token]);

  useEffect(() => {
    void loadFeed(true);
  }, [channel, sort]);

  // Infinite Scroll Trigger via IntersectionObserver
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
      { rootMargin: '400px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadFeed]);

  // Handle Emoji Reaction
  const handleReact = async (postId: string, reactionType: string) => {
    if (!token) return;
    // Optimistic UI update
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
        return { ...p, myReactions: nextMy, reactionCounts: nextCounts };
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
      // Synchronize with server response
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, reactionCounts: res.reactionCounts, myReactions: res.myReactions }
            : p
        )
      );
    } catch {
      // Revert if error
      void loadFeed(true);
    }
  };

  // Handle Mini-Poll Vote
  const handlePollVote = async (postId: string, choice: 'a' | 'b') => {
    if (!token) return;
    // Optimistic UI update
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

  // Open Comments
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

  // Add Comment
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

  // Create Post
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
          title: formTitle.trim() || undefined,
          body: formBody.trim(),
          isAnonymous: formAnonymous,
          pollQuestion: formHasPoll ? formPollQ : undefined,
          pollOptionA: formHasPoll ? formPollA : undefined,
          pollOptionB: formHasPoll ? formPollB : undefined,
        }),
      });
      setShowCreateModal(false);
      setFormTitle('');
      setFormBody('');
      setFormHasPoll(false);
      void loadFeed(true);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  // Click on Prompt (Engine 3)
  const answerPrompt = (promptText: string) => {
    setFormBody(`"${promptText}"\n\n`);
    setShowCreateModal(true);
  };

  // Load Inbox (Engine 4)
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

  // Reply to Ask
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

  // Copy Public Link
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
      {/* Header */}
      <header className="pulse-header">
        <div className="pulse-header-title">
          <span className="eyebrow">
            <Radio size={14} /> LIVE THOUGHT STREAM · SINGLE-PLAYER CAFE
          </span>
          <h1>
            Adda <i>Pulse.</i>
          </h1>
        </div>

        <div className="pulse-header-actions">
          {currentUser && (
            <button className="pulse-btn pulse-btn-secondary" onClick={openInbox}>
              <Inbox size={15} /> Secrets Inbox
            </button>
          )}
          <button className="pulse-btn pulse-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Drop a Thought
          </button>
        </div>
      </header>

      {/* Secret Link Banner for Current User */}
      {currentUser && (
        <div className="pulse-ask-banner">
          <div className="pulse-ask-banner-info">
            <div className="pulse-ask-banner-icon">
              <Sparkles size={18} />
            </div>
            <div className="pulse-ask-banner-text">
              <strong>Your Anonymous Secret Link is Live</strong>
              <span>
                Share on Instagram or WhatsApp: friends can send secrets directly to your inbox.
              </span>
            </div>
          </div>
          <div className="pulse-ask-banner-actions">
            <button className="pulse-btn" onClick={copyAskLink}>
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      )}

      {/* Filter and Sort Bar */}
      <div className="pulse-filters-bar">
        <div className="pulse-channels-scroll">
          <button
            className={`pulse-channel-chip ${channel === 'all' ? 'active' : ''}`}
            onClick={() => setChannel('all')}
          >
            🌐 All
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'confessions' ? 'active' : ''}`}
            onClick={() => setChannel('confessions')}
          >
            🌶️ Confessions
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'hot_takes' ? 'active' : ''}`}
            onClick={() => setChannel('hot_takes')}
          >
            💡 Hot Takes
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'real_talk' ? 'active' : ''}`}
            onClick={() => setChannel('real_talk')}
          >
            💼 Real Talk
          </button>
          <button
            className={`pulse-channel-chip ${channel === 'midnight' ? 'active' : ''}`}
            onClick={() => setChannel('midnight')}
          >
            🌙 Midnight
          </button>
        </div>

        <div className="pulse-sort-group">
          <button
            className={`pulse-sort-btn ${sort === 'trending' ? 'active' : ''}`}
            onClick={() => setSort('trending')}
          >
            🔥 Trending
          </button>
          <button
            className={`pulse-sort-btn ${sort === 'fresh' ? 'active' : ''}`}
            onClick={() => setSort('fresh')}
          >
            ⏱️ Fresh
          </button>
          <button
            className={`pulse-sort-btn ${sort === 'debated' ? 'active' : ''}`}
            onClick={() => setSort('debated')}
          >
            💬 Debated
          </button>
        </div>
      </div>

      {/* Stream of Posts */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
          <LoaderCircle className="spin" size={24} />
          <div style={{ marginTop: 10, fontSize: 12 }}>Tuning into the pulse...</div>
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
          <p>No thoughts in this channel yet. Be the first to drop one!</p>
          <button className="pulse-btn pulse-btn-primary" onClick={() => setShowCreateModal(true)}>
            Drop the first thought
          </button>
        </div>
      ) : (
        <div className="pulse-stream">
          {posts.map((post, idx) => {
            const promptItem = prompts[idx % prompts.length];
            const showPromptHere = idx > 0 && idx % 4 === 0 && promptItem;

            const totalVotes = post.poll ? post.poll.votesA + post.poll.votesB : 0;
            const pctA = totalVotes > 0 && post.poll ? Math.round((post.poll.votesA / totalVotes) * 100) : 50;
            const pctB = totalVotes > 0 && post.poll ? 100 - pctA : 50;

            return (
              <div key={post.id}>
                {/* Interleaved Prompt Card (Engine 3 Multiplier) */}
                {showPromptHere && (
                  <div className="pulse-prompt-card" onClick={() => answerPrompt(promptItem.prompt_text)}>
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
                <article className={`pulse-card pulse-theme-${post.cardTheme}`}>
                  <div className="pulse-card-header">
                    <div className="pulse-card-meta">
                      <span className="pulse-channel-tag">{post.channel.replace('_', ' ')}</span>
                      <div className="pulse-card-author">
                        <div className={`pulse-author-avatar ${post.isAnonymous ? 'anon' : ''}`}>
                          {post.isAnonymous ? '?' : post.authorHandle.slice(0, 1).toUpperCase()}
                        </div>
                        <strong>{post.authorHandle}</strong>
                      </div>
                    </div>
                    <time className="pulse-card-time">{timeAgo(post.createdAt)}</time>
                  </div>

                  {post.title && <h2 className="pulse-card-title">{post.title}</h2>}
                  <div className="pulse-card-body">{post.body}</div>

                  {/* Optional Mini-Poll */}
                  {post.poll && (
                    <div className="pulse-poll-box">
                      <div className="pulse-poll-title">
                        <HelpCircle size={14} /> {post.poll.question}
                      </div>
                      <div className="pulse-poll-options">
                        <button
                          className={`pulse-poll-btn ${post.poll.myVote === 'a' ? 'voted-mine' : ''}`}
                          onClick={() => handlePollVote(post.id, 'a')}
                        >
                          {post.poll.myVote && <div className="pulse-poll-fill" style={{ width: `${pctA}%` }} />}
                          <span className="pulse-poll-btn-label">{post.poll.optionA}</span>
                          {post.poll.myVote && <span className="pulse-poll-btn-pct">{pctA}%</span>}
                        </button>

                        <button
                          className={`pulse-poll-btn ${post.poll.myVote === 'b' ? 'voted-mine' : ''}`}
                          onClick={() => handlePollVote(post.id, 'b')}
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
                            onClick={() => handleReact(post.id, r.type)}
                            title={r.label}
                          >
                            <span>{r.emoji}</span>
                            {count > 0 && <span className="pulse-react-count">{count}</span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pulse-card-actions">
                      <button className="pulse-action-link" onClick={() => openComments(post)}>
                        <MessageSquare size={14} />
                        <span>{post.commentCount > 0 ? post.commentCount : 'Comment'}</span>
                      </button>

                      {/* Bridge to 1-on-1 chats if public author */}
                      {!post.isAnonymous && currentUser && post.authorHandle !== currentUser.username && (
                        <button
                          className="pulse-action-link"
                          onClick={() => onOpenChatWith?.(post.authorHandle)}
                          title="Say hi in private"
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

          <div ref={sentinelRef} style={{ height: 60, display: 'grid', placeItems: 'center', margin: '20px 0' }}>
            {loadingMore ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 12 }}>
                <LoaderCircle className="spin" size={16} />
                <span>Streaming more pulses...</span>
              </div>
            ) : hasMore ? (
              <button className="pulse-btn" onClick={() => void loadFeed(false)}>
                Load more thoughts <ArrowRight size={14} />
              </button>
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
                  No comments yet. Share your reaction or thought!
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

      {/* Create Thought Modal */}
      {showCreateModal && (
        <div className="pulse-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="pulse-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pulse-modal-head">
              <h3>Drop a Thought on Pulse</h3>
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

              <div className="pulse-field-group">
                <label>CARD THEME</label>
                <div className="pulse-theme-picker">
                  {(['paper', 'velvet', 'terracotta', 'sage'] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={`pulse-theme-choice pulse-theme-${t} ${formTheme === t ? 'selected' : ''}`}
                      onClick={() => setFormTheme(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pulse-field-group">
                <label>OPTIONAL HEADLINE</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Unpopular take, A secret from work, etc."
                  maxLength={100}
                />
              </div>

              <div className="pulse-field-group">
                <label>YOUR THOUGHT / CONFESSION</label>
                <textarea
                  required
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Speak your mind. Keep it real, spicy, or curious..."
                  maxLength={4000}
                />
              </div>

              <div className="pulse-field-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formHasPoll}
                    onChange={(e) => setFormHasPoll(e.target.checked)}
                  />
                  <span>Attach an interactive mini-poll to spark debate</span>
                </label>
                {formHasPoll && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    <input
                      required
                      placeholder="Poll question (e.g. Is attendance criteria outdated?)"
                      value={formPollQ}
                      onChange={(e) => setFormPollQ(e.target.value)}
                      maxLength={150}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        required
                        placeholder="Option A (e.g. Yes, abolish it)"
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
                  <span>Post 100% Anonymously 🎭 (Your handle will be hidden)</span>
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

      {/* Secret Inbox Drawer / Modal (Engine 4) */}
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
                <div style={{ textAlign: 'center', padding: 30 }}><LoaderCircle className="spin" /></div>
              ) : inboxAsks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#888' }}>
                  <p>No anonymous notes received yet.</p>
                  <small>Copy your link and paste it into your Instagram Story or WhatsApp Status!</small>
                </div>
              ) : (
                <div className="pulse-inbox-list">
                  {inboxAsks.map((ask) => (
                    <div key={ask.id} className="pulse-inbox-item">
                      <div className="pulse-inbox-item-head">
                        <span>Anonymous Secret</span>
                        <time>{timeAgo(ask.created_at)}</time>
                      </div>
                      <div className="pulse-inbox-q">"{ask.question}"</div>

                      {ask.reply ? (
                        <div className="pulse-inbox-reply-box">
                          <strong>Your Reply:</strong>
                          <p style={{ margin: '4px 0 0' }}>{ask.reply}</p>
                          {ask.is_published_to_feed ? (
                            <small style={{ color: '#d85c40', marginTop: 4, display: 'block' }}>Published to Pulse Feed 🌐</small>
                          ) : null}
                        </div>
                      ) : replyingAskId === ask.id ? (
                        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your witty reply..."
                            style={{ width: '100%', minHeight: 70, padding: 8, fontSize: 12, borderRadius: 4, border: '1px solid #ccc' }}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={replyPublish}
                              onChange={(e) => setReplyPublish(e.target.checked)}
                            />
                            <span>Publish to public Pulse Feed so everyone can read it!</span>
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="pulse-btn pulse-btn-primary"
                              onClick={() => void handleReplySubmit(ask.id)}
                              disabled={submittingReply || !replyText.trim()}
                            >
                              {submittingReply ? 'Sending...' : 'Save & Post Reply'}
                            </button>
                            <button className="pulse-btn" onClick={() => setReplyingAskId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="pulse-btn pulse-btn-secondary"
                          style={{ alignSelf: 'flex-start', marginTop: 4 }}
                          onClick={() => {
                            setReplyingAskId(ask.id);
                            setReplyText('');
                          }}
                        >
                          Reply to this Note
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

// Standalone Public Ask Me Screen (for outside visitors clicking on Instagram / WhatsApp links)
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setSending(true);
    setError('');
    try {
      await api(`/ask/${targetUsername}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ question }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="public-ask-screen">
      <div className="public-ask-card">
        <div className="public-ask-kicker">
          <Sparkles size={14} /> 100% ANONYMOUS SECRET NOTE
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💌</div>
            <h1 style={{ marginBottom: 8 }}>Secret Delivered!</h1>
            <p>@{targetUsername} will receive your note privately in their adda inbox.</p>
            <div style={{ marginTop: 24, display: 'grid', gap: 10 }}>
              <button
                className="pulse-btn pulse-btn-primary"
                style={{ height: 42, justifyContent: 'center' }}
                onClick={onBackToApp}
              >
                Create your own adda link in 10s <ArrowRight size={15} />
              </button>
              <button className="pulse-btn" onClick={() => setSent(false)}>
                Send another message
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1>
              Say something to <i>@{targetUsername}</i>
            </h1>
            <p>
              Send an anonymous confession, secret question, or honest thoughts. Your identity will never be revealed.
            </p>

            <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
              <textarea
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type your secret or question here..."
                maxLength={1000}
              />

              {error && <div className="form-error">{error}</div>}

              <button
                type="submit"
                className="pulse-btn pulse-btn-primary"
                style={{ height: 44, justifyContent: 'center' }}
                disabled={sending || !question.trim()}
              >
                {sending ? <LoaderCircle className="spin" size={16} /> : <>Send Anonymously 🤫 <Send size={15} /></>}
              </button>
            </form>

            <div className="public-ask-foot">
              <span>🔒 100% Private &amp; Secure</span>
              <a
                href="#home"
                onClick={(e) => {
                  e.preventDefault();
                  onBackToApp();
                }}
                style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}
              >
                Enter adda →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
