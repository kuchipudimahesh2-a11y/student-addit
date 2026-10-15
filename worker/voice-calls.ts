import * as webpush from 'web-push';
import type { Env } from './index';

type VoiceUser = { id: string; username: string };
type CallRow = {
  id: string;
  scope: 'dm' | 'random';
  conversation_id: string | null;
  random_match_id: string | null;
  caller_id: string;
  recipient_id: string;
  status: 'ringing' | 'accepted' | 'connected' | 'declined' | 'cancelled' | 'missed' | 'completed' | 'ended' | 'failed';
  created_at: string;
  accepted_at: string | null;
  connected_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  call_mode?: 'audio' | 'video';
};
type CallSummary = {
  callId: string;
  scope: 'dm' | 'random';
  conversationId: string | null;
  matchId: string | null;
  status: CallRow['status'];
  isCaller: boolean;
  peerLabel: string;
  createdAt: string;
  connectedAt: string | null;
  durationSeconds: number;
  callMode: 'audio' | 'video';
};

const activeStatuses = ['ringing', 'accepted', 'connected'];
const callSelect = "SELECT id, scope, conversation_id, random_match_id, caller_id, recipient_id, status, created_at, accepted_at, connected_at, ended_at, duration_seconds, COALESCE(call_mode, 'audio') AS call_mode FROM voice_calls WHERE id = ?";
const responseJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const readText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isActiveStatus = (status: string) => activeStatuses.includes(status);

function callOriginAllowed(origin: string) {
  const fixed = new Set([
    'https://student-addit.pages.dev',
    'https://student-addit-admin.pages.dev',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ]);
  if (fixed.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && !parsed.port && (
      parsed.hostname.endsWith('.student-addit.pages.dev') ||
      parsed.hostname.endsWith('.student-addit-admin.pages.dev')
    );
  } catch { return false; }
}

async function hashTicket(ticket: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)))].map((value) => value.toString(16).padStart(2, '0')).join('');
}

let voiceCallsSchemaEnsured = false;
export async function ensureVoiceCallsSchema(db: D1Database) {
  if (voiceCallsSchemaEnsured) return;
  try {
    await db.prepare("ALTER TABLE voice_calls ADD COLUMN call_mode TEXT DEFAULT 'audio'").run();
  } catch {}
  voiceCallsSchemaEnsured = true;
}

async function callRow(env: Env, callId: string) {
  await ensureVoiceCallsSchema(env.DB);
  return env.DB.prepare(callSelect).bind(callId).first<CallRow>();
}

async function callSummary(env: Env, row: CallRow, userId: string): Promise<CallSummary> {
  const peerId = row.caller_id === userId ? row.recipient_id : row.caller_id;
  let peerLabel = 'Stranger';
  if (row.scope === 'dm') {
    const peer = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(peerId).first<{ username: string }>();
    peerLabel = peer?.username ? '#' + peer.username : 'Member';
  }
  return {
    callId: row.id,
    scope: row.scope,
    conversationId: row.conversation_id,
    matchId: row.random_match_id,
    status: row.status,
    isCaller: row.caller_id === userId,
    peerLabel,
    createdAt: row.created_at,
    connectedAt: row.connected_at,
    durationSeconds: Number(row.duration_seconds ?? 0),
    callMode: row.call_mode === 'video' ? 'video' : 'audio',
  };
}

async function notifyInbox(env: Env, userId: string, callId: string) {
  const stub = env.VOICE_CALL_INBOX.get(env.VOICE_CALL_INBOX.idFromName(userId));
  return stub.fetch(new Request('https://voice-inbox.internal/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, callId }),
  }));
}

