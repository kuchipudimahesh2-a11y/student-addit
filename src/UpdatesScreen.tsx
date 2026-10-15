import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Bell, Check, GraduationCap, LoaderCircle, Plus } from 'lucide-react';

type User = {
  id: string;
  name: string;
  username: string;
  gender: 'male' | 'female';
  isAdmin?: boolean;
  accountType?: 'public' | 'private';
  avatarUrl?: string | null;
};

type SystemAnnouncement = {
  id: string;
  title: string | null;
  body: string;
  image_url: string | null;
  created_at: string;
};

const isAddaPagesDomain =
  typeof window !== 'undefined' &&
  (location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev'));
const API_ORIGIN = isAddaPagesDomain ? 'https://student-addit.mgp899123.workers.dev' : '';
const API = `${API_ORIGIN}/api`;

async function fetchApi<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
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
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(seconds) || seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function UpdatesScreen({
  token,
  currentUser,
  onOpenChannel,
}: {
  token: string;
  currentUser: User;
  onOpenChannel: () => void;
}) {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState('');
  const [myStatus, setMyStatus] = useState<string>(() => {
    try {
      return localStorage.getItem(`adda-status:${currentUser.id}`) || 'Available to chat';
    } catch {
      return 'Available to chat';
    }
  });
  const [editingStatus, setEditingStatus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchApi<{ announcements: SystemAnnouncement[] }>('/announcements', token)
      .then((data) => {
        if (!cancelled && data.announcements) {
          setAnnouncements(data.announcements);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveStatus = (e: FormEvent) => {
    e.preventDefault();
    if (!statusText.trim()) return;
    const next = statusText.trim();
    setMyStatus(next);
    try {
      localStorage.setItem(`adda-status:${currentUser.id}`, next);
    } catch {}
    setEditingStatus(false);
    setStatusText('');
  };

  return (
    <div className="updates-page">
      <div className="updates-section">
        <div className="updates-section-head">
          <h2>Status</h2>
        </div>
        <div className="status-my-card">
          <div className="status-avatar-wrap">
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.username} className="status-avatar-img" />
            ) : (
              <div className="status-avatar-placeholder">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div
              className="status-add-badge"
              onClick={() => setEditingStatus(!editingStatus)}
              title="Change status"
              role="button"
              tabIndex={0}
            >
              <Plus size={14} />
            </div>
          </div>
          <div
            className="status-info"
            onClick={() => setEditingStatus(!editingStatus)}
            style={{ cursor: 'pointer', flex: 1 }}
          >
            <strong>My status</strong>
            <span>{myStatus}</span>
          </div>
        </div>

        {editingStatus && (
          <form className="status-edit-form" onSubmit={saveStatus}>
            <input
              autoFocus
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="What's on your mind? (e.g. In class, Studying, Free to talk)"
              maxLength={100}
            />
            <div className="status-edit-actions">
              <button type="button" onClick={() => setEditingStatus(false)}>
                Cancel
              </button>
              <button type="submit" disabled={!statusText.trim()}>
                Save Status
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="updates-section">
        <div className="updates-section-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <h2>Channels &amp; Announcements</h2>
            <button type="button" className="updates-explore-btn" onClick={onOpenChannel}>
              Open in Chats <ArrowUpRight size={14} />
            </button>
          </div>
          <p>Official updates and broadcasts from the Student Addit team</p>
        </div>

        <div className="channel-highlight-card" onClick={onOpenChannel} style={{ cursor: 'pointer' }}>
          <div className="channel-brand-icon">
            <GraduationCap size={22} />
          </div>
          <div className="channel-highlight-info">
            <div className="channel-title-row">
              <strong>Student Addit Official</strong>
              <span className="official-verified-badge mini" title="Verified Channel">
                <Check size={9} strokeWidth={3} />
              </span>
            </div>
            <span>Verified campus community channel</span>
          </div>
          <button
            type="button"
            className="channel-open-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChannel();
            }}
          >
            View Channel
          </button>
        </div>

        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '30px 0',
              gap: 10,
              color: '#6b7280',
            }}
          >
            <LoaderCircle className="spin" size={18} />
            <span>Loading announcements...</span>
          </div>
        ) : announcements.length === 0 ? (
          <div className="updates-empty-box">
            <Bell size={24} />
            <strong>All caught up!</strong>
            <span>Official announcements from the administration will show up here.</span>
          </div>
        ) : (
          <div className="announcements-feed">
            {announcements.map((item) => (
              <article key={item.id} className="announcement-card">
                {item.title && <h3>{item.title}</h3>}
                <p>{item.body}</p>
                {item.image_url && (
                  <div className="announcement-image-wrap">
                    <img src={item.image_url} alt={item.title || 'Announcement'} />
                  </div>
                )}
                <div className="announcement-meta">
                  <span className="official-tag">Official Announcement</span>
                  <time>{timeAgo(item.created_at)}</time>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
