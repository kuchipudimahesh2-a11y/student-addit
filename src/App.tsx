import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, BadgeCheck, Bell, BellOff, BookOpen, Check, ChevronDown, CircleHelp, Gamepad2, Hash, LoaderCircle, LogOut, MessageSquareText, MoveRight, Radio, RefreshCw, Send, Settings2, Sparkles, Users, X } from 'lucide-react';
import { InstallAppButton, usePwaInstall } from './PwaInstall';
import './studies.css';

type User = { id: string; name: string; username: string; gender: 'male' | 'female'; isAdmin?: boolean };
type Msg = { id: string; username: string; body: string; created_at: string };
type Tab = 'lobby' | 'game' | 'random' | 'studies' | 'polls' | 'profile';
const isAddaPagesDomain = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev');
const API_ORIGIN = isAddaPagesDomain ? 'https://student-addit.mgp899123.workers.dev' : '';
const API = `${API_ORIGIN}/api`;
const WS_ORIGIN = API_ORIGIN ? API_ORIGIN.replace(/^http/, 'ws') : `${location.protocol}//${location.host}`;

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data as T;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('adda-token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [tab, setTab] = useState<Tab>('lobby');
  const [toast, setToast] = useState('');
  const pwa = usePwaInstall();
  const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: '2-digit' }).format(new Date()).toUpperCase();

  useEffect(() => {
    if (!token) { setUser(null); return; }
    api<{ user: User }>('/me', token).then(({ user: next }) => setUser(next)).catch(() => { localStorage.removeItem('adda-token'); setToken(''); setUser(null); });
  }, [token]);
  useEffect(() => {
    const handleNotificationClick = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_ADDA_HOME') setTab('lobby');
    };
    navigator.serviceWorker?.addEventListener('message', handleNotificationClick);
    return () => navigator.serviceWorker?.removeEventListener('message', handleNotificationClick);
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer); } }, [toast]);

  const login = (nextToken: string, nextUser: User) => { localStorage.setItem('adda-token', nextToken); setToken(nextToken); setUser(nextUser); setTab('lobby'); };
  const signOut = () => { localStorage.removeItem('adda-token'); setToken(''); setUser(null); setAuthMode('login'); };

  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onLogin={login} installed={pwa.installed} onInstall={pwa.install} />;

  return <main className="app-shell">
    <aside className="side-rail">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setTab('lobby'); }}><span className="brand-mark">a.</span><span>adda<span className="brand-dot">.</span></span></a>
      <div className="rail-label">YOUR SPACE</div>
      <nav className="nav-list">
        <NavButton active={tab === 'lobby'} onClick={() => setTab('lobby')} icon={<MessageSquareText size={19} />} label="The adda" />
        <NavButton active={tab === 'game'} onClick={() => setTab('game')} icon={<Gamepad2 size={19} />} label="Dino run" />
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
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark">a.</span> adda<span className="brand-dot">.</span></div><div className="breadcrumb"><span>YOUR SPACE</span><MoveRight size={14} /><strong>{tab === 'lobby' ? 'THE ADDA' : tab === 'game' ? 'DINO RUN' : tab === 'random' ? 'RANDOM CHAT' : tab === 'studies' ? 'STUDIES' : tab === 'polls' ? 'POLLS' : 'YOUR PROFILE'}</strong></div><div className="topbar-actions">{!pwa.installed && <InstallAppButton onInstall={pwa.install} compact/>}<button className="top-id" onClick={() => setTab('profile')}><span className="online-dot" /> #{user.username}<ChevronDown size={14} /></button></div></header>
      {tab === 'lobby' && <Lobby user={user} token={token} setTab={setTab} />}
      {tab === 'game' && <Game user={user} token={token} />}
      {tab === 'random' && <RandomChat token={token} />}
      {tab === 'studies' && <Studies token={token} />}
      {tab === 'polls' && <Polls token={token} />}
      {tab === 'profile' && <Profile user={user} token={token} onUser={setUser} onSignOut={signOut} notify={setToast} />}
    </section>
    <aside className="right-column"><div className="today-card"><div className="today-head"><span>{today}</span><Sparkles size={17} /></div><div className="today-title">A good day<br />to say <i>hello.</i></div><div className="today-foot"><span className="online-dot" /> your people are one message away</div></div><div className="note-card"><span className="note-pin">✳</span><span className="eyebrow">A LITTLE REMINDER</span><p>Be kind. Stay curious. Keep it <em>adda.</em></p><div className="note-line" /></div><div className="right-quote"><div className="quote-mark">“</div><p>Somewhere, someone is having a day just like yours.</p><span>GO ON, SAY HI</span></div><div className="side-bottom"><span>BUILT FOR GOOD CONVERSATIONS</span><span>01 — 05</span></div></aside>
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