async function publishDmEvent(env: Env, row: CallRow) {
  if (row.scope !== 'dm' || !row.conversation_id) return;
  const caller = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(row.caller_id).first<{ username: string }>();
  const isVideo = row.call_mode === 'video';
  const message = {
    id: row.id,
    conversation_id: row.conversation_id,
    type: 'call',
    body: isVideo ? 'Video call' : 'Voice call',
    created_at: row.created_at,
    edited_at: null,
    reply_to_message_id: null,
    sender_id: row.caller_id,
    username: caller?.username ?? 'member',
    call_status: row.status,
    call_duration_seconds: Number(row.duration_seconds ?? 0),
    call_mode: isVideo ? 'video' : 'audio',
  };
  const room = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName('dm:' + row.conversation_id));
  await room.fetch(new Request('https://chat.internal/call-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  }));
}

async function publishRandomEvent(env: Env, row: CallRow) {
  if (row.scope !== 'random' || !row.random_match_id) return;
  const pool = env.RANDOM_POOL.get(env.RANDOM_POOL.idFromName('global'));
  await pool.fetch(new Request('https://random.internal/call-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      matchId: row.random_match_id,
      callId: row.id,
      callerId: row.caller_id,
      status: row.status,
      createdAt: row.created_at.includes('Z') ? row.created_at : row.created_at.replace(' ', 'T') + 'Z',
      durationSeconds: Number(row.duration_seconds ?? 0),
    }),
  }));
}

async function dispatchCallPush(env: Env, row: CallRow) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? '', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  if (row.status === 'ringing') {
    const isRandom = row.scope === 'random';
    let callerName = 'Stranger';
    if (!isRandom) {
      const caller = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(row.caller_id).first<{ username: string }>();
      callerName = caller?.username ? '#' + caller.username : 'Someone';
    }
    const isVideo = row.call_mode === 'video';

    const { results } = await env.DB.prepare(`SELECT s.id, s.endpoint, s.p256dh, s.auth
      FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ? AND u.is_suspended = 0`).bind(row.recipient_id).all<{ id: string; endpoint: string; p256dh: string; auth: string }>();

    const payload = JSON.stringify({
      type: 'incoming_call',
      callId: row.id,
      caller: callerName,
      title: `${isVideo ? '📹 Incoming video call' : '📞 Incoming call'} from ${callerName}`,
      body: isRandom ? 'Tap to answer your Random Chat call on adda' : 'Tap to answer on adda',
      tag: `incoming-call-${row.id}`,
      data: {
        type: 'incoming_call',
        callId: row.id,
        callMode: isVideo ? 'video' : 'audio',
        scope: row.scope,
        url: `/?call=${encodeURIComponent(row.id)}`,
      },
    });

    for (const sub of results) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60, urgency: 'high', topic: ('call' + row.id.replaceAll('-', '')).slice(0, 32) }
        );
      } catch (err) {
        const statusCode = err instanceof webpush.WebPushError ? err.statusCode : 0;
        if (statusCode === 404 || statusCode === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        }
      }
    }
  } else if (!isActiveStatus(row.status)) {
    const { results } = await env.DB.prepare(`SELECT s.id, s.endpoint, s.p256dh, s.auth
      FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE s.user_id IN (?, ?) AND u.is_suspended = 0`).bind(row.recipient_id, row.caller_id).all<{ id: string; endpoint: string; p256dh: string; auth: string }>();

    const dismissPayload = JSON.stringify({
      type: 'dismiss_call',
      callId: row.id,
      tag: `incoming-call-${row.id}`,
    });

    for (const sub of results) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          dismissPayload,
          { TTL: 30, urgency: 'high', topic: ('call' + row.id.replaceAll('-', '')).slice(0, 32) }
        );
      } catch { /* ignore dismiss failure */ }
    }
  }
}

async function publishCallUpdate(env: Env, row: CallRow) {
  const results = await Promise.allSettled([
    notifyInbox(env, row.caller_id, row.id),
    notifyInbox(env, row.recipient_id, row.id),
    publishDmEvent(env, row),
    publishRandomEvent(env, row),
    dispatchCallPush(env, row),
  ]);
  for (const result of results) if (result.status === 'rejected') console.error('Voice call update could not be published', result.reason);
}

