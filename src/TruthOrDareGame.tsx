import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  Send,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import './truth-or-dare.css';

export type TruthOrDareGameState = {
  version: 1;
  round: number;
  asker_id: string;
  target_id: string;
  phase:
    | 'awaiting_choice'
    | 'awaiting_prompt'
    | 'awaiting_answer'
    | 'performing_dare'
    | 'round_completed';
  choice: 'truth' | 'dare' | null;
  prompt: string | null;
  answer: string | null;
  dare_status?: 'idle' | 'running' | 'completed' | 'forfeited';
  dare_started_at?: number | null;
  dare_duration_seconds: number;
  forfeited?: boolean;
};

export interface TruthOrDareGameProps {
  game: {
    id: string;
    conversation_id: string;
    game_type: 'tictactoe' | 'truth_or_dare';
    player_x_id: string;
    player_x_username: string;
    player_o_id: string;
    player_o_username: string;
    turn_user_id: string;
    status: 'in_progress' | 'won' | 'draw' | 'abandoned';
    board_state: any;
    score_x?: number;
    score_o?: number;
  };
  currentUser: { id: string; username: string } | null | undefined;
  socket: WebSocket | null;
  todSignal?: { signal: any; senderId: string } | null;
  onAbandon: () => void;
  onClose: () => void;
}

