import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, Mic, MicOff, Phone, PhoneCall, PhoneOff, X } from 'lucide-react';
import './voice-calls.css';

const API_ORIGIN = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev')
  ? 'https://student-addit.mgp899123.workers.dev' : '';
const API = API_ORIGIN + '/api';
const WS = API_ORIGIN ? API_ORIGIN.replace(/^http/, 'ws') : location.protocol + '//' + location.host;
type CallStatus = 'ringing' | 'accepted' | 'connected' | 'declined' | 'cancelled' | 'missed' | 'completed' | 'ended' | 'failed';
type VoiceCall = {
  callId: string;
  scope: 'dm' | 'random';
  conversationId: string | null;
  matchId: string | null;
  status: CallStatus;
  isCaller: boolean;
  peerLabel: string;
  createdAt: string;
  connectedAt?: string | null;
  durationSeconds: number;
};
type VoiceCallsContext = {
  call: VoiceCall | null;
  busy: boolean;
  startDmCall: (conversationId: string) => Promise<void>;
  startRandomCall: (matchId: string) => Promise<void>;
};
type Signal = { type: 'offer' | 'answer'; description: RTCSessionDescriptionInit } | { type: 'ice'; candidate: RTCIceCandidateInit } | { type: 'connected' };
type PeerSession = { callId: string; cancelled: boolean; pc: RTCPeerConnection | null; stream: MediaStream | null; socket: WebSocket | null; reconnectTimer: ReturnType<typeof setTimeout> | null; reconnects: number; offerStarted: boolean; queuedCandidates: RTCIceCandidateInit[]; queuedSignals: Signal[]; remoteCandidates: RTCIceCandidateInit[] };
const VoiceCallsContext = createContext<VoiceCallsContext | null>(null);

async function callApi<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, { ...init, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Could not connect the call.') as Error & { status: number }; error.status = response.status; throw error; }
  return data as T;
}

const active = (status: CallStatus) => status === 'ringing' || status === 'accepted' || status === 'connected';
const terminalLabel: Record<string, string> = { declined: 'Call declined', cancelled: 'Call cancelled', missed: 'Missed call', completed: 'Call ended', ended: 'Call ended', failed: 'Call could not connect' };

class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private intervalId: number | null = null;
  private isPlaying = false;

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      this.ringBurst();
      this.intervalId = window.setInterval(() => this.ringBurst(), 4000);
    } catch { /* AudioContext might await user gesture */ }
  }

  private ringBurst() {
    if (!this.ctx || !this.isPlaying) return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain.gain.setValueAtTime(0.12, now + 1.8);
      gain.gain.linearRampToValueAtTime(0, now + 1.95);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.0);
      osc2.stop(now + 2.0);
    } catch { /* ignore audio graph exceptions */ }
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      try { void this.ctx.close().catch(() => {}); } catch { /* ignore */ }
      this.ctx = null;
    }
  }
}