function Lobby({ user, token, setTab }: { user: User; token: string; setTab: (tab: Tab) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]); const [people, setPeople] = useState<{ username: string; gender: string }[]>([]); const [value, setValue] = useState(''); const [socketState, setSocketState] = useState<'connecting' | 'open' | 'closed'>('connecting'); const [error, setError] = useState(''); const endRef = useRef<HTMLDivElement>(null); const socketRef = useRef<WebSocket | null>(null);
  useEffect(() => { api<{ messages: Msg[] }>('/chat/messages', token).then((d) => setMessages(d.messages)).catch(() => setError('Could not load the adda yet.')); api<{ people: typeof people }>('/chat/people', token).then((d) => setPeople(d.people)).catch(() => {}); }, [token]);
  useEffect(() => {
    const socket = new WebSocket(`${WS_ORIGIN}/api/ws/chat?token=${encodeURIComponent(token)}`); socketRef.current = socket;
    socket.onopen = () => setSocketState('open'); socket.onclose = () => setSocketState('closed'); socket.onerror = () => setSocketState('closed');
    socket.onmessage = (event) => { try { const data = JSON.parse(event.data); if (data.type === 'message') setMessages((current) => [...current.slice(-99), data.message]); } catch { /* ignore malformed frame */ } };
    return () => { socketRef.current = null; socket.close(); };
  }, [token]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const send = (event: FormEvent) => { event.preventDefault(); const body = value.trim(); if (!body) return; if (socketRef.current?.readyState !== WebSocket.OPEN) { setError('The room connection is reconnecting. Please try again in a moment.'); return; } socketRef.current.send(JSON.stringify({ body })); setValue(''); setError(''); };
  return <div className="page-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">01</span> THE MAIN ROOM</div><h1>Come say <i>something.</i></h1><p className="subhead">A room full of people, and all the time in the world.</p></div><button className="small-action" onClick={() => setTab('random')}><Radio size={16}/> Meet someone new <ArrowUpRight size={14}/></button></div><div className="lobby-layout"><section className="chat-panel"><div className="panel-head"><div className="room-symbol"><Hash size={20}/></div><div><strong>the-adda</strong><span>one room, all of us</span></div><span className="live-status"><span className={socketState === 'open' ? 'online-dot' : 'offline-dot'}/>{socketState === 'open' ? 'LIVE' : socketState.toUpperCase()}</span><button className="icon-button" title="Refresh messages" onClick={() => api<{ messages: Msg[] }>('/chat/messages', token).then((d) => setMessages(d.messages))}><RefreshCw size={16}/></button><span className="room-note">aids section 2</span></div><div className="message-list">{messages.length === 0 && <div className="empty-chat"><div className="empty-emoji">✳</div><strong>Well, this room’s all yours.</strong><span>Drop the first hello?</span></div>}{messages.map((message, index) => <div key={message.id || `${message.created_at}-${index}`} className={`message-row ${message.username === user.username ? 'mine' : ''}`}><div className="message-avatar">{message.username?.[0]?.toUpperCase() ?? '?'}</div><div className="message-content"><div className="message-meta"><b>#{message.username}</b><time>{timeAgo(message.created_at)}</time></div><p>{message.body}</p></div></div>)}<div ref={endRef}/></div><form className="composer" onSubmit={send}><input value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} placeholder="Say something nice..." aria-label="Message"/><span className="composer-id">#{user.username}</span><button disabled={!value.trim()} title="Send message"><Send size={18}/></button></form>{error && <div className="chat-error">{error}</div>}</section><div className="lobby-aside"><div className="online-card"><div className="card-title"><Users size={17}/> PEOPLE AROUND <span>{people.length}</span></div><div className="people-list">{people.slice(0, 7).map((person, i) => <div className="person-row" key={person.username}><div className={`person-avatar avatar-color-${i % 5}`}>{person.username[0]?.toUpperCase()}</div><span>#{person.username}</span><i className="status-dot"/></div>)}</div><div className="people-note">Everyone’s name stays theirs. IDs make it a little more private.</div></div><button className="random-card" onClick={() => setTab('random')}><div className="random-card-icon"><Radio size={21}/></div><span className="eyebrow">FEELING CURIOUS?</span><strong>Meet a stranger.<br/><i>Leave as friends.</i></strong><span className="random-card-link">TRY RANDOM CHAT <ArrowUpRight size={15}/></span><span className="random-decoration">✳</span></button><div className="values-card"><span className="values-icon">✿</span><div><b>Our tiny house rule</b><p>Leave people a little happier than you found them.</p></div></div></div></div><div className="bottom-rule"><span>YOUR ADDA IS WAITING</span><span>AN OPEN ROOM FOR OPEN MINDS&nbsp; →</span></div></div>;
}

type PollChoice = { id: string; label: string; votes: number };
type PollItem = { id: string; question: string; status: 'open' | 'closed'; created_at: string; total_votes: number; my_vote: string | null; options: PollChoice[] };

function Polls({ token }: { token: string }) {
  const [polls, setPolls] = useState<PollItem[]>([]); const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(async () => { const data = await api<{ polls: PollItem[] }>('/polls', token); setPolls(data.polls); }, [token]);
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load polls.')); }, [load]);
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
  const loadSections = useCallback(async () => { const data = await api<{ sections: StudySection[] }>('/studies/sections', token); setSections(data.sections); setSelected((current) => data.sections.some((item) => item.id === current) ? current : data.sections[0]?.id ?? ''); }, [token]);
  const loadPosts = useCallback(async () => { if (!selected) { setPosts([]); return; } const data = await api<{ posts: StudyPost[] }>(`/studies/sections/${encodeURIComponent(selected)}/posts`, token); setPosts(data.posts); }, [selected, token]);
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
        ws.onopen = () => { if (!stopped) setLiveState('live'); };
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
      if (file.contentType.startsWith('image/') || file.contentType === 'application/pdf') setPreview({ url, name: file.fileName, type: file.contentType });
      else { const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not open this file.'); }
    finally { setBusyFile(''); }
  };
  return <div className="page-wrap studies-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">05</span> A QUIET PLACE TO LEARN</div><h1>Study <i>together.</i></h1><p className="subhead">Notes, files, and useful things from your people.</p></div></div>
    {!sections.length ? <section className="studies-empty"><BookOpen size={25}/><h2>The shelves are waiting.</h2><p>Study materials will appear here when an admin creates a section.</p></section> : <div className="studies-layout"><aside className="studies-sections"><span className="eyebrow">YOUR STUDY SECTIONS</span>{sections.map((section) => <button key={section.id} className={`study-section-button ${selected === section.id ? 'selected' : ''}`} onClick={() => setSelected(section.id)}><BookOpen size={17}/><span>{section.name}</span><small>{section.post_count}</small></button>)}</aside><section className="studies-feed"><div className="studies-feed-head"><div className="study-hash">#</div><div><strong>{sections.find((section) => section.id === selected)?.name}</strong><span>Admin updates · members read along</span></div><span className={`studies-live ${liveState === 'live' ? '' : 'reconnecting'}`}><i/> {liveState === 'live' ? 'LIVE' : 'CONNECTING'}</span></div><div className="studies-posts">{posts.length === 0 ? <div className="studies-empty-inline"><span>✳</span><strong>Nothing here just yet.</strong><p>When a new study note arrives, it will show up here.</p></div> : posts.map((post) => <article className="study-post" key={post.id}><div className="study-post-meta"><span className="study-admin-avatar">a.</span><div><b>#{post.author_username}</b><time>{timeAgo(post.created_at)}</time></div><span className="study-admin-label">STUDY NOTE</span></div>{post.body && <p className="study-post-body">{post.body}</p>}{!!post.attachments.length && <div className="study-attachments">{post.attachments.map((file) => <div className="study-attachment" key={file.id}><span className="study-file-icon">{file.contentType === 'application/pdf' ? 'PDF' : file.contentType.startsWith('image/') ? 'IMG' : 'DOC'}</span><span className="study-file-copy"><b>{file.fileName}</b><small>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></span><button onClick={() => void openAttachment(file)} disabled={busyFile === file.id}>{busyFile === file.id ? 'Opening…' : file.contentType.startsWith('image/') || file.contentType === 'application/pdf' ? 'Preview' : 'Download'} <ArrowUpRight size={14}/></button></div>)}</div>}</article>)}<div className="study-read-only"><BookOpen size={15}/> Only admins can post in Studies. You’re here to read and learn.</div></div></section></div>}
    {status && <div className="study-status">{status}</div>}{preview && <div className="study-preview-backdrop" onClick={() => setPreview(null)}><section className="study-preview" onClick={(event) => event.stopPropagation()}><header><strong>{preview.name}</strong><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={18}/></button></header>{preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name}/> : <iframe title={preview.name} src={preview.url}/>}</section></div>}
  </div>;
}

function timeAgo(value: string) { const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')); if (Number.isNaN(date.getTime())) return 'just now'; const min = Math.floor((Date.now() - date.getTime()) / 60000); return min < 1 ? 'just now' : min < 60 ? `${min}m ago` : `${Math.floor(min / 60)}h ago`; }

function RandomChat({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle'); const [messages, setMessages] = useState<{ body: string; mine: boolean; time: string }[]>([]); const [value, setValue] = useState(''); const socketRef = useRef<WebSocket | null>(null); const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => socketRef.current?.close(), []); useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const start = () => { setMessages([]); setState('waiting'); const socket = new WebSocket(`${WS_ORIGIN}/api/ws/random?token=${encodeURIComponent(token)}`); socketRef.current = socket; socket.onmessage = (event) => { try { const data = JSON.parse(event.data); if (data.type === 'waiting') setState('waiting'); if (data.type === 'matched') setState('matched'); if (data.type === 'message') setMessages((prev) => [...prev, { body: data.body, mine: false, time: data.created_at }]); if (data.type === 'partner-left') setState('ended'); } catch { /* ignore */ } }; socket.onclose = () => setState((s) => s === 'matched' || s === 'waiting' ? 'ended' : s); };
  const leave = () => { socketRef.current?.close(); socketRef.current = null; setState('idle'); setMessages([]); };
  const send = (e: FormEvent) => { e.preventDefault(); const body = value.trim(); if (!body || state !== 'matched') return; socketRef.current?.send(JSON.stringify({ body })); setMessages((prev) => [...prev, { body, mine: true, time: new Date().toISOString() }]); setValue(''); };
  return <div className="page-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">03</span> TWO STRANGERS, ONE CHAT</div><h1>Serendipity, <i>on tap.</i></h1><p className="subhead">No names, no IDs, no expectations. Just a conversation.</p></div></div><div className="random-layout"><section className="random-main"><div className="random-chat-head"><div className="random-spark">✳</div><div><span className="eyebrow">THE OTHER SIDE OF THE SCREEN</span><h2>{state === 'matched' ? 'A stranger just said hello.' : state === 'waiting' ? 'Looking for your person.' : state === 'ended' ? 'That was a nice little moment.' : 'Someone new is out there.'}</h2></div><div className={`anon-indicator ${state}`}><span/>{state === 'matched' ? 'CONNECTED' : state === 'waiting' ? 'SEARCHING' : 'ANONYMOUS'}</div></div><div className={`random-messages ${state === 'idle' ? 'is-idle' : ''}`}>{state === 'idle' && <div className="random-intro"><div className="anon-big">?</div><strong>Two clicks can make a new story.</strong><p>We’ll find someone else who’s also ready to chat. Your ID stays private; the conversation stays between you two.</p><span>BE KIND. BE CURIOUS. BE YOU.</span></div>}{state === 'waiting' && <div className="searching-state"><div className="search-orbit"><span/><span/><span/></div><strong>Finding your person...</strong><span>We’ll let you know the second they arrive.</span></div>}{state === 'ended' && <div className="ended-state"><span>✳</span><strong>Your chat has ended.</strong><p>Good chats don’t need names to matter.</p><button onClick={start}>Find someone else <ArrowRight size={15}/></button></div>}{messages.map((message, i) => <div className={`random-message ${message.mine ? 'mine' : ''}`} key={`${i}-${message.time}`}><div className="anon-mini">{message.mine ? 'Y' : '?'}</div><div className="random-message-body"><span>{message.mine ? 'YOU' : 'STRANGER'} · {timeAgo(message.time)}</span><p>{message.body}</p></div></div>)}<div ref={endRef}/></div><form className="composer random-composer" onSubmit={send}><input disabled={state !== 'matched'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={state === 'matched' ? 'Say hello, stranger...' : 'This box opens when you’re matched'} /><button disabled={state !== 'matched' || !value.trim()}><Send size={18}/></button></form></section><aside className="random-side"><div className="how-card"><span className="eyebrow">HOW IT WORKS</span><div className="how-step"><span>01</span><p>Tap <b>find someone</b></p></div><div className="how-step"><span>02</span><p>We pair two people waiting</p></div><div className="how-step"><span>03</span><p>Talk. Leave whenever.</p></div><div className="privacy-note"><span>✿</span><p>Your adda ID is never shared in a random chat.</p></div></div>{state === 'idle' || state === 'ended' ? <button className="find-button" onClick={start}><span>✳</span> Find someone <ArrowUpRight size={18}/></button> : <button className="leave-button" onClick={leave}><X size={16}/> Leave conversation</button>}<div className="anonymous-note"><span>THE GOOD KIND OF MYSTERY</span><p>“I like talking to people I haven’t met yet.”</p></div></aside></div><div className="bottom-rule"><span>STRANGER TODAY, NICE MEMORY TOMORROW</span><span>YOUR PRIVACY COMES FIRST&nbsp; →</span></div></div>;
}

function Game({ user, token }: { user: User; token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const scoreDisplayRef = useRef<HTMLElement>(null); const lastPointerAtRef = useRef(0); const gameRef = useRef<{ running: boolean; score: number; high: number; y: number; vy: number; obstacles: { x: number; h: number; w: number }[]; frame: number } | null>(null); const [score, setScore] = useState(0); const [high, setHigh] = useState(0); const [running, setRunning] = useState(false); const [board, setBoard] = useState<{ leaderboard: { username: string; gender: string; best_score: number }[]; totals: { gender: string; total: number }[] }>({ leaderboard: [], totals: [] });
  const loadBoard = useCallback(() => { api<typeof board>('/game/leaderboard', token).then((data) => { setBoard(data); setHigh(Number(data.leaderboard.find((row) => row.username === user.username)?.best_score ?? 0)); }).catch(() => {}); }, [token, user.username]);
  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const context = canvas.getContext('2d'); if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const width = canvas.clientWidth; const height = canvas.clientHeight; canvas.width = width * dpr; canvas.height = height * dpr; context.scale(dpr, dpr);
    let animation = 0; const state = gameRef.current ?? { running: false, score: 0, high: 0, y: height - 40, vy: 0, obstacles: [], frame: 0 }; gameRef.current = state;
    const draw = () => { context.clearRect(0, 0, width, height); context.fillStyle = '#f4f1e8'; context.fillRect(0, 0, width, height); context.strokeStyle = '#ddd8c9'; context.setLineDash([4, 6]); context.beginPath(); context.moveTo(0, height - 25); context.lineTo(width, height - 25); context.stroke(); context.setLineDash([]);
      context.fillStyle = '#242727'; context.fillRect(46, state.y - 25, 19, 25); context.fillRect(59, state.y - 32, 13, 13); context.fillStyle = '#f4f1e8'; context.fillRect(68, state.y - 28, 2.5, 2.5); context.fillStyle = '#242727'; context.fillRect(49, state.y - 3, 5, 4); context.fillRect(60, state.y - 3, 5, 4);
      if (state.running) { state.frame++; if (state.frame % 72 === 0) state.obstacles.push({ x: width + 5, h: 25 + Math.random() * 24, w: 14 + Math.random() * 10 }); state.obstacles.forEach((o) => o.x -= 4 + Math.min(state.score / 300, 5)); state.obstacles = state.obstacles.filter((o) => o.x > -35); state.y += state.vy; state.vy += 0.65; if (state.y > height - 40) { state.y = height - 40; state.vy = 0; } state.score += 0.12; const shownScore = Math.floor(state.score); if (state.frame % 6 === 0 && scoreDisplayRef.current) scoreDisplayRef.current.textContent = shownScore.toString().padStart(4, '0');
        for (const o of state.obstacles) { context.fillStyle = '#d95338'; context.fillRect(o.x, height - 25 - o.h, o.w, o.h); context.fillRect(o.x - 5, height - 14 - o.h, 8, 5); if (o.x < 66 && o.x + o.w > 46 && state.y > height - 25 - o.h) { state.running = false; setRunning(false); setScore(shownScore); setHigh((v) => Math.max(v, shownScore)); void api('/game/score', token, { method: 'POST', body: JSON.stringify({ score: shownScore }) }).then(loadBoard); } }
      } else { state.obstacles.forEach((o) => { context.fillStyle = '#d95338'; context.fillRect(o.x, height - 25 - o.h, o.w, o.h); }); }
      animation = requestAnimationFrame(draw);
    }; animation = requestAnimationFrame(draw); return () => cancelAnimationFrame(animation);
  }, [token, loadBoard]);
  const hop = useCallback(() => { const s = gameRef.current; if (!s) return; if (!s.running) { s.score = 0; s.obstacles = []; s.frame = 0; s.y = (canvasRef.current?.clientHeight ?? 200) - 40; s.running = true; setScore(0); if (scoreDisplayRef.current) scoreDisplayRef.current.textContent = '0000'; setRunning(true); } if (s.y >= (canvasRef.current?.clientHeight ?? 200) - 40) s.vy = -10.5; }, []);
  const pointerJump = useCallback((event: ReactPointerEvent<HTMLElement>) => { if (event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); lastPointerAtRef.current = performance.now(); hop(); }, [hop]);
  const keyboardClickJump = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => { if (event.detail === 0 && performance.now() - lastPointerAtRef.current > 500) hop(); }, [hop]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.code === 'Space' || event.code === 'ArrowUp') { if (document.activeElement?.tagName === 'INPUT') return; event.preventDefault(); hop(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [hop]);
  useEffect(() => { const resize = () => { const canvas = canvasRef.current; if (canvas) { const state = gameRef.current; const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; canvas.getContext('2d')?.scale(dpr, dpr); if (state && !state.running) state.y = canvas.clientHeight - 40; } }; window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const boys = Number(board.totals.find((t) => t.gender === 'male')?.total ?? 0); const girls = Number(board.totals.find((t) => t.gender === 'female')?.total ?? 0); const top = board.leaderboard[0]; const winningTeam = boys === girls ? null : boys > girls ? 'male' : 'female';
  return <div className="page-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">02</span> THE FRIENDLY RIVALRY</div><h1>Run, little <i>dino.</i></h1><p className="subhead">One jump at a time. One more try, every time.</p></div><div className="best-score"><span>YOUR BEST</span><b>{Math.max(high, score).toLocaleString()}</b><small>POINTS</small></div></div><div className="game-layout"><section className="game-panel"><div className="game-head"><div><span className="eyebrow">THE GREAT ADDA DINO DASH</span><h2>Ready, set, <i>hop!</i></h2></div><div className="score-live"><span>RUN SCORE</span><b ref={scoreDisplayRef}>0000</b></div></div><div className="game-scene" onPointerDown={pointerJump}><canvas ref={canvasRef}/>{!running && <button className="play-overlay" onPointerDown={(event) => { event.stopPropagation(); pointerJump(event); }} onClick={keyboardClickJump}><span>{score ? 'AGAIN?' : 'READY?'}</span><strong>{score ? 'Run it back.' : 'Let’s go!'}</strong><span className="play-arrow"><ArrowUpRight size={20}/></span></button>}<span className="scene-label">SPACE / ↑ / TAP TO JUMP</span></div><div className="game-controls"><div className="controls-copy"><span className="eyebrow">HOW TO PLAY</span><p>Jump over the cacti. Chase your best. <i>Repeat forever.</i></p></div><button className="jump-button" onPointerDown={pointerJump} onClick={keyboardClickJump}><ArrowUpRight size={18}/>{running ? 'JUMP!' : 'START RUN'}</button></div></section><aside className="leaderboard-panel"><div className="leader-head"><span className="eyebrow">THE SCOREBOARD</span><span className="trophy">✳</span><h2>For the <i>glory.</i></h2></div><div className="group-scores"><div className={`group-score boy ${winningTeam === 'male' ? 'team-champion' : ''}`}><span>THE BOYS</span><b>{boys.toLocaleString()}</b><small>TOTAL POINTS</small><span className="score-sun">✳</span>{winningTeam === 'male' && <span className="team-thaggedele">✳ THAGGEDELE</span>}</div><div className={`group-score girl ${winningTeam === 'female' ? 'team-champion' : ''}`}><span>THE GIRLS</span><b>{girls.toLocaleString()}</b><small>TOTAL POINTS</small><span className="score-sun">✳</span>{winningTeam === 'female' && <span className="team-thaggedele">✳ THAGGEDELE</span>}</div></div><div className="leader-list-head"><span>TOP RUNNERS</span><span>BEST SCORE</span></div><div className="leader-list">{board.leaderboard.slice(0, 5).map((entry, i) => <div className={`leader-row ${entry.username === user.username ? 'leader-me' : ''}`} key={entry.username}><span className="rank">{String(i + 1).padStart(2, '0')}</span><span className="leader-name">#{entry.username}{entry.username === user.username && <small>THAT’S YOU</small>}</span><b>{entry.best_score}</b></div>)}{!board.leaderboard.length && <div className="no-scores">The board is wide open.<br/>Make the first run count.</div>}</div>{top && <div className="champion-card"><div className="champion-seal">✳</div><div><span>THE ONE TO BEAT</span><strong>#{top.username} <i>·</i> {top.best_score} pts</strong></div></div>}</aside></div><div className="bottom-rule"><span>THE LONGER YOU RUN, THE HARDER IT GETS</span><span>YOU’VE GOT THIS&nbsp; →</span></div></div>;
}

function Profile({ user, token, onUser, onSignOut, notify }: { user: User; token: string; onUser: (u: User) => void; onSignOut: () => void; notify: (message: string) => void }) {
  const [username, setUsername] = useState(user.username); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [signingOut, setSigningOut] = useState(false);
  const save = async (e: FormEvent) => { e.preventDefault(); setError(''); setBusy(true); try { const data = await api<{ user: User }>('/me/username', token, { method: 'PATCH', body: JSON.stringify({ username }) }); onUser(data.user); setUsername(data.user.username); notify('Your adda ID has a new ring to it.'); } catch (ex) { setError(ex instanceof Error ? ex.message : 'Could not save your ID.'); } finally { setBusy(false); } };
  const signOut = async () => {
    setSigningOut(true); setError('');
    try { await removeCurrentPushSubscription(token); onSignOut(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : 'Could not turn off this device’s notifications before signing out.'); }
    finally { setSigningOut(false); }
  };
  return <div className="page-wrap profile-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-number">04</span> YOUR LITTLE CORNER</div><h1>All about <i>you.</i></h1><p className="subhead">The way people find you around here.</p></div></div><div className="profile-layout"><section className="profile-card"><div className="profile-card-top"><div className="profile-avatar">{user.username[0]?.toUpperCase()}</div><div><span className="eyebrow">YOUR ADDA ID</span><h2>#{user.username}</h2><span className="profile-sub">A little ID, just for you.</span></div><span className="profile-spark">✳</span></div><form onSubmit={save} className="profile-form"><Field label="YOUR PUBLIC ID"><div className="id-input"><span>#</span><input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18))} minLength={3} maxLength={18} required/><Hash size={17}/></div></Field><div className="id-help"><CircleHelp size={15}/><span>People can use this ID to find you. Make it yours, and keep it unique.</span></div>{error && <div className="form-error">{error}</div>}<button className="profile-save" disabled={busy || username === user.username}>{busy ? <LoaderCircle className="spin" size={17}/> : <>Save my new ID <ArrowUpRight size={16}/></>}</button></form><div className="profile-facts"><div><span>YOUR NAME</span><b>{user.name}</b></div><div><span>HERE AS</span><b>{user.gender === 'female' ? 'Female' : 'Male'}</b></div><div><span>MEMBER SINCE</span><b>Just now-ish</b></div></div></section><aside className="profile-side"><PushNotificationSettings token={token}/><div className="profile-note"><span>✿</span><h3>One ID.<br/><i>All your people.</i></h3><p>Your messages and your score stay tied to this account. If you change your ID, your friends will need your new one.</p></div><button className="signout-button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? <LoaderCircle className="spin" size={17}/> : <LogOut size={17}/>} Sign out of adda <ArrowUpRight size={15}/></button>{error && <div className="form-error">{error}</div>}<div className="safe-note"><span>⌑</span><p>Your password is private, always. We never display it or share it with anyone.</p></div></aside></div></div>;
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
  await api('/me/push-subscriptions', token, { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}

function PushNotificationSettings({ token }: { token: string }) {
  const [enabled, setEnabled] = useState(false); const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default'); const [available, setAvailable] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) { setAvailable(false); setPermission('unsupported'); return; }
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
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) throw new Error('Install or refresh adda, then try again.');
      const current = await registration.pushManager.getSubscription();
      if (enabled && current) {
        await api('/me/push-subscriptions', token, { method: 'DELETE', body: JSON.stringify({ endpoint: current.endpoint }) });
        await current.unsubscribe(); setEnabled(false); setMessage('Notifications are off for this device.'); return;
      }
      if (Notification.permission === 'denied') throw new Error('Notifications are blocked in your browser settings. Allow adda notifications there, then try again.');
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') throw new Error('Allow notifications in the browser prompt to turn them on.');
      const { publicKey } = await api<{ publicKey: string }>('/notifications/vapid-public-key', token);
      const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) as BufferSource });
      await api('/me/push-subscriptions', token, { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
      setEnabled(true); setMessage('Notifications are on for this device.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update notification settings.'); }
    finally { setBusy(false); }
  };

  return <section className="push-settings"><div className="push-settings-heading"><span className="push-settings-icon"><Bell size={17}/></span><div><strong>Push notifications</strong><small>{enabled ? 'ON FOR THIS DEVICE' : permission === 'denied' ? 'BLOCKED IN BROWSER SETTINGS' : 'OPTIONAL · THIS DEVICE'}</small></div></div><p>Get community announcements, even when adda is closed.</p>{available ? <button className={`push-toggle ${enabled ? 'enabled' : ''}`} onClick={() => void toggle()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : enabled ? <><BellOff size={15}/> Turn off notifications</> : <><Bell size={15}/> Enable notifications</>}</button> : <div className="push-unavailable">This browser does not support push notifications. Try a supported browser or install adda on your device.</div>}{message && <div className={`push-feedback ${enabled ? 'success' : ''}`} role="status">{message}</div>}</section>;
}

export default App;