export const TruthOrDareGame: React.FC<TruthOrDareGameProps> = ({
  game,
  currentUser,
  socket,
  todSignal,
  onAbandon,
  onClose,
}) => {
  // Extract state
  const state: TruthOrDareGameState = (game.board_state && typeof game.board_state === 'object' && !Array.isArray(game.board_state))
    ? (game.board_state as TruthOrDareGameState)
    : {
        version: 1,
        round: 1,
        asker_id: game.player_x_id,
        target_id: game.player_o_id,
        phase: 'awaiting_choice',
        choice: null,
        prompt: null,
        answer: null,
        dare_status: 'idle',
        dare_started_at: null,
        dare_duration_seconds: 30,
        forfeited: false,
      };

  const isAsker = currentUser?.id === state.asker_id;
  const isTarget = currentUser?.id === state.target_id;
  const isOfferer = currentUser?.id === game.player_x_id;

  const askerUsername = state.asker_id === game.player_x_id ? game.player_x_username : game.player_o_username;
  const targetUsername = state.target_id === game.player_x_id ? game.player_x_username : game.player_o_username;

  // Local state
  const [promptText, setPromptText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [partnerDisconnected, setPartnerDisconnected] = useState(false);

  // WebRTC refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const dareCompleteSentRef = useRef<boolean>(false);

  const cleanupMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  useEffect(() => {
    return () => cleanupMedia();
  }, []);

  // Clean prompt and answer fields when phase resets
  useEffect(() => {
    if (state.phase === 'awaiting_prompt') {
      setPromptText('');
    }
    if (state.phase === 'awaiting_answer') {
      setAnswerText('');
    }
    if (state.phase !== 'performing_dare') {
      dareCompleteSentRef.current = false;
      cleanupMedia();
    }
  }, [state.phase]);

  // Handle choice submission
  const handleChoose = (choice: 'truth' | 'dare') => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'tod-choice',
      gameId: game.id,
      choice,
    }));
  };

  // Handle prompt submission
  const handleSubmitPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'tod-prompt',
      gameId: game.id,
      prompt: promptText.trim(),
    }));
  };

  // Handle truth answer submission
  const handleSubmitAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerText.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'tod-answer',
      gameId: game.id,
      answer: answerText.trim(),
    }));
  };

  // Handle forfeit (Bug #49: clean up hardware immediately)
  const handleForfeit = () => {
    cleanupMedia();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'tod-forfeit',
      gameId: game.id,
    }));
  };

  // Handle next round
  const handleNextRound = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'tod-next-round',
      gameId: game.id,
    }));
  };

  // ==========================================
  // WebRTC & Media Stream Logic for 30s Dare
  // ==========================================
  useEffect(() => {
    if (state.phase !== 'performing_dare') {
      cleanupMedia();
      return;
    }

    let isCancelled = false;
    dareCompleteSentRef.current = false;
    setCameraError(null);
    setPartnerDisconnected(false);

    const initDareVideoCall = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access not supported on this device/connection.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          void localVideoRef.current.play().catch(() => {});
        }

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        pcRef.current = pc;
        queuedCandidatesRef.current = [];

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Listen for remote tracks
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            void remoteVideoRef.current.play().catch(() => {});
          }
        };

        // Listen for connection state changes to catch peer drops (Bug #52)
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setPartnerDisconnected(true);
            cleanupMedia();
          }
        };

        // Send local ICE candidates to peer
        pc.onicecandidate = (event) => {
          if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              action: 'tod-signal',
              gameId: game.id,
              signal: { type: 'candidate', candidate: event.candidate.toJSON() },
            }));
          }
        };

        // Caller side creates and sends offer
        if (isOfferer) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              action: 'tod-signal',
              gameId: game.id,
              signal: { type: 'offer', sdp: offer.sdp },
            }));
          }
        }
      } catch (err: any) {
        console.error('Camera/WebRTC failed for Dare:', err);
        if (!isCancelled) {
          setCameraError(err?.message || 'Could not start camera. Check browser permissions.');
        }
      }
    };

    void initDareVideoCall();

    return () => {
      isCancelled = true;
      cleanupMedia();
    };
  }, [state.phase, facingMode, isOfferer, game.id]);

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (state.phase !== 'performing_dare' || !todSignal || todSignal.senderId === currentUser?.id) return;
    const { signal } = todSignal;
    const pc = pcRef.current;
    if (!pc) return;

    const processSignal = async () => {
      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          // Drain queued ICE candidates
          while (queuedCandidatesRef.current.length > 0) {
            const cand = queuedCandidatesRef.current.shift();
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              action: 'tod-signal',
              gameId: game.id,
              signal: { type: 'answer', sdp: answer.sdp },
            }));
          }
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          // Drain queued ICE candidates
          while (queuedCandidatesRef.current.length > 0) {
            const cand = queuedCandidatesRef.current.shift();
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            queuedCandidatesRef.current.push(signal.candidate);
          }
        }
      } catch (err) {
        console.warn('Error processing tod-signal:', err);
      }
    };

    void processSignal();
  }, [todSignal, state.phase, currentUser?.id, socket, game.id]);

  // 30-Second Countdown Timer
  useEffect(() => {
    if (state.phase !== 'performing_dare') return;

    const updateTimer = () => {
      const startTime = state.dare_started_at || Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0 && !dareCompleteSentRef.current) {
        dareCompleteSentRef.current = true;
        cleanupMedia();
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            action: 'tod-dare-complete',
            gameId: game.id,
          }));
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [state.phase, state.dare_started_at, socket, game.id]);

  // Media Controls
  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const nextState = !micEnabled;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = nextState; });
    setMicEnabled(nextState);
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const nextState = !videoEnabled;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = nextState; });
    setVideoEnabled(nextState);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const manualCompleteDare = () => {
    if (dareCompleteSentRef.current) return;
    dareCompleteSentRef.current = true;
    cleanupMedia();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        action: 'tod-dare-complete',
        gameId: game.id,
      }));
    }
  };

  return (
    <div className="tod-container">
      {/* Header */}
      <div className="tod-header">
        <div className="tod-title-box">
          <span className="tod-sparkle-icon"><Sparkles size={14} /></span>
          <span>Truth or Dare</span>
          <span className="tod-round-badge">R{state.round}</span>
        </div>

        <div className="tod-players-badge-group">
          <span className={`tod-player-pill ${isAsker ? 'is-turn' : ''}`} title={`Asker: #${askerUsername}`}>
            Ask: #{askerUsername}
          </span>
          <span className={`tod-player-pill ${isTarget ? 'is-turn' : ''}`} title={`Target: #${targetUsername}`}>
            Dare: #{targetUsername}
          </span>
          <button type="button" className="tod-close-btn" onClick={state.phase !== 'round_completed' ? onAbandon : onClose} aria-label="Close game">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Phase Banner */}
      <div className="tod-phase-banner">
        <span className="tod-turn-pulse" />
        {state.phase === 'awaiting_choice' && (
          isTarget ? "Your turn! Choose Truth or Dare below:" : `Waiting for #${targetUsername} to choose Truth or Dare...`
        )}
        {state.phase === 'awaiting_prompt' && (
          isAsker
            ? `Your turn! Enter a custom ${state.choice === 'truth' ? 'Truth question' : 'Dare challenge'}:`
            : `Waiting for #${askerUsername} to give you a ${state.choice === 'truth' ? 'Truth question' : 'Dare challenge'}...`
        )}
        {state.phase === 'awaiting_answer' && (
          isTarget ? "Your turn! Answer the Truth honestly:" : `Waiting for #${targetUsername} to answer...`
        )}
        {state.phase === 'performing_dare' && (
          "⚡ Live 30-Second Dare Video Call in Progress!"
        )}
        {state.phase === 'round_completed' && (
          state.forfeited ? "🐔 Round ended: Chickened Out!" : "🎉 Round Completed!"
        )}
      </div>

      {/* Main Body */}
      <div className="tod-body">
        {/* PHASE 1: Awaiting Choice */}
        {state.phase === 'awaiting_choice' && (
          <>
            {isTarget ? (
              <>
                <div className="tod-choice-prompt">
                  <h3>Pick Your Challenge</h3>
                  <p>Choose wisely — once picked, there’s no turning back!</p>
                </div>
                <div className="tod-choices-grid">
                  <button type="button" className="tod-choice-card truth" onClick={() => handleChoose('truth')}>
                    <div className="tod-choice-icon"><Sparkles size={22} /></div>
                    <div className="tod-choice-name">Truth 💭</div>
                    <div className="tod-choice-desc">Answer 100% honestly to any question asked.</div>
                  </button>

                  <button type="button" className="tod-choice-card dare" onClick={() => handleChoose('dare')}>
                    <div className="tod-choice-icon"><Video size={22} /></div>
                    <div className="tod-choice-name">Dare ⚡</div>
                    <div className="tod-choice-desc">Face a live 30-second camera dare challenge!</div>
                  </button>
                </div>
              </>
            ) : (
              <div className="tod-waiting-card">
                <div className="tod-waiting-spinner" />
                <p className="tod-waiting-text">Waiting for #{targetUsername} to choose Truth or Dare...</p>
              </div>
            )}
          </>
        )}

        {/* PHASE 2: Awaiting Prompt */}
        {state.phase === 'awaiting_prompt' && (
          <>
            {isAsker ? (
              <form onSubmit={handleSubmitPrompt} className="tod-input-group">
                <div className="tod-input-label">
                  <span>
                    {state.choice === 'truth'
                      ? `Ask #${targetUsername} a Truth question:`
                      : `Dare #${targetUsername} for 30s camera:`}
                  </span>
                  <span className="tod-char-count">{promptText.length}/400</span>
                </div>
                <textarea
                  className="tod-textarea"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value.slice(0, 400))}
                  placeholder={
                    state.choice === 'truth'
                      ? "e.g. What is the most embarrassing thing you've ever done in public?"
                      : "e.g. Do 15 pushups or speak in an alien voice for 30 seconds straight!"
                  }
                  autoFocus
                />
                <div className="tod-btn-row">
                  <button
                    type="submit"
                    className={`tod-btn ${state.choice === 'truth' ? 'truth-primary' : 'primary'}`}
                    disabled={!promptText.trim()}
                  >
                    <Send size={14} /> Send {state.choice === 'truth' ? 'Truth' : 'Dare'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="tod-waiting-card">
                <div className="tod-waiting-spinner" />
                <p className="tod-waiting-text">
                  #{askerUsername} is writing your {state.choice === 'truth' ? 'Truth question' : 'Dare challenge'}...
                </p>
              </div>
            )}
          </>
        )}

        {/* PHASE 3A: Awaiting Answer (Truth) */}
        {state.phase === 'awaiting_answer' && (
          <>
            <div className="tod-prompt-box">
              <span className="tod-prompt-tag truth">
                <Sparkles size={12} /> Truth Question from #{askerUsername}
              </span>
              <p className="tod-prompt-text">“{state.prompt}”</p>
            </div>

            {isTarget ? (
              <form onSubmit={handleSubmitAnswer} className="tod-input-group">
                <div className="tod-input-label">
                  <span>Your honest answer:</span>
                  <span className="tod-char-count">{answerText.length}/800</span>
                </div>
                <textarea
                  className="tod-textarea"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value.slice(0, 800))}
                  placeholder="Tell the full truth..."
                  autoFocus
                />
                <div className="tod-btn-row">
                  <button type="submit" className="tod-btn truth-primary" disabled={!answerText.trim()}>
                    <Send size={14} /> Submit Answer
                  </button>
                  <button type="button" className="tod-btn forfeit" onClick={handleForfeit}>
                    🐔 Chicken Out
                  </button>
                </div>
              </form>
            ) : (
              <div className="tod-waiting-card">
                <div className="tod-waiting-spinner" />
                <p className="tod-waiting-text">Waiting for #{targetUsername} to answer...</p>
              </div>
            )}
          </>
        )}

        {/* PHASE 3B: Performing Dare (Two-Way 30-Second Video Call) */}
        {state.phase === 'performing_dare' && (
          <div className="tod-video-arena">
            <div className="tod-prompt-box">
              <span className="tod-prompt-tag dare">
                <Video size={12} /> Dare Challenge from #{askerUsername}
              </span>
              <p className="tod-prompt-text">“{state.prompt}”</p>
            </div>

            {cameraError && (
              <div className="tod-error-banner">
                <AlertCircle size={14} /> {cameraError}
              </div>
            )}

            {partnerDisconnected && (
              <div className="tod-error-banner" style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444' }}>
                <AlertCircle size={14} /> Partner disconnected from dare video call.
                <button type="button" className="tod-btn forfeit" onClick={onAbandon} style={{ marginLeft: 'auto', padding: '4px 10px' }}>
                  Exit Game
                </button>
              </div>
            )}

            {/* Video Stage */}
            <div className="tod-video-stage">
              {/* Main View: Target doing dare is large for both viewers */}
              <video
                ref={isTarget ? localVideoRef : remoteVideoRef}
                autoPlay
                playsInline
                muted={isTarget} /* Mute local feedback to avoid audio echo */
                className="tod-main-video"
              />

              {/* PiP View: Asker watching live in picture-in-picture window */}
              <div className="tod-pip-video-wrap">
                <video
                  ref={isTarget ? remoteVideoRef : localVideoRef}
                  autoPlay
                  playsInline
                  muted={!isTarget} /* Mute local feedback */
                  className="tod-pip-video"
                />
                <div className="tod-pip-label">
                  {isTarget ? `#${askerUsername}` : 'You'}
                </div>
              </div>

              {/* 30-Second Countdown Overlay */}
              <div className={`tod-timer-overlay ${timeLeft <= 5 ? 'danger' : ''}`}>
                <span className="tod-timer-pulse-dot" />
                <span className="tod-timer-number">{Math.max(0, timeLeft)}s</span>
              </div>

              {/* Video Call Controls Toolbar */}
              <div className="tod-video-controls">
                <button
                  type="button"
                  className={`tod-ctrl-btn ${!micEnabled ? 'off' : ''}`}
                  onClick={toggleMic}
                  title={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
                >
                  {micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                </button>
                <button
                  type="button"
                  className={`tod-ctrl-btn ${!videoEnabled ? 'off' : ''}`}
                  onClick={toggleVideo}
                  title={videoEnabled ? 'Turn Video Off' : 'Turn Video On'}
                >
                  {videoEnabled ? <Video size={15} /> : <VideoOff size={15} />}
                </button>
                <button
                  type="button"
                  className="tod-ctrl-btn"
                  onClick={toggleFacingMode}
                  title="Flip Camera"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Target Options */}
            {isTarget && (
              <div className="tod-btn-row">
                <button type="button" className="tod-btn primary" onClick={manualCompleteDare}>
                  Done Early! Complete
                </button>
                <button type="button" className="tod-btn forfeit" onClick={handleForfeit}>
                  🐔 Chicken Out
                </button>
              </div>
            )}
          </div>
        )}

        {/* PHASE 4: Round Completed */}
        {state.phase === 'round_completed' && (
          <div className="tod-recap-box">
            {state.forfeited ? (
              <div className="tod-recap-badge-forfeit">
                🐔 #{targetUsername} chickened out!
              </div>
            ) : (
              <div className="tod-recap-badge-success">
                <Trophy size={14} /> Round {state.round} Conquered!
              </div>
            )}

            <div className="tod-recap-item">
              <span className="tod-recap-label">{state.choice?.toUpperCase()} CHALLENGE</span>
              <span className="tod-recap-content">“{state.prompt}”</span>
            </div>

            {state.choice === 'truth' && !state.forfeited && (
              <div className="tod-recap-item">
                <span className="tod-recap-label">#{targetUsername}’s ANSWER</span>
                <span className="tod-recap-content">{state.answer}</span>
              </div>
            )}

            {state.choice === 'dare' && !state.forfeited && (
              <div className="tod-recap-item">
                <span className="tod-recap-label">PROOF</span>
                <span className="tod-recap-content">✅ 30-Second live camera dare verified by #{askerUsername}!</span>
              </div>
            )}

            <div className="tod-btn-row" style={{ marginTop: '8px' }}>
              <button type="button" className="tod-btn primary" onClick={handleNextRound}>
                <RotateCcw size={14} /> Next Round (Switch Roles)
              </button>
              <button type="button" className="tod-btn secondary" onClick={onClose}>
                Finish Game
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
