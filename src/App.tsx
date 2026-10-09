import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, BadgeCheck, Bell, BellOff, BookOpen, Check, ChevronDown, CircleHelp, Gamepad2, Hash, LoaderCircle, LogOut, MessageSquareText, MoveRight, Radio, RefreshCw, Send, Settings2, Sparkles, Users, X } from 'lucide-react';
import { InstallAppButton, usePwaInstall } from './PwaInstall';
import './studies.css';

type User = { id: string; name: string; username: string; gender: 'male' | 'female'; isAdmin?: boolean };
type Msg = { id: string; username: string; mine: boolean; body: string; created_at: string };
type SideQuestAnswer = { id: string; body: string; created_at: string; mine: boolean };
type SideQuest = { id: string; question: string; created_at: string; answer_count: number; answers: SideQuestAnswer[] };
type Tab = 'lobby' | 'game' | 'random' | 'studies' | 'polls' | 'profile';
const isAddaPagesDomain = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev');
const API_ORIGIN = isAddaPagesDomain ? 'https://student-addit.mgp899123.workers.dev' : '';
const API = `${API_ORIGIN}/api`;
const WS_ORIGIN = API_ORIGIN ? API_ORIGIN.replace(/^http/, 'ws') : `${location.protocol}//${location.host}`;

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Something went wrong.') as Error & { status: number }; error.status = response.status; throw error; }
  return data as T;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('adda-token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready' | 'error'>(() => localStorage.getItem('adda-token') ? 'checking' : 'ready');
  const [authError, setAuthError] = useState(''); const [authRetry, setAuthRetry] = useState(0);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [tab, setTab] = useState<Tab>('lobby');
  const [toast, setToast] = useState('');
  const pwa = usePwaInstall();
  const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: '2-digit' }).format(new Date()).toUpperCase();

  useEffect(() => {
    if (!token) { setUser(null); setAuthStatus('ready'); setAuthError(''); return; }
    let cancelled = false; setAuthStatus('checking'); setAuthError('');
    api<{ user: User }>('/me', token).then(({ user: next }) => { if (!cancelled) { setUser(next); setAuthStatus('ready'); } }).catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof Error && 'status' in error && error.status === 401) {
        localStorage.removeItem('adda-token'); setToken(''); setUser(null); setAuthStatus('ready');
      } else { setAuthStatus('error'); setAuthError('Could not check your sign-in right now. Your session is still saved on this device.'); }
    });
    return () => { cancelled = true; };
  }, [token, authRetry]);
  useEffect(() => {
    const handleNotificationClick = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_ADDA_HOME') setTab('lobby');
    };
    navigator.serviceWorker?.addEventListener('message', handleNotificationClick);
    return () => navigator.serviceWorker?.removeEventListener('message', handleNotificationClick);
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer); } }, [toast]);

  const login = (nextToken: string, nextUser: User) => { localStorage.setItem('adda-token', nextToken); setToken(nextToken); setUser(nextUser); setAuthStatus('ready'); setAuthError(''); setTab('lobby'); };
  const signOut = () => { const activeToken = token; localStorage.removeItem('adda-token'); setToken(''); setUser(null); setAuthMode('login'); setAuthStatus('ready'); void removeCurrentPushSubscription(activeToken).catch(() => {}); };

  if (!user && authStatus === 'checking') return <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#85877e', fontSize: 12 }}><LoaderCircle className="spin"/><span>Checking your adda sign-in…</span></main>;
  if (!user && authStatus === 'error') return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}><section className="auth-card"><div className="auth-kicker"><span className="kicker-dash"/>A QUICK RECONNECT</div><h1>Let’s get you<br/><i>back in.</i></h1><p className="auth-intro">{authError}</p><button className="primary-auth" onClick={() => setAuthRetry((value) => value + 1)}>Try again <ArrowRight size={17}/></button><button className="signup-cta" onClick={signOut}><span><small>SWITCH ACCOUNTS</small><strong>Sign out on this device</strong></span><ArrowUpRight size={18}/></button></section></main>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onLogin={login} installed={pwa.installed} onInstall={pwa.install} />;

  return <main className="app-shell">
    <aside className="side-rail">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setTab('lobby'); }}><span className="brand-mark">a.</span><span>adda<span className="brand-dot">.</span></span></a>
      <div className="rail-label">YOUR SPACE</div>
      <nav className="nav-list">
        <NavButton active={tab === 'lobby'} onClick={() => setTab('lobby')} icon={<MessageSquareText size={19} />} label="The adda" />
        <NavButton active={tab === 'game'} onClick={() => setTab('game')} icon={<Gamepad2 size={19} />} label="Games" />
        <NavButton active={tab === 'random'} onClick={() => setTab('random')} icon={<Radio size={19} />} label="Random chat" pill="LIVE" />
        <NavButton active={tab === 'studies'} onClick={() => setTab('studies')} icon={<BookOpen size={19} />} label="Studies" />
        <NavButton active={tab === 'polls'} onClick={() => setTab('polls')} icon={<CircleHelp size={19} />} label="Polls" />
      </nav>
      <div className="rail-bottom">
        <div className="mini-user"><div className="avatar">{user.username[0]?.toUpperCase()}</div><div className="mini-user-copy"><strong>#{user.username}</strong><span>your little corner</span></div><button className="icon-button" title="Open profile" onClick={() => setTab('profile')}><Settings2 size={17} /></button></div>
        <div className="made-here"><span className="cloud-icon">☁</span><span>made for <b>your adda</b></span><span className="status-dot" /></div>
      </div>
    </aside>
    <section className="main-column">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark">a.</span> adda<span className="brand-dot">.</span></div><div className="breadcrumb"><span>YOUR SPACE</span><MoveRight size={14} /><strong>{tab === 'lobby' ? 'THE ADDA' : tab === 'game' ? 'GAMES' : tab === 'random' ? 'RANDOM CHAT' : tab === 'studies' ? 'STUDIES' : tab === 'polls' ? 'POLLS' : 'YOUR PROFILE'}</strong></div><div className="topbar-actions">{!pwa.installed && <InstallAppButton onInstall={pwa.install} compact/>}<button className="top-id" onClick={() => setTab('profile')}><span className="online-dot" /> #{user.username}<ChevronDown size={14} /></button></div></header>
      {tab === 'lobby' && <Lobby token={token} setTab={setTab} />}
      {tab === 'game' && <Game token={token} />}
      {tab === 'random' && <RandomChat token={token} />}
      {tab === 'studies' && <Studies token={token} />}
      {tab === 'polls' && <Polls token={token} />}
      {tab === 'profile' && <Profile user={user} token={token} onUser={setUser} onSignOut={signOut} notify={setToast} installed={pwa.installed} onInstall={pwa.install} />}
    </section>
    <aside className="right-column"><div className="today-card"><div className="today-head"><span>{today}</span><Sparkles size={17} /></div><div className="today-title">A good day<br />to say <i>hello.</i></div><div className="today-foot"><span className="online-dot" /> your people are one message away</div></div><div className="note-card"><span className="note-pin">✳</span><span className="eyebrow">A LITTLE REMINDER</span><p>Be kind. Stay curious. Keep it <em>adda.</em></p><div className="note-line" /></div><div className="right-quote"><div className="quote-mark">“</div><p>Somewhere, someone is having a day just like yours.</p><span>GO ON, SAY HI</span></div><div className="side-bottom"><span>BUILT FOR GOOD CONVERSATIONS</span><span>01 — 05</span></div></aside>
    <NotificationOptInPrompt userId={user.id} token={token} installed={pwa.installed} onInstall={pwa.install}/>
    {toast && <div className="toast"><BadgeCheck size={17} />{toast}</div>}
  </main>;
}

function NavButton({ active, onClick, icon, label, pill }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; pill?: string }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{pill && <span className="nav-pill">{pill}</span>}{active && <span className="nav-arrow">↗</span>}</button>;
}

function AuthScreen({ mode, setMode, onLogin, installed, onInstall }: { mode: 'login' | 'signup' | 'forgot'; setMode: (m: 'login' | 'signup' | 'forgot') => void; onLogin: (t: string, u: User) => void; installed: boolean; onInstall: () => void }) {
  const [name, setName] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [question, setQuestion] = useState('Who is your best enemy?'); const [answer, setAnswer] = useState(''); const [knownQuestion, setKnownQuestion] = useState(''); const [step, setStep] = useState<'identify' | 'answer'>('identify');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'signup') {
        if (!gender) throw new Error('Choose the gender that fits you before you join.');
        if (password !== confirm) throw new Error('Those passwords don’t match yet.');
        const data = await api<{ token: string; user: User }>('/auth/register', undefined, { method: 'POST', body: JSON.stringify({ name, password, question, answer, gender }) });
        onLogin(data.token, data.user);
      } else {
        const data = await api<{ token: string; user: User }>('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ username, password }) });
        onLogin(data.token, data.user);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  const findAccount = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const data = await api<{ question: string }>('/auth/recovery-question', undefined, { method: 'POST', body: JSON.stringify({ username }) }); setKnownQuestion(data.question); setStep('answer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not find that account.'); } finally { setBusy(false); }
  };
  const resetPassword = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await api('/auth/reset-password', undefined, { method: 'POST', body: JSON.stringify({ username, answer, password }) }); setMode('login'); setStep('identify'); setPassword(''); setAnswer(''); setError('Password updated — sign in with your new one.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not reset your password.'); } finally { setBusy(false); }
  };

  const signup = mode === 'signup'; const forgot = mode === 'forgot';
  return <main className="auth-shell"><div className="auth-left"><div className="auth-top"><a href="#" className="brand"><span className="brand-mark">a.</span><span>adda<span className="brand-dot">.</span></span></a><span className="auth-coord">EST. YOURS, ALWAYS&nbsp; · &nbsp;001</span></div><div className="auth-art"><div className="art-sun"/><div className="art-circle art-circle-one"/><div className="art-circle art-circle-two"/><div className="art-label label-one">NO. 01&nbsp; / &nbsp;EVERYONE’S INVITED</div><div className="art-big">Your people.<br />Your <i>place.</i></div><div className="art-caption">A little corner of the internet<br />that feels like yours.</div><div className="art-ticket"><span>GOOD VIBES<br />ONLY, PLEASE</span><span className="ticket-star">✳</span></div></div><div className="auth-left-foot"><span>01 / A PLACE TO BELONG</span><span>SCROLL LESS. CONNECT MORE.</span></div></div>
    <div className="auth-right"><div className="auth-card"><div className="auth-kicker"><span className="kicker-dash"/>{signup ? 'COME ON IN' : forgot ? 'WE’LL GET YOU BACK' : 'GOOD TO SEE YOU'}</div><h1>{signup ? <>Make yourself<br /><i>at home.</i></> : forgot ? <>Forgot your<br /><i>password?</i></> : <>You’re right<br /><i>where you belong.</i></>}</h1><p className="auth-intro">{signup ? 'Set up your little corner. It takes a minute.' : forgot ? 'A couple of quick things and you’re back in.' : 'Your people are here. Pick up where you left off.'}</p>{!installed && <InstallAppButton onInstall={onInstall} />}
      {signup ? <form onSubmit={submit} className="auth-form"><Field label="WHAT SHOULD WE CALL YOU?"><input required minLength={2} maxLength={48} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" /></Field><div className="field-row"><Field label="CHOOSE A PASSWORD"><input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></Field><Field label="ONE MORE TIME"><input required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" autoComplete="new-password" /></Field></div><Field label="I IDENTIFY AS"><div className="gender-options"><button type="button" className={gender === 'female' ? 'selected' : ''} onClick={() => setGender('female')}>Female</button><button type="button" className={gender === 'male' ? 'selected' : ''} onClick={() => setGender('male')}>Male</button></div></Field><div className="security-box"><div className="security-title"><CircleHelp size={16}/><span>JUST IN CASE, ONE SECRET QUESTION</span></div><Field label="YOUR QUESTION"><input required maxLength={120} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field><Field label="YOUR ANSWER"><input required minLength={2} maxLength={120} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Something only you know" /></Field><small>Keep your answer somewhere safe. We’ll use it to help you back in.</small></div><AuthError error={error}/><button className="primary-auth" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>Create my adda <ArrowUpRight size={18}/></>}</button></form> : forgot ? <div>{step === 'identify' ? <form onSubmit={findAccount} className="auth-form"><Field label="YOUR ADDA ID"><input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. sunnybird42" /></Field><AuthError error={error}/><button className="primary-auth" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>Find my account <ArrowRight size={18}/></>}</button></form> : <form onSubmit={resetPassword} className="auth-form"><div className="question-prompt"><span>YOUR SECRET QUESTION</span><strong>{knownQuestion}</strong></div><Field label="YOUR ANSWER"><input required value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" /></Field><Field label="A NEW PASSWORD"><input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></Field><AuthError error={error}/><button className="primary-auth" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>Set new password <ArrowUpRight size={18}/></>}</button></form>}</div> : <form onSubmit={submit} className="auth-form"><Field label="YOUR ADDA ID"><input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. sunnybird42" autoComplete="username" /></Field><Field label="PASSWORD"><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" /></Field><button className="forgot-link" type="button" onClick={() => { setMode('forgot'); setError(''); }}>Forgot your password? <ArrowUpRight size={13}/></button><AuthError error={error}/><button className="primary-auth" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>Let me in <ArrowRight size={18}/></>}</button></form>}
      {signup ? <div className="auth-switch"><span>Already have a little corner?</span><button onClick={() => { setMode('login'); setError(''); }}>Sign in <ArrowUpRight size={13}/></button></div> : forgot ? <div className="auth-switch"><span>Remembered your password?</span><button onClick={() => { setMode('login'); setError(''); }}>Sign in <ArrowUpRight size={13}/></button></div> : <button className="signup-cta" onClick={() => { setMode('signup'); setError(''); }}><span><small>NEW AROUND HERE?</small><strong>Create a new account</strong></span><ArrowUpRight size={20}/></button>}<div className="auth-legal">By being here, let’s keep it kind. <span>♡</span></div></div><div className="auth-aside-tag">A SMALL SPACE WITH A BIG HEART <span>✳</span></div></div></main>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function AuthError({ error }: { error: string }) { return error ? <div className={`form-error ${error.startsWith('Password updated') ? 'form-success' : ''}`}>{error}</div> : null; }