function getCallId(path: string, suffix: string) {
  const match = path.match(/^\/api\/calls\/([^/]+)\/(action|ice-servers)$/);
  return match && match[2] === suffix ? decodeURIComponent(match[1]) : '';
}

async function randomPeer(env: Env, userId: string, matchId: string) {
  const pool = env.RANDOM_POOL.get(env.RANDOM_POOL.idFromName('global'));
  const response = await pool.fetch(new Request('https://random.internal/call-participant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ matchId }),
  }));
  if (!response.ok) return null;
  const value = await response.json<{ peerId?: string }>();
  return value.peerId || null;
}

async function createCall(request: Request, env: Env, user: VoiceUser) {
  await ensureVoiceCallsSchema(env.DB);
  const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const scope = body.scope === 'dm' || body.scope === 'random' ? body.scope : '';
  const callMode = body.mode === 'video' ? 'video' : 'audio';
  let conversationId: string | null = null;
  let matchId: string | null = null;
  let peerId = '';
  if (scope === 'dm') {
    conversationId = readText(body.conversationId, 80);
    if (!conversationId) return responseJson({ error: 'Choose a private conversation first.' }, 400);
    const conversation = await env.DB.prepare('SELECT pair_low, pair_high FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(conversationId, user.id, user.id).first<{ pair_low: string; pair_high: string }>();
    if (!conversation) return responseJson({ error: 'Private conversation not found.' }, 404);
    peerId = conversation.pair_low === user.id ? conversation.pair_high : conversation.pair_low;
  } else if (scope === 'random') {
    matchId = readText(body.matchId, 80);
    if (!matchId) return responseJson({ error: 'This Random Chat match has ended.' }, 409);
    peerId = await randomPeer(env, user.id, matchId) ?? '';
    if (!peerId) return responseJson({ error: 'Calls are available while both people are connected to the same Random Chat.' }, 409);
  } else return responseJson({ error: 'Choose a private chat or active Random Chat.' }, 400);
  if (peerId === user.id) return responseJson({ error: 'You cannot call yourself.' }, 400);
  const peer = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_suspended = 0').bind(peerId).first<{ id: string }>();
  if (!peer) return responseJson({ error: 'That member is unavailable.' }, 404);

  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM voice_call_attempts WHERE user_id = ? AND attempted_at >= datetime('now', '-1 minute')").bind(user.id).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 5) return responseJson({ error: 'You have made several call requests. Wait a minute and try again.' }, 429);
  const callId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM voice_call_attempts WHERE attempted_at < datetime('now', '-1 hour')"),
      env.DB.prepare('DELETE FROM voice_ws_tickets WHERE expires_at <= CURRENT_TIMESTAMP'),
      env.DB.prepare("INSERT INTO voice_calls (id, scope, conversation_id, random_match_id, caller_id, recipient_id, status, call_mode) VALUES (?, ?, ?, ?, ?, ?, 'ringing', ?)").bind(callId, scope, conversationId, matchId, user.id, peerId, callMode),
      env.DB.prepare('INSERT INTO voice_active_members (user_id, call_id) VALUES (?, ?)').bind(user.id, callId),
      env.DB.prepare('INSERT INTO voice_active_members (user_id, call_id) VALUES (?, ?)').bind(peerId, callId),
      env.DB.prepare('INSERT INTO voice_call_attempts (id, user_id) VALUES (?, ?)').bind(crypto.randomUUID(), user.id),
    ]);
  } catch {
    return responseJson({ error: 'One of you is already in a call. Finish that call before starting another.' }, 409);
  }
  const session = env.VOICE_CALL_SESSIONS.get(env.VOICE_CALL_SESSIONS.idFromName(callId));
  let initialized: Response;
  try {
    initialized = await session.fetch(new Request('https://voice-session.internal/initialize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callId }) }));
  } catch {
    initialized = responseJson({ error: 'Could not initialize call signaling.' }, 503);
  }
  if (!initialized.ok) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM voice_active_members WHERE call_id = ?').bind(callId),
      env.DB.prepare("UPDATE voice_calls SET status = 'failed', ended_at = CURRENT_TIMESTAMP WHERE id = ?").bind(callId),
    ]);
    return responseJson({ error: 'Could not start the call. Please try again.' }, 503);
  }
  const row = await callRow(env, callId);
  if (!row) return responseJson({ error: 'Could not start the call. Please try again.' }, 503);
  return responseJson({ call: await callSummary(env, row, user.id) }, 201);
}

