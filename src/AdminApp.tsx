import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, Bell, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, FileText, FolderPlus, LoaderCircle, LogOut, MessageSquareText, Plus, RefreshCw, Search, Send, Shield, ShieldAlert, ShieldCheck, Sparkles, Trash2, Upload, Users, X } from 'lucide-react';
import './admin-side-quests.css';

type AdminUser = { id: string; username: string; name: string; gender: 'male' | 'female'; role: 'member' | 'admin'; is_suspended: number; created_at: string };
type Section = { id: string; name: string; is_archived: number; post_count: number };
type Attachment = { id: string; fileName: string; contentType: string; sizeBytes: number; url: string };
type Post = { id: string; body: string; author_username: string; created_at: string; updated_at: string; attachments: Attachment[] };
type Page = 'members' | 'studies' | 'polls' | 'notifications' | 'chat' | 'side-quests';
type Campaign = { id: string; title: string; body: string; audience: 'all' | 'male' | 'female'; status: 'queued' | 'sending' | 'completed' | 'failed'; target_count: number; sent_count: number; expired_count: number; failed_count: number; skipped_count: number; pending_count: number; created_at: string };
type AdminPoll = { id: string; question: string; status: 'open' | 'closed'; created_at: string; closed_at: string | null; total_votes: number; options: { id: string; label: string; votes: number }[] };
type AdminSideQuest = { id: string; question: string; status: 'active' | 'ended'; created_at: string; closed_at: string | null; answer_count: number; answers: { id: string; body: string; created_at: string }[] };

const API_ORIGIN = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : 'https://student-addit.mgp899123.workers.dev';
const API = `${API_ORIGIN}/api`;
const WS_ORIGIN = API_ORIGIN ? API_ORIGIN.replace(/^http/, 'ws') : `${location.protocol}//${location.host}`;
const LOCAL_ADMIN_TEST = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

async function request<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body instanceof FormData || init.body instanceof Blob ? {} : { 'content-type': 'application/json' }), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error((data as { error?: string }).error || 'Something went wrong.') as Error & { status: number }; error.status = response.status; throw error; }
  return data as T;
}

type AdminLiveEvent = { type: string; [key: string]: unknown };
const isPageVisible = () => document.visibilityState === 'visible';

function useAdminLiveFeed(token: string, onEvent: (event: AdminLiveEvent) => void) {
  const onEventRef = useRef(onEvent); const [live, setLive] = useState(false);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => {
    let stopped = false; let socket: WebSocket | null = null; let retryTimer: ReturnType<typeof setTimeout> | undefined; let backoff = 1000;
    const connect = async () => {
      if (stopped || !isPageVisible() || socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) return;
      try {
        const { ticket } = await request<{ ticket: string }>('/admin/live-ticket', token, { method: 'POST', body: '{}' });
        if (stopped || !isPageVisible()) return;
        const ws = new WebSocket(`${WS_ORIGIN}/api/ws/admin-live?ticket=${encodeURIComponent(ticket)}`); socket = ws;
        ws.onopen = () => { if (!stopped) { backoff = 1000; setLive(true); } };
        ws.onmessage = (event) => { try { const data = JSON.parse(String(event.data)) as AdminLiveEvent; onEventRef.current(data); } catch { /* ignore malformed update */ } };
        ws.onclose = () => {
          if (socket === ws) socket = null;
          if (!stopped) { setLive(false); if (isPageVisible()) { const delay = backoff; backoff = Math.min(30000, backoff * 2); retryTimer = setTimeout(() => void connect(), delay); } }
        };
        ws.onerror = () => ws.close();
      } catch {
        if (!stopped && isPageVisible()) { setLive(false); const delay = backoff; backoff = Math.min(30000, backoff * 2); retryTimer = setTimeout(() => void connect(), delay); }
      }
    };
    const onVisibility = () => {
      if (!isPageVisible()) { if (retryTimer) clearTimeout(retryTimer); retryTimer = undefined; socket?.close(); socket = null; setLive(false); }
      else { backoff = 1000; void connect(); }
    };
    document.addEventListener('visibilitychange', onVisibility); void connect();
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisibility); if (retryTimer) clearTimeout(retryTimer); socket?.close(); };
  }, [token]);
  return live;
}