export function VoiceCallsProvider({ token, children }: { token: string; children: ReactNode }) {
  const [call, setCall] = useState<VoiceCall | null>(null);
  const [connection, setConnection] = useState('Waiting for the other person');
  const [mediaError, setMediaError] = useState('');
  const [muted, setMuted] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [, setClock] = useState(0);
  const callRef = useRef<VoiceCall | null>(null);
  const inboxRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const terminalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringtoneRef = useRef<RingtonePlayer>(new RingtonePlayer());

  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => { if (call) setMinimized(false); }, [call?.callId]);

  useEffect(() => {
    const ringtone = ringtoneRef.current;
    if (call && call.status === 'ringing' && !call.isCaller) {
      ringtone.start();
    } else {
      ringtone.stop();
    }
    return () => ringtone.stop();
  }, [call?.callId, call?.status, call?.isCaller]);

  const stopPeer = useCallback(() => {
    const peer = peerRef.current;
    if (!peer) return;
    peer.cancelled = true;
    if (peer.reconnectTimer) clearTimeout(peer.reconnectTimer);
    peer.socket?.close(1000, 'Call ended');
    peer.pc?.close();
    peer.stream?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    peerRef.current = null;
  }, []);

  const setCallUpdate = useCallback((next: VoiceCall | null) => {
    if (!next) return;
    callRef.current = next;
    setCall(next);
    if (active(next.status)) {
      if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current);
      terminalTimerRef.current = null;
      return;
    }
    setConnection(terminalLabel[next.status] || 'Call ended');
    setMediaError('');
    stopPeer();
    if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current);
    terminalTimerRef.current = setTimeout(() => setCall((current) => current?.callId === next.callId && !active(current.status) ? null : current), 12_000);
  }, [stopPeer]);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wait = 1000;

    const scheduleReconnect = () => {
      if (stopped || timer !== null) return;
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden' && (!callRef.current || !active(callRef.current.status));
      const delay = isHidden ? Math.max(wait, 45_000) : wait;
      wait = Math.min(wait * 2, 30_000);
      timer = setTimeout(() => {
        timer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const result = await callApi<{ ticket: string }>('/calls/ws-ticket', token, { method: 'POST', body: JSON.stringify({ purpose: 'inbox' }) });
        if (stopped) return;
        const ws = new WebSocket(WS + '/api/ws/call-inbox?ticket=' + encodeURIComponent(result.ticket));
        socket = ws;
        inboxRef.current = ws;
        ws.onopen = () => {
          wait = 1000;
          const current = callRef.current;
          if (current && active(current.status)) void callApi<{ call: VoiceCall }>('/calls/' + encodeURIComponent(current.callId), token).then((result) => setCallUpdate(result.call)).catch((error) => {
            if (error instanceof Error && 'status' in error && error.status === 404 && callRef.current?.callId === current.callId) setCallUpdate({ ...current, status: 'ended' });
          });
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as { type?: string; call?: VoiceCall; callId?: string };
            if (data.type === 'call-update' && data.call) setCallUpdate(data.call);
            if (data.type === 'call-ended' && data.callId && callRef.current?.callId === data.callId) setCallUpdate({ ...callRef.current, status: 'ended' });
          } catch { /* Ignore invalid inbox frames. */ }
        };
        ws.onclose = () => {
          if (inboxRef.current === ws) inboxRef.current = null;
          if (!stopped) scheduleReconnect();
        };
        ws.onerror = () => ws.close();
      } catch {
        if (!stopped) scheduleReconnect();
      }
    };
    void connect();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !stopped) {
        if (!inboxRef.current || inboxRef.current.readyState === WebSocket.CLOSED || inboxRef.current.readyState === WebSocket.CLOSING) {
          if (timer !== null) { clearTimeout(timer); timer = null; }
          wait = 1000;
          void connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      socket?.close();
      if (inboxRef.current === socket) inboxRef.current = null;
    };
  }, [token, setCallUpdate]);

  const startPeer = useCallback(async (current: VoiceCall) => {
    if (peerRef.current?.callId === current.callId) return;
    stopPeer();
    const session: PeerSession = { callId: current.callId, cancelled: false, pc: null, stream: null, socket: null, reconnectTimer: null, reconnects: 0, offerStarted: false, queuedCandidates: [], queuedSignals: [], remoteCandidates: [] };
    peerRef.current = session;
    setMediaError('');
    setMuted(false);
    setConnection('Preparing your microphone…');
    const send = (message: Signal) => {
      if (session.cancelled) return;
      if (session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify(message));
      else session.queuedSignals.push(message);
    };
    const openSession = async () => {
      if (session.cancelled || session.reconnects > 8) return;
      try {
        const ticket = await callApi<{ ticket: string }>('/calls/ws-ticket', token, { method: 'POST', body: JSON.stringify({ purpose: 'session', callId: current.callId }) });
        if (session.cancelled) return;
        const ws = new WebSocket(WS + '/api/ws/call-session?callId=' + encodeURIComponent(current.callId) + '&ticket=' + encodeURIComponent(ticket.ticket));
        session.socket = ws;
        ws.onopen = () => {
          session.reconnects = 0;
          setConnection('Signaling connected · waiting for audio');
          for (const message of session.queuedSignals.splice(0)) ws.send(JSON.stringify(message));
          for (const candidate of session.queuedCandidates.splice(0)) ws.send(JSON.stringify({ type: 'ice', candidate }));
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as { type?: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; status?: CallStatus };
            const pc = session.pc;
            if (!pc) return;
            if (data.type === 'ready' && current.isCaller) {
              const restartIce = session.offerStarted;
              session.offerStarted = true;
              void pc.createOffer(restartIce ? { iceRestart: true } : undefined).then((offer) => pc.setLocalDescription(offer)).then(() => { if (pc.localDescription) send({ type: 'offer', description: pc.localDescription.toJSON() }); }).catch(() => setMediaError('Could not start the voice connection.'));
            } else if (data.type === 'offer' && data.description) {
              void pc.setRemoteDescription(data.description).then(async () => {
                for (const candidate of session.remoteCandidates.splice(0)) await pc.addIceCandidate(candidate);
                const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
                if (pc.localDescription) send({ type: 'answer', description: pc.localDescription.toJSON() });
              }).catch(() => setMediaError('Could not accept the voice connection.'));
            } else if (data.type === 'answer' && data.description) {
              void pc.setRemoteDescription(data.description).then(async () => { for (const candidate of session.remoteCandidates.splice(0)) await pc.addIceCandidate(candidate); }).catch(() => setMediaError('Could not finish setting up the voice connection.'));
            } else if (data.type === 'ice' && data.candidate) {
              if (pc.remoteDescription) void pc.addIceCandidate(data.candidate).catch(() => {});
              else session.remoteCandidates.push(data.candidate);
            } else if (data.type === 'call-ended') setCallUpdate({ ...current, status: data.status || 'ended' });
          } catch { /* Ignore malformed signaling messages. */ }
        };
        ws.onclose = () => {
          if (session.cancelled || session.socket !== ws) return;
          session.socket = null;
          session.reconnects += 1;
          session.reconnectTimer = setTimeout(() => void openSession(), Math.min(1000 * Math.min(session.reconnects, 4), 4000));
        };
        ws.onerror = () => ws.close();
      } catch (error) {
        if (session.cancelled) return;
        session.reconnects += 1;
        session.reconnectTimer = setTimeout(() => void openSession(), Math.min(1000 * Math.min(session.reconnects, 4), 4000));
      }
    };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires a supported browser and a secure connection.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (session.cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      session.stream = stream;
      const config = await callApi<{ iceServers: RTCIceServer[] }>('/calls/' + encodeURIComponent(current.callId) + '/ice-servers', token, { method: 'POST', body: '{}' });
      if (session.cancelled) return;
      const pc = new RTCPeerConnection({ iceServers: config.iceServers, iceTransportPolicy: current.scope === 'random' ? 'relay' : 'all' });
      session.pc = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => { if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play().catch(() => {}); } };
      pc.onicecandidate = (event) => { if (!event.candidate) return; const candidate = event.candidate.toJSON(); if (session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({ type: 'ice', candidate })); else session.queuedCandidates.push(candidate); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { setConnection('Voice connected'); send({ type: 'connected' }); }
        else if (pc.connectionState === 'connecting' || pc.iceConnectionState === 'checking') setConnection('Connecting audio…');
        else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setConnection('Reconnecting audio…');
          if (session.pc && !session.cancelled) {
            void session.pc.createOffer({ iceRestart: true }).then((offer) => session.pc?.setLocalDescription(offer)).then(() => {
              if (session.pc?.localDescription) send({ type: 'offer', description: session.pc.localDescription.toJSON() });
            }).catch(() => {});
          }
        }
      };
      await openSession();
    } catch (error) {
      const message = error instanceof Error && error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access and try the call again.'
        : error instanceof Error && error.name === 'NotFoundError' ? 'No microphone was found on this device.'
        : error instanceof Error ? error.message : 'Could not start the call.';
      setMediaError(message);
      setConnection('Microphone unavailable');
      stopPeer();
    }
  }, [setCallUpdate, stopPeer, token]);

  useEffect(() => {
    if (call && (call.status === 'accepted' || call.status === 'connected')) void startPeer(call);
    else if (!call || !active(call.status)) stopPeer();
  }, [call?.callId, call?.status, startPeer, stopPeer]);

  useEffect(() => {
    if (!call || call.status !== 'connected') return;
    const timer = setInterval(() => setClock((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [call?.callId, call?.status]);

  useEffect(() => {
    const handleWakeup = () => {
      if (document.visibilityState === 'visible') {
        const current = callRef.current;
        if (current && active(current.status)) {
          // Re-verify call status from API in case anything changed while screen was off
          void callApi<{ call: VoiceCall }>('/calls/' + encodeURIComponent(current.callId), token).then((result) => setCallUpdate(result.call)).catch(() => {});
          // If audio paused during screen lock, resume playback
          if (audioRef.current && audioRef.current.paused && current.status === 'connected') {
            void audioRef.current.play().catch(() => {});
          }
          // Wake up signaling session if socket dropped during sleep
          const peer = peerRef.current;
          if (peer && !peer.cancelled && (!peer.socket || peer.socket.readyState !== WebSocket.OPEN)) {
            if (peer.reconnectTimer) clearTimeout(peer.reconnectTimer);
            peer.reconnectTimer = null;
            if (active(current.status)) void startPeer(current);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);
    return () => {
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
    };
  }, [token, setCallUpdate, startPeer]);

  useEffect(() => () => {
    if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current);
    const current = callRef.current;
    if (current && active(current.status)) void callApi('/calls/' + encodeURIComponent(current.callId) + '/action', token, { method: 'POST', body: JSON.stringify({ action: 'end' }) }).catch(() => {});
    stopPeer();
  }, [stopPeer, token]);

  const action = useCallback(async (actionName: 'accept' | 'decline' | 'cancel' | 'end') => {
    const current = callRef.current;
    if (!current || actionBusy) return;
    setActionBusy(true);
    try {
      const result = await callApi<{ status: CallStatus }>('/calls/' + encodeURIComponent(current.callId) + '/action', token, { method: 'POST', body: JSON.stringify({ action: actionName }) });
      if (actionName === 'accept') { const accepted = { ...current, status: 'accepted' as const }; callRef.current = accepted; setCall(accepted); setConnection('Preparing your microphone…'); }
      else setCallUpdate({ ...current, status: result.status });
    } catch (error) { setMediaError(error instanceof Error ? error.message : 'Could not update the call.'); }
    finally { setActionBusy(false); }
  }, [actionBusy, setCallUpdate, token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const incomingCallId = params.get('call');
    const autoAccept = params.get('autoAccept') === '1';

    if (incomingCallId) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('call');
      cleanUrl.searchParams.delete('autoAccept');
      window.history.replaceState({}, '', cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);

      void callApi<{ call: VoiceCall }>('/calls/' + encodeURIComponent(incomingCallId), token)
        .then((res) => {
          if (res.call && active(res.call.status)) {
            setCallUpdate(res.call);
            if (autoAccept && res.call.status === 'ringing' && !res.call.isCaller) {
              void action('accept');
            }
          }
        })
        .catch(() => {});
    }
  }, [token, action, setCallUpdate]);

  const startCall = useCallback(async (scope: 'dm' | 'random', target: string) => {
    if (callRef.current && active(callRef.current.status)) throw new Error('Finish your current call before starting another.');
    const body = scope === 'dm' ? { scope, conversationId: target } : { scope, matchId: target };
    const result = await callApi<{ call: VoiceCall }>('/calls', token, { method: 'POST', body: JSON.stringify(body) });
    callRef.current = result.call;
    setCall(result.call);
    setConnection('Ringing…');
    setMediaError('');
  }, [token]);

  const toggleMute = () => {
    const stream = peerRef.current?.stream;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const contextValue = useMemo<VoiceCallsContext>(() => ({ call, busy: !!call && active(call.status), startDmCall: (id) => startCall('dm', id), startRandomCall: (id) => startCall('random', id) }), [call, startCall]);
  const seconds = call?.status === 'connected' ? call.connectedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(call.connectedAt.replace(' ', 'T') + (call.connectedAt.includes('Z') ? '' : 'Z'))) / 1000)) : 0 : call?.durationSeconds || 0;
  const duration = Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
  const dismiss = () => { if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current); terminalTimerRef.current = null; callRef.current = null; setCall(null); setMediaError(''); };

  return <VoiceCallsContext.Provider value={contextValue}>{children}<audio ref={audioRef} className="voice-call-audio" autoPlay playsInline onPause={() => { if (callRef.current?.status === 'connected') void audioRef.current?.play().catch(() => {}); }}/><div className="voice-call-layer" aria-live="polite">
    {call && <section className={'voice-call-card ' + (call.status === 'ringing' && !call.isCaller ? 'incoming' : '') + (minimized ? ' minimized' : '')}>
      <div className="voice-call-card-head"><span className="voice-call-icon"><PhoneCall size={17}/></span><div><small>{call.scope === 'random' ? 'RANDOM CHAT' : 'PRIVATE CHAT'} · {minimized ? (active(call.status) ? connection : terminalLabel[call.status] || 'Call ended') : ''}</small><strong>{call.peerLabel}</strong></div>{call.status === 'connected' && <span className="voice-call-duration">{duration}</span>}{active(call.status) && <span className="voice-call-live-dot"/>}<button className="voice-call-collapse" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? 'Expand call controls' : 'Minimize call controls'}>{minimized ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}</button></div>
      {!minimized && <>
      {call.status === 'ringing' && !call.isCaller ? <><p className="voice-call-copy">is asking to talk by voice</p><div className="voice-call-actions"><button className="voice-call-accept" disabled={actionBusy} onClick={() => void action('accept')}><Check size={15}/> Accept</button><button className="voice-call-decline" disabled={actionBusy} onClick={() => void action('decline')}><PhoneOff size={15}/> Decline</button></div></>
        : call.status === 'ringing' ? <><p className="voice-call-copy">Calling… waiting for an answer</p><button className="voice-call-hangup" disabled={actionBusy} onClick={() => void action('cancel')}><PhoneOff size={15}/> Cancel call</button></>
        : call.status === 'accepted' || call.status === 'connected' ? <><p className="voice-call-copy">{connection}{call.status === 'connected' ? ' · ' + duration : ''}</p>{mediaError && <p className="voice-call-error" role="alert">{mediaError}</p>}<div className="voice-call-actions"><button className="voice-call-mute" onClick={toggleMute} disabled={!peerRef.current?.stream}><span>{muted ? <MicOff size={15}/> : <Mic size={15}/>}</span>{muted ? 'Unmute' : 'Mute'}</button><button className="voice-call-decline" disabled={actionBusy} onClick={() => void action('end')}><PhoneOff size={15}/> Hang up</button></div></>
        : <><p className="voice-call-copy">{terminalLabel[call.status] || 'Call ended'}{call.durationSeconds > 0 ? ' · ' + duration : ''}</p>{mediaError && <p className="voice-call-error" role="alert">{mediaError}</p>}<button className="voice-call-dismiss" onClick={dismiss} aria-label="Dismiss call notice"><X size={15}/> Dismiss</button></>}
      </>}
    </section>}
  </div></VoiceCallsContext.Provider>;
}

export function useVoiceCalls() {
  const context = useContext(VoiceCallsContext);
  if (!context) throw new Error('useVoiceCalls must be used inside VoiceCallsProvider');
  return context;
}

export function CallButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="voice-call-button" onClick={onClick} disabled={disabled} title="Start a voice call" aria-label="Start a voice call"><Phone size={16}/><span>Call</span></button>;
}