async function createSocketTicket(request: Request, env: Env, user: VoiceUser) {
  const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const purpose = body.purpose === 'inbox' || body.purpose === 'session' ? body.purpose : '';
  const callId = purpose === 'session' ? readText(body.callId, 80) : '';
  if (!purpose || (purpose === 'session' && !callId)) return responseJson({ error: 'Invalid call connection request.' }, 400);
  if (purpose === 'session') {
    const row = await callRow(env, callId);
    if (!row || ![row.caller_id, row.recipient_id].includes(user.id) || !isActiveStatus(row.status)) return responseJson({ error: 'This call is no longer available.' }, 404);
  }
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM voice_ws_tickets WHERE expires_at <= CURRENT_TIMESTAMP'),
    env.DB.prepare("INSERT INTO voice_ws_tickets (token_hash, user_id, purpose, call_id, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+1 minute'))").bind(await hashTicket(ticket), user.id, purpose, callId || null),
  ]);
  return responseJson({ ticket });
}

async function issueIceServers(env: Env, callId: string, userId: string) {
  const row = await callRow(env, callId);
  if (!row || ![row.caller_id, row.recipient_id].includes(userId) || !['accepted', 'connected'].includes(row.status)) return responseJson({ error: 'Accept the call before connecting audio.' }, 403);
  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return responseJson({ error: 'Voice calling is not configured yet.' }, 503);
  try {
    const response = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.TURN_API_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 21600 }),
    });
    const result = await response.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    if (!response.ok || !Array.isArray(result.iceServers)) {
      console.error('TURN credential request failed', { status: response.status });
      return responseJson({ error: 'Could not prepare a secure voice connection. Please try again.' }, 503);
    }
    return responseJson({ iceServers: result.iceServers });
  } catch (error) {
    console.error('TURN credential request failed', error);
    return responseJson({ error: 'Could not prepare a secure voice connection. Please try again.' }, 503);
  }
}

async function consumeSocketTicket(request: Request, env: Env, purpose: 'inbox' | 'session', callId = '') {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (!origin || !callOriginAllowed(origin)) return responseJson({ error: 'Origin is not allowed.' }, 403);
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return responseJson({ error: 'WebSocket upgrade required.' }, 426);
  const ticket = url.searchParams.get('ticket') ?? '';
  if (!ticket || ticket.length > 100) return responseJson({ error: 'Reconnect to voice calling.' }, 401);
  const grant = await env.DB.prepare("DELETE FROM voice_ws_tickets WHERE token_hash = ? AND purpose = ? AND expires_at > CURRENT_TIMESTAMP AND ((? = 'inbox' AND call_id IS NULL) OR (? = 'session' AND call_id = ?)) RETURNING user_id")
    .bind(await hashTicket(ticket), purpose, purpose, purpose, callId).first<{ user_id: string }>();
  if (!grant) return responseJson({ error: 'This voice connection ticket expired or was already used.' }, 401);
  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_suspended = 0').bind(grant.user_id).first<{ id: string }>();
  if (!user) return responseJson({ error: 'Please sign in again.' }, 401);
  if (purpose === 'session') {
    const row = await callRow(env, callId);
    if (!row || ![row.caller_id, row.recipient_id].includes(user.id) || !isActiveStatus(row.status)) return responseJson({ error: 'This call is no longer available.' }, 404);
  }
  const headers = new Headers(request.headers);
  headers.set('x-user-id', user.id);
  if (purpose === 'session') headers.set('x-call-id', callId);
  const stub = purpose === 'inbox'
    ? env.VOICE_CALL_INBOX.get(env.VOICE_CALL_INBOX.idFromName(user.id))
    : env.VOICE_CALL_SESSIONS.get(env.VOICE_CALL_SESSIONS.idFromName(callId));
  return stub.fetch(new Request(request, { headers }));
}