async function openPrivateFile(token: string, path: string) {
  const response = await fetch(`${API_ORIGIN}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Could not open this study file.');
  return URL.createObjectURL(await response.blob());
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem('adda-admin-token') ?? (LOCAL_ADMIN_TEST ? 'local-admin-test' : ''));
  const [authState, setAuthState] = useState<'loading' | 'signed-out' | 'claim' | 'admin'>('loading');
  const [page, setPage] = useState<Page>('members');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verifyAdmin = useCallback(async (activeToken: string) => {
    try {
      const data = await request<{ user: { id: string } }>('/admin/me', activeToken);
      setUserId(data.user.id); setAuthState('admin');
    } catch (err) {
      const status = err instanceof Error && 'status' in err ? err.status : 0;
      if (status === 403 && err instanceof Error && err.message === 'Administrator access required.') setAuthState('claim');
      else if (status === 401) { localStorage.removeItem('adda-admin-token'); setToken(''); setAuthState('signed-out'); }
      else { setAuthState('signed-out'); setError('Could not verify your admin sign-in right now. Your session is still saved on this device.'); }
    }
  }, []);

  useEffect(() => { if (token) void verifyAdmin(token); else setAuthState('signed-out'); }, [token, verifyAdmin]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await request<{ token: string }>('/auth/login', '', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
      localStorage.setItem('adda-admin-token', data.token); setToken(data.token);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  };

  const claim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try { await request('/admin/bootstrap', token, { method: 'POST', body: JSON.stringify({ secret: form.get('secret') }) }); await verifyAdmin(token); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not finish admin setup.'); }
    finally { setBusy(false); }
  };

  const signOut = () => { localStorage.removeItem('adda-admin-token'); setToken(LOCAL_ADMIN_TEST ? 'local-admin-test' : ''); setUserId(''); setError(''); setAuthState(LOCAL_ADMIN_TEST ? 'loading' : 'signed-out'); };

  if (authState === 'loading') return <main className="admin-loading"><LoaderCircle className="spin"/><span>Opening the admin studio…</span></main>;
  if (authState === 'signed-out') return <main className="admin-auth-shell"><section className="admin-auth-card"><a className="admin-brand" href="https://student-addit.pages.dev"><span className="admin-brand-mark">a.</span> adda<span>.</span></a><div className="admin-kicker">A SMALL SPACE, WELL LOOKED AFTER</div><h1>Admin <i>studio.</i></h1><p>Sign in with your existing adda ID to manage members, share study resources, and run polls.</p><form onSubmit={login}><label>ADDA ID<input name="username" autoComplete="username" required placeholder="your adda ID"/></label><label>PASSWORD<input name="password" type="password" autoComplete="current-password" required placeholder="Your password"/></label>{error && <div className="admin-error">{error}</div>}{token && error && <button type="button" className="admin-link-button" onClick={() => { setError(''); setAuthState('loading'); void verifyAdmin(token); }}>Retry saved session</button>}<button className="admin-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <>Sign in <ArrowUpRight size={17}/></>}</button></form><small>Admin roles are checked by the Cloudflare Worker on every action.</small></section></main>;
  if (authState === 'claim') return <main className="admin-auth-shell"><section className="admin-auth-card"><a className="admin-brand" href="https://student-addit.pages.dev"><span className="admin-brand-mark">a.</span> adda<span>.</span></a><div className="admin-kicker">FIRST ADMIN SETUP</div><h1>Make this <i>official.</i></h1><p>This account is signed in but has no admin role yet. Enter the one-time setup secret configured in Cloudflare.</p><form onSubmit={claim}><label>ONE-TIME SETUP SECRET<input name="secret" autoComplete="off" type="password" required placeholder="Cloudflare bootstrap secret"/></label>{error && <div className="admin-error">{error}</div>}<button className="admin-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <>Claim first admin <ShieldCheck size={17}/></>}</button></form><button className="admin-link-button" onClick={signOut}>Sign out</button></section></main>;

  const pageName = page === 'members' ? 'MEMBER DIRECTORY' : page === 'studies' ? 'STUDY ROOM' : page === 'polls' ? 'COMMUNITY POLLS' : page === 'chat' ? 'CHAT MODERATION' : page === 'side-quests' ? 'CONVERSATION SIDE QUESTS' : 'PUSH NOTIFICATIONS';
  return <main className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="https://student-addit.pages.dev"><span className="admin-brand-mark">a.</span> adda<span>.</span></a><div className="admin-rail-title">ADMIN STUDIO</div><nav><button className={page === 'members' ? 'active' : ''} onClick={() => setPage('members')}><Users size={18}/> Members</button><button className={page === 'chat' ? 'active' : ''} onClick={() => setPage('chat')}><MessageSquareText size={18}/> Chat</button><button className={page === 'side-quests' ? 'active' : ''} onClick={() => setPage('side-quests')}><Sparkles size={18}/> Side Quests</button><button className={page === 'studies' ? 'active' : ''} onClick={() => setPage('studies')}><BookOpen size={18}/> Studies</button><button className={page === 'polls' ? 'active' : ''} onClick={() => setPage('polls')}><CircleHelp size={18}/> Polls</button><button className={page === 'notifications' ? 'active' : ''} onClick={() => setPage('notifications')}><Bell size={18}/> Notifications</button></nav><div className="admin-sidebar-foot"><span><i/> ADMIN ACCESS</span><small>People first. Details private.</small></div></aside><section className="admin-main"><header className="admin-topbar"><div><span>ADDA / ADMIN</span><b>{LOCAL_ADMIN_TEST ? 'LOCAL TEST MODE' : pageName}</b></div><button className="admin-signout" onClick={signOut}><LogOut size={16}/>{LOCAL_ADMIN_TEST ? 'Reset local test' : 'Sign out'}</button></header>{page === 'members' ? <Members token={token} currentUserId={userId}/> : page === 'chat' ? <ChatAdmin token={token}/> : page === 'studies' ? <StudiesAdmin token={token}/> : page === 'polls' ? <PollsAdmin token={token}/> : page === 'side-quests' ? <SideQuestsAdmin token={token}/> : <NotificationsAdmin token={token}/>}</section></main>;
}

function ChatAdmin({ token }: { token: string }) {
  const [count, setCount] = useState(0); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const data = await request<{ count: number }>('/admin/chat/messages', token); setCount(data.count); }, [token]);
  const live = useAdminLiveFeed(token, (event) => {
    if (event.type === 'chat-count' && typeof event.count === 'number') setCount(event.count);
    else if (event.type === 'chat-count' && typeof event.delta === 'number') setCount((current) => Math.max(0, current + Number(event.delta)));
  });
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load the chat status.')); }, [load]);
  useEffect(() => { const timer = setInterval(() => { if (!live && document.visibilityState === 'visible') void load().catch(() => {}); }, 60000); return () => clearInterval(timer); }, [live, load]);
  const clear = async () => {
    if (!count || !window.confirm(`Permanently delete all ${count} messages from the main adda chat? This cannot be undone.`)) return;
    setBusy(true); setError(''); setNotice('');
    try { const result = await request<{ deleted: number }>('/admin/chat/messages', token, { method: 'DELETE' }); setCount(0); setNotice(`${result.deleted} chat messages deleted. The main room is clear.`); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not clear the main chat.'); }
    finally { setBusy(false); }
  };
  return <div className="admin-content chat-admin-content"><div className="admin-heading"><div><div className="admin-kicker">04 / ROOM MODERATION</div><h1>Manage the <i>chat.</i></h1><p>Clear messages from the main adda room for everyone. This only affects the public chat history.</p></div><div className="member-count"><MessageSquareText size={19}/><span><b>{count}</b> MESSAGES · {live ? 'LIVE' : 'RECONNECTING'}</span></div></div>
    <section className="admin-panel chat-moderation-panel"><header className="admin-panel-head"><div><strong>Main adda chat</strong><span>One control clears the full conversation for all members.</span></div></header><div className="chat-moderation-body"><div className="chat-moderation-copy"><strong>{count === 0 ? 'The chat is clear.' : `${count.toLocaleString()} ${count === 1 ? 'message' : 'messages'} in the main room`}</strong><span>New messages can still be sent after clearing.</span></div><button className="chat-clear-button" onClick={() => void clear()} disabled={busy || count === 0}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={16}/>} Clear full chat</button>{error && <div className="admin-error inline">{error}</div>}{notice && <div className="notification-success" role="status"><Check size={15}/>{notice}</div>}</div></section>
  </div>;
}

function SideQuestsAdmin({ token }: { token: string }) {
  const [quests, setQuests] = useState<AdminSideQuest[]>([]); const [question, setQuestion] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const data = await request<{ quests: AdminSideQuest[] }>('/admin/side-quests', token); setQuests(data.quests); setError(''); }, [token]);
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load side quests.')); }, [load]);
  useEffect(() => {
    let stopped = false; let socket: WebSocket | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(`${WS_ORIGIN}/api/ws/side-quests?token=${encodeURIComponent(token)}`); socket = ws;
      ws.onopen = () => { if (!stopped) void load().catch(() => {}); };
      ws.onmessage = (event) => { try { if (JSON.parse(String(event.data)).type === 'side-quests-updated') void load().catch(() => {}); } catch { /* ignore malformed frame */ } };
      ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
  }, [load, token]);
  const publish = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await request('/admin/side-quests', token, { method: 'POST', body: JSON.stringify({ question }) }); setQuestion(''); setNotice('Side quest published. Members can answer now.'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not publish this side quest.'); }
    finally { setBusy(false); }
  };
  const endQuest = async (quest: AdminSideQuest) => {
    if (!window.confirm('End this side quest? Members will no longer see it or edit answers.')) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(`/admin/side-quests/${encodeURIComponent(quest.id)}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'ended' }) }); setNotice('Side quest ended. Its answers are kept in your history.'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not end this side quest.'); }
    finally { setBusy(false); }
  };
  const active = quests.filter((quest) => quest.status === 'active');
  return <div className="admin-content side-quests-admin-content"><div className="admin-heading"><div><div className="admin-kicker">A LITTLE GROUP CHALLENGE</div><h1>Conversation <i>side quests.</i></h1><p>Publish a prompt to the adda. Members answer in its own shared section, separate from normal chat.</p></div><div className="member-count"><Sparkles size={19}/><span><b>{active.length}</b> LIVE QUESTS</span></div></div>
    {error && <div className="admin-error inline">{error}</div>}{notice && <div className="notification-success" role="status"><Check size={15}/>{notice}</div>}
    <div className="side-quest-admin-grid"><section className="admin-panel side-quest-create-panel"><header className="admin-panel-head"><div><strong>Publish a side quest</strong><span>It appears for members as soon as it’s published. Multiple quests can run at once.</span></div></header><form onSubmit={(event) => void publish(event)}><label>PROMPT <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={240} minLength={3} required placeholder="What is the most useless superpower you can think of?"/></label><div className="side-quest-create-foot"><span>{question.trim().length}/240 CHARACTERS</span><button className="admin-primary" disabled={busy || question.trim().length < 3}>{busy ? <LoaderCircle className="spin" size={16}/> : <>Publish quest <ArrowUpRight size={16}/></>}</button></div></form></section>
    <section className="admin-panel side-quest-manage-panel"><header className="admin-panel-head"><div><strong>Quest history</strong><span>End a live quest to hide it from members; its answers stay here.</span></div></header><div className="side-quest-admin-list">{quests.map((quest) => <article className={`side-quest-admin-card ${quest.status}`} key={quest.id}><header><span className={`side-quest-admin-status ${quest.status}`}><i/>{quest.status}</span><span>{quest.answer_count} {quest.answer_count === 1 ? 'answer' : 'answers'}</span>{quest.status === 'active' && <button onClick={() => void endQuest(quest)} disabled={busy}>End quest</button>}</header><h2>{quest.question}</h2><div className="side-quest-admin-answers">{quest.answers.length ? quest.answers.map((answer) => <p key={answer.id}><span>MEMBER · {new Date(answer.created_at.replace(' ', 'T') + (answer.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</span>{answer.body}</p>) : <span className="side-quest-admin-empty">No answers yet.</span>}</div></article>)}{quests.length === 0 && <div className="campaign-empty"><Sparkles size={22}/><strong>No side quests yet.</strong><span>Publish a prompt and let the conversation take its own little detour.</span></div>}</div></section></div>
  </div>;
}

function PollsAdmin({ token }: { token: string }) {
  const [polls, setPolls] = useState<AdminPoll[]>([]); const [question, setQuestion] = useState(''); const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const data = await request<{ polls: AdminPoll[] }>('/admin/polls', token); setPolls(data.polls); setError(''); }, [token]);
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load polls.')); }, [load]);
  useEffect(() => {
    let stopped = false; let socket: WebSocket | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(`${WS_ORIGIN}/api/ws/polls?token=${encodeURIComponent(token)}`); socket = ws;
      ws.onopen = () => { if (!stopped) void load().catch(() => {}); };
      ws.onmessage = (event) => { try { if (JSON.parse(String(event.data)).type === 'polls-updated') void load().catch(() => {}); } catch { /* ignore malformed frame */ } };
      ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
  }, [load, token]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await request('/admin/polls', token, { method: 'POST', body: JSON.stringify({ question, options }) }); setQuestion(''); setOptions(['', '']); setNotice('Poll published. Members can vote now.'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not create this poll.'); }
    finally { setBusy(false); }
  };
  const toggleStatus = async (poll: AdminPoll) => {
    setBusy(true); setError(''); setNotice('');
    try { await request(`/admin/polls/${encodeURIComponent(poll.id)}`, token, { method: 'PATCH', body: JSON.stringify({ status: poll.status === 'open' ? 'closed' : 'open' }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update poll status.'); }
    finally { setBusy(false); }
  };
  return <div className="admin-content polls-admin-content"><div className="admin-heading"><div><div className="admin-kicker">04 / ASK YOUR COMMUNITY</div><h1>Take a <i>poll.</i></h1><p>Create a question and let members choose. Every account can vote once.</p></div><div className="member-count"><CircleHelp size={19}/><span><b>{polls.filter((poll) => poll.status === 'open').length}</b> OPEN</span></div></div>
    {error && <div className="admin-error inline">{error}</div>}{notice && <div className="notification-success" role="status"><Check size={15}/>{notice}</div>}
    <div className="poll-admin-grid"><section className="admin-panel poll-composer"><header className="admin-panel-head"><div><strong>New poll</strong><span>Publishing makes it available to members right away.</span></div></header><form onSubmit={(event) => void create(event)}>
      <label>QUESTION <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={240} required minLength={3} placeholder="What should we ask everyone?"/></label>
      <div className="poll-admin-options"><span>ANSWER CHOICES</span>{options.map((option, index) => <div className="poll-admin-option" key={index}><input value={option} onChange={(event) => setOptions((current) => current.map((value, item) => item === index ? event.target.value : value))} maxLength={160} required placeholder={`Choice ${index + 1}`}/>{options.length > 2 && <button type="button" onClick={() => setOptions((current) => current.filter((_, item) => item !== index))} title="Remove choice"><X size={15}/></button>}</div>)}
        {options.length < 8 && <button type="button" className="poll-add-option" onClick={() => setOptions((current) => [...current, ''])}><Plus size={15}/> Add a choice</button>}
      </div><button className="admin-primary" disabled={busy || !question.trim() || options.some((item) => !item.trim())}>{busy ? <LoaderCircle className="spin" size={16}/> : <>Publish poll <ArrowUpRight size={16}/></>}</button>
    </form></section>
    <section className="admin-panel poll-list-panel"><header className="admin-panel-head"><div><strong>Open poll results</strong><span>Close a poll to stop votes and remove it from both sites.</span></div></header><div className="admin-poll-list">{polls.map((poll) => <article className="admin-poll-card" key={poll.id}><header><div><span className={`poll-status ${poll.status}`}><i/>{poll.status}</span><span>{poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'}</span></div><button className="poll-status-action" disabled={busy} onClick={() => void toggleStatus(poll)}>Close poll</button></header><h2>{poll.question}</h2><div className="admin-poll-results">{poll.options.map((option) => { const percent = poll.total_votes ? Math.round(option.votes * 100 / poll.total_votes) : 0; return <div className="admin-poll-result" key={option.id}><div><span>{option.label}</span><b>{option.votes} · {percent}%</b></div><div className="poll-result-track"><i style={{ width: `${percent}%` }}/></div></div>; })}</div></article>)}{polls.length === 0 && <div className="campaign-empty"><CircleHelp size={22}/><strong>No open polls.</strong><span>Create a poll and publish it for members to see.</span></div>}</div></section></div>
  </div>;
}

function NotificationsAdmin({ token }: { token: string }) {
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [audience, setAudience] = useState<'all' | 'male' | 'female'>('all');
  const [counts, setCounts] = useState<{ all: number; male: number; female: number }>({ all: 0, male: 0, female: 0 }); const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const loadCounts = useCallback(async () => { const result = await request<{ counts: typeof counts }>('/admin/notifications/audience-counts', token); setCounts(result.counts); }, [token]);
  const loadCampaigns = useCallback(async () => { const result = await request<{ campaigns: Campaign[] }>('/admin/notifications', token); setCampaigns(result.campaigns); }, [token]);
  const live = useAdminLiveFeed(token, (event) => {
    if (event.type === 'connected') { void loadCampaigns().catch(() => {}); return; }
    if (event.type !== 'campaign' || !event.campaign || typeof event.campaign !== 'object') return;
    const update = event.campaign as { campaignId?: string; status?: Campaign['status']; targetCount?: number; sentCount?: number; expiredCount?: number; failedCount?: number; skippedCount?: number; pendingCount?: number };
    if (!update.campaignId) return;
    setCampaigns((current) => current.map((campaign) => campaign.id === update.campaignId ? {
      ...campaign, status: update.status ?? campaign.status, target_count: update.targetCount ?? campaign.target_count,
      sent_count: update.sentCount ?? campaign.sent_count, expired_count: update.expiredCount ?? campaign.expired_count,
      failed_count: update.failedCount ?? campaign.failed_count, skipped_count: update.skippedCount ?? campaign.skipped_count,
      pending_count: update.pendingCount ?? campaign.pending_count,
    } : campaign));
  });
  useEffect(() => { void Promise.all([loadCounts(), loadCampaigns()]).catch((err) => setError(err instanceof Error ? err.message : 'Could not load notifications.')); }, [loadCounts, loadCampaigns]);
  useEffect(() => { const timer = setInterval(() => { if (!live && document.visibilityState === 'visible') void loadCampaigns().catch(() => {}); }, 60000); return () => clearInterval(timer); }, [live, loadCampaigns]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!counts[audience]) { setError('There are no opted-in devices in this audience yet.'); return; }
    if (!window.confirm(`Send this notification to ${counts[audience]} opted-in ${audience === 'all' ? 'devices' : audience + ' devices'} now?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ status: Campaign['status']; targetCount: number }>('/admin/notifications', token, { method: 'POST', body: JSON.stringify({ title, body, audience }) });
      setNotice(result.targetCount === 0 ? 'No devices were eligible for this campaign.' : 'Notification campaign queued. Status will update below.'); setTitle(''); setBody(''); await Promise.all([loadCampaigns(), loadCounts()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send this notification.'); }
    finally { setBusy(false); }
  };
  const audienceLabel = (value: Campaign['audience']) => value === 'all' ? 'Everyone' : value === 'male' ? 'Male' : 'Female';
  return <div className="admin-content notifications-content"><div className="admin-heading"><div><div className="admin-kicker">03 / A LITTLE HELLO</div><h1>Send a <i>note.</i></h1><p>Reach members who enabled push notifications on an active account.</p></div><div className="member-count"><Bell size={19}/><span><b>{counts[audience]}</b> DEVICES</span></div></div>
    <div className="notifications-grid"><section className="admin-panel notification-composer"><header className="admin-panel-head"><div><strong>New notification</strong><span>Delivery starts immediately after you send.</span></div><button type="button" className="admin-link-button" onClick={() => void loadCounts().catch((err) => setError(err instanceof Error ? err.message : 'Could not refresh audience counts.'))}><RefreshCw size={15}/> Refresh counts</button></header><form onSubmit={(event) => void send(event)}>
      <label>TITLE <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required placeholder="A short, friendly headline"/></label>
      <label>MESSAGE <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={240} required placeholder="What would you like everyone to know?"/></label>
      <label>AUDIENCE <select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="all">Everyone · {counts.all} devices</option><option value="male">Male · {counts.male} devices</option><option value="female">Female · {counts.female} devices</option></select></label>
      <div className="notification-private-note"><ShieldCheck size={16}/><span>Only active members with an opted-in device receive this. Subscription details stay private.</span></div>
      {error && <div className="admin-error inline">{error}</div>}{notice && <div className="notification-success" role="status"><Check size={15}/>{notice}</div>}
      <button className="admin-primary notification-send" disabled={busy || !title.trim() || !body.trim() || counts[audience] === 0}>{busy ? <LoaderCircle className="spin" size={16}/> : <>Send to {counts[audience]} devices <Send size={16}/></>}</button>
    </form></section>
    <section className="admin-panel campaign-panel"><header className="admin-panel-head"><div><strong>Recent campaigns</strong><span>Push delivery · {live ? 'live updates' : 'reconnecting; fallback refresh every minute'}</span></div></header><div className="campaign-list">{campaigns.map((campaign) => <article className="campaign-card" key={campaign.id}><div className="campaign-card-head"><div><strong>{campaign.title}</strong><span>{audienceLabel(campaign.audience)} · {new Date(`${campaign.created_at.replace(' ', 'T')}Z`).toLocaleString()}</span></div><span className={`campaign-status ${campaign.status}`}><i/>{campaign.status}</span></div><p>{campaign.body}</p><div className="campaign-progress"><span>{campaign.sent_count ?? 0} sent</span><span>{campaign.pending_count ?? 0} pending</span><span>{campaign.failed_count ?? 0} failed</span><span>{campaign.expired_count ?? 0} expired</span><span>{campaign.skipped_count ?? 0} skipped</span><small>of {campaign.target_count} devices</small></div></article>)}{campaigns.length === 0 && <div className="campaign-empty"><Bell size={22}/><strong>No campaigns yet.</strong><span>Your sent notifications and their status with the push service will appear here.</span></div>}</div></section></div>
  </div>;
}

function Members({ token, currentUserId }: { token: string; currentUserId: string }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [data, setData] = useState<{ users: AdminUser[]; total: number; limit: number }>({ users: [], total: 0, limit: 25 }); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const requestSequence = useRef(0);
  const load = useCallback(async () => { const sequence = ++requestSequence.current; const result = await request<typeof data>(`/admin/users?q=${encodeURIComponent(query)}&page=${page}&limit=25`, token); if (sequence === requestSequence.current) { setData(result); setError(''); } }, [page, query, token]);
  useEffect(() => { const timer = setTimeout(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load members.')); }, 180); return () => clearTimeout(timer); }, [load]);
  const changeSuspension = async (member: AdminUser) => { setBusy(member.id); setError(''); try { await request(`/admin/users/${encodeURIComponent(member.id)}/suspension`, token, { method: 'PATCH', body: JSON.stringify({ suspended: !member.is_suspended }) }); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not update member.'); } finally { setBusy(''); } };
  const changeRole = async (member: AdminUser) => { setBusy(member.id); setError(''); try { await request(`/admin/users/${encodeURIComponent(member.id)}/role`, token, { method: 'PATCH', body: JSON.stringify({ role: member.role === 'admin' ? 'member' : 'admin' }) }); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not update role.'); } finally { setBusy(''); } };
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  return <div className="admin-content"><div className="admin-heading"><div><div className="admin-kicker">01 / YOUR COMMUNITY</div><h1>People, <i>with care.</i></h1><p>Account details stay protected. Passwords and recovery answers are never shown here.</p></div><div className="member-count"><Users size={19}/><span><b>{data.total}</b> MEMBERS</span></div></div><section className="admin-panel"><header className="admin-panel-head"><div><strong>Member directory</strong><span>Search by adda ID, real name, or gender.</span></div><label className="admin-search"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search members"/></label></header>{error && <div className="admin-error inline">{error}</div>}<div className="member-table-scroll"><table className="member-table"><thead><tr><th>ADDA ID</th><th>REAL NAME</th><th>GENDER</th><th>JOINED</th><th>ACCOUNT</th><th>ACCESS</th></tr></thead><tbody>{data.users.map((member) => <tr key={member.id}><td><strong>#{member.username}</strong>{member.id === currentUserId && <small className="you-label">YOU</small>}</td><td>{member.name}</td><td>{member.gender === 'female' ? 'Female' : 'Male'}</td><td>{new Date(`${member.created_at.replace(' ', 'T')}Z`).toLocaleDateString()}</td><td><span className={`member-state ${member.is_suspended ? 'suspended' : ''}`}><i/>{member.is_suspended ? 'Suspended' : 'Active'}</span></td><td><div className="member-actions">{member.id !== currentUserId && <button className="role-action" disabled={busy === member.id} onClick={() => void changeRole(member)} title={member.role === 'admin' ? 'Remove admin role' : 'Make admin'}>{member.role === 'admin' ? <Shield size={15}/> : <ShieldCheck size={15}/>}</button>}<button className={`suspend-action ${member.is_suspended ? 'restore' : ''}`} disabled={busy === member.id || member.id === currentUserId} onClick={() => void changeSuspension(member)}>{busy === member.id ? <LoaderCircle className="spin" size={14}/> : member.is_suspended ? <><Check size={14}/> Restore</> : <><ShieldAlert size={14}/> Suspend</>}</button></div></td></tr>)}{!data.users.length && <tr><td colSpan={6} className="table-empty">No members match that search.</td></tr>}</tbody></table></div><footer className="table-pagination"><span>{data.total ? `${(page - 1) * data.limit + 1}–${Math.min(page * data.limit, data.total)} of ${data.total}` : '0 members'}</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft size={17}/></button><span>PAGE {page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} aria-label="Next page"><ChevronRight size={17}/></button></div></footer></section><div className="admin-privacy-note"><ShieldCheck size={17}/><span>Only profile details collected at sign-up are available here. Passwords and recovery answers stay private.</span></div></div>;
}

function StudiesAdmin({ token }: { token: string }) {
  const [sections, setSections] = useState<Section[]>([]); const [selected, setSelected] = useState(''); const [posts, setPosts] = useState<Post[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [newSection, setNewSection] = useState(''); const [body, setBody] = useState(''); const [files, setFiles] = useState<File[]>([]); const [draftPostId, setDraftPostId] = useState(''); const [draftSectionId, setDraftSectionId] = useState(''); const uploadedFilesRef = useRef(new Set<string>()); const [editing, setEditing] = useState(''); const [editBody, setEditBody] = useState(''); const [liveState, setLiveState] = useState<'connecting' | 'live'>('connecting'); const [preview, setPreview] = useState<{ url: string; name: string; type: string } | null>(null); const [busyFile, setBusyFile] = useState('');
  const postRequestRef = useRef(0);
  const loadSections = useCallback(async () => { const result = await request<{ sections: Section[] }>('/studies/sections?includeArchived=true', token); setSections(result.sections); setSelected((current) => result.sections.some((item) => item.id === current) ? current : result.sections.find((item) => !item.is_archived)?.id ?? ''); }, [token]);
  const loadPosts = useCallback(async () => { const requestId = ++postRequestRef.current; if (!selected) { setPosts([]); return; } const result = await request<{ posts: Post[] }>(`/studies/sections/${encodeURIComponent(selected)}/posts`, token); if (requestId === postRequestRef.current) setPosts(result.posts); }, [selected, token]);
  useEffect(() => { void loadSections().catch((err) => setError(err instanceof Error ? err.message : 'Could not load sections.')); }, [loadSections]);
  useEffect(() => { void loadPosts().catch((err) => setError(err instanceof Error ? err.message : 'Could not load posts.')); }, [loadPosts]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    if (!selected) return;
    let stopped = false; let socket: WebSocket | null = null; let timer: ReturnType<typeof setTimeout> | undefined; setLiveState('connecting');
    const connect = async () => {
      try {
        const { ticket } = await request<{ ticket: string }>('/studies/ws-ticket', token, { method: 'POST', body: JSON.stringify({ sectionId: selected }) });
        if (stopped) return;
        const ws = new WebSocket(`${WS_ORIGIN}/api/ws/studies?sectionId=${encodeURIComponent(selected)}&ticket=${encodeURIComponent(ticket)}`); socket = ws;
        ws.onopen = () => { if (!stopped) { setLiveState('live'); void loadPosts().catch(() => {}); void loadSections().catch(() => {}); } };
        ws.onmessage = (event) => { try { if (JSON.parse(String(event.data)).type !== 'connected') { void loadPosts().catch(() => {}); void loadSections().catch(() => {}); } } catch { void loadPosts().catch(() => {}); } };
        ws.onclose = () => { if (!stopped) { setLiveState('connecting'); timer = setTimeout(() => void connect(), 2500); } };
        ws.onerror = () => ws.close();
      } catch { if (!stopped) { setLiveState('connecting'); timer = setTimeout(() => void connect(), 5000); } }
    };
    void connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
  }, [selected, token, loadPosts, loadSections]);
  const createSection = async (event: FormEvent) => { event.preventDefault(); if (!newSection.trim()) return; setBusy(true); setError(''); try { const result = await request<{ section: Section }>('/admin/studies/sections', token, { method: 'POST', body: JSON.stringify({ name: newSection }) }); setNewSection(''); await loadSections(); setSelected(result.section.id); } catch (err) { setError(err instanceof Error ? err.message : 'Could not create section.'); } finally { setBusy(false); } };
  const renameSection = async (section: Section) => { const name = window.prompt('Name this study section', section.name); if (!name || name.trim() === section.name) return; setBusy(true); try { await request(`/admin/studies/sections/${encodeURIComponent(section.id)}`, token, { method: 'PATCH', body: JSON.stringify({ name }) }); await loadSections(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not rename section.'); } finally { setBusy(false); } };
  const archiveSection = async (section: Section) => { const archived = !section.is_archived; if (!window.confirm(archived ? `Archive “${section.name}”? Members will no longer see it.` : `Restore “${section.name}”?`)) return; setBusy(true); try { await request(`/admin/studies/sections/${encodeURIComponent(section.id)}`, token, { method: 'PATCH', body: JSON.stringify({ archived }) }); await loadSections(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not update section.'); } finally { setBusy(false); } };
  const createPost = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || (!body.trim() && files.length === 0)) return; if (draftPostId && draftSectionId !== selected) { setError('Return to the folder where the unfinished note was started to continue uploading it.'); return; } setBusy(true); setError('');
    try {
      for (const file of files) if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
      let postId = draftPostId;
      if (postId) await request(`/admin/studies/posts/${encodeURIComponent(postId)}`, token, { method: 'PATCH', body: JSON.stringify({ body }) });
      else { const result = await request<{ post: Post }>(`/admin/studies/sections/${encodeURIComponent(selected)}/posts`, token, { method: 'POST', body: JSON.stringify({ body }) }); postId = result.post.id; setDraftPostId(postId); setDraftSectionId(selected); }
      for (const file of files) {
        const fileKey = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
        if (uploadedFilesRef.current.has(fileKey)) continue;
        const mimeByExtension: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
        const fileType = file.type || mimeByExtension[file.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';
        const uploaded = await fetch(`${API}/admin/studies/posts/${encodeURIComponent(postId)}/files`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': fileType, 'x-file-name': encodeURIComponent(file.name) }, body: file });
        const data = await uploaded.json().catch(() => ({})); if (!uploaded.ok) throw new Error((data as { error?: string }).error || `Could not upload ${file.name}.`);
        uploadedFilesRef.current.add(fileKey);
      }
      setBody(''); setFiles([]); setDraftPostId(''); setDraftSectionId(''); uploadedFilesRef.current.clear(); const input = document.getElementById('study-admin-files') as HTMLInputElement | null; if (input) input.value = ''; await Promise.all([loadPosts(), loadSections()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not publish this study note.'); await Promise.all([loadPosts(), loadSections()]).catch(() => {}); }
    finally { setBusy(false); }
  };
  const savePost = async (post: Post) => { setBusy(true); try { await request(`/admin/studies/posts/${encodeURIComponent(post.id)}`, token, { method: 'PATCH', body: JSON.stringify({ body: editBody }) }); setEditing(''); await loadPosts(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save post.'); } finally { setBusy(false); } };
  const deletePost = async (post: Post) => { if (!window.confirm('Remove this study note and its attached files?')) return; setBusy(true); try { await request(`/admin/studies/posts/${encodeURIComponent(post.id)}`, token, { method: 'DELETE' }); if (post.id === draftPostId) { setDraftPostId(''); setDraftSectionId(''); uploadedFilesRef.current.clear(); } await Promise.all([loadPosts(), loadSections()]); } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove post.'); } finally { setBusy(false); } };
  const current = sections.find((section) => section.id === selected);
  const openFile = async (file: Attachment) => {
    setBusyFile(file.id); setError('');
    try {
      const url = await openPrivateFile(token, file.url);
      if (file.contentType.startsWith('image/') || file.contentType === 'application/pdf') setPreview({ url, name: file.fileName, type: file.contentType });
      else { const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.rel = 'noopener noreferrer'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open file.'); }
    finally { setBusyFile(''); }
  };
  return <div className="admin-content studies-admin-content"><div className="admin-heading"><div><div className="admin-kicker">02 / SHARE WHAT YOU KNOW</div><h1>Study <i>room.</i></h1><p>Create topic folders and post notes or learning files. Members can read and download.</p></div><div className="member-count"><BookOpen size={19}/><span><b>{sections.filter((section) => !section.is_archived).length}</b> SECTIONS</span></div></div>{error && <div className="admin-error inline">{error}</div>}<div className="admin-studies-layout"><aside className="admin-section-panel"><div className="admin-section-head"><strong>Study folders</strong><span>Members see active sections only.</span></div><form className="new-section-form" onSubmit={createSection}><input value={newSection} onChange={(event) => setNewSection(event.target.value)} maxLength={80} required placeholder="New section name"/><button disabled={busy} title="Create section"><FolderPlus size={17}/></button></form><div className="admin-section-list">{sections.map((section) => <div key={section.id} className={`admin-section-row ${section.id === selected ? 'selected' : ''} ${section.is_archived ? 'archived' : ''}`}><button className="section-select" onClick={() => setSelected(section.id)}><BookOpen size={16}/><span>{section.name}<small>{section.is_archived ? 'ARCHIVED' : `${section.post_count} POSTS`}</small></span></button><div className="section-actions"><button onClick={() => void renameSection(section)} title="Rename folder">✎</button><button onClick={() => void archiveSection(section)} title={section.is_archived ? 'Restore folder' : 'Archive folder'}>{section.is_archived ? <Check size={14}/> : <X size={14}/>}</button></div></div>)}{sections.length === 0 && <div className="admin-section-empty">Your first study folder can start here.</div>}</div></aside><section className="admin-study-room"><header className="admin-study-room-head"><span className="admin-room-icon">#</span><div><strong>{current?.name ?? 'Choose a folder'}</strong><span>{current?.is_archived ? 'Archived · members cannot see this section' : 'Read-only for members · live updates'}</span></div><span className={`admin-room-status ${current?.is_archived ? 'offline' : liveState !== 'live' ? 'offline' : ''}`}><i/>{current?.is_archived ? 'ARCHIVED' : liveState === 'live' ? 'LIVE' : 'CONNECTING'}</span></header><div className="admin-post-stream">{posts.length ? posts.map((post) => <article className="admin-study-post" key={post.id}><div className="admin-study-post-top"><div><span className="admin-study-avatar">a.</span><b>#{post.author_username}</b><time>{new Date(`${post.created_at.replace(' ', 'T')}Z`).toLocaleString()}</time></div><div><button onClick={() => { setEditing(post.id); setEditBody(post.body); }} title="Edit note"><FileText size={15}/></button><button onClick={() => void deletePost(post)} title="Delete note"><Trash2 size={15}/></button></div></div>{editing === post.id ? <div className="edit-post-form"><textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={5000}/><div><button onClick={() => setEditing('')}>Cancel</button><button className="mini-primary" disabled={busy} onClick={() => void savePost(post)}>Save changes</button></div></div> : post.body && <p className="admin-post-body">{post.body}</p>}{post.attachments.map((file) => <div className="admin-post-file" key={file.id}><FileText size={16}/><span><b>{file.fileName}</b><small>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · {file.contentType}</small></span><button className="admin-file-action" onClick={() => void openFile(file)} disabled={busyFile === file.id} title={file.contentType.startsWith('image/') || file.contentType === 'application/pdf' ? 'Preview file' : 'Download file'} aria-label={`${file.contentType.startsWith('image/') || file.contentType === 'application/pdf' ? 'Preview' : 'Download'} ${file.fileName}`}>{busyFile === file.id ? <LoaderCircle className="spin" size={15}/> : <>{file.contentType.startsWith('image/') || file.contentType === 'application/pdf' ? 'Preview' : 'Download'} <ArrowDownToLine size={15}/></>}</button></div>)}</article>) : <div className="admin-stream-empty"><BookOpen size={22}/><strong>{current ? 'A fresh page.' : 'Create a study folder.'}</strong><span>{current ? 'Share the first helpful note or file.' : 'Folders give your learning notes a home.'}</span></div>}{!!current && !current.is_archived && <form className="admin-compose" onSubmit={createPost}><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} placeholder="Write a study note, explanation, or helpful reminder…"/>{draftPostId && draftSectionId !== selected && <div className="admin-error inline">This unfinished note belongs to {sections.find((section) => section.id === draftSectionId)?.name ?? 'another folder'}. Select that folder to continue it.</div>}<div className="admin-compose-foot"><label className="admin-file-picker" htmlFor="study-admin-files"><Upload size={16}/> Attach files</label><input id="study-admin-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={(event) => setFiles(Array.from(event.target.files ?? []))}/>{files.length > 0 && <span className="selected-file-count">{files.length} file{files.length === 1 ? '' : 's'} selected</span>}<button className="admin-post-button" disabled={busy || (!body.trim() && files.length === 0) || (!!draftPostId && draftSectionId !== selected)}>{busy ? <LoaderCircle className="spin" size={16}/> : <>Post to section <ArrowUpRight size={16}/></>}</button></div></form>}{current?.is_archived && <div className="archived-hint">Restore this folder before adding or changing posts.</div>}</div></section></div>{preview && <div className="admin-file-preview-backdrop" onClick={() => setPreview(null)}><section className="admin-file-preview" role="dialog" aria-modal="true" aria-label={preview.name} onClick={(event) => event.stopPropagation()}><header><strong>{preview.name}</strong><button onClick={() => setPreview(null)} aria-label="Close file preview"><X size={19}/></button></header>{preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name}/> : <iframe title={preview.name} src={preview.url}/>}</section></div>}</div>;
}