function Lobby({ token, setTab }: { token: string; setTab: (tab: Tab) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]); const [peopleCount, setPeopleCount] = useState(0); const [value, setValue] = useState(''); const [socketState, setSocketState] = useState<'connecting' | 'open' | 'closed'>('connecting'); const [error, setError] = useState(''); const messageListRef = useRef<HTMLDivElement>(null); const socketRef = useRef<WebSocket | null>(null);
  const clearEpochRef = useRef(0); const messageEpochRef = useRef(0);
  const loadMessages = useCallback(async () => {
    const clearEpoch = clearEpochRef.current; const messageEpoch = messageEpochRef.current;
    try {
      const data = await api<{ messages: Msg[] }>('/chat/messages', token);
      if (clearEpoch === clearEpochRef.current) setMessages((current) => messageEpoch === messageEpochRef.current ? data.messages : mergeMessages(current, data.messages));
      setError('');
    } catch { setError('Could not load the adda yet.'); }
  }, [token]);
  useEffect(() => { void loadMessages(); api<{ count: number }>('/chat/people', token).then((d) => setPeopleCount(d.count)).catch(() => {}); }, [loadMessages, token]);
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let retryDelay = 1000;
    const connect = () => {
      if (stopped) return;
      setSocketState('connecting');
      const socket = new WebSocket(`${WS_ORIGIN}/api/ws/chat?token=${encodeURIComponent(token)}`); socketRef.current = socket;
      socket.onopen = () => { if (stopped || socketRef.current !== socket) return; retryDelay = 1000; setSocketState('open'); void loadMessages(); };
      socket.onclose = () => {
        if (stopped || socketRef.current !== socket) return;
        socketRef.current = null; setSocketState('closed');
        timer = setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 15000);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === 'message' && data.message?.id) { messageEpochRef.current += 1; setMessages((current) => mergeMessages(current, [data.message as Msg])); }
          if (data.type === 'cleared') { clearEpochRef.current += 1; messageEpochRef.current += 1; setMessages([]); }
        } catch { /* ignore malformed frame */ }
      };
    };
    connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); const socket = socketRef.current; socketRef.current = null; socket?.close(); };
  }, [loadMessages, token]);
  useEffect(() => { const list = messageListRef.current; if (list) list.scrollTop = list.scrollHeight; }, [messages]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, []);
  const send = (event: FormEvent) => { event.preventDefault(); const body = value.trim(); if (!body) return; if (socketRef.current?.readyState !== WebSocket.OPEN) { setError('The room connection is reconnecting. Please try again in a moment.'); return; } socketRef.current.send(JSON.stringify({ body })); setValue(''); setError(''); };
  return <div className="page-wrap lobby-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">01</span> THE MAIN ROOM</div><h1>Come say <i>something.</i></h1><p className="subhead">A room full of people, and all the time in the world.</p></div><button className="small-action" onClick={() => setTab('random')}><Radio size={16}/> Meet someone new <ArrowUpRight size={14}/></button></div><div className="lobby-layout"><section className="chat-panel"><div className="panel-head"><div className="room-symbol"><Hash size={20}/></div><div><strong>the-adda</strong><span>one room, all of us</span></div><span className="live-status"><span className={socketState === 'open' ? 'online-dot' : 'offline-dot'}/>{socketState === 'open' ? 'LIVE' : socketState.toUpperCase()}</span><button className="icon-button" title="Refresh messages" onClick={() => void loadMessages()}><RefreshCw size={16}/></button><span className="room-note">aids section 2</span></div><div className="message-list" ref={messageListRef}>{messages.length === 0 && <div className="empty-chat"><div className="empty-emoji">✳</div><strong>Well, this room’s all yours.</strong><span>Drop the first hello?</span></div>}{messages.map((message, index) => <div key={message.id || `${message.created_at}-${index}`} className={`message-row${message.mine ? ' mine' : ''}`}><div className="message-avatar">{message.mine ? 'Y' : '✳'}</div><div className="message-content"><div className="message-meta"><b>#{message.username || 'adda-member'}</b><time>{timeAgo(message.created_at)}</time></div><p>{message.body}</p></div></div>)}</div><form className="composer" onSubmit={send}><input value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} placeholder="Say something nice..." aria-label="Message"/><button disabled={!value.trim()} title="Send message"><Send size={18}/></button></form>{error && <div className="chat-error">{error}</div>}</section><div className="lobby-aside"><div className="online-card"><div className="card-title"><Users size={17}/> COMMUNITY <span>{peopleCount}</span></div><div className="people-list"><div className="person-row"><div className="person-avatar">✳</div><span>{peopleCount === 1 ? 'One member' : 'Community members'}</span></div></div><div className="people-note">Messages show adda IDs only. Real names stay private.</div></div><button className="random-card" onClick={() => setTab('random')}><div className="random-card-icon"><Radio size={21}/></div><span className="eyebrow">FEELING CURIOUS?</span><strong>Meet a stranger.<br/><i>Leave as friends.</i></strong><span className="random-card-link">TRY RANDOM CHAT <ArrowUpRight size={15}/></span><span className="random-decoration">✳</span></button><div className="values-card"><span className="values-icon">✿</span><div><b>Our tiny house rule</b><p>Leave people a little happier than you found them.</p></div></div></div></div><SideQuestSection token={token}/><div className="bottom-rule"><span>YOUR ADDA IS WAITING</span><span>AN OPEN ROOM FOR OPEN MINDS&nbsp; →</span></div></div>;
}

function mergeMessages(current: Msg[], incoming: Msg[]) {
  const byId = new Map(current.filter((message) => message.id).map((message) => [message.id, message]));
  for (const message of incoming) if (message?.id) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((left, right) => {
    const leftTime = Date.parse(left.created_at.replace(' ', 'T') + (left.created_at.includes('Z') ? '' : 'Z')) || 0;
    const rightTime = Date.parse(right.created_at.replace(' ', 'T') + (right.created_at.includes('Z') ? '' : 'Z')) || 0;
    return leftTime - rightTime || left.id.localeCompare(right.id);
  }).slice(-100);
}

function SideQuestSection({ token }: { token: string }) {
  const [quests, setQuests] = useState<SideQuest[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => { const data = await api<{ quests: SideQuest[] }>('/side-quests', token); setQuests(data.quests); setError(''); }, [token]);
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
  const saveAnswer = async (questId: string, answer: string) => {
    await api(`/side-quests/${encodeURIComponent(questId)}/answer`, token, { method: 'POST', body: JSON.stringify({ answer }) });
    await load();
  };
  return <section className="side-quests-section" aria-labelledby="side-quests-title">
    <header className="side-quests-heading"><div><span className="eyebrow"><Sparkles size={13}/> A LITTLE GROUP CHALLENGE</span><h2 id="side-quests-title">Conversation <i>side quests.</i></h2><p>Drop a thought, see what everyone else came up with.</p></div><span className="side-quests-count">{quests.length} LIVE</span></header>
    {error && <div className="side-quests-error" role="alert">{error}</div>}
    {quests.length === 0 ? <div className="side-quests-empty"><span>✳</span><strong>The next side quest is still being dreamed up.</strong><p>Check back soon for a tiny challenge from your admin.</p></div> : <div className="side-quests-grid">{quests.map((quest, index) => <SideQuestCard key={quest.id} quest={quest} index={index} onSubmit={saveAnswer}/>)}</div>}
  </section>;
}

function SideQuestCard({ quest, index, onSubmit }: { quest: SideQuest; index: number; onSubmit: (id: string, answer: string) => Promise<void> }) {
  const myAnswer = quest.answers.find((answer) => answer.mine);
  const [answer, setAnswer] = useState(myAnswer?.body ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => { setAnswer(myAnswer?.body ?? ''); }, [myAnswer?.body]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!answer.trim()) return;
    setBusy(true); setError(''); setSaved(false);
    try { await onSubmit(quest.id, answer.trim()); setSaved(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your answer.'); }
    finally { setBusy(false); }
  };
  return <article className="side-quest-card">
    <header><span className="side-quest-index">QUEST {String(index + 1).padStart(2, '0')}</span><span className="side-quest-live"><i/> LIVE</span></header>
    <h3>{quest.question}</h3>
    <div className="side-quest-answer-list"><div className="side-quest-answer-head"><span>THE ANSWER WALL</span><b>{quest.answer_count}</b></div>
      {quest.answers.length ? quest.answers.map((item) => <div className="side-quest-answer" key={item.id}><span className="side-quest-avatar">{item.mine ? 'Y' : '✳'}</span><div><span>{item.mine ? 'YOU' : 'MEMBER'} · {timeAgo(item.created_at)}</span><p>{item.body}</p></div></div>) : <p className="side-quest-no-answers">First answer gets bragging rights. Go on.</p>}
    </div>
    <form className="side-quest-composer" onSubmit={(event) => void submit(event)}><textarea value={answer} onChange={(event) => { setAnswer(event.target.value); setSaved(false); }} maxLength={1000} placeholder={myAnswer ? 'Tweak your answer...' : 'Add your answer to the wall...'} aria-label="Your side quest answer"/><div><span>{myAnswer ? 'EDIT YOUR ANSWER' : 'ONE ANSWER PER PERSON'}</span><button disabled={busy || !answer.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <>{myAnswer ? 'Update' : 'Add mine'} <ArrowUpRight size={14}/></>}</button></div></form>
    {error && <div className="side-quest-feedback error" role="alert">{error}</div>}{saved && <div className="side-quest-feedback" role="status">Your answer is on the wall.</div>}
  </article>;
}

type PollChoice = { id: string; label: string; votes: number };
type PollItem = { id: string; question: string; status: 'open' | 'closed'; created_at: string; total_votes: number; my_vote: string | null; options: PollChoice[] };

function Polls({ token }: { token: string }) {
  const [polls, setPolls] = useState<PollItem[]>([]); const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(async () => { const data = await api<{ polls: PollItem[] }>('/polls', token); setPolls(data.polls); setError(''); }, [token]);
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
  const vote = async (poll: PollItem) => {
    const optionId = answers[poll.id]; if (!optionId) return;
    setBusy(poll.id); setError('');
    try { await api(`/polls/${encodeURIComponent(poll.id)}/vote`, token, { method: 'POST', body: JSON.stringify({ optionId }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Your vote could not be saved.'); }
    finally { setBusy(''); }
  };
  return <div className="page-wrap polls-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">06</span> THE COMMUNITY VOTE</div><h1>What do <i>you think?</i></h1><p className="subhead">Share your choice and see where the adda lands.</p></div></div>
    {error && <div className="study-status">{error}</div>}
    {!polls.length ? <section className="studies-empty"><CircleHelp size={25}/><h2>No polls right now.</h2><p>When an admin opens a poll, it will show up here.</p></section> : <div className="poll-list">{polls.map((poll) => {
      const showResults = poll.status === 'closed' || !!poll.my_vote;
      return <article className="poll-card" key={poll.id}><header className="poll-card-head"><span className={`poll-status ${poll.status}`}><i/>{poll.status === 'open' ? 'OPEN' : 'CLOSED'}</span><span>{showResults ? `${poll.total_votes} ${poll.total_votes === 1 ? 'vote' : 'votes'}` : 'Vote to see results'}</span></header><h2>{poll.question}</h2>
        <div className="poll-options">{poll.options.map((option) => {
          const selected = poll.my_vote === option.id;
          const percent = poll.total_votes ? Math.round(option.votes * 100 / poll.total_votes) : 0;
          return <label className={`poll-option ${showResults ? 'show-results' : ''} ${selected ? 'selected' : ''}`} key={option.id}>
            {!poll.my_vote && poll.status === 'open' && <input type="radio" name={`poll-${poll.id}`} value={option.id} checked={answers[poll.id] === option.id} onChange={() => setAnswers((current) => ({ ...current, [poll.id]: option.id }))}/>}
            <span className="poll-option-label">{option.label}</span>
            {showResults && <><span className="poll-option-count">{percent}% · {option.votes}</span><span className="poll-result-track"><i style={{ width: `${percent}%` }}/></span></>}
          </label>;
        })}</div>
        {poll.status === 'open' && !poll.my_vote ? <button className="poll-vote-button" disabled={!answers[poll.id] || busy === poll.id} onClick={() => void vote(poll)}>{busy === poll.id ? <LoaderCircle className="spin" size={16}/> : <>Cast my vote <ArrowUpRight size={16}/></>}</button> : <p className="poll-vote-note">{poll.status === 'closed' ? 'This poll is closed.' : <><Check size={14}/> Your vote is in. Thanks for weighing in.</>}</p>}
      </article>;
    })}</div>}
  </div>;
}

type StudySection = { id: string; name: string; is_archived: number; post_count: number };
type StudyAttachment = { id: string; fileName: string; contentType: string; sizeBytes: number; url: string };
type StudyPost = { id: string; body: string; author_username: string; created_at: string; attachments: StudyAttachment[] };

function Studies({ token }: { token: string }) {
  const [sections, setSections] = useState<StudySection[]>([]); const [selected, setSelected] = useState(''); const [posts, setPosts] = useState<StudyPost[]>([]); const [status, setStatus] = useState(''); const [preview, setPreview] = useState<{ url: string; name: string; type: string } | null>(null); const [busyFile, setBusyFile] = useState(''); const [liveState, setLiveState] = useState<'connecting' | 'live'>('connecting');
  const postRequestRef = useRef(0);
  const loadSections = useCallback(async () => { const data = await api<{ sections: StudySection[] }>('/studies/sections', token); setSections(data.sections); setSelected((current) => data.sections.some((item) => item.id === current) ? current : data.sections[0]?.id ?? ''); }, [token]);
  const loadPosts = useCallback(async () => { const requestId = ++postRequestRef.current; if (!selected) { setPosts([]); return; } const data = await api<{ posts: StudyPost[] }>(`/studies/sections/${encodeURIComponent(selected)}/posts`, token); if (requestId === postRequestRef.current) setPosts(data.posts); }, [selected, token]);
  useEffect(() => { loadSections().catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load Studies.')); }, [loadSections]);
  useEffect(() => { loadPosts().catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load this section.')); }, [loadPosts]);
  useEffect(() => {
    if (!selected) return;
    let stopped = false; let socket: WebSocket | null = null; let timer: ReturnType<typeof setTimeout> | undefined; setLiveState('connecting');
    const connect = async () => {
      try {
        const { ticket } = await api<{ ticket: string }>('/studies/ws-ticket', token, { method: 'POST', body: JSON.stringify({ sectionId: selected }) });
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
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  const openAttachment = async (file: StudyAttachment) => {
    setBusyFile(file.id); setStatus('');
    try {
      const response = await fetch(`${API_ORIGIN}${file.url}`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('This study file could not be opened.');
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const downloadPdfOnMobile = file.contentType === 'application/pdf' && window.matchMedia('(max-width: 600px)').matches;
      if (file.contentType.startsWith('image/') || (file.contentType === 'application/pdf' && !downloadPdfOnMobile)) setPreview({ url, name: file.fileName, type: file.contentType });
      else {
        const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.rel = 'noopener'; link.style.display = 'none';
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
        if (downloadPdfOnMobile) setStatus(`Downloading ${file.fileName}.`);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not open this file.'); }
    finally { setBusyFile(''); }
  };
  return <div className="page-wrap studies-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">05</span> A QUIET PLACE TO LEARN</div><h1>Study <i>together.</i></h1><p className="subhead">Notes, files, and useful things from your people.</p></div></div>
    {!sections.length ? <section className="studies-empty"><BookOpen size={25}/><h2>The shelves are waiting.</h2><p>Study materials will appear here when an admin creates a section.</p></section> : <div className="studies-layout"><aside className="studies-sections"><span className="eyebrow">YOUR STUDY SECTIONS</span>{sections.map((section) => <button key={section.id} className={`study-section-button ${selected === section.id ? 'selected' : ''}`} onClick={() => setSelected(section.id)}><BookOpen size={17}/><span>{section.name}</span><small>{section.post_count}</small></button>)}</aside><section className="studies-feed"><div className="studies-feed-head"><div className="study-hash">#</div><div><strong>{sections.find((section) => section.id === selected)?.name}</strong><span>Admin updates · members read along</span></div><span className={`studies-live ${liveState === 'live' ? '' : 'reconnecting'}`}><i/> {liveState === 'live' ? 'LIVE' : 'CONNECTING'}</span></div><div className="studies-posts">{posts.length === 0 ? <div className="studies-empty-inline"><span>✳</span><strong>Nothing here just yet.</strong><p>When a new study note arrives, it will show up here.</p></div> : posts.map((post) => <article className="study-post" key={post.id}><div className="study-post-meta"><span className="study-admin-avatar">a.</span><div><b>#{post.author_username}</b><time>{timeAgo(post.created_at)}</time></div><span className="study-admin-label">STUDY NOTE</span></div>{post.body && <p className="study-post-body">{post.body}</p>}{!!post.attachments.length && <div className="study-attachments">{post.attachments.map((file) => <div className="study-attachment" key={file.id}><span className="study-file-icon">{file.contentType === 'application/pdf' ? 'PDF' : file.contentType.startsWith('image/') ? 'IMG' : 'DOC'}</span><span className="study-file-copy"><b>{file.fileName}</b><small>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></span><button className={file.contentType === 'application/pdf' ? 'study-pdf-action' : ''} onClick={() => void openAttachment(file)} disabled={busyFile === file.id}>{busyFile === file.id ? 'Opening…' : file.contentType === 'application/pdf' ? <><span className="study-preview-label">Preview</span><span className="study-download-label">Download</span></> : file.contentType.startsWith('image/') ? 'Preview' : 'Download'} <ArrowUpRight size={14}/></button></div>)}</div>}</article>)}<div className="study-read-only"><BookOpen size={15}/> Only admins can post in Studies. You’re here to read and learn.</div></div></section></div>}
    {status && <div className="study-status">{status}</div>}{preview && <div className="study-preview-backdrop" onClick={() => setPreview(null)}><section className="study-preview" onClick={(event) => event.stopPropagation()}><header><strong>{preview.name}</strong><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={18}/></button></header>{preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name}/> : <iframe title={preview.name} src={preview.url}/>}</section></div>}
  </div>;
}

function timeAgo(value: string) { const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')); if (Number.isNaN(date.getTime())) return 'just now'; const min = Math.floor((Date.now() - date.getTime()) / 60000); return min < 1 ? 'just now' : min < 60 ? `${min}m ago` : `${Math.floor(min / 60)}h ago`; }

function RandomChat({ token }: { token: string }) {
  type ChatState = 'idle' | 'waiting' | 'matched' | 'reconnecting' | 'partner-reconnecting' | 'ended' | 'timeout';
  type Action = 'search' | 'resume' | 'next';
  const [state, setState] = useState<ChatState>('idle'); const stateRef = useRef<ChatState>('idle');
  const [messages, setMessages] = useState<{ body: string; mine: boolean; time: string }[]>([]); const [value, setValue] = useState(''); const [chatError, setChatError] = useState(''); const [secondsLeft, setSecondsLeft] = useState(20); const [recoverySeconds, setRecoverySeconds] = useState(10);
  const socketRef = useRef<WebSocket | null>(null); const timerRef = useRef<ReturnType<typeof setInterval> | null>(null); const recoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchingRef = useRef(false); const matchIdRef = useRef(''); const recoveryDeadlineRef = useRef(0); const retryAttemptRef = useRef(0); const intentionalSocketsRef = useRef(new WeakSet<WebSocket>()); const endRef = useRef<HTMLDivElement>(null);
  const matchStorageKey = 'adda-random-match';
  const setChatState = (next: ChatState) => { stateRef.current = next; setState(next); };
  const clearSearchTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
  const clearRecoveryTimers = () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); retryTimerRef.current = null; if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current); recoveryTimerRef.current = null; };
  const clearMatch = () => { matchIdRef.current = ''; recoveryDeadlineRef.current = 0; sessionStorage.removeItem(matchStorageKey); clearRecoveryTimers(); };
  useEffect(() => {
    const savedMatch = sessionStorage.getItem(matchStorageKey);
    if (savedMatch) { matchIdRef.current = savedMatch; recoveryDeadlineRef.current = Date.now() + 10_000; setChatState('reconnecting'); setMessages([]); }
    return () => { clearSearchTimer(); clearRecoveryTimers(); if (socketRef.current) { intentionalSocketsRef.current.add(socketRef.current); socketRef.current.close(); socketRef.current = null; } };
    // This connection is scoped to the signed-in Random Chat view. A saved match can
    // only be resumed by the same authenticated account at the Worker.
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const scheduleResume = () => {
    if (!matchIdRef.current || retryTimerRef.current || stateRef.current === 'ended') return;
    const remaining = recoveryDeadlineRef.current - Date.now();
    if (remaining <= 0) { clearMatch(); setChatState('ended'); setChatError('The 10-second reconnect window closed. Find someone new to continue.'); return; }
    const delays = [500, 1000, 2000, 3000]; const wait = Math.min(delays[Math.min(retryAttemptRef.current, delays.length - 1)], remaining);
    retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; connect('resume', matchIdRef.current, false); }, wait);
  };

  const connect = (action: Action, requestedMatchId = '', resetConversation = true) => {
    clearSearchTimer();
    if (action !== 'resume') clearRecoveryTimers();
    if (resetConversation) { setMessages([]); setValue(''); }
    setChatError('');
    searchingRef.current = action !== 'resume';
    if (action === 'search' || action === 'next') { setSecondsLeft(20); setChatState('waiting'); }
    else setChatState('reconnecting');
    const query = new URLSearchParams({ token, action });
    if (requestedMatchId) query.set('matchId', requestedMatchId);
    const socket = new WebSocket(`${WS_ORIGIN}/api/ws/random?${query.toString()}`);
    socketRef.current = socket;
    if (action === 'search' || action === 'next') {
      timerRef.current = setInterval(() => setSecondsLeft((remaining) => {
        if (remaining <= 1) {
          clearSearchTimer();
          if (socketRef.current === socket && searchingRef.current) { searchingRef.current = false; socketRef.current = null; intentionalSocketsRef.current.add(socket); socket.close(1000, 'Search timed out'); setChatState('timeout'); }
          return 0;
        }
        return remaining - 1;
      }), 1000);
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; body?: string; created_at?: string; matchId?: string; resumed?: boolean; partnerOnline?: boolean; remainingMs?: number };
        if (data.type === 'waiting') { searchingRef.current = true; setChatState('waiting'); return; }
        if (data.type === 'matched') {
          searchingRef.current = false; clearSearchTimer();
          const matchId = data.matchId || requestedMatchId;
          if (matchId) { matchIdRef.current = matchId; sessionStorage.setItem(matchStorageKey, matchId); }
          if (data.partnerOnline === false) {
            recoveryDeadlineRef.current = Date.now() + Math.max(0, data.remainingMs ?? 10_000); setChatState('partner-reconnecting');
          } else { clearRecoveryTimers(); recoveryDeadlineRef.current = 0; retryAttemptRef.current = 0; setChatState('matched'); }
          return;
        }
        if (data.type === 'match-resumed') { clearRecoveryTimers(); recoveryDeadlineRef.current = 0; retryAttemptRef.current = 0; setChatState('matched'); setChatError(''); return; }
        if (data.type === 'partner-reconnecting') {
          recoveryDeadlineRef.current = Date.now() + Math.max(0, data.remainingMs ?? 10_000); setChatState('partner-reconnecting');
          setRecoverySeconds(Math.ceil(Math.max(0, data.remainingMs ?? 10_000) / 1000));
          if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
          recoveryTimerRef.current = setInterval(() => {
            const left = Math.max(0, recoveryDeadlineRef.current - Date.now()); setRecoverySeconds(Math.ceil(left / 1000));
            if (left <= 0 && recoveryTimerRef.current) { clearInterval(recoveryTimerRef.current); recoveryTimerRef.current = null; }
          }, 250);
          return;
        }
        if (data.type === 'message' && typeof data.body === 'string') { setMessages((prev) => [...prev, { body: data.body!, mine: false, time: data.created_at || new Date().toISOString() }]); return; }
        if (data.type === 'paused') { setChatState('partner-reconnecting'); setChatError('Messages are paused while your partner reconnects.'); return; }
        if (data.type === 'partner-left' || data.type === 'session-ended' || data.type === 'session-expired') {
          clearMatch(); searchingRef.current = false; clearSearchTimer(); setChatState('ended');
          if (data.type === 'session-expired') setChatError('The reconnect window ended. Find someone new to continue.');
          if (socketRef.current === socket) { socketRef.current = null; intentionalSocketsRef.current.add(socket); socket.close(1000, 'Chat ended'); }
          return;
        }
        if (data.type === 'already-active' || data.type === 'already-searching' || data.type === 'connection-error') {
          clearMatch(); searchingRef.current = false; clearSearchTimer(); setChatState('ended'); setChatError(data.type === 'already-active' ? 'This account already has a Random Chat open in another tab.' : data.type === 'already-searching' ? 'This account is already searching in another tab.' : 'Could not connect. Please try again.');
        }
      } catch { /* Ignore malformed socket messages. */ }
    };
    socket.onerror = () => { /* onclose performs bounded recovery. */ };
    socket.onclose = () => {
      if (socketRef.current !== socket || intentionalSocketsRef.current.has(socket)) return;
      socketRef.current = null;
      if (searchingRef.current) { searchingRef.current = false; clearSearchTimer(); setChatState('ended'); setChatError('The search connection ended. Please try again.'); return; }
      if (matchIdRef.current && (stateRef.current === 'matched' || stateRef.current === 'reconnecting' || stateRef.current === 'partner-reconnecting')) {
        if (!recoveryDeadlineRef.current) recoveryDeadlineRef.current = Date.now() + 10_000;
        setChatState('reconnecting'); scheduleResume();
      }
    };
  };

  useEffect(() => {
    if (stateRef.current === 'reconnecting' && matchIdRef.current && !socketRef.current) scheduleResume();
  }, [token]);
  const start = () => connect('search');
  const next = () => {
    const matchId = matchIdRef.current;
    if (!matchId) { start(); return; }
    connect('next', matchId);
  };
  const leave = () => {
    const socket = socketRef.current; socketRef.current = null;
    if (socket) intentionalSocketsRef.current.add(socket);
    const matchId = matchIdRef.current;
    searchingRef.current = false; clearSearchTimer(); clearMatch(); setChatState('idle'); setMessages([]); setValue(''); setChatError('');
    void api('/random/leave', token, { method: 'POST', body: JSON.stringify({ matchId }) }).finally(() => { try { socket?.close(1000, 'Left chat'); } catch { /* already closed */ } });
  };
  const send = (e: FormEvent) => {
    e.preventDefault(); const body = value.trim(); if (!body || state !== 'matched') return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { setChatError('That chat connection ended. Reconnecting…'); if (matchIdRef.current) { setChatState('reconnecting'); scheduleResume(); } else setChatState('ended'); return; }
    try { socket.send(JSON.stringify({ body })); setMessages((prev) => [...prev, { body, mine: true, time: new Date().toISOString() }]); setValue(''); setChatError(''); }
    catch { setChatError('Your message could not be sent. Please try again.'); }
  };
  const canChat = state === 'matched' && socketRef.current?.readyState === WebSocket.OPEN;
  const stateTitle = state === 'matched' ? 'A stranger just said hello.' : state === 'waiting' ? 'Looking for your person.' : state === 'reconnecting' ? 'Reconnecting your chat.' : state === 'partner-reconnecting' ? 'Your person is reconnecting.' : state === 'ended' ? 'That was a nice little moment.' : state === 'timeout' ? 'No match just yet.' : 'Someone new is out there.';
  const statusLabel = state === 'matched' ? 'CONNECTED' : state === 'waiting' ? `SEARCHING · ${secondsLeft}s` : state === 'reconnecting' || state === 'partner-reconnecting' ? `RECOVERING · ${recoverySeconds}s` : state === 'timeout' ? 'SEARCH ENDED' : 'ANONYMOUS';
  return <div className="page-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">03</span> TWO STRANGERS, ONE CHAT</div><h1>Serendipity, <i>on tap.</i></h1><p className="subhead">No names, no IDs, no expectations. Just a conversation.</p></div></div><div className="random-layout"><section className="random-main"><div className="random-chat-head"><div className="random-spark">✳</div><div><span className="eyebrow">THE OTHER SIDE OF THE SCREEN</span><h2>{stateTitle}</h2></div><div className={`anon-indicator ${state}`}><span/>{statusLabel}</div></div><div className={`random-messages ${state === 'idle' ? 'is-idle' : ''}`}>{state === 'idle' && <div className="random-intro"><div className="anon-big">?</div><strong>Two clicks can make a new story.</strong><p>We’ll find someone else who’s also ready to chat. Your ID stays private; the conversation stays between you two.</p><span>BE KIND. BE CURIOUS. BE YOU.</span></div>}{state === 'waiting' && <div className="searching-state"><div className="search-orbit"><span/><span/><span/></div><strong>Finding your person...</strong><span>{secondsLeft} seconds left to find someone.</span></div>}{(state === 'reconnecting' || state === 'partner-reconnecting') && <div className="searching-state recovery-state"><div className="search-orbit"><span/><span/><span/></div><strong>{state === 'reconnecting' ? 'Restoring the connection…' : 'Your chat is paused for a moment.'}</strong><span>{state === 'reconnecting' ? `Trying again for ${recoverySeconds} seconds.` : `Both chat boxes stay paused for ${recoverySeconds} more seconds.`}</span></div>}{state === 'ended' && <div className="ended-state"><span>✳</span><strong>Your chat has ended.</strong><p>Good chats don’t need names to matter.</p><button onClick={start}>Find someone else <ArrowRight size={15}/></button></div>}{state === 'timeout' && <div className="ended-state"><span>⌛</span><strong>Search ended after 20 seconds.</strong><p>No one was available this time. You can start a new search whenever you like.</p><button onClick={start}>Try again <ArrowRight size={15}/></button></div>}{messages.map((message, i) => <div className={`random-message ${message.mine ? 'mine' : ''}`} key={`${i}-${message.time}`}><div className="anon-mini">{message.mine ? 'Y' : '?'}</div><div className="random-message-body"><span>{message.mine ? 'YOU' : 'STRANGER'} · {timeAgo(message.time)}</span><p>{message.body}</p></div></div>)}<div ref={endRef}/></div><form className="composer random-composer" onSubmit={send}><input disabled={!canChat} value={value} onChange={(e) => setValue(e.target.value)} maxLength={1000} placeholder={canChat ? 'Say hello, stranger...' : 'Messages pause while a connection recovers'} /><button disabled={!canChat || !value.trim()}><Send size={18}/></button></form>{chatError && <div className="chat-error" role="alert">{chatError}</div>}</section><aside className="random-side"><div className="how-card"><span className="eyebrow">HOW IT WORKS</span><div className="how-step"><span>01</span><p>Tap <b>find someone</b></p></div><div className="how-step"><span>02</span><p>We pair two people waiting</p></div><div className="how-step"><span>03</span><p>Talk. Leave whenever.</p></div><div className="privacy-note"><span>✿</span><p>Your adda ID is never shared in a random chat.</p></div></div>{state === 'idle' || state === 'ended' || state === 'timeout' ? <button className="find-button" onClick={start}><span>✳</span> Find someone <ArrowUpRight size={18}/></button> : <div className="random-actions"><button className="leave-button" onClick={leave}><X size={16}/> Leave conversation</button>{(state === 'matched' || state === 'reconnecting' || state === 'partner-reconnecting') && <button className="next-button" onClick={next}><ArrowRight size={15}/> Next person</button>}</div>}<div className="anonymous-note"><span>THE GOOD KIND OF MYSTERY</span><p>“I like talking to people I haven’t met yet.”</p></div></aside></div><div className="bottom-rule"><span>STRANGER TODAY, NICE MEMORY TOMORROW</span><span>YOUR PRIVACY COMES FIRST&nbsp; →</span></div></div>;
}

type MiniGameId = 'quick-tap' | 'perfect-timing' | 'dodge-box' | 'catch-it' | 'reaction-test';
type GameId = 'dino-run' | MiniGameId;
type GameCard = { id: GameId; title: string; description: string; instruction: string; badge: string };
type TeamBoard = { personalBest: number; totals: { gender: string; total: number }[] };
const GAME_CARDS: GameCard[] = [
  { id: 'dino-run', title: 'Dino Run', description: 'Jump the cacti and add every finished run to your team.', instruction: 'Tap, click, Space, or ↑ to jump over each cactus.', badge: 'BOYS VS GIRLS' },
  { id: 'quick-tap', title: 'Quick Tap', description: 'Tap the target as fast as you can.', instruction: 'Tap the target whenever it appears. It moves around the board; misses do not reduce your score.', badge: 'CASUAL · PRIVATE BEST' },
  { id: 'perfect-timing', title: 'Perfect Timing', description: 'Stop the moving marker as close to the center as you can.', instruction: 'Tap the track to stop the marker. Closer to the center earns more points. Keep trying until you stop.', badge: 'CASUAL · PRIVATE BEST' },
  { id: 'dodge-box', title: 'Dodge Box', description: 'Avoid obstacles as they get faster.', instruction: 'Move with arrow keys or WASD. On touch screens, drag the player around the board. A collision ends the run.', badge: 'CASUAL · PRIVATE BEST' },
  { id: 'catch-it', title: 'Catch It', description: 'Catch the good things and avoid the bad ones.', instruction: 'Tap good falling objects for points. Bad objects take points away. Keep playing until you stop.', badge: 'CASUAL · PRIVATE BEST' },
  { id: 'reaction-test', title: 'Reaction Test', description: 'See how quickly you react when the signal appears.', instruction: 'Wait for the green signal, then tap as quickly as you can. A premature tap is a false start. Repeat as often as you like.', badge: 'CASUAL · PRIVATE BEST' },
];
type BestRecords = Partial<Record<MiniGameId, number>>;

function Game({ token }: { token: string }) {
  const [selected, setSelected] = useState<GameId | null>(null); const [playing, setPlaying] = useState(false); const [paused, setPaused] = useState(false); const [immersive, setImmersive] = useState(false); const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [bests, setBests] = useState<BestRecords>({}); const [bestsError, setBestsError] = useState(''); const [pendingSave, setPendingSave] = useState<{ gameId: MiniGameId; score: number } | null>(null); const [retryBusy, setRetryBusy] = useState(false);
  const [teamBoard, setTeamBoard] = useState<TeamBoard>({ personalBest: 0, totals: [] });
  const stageRef = useRef<HTMLDivElement>(null); const playingRef = useRef(false); const sessionScoreRef = useRef<number | null>(null);
  const loadBests = useCallback(async () => { const data = await api<{ bests: BestRecords }>('/game/minigames/bests', token); setBests(data.bests ?? {}); setBestsError(''); }, [token]);
  const loadTeamBoard = useCallback(async () => { const data = await api<TeamBoard>('/game/leaderboard', token); setTeamBoard(data); }, [token]);
  const submitBest = useCallback(async (gameId: MiniGameId, score: number) => { const data = await api<{ gameId: MiniGameId; bestScore: number }>('/game/minigames/bests', token, { method: 'POST', body: JSON.stringify({ gameId, score }) }); setBests((current) => ({ ...current, [gameId]: data.bestScore })); return data.bestScore; }, [token]);
  useEffect(() => { void loadBests().catch((error) => setBestsError(error instanceof Error ? error.message : 'Could not load your game records.')); }, [loadBests]);
  useEffect(() => { if (!selected) void loadTeamBoard().catch(() => {}); }, [loadTeamBoard, selected]);
  useEffect(() => {
    const changed = () => { const active = document.fullscreenElement === stageRef.current; setNativeFullscreen(active); if (!active && playingRef.current) { setImmersive(false); setPaused(true); } };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [immersive]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && immersive && playingRef.current) { setPaused(true); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [immersive]);
  const selectGame = (gameId: GameId) => { sessionScoreRef.current = null; setSelected(gameId); setPaused(false); setPlaying(false); setImmersive(false); };
  const launch = async () => {
    const stage = stageRef.current; if (!stage) return;
    setPaused(false);
    try { if (stage.requestFullscreen) await stage.requestFullscreen(); else setImmersive(true); }
    catch { setImmersive(true); }
    playingRef.current = true; setPlaying(true);
  };
  const resume = async () => {
    const stage = stageRef.current;
    if (!document.fullscreenElement && !immersive && stage?.requestFullscreen) {
      try { await stage.requestFullscreen(); } catch { setImmersive(true); }
    } else if (!document.fullscreenElement && !immersive) setImmersive(true);
    setPaused(false);
  };
  const exitToHub = async () => {
    const finalScore = selected && selected !== 'dino-run' && selected !== 'reaction-test' && sessionScoreRef.current !== null
      ? { gameId: selected, score: sessionScoreRef.current }
      : null;
    playingRef.current = false; setPlaying(false); setPaused(false); setImmersive(false); setNativeFullscreen(false); setSelected(null); sessionScoreRef.current = null;
    if (document.fullscreenElement === stageRef.current) void document.exitFullscreen().catch(() => {});
    if (finalScore) {
      setPendingSave(finalScore);
      try { await submitBest(finalScore.gameId, finalScore.score); setPendingSave((current) => current?.gameId === finalScore.gameId && current.score === finalScore.score ? null : current); }
      catch { /* The result remains on the Games hub with a retry button. */ }
    }
  };
  const retryPending = async () => {
    if (!pendingSave) return; setRetryBusy(true);
    try { await submitBest(pendingSave.gameId, pendingSave.score); setPendingSave(null); }
    catch { setBestsError('Could not sync that result yet. Please try again.'); }
    finally { setRetryBusy(false); }
  };
  const trackSessionScore = useCallback((score: number) => { sessionScoreRef.current = score > 0 ? score : null; }, []);
  const selectedCard = GAME_CARDS.find((card) => card.id === selected);
  const bestLabel = (gameId: MiniGameId) => bests[gameId] === undefined ? 'No record yet' : gameId === 'reaction-test' ? `${bests[gameId]} ms` : `${bests[gameId]?.toLocaleString()} pts`;
  const boysTotal = Number(teamBoard.totals.find((item) => item.gender === 'male')?.total ?? 0);
  const girlsTotal = Number(teamBoard.totals.find((item) => item.gender === 'female')?.total ?? 0);

  if (!selected) return <div className="page-wrap games-hub-page">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">02</span> PICK YOUR PLAY</div><h1>Find your <i>game.</i></h1><p className="subhead">Dino Run is the team challenge. The other five are just for you.</p></div></div>
    {bestsError && <div className="game-save-alert" role="status">{bestsError}</div>}
    {pendingSave && <div className="game-save-alert" role="status"><span>Your {GAME_CARDS.find((card) => card.id === pendingSave.gameId)?.title} result ({pendingSave.score.toLocaleString()}) is still on this screen.</span><button onClick={() => void retryPending()} disabled={retryBusy}>{retryBusy ? 'Saving…' : 'Retry save'}</button></div>}
    <section className="games-score-section" aria-label="Game scores"><div className="games-score-section-head"><span className="eyebrow">THE FRIENDLY RIVALRY</span><strong>Scores before <i>the games.</i></strong></div><div className="games-score-strip"><div className={`group-score boy ${boysTotal > girlsTotal ? 'team-champion' : ''}`}><span>THE BOYS</span><b>{boysTotal.toLocaleString()}</b><small>TOTAL POINTS</small>{boysTotal > girlsTotal && <span className="team-thaggedele">✳ THAGGEDELE</span>}</div><div className={`group-score girl ${girlsTotal > boysTotal ? 'team-champion' : ''}`}><span>THE GIRLS</span><b>{girlsTotal.toLocaleString()}</b><small>TOTAL POINTS</small>{girlsTotal > boysTotal && <span className="team-thaggedele">✳ THAGGEDELE</span>}</div><div className="games-personal-score"><span>YOUR DINO BEST</span><b>{Number(teamBoard.personalBest ?? 0).toLocaleString()}</b><small>PERSONAL POINTS</small></div></div></section>
    <div className="games-card-grid">{GAME_CARDS.map((card, index) => <button className={`games-card ${card.id === 'dino-run' ? 'team-game-card' : ''}`} key={card.id} onClick={() => selectGame(card.id)}><span className="games-card-index">0{index + 1}</span><span className="games-card-badge">{card.badge}</span><strong>{card.title}</strong><p>{card.description}</p><span className="games-card-record">{card.id === 'dino-run' ? 'ONLY GAME THAT ADDS TEAM POINTS' : `YOUR BEST · ${bestLabel(card.id)}`}</span><span className="games-card-action">Choose game <ArrowUpRight size={16}/></span></button>)}</div>
  </div>;

  return <div className={`games-stage-root${immersive ? ' is-immersive' : ''}`} ref={stageRef}>
  {!playing ? <div className="page-wrap games-launch-screen">
    <button className="games-back-link" onClick={() => setSelected(null)}><ArrowRight size={15}/> All games</button>
    <div className="games-launch-card"><span className="eyebrow">{selectedCard?.badge}</span><h1>{selectedCard?.title}</h1><p>{selectedCard?.description}</p><div className="games-instructions"><strong>How to play</strong><span>{selectedCard?.instruction}</span>{selected !== 'dino-run' && <small>Private personal best: {bestLabel(selected as MiniGameId)}</small>}</div>{selected === 'dino-run' && <div className="games-team-note">Dino Run is the only game that adds points to the boys’ and girls’ team totals.</div>}<button className="games-launch-button" onClick={() => void launch()}>Play in full screen <ArrowUpRight size={18}/></button>{immersive && <small className="fullscreen-fallback-note">Your browser doesn’t support full screen, so the game will use the full app window.</small>}</div>
  </div> : <div className="games-play-shell">
    <header className="games-play-header"><button onClick={() => void exitToHub()} aria-label="Exit to games">← Games</button><strong>{selectedCard?.title}</strong><button onClick={() => setPaused(true)} disabled={paused}>Pause</button></header>
    <div className="games-play-content">{selected === 'dino-run' ? <DinoRun token={token} paused={paused}/> : <MiniGameSession key={selected} gameId={selected} personalBest={bests[selected]} paused={paused} onSubmit={submitBest} onScoreChange={trackSessionScore}/>}</div>
    {paused && <div className="games-pause-overlay"><div><span className="eyebrow">TAKE YOUR TIME</span><h2>Game paused.</h2><p>Your session is waiting right where you left it.</p><button className="games-launch-button" onClick={() => void resume()}>Resume game <ArrowUpRight size={17}/></button><button className="games-exit-button" onClick={() => void exitToHub()}>Exit to Games</button></div></div>}
    {!nativeFullscreen && !immersive && <div className="fullscreen-fallback-note inline">Full screen was exited. The game is paused; resume when ready.</div>}
  </div>}
  </div>;
}

function MiniGameSession({ gameId, personalBest, paused, onSubmit, onScoreChange }: { gameId: MiniGameId; personalBest?: number; paused: boolean; onSubmit: (gameId: MiniGameId, score: number) => Promise<number>; onScoreChange: (score: number) => void }) {
  const [mode, setMode] = useState<'ready' | 'playing' | 'ended'>('ready'); const [score, setScore] = useState(0); const scoreRef = useRef(0); const startedAt = useRef(0); const lastSpawnAt = useRef(0); const pausedAt = useRef<number | null>(null); const pausedDuration = useRef(0);
  const [target, setTarget] = useState({ x: 50, y: 50 }); const [marker, setMarker] = useState(0); const [timingStopped, setTimingStopped] = useState(false); const [timingAttempt, setTimingAttempt] = useState<number | null>(null);
  const [player, setPlayer] = useState({ x: 50, y: 78 }); const playerRef = useRef(player); const [obstacles, setObstacles] = useState<{ id: number; x: number; y: number }[]>([]); const obstaclesRef = useRef<{ id: number; x: number; y: number }[]>([]);
  const [items, setItems] = useState<{ id: number; x: number; y: number; good: boolean }[]>([]); const itemsRef = useRef<{ id: number; x: number; y: number; good: boolean }[]>([]); const [reactionPhase, setReactionPhase] = useState<'ready' | 'waiting' | 'signal' | 'result' | 'false-start'>('ready'); const signalAt = useRef(0);
  const [reactionMs, setReactionMs] = useState<number | null>(null); const [saveError, setSaveError] = useState(''); const [saveNotice, setSaveNotice] = useState(''); const [pendingScore, setPendingScore] = useState<number | null>(null); const [saving, setSaving] = useState(false);
  const title = GAME_CARDS.find((card) => card.id === gameId)?.title ?? 'Game';
  const activeNow = () => { const now = performance.now(); return now - pausedDuration.current - (pausedAt.current === null ? 0 : now - pausedAt.current); };
  useEffect(() => {
    if (paused && pausedAt.current === null) pausedAt.current = performance.now();
    else if (!paused && pausedAt.current !== null) { pausedDuration.current += performance.now() - pausedAt.current; pausedAt.current = null; }
  }, [paused]);
  const saveResult = useCallback(async (value: number) => {
    setPendingScore(value); setSaveError(''); setSaveNotice(''); setSaving(true);
    try { await onSubmit(gameId, value); setPendingScore(null); setSaveNotice('Personal best synced privately.'); }
    catch { setSaveError('Could not sync this result yet. Your score is still here; retry when you’re back online.'); }
    finally { setSaving(false); }
  }, [gameId, onSubmit]);
  useEffect(() => { if (mode !== 'ready') onScoreChange(score); }, [mode, score, onScoreChange]);
  useEffect(() => {
    if (mode !== 'playing' || paused || gameId !== 'reaction-test' || reactionPhase !== 'waiting') return;
    const timer = window.setTimeout(() => { signalAt.current = activeNow(); setReactionPhase('signal'); }, 1000 + Math.random() * 3000);
    return () => window.clearTimeout(timer);
  }, [gameId, mode, paused, reactionPhase]);
  useEffect(() => {
    if (mode !== 'playing' || paused) return;
    if (gameId === 'quick-tap') {
      const timer = window.setInterval(() => setTarget({ x: 8 + Math.random() * 84, y: 12 + Math.random() * 76 }), 900);
      return () => window.clearInterval(timer);
    }
    if (gameId === 'perfect-timing' && !timingStopped) {
      const timer = window.setInterval(() => { const phase = ((activeNow() - startedAt.current) / 850) % 2; setMarker(phase <= 1 ? phase * 100 : (2 - phase) * 100); }, 20);
      return () => window.clearInterval(timer);
    }
    if (gameId === 'dodge-box' || gameId === 'catch-it') {
      const timer = window.setInterval(() => {
        const now = activeNow(); const elapsed = Math.max(0, now - startedAt.current); const elapsedSeconds = elapsed / 1000;
        if (gameId === 'dodge-box') {
          let next = obstaclesRef.current;
          const spawnGap = Math.max(360, 950 - elapsedSeconds * 12);
          if (now - lastSpawnAt.current >= spawnGap) { lastSpawnAt.current = now; next = [...next, { id: now, x: 6 + Math.random() * 88, y: -5 }]; }
          const speed = 2.2 + Math.min(elapsedSeconds * .08, 5);
          next = next.map((item) => ({ ...item, y: item.y + speed })).filter((item) => item.y < 105);
          obstaclesRef.current = next; setObstacles(next);
          const hit = next.some((item) => Math.abs(item.x - playerRef.current.x) < 8 && Math.abs(item.y - playerRef.current.y) < 10);
          const nextScore = Math.floor(elapsed / 100); scoreRef.current = nextScore; setScore(nextScore);
          if (hit) { setMode('ended'); void saveResult(nextScore); }
        } else {
          let next = itemsRef.current;
          if (now - lastSpawnAt.current >= 700) { lastSpawnAt.current = now; next = [...next, { id: now, x: 7 + Math.random() * 86, y: -5, good: Math.random() > .28 }]; }
          next = next.map((item) => ({ ...item, y: item.y + 2.4 })).filter((item) => item.y < 105);
          itemsRef.current = next; setItems(next);
        }
      }, 50);
      return () => window.clearInterval(timer);
    }
  }, [gameId, mode, paused, saveResult, timingStopped]);
  useEffect(() => {
    if (mode !== 'playing' || paused || gameId !== 'dodge-box') return;
    const keyDown = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = { ArrowLeft: [-5, 0], a: [-5, 0], A: [-5, 0], ArrowRight: [5, 0], d: [5, 0], D: [5, 0], ArrowUp: [0, -5], w: [0, -5], W: [0, -5], ArrowDown: [0, 5], s: [0, 5], S: [0, 5] };
      const delta = directions[event.key]; if (!delta) return; event.preventDefault();
      const next = { x: Math.max(6, Math.min(94, playerRef.current.x + delta[0])), y: Math.max(12, Math.min(90, playerRef.current.y + delta[1])) };
      playerRef.current = next; setPlayer(next);
    };
    window.addEventListener('keydown', keyDown); return () => window.removeEventListener('keydown', keyDown);
  }, [gameId, mode, paused]);
  const begin = () => {
    setScore(0); scoreRef.current = 0; setMode('playing'); setSaveError(''); setSaveNotice(''); setPendingScore(null); pausedAt.current = null; pausedDuration.current = 0; startedAt.current = activeNow(); lastSpawnAt.current = activeNow(); setTimingStopped(false); setTimingAttempt(null);
    const initial = { x: 50, y: 78 }; playerRef.current = initial; setPlayer(initial); obstaclesRef.current = []; setObstacles([]); itemsRef.current = []; setItems([]); setTarget({ x: 50, y: 50 }); setMarker(0); setReactionMs(null);
    if (gameId === 'reaction-test') setReactionPhase('waiting');
  };
  const stop = () => { if (mode !== 'playing') return; setMode('ended'); if (gameId !== 'reaction-test') void saveResult(scoreRef.current); };
  const addScore = (change: number) => setScore((current) => { const next = Math.max(0, current + change); scoreRef.current = next; return next; });
  const tryTiming = () => {
    if (timingStopped) { setTimingStopped(false); setTimingAttempt(null); startedAt.current = activeNow(); setMarker(0); return; }
    const points = Math.max(0, Math.round(100 - Math.abs(marker - 50) * 2));
    setTimingStopped(true); setTimingAttempt(points); addScore(points);
  };
  const catchItem = (id: number) => {
    const item = itemsRef.current.find((value) => value.id === id); if (!item) return;
    itemsRef.current = itemsRef.current.filter((value) => value.id !== id); setItems(itemsRef.current); addScore(item.good ? 10 : -10);
  };
  const movePlayerToPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointermove' && event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = { x: Math.max(6, Math.min(94, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(12, Math.min(90, ((event.clientY - rect.top) / rect.height) * 100)) };
    playerRef.current = next; setPlayer(next);
  };
  const reactionClick = () => {
    if (reactionPhase === 'waiting') { setReactionPhase('false-start'); return; }
    if (reactionPhase === 'signal') { const ms = Math.max(1, Math.round(activeNow() - signalAt.current)); setReactionMs(ms); setReactionPhase('result'); void saveResult(ms); return; }
    if (reactionPhase === 'result' || reactionPhase === 'false-start') setReactionPhase('waiting');
  };
  const retry = () => { if (pendingScore !== null) void saveResult(pendingScore); };
  const bestText = personalBest === undefined ? 'Not set' : gameId === 'reaction-test' ? `${personalBest} ms` : `${personalBest.toLocaleString()} pts`;
  const stagePointerProps = gameId === 'dodge-box' ? { onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); movePlayerToPointer(event); }, onPointerMove: movePlayerToPointer } : {};

  return <div className="mini-game-session"><div className="mini-game-scorebar"><div><span>SESSION {gameId === 'reaction-test' ? 'REACTION' : 'SCORE'}</span><strong>{gameId === 'reaction-test' ? (reactionMs === null ? '— ms' : `${reactionMs} ms`) : score.toLocaleString()}</strong></div><div><span>YOUR PRIVATE BEST</span><strong>{bestText}</strong></div></div>
    {mode === 'ready' && <div className="mini-game-ready"><span className="games-card-badge">{title.toUpperCase()} · FOR FUN</span><h2>Ready when you are.</h2><p>Play as long as you like. Your best stays private to your account and never affects team totals.</p><button className="games-launch-button" onClick={begin}>Start playing <ArrowUpRight size={18}/></button></div>}
    {mode === 'playing' && gameId === 'quick-tap' && <div className="mini-game-board quick-tap-board"><span className="mini-game-hint">Tap the target. It will keep moving.</span><button className="tap-target" style={{ left: `${target.x}%`, top: `${target.y}%` }} onClick={() => { addScore(1); setTarget({ x: 8 + Math.random() * 84, y: 12 + Math.random() * 76 }); }} aria-label="Tap target">+</button></div>}
    {mode === 'playing' && gameId === 'perfect-timing' && <div className="mini-game-board timing-board"><span className="mini-game-hint">{timingStopped ? `Stopped: ${timingAttempt} points. Tap to try again.` : 'Tap the track to stop the moving marker.'}</span><button className={`timing-track${timingStopped ? ' stopped' : ''}`} onClick={tryTiming} aria-label={timingStopped ? 'Start the next timing attempt' : 'Stop the moving marker'}><span className="timing-center"/><i style={{ left: `${marker}%` }}/></button><span className="timing-score-hint">Center is 100 points · each percentage point away removes 2 points</span></div>}
    {mode === 'playing' && gameId === 'dodge-box' && <div className="mini-game-board dodge-board" {...stagePointerProps}><span className="mini-game-hint">Move with arrows/WASD or drag.</span>{obstacles.map((item) => <span className="dodge-obstacle" key={item.id} style={{ left: `${item.x}%`, top: `${item.y}%` }}/>) }<span className="dodge-player" style={{ left: `${player.x}%`, top: `${player.y}%` }}>□</span></div>}
    {mode === 'playing' && gameId === 'catch-it' && <div className="mini-game-board catch-board"><span className="mini-game-hint">Catch ✦ and avoid ×.</span>{items.map((item) => <button key={item.id} className={`catch-item ${item.good ? 'good' : 'bad'}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => catchItem(item.id)} aria-label={item.good ? 'Catch good object' : 'Avoid bad object'}>{item.good ? '✦' : '×'}</button>)}</div>}
    {mode === 'playing' && gameId === 'reaction-test' && <div className={`mini-game-board reaction-board ${reactionPhase}`}><span className="mini-game-hint">{reactionPhase === 'waiting' ? 'Wait for green…' : reactionPhase === 'signal' ? 'Tap now!' : reactionPhase === 'false-start' ? 'False start. Wait for green next time.' : reactionPhase === 'result' ? `You reacted in ${reactionMs} ms.` : 'Ready?'}</span><button className="reaction-signal" onClick={reactionClick}>{reactionPhase === 'waiting' ? 'WAIT' : reactionPhase === 'signal' ? 'TAP!' : reactionPhase === 'result' ? 'Try again' : reactionPhase === 'false-start' ? 'Try again' : 'Start test'}</button></div>}
    {mode === 'playing' && gameId !== 'reaction-test' && <div className="mini-game-session-controls"><span>Endless play · stop whenever you like</span><button onClick={stop}>Stop &amp; save best</button></div>}
    {mode === 'ended' && <div className="mini-game-result"><span className="eyebrow">SESSION COMPLETE</span><h2>{gameId === 'dodge-box' ? 'Nice run.' : 'That was fun.'}</h2><p>Your score: <strong>{score.toLocaleString()} points</strong></p><button className="games-launch-button" onClick={begin}>Play again <ArrowUpRight size={17}/></button></div>}
    {(saveError || saveNotice) && <div className={`mini-game-save-status ${saveError ? 'error' : ''}`} role="status"><span>{saveError || saveNotice}</span>{saveError && <button onClick={retry} disabled={saving}>{saving ? 'Saving…' : 'Retry save'}</button>}</div>}
  </div>;
}

function DinoRun({ token, paused }: { token: string; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const scoreDisplayRef = useRef<HTMLElement>(null); const lastPointerAtRef = useRef(0); const pausedRef = useRef(paused); pausedRef.current = paused; const gameRef = useRef<{ running: boolean; score: number; high: number; y: number; vy: number; obstacles: { x: number; h: number; w: number }[]; frame: number } | null>(null); const [score, setScore] = useState(0); const [high, setHigh] = useState(0); const [running, setRunning] = useState(false); const [board, setBoard] = useState<{ personalBest: number; totals: { gender: string; total: number }[] }>({ personalBest: 0, totals: [] });
  const loadBoard = useCallback(() => { api<typeof board>('/game/leaderboard', token).then((data) => { setBoard(data); setHigh(Number(data.personalBest ?? 0)); }).catch(() => {}); }, [token]);
  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const context = canvas.getContext('2d'); if (!context) return;
    let width = 0; let height = 0; let animation = 0; const state = gameRef.current ?? { running: false, score: 0, high: 0, y: canvas.clientHeight - 40, vy: 0, obstacles: [], frame: 0 }; gameRef.current = state;
    const resize = () => {
      const nextWidth = canvas.clientWidth; const nextHeight = canvas.clientHeight; const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!nextWidth || !nextHeight) return;
      const widthScale = width ? nextWidth / width : 1; const heightScale = height ? nextHeight / height : 1;
      if (nextWidth === width && nextHeight === height && canvas.width === Math.round(nextWidth * dpr) && canvas.height === Math.round(nextHeight * dpr)) return;
      if (width && height && state.running) {
        state.obstacles = state.obstacles.map((item) => ({ ...item, x: item.x * widthScale, w: item.w * widthScale, h: item.h * heightScale }));
        state.y = nextHeight - 40 - ((height - 40) - state.y) * heightScale;
      } else if (!state.running) state.y = nextHeight - 40;
      width = nextWidth; height = nextHeight; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
    const draw = () => { context.clearRect(0, 0, width, height); context.fillStyle = '#f4f1e8'; context.fillRect(0, 0, width, height); context.strokeStyle = '#ddd8c9'; context.setLineDash([4, 6]); context.beginPath(); context.moveTo(0, height - 25); context.lineTo(width, height - 25); context.stroke(); context.setLineDash([]);
      context.fillStyle = '#242727'; context.fillRect(46, state.y - 25, 19, 25); context.fillRect(59, state.y - 32, 13, 13); context.fillStyle = '#f4f1e8'; context.fillRect(68, state.y - 28, 2.5, 2.5); context.fillStyle = '#242727'; context.fillRect(49, state.y - 3, 5, 4); context.fillRect(60, state.y - 3, 5, 4);
      if (state.running && !pausedRef.current) { state.frame++; if (state.frame % 72 === 0) state.obstacles.push({ x: width + 5, h: 25 + Math.random() * 24, w: 14 + Math.random() * 10 }); state.obstacles.forEach((o) => o.x -= 4 + Math.min(state.score / 300, 5)); state.obstacles = state.obstacles.filter((o) => o.x > -35); state.y += state.vy; state.vy += 0.65; if (state.y > height - 40) { state.y = height - 40; state.vy = 0; } state.score += 0.12; const shownScore = Math.floor(state.score); if (state.frame % 6 === 0 && scoreDisplayRef.current) scoreDisplayRef.current.textContent = shownScore.toString().padStart(4, '0');
        for (const o of state.obstacles) { context.fillStyle = '#d95338'; context.fillRect(o.x, height - 25 - o.h, o.w, o.h); context.fillRect(o.x - 5, height - 14 - o.h, 8, 5); if (state.running && o.x < 66 && o.x + o.w > 46 && state.y > height - 25 - o.h) { state.running = false; setRunning(false); setScore(shownScore); setHigh((v) => Math.max(v, shownScore)); void api('/game/score', token, { method: 'POST', body: JSON.stringify({ score: shownScore }) }).then(loadBoard); } }
      } else { state.obstacles.forEach((o) => { context.fillStyle = '#d95338'; context.fillRect(o.x, height - 25 - o.h, o.w, o.h); }); }
      animation = requestAnimationFrame(draw);
    }; animation = requestAnimationFrame(draw); return () => { cancelAnimationFrame(animation); resizeObserver.disconnect(); };
  }, [token, loadBoard]);
  const hop = useCallback(() => { const s = gameRef.current; if (!s || paused) return; if (!s.running) { s.score = 0; s.obstacles = []; s.frame = 0; s.y = (canvasRef.current?.clientHeight ?? 200) - 40; s.running = true; setScore(0); if (scoreDisplayRef.current) scoreDisplayRef.current.textContent = '0000'; setRunning(true); } if (s.y >= (canvasRef.current?.clientHeight ?? 200) - 40) s.vy = -10.5; }, [paused]);
  const pointerJump = useCallback((event: ReactPointerEvent<HTMLElement>) => { if (event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); lastPointerAtRef.current = performance.now(); hop(); }, [hop]);
  const keyboardClickJump = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => { if (event.detail === 0 && performance.now() - lastPointerAtRef.current > 500) hop(); }, [hop]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.code === 'Space' || event.code === 'ArrowUp') { if (document.activeElement?.tagName === 'INPUT') return; event.preventDefault(); hop(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [hop]);
  const boys = Number(board.totals.find((t) => t.gender === 'male')?.total ?? 0); const girls = Number(board.totals.find((t) => t.gender === 'female')?.total ?? 0); const winningTeam = boys === girls ? null : boys > girls ? 'male' : 'female';
  return <div className="page-wrap dino-fullscreen-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">02</span> THE FRIENDLY RIVALRY</div><h1>Run, little <i>dino.</i></h1><p className="subhead">One jump at a time. One more try, every time.</p></div><div className="best-score"><span>YOUR BEST</span><b>{Math.max(high, score).toLocaleString()}</b><small>POINTS</small></div></div><div className="game-layout"><section className="game-panel"><div className="game-head"><div><span className="eyebrow">THE GREAT ADDA DINO DASH</span><h2>Ready, set, <i>hop!</i></h2></div><div className="score-live"><span>RUN SCORE</span><b ref={scoreDisplayRef}>0000</b></div></div><div className="game-scene" onPointerDown={pointerJump}><canvas ref={canvasRef}/>{!running && <button className="play-overlay" onPointerDown={(event) => { event.stopPropagation(); pointerJump(event); }} onClick={keyboardClickJump}><span>{score ? 'AGAIN?' : 'READY?'}</span><strong>{score ? 'Run it back.' : 'Let’s go!'}</strong><span className="play-arrow"><ArrowUpRight size={20}/></span></button>}<span className="scene-label">SPACE / ↑ / TAP TO JUMP</span></div><div className="game-controls"><div className="controls-copy"><span className="eyebrow">HOW TO PLAY</span><p>Jump over the cacti. Every run adds to your team’s total.</p></div><button className="jump-button" onPointerDown={pointerJump} onClick={keyboardClickJump}><ArrowUpRight size={18}/>{running ? 'JUMP!' : 'START RUN'}</button></div></section><aside className="leaderboard-panel"><div className="leader-head"><span className="eyebrow">THE TEAM SCOREBOARD</span><span className="trophy">✳</span><h2>For the <i>glory.</i></h2></div><div className="group-scores"><div className={`group-score boy ${winningTeam === 'male' ? 'team-champion' : ''}`}><span>THE BOYS</span><b>{boys.toLocaleString()}</b><small>TOTAL POINTS</small><span className="score-sun">✳</span>{winningTeam === 'male' && <span className="team-thaggedele">✳ THAGGEDELE</span>}</div><div className={`group-score girl ${winningTeam === 'female' ? 'team-champion' : ''}`}><span>THE GIRLS</span><b>{girls.toLocaleString()}</b><small>TOTAL POINTS</small><span className="score-sun">✳</span>{winningTeam === 'female' && <span className="team-thaggedele">✳ THAGGEDELE</span>}</div></div><p className="team-score-note">Team totals are shared. Individual scores stay private.</p></aside></div><div className="bottom-rule"><span>THE LONGER YOU RUN, THE HARDER IT GETS</span><span>YOU’VE GOT THIS&nbsp; →</span></div></div>;
}

function Profile({ user, token, onUser, onSignOut, notify, installed, onInstall }: { user: User; token: string; onUser: (u: User) => void; onSignOut: () => void; notify: (message: string) => void; installed: boolean; onInstall: () => void }) {
  const [username, setUsername] = useState(user.username); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [signingOut, setSigningOut] = useState(false);
  const save = async (e: FormEvent) => { e.preventDefault(); setError(''); setBusy(true); try { const data = await api<{ user: User }>('/me/username', token, { method: 'PATCH', body: JSON.stringify({ username }) }); onUser(data.user); setUsername(data.user.username); notify('Your adda ID has a new ring to it.'); } catch (ex) { setError(ex instanceof Error ? ex.message : 'Could not save your ID.'); } finally { setBusy(false); } };
  const signOut = () => {
    setSigningOut(true); setError('');
    onSignOut();
  };
  return <div className="page-wrap profile-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">04</span> YOUR LITTLE CORNER</div><h1>All about <i>you.</i></h1><p className="subhead">The way people find you around here.</p></div></div><div className="profile-layout"><section className="profile-card"><div className="profile-card-top"><div className="profile-avatar">{user.username[0]?.toUpperCase()}</div><div><span className="eyebrow">YOUR ADDA ID</span><h2>#{user.username}</h2><span className="profile-sub">A little ID, just for you.</span></div><span className="profile-spark">✳</span></div><form onSubmit={save} className="profile-form"><Field label="YOUR PUBLIC ID"><div className="id-input"><span>#</span><input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18))} minLength={3} maxLength={18} required/><Hash size={17}/></div></Field><div className="id-help"><CircleHelp size={15}/><span>People can use this ID to find you. Make it yours, and keep it unique.</span></div>{error && <div className="form-error">{error}</div>}<button className="profile-save" disabled={busy || username === user.username}>{busy ? <LoaderCircle className="spin" size={17}/> : <>Save my new ID <ArrowUpRight size={16}/></>}</button></form><div className="profile-facts"><div><span>YOUR NAME</span><b>{user.name}</b></div><div><span>HERE AS</span><b>{user.gender === 'female' ? 'Female' : 'Male'}</b></div><div><span>MEMBER SINCE</span><b>Just now-ish</b></div></div></section><aside className="profile-side"><PushNotificationSettings token={token} installed={installed} onInstall={onInstall}/><div className="profile-note"><span>✿</span><h3>One ID.<br/><i>All your people.</i></h3><p>Your messages and your score stay tied to this account. If you change your ID, your friends will need your new one.</p></div><button className="signout-button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? <LoaderCircle className="spin" size={17}/> : <LogOut size={17}/>} Sign out of adda <ArrowUpRight size={15}/></button>{error && <div className="form-error">{error}</div>}<div className="safe-note"><span>⌑</span><p>Your password is private, always. We never display it or share it with anyone.</p></div></aside></div></div>;
}

function decodeVapidKey(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function removeCurrentPushSubscription(token: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const remoteRemoval = api('/me/push-subscriptions', token, { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  const localRemoval = subscription.unsubscribe();
  const [remote, local] = await Promise.allSettled([remoteRemoval, localRemoval]);
  if (remote.status === 'rejected') throw remote.reason;
  if (local.status === 'rejected') throw local.reason;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function requiresHomeScreenForPush(installed: boolean) {
  return isIosDevice() && !installed;
}

function pushSupported() {
  return 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
}

async function enablePushSubscription(token: string, installed: boolean) {
  if (!pushSupported()) throw new Error('This browser does not support push notifications. You can still use adda in your browser.');
  if (requiresHomeScreenForPush(installed)) throw new Error('Add adda to your Home Screen first, then open the installed app to enable notifications.');
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked in your browser settings. Allow adda notifications there, then try again.');

  // Request permission directly from the button gesture, before awaiting other work.
  const permissionRequest = Notification.permission === 'granted' ? Promise.resolve('granted' as NotificationPermission) : Notification.requestPermission();
  const permissionResult = await permissionRequest;
  if (permissionResult !== 'granted') throw new Error('Allow notifications in the browser prompt to turn them on.');
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) throw new Error('Refresh adda and try again so its notification service can finish starting.');
  const current = await registration.pushManager.getSubscription();
  const { publicKey } = await api<{ publicKey: string }>('/notifications/vapid-public-key', token);
  const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) as BufferSource });
  await api('/me/push-subscriptions', token, { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
  return subscription;
}

function NotificationOptInPrompt({ userId, token, installed, onInstall }: { userId: string; token: string; installed: boolean; onInstall: () => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const storageKey = `adda-notification-prompt-seen:${userId}`;
  useEffect(() => {
    let cancelled = false;
    try { if (localStorage.getItem(storageKey)) return; } catch { /* Keep the prompt available when storage is restricted. */ }
    const check = async () => {
      try {
        let subscribedHere = false;
        if (pushSupported()) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription) {
            const data = await api<{ endpoints: string[] }>('/me/push-subscriptions', token);
            subscribedHere = data.endpoints.includes(subscription.endpoint);
          }
        }
        if (cancelled) return;
        if (subscribedHere) {
          try { localStorage.setItem(storageKey, '1'); } catch { /* Subscription check still prevents future prompts when possible. */ }
        } else setOpen(true);
      } catch {
        if (!cancelled) setOpen(true);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [storageKey, token]);

  const dismiss = () => { try { localStorage.setItem(storageKey, '1'); } catch { /* Ignore storage restrictions. */ } setOpen(false); };
  const enable = async () => {
    setBusy(true); setError('');
    try { await enablePushSubscription(token, installed); dismiss(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not enable notifications.';
      setError(message);
      if ('Notification' in window && Notification.permission !== 'granted') dismiss();
    } finally { setBusy(false); }
  };
  if (!open) return null;
  const unsupported = !pushSupported();
  const permissionDenied = !unsupported && Notification.permission === 'denied';
  const homeScreenRequired = requiresHomeScreenForPush(installed);
  return <div className="notification-prompt-backdrop"><section className="notification-prompt" role="dialog" aria-modal="true" aria-labelledby="notification-prompt-title">
    <div className="notification-prompt-mark"><Bell size={21}/></div><span className="eyebrow">KEEP YOUR ADDA CLOSE</span>
    <h2 id="notification-prompt-title">A little nudge, <i>when it matters.</i></h2>
    <p>Get a note when a new Side Quest starts or someone joins the conversation. You can change this any time in your Profile.</p>
    {!installed && <div className="notification-install-note">Install adda for a room of its own and an easier way back to your people.</div>}
    {homeScreenRequired && <div className="notification-platform-note">On iPhone or iPad, add adda to your Home Screen before enabling push notifications.</div>}
    {unsupported && <div className="notification-platform-note">This browser cannot receive push notifications. You can still use adda here; try a supported browser or install adda on your device.</div>}
    {permissionDenied && <div className="notification-platform-note">Notifications are blocked in browser settings. Allow adda notifications there, then enable them from your Profile.</div>}
    {error && <div className="notification-prompt-error" role="alert">{error}</div>}
    <div className="notification-prompt-actions">
      {(!installed || homeScreenRequired) && <div className="notification-install-action"><InstallAppButton onInstall={onInstall}/></div>}
      <button type="button" className="notification-enable-action" onClick={() => void enable()} disabled={busy || unsupported || permissionDenied || homeScreenRequired}>{busy ? <LoaderCircle className="spin" size={16}/> : <><Bell size={16}/> Enable notifications</>}</button>
      <button type="button" className="notification-later-action" onClick={dismiss}>Maybe later</button>
    </div>
  </section></div>;
}

function PushNotificationSettings({ token, installed, onInstall }: { token: string; installed: boolean; onInstall: () => void }) {
  const [enabled, setEnabled] = useState(false); const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default'); const [available, setAvailable] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const homeScreenRequired = requiresHomeScreenForPush(installed);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!pushSupported()) { setAvailable(false); setPermission('unsupported'); return; }
      setPermission(Notification.permission);
      try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (!registration) { setAvailable(false); return; }
        const subscription = await registration.pushManager.getSubscription();
        const data = await api<{ endpoints: string[] }>('/me/push-subscriptions', token);
        if (!cancelled) setEnabled(!!subscription && data.endpoints.includes(subscription.endpoint));
      } catch { if (!cancelled) setMessage('Could not check this device’s notification setting. Try again when you’re online.'); }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      if (!enabled) {
        await enablePushSubscription(token, installed);
        setPermission(Notification.permission);
        setEnabled(true); setMessage('Notifications are on for this device.'); return;
      }
      const registration = pushSupported() ? await navigator.serviceWorker.getRegistration('/') : undefined;
      const current = await registration?.pushManager.getSubscription();
      if (current) {
        const remoteRemoval = api('/me/push-subscriptions', token, { method: 'DELETE', body: JSON.stringify({ endpoint: current.endpoint }) });
        await current.unsubscribe(); setEnabled(false);
        try { await remoteRemoval; setMessage('Notifications are off for this device.'); }
        catch { setMessage('Notifications are off on this device. The server will clear the expired subscription.'); }
        return;
      }
      setEnabled(false); setMessage('This device is not subscribed to notifications.');
    } catch (error) { if ('Notification' in window) setPermission(Notification.permission); setMessage(error instanceof Error ? error.message : 'Could not update notification settings.'); }
    finally { setBusy(false); }
  };

  return <section className="push-settings"><div className="push-settings-heading"><span className="push-settings-icon"><Bell size={17}/></span><div><strong>Push notifications</strong><small>{enabled ? 'ON FOR THIS DEVICE' : permission === 'denied' ? 'BLOCKED IN BROWSER SETTINGS' : 'OPTIONAL · THIS DEVICE'}</small></div></div><p>Get community announcements, new Side Quests, and new answers, even when adda is closed.</p>{homeScreenRequired ? <div className="push-unavailable">Add adda to your iPhone or iPad Home Screen to turn on push notifications.<button type="button" className="push-toggle" onClick={onInstall}>Install adda</button></div> : available ? <button className={`push-toggle ${enabled ? 'enabled' : ''}`} onClick={() => void toggle()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : enabled ? <><BellOff size={15}/> Turn off notifications</> : <><Bell size={15}/> Enable notifications</>}</button> : <div className="push-unavailable">This browser does not support push notifications. Try a supported browser or install adda on your device.</div>}{message && <div className={`push-feedback ${enabled ? 'success' : ''}`} role="status">{message}</div>}</section>;
}

export default App;