export async function handleVoiceCallApi(request: Request, env: Env, user: VoiceUser | null, path: string): Promise<Response> {
  if (path === '/api/ws/call-inbox') return consumeSocketTicket(request, env, 'inbox');
  if (path === '/api/ws/call-session') {
    const callId = readText(new URL(request.url).searchParams.get('callId'), 80);
    if (!callId) return responseJson({ error: 'Call session not found.' }, 404);
    return consumeSocketTicket(request, env, 'session', callId);
  }
  if (!user) return responseJson({ error: 'Please sign in again.' }, 401);
  const origin = request.headers.get('origin');
  if (origin && !callOriginAllowed(origin)) return responseJson({ error: 'Origin is not allowed.' }, 403);
  if (path === '/api/calls' && request.method === 'POST') return createCall(request, env, user);
  if (path === '/api/calls/ws-ticket' && request.method === 'POST') return createSocketTicket(request, env, user);
  const statusCall = path.match(/^\/api\/calls\/([^/]+)$/);
  if (statusCall && request.method === 'GET') {
    const row = await callRow(env, decodeURIComponent(statusCall[1]));
    if (!row || ![row.caller_id, row.recipient_id].includes(user.id)) return responseJson({ error: 'Call not found.' }, 404);
    return responseJson({ call: await callSummary(env, row, user.id) });
  }
  const actionCallId = getCallId(path, 'action');
  if (actionCallId && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const action = body.action === 'accept' || body.action === 'decline' || body.action === 'cancel' || body.action === 'end' || body.action === 'fail' ? body.action : '';
    if (!action) return responseJson({ error: 'Choose a valid call action.' }, 400);
    const row = await callRow(env, actionCallId);
    if (!row || ![row.caller_id, row.recipient_id].includes(user.id)) return responseJson({ error: 'Call not found.' }, 404);
    const session = env.VOICE_CALL_SESSIONS.get(env.VOICE_CALL_SESSIONS.idFromName(actionCallId));
    return session.fetch(new Request('https://voice-session.internal/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': user.id },
      body: JSON.stringify({ action }),
    }));
  }
  const iceCallId = getCallId(path, 'ice-servers');
  if (iceCallId && request.method === 'POST') return issueIceServers(env, iceCallId, user.id);
  return responseJson({ error: 'Not found.' }, 404);
}

export class CallInbox {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === '/revoke' && request.method === 'POST') {
      const body = await request.json<{ userId?: string }>().catch((): { userId?: string } => ({}));
      const userId = body.userId ?? '';
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as { userId?: string } | null;
        if (attachment?.userId === userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
      }
      return responseJson({ ok: true });
    }
    if (path === '/notify' && request.method === 'POST') {
      const body = await request.json<{ userId?: string; callId?: string }>().catch((): { userId?: string; callId?: string } => ({}));
      if (!body.userId || !body.callId) return responseJson({ error: 'Invalid call update.' }, 400);
      const row = await callRow(this.env, body.callId);
      const payload = row && [row.caller_id, row.recipient_id].includes(body.userId)
        ? { type: 'call-update', call: await callSummary(this.env, row, body.userId) }
        : { type: 'call-ended', callId: body.callId };
      this.broadcast(body.userId, JSON.stringify(payload));
      return responseJson({ ok: true });
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    if (!userId) return responseJson({ error: 'Authenticated call inbox required.' }, 401);
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ userId });
    pair[1].send(JSON.stringify({ type: 'inbox-connected' }));
    const active = await this.env.DB.prepare("SELECT id, scope, conversation_id, random_match_id, caller_id, recipient_id, status, created_at, accepted_at, connected_at, ended_at, duration_seconds FROM voice_calls WHERE (caller_id = ? OR recipient_id = ?) AND status IN ('ringing', 'accepted', 'connected') ORDER BY created_at DESC LIMIT 3")
      .bind(userId, userId).all<CallRow>();
    for (const row of active.results) {
      try { pair[1].send(JSON.stringify({ type: 'call-update', call: await callSummary(this.env, row, userId) })); } catch { break; }
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private broadcast(userId: string, payload: string) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { userId?: string } | null;
      if (attachment?.userId === userId) { try { socket.send(payload); } catch { /* disconnected client */ } }
    }
  }

  webSocketMessage(socket: WebSocket) { try { socket.close(1008, 'Call inbox is read-only.'); } catch { /* already closed */ } }
}

