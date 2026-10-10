import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Bell, Check, ChevronLeft, ChevronRight, LoaderCircle, LogOut, RefreshCw, Search, Send, Shield, ShieldAlert, ShieldCheck, Users } from 'lucide-react';

type AdminUser = { id: string; username: string; name: string; gender: 'male' | 'female'; role: 'member' | 'admin'; is_suspended: number; created_at: string };
type Page = 'members' | 'notifications';
type Campaign = { id: string; title: string; body: string; audience: 'all' | 'male' | 'female'; status: 'queued' | 'sending' | 'completed' | 'failed'; target_count: number; sent_count: number; expired_count: number; failed_count: number; skipped_count: number; pending_count: number; created_at: string };

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
  if (authState === 'signed-out') return <main className="admin-auth-shell"><section className="admin-auth-card"><a className="admin-brand" href="https://student-addit.pages.dev"><span className="admin-brand-mark">a.</span> adda<span>.</span></a><div className="admin-kicker">A SMALL SPACE, WELL LOOKED AFTER</div><h1>Admin <i>studio.</i></h1><p>Sign in with your existing adda ID to manage members and send notifications.</p><form onSubmit={login}><label>ADDA ID<input name="username" autoComplete="username" required placeholder="your adda ID"/></label><label>PASSWORD<input name="password" type="password" autoComplete="current-password" required placeholder="Your password"/></label>{error && <div className="admin-error">{error}</div>}{token && error && <button type="button" className="admin-link-button" onClick={() => { setError(''); setAuthState('loading'); void verifyAdmin(token); }}>Retry saved session</button>}<button className="admin-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <>Sign in <ArrowUpRight size={17}/></>}</button></form><small>Admin roles are checked by the Cloudflare Worker on every action.</small></section></main>;
  if (authState === 'claim') return <main className="admin-auth-shell"><section className="admin-auth-card"><a className="admin-brand" href="https://student-addit.pages.dev"><span className="admin-brand-mark">a.</span> adda<span>.</span></a><div className="admin-kicker">FIRST ADMIN SETUP</div><h1>Make this <i>official.</i></h1><p>This account is signed in but has no admin role yet. Enter the one-time setup secret configured in Cloudflare.</p><form onSubmit={claim}><label>ONE-TIME SETUP SECRET<input name="secret" autoComplete="off" type="password" required placeholder="Cloudflare bootstrap secret"/></label>{error && <div className="admin-error">{error}</div>}<button className="admin-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <>Claim first admin <ShieldCheck size={17}/></>}</button></form><button className="admin-link-button" onClick={signOut}>Sign out</button></section></main>;

  const pageName = page === 'members' ? 'MEMBER DIRECTORY' : 'PUSH NOTIFICATIONS';
  return <main className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="https://student-addit.pages.dev"><span className="admin-brand-mark">a.</span> adda<span>.</span></a><div className="admin-rail-title">ADMIN STUDIO</div><nav><button className={page === 'members' ? 'active' : ''} onClick={() => setPage('members')}><Users size={18}/> Members</button><button className={page === 'notifications' ? 'active' : ''} onClick={() => setPage('notifications')}><Bell size={18}/> Notifications</button></nav><div className="admin-sidebar-foot"><span><i/> ADMIN ACCESS</span><small>People first. Details private.</small></div></aside><section className="admin-main"><header className="admin-topbar"><div><span>ADDA / ADMIN</span><b>{LOCAL_ADMIN_TEST ? 'LOCAL TEST MODE' : pageName}</b></div><button className="admin-signout" onClick={signOut}><LogOut size={16}/>{LOCAL_ADMIN_TEST ? 'Reset local test' : 'Sign out'}</button></header>{page === 'members' ? <Members token={token} currentUserId={userId}/> : <NotificationsAdmin token={token}/>}</section></main>;
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