export class CallSession {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === '/initialize' && request.method === 'POST') {
      const body = await request.json<{ callId?: string }>().catch((): { callId?: string } => ({}));
      const callId = body.callId ?? '';
      const row = await callRow(this.env, callId);
      if (!row || !isActiveStatus(row.status)) return responseJson({ error: 'Call is no longer active.' }, 404);
      await this.state.storage.put('callId', callId);
      await this.state.storage.put('alarmReason', 'ring');
      await this.state.storage.setAlarm(Date.now() + 30_000);
      await publishCallUpdate(this.env, row);
      return responseJson({ ok: true });
    }
    if (path === '/action' && request.method === 'POST') {
      const userId = request.headers.get('x-user-id') ?? '';
      const body = await request.json<{ action?: string }>().catch((): { action?: string } => ({}));
      return this.action(userId, body.action ?? '');
    }
    if ((path === '/terminate' || path === '/match-ended') && request.method === 'POST') {
      const callId = await this.getCallId();
      return this.finish(callId, 'ended', path === '/match-ended');
    }
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return this.connect(request);
    return responseJson({ error: 'Not found.' }, 404);
  }

  private async getCallId() {
    return await this.state.storage.get<string>('callId') ?? '';
  }

  private async connect(request: Request) {
    const userId = request.headers.get('x-user-id') ?? '';
    const callId = request.headers.get('x-call-id') ?? await this.getCallId();
    const row = await callRow(this.env, callId);
    if (!row || ![row.caller_id, row.recipient_id].includes(userId) || !['accepted', 'connected'].includes(row.status)) return responseJson({ error: 'Accept the call before joining audio.' }, 403);
    await this.state.storage.put('callId', callId);
    for (const existing of this.state.getWebSockets()) {
      const attachment = existing.deserializeAttachment() as { userId?: string } | null;
      if (attachment?.userId === userId) { try { existing.close(4009, 'Call connection replaced'); } catch { /* already closed */ } }
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ userId });
    pair[1].send(JSON.stringify({ type: 'call-state', status: row.status }));
    const bothConnectedToSignaling = this.maybeReady(row);
    if (bothConnectedToSignaling && await this.state.storage.get<string>('alarmReason') === 'disconnect') {
      if (row.status === 'connected') {
        await this.state.storage.deleteAlarm();
        await this.state.storage.delete('alarmReason');
      } else if (row.status === 'accepted') {
        await this.state.storage.put('alarmReason', 'setup');
        await this.state.storage.setAlarm(Date.now() + 30_000);
      }
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async action(userId: string, action: string) {
    const callId = await this.getCallId();
    const row = await callRow(this.env, callId);
    if (!row || ![row.caller_id, row.recipient_id].includes(userId)) return responseJson({ error: 'Call not found.' }, 404);
    if (action === 'accept' && (row.status !== 'ringing' || userId !== row.recipient_id)) return responseJson({ error: 'This call can no longer be accepted.' }, 409);
    if (action === 'decline' && (row.status !== 'ringing' || userId !== row.recipient_id)) return responseJson({ error: 'This call can no longer be declined.' }, 409);
    if (action === 'cancel' && (row.status !== 'ringing' || userId !== row.caller_id)) return responseJson({ error: 'This call can no longer be cancelled.' }, 409);
    if ((action === 'end' || action === 'fail') && !isActiveStatus(row.status)) return responseJson({ error: 'This call has already ended.' }, 409);
    if (action === 'accept') {
      const result = await this.env.DB.prepare("UPDATE voice_calls SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ringing'").bind(callId).run();
      if (!Number(result.meta.changes ?? 0)) return responseJson({ error: 'This call can no longer be accepted.' }, 409);
      await this.state.storage.put('alarmReason', 'setup');
      await this.state.storage.setAlarm(Date.now() + 45_000);
      const updated = await callRow(this.env, callId);
      if (updated) await publishCallUpdate(this.env, updated);
      return responseJson({ ok: true, status: 'accepted' });
    }
    if (action === 'decline' || action === 'cancel' || action === 'end') {
      const status = action === 'decline' ? 'declined' : action === 'cancel' ? 'cancelled' : 'ended';
      return this.finish(callId, status as CallRow['status']);
    }
    if (action === 'fail') {
      // Do not terminate connected calls on transient network/ICE failures.
      // Calls only disconnect when either participant explicitly cuts/hangs up.
      if (row.status === 'connected') return responseJson({ ok: true, status: row.status });
      return this.finish(callId, 'failed');
    }
    return responseJson({ error: 'Invalid call action.' }, 400);
  }

  private async finish(callId: string, status: CallRow['status'], deleteRandom = false) {
    if (!callId) return responseJson({ ok: true });
    return this.state.blockConcurrencyWhile(async () => {
      const row = await callRow(this.env, callId);
      if (!row) return responseJson({ ok: true });
      const finalStatus: CallRow['status'] = status === 'ended' && row.connected_at ? 'completed' : status;
      if (isActiveStatus(row.status)) {
        const connectedMs = row.connected_at ? Date.parse(row.connected_at.replace(' ', 'T') + (row.connected_at.includes('Z') ? '' : 'Z')) : NaN;
        const duration = Number.isFinite(connectedMs) ? Math.max(0, Math.floor((Date.now() - connectedMs) / 1000)) : 0;
        await this.env.DB.prepare("UPDATE voice_calls SET status = ?, ended_at = CURRENT_TIMESTAMP, duration_seconds = ? WHERE id = ? AND status IN ('ringing', 'accepted', 'connected')")
          .bind(finalStatus, duration, callId).run();
        await this.env.DB.prepare('DELETE FROM voice_active_members WHERE call_id = ?').bind(callId).run();
      }
      const updated = await callRow(this.env, callId);
      if (updated) {
        if (!(deleteRandom && updated.scope === 'random')) await publishCallUpdate(this.env, updated);
        else {
          await Promise.all([notifyInbox(this.env, updated.caller_id, callId), notifyInbox(this.env, updated.recipient_id, callId)]);
          await this.env.DB.prepare('DELETE FROM voice_calls WHERE id = ?').bind(callId).run();
        }
      }
      await this.state.storage.deleteAlarm();
      await this.state.storage.delete('alarmReason');
      await this.state.storage.delete('connectedMembers');
      for (const socket of this.state.getWebSockets()) { try { socket.send(JSON.stringify({ type: 'call-ended', status: finalStatus })); socket.close(1000, 'Call ended'); } catch { /* disconnected client */ } }
      return responseJson({ ok: true, status: finalStatus });
    });
  }

  private maybeReady(row: CallRow) {
    const users = new Set(this.state.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).map((socket) => (socket.deserializeAttachment() as { userId?: string } | null)?.userId ?? ''));
    const ready = users.has(row.caller_id) && users.has(row.recipient_id);
    if (ready) {
      for (const socket of this.state.getWebSockets()) { try { socket.send(JSON.stringify({ type: 'ready' })); } catch { /* connection is closing */ } }
    }
    return ready;
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const raw = typeof message === 'string' ? message : '';
    if (!raw || raw.length > 24_000) { try { socket.close(1009, 'Call signal is too large'); } catch {} return; }
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    const attachment = socket.deserializeAttachment() as { userId?: string } | null;
    const userId = attachment?.userId ?? '';
    const callId = await this.getCallId();
    const row = await callRow(this.env, callId);
    if (!row || ![row.caller_id, row.recipient_id].includes(userId) || !['accepted', 'connected'].includes(row.status)) return;
    if (data.type === 'hangup') { await this.finish(callId, 'ended'); return; }
    if (data.type === 'connected') {
      const connected = new Set(await this.state.storage.get<string[]>('connectedMembers') ?? []);
      connected.add(userId);
      await this.state.storage.put('connectedMembers', [...connected]);
      if (connected.has(row.caller_id) && connected.has(row.recipient_id) && row.status !== 'connected') {
        await this.env.DB.prepare("UPDATE voice_calls SET status = 'connected', connected_at = COALESCE(connected_at, CURRENT_TIMESTAMP) WHERE id = ? AND status IN ('accepted', 'connected')").bind(callId).run();
        await this.state.storage.deleteAlarm();
        await this.state.storage.delete('alarmReason');
        const updated = await callRow(this.env, callId);
        if (updated) await publishCallUpdate(this.env, updated);
      }
      return;
    }
    const type = data.type;
    if (type !== 'offer' && type !== 'answer' && type !== 'ice') return;
    if ((type === 'offer' && userId !== row.caller_id) || (type === 'answer' && userId !== row.recipient_id)) return;
    if (type === 'offer' || type === 'answer') {
      const description = data.description as { type?: unknown; sdp?: unknown } | undefined;
      if (!description || description.type !== type || typeof description.sdp !== 'string' || description.sdp.length > 18_000) return;
      if (row.scope === 'random' && description.sdp.split(/\r?\n/).some((line) => line.startsWith('a=candidate:') && !/\btyp relay\b/.test(line))) return;
    } else {
      const candidate = data.candidate as { candidate?: unknown } | undefined;
      if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4_000) return;
      if (row.scope === 'random' && candidate.candidate && !/\btyp relay\b/.test(candidate.candidate)) return;
    }
    const peerId = row.caller_id === userId ? row.recipient_id : row.caller_id;
    const peer = this.state.getWebSockets().find((item) => (item.deserializeAttachment() as { userId?: string } | null)?.userId === peerId && item.readyState === WebSocket.OPEN);
    if (!peer) return;
    try { peer.send(raw); } catch { /* session reconnect will retry */ }
  }

  async webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as { userId?: string } | null;
    if (!attachment?.userId) return;
    const row = await callRow(this.env, await this.getCallId());
    if (!row || !isActiveStatus(row.status)) return;
    const replacementStillOpen = this.state.getWebSockets().some((item) => item !== socket && item.readyState === WebSocket.OPEN && (item.deserializeAttachment() as { userId?: string } | null)?.userId === attachment.userId);
    if (replacementStillOpen) return;
    // Connected calls must not auto-terminate when a signaling socket closes (e.g. screen off, tab backgrounding).
    // The call stays active and waiting for signaling re-attach until explicitly ended by either user.
    if (row.status === 'connected') return;
    await this.state.storage.put('alarmReason', 'disconnect');
    await this.state.storage.setAlarm(Date.now() + 60_000);
  }

  async alarm() {
    const callId = await this.getCallId();
    const reason = await this.state.storage.get<string>('alarmReason');
    const row = await callRow(this.env, callId);
    if (!row || !isActiveStatus(row.status)) return;
    if (reason === 'ring' && row.status === 'ringing') { await this.finish(callId, 'missed'); return; }
    if (reason === 'setup' && row.status === 'accepted') { await this.finish(callId, 'failed'); return; }
    if (reason === 'disconnect') { await this.finish(callId, 'failed'); return; }
  }
}
