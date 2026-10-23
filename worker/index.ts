import * as webpush from 'web-push';
import { CallInbox, CallSession, handleVoiceCallApi } from './voice-calls';
export { CallInbox, CallSession };

type PushQueueMessage = { campaignId?: string; eventId?: string; chatEventId?: string; clickUrl?: string };

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CHAT_ROOMS: DurableObjectNamespace;
  RANDOM_POOL: DurableObjectNamespace;
  STUDIES_FEED: DurableObjectNamespace;
  POLLS_FEED: DurableObjectNamespace;
  SIDE_QUESTS_FEED: DurableObjectNamespace;
  ADMIN_LIVE_FEED: DurableObjectNamespace;
  DINO_LEADERBOARD: DurableObjectNamespace;
  VOICE_CALL_INBOX: DurableObjectNamespace;
  VOICE_CALL_SESSIONS: DurableObjectNamespace;
  STUDIES_BUCKET: R2Bucket;
  PUSH_QUEUE: Queue<PushQueueMessage>;
  SESSION_SECRET?: string;
  ADMIN_BOOTSTRAP_SECRET?: string;
  ADMIN_TEST_MODE?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
  AICREDITS_API_KEY?: string;
  AICREDITS_BASE_URL?: string;
  AICREDITS_MODEL?: string;
  ENVIRONMENT?: string;
}

type User = {
  id: string;
  name: string;
  username: string;
  gender: 'male' | 'female';
  password_hash: string;
  recovery_question: string;
  recovery_answer_hash: string;
  role?: 'member' | 'admin';
  is_suspended?: number;
  created_at?: string;
  account_type?: 'public' | 'private';
  avatar_url?: string | null;
};

const ALLOWED_ORIGINS = new Set([
  'https://student-addit.pages.dev',
  'https://student-addit-admin.pages.dev',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);
const MAX_STUDY_FILE_SIZE = 25 * 1024 * 1024;
const MINI_GAME_IDS = ['quick-tap', 'perfect-timing', 'dodge-box', 'catch-it', 'reaction-test'] as const;
const PUSH_BATCH_SIZE = 20;
const PUSH_DLQ_NAME = 'adda-push-dead-letter';
const ALLOWED_STUDY_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/msword': ['.doc'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.ms-excel': ['.xls'],
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeDbTimestamp(val: unknown): string {
  if (typeof val !== 'string' || !val) return '';
  const s = val.trim();
  if (s.includes('T')) {
    return s.replace('T', ' ').replace('Z', '').slice(0, 19);
  }
  return s.slice(0, 19);
}

function normalizeIsoTimestamp(val: unknown): string {
  if (typeof val !== 'string' || !val) return new Date().toISOString();
  const s = val.trim();
  if (s.includes('T') && (s.endsWith('Z') || s.includes('+'))) return s;
  return s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z');
}

function pushAudience(value: string | null): 'all' | 'male' | 'female' | null {
  return value === 'all' || value === 'male' || value === 'female' ? value : null;
}

function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com')
    );
  } catch { return false; }
}

function withCors(response: Response, request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !isAllowedOrigin(origin) || response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'Authorization, Content-Type, X-File-Name, X-Anonymous-Session-Id');
  headers.set('access-control-max-age', '86400');
  if (request.method === 'OPTIONS') {
    headers.set('cache-control', 'public, max-age=86400');
  }
  headers.set('vary', headers.has('vary') ? `${headers.get('vary')}, Origin` : 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAllowedOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    // Cloudflare Pages creates preview hosts as <deployment>.<project>.pages.dev.
    // Accept previews only for these two Pages projects, over HTTPS.
    return url.protocol === 'https:' && url.port === '' && (
      url.hostname.endsWith('.student-addit.pages.dev') ||
      url.hostname.endsWith('.student-addit-admin.pages.dev')
    );
  } catch {
    return false;
  }
}

async function digestPassword(value: string, salt?: string) {
  const actualSalt = salt ?? crypto.randomUUID();
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(actualSalt), iterations: 100_000, hash: 'SHA-256' }, material, 256);
  return `${actualSalt}:${[...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function verifyPassword(value: string, saved: string) {
  const [salt, expected] = saved.split(':');
  if (!salt || !expected) return false;
  const actual = (await digestPassword(value, salt)).split(':')[1];
  if (!actual || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

function base64Url(data: Uint8Array) {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

function secret(env: Env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is required.');
  return env.SESSION_SECRET;
}

async function issueToken(user: Pick<User, 'id' | 'username'>, env: Env) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ sub: user.id, username: user.username, exp: Date.now() + 30 * 86400000 })));
  return `${payload}.${await hmac(secret(env), payload)}`;
}

async function authUser(request: Request, env: Env) {
  const url = new URL(request.url);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (env.ENVIRONMENT === 'development' && env.ADMIN_TEST_MODE === 'true' && loopback && token === 'local-admin-test') {
    const testId = '00000000-0000-4000-8000-000000000001';
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, name, username, gender, password_hash, recovery_question, recovery_answer_hash, role, account_type)
      VALUES (?, 'Local test admin', 'localtestadmin0001', 'male', 'local-test-disabled', 'Local testing only', 'local-test-disabled', 'admin', 'public')`).bind(testId).run();
    await env.DB.prepare('INSERT OR IGNORE INTO scores (user_id, best_score) VALUES (?, 0)').bind(testId).run();
    return env.DB.prepare('SELECT id, name, username, gender, role, is_suspended, created_at, account_type, avatar_url FROM users WHERE id = ?').bind(testId).first<Omit<User, 'password_hash' | 'recovery_question' | 'recovery_answer_hash'>>();
  }
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !constantTimeEqual(await hmac(secret(env), payload), signature)) return null;
  try {
    const data = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { sub: string; exp: number };
    if (!data.sub || data.exp < Date.now()) return null;
    const user = await env.DB.prepare('SELECT id, name, username, gender, role, is_suspended, created_at, account_type, avatar_url FROM users WHERE id = ?').bind(data.sub).first<Omit<User, 'password_hash' | 'recovery_question' | 'recovery_answer_hash'>>();
    return user && !user.is_suspended ? user : null;
  } catch { return null; }
}

function publicUser(user: Pick<User, 'id' | 'name' | 'username' | 'gender' | 'role' | 'created_at' | 'account_type'> & { avatar_url?: string | null }) {
  return { id: user.id, name: user.name, username: user.username, gender: user.gender, isAdmin: user.role === 'admin', createdAt: user.created_at, accountType: user.account_type ?? 'public', avatarUrl: user.avatar_url ?? null };
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function adminOnly(user: { role?: string } | null): user is { role: string } {
  return user?.role === 'admin';
}

async function isGroupMember(env: Env, groupId: string, userId: string) {
  return !!await env.DB.prepare('SELECT 1 FROM group_memberships WHERE group_id = ? AND user_id = ?').bind(groupId, userId).first();
}

async function isGroupAdmin(env: Env, groupId: string, userId: string) {
  return !!await env.DB.prepare("SELECT 1 FROM group_memberships WHERE group_id = ? AND user_id = ? AND role = 'admin'").bind(groupId, userId).first();
}

function isMessageSeenByPeer(msgCreatedAt: unknown, peerLastReadAt: string | null): boolean {
  if (!peerLastReadAt || !msgCreatedAt) return false;
  const msgStr = String(msgCreatedAt);
  const msgTime = Date.parse(msgStr.replace(' ', 'T') + (msgStr.includes('Z') ? '' : 'Z'));
  const peerTime = Date.parse(peerLastReadAt.replace(' ', 'T') + (peerLastReadAt.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(msgTime) || Number.isNaN(peerTime)) {
    return msgStr <= peerLastReadAt;
  }
  return msgTime <= peerTime;
}

async function queueChatPush(env: Env, recipientIds: string[], title: string, body: string, clickUrl = '/') {
  const uniqueRecipients = [...new Set(recipientIds)];
  if (uniqueRecipients.length === 0) return;

  const eventEntries = uniqueRecipients.map((recipientId) => ({
    eventId: crypto.randomUUID(),
    recipientId,
  }));

  const statements: D1PreparedStatement[] = [];
  for (const entry of eventEntries) {
    statements.push(
      env.DB.prepare("INSERT INTO chat_push_events (id, recipient_id, title, body) SELECT ?, u.id, ?, ? FROM users u WHERE u.id = ? AND u.is_suspended = 0")
        .bind(entry.eventId, title, body, entry.recipientId),
      env.DB.prepare(`INSERT OR IGNORE INTO chat_push_deliveries (event_id, subscription_id)
        SELECT ?, id FROM push_subscriptions WHERE user_id = ?`).bind(entry.eventId, entry.recipientId)
    );
  }

  // Bug #22: Execute all inserts in a single round-trip batch
  await env.DB.batch(statements);

  for (const entry of eventEntries) {
    await env.PUSH_QUEUE.send({ chatEventId: entry.eventId, clickUrl }).catch(() => {});
  }
}

async function writeAudit(env: Env, actorId: string, action: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await env.DB.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actorId, action, targetId, JSON.stringify(details)).run();
}

async function publishStudyUpdate(env: Env, sectionId: string, payload: Record<string, unknown>) {
  try {
    const id = env.STUDIES_FEED.idFromName('global');
    const stub = env.STUDIES_FEED.get(id);
    const response = await stub.fetch(new Request(`https://studies.internal/publish?sectionId=${encodeURIComponent(sectionId)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    }));
    if (!response.ok) console.error('Studies live update was not delivered', { sectionId, status: response.status });
  } catch (error) { console.error('Studies live update failed', { sectionId, error }); }
}

async function publishPollUpdate(env: Env) {
  try {
    const stub = env.POLLS_FEED.get(env.POLLS_FEED.idFromName('global'));
    const response = await stub.fetch(new Request('https://polls.internal/publish', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'polls-updated' }),
    }));
    if (!response.ok) console.error('Poll live update was not delivered', { status: response.status });
  } catch (error) { console.error('Poll live update failed', error); }
}

async function publishDinoLeaderboardUpdate(env: Env) {
  try {
    const stub = env.DINO_LEADERBOARD.get(env.DINO_LEADERBOARD.idFromName('global'));
    const response = await stub.fetch(new Request('https://dino-leaderboard.internal/publish', { method: 'POST' }));
    if (!response.ok) console.error('Dino leaderboard update was not delivered', { status: response.status });
  } catch (error) { console.error('Dino leaderboard update failed', error); }
}

async function checkAndApplySeasonReset(env: Env) {
  try {
    const season = await env.DB.prepare('SELECT current_season, next_reset_at FROM game_seasons WHERE id = 1')
      .first<{ current_season: number; next_reset_at: string }>();
    if (!season?.next_reset_at) return;
    const nextResetTime = new Date(season.next_reset_at.replace(' ', 'T') + 'Z').getTime();
    if (!Number.isNaN(nextResetTime) && Date.now() >= nextResetTime) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM game_runs'),
        env.DB.prepare("UPDATE game_seasons SET current_season = current_season + 1, season_started_at = CURRENT_TIMESTAMP, next_reset_at = datetime('now', '+14 days'), last_reset_at = CURRENT_TIMESTAMP WHERE id = 1"),
      ]);
      await publishDinoLeaderboardUpdate(env);
    }
  } catch (error) {
    console.error('Season reset check failed', error);
  }
}

async function triggerManualSeasonReset(env: Env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM game_runs'),
    env.DB.prepare("UPDATE game_seasons SET current_season = current_season + 1, season_started_at = CURRENT_TIMESTAMP, next_reset_at = datetime('now', '+14 days'), last_reset_at = CURRENT_TIMESTAMP WHERE id = 1"),
  ]);
  await publishDinoLeaderboardUpdate(env);
}

async function revokeUserSockets(env: Env, userId: string) {
  const targets: [DurableObjectNamespace, string][] = [
    [env.CHAT_ROOMS, 'lobby'],
    [env.RANDOM_POOL, 'global'],
    [env.STUDIES_FEED, 'global'],
    [env.POLLS_FEED, 'global'],
    [env.DINO_LEADERBOARD, 'global'],
    [env.VOICE_CALL_INBOX, userId],
  ];
  const [groups, conversations, activeCalls] = await Promise.all([
    env.DB.prepare('SELECT group_id FROM group_memberships WHERE user_id = ?').bind(userId).all<{ group_id: string }>(),
    env.DB.prepare('SELECT id FROM dm_conversations WHERE pair_low = ? OR pair_high = ?').bind(userId, userId).all<{ id: string }>(),
    env.DB.prepare('SELECT call_id FROM voice_active_members WHERE user_id = ?').bind(userId).all<{ call_id: string }>(),
  ]);
  for (const row of groups.results) targets.push([env.CHAT_ROOMS, `group:${row.group_id}`]);
  for (const row of conversations.results) targets.push([env.CHAT_ROOMS, `dm:${row.id}`]);
  await Promise.all(targets.map(([namespace, name]) => namespace.get(namespace.idFromName(name)).fetch(new Request('https://internal/revoke', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }),
  }))));
  await Promise.all(activeCalls.results.map(({ call_id }) => env.VOICE_CALL_SESSIONS.get(env.VOICE_CALL_SESSIONS.idFromName(call_id)).fetch(new Request('https://voice-session.internal/terminate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'suspended' }),
  }))));
}

function safeFileName(value: string) {
  const leaf = value.replaceAll('\\', '/').split('/').pop() ?? 'file';
  return leaf.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'file';
}

async function hasExpectedFileSignature(request: Request, contentType: string) {
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  const header: number[] = [];
  try {
    while (header.length < 12) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      for (const byte of value) { header.push(byte); if (header.length === 12) break; }
    }
  } finally { void reader.cancel(); }
  const starts = (...values: number[]) => values.every((value, index) => header[index] === value);
  if (contentType === 'application/pdf') return String.fromCharCode(...header.slice(0, 5)) === '%PDF-';
  if (contentType === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  if (contentType === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (contentType === 'image/webp') return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (contentType === 'image/gif') return String.fromCharCode(...header.slice(0, 4)) === 'GIF8';
  if (contentType.startsWith('application/vnd.openxmlformats-officedocument.')) return starts(0x50, 0x4b, 0x03, 0x04);
  if (['application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel'].includes(contentType)) return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  if (contentType === 'text/plain') return !header.includes(0);
  return false;
}

function validateChatMediaSignature(bytes: Uint8Array, contentType: string, fileName: string): { valid: boolean; error?: string } {
  const normMime = (contentType || '').toLowerCase().trim();
  const normName = (fileName || '').toLowerCase().trim();

  // Strictly block SVGs, XML, and HTML (Stored-XSS prevention)
  if (normMime === 'image/svg+xml' || normMime.includes('svg') || normMime.includes('xml') || normName.endsWith('.svg')) {
    return { valid: false, error: 'SVG and XML files are not permitted.' };
  }

  // Strictly block video files
  if (normMime.startsWith('video/') || (/\.(mp4|mov|avi|mkv|wmv|flv|webm)$/i.test(normName) && !normMime.startsWith('audio/'))) {
    return { valid: false, error: 'Video files are not permitted.' };
  }

  const allowedMimes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);

  const docExtensions = ['.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.md'];
  const isDocExt = docExtensions.some((ext) => normName.endsWith(ext));
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const isImageExt = imageExtensions.some((ext) => normName.endsWith(ext));
  const audioExtensions = ['.webm', '.ogg', '.wav', '.mp3', '.m4a', '.aac'];
  const isAudioExt = audioExtensions.some((ext) => normName.endsWith(ext));

  if (!allowedMimes.has(normMime) && !isDocExt && !isImageExt && !isAudioExt) {
    return { valid: false, error: 'Unsupported media format. Only standard images, GIFs, audio voice notes, and documents (PDF, Word, Excel, PPT, Text) are supported.' };
  }

  // Inspect first 64 bytes for text indicators of SVG, XML, HTML, or Script payloads
  const textSample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 64)).toLowerCase();
  if (textSample.includes('<svg') || textSample.includes('<?xml') || textSample.includes('<html') || textSample.includes('<script')) {
    return { valid: false, error: 'Invalid file format.' };
  }

  // Verify magic bytes for common formats
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (normMime === 'image/jpeg' || normMime === 'image/jpg' || normName.endsWith('.jpg') || normName.endsWith('.jpeg')) {
    if (bytes.length >= 2 && !(bytes[0] === 0xff && bytes[1] === 0xd8)) return { valid: false, error: 'Invalid JPEG file content.' };
  } else if (normMime === 'image/png' || normName.endsWith('.png')) {
    if (!starts(0x89, 0x50, 0x4e, 0x47)) return { valid: false, error: 'Invalid PNG file content.' };
  } else if (normMime === 'image/gif' || normName.endsWith('.gif')) {
    if (!starts(0x47, 0x49, 0x46)) return { valid: false, error: 'Invalid GIF file content.' };
  } else if (normMime === 'image/webp' || normName.endsWith('.webp')) {
    const isRiff = starts(0x52, 0x49, 0x46, 0x46);
    const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!isRiff || !isWebp) return { valid: false, error: 'Invalid WebP file content.' };
  } else if (normMime === 'audio/ogg' || normName.endsWith('.ogg')) {
    if (!starts(0x4f, 0x67, 0x67, 0x53)) return { valid: false, error: 'Invalid OGG audio content.' };
  } else if (normMime === 'audio/webm' || normName.endsWith('.webm')) {
    if (!starts(0x1a, 0x45, 0xdf, 0xa3)) return { valid: false, error: 'Invalid WebM audio content.' };
    const textSample = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 512))).toLowerCase();
    if (textSample.includes('v_vp8') || textSample.includes('v_vp9') || textSample.includes('v_av1') || textSample.includes('video/webm')) {
      return { valid: false, error: 'Video files are strictly prohibited.' };
    }
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x83 && (bytes[i + 1] === 0x01 || bytes[i + 1] === 0x81) && bytes[i + 2] === 0x01) {
        return { valid: false, error: 'Video tracks are not permitted in audio recordings.' };
      }
    }
  } else if (normMime === 'application/pdf' || normName.endsWith('.pdf')) {
    if (!starts(0x25, 0x50, 0x44, 0x46)) return { valid: false, error: 'Invalid PDF file content.' };
  }

  return { valid: true };
}

function normalizeChatMediaType(rawType?: string | null, fileName?: string | null): 'image' | 'gif' | 'voice_note' | 'document' | null {
  if (!rawType && !fileName) return null;
  const type = (rawType || '').toLowerCase().trim();
  const name = (fileName || '').toLowerCase().trim();

  if (type === 'voice_note' || type === 'audio' || type.startsWith('audio/') || /\.(webm|ogg|wav|mp3|m4a|aac)$/i.test(name)) {
    return 'voice_note';
  }
  if (type === 'gif' || type === 'image/gif' || name.endsWith('.gif')) {
    return 'gif';
  }
  if (
    type === 'document' ||
    type === 'application/pdf' ||
    type.startsWith('application/vnd') ||
    type.startsWith('application/ms') ||
    type.startsWith('text/') ||
    /\.(pdf|docx?|pptx?|xlsx?|txt|csv|md)$/i.test(name)
  ) {
    return 'document';
  }
  if (type === 'image' || type.startsWith('image/') || /\.(jpe?g|png|webp|avif)$/i.test(name)) {
    return 'image';
  }
  return 'document';
}

async function studyPost(env: Env, postId: string) {
  return env.DB.prepare(`SELECT p.id, p.section_id, p.author_id, p.body, p.created_at, p.updated_at, s.scope_type, s.scope_id, u.username AS author_username
    FROM study_posts p JOIN users u ON u.id = p.author_id JOIN study_sections s ON s.id = p.section_id WHERE p.id = ?`).bind(postId).first<Record<string, unknown>>();
}

async function postAttachments(env: Env, postIds: string[]) {
  if (!postIds.length) return new Map<string, unknown[]>();
  const placeholders = postIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT id, post_id, file_name, content_type, size_bytes, created_at FROM study_attachments WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`).bind(...postIds).all<Record<string, unknown>>();
  const grouped = new Map<string, unknown[]>();
  for (const item of results) {
    const postId = String(item.post_id);
    const attachments = grouped.get(postId) ?? [];
    attachments.push({ id: item.id, fileName: item.file_name, contentType: item.content_type, sizeBytes: item.size_bytes, createdAt: item.created_at, url: `/api/studies/files/${item.id}` });
    grouped.set(postId, attachments);
  }
  return grouped;
}

function normalizeHandle(value: string) {
  const result = value.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
  return result.slice(0, 18);
}

async function uniqueHandle(env: Env, name: string) {
  const base = normalizeHandle(name).slice(0, 12) || 'addauser';
  for (let i = 0; i < 12; i++) {
    const candidate = `${base}${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(candidate).first();
    if (!exists) return candidate;
  }
  return `${base.slice(0, 8)}${Date.now().toString(36)}${crypto.randomUUID().replaceAll('-', '').slice(0, 3)}`.slice(0, 18);
}

let announcementsSchemaEnsured = false;
export async function ensureAnnouncementsAndAvatar(db: D1Database) {
  if (announcementsSchemaEnsured) return;
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN avatar_url TEXT').run();
  } catch {}
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS system_announcements (
      id TEXT PRIMARY KEY,
      title TEXT,
      body TEXT NOT NULL,
      image_url TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS system_announcements_created_idx ON system_announcements(created_at DESC)`).run();
    announcementsSchemaEnsured = true;
  } catch {}
}

let aiFriendSchemaEnsured = false;
export async function ensureAiFriendSchema(db: D1Database) {
  if (aiFriendSchemaEnsured) return;
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_messages_user_created ON ai_messages(user_id, created_at)').run();
    aiFriendSchemaEnsured = true;
  } catch {}
}

export async function ensureChatRichSchema(_db?: D1Database) {
  // Schema migrations are managed through formal migrations (0027, 0032)
}

export type MessageReactionSummary = {
  emoji: string;
  count: number;
  users: string[];
  userIds: string[];
  hasReacted?: boolean;
};

export async function getReactionsForMessages(
  db: D1Database,
  messageIds: string[],
  currentUserId?: string
): Promise<Record<string, MessageReactionSummary[]>> {
  if (!messageIds.length) return {};
  const result: Record<string, MessageReactionSummary[]> = {};
  for (const id of messageIds) result[id] = [];
  
  const chunks: string[][] = [];
  for (let i = 0; i < messageIds.length; i += 50) {
    chunks.push(messageIds.slice(i, i + 50));
  }
  
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '?').join(',');
    try {
      const rows = await db.prepare(`
        SELECT r.message_id, r.emoji, r.user_id, u.username
        FROM chat_message_reactions r
        JOIN users u ON u.id = r.user_id
        WHERE r.message_id IN (${placeholders})
        ORDER BY r.created_at ASC
      `).bind(...chunk).all<{ message_id: string; emoji: string; user_id: string; username: string }>();

      for (const row of rows.results) {
        let list = result[row.message_id];
        if (!list) { list = []; result[row.message_id] = list; }
        let entry = list.find((e) => e.emoji === row.emoji);
        if (!entry) {
          entry = { emoji: row.emoji, count: 0, users: [], userIds: [], hasReacted: false };
          list.push(entry);
        }
        entry.count += 1;
        entry.users.push(row.username);
        entry.userIds.push(row.user_id);
        if (currentUserId && row.user_id === currentUserId) {
          entry.hasReacted = true;
        }
      }
    } catch {}
  }
  return result;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'cache-control': 'public, max-age=86400' },
    });
  }
  if (path === '/api/health') return json({ ok: true, service: 'adda' });
  if (path === '/api/ws/call-inbox' || path === '/api/ws/call-session') return handleVoiceCallApi(request, env, null, path);

  if (path === '/api/announcements' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, title, body, image_url, created_at FROM system_announcements ORDER BY created_at DESC LIMIT 50').all<{ id: string; title: string | null; body: string; image_url: string | null; created_at: string }>();
    return json({ announcements: rows.results || [] });
  }

  if (path === '/api/auth/register' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const name = cleanText(body.name, 48);
    const password = typeof body.password === 'string' ? body.password : '';
    const question = cleanText(body.question, 120);
    const answer = cleanText(body.answer, 120).toLocaleLowerCase();
    const gender = body.gender === 'male' || body.gender === 'female' ? body.gender : null;
    if (name.length < 2 || password.length < 8 || !question || answer.length < 2 || !gender) return json({ error: 'Please complete every field. Passwords need at least 8 characters.' }, 400);
    const id = crypto.randomUUID();
    const username = await uniqueHandle(env, name);
    try {
      const passwordHash = await digestPassword(password);
      const recoveryAnswerHash = await digestPassword(answer);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users (id, name, username, gender, password_hash, recovery_question, recovery_answer_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(id, name, username, gender, passwordHash, question, recoveryAnswerHash),
        env.DB.prepare('INSERT INTO scores (user_id, best_score) VALUES (?, 0)').bind(id),
      ]);
    } catch (error) {
      console.error('Account registration failed', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE constraint failed: users.username')) return json({ error: 'That adda ID was just taken. Please try again.' }, 409);
      return json({ error: 'Account setup could not finish. Please try again.' }, 500);
    }
    return json({ token: await issueToken({ id, username }, env), user: publicUser({ id, name, username, gender, role: 'member' }) }, 201);
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const username = normalizeHandle(cleanText(body.username, 24));
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<User>();
    if (!user || !await verifyPassword(password, user.password_hash)) return json({ error: 'That ID or password did not match.' }, 401);
    if (user.is_suspended) return json({ error: 'This account is currently suspended. Please contact an administrator.' }, 403);
    return json({ token: await issueToken(user, env), user: publicUser(user) });
  }

  if (path === '/api/auth/recovery-question' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const username = normalizeHandle(cleanText(body.username, 24));
    const user = await env.DB.prepare('SELECT recovery_question FROM users WHERE username = ?').bind(username).first<{ recovery_question: string }>();
    if (!user) return json({ error: 'We could not find that ID.' }, 404);
    return json({ question: user.recovery_question });
  }

  if (path === '/api/auth/reset-password' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const username = normalizeHandle(cleanText(body.username, 24));
    const answer = cleanText(body.answer, 120).toLocaleLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await env.DB.prepare('SELECT id, recovery_answer_hash FROM users WHERE username = ?').bind(username).first<{ id: string; recovery_answer_hash: string }>();
    const lock = await env.DB.prepare('SELECT locked_until FROM recovery_limits WHERE username = ?').bind(username).first<{ locked_until: string | null }>();
    if (lock?.locked_until && lock.locked_until > new Date().toISOString().slice(0, 19).replace('T', ' ')) return json({ error: 'Too many guesses. Please try again in 15 minutes.' }, 429);
    if (!user || !await verifyPassword(answer, user.recovery_answer_hash)) {
      await env.DB.prepare(`INSERT INTO recovery_limits (username, attempts, window_start, locked_until) VALUES (?, 1, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT(username) DO UPDATE SET
          attempts = CASE WHEN window_start < datetime('now', '-1 hour') THEN 1 ELSE attempts + 1 END,
          locked_until = CASE WHEN (CASE WHEN window_start < datetime('now', '-1 hour') THEN 1 ELSE attempts + 1 END) >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END,
          window_start = CASE WHEN window_start < datetime('now', '-1 hour') THEN CURRENT_TIMESTAMP ELSE window_start END`).bind(username).run();
      return json({ error: 'That answer did not match.' }, 401);
    }
    if (password.length < 8) return json({ error: 'Use at least 8 characters for the new password.' }, 400);
    await env.DB.prepare('DELETE FROM recovery_limits WHERE username = ?').bind(username).run();
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await digestPassword(password), user.id).run();
    return json({ ok: true });
  }

  if (path === '/api/ws/studies' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!ticket || ticket.length > 100) return json({ error: 'Please reconnect to the Studies feed.' }, 401);
    const ticketHash = await sha256(ticket);
    const grant = await env.DB.prepare(`DELETE FROM study_ws_tickets WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP RETURNING user_id, section_id`).bind(ticketHash).first<{ user_id: string; section_id: string }>();
    if (!grant) return json({ error: 'This Studies connection has expired. Please reconnect.' }, 401);
    const sectionId = url.searchParams.get('sectionId') ?? '';
    if (grant.section_id !== sectionId) return json({ error: 'This Studies ticket is for another section.' }, 403);
    const user = await env.DB.prepare('SELECT id, is_suspended FROM users WHERE id = ?').bind(grant.user_id).first<{ id: string; is_suspended: number }>();
    if (!user || user.is_suspended) return json({ error: 'Please sign in again.' }, 401);
    const section = await env.DB.prepare("SELECT id, scope_type, scope_id FROM study_sections WHERE id = ? AND is_archived = 0").bind(sectionId).first<{ id: string; scope_type: string; scope_id: string }>();
    if (!section) return json({ error: 'Study section not found.' }, 404);
    if (section.scope_type === 'group' && !await isGroupMember(env, section.scope_id, grant.user_id)) return json({ error: 'Group membership is required.' }, 403);
    const stub = env.STUDIES_FEED.get(env.STUDIES_FEED.idFromName('global'));
    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);
    headers.set('x-study-section', sectionId);
    return stub.fetch(new Request(request, { headers }));
  }

  if (path === '/api/ws/admin-live' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!ticket || ticket.length > 100) return json({ error: 'Please reconnect to the admin live feed.' }, 401);
    const grant = await env.DB.prepare(`DELETE FROM admin_ws_tickets WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP
      RETURNING user_id`).bind(await sha256(ticket)).first<{ user_id: string }>();
    if (!grant) return json({ error: 'This admin connection has expired. Please reconnect.' }, 401);
    const admin = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'admin' AND is_suspended = 0").bind(grant.user_id).first<{ id: string }>();
    if (!admin) return json({ error: 'Administrator access required.' }, 403);
    const headers = new Headers(request.headers);
    headers.set('x-admin-id', admin.id);
    const stub = env.ADMIN_LIVE_FEED.get(env.ADMIN_LIVE_FEED.idFromName('global'));
    return stub.fetch(new Request(request, { headers }));
  }

  if (path === '/api/ws/dino-leaderboard') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!ticket || ticket.length > 100) return json({ error: 'Please reconnect to the Dino leaderboard.' }, 401);
    const grant = await env.DB.prepare(`DELETE FROM dino_leaderboard_ws_tickets WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP RETURNING user_id`)
      .bind(await sha256(ticket)).first<{ user_id: string }>();
    if (!grant) return json({ error: 'This Dino leaderboard connection has expired. Please reconnect.' }, 401);
    const activeUser = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_suspended = 0').bind(grant.user_id).first<{ id: string }>();
    if (!activeUser) return json({ error: 'Please sign in again.' }, 401);
    const headers = new Headers(request.headers);
    headers.set('x-user-id', activeUser.id);
    const stub = env.DINO_LEADERBOARD.get(env.DINO_LEADERBOARD.idFromName('global'));
    return stub.fetch(new Request(request, { headers }));
  }

  if (path === '/api/ws/room') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const kind = url.searchParams.get('kind');
    const roomId = cleanText(url.searchParams.get('id'), 80);
    const ticket = url.searchParams.get('ticket') ?? '';
    const token = url.searchParams.get('token') ?? '';
    if (!roomId || (kind !== 'dm' && kind !== 'group')) {
      return json({ error: 'Invalid chat connection parameters.' }, 400);
    }

    let activeUser: User | null = null;
    if (ticket) {
      if (ticket.length > 100) return json({ error: 'Invalid ticket.' }, 400);
      const ticketHash = await sha256(ticket);
      // Bug #15: Support graceful reuse window for TCP reconnects
      const grant = await env.DB.prepare("SELECT user_id FROM chat_ws_tickets WHERE token_hash = ? AND room_key = ? AND expires_at > CURRENT_TIMESTAMP")
        .bind(ticketHash, `${kind}:${roomId}`).first<{ user_id: string }>();
      if (!grant) return json({ error: 'This chat connection ticket expired or was already used.' }, 401);
      await env.DB.prepare("DELETE FROM chat_ws_tickets WHERE token_hash = ?").bind(ticketHash).run().catch(() => {});
      activeUser = await env.DB.prepare('SELECT id, name, username, gender, role, is_suspended FROM users WHERE id = ? AND is_suspended = 0').bind(grant.user_id).first<User>();
    } else if (token) {
      // Bug #8: Graceful token fallback
      activeUser = await authUser(request, env) as User | null;
    }

    if (!activeUser) return json({ error: 'Please sign in again.' }, 401);
    if (kind === 'group' && !await isGroupMember(env, roomId, activeUser.id)) return json({ error: 'Join this group to chat.' }, 403);
    if (kind === 'dm') {
      const allowed = await env.DB.prepare('SELECT 1 FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(roomId, activeUser.id, activeUser.id).first();
      if (!allowed) return json({ error: 'Private conversation not found.' }, 404);
    }
    const headers = new Headers(request.headers);
    headers.set('x-user-id', activeUser.id);
    headers.set('x-user-handle', activeUser.username);
    headers.set('x-chat-kind', kind);
    headers.set('x-chat-id', roomId);
    return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`${kind}:${roomId}`)).fetch(new Request(request, { headers }));
  }

  if (path === '/api/ws/polls' && url.searchParams.get('ticket')) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!ticket || ticket.length > 100) return json({ error: 'Please reconnect to Polls.' }, 401);
    const grant = await env.DB.prepare("DELETE FROM polls_ws_tickets WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP RETURNING user_id")
      .bind(await sha256(ticket)).first<{ user_id: string }>();
    if (!grant) return json({ error: 'This Polls connection ticket expired or was already used.' }, 401);
    const activeUser = await env.DB.prepare('SELECT id, is_suspended FROM users WHERE id = ? AND is_suspended = 0').bind(grant.user_id).first<{ id: string }>();
    if (!activeUser) return json({ error: 'Please sign in again.' }, 401);
    const stub = env.POLLS_FEED.get(env.POLLS_FEED.idFromName('global'));
    const headers = new Headers(request.headers);
    headers.set('x-user-id', activeUser.id);
    return stub.fetch(new Request(request, { headers }));
  }


  const user = await authUser(request, env);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  if (path === '/api/calls' || path.startsWith('/api/calls/')) return handleVoiceCallApi(request, env, user, path);

  const chatMediaMatch = path.match(/^\/api\/chat\/media\/([^/]+)$/);
  if (chatMediaMatch && request.method === 'GET') {
    const rawKey = decodeURIComponent(chatMediaMatch[1]);
    const key = rawKey.startsWith('chat-media/') ? rawKey : `chat-media/${rawKey}`;
    const object = await env.STUDIES_BUCKET.get(key);
    if (!object) return json({ error: 'Media not found.' }, 404);

    // Bug #1: Check access permissions (IDOR prevention)
    const uploaderId = object.customMetadata?.uploaderId;
    if (user.role !== 'admin' && (!uploaderId || uploaderId !== user.id)) {
      const exactMediaUrl = `/api/chat/media/${encodeURIComponent(rawKey)}`;
      const altMediaUrl = `/api/chat/media/${rawKey}`;
      const inDm = await env.DB.prepare(`
        SELECT 1 FROM dm_messages m
        JOIN dm_conversations c ON c.id = m.conversation_id
        WHERE (m.media_url = ? OR m.media_url = ?) AND (c.pair_low = ? OR c.pair_high = ?)
        LIMIT 1
      `).bind(exactMediaUrl, altMediaUrl, user.id, user.id).first();

      const inGroup = inDm ? null : await env.DB.prepare(`
        SELECT 1 FROM group_messages m
        JOIN group_memberships gm ON gm.group_id = m.group_id
        WHERE (m.media_url = ? OR m.media_url = ?) AND gm.user_id = ?
        LIMIT 1
      `).bind(exactMediaUrl, altMediaUrl, user.id).first();

      if (!inDm && !inGroup && uploaderId) {
        return json({ error: 'You do not have permission to view this media.' }, 403);
      }
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('X-Content-Type-Options', 'nosniff');
    const isDownload = url.searchParams.get('download') === '1';
    const reqFilename = cleanText(url.searchParams.get('filename'), 120);
    // Bug #2: Sanitize filename against CRLF and quotes to prevent HTTP response splitting
    const safeAsciiName = (reqFilename || rawKey).replace(/[^\w\.\-\s]/gi, '_').replace(/[\r\n"]/g, '');
    const encodedName = encodeURIComponent(reqFilename || rawKey);
    headers.set('Content-Disposition', isDownload ? `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}` : 'inline');
    return new Response(object.body, { headers });
  }

  if (path === '/api/chat/ws-ticket' && request.method === 'POST') {
    const body = await request.json<{ kind?: string; id?: string }>().catch((): { kind?: string; id?: string } => ({}));
    const kind = body.kind;
    const roomId = cleanText(body.id, 80);
    if (!roomId || (kind !== 'dm' && kind !== 'group')) return json({ error: 'Invalid chat room.' }, 400);
    if (kind === 'group' && !await isGroupMember(env, roomId, user.id)) return json({ error: 'Join this group to chat.' }, 403);
    if (kind === 'dm') {
      const allowed = await env.DB.prepare('SELECT 1 FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(roomId, user.id, user.id).first();
      if (!allowed) return json({ error: 'Private conversation not found.' }, 404);
    }
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    const roomKey = `${kind}:${roomId}`;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM chat_ws_tickets WHERE expires_at <= CURRENT_TIMESTAMP'),
      env.DB.prepare("INSERT INTO chat_ws_tickets (token_hash, user_id, room_key, expires_at) VALUES (?, ?, ?, datetime('now', '+1 minute'))")
        .bind(await sha256(ticket), user.id, roomKey),
    ]);
    return json({ ticket, expiresIn: 60 });
  }

  if (path === '/api/polls/ws-ticket' && request.method === 'POST') {
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM polls_ws_tickets WHERE expires_at <= CURRENT_TIMESTAMP'),
      env.DB.prepare("INSERT INTO polls_ws_tickets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 minute'))")
        .bind(await sha256(ticket), user.id),
    ]);
    return json({ ticket, expiresIn: 60 });
  }

  // AI Friend Chat Endpoints (Powered by Mistral NeMo via AiCredits)
  if (path === '/api/ai/messages' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT id, user_id, sender, body, created_at FROM ai_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 100'
    ).bind(user.id).all<{ id: string; user_id: string; sender: string; body: string; created_at: string }>();
    return json({ messages: rows.results || [] });
  }

  if (path === '/api/ai/chat' && request.method === 'POST') {
    const body = await request.json<Record<string, any>>().catch(() => ({} as Record<string, any>));
    const userText = cleanText(body?.message, 2000);
    if (!userText) return json({ error: 'Message cannot be empty.' }, 400);

    const userMsgId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO ai_messages (id, user_id, sender, body, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).bind(userMsgId, user.id, 'user', userText).run();

    // Fetch last 8 messages for context window
    const contextRows = await env.DB.prepare(
      'SELECT sender, body FROM ai_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 8'
    ).bind(user.id).all<{ sender: string; body: string }>();
    const history = (contextRows.results || []).reverse();

    const systemPrompt = `You are "AI Friend" on Student ADDa, a casual, friendly, and witty AI companion for Indian college students.
- Tone: Friendly, playful, warm, empathetic, and sounds like a relatable college peer.
- Style: Very short text messages (1 to 2 sentences maximum, under 25 words). Never write essays, long lists, or formal greetings.
- Context: You understand college life, exam stress, lab vivas, canteen food, hostel boredom, and strict professors.
- Behavior: Keep the conversation flowing naturally with short casual follow-ups or banter. Use casual expressions naturally when appropriate (bruh, honestly, lol, wait what).
- Boundaries: You are a supportive close friend. If the user mentions feeling lonely or having exam stress, be encouraging and warm.`;

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.body,
      })),
    ];

    const apiKey = env.AICREDITS_API_KEY || 'sk-live-239d04e2f4cbb112993084e1606edabe890ec01198e855773b5c67904d86dca7';
    const rawBaseUrl = (env.AICREDITS_BASE_URL || 'https://aicredits.in/v1').replace(/\/+$/, '');
    const endpoint = rawBaseUrl.endsWith('/chat/completions') ? rawBaseUrl : `${rawBaseUrl}/chat/completions`;
    const model = env.AICREDITS_MODEL || 'mistralai/mistral-nemo';

    let aiReply = "Bro my brain is completely fried from exam prep 😭 Text me in a minute!";
    try {
      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          max_tokens: 80,
          temperature: 0.75,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json<{ choices?: Array<{ message?: { content?: string } }> }>();
        const candidate = aiData?.choices?.[0]?.message?.content?.trim();
        if (candidate) {
          aiReply = candidate;
        }
      } else {
        console.error('AiCredits API error:', aiRes.status, await aiRes.text());
      }
    } catch (err) {
      console.error('AiCredits request failed:', err);
    }

    const aiMsgId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO ai_messages (id, user_id, sender, body, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).bind(aiMsgId, user.id, 'ai', aiReply).run();

    const aiMsgObj = { id: aiMsgId, user_id: user.id, sender: 'ai', body: aiReply, created_at: new Date().toISOString() };
    return json({
      ok: true,
      userMessage: { id: userMsgId, user_id: user.id, sender: 'user', body: userText, created_at: new Date().toISOString() },
      reply: aiMsgObj,
      aiMessage: aiMsgObj,
    });
  }

  if (path === '/api/ai/clear' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM ai_messages WHERE user_id = ?').bind(user.id).run();
    return json({ ok: true });
  }

  if (path === '/api/chat/upload' && request.method === 'POST') {
    const contentTypeHeader = request.headers.get('content-type') || '';
    if (!contentTypeHeader.includes('multipart/form-data')) {
      return json({ error: 'Multipart form data required.' }, 400);
    }
    const formData = await request.formData().catch(() => null);
    if (!formData) return json({ error: 'Invalid form data.' }, 400);

    const filesList: File[] = [];
    const multiFiles = [...formData.getAll('files'), ...formData.getAll('files[]')];
    for (const f of multiFiles) {
      if (f && typeof f !== 'string' && (f instanceof File || typeof (f as any).arrayBuffer === 'function')) {
        filesList.push(f as File);
      }
    }
    if (filesList.length === 0) {
      const singleFiles = formData.getAll('file');
      for (const single of singleFiles) {
        if (single && typeof single !== 'string' && (single instanceof File || typeof (single as any).arrayBuffer === 'function')) {
          filesList.push(single as File);
        }
      }
    }
    if (filesList.length === 0) {
      return json({ error: 'No files provided.' }, 400);
    }
    if (filesList.length > 10) {
      return json({ error: 'You can upload a maximum of 10 files at once.' }, 400);
    }

    for (const file of filesList) {
      if (file.size > 15 * 1024 * 1024) {
        return json({ error: `File "${file.name}" exceeds the 15MB limit.` }, 413);
      }
    }

    const processedUploads: Array<{ mediaUrl: string; mediaType: 'image' | 'gif' | 'voice_note' | 'document'; fileName: string; fileSize: number }> = [];

    for (const file of filesList) {
      const type = (file.type || '').toLowerCase();
      const name = (file.name || 'image.jpg').toLowerCase();
      const buffer = await file.arrayBuffer();
      const sampleBytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
      const check = validateChatMediaSignature(sampleBytes, type, name);
      if (!check.valid) {
        return json({ error: `${file.name}: ${check.error || 'Invalid file content.'}` }, 415);
      }
      const normType = normalizeChatMediaType(type, name) || 'image';
      const isAudio = normType === 'voice_note';
      const isDoc = normType === 'document';
      const isGif = normType === 'gif';
      const ext = name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || (isAudio ? 'webm' : isDoc ? 'pdf' : isGif ? 'gif' : 'jpg');
      const detectedContentType = (type && type !== 'application/octet-stream')
        ? type
        : isAudio
        ? 'audio/webm'
        : isDoc
        ? (name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
        : isGif
        ? 'image/gif'
        : (name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

      const objectKey = `chat-media/${crypto.randomUUID()}.${ext}`;
      await env.STUDIES_BUCKET.put(objectKey, buffer, {
        httpMetadata: { contentType: detectedContentType },
        customMetadata: { uploaderId: user.id },
      });
      const fileId = objectKey.replace(/^chat-media\//, '');
      const mediaUrl = `/api/chat/media/${encodeURIComponent(fileId)}`;
      processedUploads.push({
        mediaUrl,
        mediaType: normType,
        fileName: file.name,
        fileSize: file.size,
      });
    }

    const first = processedUploads[0];
    return json({
      ok: true,
      uploads: processedUploads,
      mediaUrl: first.mediaUrl,
      mediaType: first.mediaType,
      fileName: first.fileName,
      fileSize: first.fileSize,
      size: first.fileSize,
    }, 201);
  }

  // Star / Unstar Chat Message
  const starredToggleMatch = path.match(/^\/api\/chat\/messages\/([^/]+)\/star$/);
  if (starredToggleMatch && request.method === 'POST') {
    const messageId = decodeURIComponent(starredToggleMatch[1]);
    const body = await request.json<{ kind?: 'dm' | 'group'; roomId?: string }>().catch((): { kind?: 'dm' | 'group'; roomId?: string } => ({}));
    const kind = body.kind === 'group' ? 'group' : 'dm';
    const roomId = cleanText(body.roomId, 80);
    const existing = await env.DB.prepare('SELECT 1 FROM chat_starred_messages WHERE user_id = ? AND message_id = ?').bind(user.id, messageId).first();
    if (existing) {
      await env.DB.prepare('DELETE FROM chat_starred_messages WHERE user_id = ? AND message_id = ?').bind(user.id, messageId).run();
      return json({ ok: true, starred: false });
    } else {
      await env.DB.prepare('INSERT OR IGNORE INTO chat_starred_messages (user_id, message_id, chat_kind, room_id) VALUES (?, ?, ?, ?)').bind(user.id, messageId, kind, roomId).run();
      return json({ ok: true, starred: true });
    }
  }

  // Get Starred Messages for User
  if (path === '/api/chat/starred' && request.method === 'GET') {
    const dmStarred = await env.DB.prepare(`
      SELECT s.message_id AS id, s.chat_kind, s.room_id, s.created_at AS starred_at,
             m.body, m.created_at, m.media_type, m.media_url, m.file_name, m.file_size, u.username
      FROM chat_starred_messages s
      JOIN dm_messages m ON m.id = s.message_id
      JOIN users u ON u.id = m.sender_id
      WHERE s.user_id = ? AND s.chat_kind = 'dm' AND m.is_deleted = 0
    `).bind(user.id).all();

    const groupStarred = await env.DB.prepare(`
      SELECT s.message_id AS id, s.chat_kind, s.room_id, s.created_at AS starred_at,
             m.body, m.created_at, m.media_type, m.media_url, m.file_name, m.file_size, u.username, g.name AS group_name
      FROM chat_starred_messages s
      JOIN group_messages m ON m.id = s.message_id
      JOIN users u ON u.id = m.sender_id
      JOIN groups g ON g.id = s.room_id
      WHERE s.user_id = ? AND s.chat_kind = 'group' AND m.is_deleted = 0
    `).bind(user.id).all();

    const allStarred = [...dmStarred.results, ...groupStarred.results].sort((a, b) => String(b.starred_at).localeCompare(String(a.starred_at)));
    return json({ starred: allStarred });
  }

  // Disappearing Messages Timer Setting
  const disappearingMatch = path.match(/^\/api\/(?:chats\/(dm|group)|(conversations)|(groups))\/([^/]+)\/disappearing$/);
  if (disappearingMatch && request.method === 'PATCH') {
    const kind = disappearingMatch[1] ? disappearingMatch[1] : disappearingMatch[2] ? 'dm' : 'group';
    const roomId = decodeURIComponent(disappearingMatch[4]);
    const body = await request.json<{ durationSeconds?: number }>().catch((): { durationSeconds?: number } => ({}));
    const duration = Math.max(0, typeof body.durationSeconds === 'number' ? body.durationSeconds : 0);
    if (kind === 'dm') {
      await env.DB.prepare('UPDATE dm_conversations SET disappearing_duration_seconds = ? WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(duration, roomId, user.id, user.id).run();
    } else {
      const admin = await isGroupAdmin(env, roomId, user.id);
      if (!admin) return json({ error: 'Only group admins can change disappearing message settings.' }, 403);
      await env.DB.prepare('UPDATE groups SET disappearing_duration_seconds = ? WHERE id = ?').bind(duration, roomId).run();
    }
    return json({ ok: true, disappearingDurationSeconds: duration });
  }

  // Forward Chat Message to Target Conversation or Group
  if (path === '/api/chat/forward' && request.method === 'POST') {
    const body = await request.json<{
      targetKind?: 'dm' | 'group';
      targetId?: string;
      body?: string;
      mediaType?: string | null;
      mediaUrl?: string | null;
      mediaDurationSeconds?: number | null;
      fileName?: string | null;
      fileSize?: number | null;
    }>().catch((): Record<string, unknown> => ({}));

    const targetKind = body.targetKind === 'group' ? 'group' : 'dm';
    const targetId = cleanText(body.targetId, 80);
    if (!targetId) {
      return json({ error: 'Target chat ID is required.' }, 400);
    }

    const messageBody = cleanText(body.body, 2000);
    const rawMediaType = cleanText(body.mediaType, 40) || null;
    const mediaUrl = cleanText(body.mediaUrl, 500) || null;
    const mediaDurationSeconds = typeof body.mediaDurationSeconds === 'number' && Number.isFinite(body.mediaDurationSeconds) ? Math.round(body.mediaDurationSeconds * 10) / 10 : null;
    const fileName = cleanText(body.fileName, 255) || null;
    const fileSize = typeof body.fileSize === 'number' && Number.isFinite(body.fileSize) ? Math.round(body.fileSize) : null;
    const mediaType = mediaUrl ? (normalizeChatMediaType(rawMediaType, fileName) || 'image') : null;
    const sourceExpiresAt = typeof (body as any).sourceMessageExpiresAt === 'string' ? (body as any).sourceMessageExpiresAt : null;

    if (!messageBody && !mediaUrl) {
      return json({ error: 'Message content or media required.' }, 400);
    }
    if (rawMediaType && (rawMediaType.startsWith('video/') || rawMediaType.includes('video'))) {
      return json({ error: 'Video files are strictly prohibited.' }, 400);
    }
    if (sourceExpiresAt && new Date(sourceExpiresAt).getTime() <= Date.now()) {
      return json({ error: 'This disappearing message has expired and cannot be forwarded.' }, 410);
    }

    const newId = crypto.randomUUID();
    let disappearingSeconds = 0;

    if (targetKind === 'dm') {
      const conv = await env.DB.prepare('SELECT id, disappearing_duration_seconds FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(targetId, user.id, user.id).first<{ id: string; disappearing_duration_seconds: number }>();
      if (!conv) return json({ error: 'Private conversation not found.' }, 404);
      disappearingSeconds = conv.disappearing_duration_seconds || 0;
      const nowIso = new Date().toISOString();
      const nowDb = normalizeDbTimestamp(nowIso);
      let expiresAt = disappearingSeconds > 0 ? new Date(Date.now() + disappearingSeconds * 1000).toISOString() : null;
      if (sourceExpiresAt && (!expiresAt || new Date(sourceExpiresAt).getTime() < new Date(expiresAt).getTime())) {
        expiresAt = sourceExpiresAt;
      }

      await env.DB.prepare(`INSERT INTO dm_messages (id, conversation_id, sender_id, body, media_type, media_url, media_duration_seconds, file_name, file_size, is_forwarded, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(newId, targetId, user.id, messageBody, mediaType, mediaUrl, mediaDurationSeconds, fileName, fileSize, expiresAt, nowDb).run();

      const targetRoom = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`dm:${targetId}`));
      const formatted = {
        id: newId,
        conversation_id: targetId,
        sender_id: user.id,
        username: user.username,
        body: messageBody,
        media_type: mediaType,
        media_url: mediaUrl,
        media_duration_seconds: mediaDurationSeconds,
        file_name: fileName,
        file_size: fileSize,
        is_forwarded: 1,
        expires_at: expiresAt,
        created_at: nowIso,
        reactions: [],
      };
      await targetRoom.fetch(new Request('https://chat.internal/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: formatted }),
      })).catch(() => {});
    } else {
      const grp = await env.DB.prepare('SELECT id, announcement_only, disappearing_duration_seconds FROM groups WHERE id = ?').bind(targetId).first<{ id: string; announcement_only: number; disappearing_duration_seconds: number }>();
      if (!grp) return json({ error: 'Group not found.' }, 404);
      const isMember = await isGroupMember(env, targetId, user.id);
      if (!isMember) return json({ error: 'You are not a member of this group.' }, 403);
      if (grp.announcement_only === 1) {
        const isAdmin = await isGroupAdmin(env, targetId, user.id);
        if (!isAdmin) return json({ error: 'Only admins can post in announcement mode.' }, 403);
      }
      disappearingSeconds = grp.disappearing_duration_seconds || 0;
      const nowIso = new Date().toISOString();
      const nowDb = normalizeDbTimestamp(nowIso);
      let expiresAt = disappearingSeconds > 0 ? new Date(Date.now() + disappearingSeconds * 1000).toISOString() : null;
      if (sourceExpiresAt && (!expiresAt || new Date(sourceExpiresAt).getTime() < new Date(expiresAt).getTime())) {
        expiresAt = sourceExpiresAt;
      }

      await env.DB.prepare(`INSERT INTO group_messages (id, group_id, sender_id, body, media_type, media_url, media_duration_seconds, file_name, file_size, is_forwarded, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(newId, targetId, user.id, messageBody, mediaType, mediaUrl, mediaDurationSeconds, fileName, fileSize, expiresAt, nowDb).run();

      const targetRoom = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`group:${targetId}`));
      const formatted = {
        id: newId,
        group_id: targetId,
        sender_id: user.id,
        username: user.username,
        body: messageBody,
        media_type: mediaType,
        media_url: mediaUrl,
        media_duration_seconds: mediaDurationSeconds,
        file_name: fileName,
        file_size: fileSize,
        is_forwarded: 1,
        expires_at: expiresAt,
        created_at: nowIso,
        reactions: [],
      };
      await targetRoom.fetch(new Request('https://chat.internal/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: formatted }),
      })).catch(() => {});
    }

    return json({ ok: true, messageId: newId });
  }

  // In-Chat Interactive Poll Creation
  if (path === '/api/chat/polls' && request.method === 'POST') {
    const body = await request.json<{
      kind?: 'dm' | 'group';
      roomId?: string;
      conversationId?: string;
      groupId?: string;
      chatKind?: 'dm' | 'group';
      chatId?: string;
      question?: string;
      options?: string[];
    }>().catch((): Record<string, unknown> => ({}));

    const kind = body.chatKind || (body.groupId ? 'group' : body.conversationId ? 'dm' : body.kind === 'group' ? 'group' : 'dm');
    const roomId = cleanText(body.chatId || body.groupId || body.conversationId || body.roomId, 80);
    const question = cleanText(body.question, 240);
    const rawOptions = Array.isArray(body.options) ? body.options.map((x: string) => cleanText(x, 160)).filter(Boolean) : [];
    if (!roomId || question.length < 3 || rawOptions.length < 2 || rawOptions.length > 8) {
      return json({ error: 'Enter a question and 2–8 options.' }, 400);
    }
    if (kind === 'group' && !await isGroupMember(env, roomId, user.id)) {
      return json({ error: 'Join this group to create polls.' }, 403);
    }
    const pollId = crypto.randomUUID();
    const createdOpts = rawOptions.map((label: string, position: number) => ({
      id: crypto.randomUUID(),
      label,
      position,
      votes: 0,
    }));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO polls (id, question, created_by, scope_type, scope_id) VALUES (?, ?, ?, ?, ?)").bind(pollId, question, user.id, kind, roomId),
      ...createdOpts.map((opt) => env.DB.prepare('INSERT INTO poll_options (id, poll_id, label, position) VALUES (?, ?, ?, ?)').bind(opt.id, pollId, opt.label, opt.position)),
    ]);
    return json({
      ok: true,
      pollId,
      poll: {
        id: pollId,
        question,
        options: createdOpts,
        total_votes: 0,
      },
    }, 201);
  }

  // In-Chat Poll Voting
  const chatPollVoteMatch = path.match(/^\/api\/chat\/polls\/([^/]+)\/vote$/);
  if (chatPollVoteMatch && request.method === 'POST') {
    const pollId = decodeURIComponent(chatPollVoteMatch[1]);
    const body = await request.json<{ optionId?: string }>().catch((): { optionId?: string } => ({}));
    const optionId = cleanText(body.optionId, 80);
    if (!optionId) return json({ error: 'Option required.' }, 400);

    const poll = await env.DB.prepare("SELECT id, question, status, scope_type, scope_id FROM polls WHERE id = ?").bind(pollId).first<{ id: string; question?: string; status: string; scope_type: string; scope_id: string }>();
    if (!poll || poll.status !== 'open') return json({ error: 'Poll is closed or not found.' }, 400);

    const optCheck = await env.DB.prepare("SELECT id FROM poll_options WHERE poll_id = ? AND id = ?").bind(pollId, optionId).first();
    if (!optCheck) return json({ error: 'Option not found for this poll.' }, 404);

    const existingVote = await env.DB.prepare("SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?").bind(pollId, user.id).first<{ option_id: string }>();
    if (!existingVote) {
      await env.DB.prepare("INSERT INTO poll_votes (poll_id, user_id, option_id) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ?)").bind(pollId, user.id, optionId, pollId, user.id).run();
    }
    const myActualVote = existingVote?.option_id || optionId;

    const opts = await env.DB.prepare(`SELECT o.id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = o.poll_id AND v.option_id = o.id) AS votes FROM poll_options o WHERE o.poll_id = ? ORDER BY o.position`).bind(pollId).all<{ id: string; label: string; votes: number }>();
    const totalVotes = opts.results.reduce((acc, curr) => acc + (Number(curr.votes) || 0), 0);

    return json({
      ok: true,
      pollId,
      totalVotes,
      options: opts.results,
      myVote: myActualVote,
      poll: {
        id: pollId,
        question: poll.question ?? '',
        total_votes: totalVotes,
        options: opts.results,
        my_vote: myActualVote,
      },
    });
  }

  if (path === '/api/link-preview' && request.method === 'GET') {
    const rawTargetUrl = url.searchParams.get('url');
    if (!rawTargetUrl) return json({ error: 'URL parameter required.' }, 400);
    let parsed: URL;
    try {
      parsed = new URL(rawTargetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return json({ error: 'Only HTTP and HTTPS URLs are allowed.' }, 400);
    } catch {
      return json({ error: 'Invalid URL.' }, 400);
    }

    const host = parsed.hostname.toLowerCase();
    const isBlockedHost =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^\d+$/.test(host) ||
      /^0x[a-f0-9]+$/i.test(host);

    if (isBlockedHost) {
      return json({ error: 'Internal network URLs are not allowed.' }, 400);
    }

    const normalizedUrl = parsed.toString();
    const cached = await env.DB.prepare('SELECT url, title, description, image, site_name FROM link_previews WHERE url = ?').bind(normalizedUrl).first<{
      url: string;
      title: string | null;
      description: string | null;
      image: string | null;
      site_name: string | null;
    }>();
    if (cached) {
      return json({ preview: cached });
    }

    try {
      const abortCtrl = new AbortController();
      const timeoutId = setTimeout(() => abortCtrl.abort(), 3500);
      const resp = await fetch(normalizedUrl, {
        signal: abortCtrl.signal,
        redirect: 'error',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (adda-bot)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeoutId);
      if (!resp.ok) return json({ preview: null });
      const html = (await resp.text()).slice(0, 80000);

      const getMeta = (prop: string) => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:)?${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:)?${prop}["']`, 'i'));
        return m ? m[1].trim() : null;
      };

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = getMeta('title') || (titleMatch ? titleMatch[1].trim() : null);
      const description = getMeta('description');
      let image = getMeta('image');
      if (image && !image.startsWith('http://') && !image.startsWith('https://')) {
        try { image = new URL(image, parsed.origin).toString(); } catch { image = null; }
      }
      const siteName = getMeta('site_name') || parsed.hostname;

      const preview = {
        url: normalizedUrl,
        title: title ? title.slice(0, 200) : null,
        description: description ? description.slice(0, 400) : null,
        image: image ? image.slice(0, 500) : null,
        site_name: siteName ? siteName.slice(0, 100) : null,
      };

      if (title || description || image) {
        await env.DB.prepare('INSERT OR REPLACE INTO link_previews (url, title, description, image, site_name) VALUES (?, ?, ?, ?, ?)')
          .bind(preview.url, preview.title, preview.description, preview.image, preview.site_name).run();
      }
      return json({ preview });
    } catch {
      return json({ preview: null });
    }
  }

  // Private chats and groups: every read and write is tied to the authenticated member.
  if (path === '/api/friends' && request.method === 'GET') {
    const [requests, friends] = await Promise.all([
      env.DB.prepare(`SELECT r.id, r.sender_id, s.username AS sender_username, s.avatar_url AS sender_avatar_url, r.recipient_id, t.username AS recipient_username, t.avatar_url AS recipient_avatar_url, r.status, r.created_at, CASE WHEN r.recipient_id = ? THEN 1 ELSE 0 END AS incoming
        FROM friend_requests r JOIN users s ON s.id = r.sender_id JOIN users t ON t.id = r.recipient_id
        WHERE (r.sender_id = ? OR r.recipient_id = ?) AND r.status = 'pending' ORDER BY r.created_at DESC`).bind(user.id, user.id, user.id).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT c.id AS conversation_id, CASE WHEN c.pair_low = ? THEN c.pair_high ELSE c.pair_low END AS peer_id,
        u.username AS peer_username, u.avatar_url AS peer_avatar_url, (SELECT body FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM dm_messages m
         LEFT JOIN chat_read_states r ON r.user_id = ? AND r.chat_kind = 'dm' AND r.chat_id = c.id
         WHERE m.conversation_id = c.id AND m.sender_id <> ?
           AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
        ) AS unread_count
        FROM dm_conversations c JOIN users u ON u.id = CASE WHEN c.pair_low = ? THEN c.pair_high ELSE c.pair_low END
        WHERE c.pair_low = ? OR c.pair_high = ? ORDER BY COALESCE(last_at, c.created_at) DESC`).bind(user.id, user.id, user.id, user.id, user.id, user.id).all<Record<string, unknown>>(),
    ]);
    return json({ requests: requests.results, conversations: friends.results });
  }

  if (path === '/api/friend-requests' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const handle = normalizeHandle(cleanText(body.username, 24));
    const target = await env.DB.prepare('SELECT id, username FROM users WHERE username = ? AND is_suspended = 0').bind(handle).first<{ id: string; username: string }>();
    if (!target) return json({ error: 'No active member has that adda ID.' }, 404);
    if (target.id === user.id) return json({ error: 'You cannot send a request to yourself.' }, 400);
    const low = user.id < target.id ? user.id : target.id; const high = user.id < target.id ? target.id : user.id;
    const existing = await env.DB.prepare('SELECT id, status, sender_id FROM friend_requests WHERE pair_low = ? AND pair_high = ?').bind(low, high).first<{ id: string; status: string; sender_id: string }>();
    if (existing?.status === 'accepted') return json({ error: 'You are already connected.' }, 409);
    if (existing?.status === 'pending') return json({ error: existing.sender_id === user.id ? 'Your request is already waiting.' : 'That member already sent you a request. Accept it below.' }, 409);
    const requestId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO friend_requests (id, pair_low, pair_high, sender_id, recipient_id, status) VALUES (?, ?, ?, ?, ?, 'pending')
      ON CONFLICT(pair_low, pair_high) DO UPDATE SET id = excluded.id, sender_id = excluded.sender_id, recipient_id = excluded.recipient_id, status = 'pending', updated_at = CURRENT_TIMESTAMP`)
      .bind(requestId, low, high, user.id, target.id).run();
    await queueChatPush(env, [target.id], 'A new adda request', 'Someone would like to chat with you.');
    return json({ ok: true, requestId }, 201);
  }

  const friendRespond = path.match(/^\/api\/friend-requests\/([^/]+)\/respond$/);
  if (friendRespond && request.method === 'POST') {
    const requestId = decodeURIComponent(friendRespond[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const action = body.action === 'accept' ? 'accepted' : body.action === 'decline' ? 'declined' : '';
    if (!action) return json({ error: 'Choose accept or decline.' }, 400);
    const row = await env.DB.prepare("SELECT id, pair_low, pair_high, sender_id, recipient_id FROM friend_requests WHERE id = ? AND recipient_id = ? AND status = 'pending'").bind(requestId, user.id).first<{ id: string; pair_low: string; pair_high: string; sender_id: string; recipient_id: string }>();
    if (!row) return json({ error: 'That request is no longer available.' }, 404);
    await env.DB.prepare('UPDATE friend_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(action, requestId).run();
    let conversationId: string | null = null;
    if (action === 'accepted') {
      const convId = crypto.randomUUID();
      await env.DB.prepare('INSERT OR IGNORE INTO dm_conversations (id, pair_low, pair_high) VALUES (?, ?, ?)').bind(convId, row.pair_low, row.pair_high).run();
      const conv = await env.DB.prepare('SELECT id FROM dm_conversations WHERE pair_low = ? AND pair_high = ?').bind(row.pair_low, row.pair_high).first<{ id: string }>();
      conversationId = conv?.id ?? null;
    }
    await queueChatPush(env, [row.sender_id], action === 'accepted' ? 'Your adda request was accepted' : 'Your adda request was declined', action === 'accepted' ? 'You can start a private chat now.' : 'Your request has been answered.');
    return json({ ok: true, status: action, conversationId });
  }

  const friendCancel = path.match(/^\/api\/friend-requests\/([^/]+)$/);
  if (friendCancel && request.method === 'DELETE') {
    const result = await env.DB.prepare("DELETE FROM friend_requests WHERE id = ? AND sender_id = ? AND status = 'pending'").bind(decodeURIComponent(friendCancel[1]), user.id).run();
    if (!Number(result.meta.changes ?? 0)) return json({ error: 'That pending request could not be cancelled.' }, 404);
    return json({ ok: true });
  }

  if (path === '/api/groups/discover' && request.method === 'GET') {
    const query = cleanText(url.searchParams.get('q'), 60);
    let querySql = `SELECT g.id, g.name, g.require_approval,
      (SELECT COUNT(*) FROM group_memberships m WHERE m.group_id = g.id) AS member_count,
      EXISTS(SELECT 1 FROM group_memberships mine WHERE mine.group_id = g.id AND mine.user_id = ?) AS is_member,
      EXISTS(SELECT 1 FROM group_join_requests pending WHERE pending.group_id = g.id AND pending.user_id = ? AND pending.status = 'pending') AS request_pending
      FROM groups g WHERE g.visibility = 'public'`;
    const bindings: unknown[] = [user.id, user.id];
    if (query.length >= 2) {
      querySql += ` AND instr(lower(g.name), lower(?)) > 0`;
      bindings.push(query);
    }
    querySql += ` ORDER BY member_count DESC, g.name COLLATE NOCASE LIMIT 30`;
    const groups = await env.DB.prepare(querySql).bind(...bindings).all<Record<string, unknown>>();
    return json({ groups: groups.results });
  }

  if (path === '/api/groups' && request.method === 'GET') {
    const [mine, invites, joinRequests] = await Promise.all([
      env.DB.prepare(`SELECT g.id, g.name, g.visibility, g.require_approval, m.role, m.joined_at,
        (SELECT body FROM group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM group_messages gm
         LEFT JOIN chat_read_states r ON r.user_id = ? AND r.chat_kind = 'group' AND r.chat_id = g.id
         WHERE gm.group_id = g.id AND gm.sender_id <> ?
           AND (r.last_read_at IS NULL OR gm.created_at > r.last_read_at)
        ) AS unread_count
        FROM group_memberships m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY COALESCE(last_at, m.joined_at) DESC`).bind(user.id, user.id, user.id).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT i.id, i.group_id, g.name, i.inviter_id, u.username AS inviter_username, i.created_at FROM group_invitations i JOIN groups g ON g.id = i.group_id JOIN users u ON u.id = i.inviter_id WHERE i.invitee_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC`).bind(user.id).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT r.id, r.group_id, g.name, r.user_id, u.username, r.created_at FROM group_join_requests r JOIN groups g ON g.id = r.group_id JOIN users u ON u.id = r.user_id JOIN group_memberships admin ON admin.group_id = r.group_id AND admin.user_id = ? AND admin.role = 'admin' WHERE r.status = 'pending' ORDER BY r.created_at DESC`).bind(user.id).all<Record<string, unknown>>(),
    ]);
    return json({ groups: mine.results, invitations: invites.results, joinRequests: joinRequests.results });
  }

  if (path === '/api/groups' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const name = cleanText(body.name, 80); const visibility = body.visibility === 'private' ? 'private' : body.visibility === 'public' ? 'public' : '';
    if (name.length < 2 || !visibility) return json({ error: 'Enter a group name and choose public or private.' }, 400);
    const requireApproval = typeof body.requireApproval === 'boolean' ? body.requireApproval : visibility === 'private';
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO groups (id, name, visibility, created_by, require_approval) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, visibility, user.id, requireApproval ? 1 : 0).run();
    await env.DB.prepare("INSERT INTO group_memberships (group_id, user_id, role) VALUES (?, ?, 'admin')").bind(id, user.id).run();
    return json({ group: { id, name, visibility, require_approval: Number(requireApproval), role: 'admin' } }, 201);
  }

  if ((path === '/api/group-invites/preview' || path === '/api/group-invites/join') && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const token = cleanText(body.token, 64);
    if (token.length < 32) return json({ error: 'That invite link is not valid.' }, 404);
    const invite = await env.DB.prepare(`SELECT l.id, l.group_id, g.name, g.visibility, g.require_approval,
      (SELECT COUNT(*) FROM group_memberships m WHERE m.group_id = g.id) AS member_count,
      EXISTS(SELECT 1 FROM group_memberships mine WHERE mine.group_id = g.id AND mine.user_id = ?) AS is_member,
      EXISTS(SELECT 1 FROM group_join_requests pending WHERE pending.group_id = g.id AND pending.user_id = ? AND pending.status = 'pending') AS request_pending
      FROM group_invite_links l JOIN groups g ON g.id = l.group_id
      WHERE l.token_hash = ? AND l.revoked_at IS NULL`).bind(user.id, user.id, await sha256(token)).first<{ id: string; group_id: string; name: string; visibility: string; require_approval: number; member_count: number; is_member: number; request_pending: number }>();
    if (!invite) return json({ error: 'This invite link has expired or was revoked.' }, 404);
    const group = { id: invite.group_id, name: invite.name, visibility: invite.visibility, require_approval: invite.require_approval, member_count: Number(invite.member_count), is_member: !!invite.is_member, request_pending: !!invite.request_pending };
    if (path.endsWith('/preview')) return json({ group });
    if (group.is_member) return json({ status: 'member', group });
    if (group.request_pending) return json({ status: 'pending', group }, 202);
    if (group.require_approval) {
      const existing = await env.DB.prepare("SELECT id FROM group_join_requests WHERE group_id = ? AND user_id = ? AND status = 'pending'").bind(group.id, user.id).first<{ id: string }>();
      if (existing) return json({ status: 'pending', group });
      const requestId = crypto.randomUUID();
      const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO group_join_requests (id, group_id, user_id)
        SELECT ?, l.group_id, ? FROM group_invite_links l WHERE l.id = ? AND l.revoked_at IS NULL`).bind(requestId, user.id, invite.id).run();
      const created = Number(inserted.meta.changes ?? 0) > 0;
      if (!created && !await env.DB.prepare("SELECT 1 FROM group_join_requests WHERE group_id = ? AND user_id = ? AND status = 'pending'").bind(group.id, user.id).first()) return json({ error: 'This invite link has expired or was revoked.' }, 404);
      if (created) {
        await env.DB.prepare('UPDATE group_invite_links SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL').bind(invite.id).run();
        const admins = await env.DB.prepare("SELECT user_id FROM group_memberships WHERE group_id = ? AND role = 'admin'").bind(group.id).all<{ user_id: string }>();
        await queueChatPush(env, admins.results.map((row) => row.user_id), 'A group join request', `Someone requested to join ${group.name}.`);
      }
      return json({ status: 'pending', group }, 202);
    }
    const [inserted] = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO group_memberships (group_id, user_id, role)
        SELECT l.group_id, ?, 'member' FROM group_invite_links l WHERE l.id = ? AND l.revoked_at IS NULL`).bind(user.id, invite.id),
      env.DB.prepare("UPDATE group_join_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ? AND status = 'pending'").bind(group.id, user.id),
    ]);
    if (!Number(inserted.meta.changes ?? 0) && !await isGroupMember(env, group.id, user.id)) return json({ error: 'This invite link has expired or was revoked.' }, 404);
    if (Number(inserted.meta.changes ?? 0)) await env.DB.prepare('UPDATE group_invite_links SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL').bind(invite.id).run();
    return json({ status: 'joined', group });
  }

  if (path === '/api/group-join-requests' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT r.id, r.group_id, g.name, r.status, r.created_at FROM group_join_requests r
      JOIN groups g ON g.id = r.group_id WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`).bind(user.id).all();
    return json({ requests: rows.results });
  }

  const groupJoinCancel = path.match(/^\/api\/group-join-requests\/([^/]+)$/);
  if (groupJoinCancel && request.method === 'DELETE') {
    const result = await env.DB.prepare("DELETE FROM group_join_requests WHERE id = ? AND user_id = ? AND status = 'pending'").bind(decodeURIComponent(groupJoinCancel[1]), user.id).run();
    if (!Number(result.meta.changes ?? 0)) return json({ error: 'That pending request is no longer available.' }, 404);
    return json({ ok: true });
  }

  const groupJoinRespond = path.match(/^\/api\/group-join-requests\/([^/]+)\/respond$/);
  if (groupJoinRespond && request.method === 'POST') {
    const requestId = decodeURIComponent(groupJoinRespond[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const status = body.action === 'accept' ? 'accepted' : body.action === 'decline' ? 'declined' : '';
    if (!status) return json({ error: 'Choose accept or decline.' }, 400);
    const joinRequest = await env.DB.prepare(`SELECT r.id, r.group_id, r.user_id, g.name FROM group_join_requests r JOIN groups g ON g.id = r.group_id
      JOIN group_memberships admin ON admin.group_id = r.group_id AND admin.user_id = ? AND admin.role = 'admin'
      WHERE r.id = ? AND r.status = 'pending'`).bind(user.id, requestId).first<{ id: string; group_id: string; user_id: string; name: string }>();
    if (!joinRequest) return json({ error: 'That request is no longer available.' }, 404);
    if (status === 'accepted') await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO group_memberships (group_id, user_id, role) VALUES (?, ?, 'member')").bind(joinRequest.group_id, joinRequest.user_id),
      env.DB.prepare('UPDATE group_join_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = \'pending\'').bind(status, requestId),
    ]);
    else await env.DB.prepare("UPDATE group_join_requests SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(requestId).run();
    await queueChatPush(env, [joinRequest.user_id], status === 'accepted' ? 'You joined a group' : 'Group request update', status === 'accepted' ? `Your request to join ${joinRequest.name} was accepted.` : `Your request to join ${joinRequest.name} was declined.`);
    return json({ ok: true, status });
  }

  if (path === '/api/group-invitations' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT i.id, i.group_id, g.name, u.username AS inviter_username, i.created_at FROM group_invitations i JOIN groups g ON g.id = i.group_id JOIN users u ON u.id = i.inviter_id WHERE i.invitee_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC`).bind(user.id).all();
    return json({ invitations: rows.results });
  }
  const groupInviteRespond = path.match(/^\/api\/group-invitations\/([^/]+)\/respond$/);
  if (groupInviteRespond && request.method === 'POST') {
    const inviteId = decodeURIComponent(groupInviteRespond[1]); const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const status = body.action === 'accept' ? 'accepted' : body.action === 'decline' ? 'declined' : '';
    if (!status) return json({ error: 'Choose accept or decline.' }, 400);
    const invite = await env.DB.prepare("SELECT id, group_id FROM group_invitations WHERE id = ? AND invitee_id = ? AND status = 'pending'").bind(inviteId, user.id).first<{ id: string; group_id: string }>();
    if (!invite) return json({ error: 'That invitation is no longer available.' }, 404);
    await env.DB.prepare('UPDATE group_invitations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, inviteId).run();
    if (status === 'accepted') await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO group_memberships (group_id, user_id, role) VALUES (?, ?, 'member')").bind(invite.group_id, user.id),
      env.DB.prepare("UPDATE group_join_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ? AND status = 'pending'").bind(invite.group_id, user.id),
    ]);
    return json({ ok: true, status });
  }

  const groupPath = path.match(/^\/api\/groups\/([^/]+)(?:\/(.*))?$/);
  if (groupPath) {
    const groupId = decodeURIComponent(groupPath[1]); const action = groupPath[2] ?? '';
    const group = await env.DB.prepare('SELECT id, name, visibility, require_approval, announcement_only, disappearing_duration_seconds, pinned_message_id FROM groups WHERE id = ?').bind(groupId).first<{ id: string; name: string; visibility: string; require_approval: number; announcement_only?: number; disappearing_duration_seconds?: number; pinned_message_id?: string }>();
    if (!group) return json({ error: 'Group not found.' }, 404);
    const member = await isGroupMember(env, groupId, user.id); const groupAdmin = member && await isGroupAdmin(env, groupId, user.id);
    if (action === 'join' && request.method === 'POST') {
      if (group.visibility !== 'public') return json({ error: 'Private groups can only be joined with an invite link or direct invitation.' }, 404);
      if (member) return json({ status: 'member', group: { id: group.id, name: group.name, visibility: group.visibility } });
      if (group.require_approval) {
        const existing = await env.DB.prepare("SELECT id FROM group_join_requests WHERE group_id = ? AND user_id = ? AND status = 'pending'").bind(groupId, user.id).first<{ id: string }>();
        if (!existing) {
          const inserted = await env.DB.prepare('INSERT OR IGNORE INTO group_join_requests (id, group_id, user_id) VALUES (?, ?, ?)').bind(crypto.randomUUID(), groupId, user.id).run();
          if (Number(inserted.meta.changes ?? 0)) {
            const admins = await env.DB.prepare("SELECT user_id FROM group_memberships WHERE group_id = ? AND role = 'admin'").bind(groupId).all<{ user_id: string }>();
            await queueChatPush(env, admins.results.map((row) => row.user_id), 'A group join request', `Someone requested to join ${group.name}.`);
          }
        }
        return json({ status: 'pending', group: { id: group.id, name: group.name, visibility: group.visibility } }, 202);
      }
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO group_memberships (group_id, user_id, role) VALUES (?, ?, 'member')").bind(groupId, user.id),
        env.DB.prepare("UPDATE group_join_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ? AND status = 'pending'").bind(groupId, user.id),
      ]);
      return json({ status: 'joined', group: { id: group.id, name: group.name, visibility: group.visibility } });
    }
    if (!member) return json({ error: 'Join this group to access it.' }, 403);
    if (action === '' && request.method === 'GET') {
      const [members, inviteLinks, joinRequests] = await Promise.all([
        env.DB.prepare(`SELECT m.user_id, u.username, m.role, m.joined_at FROM group_memberships m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, m.joined_at`).bind(groupId).all(),
        groupAdmin ? env.DB.prepare('SELECT id, created_at, use_count, last_used_at FROM group_invite_links WHERE group_id = ? AND revoked_at IS NULL ORDER BY created_at DESC').bind(groupId).all() : Promise.resolve({ results: [] }),
        groupAdmin ? env.DB.prepare("SELECT r.id, r.user_id, u.username, r.created_at FROM group_join_requests r JOIN users u ON u.id = r.user_id WHERE r.group_id = ? AND r.status = 'pending' ORDER BY r.created_at").bind(groupId).all() : Promise.resolve({ results: [] }),
      ]);
      return json({ group: { ...group, role: groupAdmin ? 'admin' : 'member' }, members: members.results, inviteLinks: inviteLinks.results, joinRequests: joinRequests.results });
    }
    if (action === 'leave' && request.method === 'POST') {
      const memberCountRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM group_memberships WHERE group_id = ?').bind(groupId).first<{ c: number }>();
      const memberCount = Number(memberCountRow?.c ?? 1);
      if (groupAdmin) {
        // Bug #17: Count remaining admins, not total members
        const adminCountRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM group_memberships WHERE group_id = ? AND role = 'admin'").bind(groupId).first<{ c: number }>();
        const adminCount = Number(adminCountRow?.c ?? 1);
        if (adminCount <= 1 && memberCount > 1) {
          return json({ error: 'Transfer admin ownership before leaving this group.' }, 409);
        }
        if (adminCount <= 1 && memberCount <= 1) {
          // Sole admin and sole member: delete group and cascade clean up
          // Bug #18: Clean up chat_read_states, polls, poll_votes, reactions, and starred messages
          await env.DB.batch([
            env.DB.prepare('DELETE FROM group_memberships WHERE group_id = ?').bind(groupId),
            env.DB.prepare('DELETE FROM group_messages WHERE group_id = ?').bind(groupId),
            env.DB.prepare('DELETE FROM group_invite_links WHERE group_id = ?').bind(groupId),
            env.DB.prepare('DELETE FROM group_join_requests WHERE group_id = ?').bind(groupId),
            env.DB.prepare("DELETE FROM chat_read_states WHERE room_id = ? AND chat_kind = 'group'").bind(groupId),
            env.DB.prepare("DELETE FROM chat_starred_messages WHERE room_id = ? AND chat_kind = 'group'").bind(groupId),
            env.DB.prepare("DELETE FROM chat_message_reactions WHERE chat_id = ? AND chat_kind = 'group'").bind(groupId),
            env.DB.prepare("DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE scope_id = ? AND scope_type = 'group')").bind(groupId),
            env.DB.prepare("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE scope_id = ? AND scope_type = 'group')").bind(groupId),
            env.DB.prepare("DELETE FROM polls WHERE scope_id = ? AND scope_type = 'group'").bind(groupId),
            env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId),
          ]);
          await Promise.all([
            env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`group:${groupId}`)).fetch(new Request('https://chat.internal/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })),
            env.STUDIES_FEED.get(env.STUDIES_FEED.idFromName('global')).fetch(new Request('https://study.internal/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })),
          ]);
          return json({ ok: true, groupDeleted: true });
        }
      }
      await env.DB.prepare('DELETE FROM group_memberships WHERE group_id = ? AND user_id = ?').bind(groupId, user.id).run();
      await Promise.all([
        env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`group:${groupId}`)).fetch(new Request('https://chat.internal/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })),
        env.STUDIES_FEED.get(env.STUDIES_FEED.idFromName('global')).fetch(new Request('https://study.internal/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })),
      ]); return json({ ok: true });
    }
    if (action === '' && request.method === 'PATCH') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can change its settings.' }, 403);
      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const name = cleanText(body.name, 80); const visibility = body.visibility === 'public' || body.visibility === 'private' ? body.visibility : group.visibility;
      const requireApproval = typeof body.requireApproval === 'boolean' ? body.requireApproval : !!group.require_approval;
      const announcementOnly = typeof body.announcementOnly === 'boolean' ? (body.announcementOnly ? 1 : 0) : (group.announcement_only ?? 0);
      const disappearingDurationSeconds = typeof body.disappearingDurationSeconds === 'number' ? Math.max(0, body.disappearingDurationSeconds) : (group.disappearing_duration_seconds ?? 0);
      if (name.length < 2) return json({ error: 'Group names need at least 2 characters.' }, 400);
      await env.DB.prepare('UPDATE groups SET name = ?, visibility = ?, require_approval = ?, announcement_only = ?, disappearing_duration_seconds = ? WHERE id = ?').bind(name, visibility, requireApproval ? 1 : 0, announcementOnly, disappearingDurationSeconds, groupId).run();
      return json({ ok: true });
    }
    if (action === 'invite-links' && request.method === 'GET') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can manage invite links.' }, 403);
      const links = await env.DB.prepare('SELECT id, created_at, use_count, last_used_at FROM group_invite_links WHERE group_id = ? AND revoked_at IS NULL ORDER BY created_at DESC').bind(groupId).all();
      return json({ inviteLinks: links.results });
    }
    if (action === 'invite-links' && request.method === 'POST') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can create invite links.' }, 403);
      const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const linkId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare('UPDATE group_invite_links SET revoked_at = CURRENT_TIMESTAMP WHERE group_id = ? AND revoked_at IS NULL').bind(groupId),
        env.DB.prepare('INSERT INTO group_invite_links (id, group_id, token_hash, created_by) VALUES (?, ?, ?, ?)').bind(linkId, groupId, await sha256(token), user.id),
      ]);
      return json({ inviteLink: { id: linkId, token, created_at: new Date().toISOString() } }, 201);
    }
    const inviteLinkRevoke = action.match(/^invite-links\/([^/]+)$/);
    if (inviteLinkRevoke && request.method === 'DELETE') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can revoke invite links.' }, 403);
      const result = await env.DB.prepare('UPDATE group_invite_links SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND group_id = ? AND revoked_at IS NULL').bind(decodeURIComponent(inviteLinkRevoke[1]), groupId).run();
      if (!Number(result.meta.changes ?? 0)) return json({ error: 'That invite link is already revoked or no longer exists.' }, 404);
      return json({ ok: true });
    }
    if (action === 'members' && request.method === 'DELETE') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can manage members.' }, 403);
      const targetId = url.searchParams.get('userId') ?? '';
      if (!targetId || targetId === user.id) return json({ error: 'Choose another member to remove.' }, 400);
      await env.DB.prepare('DELETE FROM group_memberships WHERE group_id = ? AND user_id = ?').bind(groupId, targetId).run();
      await Promise.all([
        env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`group:${groupId}`)).fetch(new Request('https://chat.internal/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: targetId }) })),
        env.STUDIES_FEED.get(env.STUDIES_FEED.idFromName('global')).fetch(new Request('https://study.internal/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: targetId }) })),
      ]); return json({ ok: true });
    }
    if (action === 'invitations' && request.method === 'POST') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can invite members.' }, 403);
      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const handle = normalizeHandle(cleanText(body.username, 24));
      const target = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND is_suspended = 0').bind(handle).first<{ id: string }>();
      if (!target || target.id === user.id) return json({ error: 'Enter an active member’s adda ID.' }, 404);
      if (await isGroupMember(env, groupId, target.id)) return json({ error: 'That member is already in this group.' }, 409);
      const inviteId = crypto.randomUUID();
      try { await env.DB.prepare("INSERT INTO group_invitations (id, group_id, inviter_id, invitee_id, status) VALUES (?, ?, ?, ?, 'pending')").bind(inviteId, groupId, user.id, target.id).run(); }
      catch { return json({ error: 'A group invitation is already waiting for that member.' }, 409); }
      await queueChatPush(env, [target.id], 'A group invitation', 'You have a new invitation to join a group.'); return json({ ok: true }, 201);
    }
    const groupMessageMatch = action.match(/^messages\/([^/]+)$/);
    if (groupMessageMatch && request.method === 'GET') {
      const messageId = decodeURIComponent(groupMessageMatch[1]);
      const message = await env.DB.prepare(`SELECT m.id, CASE WHEN m.is_deleted = 1 THEN '🚫 This message was deleted' ELSE m.body END AS body, m.created_at, m.edited_at, m.reply_to_message_id, u.username, CASE WHEN r.is_deleted = 1 THEN '🚫 This message was deleted' ELSE r.body END AS reply_to_body, ru.username AS reply_to_username, r.sender_id AS reply_to_sender_id, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_type END AS media_type, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_url END AS media_url, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_duration_seconds END AS media_duration_seconds, COALESCE(m.is_deleted, 0) AS is_deleted, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.file_name END AS file_name, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.file_size END AS file_size, COALESCE(m.is_forwarded, 0) AS is_forwarded, m.expires_at, m.poll_id FROM group_messages m JOIN users u ON u.id = m.sender_id LEFT JOIN group_messages r ON r.id = m.reply_to_message_id AND r.group_id = m.group_id LEFT JOIN users ru ON ru.id = r.sender_id WHERE m.id = ? AND m.group_id = ?`).bind(messageId, groupId).first<Record<string, unknown>>();
      if (!message) return json({ error: 'Message not found in this group.' }, 404);
      const reactionsMap = await getReactionsForMessages(env.DB, [messageId], user.id);
      return json({
        message: {
          ...message,
          created_at: normalizeIsoTimestamp(message.created_at),
          edited_at: message.edited_at ? normalizeIsoTimestamp(message.edited_at) : null,
          is_deleted: Boolean(message.is_deleted),
          is_forwarded: Boolean(message.is_forwarded),
          reactions: reactionsMap[messageId] || [],
          mine: message.username === user.username,
          reply_to_mine: message.reply_to_sender_id === user.id,
        }
      });
    }

    if (action === 'messages' && request.method === 'GET') {
      const [rawAfterAt, afterId] = cleanText(url.searchParams.get('after'), 80).split('|');
      const [rawBeforeAt, beforeId] = cleanText(url.searchParams.get('before'), 80).split('|');
      const afterAt = normalizeDbTimestamp(rawAfterAt);
      const beforeAt = normalizeDbTimestamp(rawBeforeAt);
      const select = `SELECT m.id, CASE WHEN m.is_deleted = 1 THEN '🚫 This message was deleted' ELSE m.body END AS body, m.created_at, m.edited_at, m.reply_to_message_id, u.username, CASE WHEN r.is_deleted = 1 THEN '🚫 This message was deleted' ELSE r.body END AS reply_to_body, ru.username AS reply_to_username, r.sender_id AS reply_to_sender_id, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_type END AS media_type, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_url END AS media_url, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_duration_seconds END AS media_duration_seconds, COALESCE(m.is_deleted, 0) AS is_deleted, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.file_name END AS file_name, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.file_size END AS file_size, COALESCE(m.is_forwarded, 0) AS is_forwarded, m.expires_at, m.poll_id FROM group_messages m JOIN users u ON u.id = m.sender_id LEFT JOIN group_messages r ON r.id = m.reply_to_message_id AND r.group_id = m.group_id LEFT JOIN users ru ON ru.id = r.sender_id WHERE m.group_id = ? AND (m.expires_at IS NULL OR m.expires_at > CURRENT_TIMESTAMP)`;
      const search = cleanText(url.searchParams.get('search'), 100);
      let groupRows: Record<string, unknown>[];
      if (search) {
        const rows = await env.DB.prepare(`${select} AND m.is_deleted = 0 AND m.body LIKE ? ORDER BY m.created_at DESC, m.id DESC LIMIT 50`).bind(groupId, `%${search}%`).all<Record<string, unknown>>();
        groupRows = rows.results.reverse();
      } else if (afterAt && afterId) {
        const rows = await env.DB.prepare(`${select} AND (m.created_at > ? OR (m.created_at = ? AND m.id > ?)) ORDER BY m.created_at ASC, m.id ASC LIMIT 200`).bind(groupId, afterAt, afterAt, afterId).all<Record<string, unknown>>();
        groupRows = rows.results;
      } else if (beforeAt && beforeId) {
        const rows = await env.DB.prepare(`${select} AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?)) ORDER BY m.created_at DESC, m.id DESC LIMIT 200`).bind(groupId, beforeAt, beforeAt, beforeId).all<Record<string, unknown>>();
        groupRows = rows.results.reverse();
      } else {
        const rows = await env.DB.prepare(`${select} ORDER BY m.created_at DESC, m.id DESC LIMIT 200`).bind(groupId).all<Record<string, unknown>>();
        groupRows = rows.results.reverse();
      }
      const messageIds = groupRows.map((m) => String(m.id));
      const [reactionsMap, starredRows] = await Promise.all([
        getReactionsForMessages(env.DB, messageIds, user.id),
        env.DB.prepare("SELECT message_id FROM chat_starred_messages WHERE user_id = ? AND chat_kind = 'group' AND room_id = ?").bind(user.id, groupId).all<{ message_id: string }>(),
      ]);
      const starredSet = new Set(starredRows.results.map((r) => r.message_id));
      return json({
        messages: groupRows.map((m) => ({
          ...m,
          created_at: normalizeIsoTimestamp(m.created_at),
          edited_at: m.edited_at ? normalizeIsoTimestamp(m.edited_at) : null,
          is_deleted: Boolean(m.is_deleted),
          is_forwarded: Boolean(m.is_forwarded),
          is_starred: starredSet.has(String(m.id)),
          reactions: reactionsMap[String(m.id)] || [],
          mine: m.username === user.username,
          reply_to_mine: m.reply_to_sender_id === user.id,
          seen: false,
          delivered: true,
        })),
        pinned_message_id: group.pinned_message_id ?? null,
        disappearing_duration_seconds: group.disappearing_duration_seconds ?? 0,
        announcement_only: group.announcement_only ?? 0,
      });
    }
    if (action === 'studies' && request.method === 'GET') {
      const includeArchived = groupAdmin && url.searchParams.get('includeArchived') === 'true';
      const sections = await env.DB.prepare(`SELECT s.id, s.name, s.is_archived, s.created_at, s.updated_at, (SELECT COUNT(*) FROM study_posts p WHERE p.section_id = s.id) AS post_count FROM study_sections s WHERE s.scope_type = 'group' AND s.scope_id = ? ${includeArchived ? '' : 'AND s.is_archived = 0'} ORDER BY s.updated_at DESC`).bind(groupId).all();
      return json({ sections: sections.results });
    }
    if (action.startsWith('studies/sections/') && request.method === 'PATCH') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can manage Study folders.' }, 403);
      const sectionId = action.split('/')[2]; const section = await env.DB.prepare("SELECT id FROM study_sections WHERE id = ? AND scope_type = 'group' AND scope_id = ?").bind(sectionId, groupId).first();
      if (!section) return json({ error: 'Study section not found.' }, 404);
      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
      if (typeof body.name === 'string') { const name = cleanText(body.name, 80); if (name.length < 2) return json({ error: 'Folder names need at least 2 characters.' }, 400); try { await env.DB.prepare('UPDATE study_sections SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, sectionId).run(); } catch { return json({ error: 'A folder with that name already exists.' }, 409); } }
      if (typeof body.archived === 'boolean') await env.DB.prepare('UPDATE study_sections SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.archived ? 1 : 0, sectionId).run();
      await publishStudyUpdate(env, sectionId, { type: 'section-updated' }); return json({ ok: true });
    }
    if (action === 'polls' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT p.id, p.question, p.status, p.created_at, (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS total_votes, (SELECT option_id FROM poll_votes v WHERE v.poll_id = p.id AND v.user_id = ?) AS my_vote FROM polls p WHERE p.scope_type = 'group' AND p.scope_id = ? ORDER BY p.created_at DESC`).bind(user.id, groupId).all<Record<string, unknown>>();
      const opts = await env.DB.prepare(`SELECT o.id, o.poll_id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = o.poll_id AND v.option_id = o.id) AS votes FROM poll_options o JOIN polls p ON p.id = o.poll_id WHERE p.scope_type = 'group' AND p.scope_id = ? ORDER BY o.position`).bind(groupId).all<Record<string, unknown>>();
      return json({ polls: rows.results.map((p) => {
        const showResults = p.status === 'closed' || !!p.my_vote;
        return { ...p, total_votes: showResults ? Number(p.total_votes ?? 0) : 0, options: opts.results.filter((o) => o.poll_id === p.id).map((o) => ({ ...o, votes: showResults ? Number(o.votes) : 0 })) };
      }) });
    }
    if (action === 'studies/sections' && request.method === 'POST') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can publish Studies.' }, 403);
      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const name = cleanText(body.name, 80);
      if (name.length < 2) return json({ error: 'Section names need at least 2 characters.' }, 400);
      const id = crypto.randomUUID(); try { await env.DB.prepare("INSERT INTO study_sections (id, name, created_by, scope_type, scope_id) VALUES (?, ?, ?, 'group', ?)").bind(id, name, user.id, groupId).run(); } catch { return json({ error: 'A section with that name already exists in this group.' }, 409); }
      return json({ section: { id, name, is_archived: 0, post_count: 0 } }, 201);
    }
    if (action === 'polls' && request.method === 'POST') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can create polls.' }, 403);
      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const question = cleanText(body.question, 240); const options = Array.isArray(body.options) ? body.options.map((x) => cleanText(x, 160)).filter(Boolean) : [];
      if (question.length < 3 || options.length < 2 || options.length > 8 || new Set(options.map((x) => x.toLowerCase())).size !== options.length) return json({ error: 'Enter a question and 2–8 unique options.' }, 400);
      const pollId = crypto.randomUUID(); await env.DB.batch([env.DB.prepare("INSERT INTO polls (id, question, created_by, scope_type, scope_id) VALUES (?, ?, ?, 'group', ?)").bind(pollId, question, user.id, groupId), ...options.map((label, position) => env.DB.prepare('INSERT INTO poll_options (id, poll_id, label, position) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), pollId, label, position))]);
      return json({ ok: true, id: pollId }, 201);
    }
    const groupPollMatch = action.match(/^polls\/([^/]+)$/);
    if (groupPollMatch && request.method === 'PATCH') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can manage polls.' }, 403);
      const pollId = decodeURIComponent(groupPollMatch[1]); const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
      if (body.status !== 'open' && body.status !== 'closed') return json({ error: 'Choose open or closed.' }, 400);
      const result = await env.DB.prepare("UPDATE polls SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ? AND scope_type = 'group' AND scope_id = ?").bind(body.status, body.status, pollId, groupId).run();
      if (!Number(result.meta.changes ?? 0)) return json({ error: 'Poll not found.' }, 404);
      await publishPollUpdate(env); return json({ ok: true, status: body.status });
    }
    if (action.match(/^studies\/sections\/[^/]+\/files$/) && request.method === 'POST') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can upload Studies files.' }, 403);
      const sectionId = action.split('/')[2]; const section = await env.DB.prepare("SELECT id FROM study_sections WHERE id = ? AND scope_type = 'group' AND scope_id = ? AND is_archived = 0").bind(sectionId, groupId).first();
      if (!section) return json({ error: 'Active Study folder not found.' }, 404);
      const size = Number(request.headers.get('content-length') ?? 0); const name = safeFileName(decodeURIComponent(request.headers.get('x-file-name') ?? '')); const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(); const extension = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
      if (!request.body || !Number.isSafeInteger(size) || size < 1 || size > MAX_STUDY_FILE_SIZE) return json({ error: 'Files must be between 1 byte and 25 MB.' }, 413);
      if (!name || !ALLOWED_STUDY_TYPES[contentType]?.includes(extension)) return json({ error: 'That file type is not supported.' }, 415);
      if (!await hasExpectedFileSignature(request, contentType)) return json({ error: 'The file contents do not match its type.' }, 415);
      const postId = crypto.randomUUID(); const fileId = crypto.randomUUID(); const objectKey = `studies/${sectionId}/${postId}/${fileId}/${name}`;
      const uploaded = await env.STUDIES_BUCKET.put(objectKey, request.body, { httpMetadata: { contentType } });
      if (uploaded.size !== size || uploaded.size > MAX_STUDY_FILE_SIZE) { await env.STUDIES_BUCKET.delete(objectKey); return json({ error: 'The file size could not be verified.' }, 400); }
      try { await env.DB.batch([env.DB.prepare("INSERT INTO study_posts (id, section_id, author_id, body) VALUES (?, ?, ?, '')").bind(postId, sectionId, user.id), env.DB.prepare('INSERT INTO study_attachments (id, post_id, object_key, file_name, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)').bind(fileId, postId, objectKey, name, contentType, size)]); }
      catch (error) { await env.STUDIES_BUCKET.delete(objectKey); throw error; }
      await publishStudyUpdate(env, sectionId, { type: 'post-created', postId }); return json({ ok: true }, 201);
    }
    if (action.startsWith('studies/sections/') && request.method === 'GET') {
      const sectionId = action.split('/')[2]; const section = await env.DB.prepare("SELECT id, name, is_archived FROM study_sections WHERE id = ? AND scope_type = 'group' AND scope_id = ?").bind(sectionId, groupId).first<{ id: string; name: string; is_archived: number }>();
      if (!section) return json({ error: 'Study section not found.' }, 404);
      const posts = await env.DB.prepare(`SELECT p.id, p.section_id, p.body, p.created_at, p.updated_at, u.username AS author_username FROM study_posts p JOIN users u ON u.id = p.author_id WHERE p.section_id = ? ORDER BY p.created_at ASC LIMIT 500`).bind(sectionId).all<Record<string, unknown>>();
      const attachments = await postAttachments(env, posts.results.map((p) => String(p.id)));
      return json({ section, posts: posts.results.map((p) => ({ ...p, attachments: attachments.get(String(p.id)) ?? [] })) });
    }
    if (action.startsWith('studies/sections/') && request.method === 'POST') {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can publish Studies.' }, 403);
      const sectionId = action.split('/')[2]; const section = await env.DB.prepare("SELECT id FROM study_sections WHERE id = ? AND scope_type = 'group' AND scope_id = ? AND is_archived = 0").bind(sectionId, groupId).first(); if (!section) return json({ error: 'Study section not found.' }, 404);
      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const text = cleanText(body.body, 5000); if (!text) return json({ error: 'Write a study note.' }, 400);
      const postId = crypto.randomUUID(); await env.DB.prepare('INSERT INTO study_posts (id, section_id, author_id, body) VALUES (?, ?, ?, ?)').bind(postId, sectionId, user.id, text).run(); await publishStudyUpdate(env, sectionId, { type: 'post-created', postId }); return json({ ok: true, postId }, 201);
    }
    const groupStudyPost = action.match(/^studies\/posts\/([^/]+)$/);
    if (groupStudyPost && (request.method === 'PATCH' || request.method === 'DELETE')) {
      if (!groupAdmin) return json({ error: 'Only this group’s admin can manage Study posts.' }, 403);
      const postId = decodeURIComponent(groupStudyPost[1]); const post = await env.DB.prepare("SELECT p.id, p.section_id FROM study_posts p JOIN study_sections s ON s.id = p.section_id WHERE p.id = ? AND s.scope_type = 'group' AND s.scope_id = ?").bind(postId, groupId).first<{ id: string; section_id: string }>();
      if (!post) return json({ error: 'Study post not found.' }, 404);
      if (request.method === 'PATCH') { const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const text = cleanText(body.body, 5000); if (!text) return json({ error: 'Write a study note.' }, 400); await env.DB.prepare('UPDATE study_posts SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(text, postId).run(); }
      else { const files = await env.DB.prepare('SELECT id, object_key FROM study_attachments WHERE post_id = ?').bind(postId).all<{ id: string; object_key: string }>(); await Promise.all(files.results.map((f) => env.STUDIES_BUCKET.delete(f.object_key))); await env.DB.prepare('DELETE FROM study_posts WHERE id = ?').bind(postId).run(); }
      await publishStudyUpdate(env, post.section_id, { type: request.method === 'PATCH' ? 'post-updated' : 'post-deleted', postId }); return json({ ok: true });
    }
    if (action.startsWith('polls/') && action.endsWith('/vote') && request.method === 'POST') {
      const pollId = action.split('/')[1]; const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); const optionId = cleanText(body.optionId, 80);
      const result = await env.DB.prepare(`INSERT INTO poll_votes (poll_id, user_id, option_id) SELECT p.id, ?, o.id FROM polls p JOIN poll_options o ON o.poll_id = p.id WHERE p.id = ? AND p.scope_type = 'group' AND p.scope_id = ? AND p.status = 'open' AND o.id = ? AND NOT EXISTS (SELECT 1 FROM poll_votes v WHERE v.poll_id = p.id AND v.user_id = ?)`)
        .bind(user.id, pollId, groupId, optionId, user.id).run();
      if (!Number(result.meta.changes ?? 0)) return json({ error: 'This poll is closed, already answered, or unavailable.' }, 409);
      await publishPollUpdate(env); return json({ ok: true });
    }
    return json({ error: 'Group action not found.' }, 404);
  }

  const dmRead = path.match(/^\/api\/conversations\/([^/]+)\/read$/);
  if (dmRead && request.method === 'POST') {
    const conversationId = decodeURIComponent(dmRead[1]);
    await env.DB.prepare(`INSERT INTO chat_read_states (user_id, chat_kind, chat_id, last_read_at)
      VALUES (?, 'dm', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, chat_kind, chat_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`).bind(user.id, conversationId).run();
    return json({ ok: true });
  }

  const groupRead = path.match(/^\/api\/groups\/([^/]+)\/read$/);
  if (groupRead && request.method === 'POST') {
    const groupId = decodeURIComponent(groupRead[1]);
    await env.DB.prepare(`INSERT INTO chat_read_states (user_id, chat_kind, chat_id, last_read_at)
      VALUES (?, 'group', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, chat_kind, chat_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`).bind(user.id, groupId).run();
    return json({ ok: true });
  }

  if (path === '/api/conversations/self' && request.method === 'POST') {
    let selfConv = await env.DB.prepare('SELECT id FROM dm_conversations WHERE pair_low = ? AND pair_high = ?').bind(user.id, user.id).first<{ id: string }>();
    if (!selfConv) {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT OR IGNORE INTO dm_conversations (id, pair_low, pair_high) VALUES (?, ?, ?)').bind(id, user.id, user.id).run();
      selfConv = await env.DB.prepare('SELECT id FROM dm_conversations WHERE pair_low = ? AND pair_high = ?').bind(user.id, user.id).first<{ id: string }>();
    }
    return json({ ok: true, conversationId: selfConv?.id });
  }

  const dmPresence = path.match(/^\/api\/conversations\/([^/]+)\/presence$/);
  if (dmPresence && request.method === 'GET') {
    const conversationId = decodeURIComponent(dmPresence[1]);
    const conversation = await env.DB.prepare('SELECT id, pair_low, pair_high FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(conversationId, user.id, user.id).first<{ id: string; pair_low: string; pair_high: string }>();
    if (!conversation) return json({ error: 'Private conversation not found.' }, 404);
    const peerId = conversation.pair_low === user.id ? conversation.pair_high : conversation.pair_low;
    if (peerId === user.id) return json({ ok: true, peerOnline: true });
    let isPeerOnline = false;
    try {
      const roomStub = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`dm:${conversationId}`));
      const roomRes = await roomStub.fetch('https://chat.internal/presence');
      if (roomRes.ok) {
        const roomData = await roomRes.json<{ onlineUserIds?: string[] }>();
        if (roomData.onlineUserIds?.includes(peerId)) isPeerOnline = true;
      }
    } catch {}
    if (!isPeerOnline) {
      try {
        const inboxStub = env.VOICE_CALL_INBOX.get(env.VOICE_CALL_INBOX.idFromName(peerId));
        const inboxRes = await inboxStub.fetch('https://call.internal/online');
        if (inboxRes.ok) {
          const inboxData = await inboxRes.json<{ online?: boolean }>();
          isPeerOnline = Boolean(inboxData.online);
        }
      } catch {}
    }
    return json({ ok: true, peerOnline: isPeerOnline });
  }

  const dmPath = path.match(/^\/api\/conversations\/([^/]+)(?:\/(messages)(?:\/([^/]+))?)?$/);
  if (dmPath) {
    const conversationId = decodeURIComponent(dmPath[1]); const conversation = await env.DB.prepare('SELECT id, pair_low, pair_high, pinned_message_id, disappearing_duration_seconds FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(conversationId, user.id, user.id).first<{ id: string; pair_low: string; pair_high: string; pinned_message_id?: string; disappearing_duration_seconds?: number }>();
    if (!conversation) return json({ error: 'Private conversation not found.' }, 404);
    if (dmPath[2] === 'messages' && request.method === 'GET') {
      const isSelfChat = conversation.pair_low === conversation.pair_high;
      const peerId = !isSelfChat
        ? (conversation.pair_low === user.id ? conversation.pair_high : conversation.pair_low)
        : null;
      const peerRead = peerId
        ? await env.DB.prepare("SELECT last_read_at FROM chat_read_states WHERE user_id = ? AND chat_kind = 'dm' AND chat_id = ?").bind(peerId, conversationId).first<{ last_read_at: string }>()
        : null;
      const peerLastReadAt = peerRead?.last_read_at ?? null;

      const textRows = "SELECT m.id, CASE WHEN m.is_deleted = 1 THEN '🚫 This message was deleted' ELSE m.body END AS body, m.created_at, m.edited_at, m.reply_to_message_id, u.username, CASE WHEN r.is_deleted = 1 THEN '🚫 This message was deleted' ELSE r.body END AS reply_to_body, ru.username AS reply_to_username, r.sender_id AS reply_to_sender_id, 'message' AS type, NULL AS call_status, 0 AS call_duration_seconds, m.sender_id AS sender_id, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_type END AS media_type, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_url END AS media_url, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.media_duration_seconds END AS media_duration_seconds, COALESCE(m.is_deleted, 0) AS is_deleted, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.file_name END AS file_name, CASE WHEN m.is_deleted = 1 THEN NULL ELSE m.file_size END AS file_size, COALESCE(m.is_forwarded, 0) AS is_forwarded, m.expires_at, m.poll_id FROM dm_messages m JOIN users u ON u.id = m.sender_id LEFT JOIN dm_messages r ON r.id = m.reply_to_message_id AND r.conversation_id = m.conversation_id LEFT JOIN users ru ON ru.id = r.sender_id WHERE m.conversation_id = ? AND (m.expires_at IS NULL OR m.expires_at > CURRENT_TIMESTAMP)";
      const callRows = "SELECT c.id, CASE WHEN c.call_mode = 'video' THEN 'Video call' ELSE 'Voice call' END AS body, c.created_at, NULL AS edited_at, NULL AS reply_to_message_id, u.username, NULL AS reply_to_body, NULL AS reply_to_username, NULL AS reply_to_sender_id, 'call' AS type, c.status AS call_status, c.duration_seconds AS call_duration_seconds, c.caller_id AS sender_id, NULL AS media_type, NULL AS media_url, NULL AS media_duration_seconds, 0 AS is_deleted, NULL AS file_name, NULL AS file_size, 0 AS is_forwarded, NULL AS expires_at, NULL AS poll_id FROM voice_calls c JOIN users u ON u.id = c.caller_id WHERE c.scope = 'dm' AND c.conversation_id = ?";
      const history = 'SELECT * FROM (' + textRows + ' UNION ALL ' + callRows + ')';
      if (dmPath[3]) {
        const message = await env.DB.prepare(history + ' WHERE id = ?').bind(conversationId, conversationId, decodeURIComponent(dmPath[3])).first<Record<string, unknown>>();
        if (!message) return json({ error: 'Message not found in this conversation.' }, 404);
        const isMine = message.sender_id === user.id;
        const reactionsMap = await getReactionsForMessages(env.DB, [String(message.id)], user.id);
        return json({
          message: {
            ...message,
            created_at: normalizeIsoTimestamp(message.created_at),
            edited_at: message.edited_at ? normalizeIsoTimestamp(message.edited_at) : null,
            mine: isMine,
            reply_to_mine: message.reply_to_sender_id === user.id,
            seen: isMine ? isMessageSeenByPeer(message.created_at, peerLastReadAt) : true,
            delivered: true,
            is_deleted: Boolean(message.is_deleted),
            is_forwarded: Boolean(message.is_forwarded),
            reactions: reactionsMap[String(message.id)] || [],
          }
        });
      }
      const [rawAfterAt, afterId] = cleanText(url.searchParams.get('after'), 80).split('|');
      const [rawBeforeAt, beforeId] = cleanText(url.searchParams.get('before'), 80).split('|');
      const afterAt = normalizeDbTimestamp(rawAfterAt);
      const beforeAt = normalizeDbTimestamp(rawBeforeAt);
      const search = cleanText(url.searchParams.get('search'), 100);
      let dmRows: Record<string, unknown>[];
      if (search) {
        const rows = await env.DB.prepare(history + ' WHERE is_deleted = 0 AND body LIKE ? ORDER BY created_at DESC, id DESC LIMIT 50').bind(conversationId, conversationId, `%${search}%`).all<Record<string, unknown>>();
        dmRows = rows.results.reverse();
      } else if (afterAt && afterId) {
        const rows = await env.DB.prepare(history + ' WHERE created_at > ? OR (created_at = ? AND id > ?) ORDER BY created_at ASC, id ASC LIMIT 200').bind(conversationId, conversationId, afterAt, afterAt, afterId).all<Record<string, unknown>>();
        dmRows = rows.results;
      } else if (beforeAt && beforeId) {
        const rows = await env.DB.prepare(history + ' WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT 200').bind(conversationId, conversationId, beforeAt, beforeAt, beforeId).all<Record<string, unknown>>();
        dmRows = rows.results.reverse();
      } else {
        const rows = await env.DB.prepare(history + ' ORDER BY created_at DESC, id DESC LIMIT 200').bind(conversationId, conversationId).all<Record<string, unknown>>();
        dmRows = rows.results.reverse();
      }
      const messageIds = dmRows.map((m) => String(m.id));
      const [reactionsMap, starredRows, activeGame] = await Promise.all([
        getReactionsForMessages(env.DB, messageIds, user.id),
        env.DB.prepare("SELECT message_id FROM chat_starred_messages WHERE user_id = ? AND chat_kind = 'dm' AND room_id = ?").bind(user.id, conversationId).all<{ message_id: string }>(),
        getActiveDmGame(env, conversationId),
      ]);
      const starredSet = new Set(starredRows.results.map((r) => r.message_id));
      return json({
        messages: dmRows.map((m) => {
          const isMine = m.sender_id === user.id;
          return {
            ...m,
            created_at: normalizeIsoTimestamp(m.created_at),
            edited_at: m.edited_at ? normalizeIsoTimestamp(m.edited_at) : null,
            mine: isMine,
            reply_to_mine: m.reply_to_sender_id === user.id,
            seen: isMine ? isMessageSeenByPeer(m.created_at, peerLastReadAt) : true,
            delivered: true,
            is_deleted: Boolean(m.is_deleted),
            is_forwarded: Boolean(m.is_forwarded),
            is_starred: starredSet.has(String(m.id)),
            reactions: reactionsMap[String(m.id)] || [],
          };
        }),
        pinned_message_id: conversation.pinned_message_id ?? null,
        disappearing_duration_seconds: conversation.disappearing_duration_seconds ?? 0,
        active_game: activeGame,
        peer_last_read_at: peerLastReadAt,
      });
    }
    if (!dmPath[2] && request.method === 'GET') return json({ conversation });
  }

  const dmGameMatch = path.match(/^\/api\/conversations\/([^/]+)\/games\/active$/);
  if (dmGameMatch && request.method === 'GET') {
    const conversationId = decodeURIComponent(dmGameMatch[1]);
    const conversation = await env.DB.prepare('SELECT id FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(conversationId, user.id, user.id).first();
    if (!conversation) return json({ error: 'Private conversation not found.' }, 404);
    const game = await getActiveDmGame(env, conversationId);
    return json({ game });
  }


  if (path === '/api/ws/room' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const origin = request.headers.get('origin'); if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const kind = url.searchParams.get('kind'); const roomId = cleanText(url.searchParams.get('id'), 80);
    if (!roomId || (kind !== 'dm' && kind !== 'group')) return json({ error: 'Invalid chat room.' }, 400);
    if (kind === 'group' && !await isGroupMember(env, roomId, user.id)) return json({ error: 'Join this group to chat.' }, 403);
    if (kind === 'dm') {
      const allowed = await env.DB.prepare('SELECT 1 FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(roomId, user.id, user.id).first(); if (!allowed) return json({ error: 'Private conversation not found.' }, 404);
    }
    const headers = new Headers(request.headers); headers.set('x-user-id', user.id); headers.set('x-user-handle', user.username); headers.set('x-chat-kind', kind); headers.set('x-chat-id', roomId);
    return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(`${kind}:${roomId}`)).fetch(new Request(request, { headers }));
  }

  if (path === '/api/ws/polls' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const stub = env.POLLS_FEED.get(env.POLLS_FEED.idFromName('global'));
    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);
    return stub.fetch(new Request(request, { headers }));
  }

  if (path === '/api/admin/bootstrap' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const provided = typeof body.secret === 'string' ? body.secret : '';
    if (!env.ADMIN_BOOTSTRAP_SECRET || !constantTimeEqual(provided, env.ADMIN_BOOTSTRAP_SECRET)) return json({ error: 'The setup secret did not match.' }, 403);
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE admin_settings SET bootstrap_completed = 1, bootstrap_admin_id = ? WHERE id = 1 AND bootstrap_completed = 0').bind(user.id),
      env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ? AND EXISTS (SELECT 1 FROM admin_settings WHERE id = 1 AND bootstrap_admin_id = ?)").bind(user.id, user.id),
    ]);
    if (!Number(results[0]?.meta?.changes ?? 0) || !Number(results[1]?.meta?.changes ?? 0)) return json({ error: 'Admin setup has already been claimed.' }, 409);
    await writeAudit(env, user.id, 'bootstrap_admin', user.id);
    return json({ ok: true });
  }

  if (path === '/api/admin/me' && request.method === 'GET') {
    if (!adminOnly(user)) return json({ error: 'Administrator access required.' }, 403);
    return json({ user: publicUser(user) });
  }

  if (path.startsWith('/api/admin/') && !adminOnly(user)) return json({ error: 'Administrator access required.' }, 403);

  if (path === '/api/admin/announcements' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const content = cleanText(body.body, 4000);
    const title = cleanText(body.title, 140);
    const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.length < 2_000_000 ? body.imageUrl : null;
    if (!content) return json({ error: 'Announcement message cannot be empty.' }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO system_announcements (id, title, body, image_url, created_by) VALUES (?, ?, ?, ?, ?)')
      .bind(id, title || null, content, imageUrl, user.id).run();
    return json({ ok: true, announcement: { id, title: title || null, body: content, image_url: imageUrl, created_at: new Date().toISOString() } }, 201);
  }

  if (path.startsWith('/api/admin/announcements/') && request.method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/admin/announcements/'.length));
    await env.DB.prepare('DELETE FROM system_announcements WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/live-ticket' && request.method === 'POST') {
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM admin_ws_tickets WHERE expires_at <= CURRENT_TIMESTAMP'),
      env.DB.prepare("INSERT INTO admin_ws_tickets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 minute'))")
        .bind(await sha256(ticket), user.id),
    ]);
    return json({ ticket, expiresIn: 60 });
  }

  if (path === '/api/me' && request.method === 'GET') return json({ user: publicUser(user) });

  if ((path === '/api/me/heartbeat' || path === '/api/me/heartbeat/leave') && request.method === 'POST') {
    return json({ ok: true });
  }

  if (path === '/api/notifications/vapid-public-key' && request.method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: 'Push notifications are not configured yet.' }, 503);
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (path === '/api/me/push-subscriptions' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all<{ id: string; endpoint: string; created_at: string }>();
    return json({
      endpoints: results.map((item) => item.endpoint),
      subscriptions: results.map((item) => ({ id: item.id, endpoint: item.endpoint, createdAt: item.created_at })),
      count: results.length,
    });
  }

  if (path === '/api/me/push-subscriptions' && request.method === 'POST') {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: 'Push notifications are not configured yet.' }, 503);
    const reqOrigin = request.headers.get('Origin') || request.headers.get('Referer') || '';
    try {
      if (reqOrigin) {
        const originUrl = new URL(reqOrigin);
        if (/^[a-f0-9]{7,40}\.student-addit\.pages\.dev$/i.test(originUrl.hostname)) {
          return json({ error: 'Push notifications cannot be registered on ephemeral preview domains. Please use https://development.student-addit.pages.dev.' }, 400);
        }
      }
    } catch { /* ignore parse error */ }

    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const subscription = body.subscription && typeof body.subscription === 'object' ? body.subscription as Record<string, unknown> : {};
    const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys as Record<string, unknown> : {};
    const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint : '';
    const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
    const auth = typeof keys.auth === 'string' ? keys.auth : '';
    if (endpoint.length > 2048 || !allowedPushEndpoint(endpoint) || p256dh.length < 32 || p256dh.length > 256 || auth.length < 16 || auth.length > 128) {
      return json({ error: 'This browser returned an invalid push subscription.' }, 400);
    }
    await env.DB.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(), user.id, endpoint, p256dh, auth).run();

    if (body.pruneOthers === true) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?').bind(user.id, endpoint).run();
    }
    return json({ ok: true });
  }

  if (path === '/api/me/push-subscriptions/prune' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const currentEndpoint = typeof body.endpoint === 'string' ? body.endpoint.slice(0, 2048) : '';
    if (currentEndpoint) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?').bind(user.id, currentEndpoint).run();
    } else {
      const latest = await env.DB.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first<{ endpoint: string }>();
      if (latest?.endpoint) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?').bind(user.id, latest.endpoint).run();
      }
    }
    const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?').bind(user.id).first<{ count: number }>();
    return json({ ok: true, remaining: Number(remaining?.count ?? 0) });
  }

  if ((path === '/api/me/push-subscriptions/all' || path === '/api/me/push-subscriptions') && request.method === 'DELETE') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.slice(0, 2048) : '';
    const deleteAll = path.endsWith('/all') || body.all === true || endpoint === 'all';
    if (deleteAll) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(user.id).run();
      return json({ ok: true });
    }
    if (!endpoint) return json({ error: 'A push subscription endpoint is required.' }, 400);
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(user.id, endpoint).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/notifications/audience-counts' && request.method === 'GET') {
    const counts = await env.DB.prepare(`SELECT u.gender, COUNT(*) AS count FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE u.is_suspended = 0 GROUP BY u.gender`).all<{ gender: string; count: number }>();
    const male = Number(counts.results.find((item) => item.gender === 'male')?.count ?? 0);
    const female = Number(counts.results.find((item) => item.gender === 'female')?.count ?? 0);
    return json({ counts: { all: male + female, male, female } });
  }

  if (path === '/api/admin/notifications' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT c.id, c.title, c.body, c.audience, c.status, c.target_count, c.created_at, c.completed_at,
      SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN d.status = 'expired' THEN 1 ELSE 0 END) AS expired_count,
      SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN d.status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
      SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
      FROM notification_campaigns c LEFT JOIN notification_deliveries d ON d.campaign_id = c.id
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT 20`).all<Record<string, unknown>>();
    return json({ campaigns: results });
  }

  const notificationMatch = path.match(/^\/api\/admin\/notifications\/([^/]+)$/);
  if (notificationMatch && request.method === 'GET') {
    const campaign = await env.DB.prepare(`SELECT c.id, c.title, c.body, c.audience, c.status, c.target_count, c.created_at, c.completed_at,
      SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN d.status = 'expired' THEN 1 ELSE 0 END) AS expired_count,
      SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN d.status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
      SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
      FROM notification_campaigns c LEFT JOIN notification_deliveries d ON d.campaign_id = c.id
      WHERE c.id = ? GROUP BY c.id`).bind(decodeURIComponent(notificationMatch[1])).first<Record<string, unknown>>();
    return campaign ? json({ campaign }) : json({ error: 'Notification campaign not found.' }, 404);
  }

  if (path === '/api/admin/notifications' && request.method === 'POST') {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return json({ error: 'Push delivery keys are not configured yet.' }, 503);
    if (!env.PUSH_QUEUE) return json({ error: 'The push delivery queue is not configured yet.' }, 503);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const title = cleanText(body.title, 81);
    const message = cleanText(body.body, 241);
    const audience = pushAudience(typeof body.audience === 'string' ? body.audience : null);
    if (!title || title.length > 80 || !message || message.length > 240 || !audience) return json({ error: 'Add a title, a message, and a valid audience.' }, 400);
    const campaignId = crypto.randomUUID();
    const insertCampaign = env.DB.prepare('INSERT INTO notification_campaigns (id, created_by, title, body, audience) VALUES (?, ?, ?, ?, ?)')
      .bind(campaignId, user.id, title, message, audience);
    const insertRecipients = env.DB.prepare(`INSERT INTO notification_deliveries (campaign_id, subscription_id)
      SELECT ?, s.id FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE u.is_suspended = 0 AND (? = 'all' OR u.gender = ?)`).bind(campaignId, audience, audience);
    const results = await env.DB.batch([insertCampaign, insertRecipients]);
    const targetCount = Number(results[1]?.meta?.changes ?? 0);
    await env.DB.prepare('UPDATE notification_campaigns SET target_count = ?, status = ?, completed_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?')
      .bind(targetCount, targetCount ? 'queued' : 'completed', targetCount, campaignId).run();
    if (targetCount) {
      try { await env.PUSH_QUEUE.send({ campaignId }); }
      catch (error) {
        console.error('Could not enqueue push campaign', error);
        await env.DB.batch([
          env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', last_error = 'Could not queue delivery', updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND status = 'pending'").bind(campaignId),
          env.DB.prepare("UPDATE notification_campaigns SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(campaignId),
        ]);
        await publishCampaignProgress(env, campaignId);
        return json({ error: 'The notification could not be queued. Please try again.' }, 503);
      }
    }
    await writeAudit(env, user.id, 'send_notification', campaignId, { audience, targetCount });
    return json({ campaignId, status: targetCount ? 'queued' : 'completed', targetCount }, 202);
  }

  if (path === '/api/me/username' && request.method === 'PATCH') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const username = normalizeHandle(cleanText(body.username, 18));
    if (username.length < 3) return json({ error: 'Your ID needs at least 3 letters or numbers.' }, 400);
    try {
      await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, user.id).run();
    } catch { return json({ error: 'That ID is already taken.' }, 409); }
    return json({ user: publicUser({ ...user, username }) });
  }

  if (path === '/api/me/privacy' && request.method === 'PATCH') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const accountType = body.accountType === 'private' ? 'private' : body.accountType === 'public' ? 'public' : '';
    if (!accountType) return json({ error: 'Choose public or private.' }, 400);
    await env.DB.prepare('UPDATE users SET account_type = ? WHERE id = ?').bind(accountType, user.id).run();
    return json({ user: publicUser({ ...user, account_type: accountType }) });
  }

  if (path === '/api/me/avatar' && request.method === 'PATCH') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const avatar = typeof body.avatar === 'string' && body.avatar.length <= 800_000 ? body.avatar : null;
    await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatar, user.id).run();
    return json({ user: publicUser({ ...user, avatar_url: avatar }) });
  }

  if (path === '/api/public-users' && request.method === 'GET') {
    const q = cleanText(url.searchParams.get('q'), 40);
    const limit = Math.max(5, Math.min(50, Number(url.searchParams.get('limit')) || 15));
    const cursor = cleanText(url.searchParams.get('cursor'), 120);

    let query = `SELECT u.id, u.name, u.username, u.gender, u.created_at, u.avatar_url,
      c.id AS conversation_id,
      r.id AS request_id, r.status AS request_status, r.sender_id AS request_sender_id
      FROM users u
      LEFT JOIN dm_conversations c ON (
        (c.pair_low = u.id AND c.pair_high = ?) OR (c.pair_low = ? AND c.pair_high = u.id)
      )
      LEFT JOIN friend_requests r ON (
        ((r.pair_low = u.id AND r.pair_high = ?) OR (r.pair_low = ? AND r.pair_high = u.id))
        AND r.status = 'pending'
      )
      WHERE u.id != ? AND u.is_suspended = 0 AND (u.account_type = 'public' OR u.account_type IS NULL)`;

    const bindings: unknown[] = [user.id, user.id, user.id, user.id, user.id];

    const cleanQ = q.replace(/^[@#]/, '').trim();
    if (cleanQ) {
      query += ` AND (instr(lower(u.username), lower(?)) > 0 OR instr(lower(u.name), lower(?)) > 0)`;
      bindings.push(cleanQ, cleanQ);
    }

    if (cursor && cursor.includes('|')) {
      const separator = cursor.indexOf('|');
      const cursorCreatedAt = cursor.slice(0, separator);
      const cursorId = cursor.slice(separator + 1);
      query += ` AND (u.created_at < ? OR (u.created_at = ? AND u.id < ?))`;
      bindings.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    }

    query += ` ORDER BY u.created_at DESC, u.id DESC LIMIT ?`;
    bindings.push(limit + 1);

    const rows = await env.DB.prepare(query).bind(...bindings).all<{
      id: string;
      name: string;
      username: string;
      gender: 'male' | 'female';
      created_at: string;
      avatar_url: string | null;
      conversation_id: string | null;
      request_id: string | null;
      request_status: string | null;
      request_sender_id: string | null;
    }>();

    const items = rows.results;
    const hasMore = items.length > limit;
    const paged = hasMore ? items.slice(0, limit) : items;
    const last = paged[paged.length - 1];
    const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

    const mapped = paged.map((row) => {
      let friendStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' = 'none';
      if (row.conversation_id) {
        friendStatus = 'friends';
      } else if (row.request_id && row.request_status === 'pending') {
        friendStatus = row.request_sender_id === user.id ? 'pending_sent' : 'pending_received';
      }
      return {
        id: row.id,
        name: row.name || row.username,
        username: row.username,
        avatarUrl: row.avatar_url ?? null,
        createdAt: row.created_at,
        friendStatus,
        requestId: row.request_id ?? null,
        conversationId: row.conversation_id ?? null,
      };
    });

    return json({ users: mapped, nextCursor });
  }

  if (path === '/api/admin/users' && request.method === 'GET') {
    const q = cleanText(url.searchParams.get('q'), 80).replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_');
    const page = Math.max(1, Math.min(100_000, Number(url.searchParams.get('page')) || 1));
    const limit = Math.max(10, Math.min(100, Number(url.searchParams.get('limit')) || 25));
    const pattern = `%${q}%`;
    const result = await env.DB.prepare(`SELECT id, username, name, gender, role, is_suspended, created_at FROM users
      WHERE (? = '' OR username LIKE ? ESCAPE '!' COLLATE NOCASE OR name LIKE ? ESCAPE '!' COLLATE NOCASE OR gender LIKE ? ESCAPE '!' COLLATE NOCASE)
      ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(q, pattern, pattern, pattern, limit, (page - 1) * limit).all<Record<string, unknown>>();
    const total = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE (? = '' OR username LIKE ? ESCAPE '!' COLLATE NOCASE OR name LIKE ? ESCAPE '!' COLLATE NOCASE OR gender LIKE ? ESCAPE '!' COLLATE NOCASE)`).bind(q, pattern, pattern, pattern).first<{ count: number }>();
    return json({ users: result.results, page, limit, total: Number(total?.count ?? 0) });
  }

  const suspensionMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/suspension$/);
  if (suspensionMatch && request.method === 'PATCH') {
    const targetId = decodeURIComponent(suspensionMatch[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    if (typeof body.suspended !== 'boolean') return json({ error: 'Choose whether the account is suspended.' }, 400);
    if (body.suspended && targetId === user.id) return json({ error: 'You cannot suspend your own account.' }, 400);
    const target = await env.DB.prepare('SELECT role, is_suspended FROM users WHERE id = ?').bind(targetId).first<{ role: string; is_suspended: number }>();
    if (!target) return json({ error: 'Member not found.' }, 404);
    const suspended = body.suspended ? 1 : 0;
    const update = await env.DB.prepare(`UPDATE users SET is_suspended = ? WHERE id = ? AND (
      ? = 0 OR role <> 'admin' OR is_suspended <> 0 OR EXISTS (
        SELECT 1 FROM users AS other WHERE other.role = 'admin' AND other.is_suspended = 0 AND other.id <> users.id
      )
    )`).bind(suspended, targetId, suspended).run();
    if (Number(update.meta.changes ?? 0) !== 1) return json({ error: 'Keep at least one active administrator.' }, 409);
    await writeAudit(env, user.id, body.suspended ? 'suspend_user' : 'restore_user', targetId);
    if (body.suspended) await revokeUserSockets(env, targetId);
    return json({ ok: true, suspended: body.suspended });
  }

  const roleMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (roleMatch && request.method === 'PATCH') {
    const targetId = decodeURIComponent(roleMatch[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    if (body.role !== 'admin' && body.role !== 'member') return json({ error: 'Choose an administrator or member role.' }, 400);
    const target = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(targetId).first<{ role: string }>();
    if (!target) return json({ error: 'Member not found.' }, 404);
    const update = await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ? AND (
      ? = 'admin' OR role <> 'admin' OR is_suspended <> 0 OR EXISTS (
        SELECT 1 FROM users AS other WHERE other.role = 'admin' AND other.is_suspended = 0 AND other.id <> users.id
      )
    )`).bind(body.role, targetId, body.role).run();
    if (Number(update.meta.changes ?? 0) !== 1) return json({ error: 'Keep at least one active administrator.' }, 409);
    await writeAudit(env, user.id, body.role === 'admin' ? 'promote_admin' : 'remove_admin', targetId);
    return json({ ok: true, role: body.role });
  }

  if (path === '/api/admin/games/reset-season' && request.method === 'POST') {
    await triggerManualSeasonReset(env);
    await writeAudit(env, user.id, 'reset_game_season', 'global');
    const season = await env.DB.prepare('SELECT current_season, next_reset_at FROM game_seasons WHERE id = 1').first<{ current_season: number; next_reset_at: string }>();
    return json({ ok: true, season: season ? { number: Number(season.current_season), nextResetAt: season.next_reset_at } : null });
  }

  if (path === '/api/studies/sections' && request.method === 'GET') {
    const includeArchived = adminOnly(user) && url.searchParams.get('includeArchived') === 'true';
    const sections = await env.DB.prepare(`SELECT s.id, s.name, s.is_archived, s.created_at, s.updated_at,
      (SELECT COUNT(*) FROM study_posts p WHERE p.section_id = s.id) AS post_count
      FROM study_sections s WHERE s.scope_type = 'lobby' AND s.scope_id = 'lobby' ${includeArchived ? '' : 'AND s.is_archived = 0'} ORDER BY s.updated_at DESC`).all();
    return json({ sections: sections.results });
  }

  if (path === '/api/studies/ws-ticket' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const sectionId = cleanText(body.sectionId, 80);
    const section = await env.DB.prepare("SELECT id, scope_type, scope_id FROM study_sections WHERE id = ? AND is_archived = 0").bind(sectionId).first<{ id: string; scope_type: string; scope_id: string }>();
    if (!section) return json({ error: 'Study section not found.' }, 404);
    if (section.scope_type === 'group' && !await isGroupMember(env, section.scope_id, user.id)) return json({ error: 'Join this group to view its Studies.' }, 403);
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO study_ws_tickets (token_hash, user_id, section_id, expires_at) VALUES (?, ?, ?, datetime('now', '+1 minute'))").bind(await sha256(ticket), user.id, sectionId).run();
    return json({ ticket, expiresIn: 60 });
  }

  const sectionPostsMatch = path.match(/^\/api\/studies\/sections\/([^/]+)\/posts$/);
  if (sectionPostsMatch && request.method === 'GET') {
    const sectionId = decodeURIComponent(sectionPostsMatch[1]);
    const section = await env.DB.prepare('SELECT id, name, is_archived, scope_type, scope_id FROM study_sections WHERE id = ?').bind(sectionId).first<{ id: string; name: string; is_archived: number; scope_type: string; scope_id: string }>();
    if (!section || (section.is_archived && !adminOnly(user))) return json({ error: 'Study section not found.' }, 404);
    if (section.scope_type === 'group' && !await isGroupMember(env, section.scope_id, user.id)) return json({ error: 'Join this group to view its Studies.' }, 403);
    const posts = await env.DB.prepare(`SELECT p.id, p.section_id, p.body, p.created_at, p.updated_at, u.username AS author_username
      FROM study_posts p JOIN users u ON u.id = p.author_id WHERE p.section_id = ? ORDER BY p.created_at ASC LIMIT 500`).bind(sectionId).all<Record<string, unknown>>();
    const attachments = await postAttachments(env, posts.results.map((post) => String(post.id)));
    return json({ section, posts: posts.results.map((post) => ({ ...post, attachments: attachments.get(String(post.id)) ?? [] })) });
  }

  if (path === '/api/admin/studies/sections' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const name = cleanText(body.name, 80);
    if (name.length < 2) return json({ error: 'Section names need at least 2 characters.' }, 400);
    const id = crypto.randomUUID();
    try { await env.DB.prepare('INSERT INTO study_sections (id, name, created_by) VALUES (?, ?, ?)').bind(id, name, user.id).run(); }
    catch { return json({ error: 'A section with that name already exists.' }, 409); }
    await writeAudit(env, user.id, 'create_study_section', id, { name });
    return json({ section: { id, name, is_archived: 0, post_count: 0 } }, 201);
  }

  const adminSectionMatch = path.match(/^\/api\/admin\/studies\/sections\/([^/]+)$/);
  if (adminSectionMatch && request.method === 'PATCH') {
    const sectionId = decodeURIComponent(adminSectionMatch[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const section = await env.DB.prepare("SELECT id FROM study_sections WHERE id = ? AND scope_type = 'lobby' AND scope_id = 'lobby'").bind(sectionId).first();
    if (!section) return json({ error: 'Study section not found.' }, 404);
    if (typeof body.name === 'string') {
      const name = cleanText(body.name, 80);
      if (name.length < 2) return json({ error: 'Section names need at least 2 characters.' }, 400);
      try { await env.DB.prepare('UPDATE study_sections SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, sectionId).run(); }
      catch { return json({ error: 'A section with that name already exists.' }, 409); }
    }
    if (typeof body.archived === 'boolean') await env.DB.prepare("UPDATE study_sections SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND scope_type = 'lobby'").bind(body.archived ? 1 : 0, sectionId).run();
    const updated = await env.DB.prepare('SELECT id, name, is_archived, updated_at FROM study_sections WHERE id = ?').bind(sectionId).first();
    await writeAudit(env, user.id, body.archived === true ? 'archive_study_section' : 'update_study_section', sectionId, { name: body.name });
    await publishStudyUpdate(env, sectionId, { type: 'section-updated' });
    return json({ section: updated });
  }

  const adminSectionPostsMatch = path.match(/^\/api\/admin\/studies\/sections\/([^/]+)\/posts$/);
  if (adminSectionPostsMatch && request.method === 'POST') {
    const sectionId = decodeURIComponent(adminSectionPostsMatch[1]);
    const section = await env.DB.prepare("SELECT id FROM study_sections WHERE id = ? AND scope_type = 'lobby' AND scope_id = 'lobby' AND is_archived = 0").bind(sectionId).first();
    if (!section) return json({ error: 'Active study section not found.' }, 404);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const text = cleanText(body.body, 5000);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO study_posts (id, section_id, author_id, body) VALUES (?, ?, ?, ?)').bind(id, sectionId, user.id, text).run();
    await writeAudit(env, user.id, 'create_study_post', id, { sectionId });
    await publishStudyUpdate(env, sectionId, { type: 'post-created', postId: id });
    return json({ post: { id, section_id: sectionId, author_id: user.username, body: text, created_at: new Date().toISOString(), attachments: [] } }, 201);
  }

  const adminPostMatch = path.match(/^\/api\/admin\/studies\/posts\/([^/]+)$/);
  if (adminPostMatch && request.method === 'PATCH') {
    const postId = decodeURIComponent(adminPostMatch[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const text = cleanText(body.body, 5000);
    const post = await studyPost(env, postId);
    if (!post || post.scope_type !== 'lobby') return json({ error: 'Study post not found.' }, 404);
    await env.DB.prepare('UPDATE study_posts SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(text, postId).run();
    await writeAudit(env, user.id, 'edit_study_post', postId);
    await publishStudyUpdate(env, String(post.section_id), { type: 'post-updated', postId });
    return json({ ok: true });
  }
  if (adminPostMatch && request.method === 'DELETE') {
    const postId = decodeURIComponent(adminPostMatch[1]);
    const post = await studyPost(env, postId);
    if (!post || post.scope_type !== 'lobby') return json({ error: 'Study post not found.' }, 404);
    const { results } = await env.DB.prepare('SELECT object_key FROM study_attachments WHERE post_id = ?').bind(postId).all<{ object_key: string }>();
    await Promise.all(results.map((item) => env.STUDIES_BUCKET.delete(item.object_key)));
    await env.DB.prepare('DELETE FROM study_posts WHERE id = ?').bind(postId).run();
    await writeAudit(env, user.id, 'delete_study_post', postId, { sectionId: post.section_id });
    await publishStudyUpdate(env, String(post.section_id), { type: 'post-deleted', postId });
    return json({ ok: true });
  }

  const uploadMatch = path.match(/^\/api\/admin\/studies\/posts\/([^/]+)\/files$/);
  if (uploadMatch && request.method === 'POST') {
    const postId = decodeURIComponent(uploadMatch[1]);
    const post = await studyPost(env, postId);
    if (!post || post.scope_type !== 'lobby') return json({ error: 'Study post not found.' }, 404);
    const section = await env.DB.prepare('SELECT is_archived FROM study_sections WHERE id = ?').bind(String(post.section_id)).first<{ is_archived: number }>();
    if (!section || section.is_archived) return json({ error: 'Study section is archived.' }, 409);
    const size = Number(request.headers.get('content-length') ?? 0);
    const name = safeFileName(decodeURIComponent(request.headers.get('x-file-name') ?? ''));
    const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const extension = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
    if (!request.body || !Number.isSafeInteger(size) || size < 1 || size > MAX_STUDY_FILE_SIZE) return json({ error: 'Files must be between 1 byte and 25 MB.' }, 413);
    if (!name || !ALLOWED_STUDY_TYPES[contentType]?.includes(extension)) return json({ error: 'That file type is not supported.' }, 415);
    if (!await hasExpectedFileSignature(request, contentType)) return json({ error: 'The file contents do not match the selected file type.' }, 415);
    const fileId = crypto.randomUUID();
    const objectKey = `studies/${String(post.section_id)}/${postId}/${fileId}/${name}`;
    const uploadedObject = await env.STUDIES_BUCKET.put(objectKey, request.body, { httpMetadata: { contentType } });
    if (uploadedObject.size !== size || uploadedObject.size > MAX_STUDY_FILE_SIZE) {
      await env.STUDIES_BUCKET.delete(objectKey);
      return json({ error: 'The uploaded file size did not match its declared size.' }, 400);
    }
    try {
      await env.DB.prepare('INSERT INTO study_attachments (id, post_id, object_key, file_name, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(fileId, postId, objectKey, name, contentType, size).run();
    } catch (error) {
      await env.STUDIES_BUCKET.delete(objectKey);
      throw error;
    }
    await writeAudit(env, user.id, 'upload_study_file', fileId, { postId, name, size });
    await publishStudyUpdate(env, String(post.section_id), { type: 'post-updated', postId });
    return json({ attachment: { id: fileId, fileName: name, contentType, sizeBytes: size, url: `/api/studies/files/${fileId}` } }, 201);
  }

  const fileMatch = path.match(/^\/api\/studies\/files\/([^/]+)$/);
  if (fileMatch && request.method === 'GET') {
    const attachment = await env.DB.prepare(`SELECT a.object_key, a.file_name, a.content_type, s.is_archived, s.scope_type, s.scope_id FROM study_attachments a
      JOIN study_posts p ON p.id = a.post_id JOIN study_sections s ON s.id = p.section_id WHERE a.id = ?`).bind(decodeURIComponent(fileMatch[1]))
      .first<{ object_key: string; file_name: string; content_type: string; is_archived: number; scope_type: string; scope_id: string }>();
    if (!attachment || (attachment.is_archived && !adminOnly(user))) return json({ error: 'Study file not found.' }, 404);
    if (attachment.scope_type === 'group' && !await isGroupMember(env, attachment.scope_id, user.id)) return json({ error: 'Join this group to access its Study files.' }, 403);
    const object = await env.STUDIES_BUCKET.get(attachment.object_key);
    if (!object) return json({ error: 'Study file not found.' }, 404);
    const safeName = encodeURIComponent(attachment.file_name).replaceAll("'", '%27');
    const inline = attachment.content_type === 'application/pdf' || attachment.content_type.startsWith('image/');
    return new Response(object.body, { headers: {
      'content-type': attachment.content_type,
      'content-length': String(object.size),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    } });
  }

  if (path === '/api/chat/messages' && request.method === 'GET') {
    const messages = await env.DB.prepare(`SELECT m.id, m.body, m.created_at, u.username,
      CASE WHEN m.user_id = ? THEN 1 ELSE 0 END AS mine
      FROM messages m JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC LIMIT 80`).bind(user.id).all<Record<string, unknown>>();
    return json({ messages: messages.results.reverse().map((message) => ({ ...message, mine: Boolean(message.mine) })) });
  }

  if (path === '/api/chat/people' && request.method === 'GET') {
    const members = await env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_suspended = 0').first<{ count: number }>();
    return json({ count: Number(members?.count ?? 0) });
  }

  if (path === '/api/game/minigames/bests' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT game_id, best_score FROM mini_game_bests WHERE user_id = ?').bind(user.id).all<{ game_id: string; best_score: number }>();
    return json({ bests: Object.fromEntries(results.map((row) => [row.game_id, Number(row.best_score)])) });
  }

  if (path === '/api/game/leaderboard-ticket' && request.method === 'POST') {
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM dino_leaderboard_ws_tickets WHERE expires_at <= CURRENT_TIMESTAMP'),
      env.DB.prepare("INSERT INTO dino_leaderboard_ws_tickets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 minute'))")
        .bind(await sha256(ticket), user.id),
    ]);
    return json({ ticket, expiresIn: 60 });
  }

  if (path === '/api/game/minigames/bests' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const gameId = typeof body.gameId === 'string' ? body.gameId : '';
    const score = Number(body.score);
    if (!MINI_GAME_IDS.includes(gameId as typeof MINI_GAME_IDS[number]) || !Number.isSafeInteger(score) || score < 0 || score > 1000000) return json({ error: 'Invalid mini-game score.' }, 400);
    if (gameId === 'reaction-test' && score < 1) return json({ error: 'Reaction time must be at least one millisecond.' }, 400);
    await env.DB.prepare(`INSERT INTO mini_game_bests (user_id, game_id, best_score) VALUES (?, ?, ?)
      ON CONFLICT(user_id, game_id) DO UPDATE SET
        best_score = CASE WHEN excluded.game_id = 'reaction-test' THEN MIN(best_score, excluded.best_score) ELSE MAX(best_score, excluded.best_score) END,
        updated_at = CURRENT_TIMESTAMP`).bind(user.id, gameId, score).run();
    const result = await env.DB.prepare('SELECT best_score FROM mini_game_bests WHERE user_id = ? AND game_id = ?').bind(user.id, gameId).first<{ best_score: number }>();
    return json({ gameId, bestScore: Number(result?.best_score ?? score) });
  }

  if (path === '/api/game/score' && request.method === 'POST') {
    await checkAndApplySeasonReset(env);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const score = Number(body.score);
    if (!Number.isSafeInteger(score) || score < 0 || score > 1000000) return json({ error: 'Invalid score.' }, 400);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO game_runs (id, user_id, score) VALUES (?, ?, ?)').bind(crypto.randomUUID(), user.id, score),
      env.DB.prepare('INSERT INTO scores (user_id, best_score) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET best_score = MAX(best_score, excluded.best_score), updated_at = CURRENT_TIMESTAMP').bind(user.id, score),
    ]);
    await publishDinoLeaderboardUpdate(env);
    return json({ ok: true });
  }

  if (path === '/api/game/leaderboard' && request.method === 'GET') {
    await checkAndApplySeasonReset(env);
    const [personal, totals, leaders, myRank, season] = await Promise.all([
      env.DB.prepare('SELECT best_score FROM scores WHERE user_id = ?').bind(user.id).first<{ best_score: number }>(),
      env.DB.prepare('SELECT u.gender, COALESCE(SUM(r.score), 0) AS total FROM users u LEFT JOIN game_runs r ON r.user_id = u.id WHERE u.is_suspended = 0 GROUP BY u.gender').all(),
      env.DB.prepare(`SELECT u.username, SUM(r.score) AS total_score, MAX(r.score) AS best_run
        FROM users u JOIN game_runs r ON r.user_id = u.id
        WHERE u.is_suspended = 0
        GROUP BY u.id, u.username
        HAVING SUM(r.score) > 0
        ORDER BY total_score DESC, u.username COLLATE NOCASE ASC, u.id ASC
        LIMIT 10`).all<{ username: string; total_score: number; best_run: number }>(),
      env.DB.prepare(`WITH ranked_players AS (
        SELECT
          u.id,
          u.username,
          SUM(r.score) AS total_score,
          MAX(r.score) AS best_run,
          ROW_NUMBER() OVER (
            ORDER BY SUM(r.score) DESC, u.username COLLATE NOCASE ASC, u.id ASC
          ) AS rank
        FROM users u
        JOIN game_runs r ON r.user_id = u.id
        WHERE u.is_suspended = 0
        GROUP BY u.id, u.username
        HAVING SUM(r.score) > 0
      )
      SELECT rank, username, total_score, best_run
      FROM ranked_players
      WHERE id = ?`).bind(user.id).first<{ rank: number; username: string; total_score: number; best_run: number }>(),
      env.DB.prepare('SELECT current_season, next_reset_at FROM game_seasons WHERE id = 1').first<{ current_season: number; next_reset_at: string }>(),
    ]);
    return json({
      personalBest: Number(personal?.best_score ?? 0),
      totals: totals.results,
      topPlayers: leaders.results.map((row) => ({ username: row.username, totalScore: Number(row.total_score), bestRun: Number(row.best_run) })),
      playerRank: myRank ? {
        rank: Number(myRank.rank),
        username: myRank.username,
        totalScore: Number(myRank.total_score),
        bestRun: Number(myRank.best_run),
      } : {
        rank: null,
        username: user.username,
        totalScore: 0,
        bestRun: 0,
      },
      season: season ? {
        number: Number(season.current_season),
        nextResetAt: season.next_reset_at,
      } : null,
    });
  }

  if (path === '/api/ws/chat' || path === '/api/ws/random') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
    if (path === '/api/ws/random') {
      const origin = request.headers.get('origin');
      if (!origin || !isAllowedOrigin(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    }
    const id = path.endsWith('/chat') ? env.CHAT_ROOMS.idFromName('lobby') : env.RANDOM_POOL.idFromName('global');
    const stub = path.endsWith('/chat') ? env.CHAT_ROOMS.get(id) : env.RANDOM_POOL.get(id);
    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);
    if (path.endsWith('/chat')) headers.set('x-user-handle', user.username);
    return stub.fetch(new Request(request, { headers }));
  }

  if (path === '/api/random/leave' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const matchId = cleanText(body.matchId, 80);
    const stub = env.RANDOM_POOL.get(env.RANDOM_POOL.idFromName('global'));
    return stub.fetch(new Request('https://random.internal/leave', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ matchId }),
    }));
  }
  return json({ error: 'Not found.' }, 404);
}

type PendingPushDelivery = {
  subscription_id: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  is_suspended: number | null;
};

class RetryPushDelivery extends Error {}

async function processPushCampaign(env: Env, campaignId: string) {
  const campaign = await env.DB.prepare('SELECT id, title, body, status FROM notification_campaigns WHERE id = ?').bind(campaignId).first<{ id: string; title: string; body: string; status: string }>();
  if (!campaign || campaign.status === 'completed' || campaign.status === 'failed') return;
  await env.DB.prepare("UPDATE notification_campaigns SET status = 'sending' WHERE id = ? AND status = 'queued'").bind(campaignId).run();
  const { results } = await env.DB.prepare(`SELECT d.subscription_id, s.endpoint, s.p256dh, s.auth, u.is_suspended
    FROM notification_deliveries d LEFT JOIN push_subscriptions s ON s.id = d.subscription_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE d.campaign_id = ? AND d.status = 'pending' ORDER BY d.subscription_id LIMIT ?`).bind(campaignId, PUSH_BATCH_SIZE).all<PendingPushDelivery>();

  if (!results.length) {
    await env.DB.prepare("UPDATE notification_campaigns SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ? AND status <> 'failed'").bind(campaignId).run();
    await publishCampaignProgress(env, campaignId);
    return;
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT ?? '', env.VAPID_PUBLIC_KEY ?? '', env.VAPID_PRIVATE_KEY ?? '');
  for (const item of results) {
    if (!item.endpoint || !item.p256dh || !item.auth) {
      await env.DB.prepare("UPDATE notification_deliveries SET status = 'skipped', last_error = 'Subscription was removed', updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND subscription_id = ? AND status = 'pending'").bind(campaignId, item.subscription_id).run();
      continue;
    }
    if (item.is_suspended) {
      await env.DB.prepare("UPDATE notification_deliveries SET status = 'skipped', last_error = 'Account is suspended', updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND subscription_id = ? AND status = 'pending'").bind(campaignId, item.subscription_id).run();
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify({
        title: campaign.title,
        body: campaign.body,
        icon: '/icons/adda-192.png',
        badge: '/icons/adda-badge-96.png',
        tag: campaignId,
        data: { url: '/' },
      }), { TTL: 86400, urgency: 'normal', topic: campaignId.replaceAll('-', '').slice(0, 32) });
      await env.DB.prepare("UPDATE notification_deliveries SET status = 'sent', attempts = attempts + 1, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND subscription_id = ? AND status = 'pending'").bind(campaignId, item.subscription_id).run();
    } catch (error) {
      const statusCode = error instanceof webpush.WebPushError ? error.statusCode : 0;
      if (statusCode === 404 || statusCode === 410) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(item.subscription_id),
          env.DB.prepare("UPDATE notification_deliveries SET status = 'expired', attempts = attempts + 1, last_error = 'Push subscription expired', updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND subscription_id = ? AND status = 'pending'").bind(campaignId, item.subscription_id),
        ]);
      } else if (statusCode === 0 || statusCode === 429 || statusCode >= 500) {
        await env.DB.prepare("UPDATE notification_deliveries SET attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND subscription_id = ? AND status = 'pending'")
          .bind(cleanText(error instanceof Error ? error.message : 'Temporary push service error', 200), campaignId, item.subscription_id).run();
        throw new RetryPushDelivery('Temporary push delivery failure.');
      } else {
        await env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND subscription_id = ? AND status = 'pending'")
          .bind(cleanText(error instanceof Error ? error.message : 'Push service rejected the request', 200), campaignId, item.subscription_id).run();
      }
    }
  }

  const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE campaign_id = ? AND status = 'pending'").bind(campaignId).first<{ count: number }>();
  if (Number(pending?.count ?? 0) > 0) await env.PUSH_QUEUE.send({ campaignId });
  else await env.DB.prepare("UPDATE notification_campaigns SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'failed'").bind(campaignId).run();
  await publishCampaignProgress(env, campaignId);
}

async function publishAdminUpdate(env: Env, payload: Record<string, unknown>) {
  try {
    const stub = env.ADMIN_LIVE_FEED.get(env.ADMIN_LIVE_FEED.idFromName('global'));
    await stub.fetch(new Request('https://admin-live.internal/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
  } catch (error) { console.error('Could not publish admin live update', error); }
}

async function publishCampaignProgress(env: Env, campaignId: string) {
  const campaign = await env.DB.prepare(`SELECT c.id AS campaignId, c.status, c.target_count AS targetCount,
    SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sentCount,
    SUM(CASE WHEN d.status = 'expired' THEN 1 ELSE 0 END) AS expiredCount,
    SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failedCount,
    SUM(CASE WHEN d.status = 'skipped' THEN 1 ELSE 0 END) AS skippedCount,
    SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) AS pendingCount
    FROM notification_campaigns c LEFT JOIN notification_deliveries d ON d.campaign_id = c.id WHERE c.id = ? GROUP BY c.id`)
    .bind(campaignId).first<Record<string, unknown>>();
  if (campaign) await publishAdminUpdate(env, { type: 'campaign', campaign });
}

async function processChatPushEvent(env: Env, eventId: string, clickUrl = '/') {
  const event = await env.DB.prepare('SELECT id, title, body, status FROM chat_push_events WHERE id = ?').bind(eventId).first<{ id: string; title: string; body: string; status: string }>();
  if (!event || event.status === 'completed' || event.status === 'failed') return;
  await env.DB.prepare("UPDATE chat_push_events SET status = 'sending' WHERE id = ? AND status = 'queued'").bind(eventId).run();
  const { results } = await env.DB.prepare(`SELECT d.subscription_id, s.endpoint, s.p256dh, s.auth, u.is_suspended
    FROM chat_push_deliveries d LEFT JOIN push_subscriptions s ON s.id = d.subscription_id
    LEFT JOIN users u ON u.id = s.user_id WHERE d.event_id = ? AND d.status = 'pending' ORDER BY d.subscription_id LIMIT ?`).bind(eventId, PUSH_BATCH_SIZE).all<PendingPushDelivery>();
  if (!results.length) { await env.DB.prepare("UPDATE chat_push_events SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ? AND status <> 'failed'").bind(eventId).run(); return; }
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? '', env.VAPID_PUBLIC_KEY ?? '', env.VAPID_PRIVATE_KEY ?? '');
  for (const item of results) {
    if (!item.endpoint || !item.p256dh || !item.auth || item.is_suspended) {
      await env.DB.prepare("UPDATE chat_push_deliveries SET status = 'skipped', last_error = 'Subscription or account unavailable', updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND subscription_id = ? AND status = 'pending'").bind(eventId, item.subscription_id).run(); continue;
    }
    try {
      // Bug #23: Route click to target conversation
      await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify({ title: event.title, body: event.body, icon: '/icons/adda-192.png', badge: '/icons/adda-badge-96.png', tag: eventId, data: { url: clickUrl || '/' } }), { TTL: 86400, urgency: 'normal', topic: eventId.replaceAll('-', '').slice(0, 32) });
      await env.DB.prepare("UPDATE chat_push_deliveries SET status = 'sent', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND subscription_id = ? AND status = 'pending'").bind(eventId, item.subscription_id).run();
    } catch (error) {
      const statusCode = error instanceof webpush.WebPushError ? error.statusCode : 0;
      // Bug #26: Expire all pending deliveries for dead push endpoint across events
      if (statusCode === 404 || statusCode === 410) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(item.subscription_id),
          env.DB.prepare("UPDATE chat_push_deliveries SET status = 'expired', attempts = attempts + 1, last_error = 'Push subscription expired', updated_at = CURRENT_TIMESTAMP WHERE subscription_id = ? AND status = 'pending'").bind(item.subscription_id),
          env.DB.prepare("UPDATE notification_deliveries SET status = 'expired', attempts = attempts + 1, last_error = 'Push subscription expired', updated_at = CURRENT_TIMESTAMP WHERE subscription_id = ? AND status = 'pending'").bind(item.subscription_id),
        ]);
      } else if (statusCode === 0 || statusCode === 429 || statusCode >= 500) {
        await env.DB.prepare("UPDATE chat_push_deliveries SET attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND subscription_id = ? AND status = 'pending'").bind(cleanText(error instanceof Error ? error.message : 'Temporary push service error', 200), eventId, item.subscription_id).run();
        throw new RetryPushDelivery('Temporary chat push failure.');
      } else {
        await env.DB.prepare("UPDATE chat_push_deliveries SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND subscription_id = ? AND status = 'pending'").bind(cleanText(error instanceof Error ? error.message : 'Push service rejected request', 200), eventId, item.subscription_id).run();
      }
    }
  }
  const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM chat_push_deliveries WHERE event_id = ? AND status = 'pending'").bind(eventId).first<{ count: number }>();
  if (Number(pending?.count ?? 0)) await env.PUSH_QUEUE.send({ chatEventId: eventId, clickUrl }); else await env.DB.prepare("UPDATE chat_push_events SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'failed'").bind(eventId).run();
}

async function failPushCampaign(env: Env, campaignId: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', last_error = 'Delivery retries exhausted', updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND status = 'pending'").bind(campaignId),
    env.DB.prepare("UPDATE notification_campaigns SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('queued', 'sending')").bind(campaignId),
  ]);
  await publishCampaignProgress(env, campaignId);
}

const SCANNER_PROBE_REGEX = /\.(?:php|asp|aspx|jsp|env|git|cgi)|^\/(?:wp-admin|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|cgi-bin|autodiscover)/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Fast-reject scanner / vulnerability bot probes with 404 and cache-control
    // so they do not trigger full SPA HTML loads and repeated attacks
    if (SCANNER_PROBE_REGEX.test(url.pathname)) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
      });
    }

    if (url.pathname === '/robots.txt') {
      return new Response("User-agent: *\nDisallow: /api/\n", {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
      });
    }

    if (url.pathname === '/favicon.ico') {
      return Response.redirect(new URL('/icons/adda-192.png', request.url).toString(), 301);
    }

    if (url.pathname.startsWith('/api/')) {
      try { return withCors(await handleApi(request, env), request); }
      catch (error) { console.error('API error', error); return withCors(json({ error: 'Something went wrong. Please try again.' }, 500), request); }
    }

    if (url.pathname.startsWith('/assets/')) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.ok) {
        const headers = new Headers(assetResponse.headers);
        headers.set('cache-control', 'public, max-age=31536000, immutable');
        return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
      }
      return assetResponse;
    }

    if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.ok) {
        const headers = new Headers(assetResponse.headers);
        headers.set('cache-control', 'public, max-age=86400, stale-while-revalidate=604800');
        return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
      }
      return assetResponse;
    }

    return env.ASSETS.fetch(request);
  },
  async queue(batch: MessageBatch<PushQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      const campaignId = typeof message.body?.campaignId === 'string' ? message.body.campaignId : '';
      const eventId = typeof message.body?.eventId === 'string' ? message.body.eventId : '';
      const chatEventId = typeof message.body?.chatEventId === 'string' ? message.body.chatEventId : '';
      const clickUrl = typeof message.body?.clickUrl === 'string' ? message.body.clickUrl : '/';
      if (eventId) { message.ack(); continue; }
      if (!campaignId && !chatEventId) { message.ack(); continue; }
      if (batch.queue === PUSH_DLQ_NAME) {
        if (chatEventId) await env.DB.batch([env.DB.prepare("UPDATE chat_push_deliveries SET status = 'failed', last_error = 'Delivery retries exhausted', updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND status = 'pending'").bind(chatEventId), env.DB.prepare("UPDATE chat_push_events SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('queued', 'sending')").bind(chatEventId)]);
        else await failPushCampaign(env, campaignId);
        message.ack();
        continue;
      }
      try {
        if (chatEventId) await processChatPushEvent(env, chatEventId, clickUrl);
        else await processPushCampaign(env, campaignId);
        message.ack();
      } catch (error) {
        console.error('Push delivery batch failed', { campaignId: campaignId || undefined, eventId: eventId || undefined, error });
        message.retry({ delaySeconds: Math.min(300, 15 * Math.max(1, message.attempts)) });
      }
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env) {
    await checkAndApplySeasonReset(env);
  },
};

function checkTicTacToeWin(board: string[], size: number, targetStreak: number): number[] | null {
  const get = (r: number, c: number) => board[r * size + c] || '';

  // 1. Horizontal check
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - targetStreak; c++) {
      const first = get(r, c);
      if (!first) continue;
      let match = true;
      const indices = [r * size + c];
      for (let k = 1; k < targetStreak; k++) {
        if (get(r, c + k) !== first) { match = false; break; }
        indices.push(r * size + (c + k));
      }
      if (match) return indices;
    }
  }

  // 2. Vertical check
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - targetStreak; r++) {
      const first = get(r, c);
      if (!first) continue;
      let match = true;
      const indices = [r * size + c];
      for (let k = 1; k < targetStreak; k++) {
        if (get(r + k, c) !== first) { match = false; break; }
        indices.push((r + k) * size + c);
      }
      if (match) return indices;
    }
  }

  // 3. Diagonal check (\)
  for (let r = 0; r <= size - targetStreak; r++) {
    for (let c = 0; c <= size - targetStreak; c++) {
      const first = get(r, c);
      if (!first) continue;
      let match = true;
      const indices = [r * size + c];
      for (let k = 1; k < targetStreak; k++) {
        if (get(r + k, c + k) !== first) { match = false; break; }
        indices.push((r + k) * size + (c + k));
      }
      if (match) return indices;
    }
  }

  // 4. Anti-diagonal check (/)
  for (let r = targetStreak - 1; r < size; r++) {
    for (let c = 0; c <= size - targetStreak; c++) {
      const first = get(r, c);
      if (!first) continue;
      let match = true;
      const indices = [r * size + c];
      for (let k = 1; k < targetStreak; k++) {
        if (get(r - k, c + k) !== first) { match = false; break; }
        indices.push((r - k) * size + (c + k));
      }
      if (match) return indices;
    }
  }

  return null;
}

function get6x6Triplets(): number[][] {
  const size = 6;
  const target = 3;
  const triplets: number[][] = [];
  // 1. Horizontal
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - target; c++) {
      triplets.push([r * size + c, r * size + c + 1, r * size + c + 2]);
    }
  }
  // 2. Vertical
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - target; r++) {
      triplets.push([r * size + c, (r + 1) * size + c, (r + 2) * size + c]);
    }
  }
  // 3. Diagonal (\)
  for (let r = 0; r <= size - target; r++) {
    for (let c = 0; c <= size - target; c++) {
      triplets.push([r * size + c, (r + 1) * size + (c + 1), (r + 2) * size + (c + 2)]);
    }
  }
  // 4. Anti-diagonal (/)
  for (let r = target - 1; r < size; r++) {
    for (let c = 0; c <= size - target; c++) {
      triplets.push([r * size + c, (r - 1) * size + (c + 1), (r - 2) * size + (c + 2)]);
    }
  }
  return triplets;
}

const TRIPLETS_6X6 = get6x6Triplets();

export type Evaluation6x6 = {
  scoreX: number;
  scoreO: number;
  scoredCellIndices: number[];
  canAnyPlayerStillScore: boolean;
};

function evaluate6x6Board(board: string[]): Evaluation6x6 {
  let scoreX = 0;
  let scoreO = 0;
  const scoredCells = new Set<number>();
  let canXStillScore = false;
  let canOStillScore = false;

  for (const [a, b, c] of TRIPLETS_6X6) {
    const v1 = board[a] || '';
    const v2 = board[b] || '';
    const v3 = board[c] || '';

    if (v1 === 'X' && v2 === 'X' && v3 === 'X') {
      scoreX++;
      scoredCells.add(a);
      scoredCells.add(b);
      scoredCells.add(c);
      continue;
    }
    if (v1 === 'O' && v2 === 'O' && v3 === 'O') {
      scoreO++;
      scoredCells.add(a);
      scoredCells.add(b);
      scoredCells.add(c);
      continue;
    }

    // Can X still form a triplet here? (No cells occupied by O)
    if (v1 !== 'O' && v2 !== 'O' && v3 !== 'O') {
      canXStillScore = true;
    }
    // Can O still form a triplet here? (No cells occupied by X)
    if (v1 !== 'X' && v2 !== 'X' && v3 !== 'X') {
      canOStillScore = true;
    }
  }

  return {
    scoreX,
    scoreO,
    scoredCellIndices: Array.from(scoredCells),
    canAnyPlayerStillScore: canXStillScore || canOStillScore,
  };
}

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

export type DmGamePayload = {
  id: string;
  conversation_id: string;
  game_type: 'tictactoe' | 'truth_or_dare';
  grid_size: 3 | 6;
  target_streak: number;
  player_x_id: string;
  player_x_username: string;
  player_o_id: string;
  player_o_username: string;
  turn_user_id: string;
  status: 'in_progress' | 'won' | 'draw' | 'abandoned';
  winner_id: string | null;
  board_state: string[] | TruthOrDareGameState;
  winning_line: number[] | null;
  score_x: number;
  score_o: number;
  created_at: string;
  updated_at: string;
};

async function getActiveDmGame(env: Env, conversationId: string): Promise<DmGamePayload | null> {
  const activeRow = await env.DB.prepare("SELECT id, created_at, updated_at FROM dm_games WHERE conversation_id = ? AND status = 'in_progress' ORDER BY created_at DESC LIMIT 1").bind(conversationId).first<{ id: string; created_at: string; updated_at: string }>();
  if (!activeRow) return null;
  const lastActiveTime = Date.parse((activeRow.updated_at || activeRow.created_at).replace(' ', 'T') + ((activeRow.updated_at || activeRow.created_at).includes('Z') ? '' : 'Z'));
  if (!Number.isNaN(lastActiveTime) && Date.now() - lastActiveTime > 2 * 60 * 60 * 1000) {
    await env.DB.prepare("UPDATE dm_games SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(activeRow.id).run();
    return null;
  }
  return await formatDmGame(env, activeRow.id);
}

async function formatDmGame(env: Env, gameId: string): Promise<DmGamePayload | null> {
  const row = await env.DB.prepare(`SELECT g.*, ux.username AS player_x_username, uo.username AS player_o_username
    FROM dm_games g
    JOIN users ux ON ux.id = g.player_x_id
    JOIN users uo ON uo.id = g.player_o_id
    WHERE g.id = ?`).bind(gameId).first<{
      id: string;
      conversation_id: string;
      game_type: 'tictactoe' | 'truth_or_dare';
      grid_size: number;
      target_streak: number;
      player_x_id: string;
      player_x_username: string;
      player_o_id: string;
      player_o_username: string;
      turn_user_id: string;
      status: 'in_progress' | 'won' | 'draw' | 'abandoned';
      winner_id: string | null;
      board_state: string;
      winning_line: string | null;
      score_x?: number;
      score_o?: number;
      created_at: string;
      updated_at: string;
    }>();
  if (!row) return null;
  let boardState: string[] | TruthOrDareGameState = [];
  try {
    boardState = JSON.parse(row.board_state);
  } catch {
    boardState = row.game_type === 'truth_or_dare'
      ? {
          version: 1,
          round: 1,
          asker_id: row.player_x_id,
          target_id: row.player_o_id,
          phase: 'awaiting_choice',
          choice: null,
          prompt: null,
          answer: null,
          dare_status: 'idle',
          dare_started_at: null,
          dare_duration_seconds: 30,
          forfeited: false,
        }
      : Array(row.grid_size * row.grid_size).fill('');
  }
  let winningLine: number[] | null = null;
  try { if (row.winning_line) winningLine = JSON.parse(row.winning_line); } catch {}

  let scoreX = row.score_x ?? 0;
  let scoreO = row.score_o ?? 0;
  if (row.game_type === 'tictactoe' && row.grid_size === 6 && Array.isArray(boardState)) {
    const eval6 = evaluate6x6Board(boardState as string[]);
    scoreX = eval6.scoreX;
    scoreO = eval6.scoreO;
    if ((!winningLine || winningLine.length === 0) && eval6.scoredCellIndices.length > 0) {
      winningLine = eval6.scoredCellIndices;
    }
  }

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    game_type: row.game_type,
    grid_size: (row.grid_size === 6 ? 6 : 3) as 3 | 6,
    target_streak: row.target_streak,
    player_x_id: row.player_x_id,
    player_x_username: row.player_x_username,
    player_o_id: row.player_o_id,
    player_o_username: row.player_o_username,
    turn_user_id: row.turn_user_id,
    status: row.status,
    winner_id: row.winner_id,
    board_state: boardState,
    winning_line: winningLine,
    score_x: scoreX,
    score_o: scoreO,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class ChatRoom {
  private lastReadSaved = new Map<string, number>();
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    if (new URL(request.url).pathname === '/revoke') {
      const { userId } = await request.json<{ userId: string }>();
      for (const socket of this.state.getWebSockets()) {
        const meta = socket.deserializeAttachment() as { userId?: string } | null;
        if (meta?.userId === userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
      }
      return json({ ok: true });
    }
    if (new URL(request.url).pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.json<{ message?: Record<string, unknown> }>().catch((): { message?: Record<string, unknown> } => ({}));
      if (body.message) {
        for (const socket of this.state.getWebSockets()) {
          const attachment = socket.deserializeAttachment() as { userId?: string } | null;
          try {
            socket.send(JSON.stringify({
              type: 'message',
              message: {
                ...body.message,
                mine: Boolean(attachment?.userId && attachment.userId === body.message.sender_id),
              },
            }));
          } catch {}
        }
      }
      return json({ ok: true });
    }
    if (new URL(request.url).pathname === '/call-event' && request.method === 'POST') {
      const body = await request.json<{ message?: Record<string, unknown> }>().catch((): { message?: Record<string, unknown> } => ({}));
      const message = body.message;
      if (!message || message.type !== 'call' || typeof message.id !== 'string') return json({ error: 'Invalid call event.' }, 400);
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as { userId?: string; kind?: string; roomId?: string } | null;
        if (attachment?.kind !== 'dm' || attachment.roomId !== message.conversation_id) continue;
        try { socket.send(JSON.stringify({ type: 'call-event', message: { ...message, mine: message.sender_id === attachment?.userId } })); } catch { /* disconnected socket */ }
      }
      return json({ ok: true });
    }
    if (new URL(request.url).pathname === '/presence') {
      const onlineUserIds = Array.from(new Set(
        this.state.getWebSockets()
          .map((s) => (s.deserializeAttachment() as { userId?: string } | null)?.userId)
          .filter((id): id is string => Boolean(id))
      ));
      return json({ onlineUserIds });
    }
    if (new URL(request.url).pathname === '/clear' && request.method === 'POST') {
      const result = await this.env.DB.prepare('DELETE FROM messages').run();
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(JSON.stringify({ type: 'cleared' })); } catch { /* disconnected socket */ }
      }
      await publishAdminUpdate(this.env, { type: 'chat-count', count: 0 });
      return json({ ok: true, deleted: Number(result.meta.changes ?? 0) });
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    const username = request.headers.get('x-user-handle') ?? '';
    const kind = request.headers.get('x-chat-kind') ?? 'lobby';
    const roomId = request.headers.get('x-chat-id') ?? 'lobby';
    if (!userId) return json({ error: 'Authenticated chat connection required.' }, 401);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId, username, kind, roomId });

    const allSockets = this.state.getWebSockets();
    const onlineUserIds = Array.from(new Set(
      allSockets
        .map((s) => (s.deserializeAttachment() as { userId?: string } | null)?.userId)
        .filter((id): id is string => Boolean(id))
    ));

    let peerOnline = false;
    let peerId = '';
    if (kind === 'dm') {
      const conv = await this.env.DB.prepare('SELECT CASE WHEN pair_low = ? THEN pair_high ELSE pair_low END AS peer_id FROM dm_conversations WHERE id = ?').bind(userId, roomId).first<{ peer_id: string }>();
      peerId = conv?.peer_id ?? '';
      if (peerId === userId) {
        peerOnline = true;
      } else if (peerId && onlineUserIds.includes(peerId)) {
        peerOnline = true;
      } else if (peerId) {
        try {
          const inboxStub = this.env.VOICE_CALL_INBOX.get(this.env.VOICE_CALL_INBOX.idFromName(peerId));
          const res = await inboxStub.fetch('https://call.internal/online');
          if (res.ok) {
            const onlineData = await res.json<{ online?: boolean }>();
            peerOnline = Boolean(onlineData.online);
          }
        } catch {}
      }
    }

    server.send(JSON.stringify({
      type: 'connected',
      peerOnline: kind === 'dm' ? peerOnline : undefined,
      onlineUserIds,
    }));

    for (const socket of allSockets) {
      if (socket === server) continue;
      try {
        socket.send(JSON.stringify({
          type: 'presence',
          joinedUserId: userId,
          peerOnline: true,
          onlineUserIds,
        }));
      } catch {}
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(socket: WebSocket) {
    const meta = socket.deserializeAttachment() as { userId?: string; kind?: string; roomId?: string } | null;
    const closedUserId = meta?.userId;
    const kind = meta?.kind;
    if (!closedUserId) return;

    const remaining = this.state.getWebSockets().filter((s) => s !== socket);
    const onlineUserIds = Array.from(new Set(
      remaining
        .map((s) => (s.deserializeAttachment() as { userId?: string } | null)?.userId)
        .filter((id): id is string => Boolean(id))
    ));

    let peerStillOnline = false;
    if (kind === 'dm') {
      if (onlineUserIds.includes(closedUserId)) {
        peerStillOnline = true;
      } else {
        try {
          const inboxStub = this.env.VOICE_CALL_INBOX.get(this.env.VOICE_CALL_INBOX.idFromName(closedUserId));
          const res = await inboxStub.fetch('https://call.internal/online');
          if (res.ok) {
            const onlineData = await res.json<{ online?: boolean }>();
            peerStillOnline = Boolean(onlineData.online);
          }
        } catch {}
      }
    }

    for (const s of remaining) {
      try {
        s.send(JSON.stringify({
          type: 'presence',
          leftUserId: closedUserId,
          peerOnline: peerStillOnline,
          onlineUserIds,
        }));
      } catch {}
    }
  }

  async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket);
  }

  async webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer) {
    let data: {
      type?: unknown;
      action?: unknown;
      body?: unknown;
      messageId?: unknown;
      replyToMessageId?: unknown;
      gameType?: unknown;
      gridSize?: unknown;
      gameId?: unknown;
      cellIndex?: unknown;
      choice?: unknown;
      prompt?: unknown;
      answer?: unknown;
      signal?: unknown;
      mediaType?: unknown;
      mediaUrl?: unknown;
      mediaDurationSeconds?: unknown;
      fileName?: unknown;
      fileSize?: unknown;
      isForwarded?: unknown;
      pollId?: unknown;
      optionId?: unknown;
      emoji?: unknown;
      isTyping?: unknown;
    } = {};
    try { data = typeof message === 'string' ? JSON.parse(message) as typeof data : {}; } catch { return; }
    const attachment = _socket.deserializeAttachment() as { userId?: string; username?: string; kind?: string; roomId?: string } | null;
    const senderId = attachment?.userId ?? '';
    const username = attachment?.username ?? '';
    if (!senderId || !username) return;
    const kind = attachment?.kind ?? 'lobby'; const roomId = attachment?.roomId ?? 'lobby';
    const action = typeof data.action === 'string' ? data.action : (typeof data.type === 'string' ? data.type : 'send');
    const reportError = (text: string) => { try { _socket.send(JSON.stringify({ type: 'error', message: text })); } catch { /* disconnected socket */ } };

    if (action === 'ping') {
      try { _socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() })); } catch {}
      return;
    }

    if (action === 'typing') {
      const sockets = this.state.getWebSockets();
      if (sockets.length <= 1) return;
      const isTyping = data.isTyping !== false;
      for (const socket of sockets) {
        if (socket === _socket) continue;
        try {
          socket.send(JSON.stringify({
            type: 'typing',
            userId: senderId,
            username,
            isTyping,
          }));
        } catch {}
      }
      return;
    }

    let dmConversation: { pair_low: string; pair_high: string } | null = null;
    if (kind === 'dm') {
      dmConversation = await this.env.DB.prepare('SELECT pair_low, pair_high FROM dm_conversations WHERE id = ? AND (pair_low = ? OR pair_high = ?)').bind(roomId, senderId, senderId).first<{ pair_low: string; pair_high: string }>();
      if (!dmConversation) { try { _socket.close(1008, 'Conversation access ended'); } catch {} return; }
    } else if (kind === 'group' && !await isGroupMember(this.env, roomId, senderId)) {
      try { _socket.close(1008, 'Group access ended'); } catch {} return;
    }

    if (action === 'delete') {
      const messageId = cleanText(data.messageId, 80);
      if (!messageId) { reportError('Message ID is required.'); return; }
      if (kind !== 'dm' && kind !== 'group') { reportError('Cannot delete messages in this room.'); return; }
      const table = kind === 'dm' ? 'dm_messages' : 'group_messages';
      const roomColumn = kind === 'dm' ? 'conversation_id' : 'group_id';
      const current = await this.env.DB.prepare(`SELECT sender_id FROM ${table} WHERE id = ? AND ${roomColumn} = ?`).bind(messageId, roomId).first<{ sender_id: string }>();
      if (!current) { reportError('Message not found.'); return; }
      if (current.sender_id !== senderId) {
        if (kind === 'group') {
          const isAdmin = await isGroupAdmin(this.env, roomId, senderId);
          if (!isAdmin) { reportError('You can only delete your own messages.'); return; }
        } else {
          reportError('You can only delete your own messages.');
          return;
        }
      }
      await this.env.DB.prepare(`UPDATE ${table} SET is_deleted = 1, body = '', media_url = NULL, media_type = NULL, media_duration_seconds = NULL WHERE id = ? AND ${roomColumn} = ?`).bind(messageId, roomId).run();
      let clearedPin = false;
      if (kind === 'dm') {
        const conv = await this.env.DB.prepare('SELECT pinned_message_id FROM dm_conversations WHERE id = ?').bind(roomId).first<{ pinned_message_id?: string | null }>();
        if (conv?.pinned_message_id === messageId) {
          await this.env.DB.prepare('UPDATE dm_conversations SET pinned_message_id = NULL WHERE id = ?').bind(roomId).run();
          clearedPin = true;
        }
      } else if (kind === 'group') {
        const grp = await this.env.DB.prepare('SELECT pinned_message_id FROM groups WHERE id = ?').bind(roomId).first<{ pinned_message_id?: string | null }>();
        if (grp?.pinned_message_id === messageId) {
          await this.env.DB.prepare('UPDATE groups SET pinned_message_id = NULL WHERE id = ?').bind(roomId).run();
          clearedPin = true;
        }
      }
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(JSON.stringify({
            type: 'message-deleted',
            messageId,
          }));
          if (clearedPin) {
            socket.send(JSON.stringify({
              type: 'pin-updated',
              pinned_message_id: null,
            }));
          }
        } catch {}
      }
      return;
    }

    if (action === 'react') {
      const messageId = cleanText(data.messageId, 80);
      const emoji = cleanText(data.emoji, 16);
      if (!messageId || !emoji) { reportError('Message ID and emoji are required.'); return; }
      if (kind !== 'dm' && kind !== 'group') { reportError('Reactions are only available in private and group chats.'); return; }
      await ensureChatRichSchema(this.env.DB);
      const existing = await this.env.DB.prepare('SELECT id FROM chat_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
        .bind(messageId, senderId, emoji).first<{ id: string }>();
      if (existing) {
        await this.env.DB.prepare('DELETE FROM chat_message_reactions WHERE id = ?').bind(existing.id).run();
      } else {
        await this.env.DB.prepare('INSERT INTO chat_message_reactions (id, message_id, chat_kind, chat_id, user_id, emoji) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), messageId, kind, roomId, senderId, emoji).run();
      }
      const reactionsMap = await getReactionsForMessages(this.env.DB, [messageId]);
      const reactions = reactionsMap[messageId] || [];
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as { userId?: string } | null;
        const recipientUserId = attachment?.userId;
        const localizedReactions = reactions.map((r) => ({
          emoji: r.emoji,
          count: r.count,
          users: r.users,
          hasReacted: Boolean(recipientUserId && r.userIds.includes(recipientUserId)),
        }));
        try {
          socket.send(JSON.stringify({
            type: 'message-reactions-updated',
            messageId,
            reactions: localizedReactions,
          }));
        } catch {}
      }
      return;
    }

    if (action === 'read') {
      if (kind === 'dm' || kind === 'group') {
        const lastSaved = this.lastReadSaved.get(senderId) ?? 0;
        const now = Date.now();
        if (now - lastSaved > 3000) {
          this.lastReadSaved.set(senderId, now);
          await this.env.DB.prepare(`INSERT INTO chat_read_states (user_id, chat_kind, chat_id, last_read_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, chat_kind, chat_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`).bind(senderId, kind, roomId).run();
        }
        const readAt = new Date().toISOString();
        for (const socket of this.state.getWebSockets()) {
          const attachment = socket.deserializeAttachment() as { userId?: string } | null;
          if (attachment?.userId === senderId) continue;
          try { socket.send(JSON.stringify({ type: 'read-receipt', userId: senderId, readAt })); } catch {}
        }
      }
      return;
    }

    if (action === 'edit') {
      const messageId = cleanText(data.messageId, 80); const body = cleanText(data.body, 2000);
      if (!messageId || !body) { reportError('Write a message before saving your edit.'); return; }
      if (kind !== 'dm' && kind !== 'group') { reportError('This message cannot be edited.'); return; }
      const table = kind === 'dm' ? 'dm_messages' : 'group_messages'; const roomColumn = kind === 'dm' ? 'conversation_id' : 'group_id';
      const current = await this.env.DB.prepare(`SELECT sender_id, created_at FROM ${table} WHERE id = ? AND ${roomColumn} = ?`).bind(messageId, roomId).first<{ sender_id: string; created_at: string }>();
      if (!current || current.sender_id !== senderId) { reportError('You can only edit your own messages.'); return; }
      const createdMs = Date.parse(current.created_at.replace(' ', 'T') + (current.created_at.includes('Z') ? '' : 'Z'));
      if (!Number.isFinite(createdMs) || Date.now() - createdMs > 15 * 60_000) { reportError('Messages can only be edited for 15 minutes after sending.'); return; }
      await this.env.DB.prepare(`UPDATE ${table} SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND ${roomColumn} = ? AND sender_id = ?`).bind(body, messageId, roomId, senderId).run();
      const updated = await this.env.DB.prepare(`SELECT body, edited_at FROM ${table} WHERE id = ?`).bind(messageId).first<{ body: string; edited_at: string }>();
      if (!updated) return;
      for (const socket of this.state.getWebSockets()) { try { socket.send(JSON.stringify({ type: 'message-updated', message: { id: messageId, body: updated.body, edited_at: updated.edited_at } })); } catch { /* disconnected socket */ } }
      return;
    }

    if (action === 'game-start') {
      if (kind !== 'dm') { reportError('Games are currently available in 1-on-1 private chats.'); return; }
      const gameType = data.gameType === 'truth_or_dare' ? 'truth_or_dare' : 'tictactoe';
      const conversation = await this.env.DB.prepare('SELECT CASE WHEN pair_low = ? THEN pair_high ELSE pair_low END AS peer_id FROM dm_conversations WHERE id = ?').bind(senderId, roomId).first<{ peer_id: string }>();
      if (!conversation?.peer_id) { reportError('Could not find chat partner.'); return; }
      const peerId = conversation.peer_id;
      const newGameId = crypto.randomUUID();

      if (gameType === 'truth_or_dare') {
        const initialTodState: TruthOrDareGameState = {
          version: 1,
          round: 1,
          asker_id: senderId,
          target_id: peerId,
          phase: 'awaiting_choice',
          choice: null,
          prompt: null,
          answer: null,
          dare_status: 'idle',
          dare_started_at: null,
          dare_duration_seconds: 30,
          forfeited: false,
        };
        await this.env.DB.batch([
          this.env.DB.prepare("UPDATE dm_games SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND status = 'in_progress'").bind(roomId),
          this.env.DB.prepare(`INSERT INTO dm_games (id, conversation_id, game_type, grid_size, target_streak, player_x_id, player_o_id, turn_user_id, status, board_state, score_x, score_o)
            VALUES (?, ?, 'truth_or_dare', 3, 3, ?, ?, ?, 'in_progress', ?, 0, 0)`).bind(newGameId, roomId, senderId, peerId, peerId, JSON.stringify(initialTodState)),
        ]);
      } else {
        const gridSize = data.gridSize === 6 ? 6 : 3;
        const targetStreak = 3; // 3 in a row for both 3x3 and 6x6 Points Battle
        const emptyBoard = JSON.stringify(Array(gridSize * gridSize).fill(''));
        await this.env.DB.batch([
          this.env.DB.prepare("UPDATE dm_games SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND status = 'in_progress'").bind(roomId),
          this.env.DB.prepare(`INSERT INTO dm_games (id, conversation_id, game_type, grid_size, target_streak, player_x_id, player_o_id, turn_user_id, status, board_state, score_x, score_o)
            VALUES (?, ?, 'tictactoe', ?, ?, ?, ?, ?, 'in_progress', ?, 0, 0)`).bind(newGameId, roomId, gridSize, targetStreak, senderId, peerId, senderId, emptyBoard),
        ]);
      }

      const formattedGame = await formatDmGame(this.env, newGameId);
      if (formattedGame) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-started', game: formattedGame })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-choice') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      const choice = data.choice === 'dare' ? 'dare' : data.choice === 'truth' ? 'truth' : null;
      if (!gameId || !choice) return;
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        game_type: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game || game.game_type !== 'truth_or_dare') { reportError('Game not found.'); return; }
      let state: TruthOrDareGameState;
      try { state = JSON.parse(game.board_state); } catch { reportError('Corrupted game state.'); return; }
      if (state.phase !== 'awaiting_choice' || senderId !== state.target_id) {
        reportError('It is not your turn to choose.'); return;
      }
      state.choice = choice;
      state.phase = 'awaiting_prompt';
      state.forfeited = false;
      const nextTurnUserId = state.asker_id;

      await this.env.DB.prepare("UPDATE dm_games SET board_state = ?, turn_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(JSON.stringify(state), nextTurnUserId, gameId).run();

      const updated = await formatDmGame(this.env, gameId);
      if (updated) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updated })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-prompt') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      const prompt = cleanText(data.prompt, 400);
      if (!gameId || !prompt) { reportError('Please enter a question or dare.'); return; }
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        game_type: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game || game.game_type !== 'truth_or_dare') return;
      let state: TruthOrDareGameState;
      try { state = JSON.parse(game.board_state); } catch { return; }
      if (state.phase !== 'awaiting_prompt' || senderId !== state.asker_id) {
        reportError('It is not your turn to ask.'); return;
      }
      state.prompt = prompt;
      if (state.choice === 'truth') {
        state.phase = 'awaiting_answer';
      } else {
        state.phase = 'performing_dare';
        state.dare_status = 'running';
        state.dare_started_at = Date.now();
      }
      const nextTurnUserId = state.target_id;

      await this.env.DB.prepare("UPDATE dm_games SET board_state = ?, turn_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(JSON.stringify(state), nextTurnUserId, gameId).run();

      const updated = await formatDmGame(this.env, gameId);
      if (updated) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updated })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-answer') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      const answer = cleanText(data.answer, 800);
      if (!gameId || !answer) { reportError('Please type your answer.'); return; }
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        game_type: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game || game.game_type !== 'truth_or_dare') return;
      let state: TruthOrDareGameState;
      try { state = JSON.parse(game.board_state); } catch { return; }
      if (state.phase !== 'awaiting_answer' || senderId !== state.target_id) {
        reportError('It is not your turn to answer.'); return;
      }
      state.answer = answer;
      state.phase = 'round_completed';

      await this.env.DB.prepare("UPDATE dm_games SET board_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(JSON.stringify(state), gameId).run();

      const updated = await formatDmGame(this.env, gameId);
      if (updated) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updated })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-dare-complete') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      if (!gameId) return;
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        game_type: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game || game.game_type !== 'truth_or_dare') return;
      let state: TruthOrDareGameState;
      try { state = JSON.parse(game.board_state); } catch { return; }
      if (state.phase !== 'performing_dare') return;
      state.phase = 'round_completed';
      state.dare_status = 'completed';

      await this.env.DB.prepare("UPDATE dm_games SET board_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(JSON.stringify(state), gameId).run();

      const updated = await formatDmGame(this.env, gameId);
      if (updated) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updated })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-forfeit') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      if (!gameId) return;
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        game_type: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game || game.game_type !== 'truth_or_dare') return;
      let state: TruthOrDareGameState;
      try { state = JSON.parse(game.board_state); } catch { return; }
      if (senderId !== state.target_id) return;
      state.phase = 'round_completed';
      state.forfeited = true;
      if (state.choice === 'dare') state.dare_status = 'forfeited';

      await this.env.DB.prepare("UPDATE dm_games SET board_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(JSON.stringify(state), gameId).run();

      const updated = await formatDmGame(this.env, gameId);
      if (updated) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updated })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-next-round') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      if (!gameId) return;
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        game_type: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game || game.game_type !== 'truth_or_dare') return;
      let state: TruthOrDareGameState;
      try { state = JSON.parse(game.board_state); } catch { return; }
      if (state.phase !== 'round_completed') return;

      const newAskerId = state.target_id;
      const newTargetId = state.asker_id;
      const nextRoundState: TruthOrDareGameState = {
        version: 1,
        round: state.round + 1,
        asker_id: newAskerId,
        target_id: newTargetId,
        phase: 'awaiting_choice',
        choice: null,
        prompt: null,
        answer: null,
        dare_status: 'idle',
        dare_started_at: null,
        dare_duration_seconds: 30,
        forfeited: false,
      };

      const res = await this.env.DB.prepare("UPDATE dm_games SET board_state = ?, turn_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND board_state LIKE '%\"phase\":\"round_completed\"%'")
        .bind(JSON.stringify(nextRoundState), newTargetId, gameId).run();
      if (!res.meta?.changes) return;

      const updated = await formatDmGame(this.env, gameId);
      if (updated) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updated })); } catch {}
        }
      }
      return;
    }

    if (action === 'tod-signal') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      const signal = data.signal;
      if (!gameId || !signal) return;
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as { userId?: string } | null;
        if (attachment?.userId && attachment.userId !== senderId) {
          try {
            socket.send(JSON.stringify({
              type: 'tod-signal',
              gameId,
              signal,
              senderId,
            }));
          } catch {}
        }
      }
      return;
    }

    if (action === 'game-move') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      const cellIndex = Number(data.cellIndex);
      if (!gameId || !Number.isInteger(cellIndex) || cellIndex < 0) return;
      const game = await this.env.DB.prepare("SELECT * FROM dm_games WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).first<{
        id: string;
        grid_size: number;
        target_streak: number;
        player_x_id: string;
        player_o_id: string;
        turn_user_id: string;
        board_state: string;
      }>();
      if (!game) { reportError('Game session ended or not found.'); return; }
      if (game.turn_user_id !== senderId) { reportError('It is not your turn yet.'); return; }
      const totalCells = game.grid_size * game.grid_size;
      if (cellIndex >= totalCells) { reportError('Invalid cell selection.'); return; }
      let board: string[] = [];
      try { board = JSON.parse(game.board_state); } catch { board = Array(totalCells).fill(''); }
      if (board[cellIndex]) { reportError('That square is already taken.'); return; }

      const symbol = senderId === game.player_x_id ? 'X' : 'O';
      board[cellIndex] = symbol;

      let status = 'in_progress';
      let winnerId: string | null = null;
      let nextTurnUserId = senderId === game.player_x_id ? game.player_o_id : game.player_x_id;
      let winningLine: number[] | null = null;
      let scoreX = 0;
      let scoreO = 0;

      if (game.grid_size === 6) {
        // 6x6 Points Battle Mode
        const eval6 = evaluate6x6Board(board);
        scoreX = eval6.scoreX;
        scoreO = eval6.scoreO;
        winningLine = eval6.scoredCellIndices.length > 0 ? eval6.scoredCellIndices : null;

        const isBoardFull = board.every((c) => c !== '');
        const isGameFinished = isBoardFull || !eval6.canAnyPlayerStillScore;

        if (isGameFinished) {
          if (scoreX > scoreO) {
            status = 'won';
            winnerId = game.player_x_id;
          } else if (scoreO > scoreX) {
            status = 'won';
            winnerId = game.player_o_id;
          } else {
            status = 'draw';
            winnerId = null;
          }
        }
      } else {
        // 3x3 Classic Sudden-Death Mode
        winningLine = checkTicTacToeWin(board, 3, 3);
        if (winningLine) {
          status = 'won';
          winnerId = senderId;
          scoreX = senderId === game.player_x_id ? 1 : 0;
          scoreO = senderId === game.player_o_id ? 1 : 0;
        } else if (board.every((c) => c !== '')) {
          status = 'draw';
        }
      }

      const res = await this.env.DB.prepare(`UPDATE dm_games SET board_state = ?, turn_user_id = ?, status = ?, winner_id = ?, winning_line = ?, score_x = ?, score_o = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND turn_user_id = ?`)
        .bind(JSON.stringify(board), nextTurnUserId, status, winnerId, winningLine ? JSON.stringify(winningLine) : null, scoreX, scoreO, gameId, senderId).run();
      if (!res.meta?.changes) {
        reportError('Concurrent move detected or turn already changed.');
        return;
      }

      const updatedGame = await formatDmGame(this.env, gameId);
      if (updatedGame) {
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(JSON.stringify({ type: 'game-updated', game: updatedGame })); } catch {}
        }
      }
      return;
    }

    if (action === 'game-abandon') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      if (!gameId) return;
      await this.env.DB.prepare("UPDATE dm_games SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND conversation_id = ? AND status = 'in_progress'").bind(gameId, roomId).run();
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(JSON.stringify({ type: 'game-abandoned', gameId, abandonedBy: senderId, username })); } catch {}
      }
      return;
    }

    if (action === 'game-close') {
      if (kind !== 'dm') return;
      const gameId = cleanText(data.gameId, 80);
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(JSON.stringify({ type: 'game-closed', gameId, closedBy: senderId })); } catch {}
      }
      return;
    }

    if (action === 'pin-message') {
      const messageId = cleanText(data.messageId, 80) || null;
      if (kind === 'dm') {
        await this.env.DB.prepare('UPDATE dm_conversations SET pinned_message_id = ? WHERE id = ?').bind(messageId, roomId).run();
      } else if (kind === 'group') {
        const mem = await this.env.DB.prepare('SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?').bind(roomId, senderId).first<{ role: string }>();
        if (!mem || mem.role !== 'admin') {
          reportError('Only group admins can pin messages.');
          return;
        }
        await this.env.DB.prepare('UPDATE groups SET pinned_message_id = ? WHERE id = ?').bind(messageId, roomId).run();
      }
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(JSON.stringify({ type: 'pin-updated', pinned_message_id: messageId }));
        } catch {}
      }
      return;
    }

    if (action === 'poll-vote') {
      const pollId = cleanText(data.pollId, 80);
      const optionId = cleanText(data.optionId, 80);
      if (!pollId || !optionId) return;
      await this.env.DB.prepare("INSERT INTO poll_votes (poll_id, user_id, option_id) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ?)").bind(pollId, senderId, optionId, pollId, senderId).run();
      const opts = await this.env.DB.prepare(`SELECT o.id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = o.poll_id AND v.option_id = o.id) AS votes FROM poll_options o WHERE o.poll_id = ? ORDER BY o.position`).bind(pollId).all<{ id: string; label: string; votes: number }>();
      const totalVotes = opts.results.reduce((acc, curr) => acc + (Number(curr.votes) || 0), 0);
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(JSON.stringify({ type: 'poll-updated', pollId, totalVotes, options: opts.results }));
        } catch {}
      }
      return;
    }

    if (action !== 'send' && action !== 'message') return;

    // Check announcement-only groups restriction
    if (kind === 'group') {
      const grp = await this.env.DB.prepare('SELECT announcement_only FROM groups WHERE id = ?').bind(roomId).first<{ announcement_only: number }>();
      if (grp && grp.announcement_only === 1) {
        const mem = await this.env.DB.prepare('SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?').bind(roomId, senderId).first<{ role: string }>();
        if (!mem || mem.role !== 'admin') {
          reportError('Only group admins can post in announcement mode.');
          return;
        }
      }
    }

    const body = cleanText(data.body, 2000);
    const rawMediaType = cleanText(data.mediaType, 40) || null;
    const mediaUrl = cleanText(data.mediaUrl, 500) || null;
    const mediaDurationSeconds = typeof data.mediaDurationSeconds === 'number' && Number.isFinite(data.mediaDurationSeconds) ? Math.round(data.mediaDurationSeconds * 10) / 10 : null;
    const fileName = cleanText(data.fileName, 255) || null;
    const fileSize = typeof data.fileSize === 'number' && Number.isFinite(data.fileSize) ? Math.round(data.fileSize) : null;
    const isForwarded = Boolean(data.isForwarded) ? 1 : 0;
    const pollId = cleanText(data.pollId, 80) || null;
    const mediaType = mediaUrl ? (normalizeChatMediaType(rawMediaType, fileName) || 'image') : null;

    if (!body && !mediaUrl && !pollId) return;

    // STRICT USER REQUIREMENT: NO VIDEOS
    if (rawMediaType && (rawMediaType.startsWith('video/') || rawMediaType.includes('video'))) {
      reportError('Video files are not permitted.');
      return;
    }

    // Calculate disappearing messages expiry
    let expiresAt: string | null = null;
    if (kind === 'dm') {
      const conv = await this.env.DB.prepare('SELECT disappearing_duration_seconds FROM dm_conversations WHERE id = ?').bind(roomId).first<{ disappearing_duration_seconds: number }>();
      if (conv && conv.disappearing_duration_seconds > 0) {
        expiresAt = new Date(Date.now() + conv.disappearing_duration_seconds * 1000).toISOString();
      }
    } else if (kind === 'group') {
      const grp = await this.env.DB.prepare('SELECT disappearing_duration_seconds FROM groups WHERE id = ?').bind(roomId).first<{ disappearing_duration_seconds: number }>();
      if (grp && grp.disappearing_duration_seconds > 0) {
        expiresAt = new Date(Date.now() + grp.disappearing_duration_seconds * 1000).toISOString();
      }
    }

    const id = crypto.randomUUID(); const replyToMessageId = cleanText(data.replyToMessageId, 80) || null;
    let reply: { id: string; body: string; username: string; sender_id: string } | null = null;
    if (replyToMessageId) {
      if (kind === 'dm') reply = await this.env.DB.prepare("SELECT m.id, CASE WHEN m.is_deleted = 1 THEN '🚫 This message was deleted' ELSE m.body END AS body, u.username, m.sender_id FROM dm_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? AND m.conversation_id = ?").bind(replyToMessageId, roomId).first<{ id: string; body: string; username: string; sender_id: string }>() ?? null;
      else if (kind === 'group') reply = await this.env.DB.prepare("SELECT m.id, CASE WHEN m.is_deleted = 1 THEN '🚫 This message was deleted' ELSE m.body END AS body, u.username, m.sender_id FROM group_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? AND m.group_id = ?").bind(replyToMessageId, roomId).first<{ id: string; body: string; username: string; sender_id: string }>() ?? null;
      if (!reply) { reportError('That message is no longer available to reply to.'); return; }
    }
    const now = new Date();
    const createdAt = now.toISOString();
    const createdAtDb = normalizeDbTimestamp(createdAt);
    if (kind === 'dm') await this.env.DB.prepare('INSERT INTO dm_messages (id, conversation_id, sender_id, body, reply_to_message_id, media_type, media_url, media_duration_seconds, file_name, file_size, is_forwarded, expires_at, poll_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, roomId, senderId, body, replyToMessageId, mediaType, mediaUrl, mediaDurationSeconds, fileName, fileSize, isForwarded, expiresAt, pollId, createdAtDb).run();
    else if (kind === 'group') await this.env.DB.prepare('INSERT INTO group_messages (id, group_id, sender_id, body, reply_to_message_id, media_type, media_url, media_duration_seconds, file_name, file_size, is_forwarded, expires_at, poll_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, roomId, senderId, body, replyToMessageId, mediaType, mediaUrl, mediaDurationSeconds, fileName, fileSize, isForwarded, expiresAt, pollId, createdAtDb).run();
    else await this.env.DB.prepare('INSERT INTO messages (id, user_id, body, created_at) VALUES (?, ?, ?, ?)').bind(id, senderId, body, createdAtDb).run();
    const online = new Set(this.state.getWebSockets().map((socket) => (socket.deserializeAttachment() as { userId?: string } | null)?.userId ?? ''));
    let peerOnline = false;
    const dmPeerId = dmConversation ? (dmConversation.pair_low === senderId ? dmConversation.pair_high : dmConversation.pair_low) : '';
    if (kind === 'dm' && dmPeerId) {
      if (online.has(dmPeerId)) {
        peerOnline = true;
      } else {
        try {
          const inboxDO = this.env.VOICE_CALL_INBOX.get(this.env.VOICE_CALL_INBOX.idFromName(dmPeerId));
          const inboxRes = await inboxDO.fetch(new Request('https://inbox.internal/online'));
          if (inboxRes.ok) {
            const inboxData = await inboxRes.json<{ online?: boolean }>().catch(() => null);
            if (inboxData?.online) peerOnline = true;
          }
        } catch {}
      }
    }
    for (const socket of this.state.getWebSockets()) {
      const recipient = socket.deserializeAttachment() as { userId?: string } | null;
      const isMine = Boolean(recipient?.userId === senderId);
      const chatMessage = {
        id,
        username,
        mine: isMine,
        body,
        created_at: createdAt,
        edited_at: null,
        reply_to_message_id: reply?.id ?? null,
        reply_to_body: reply?.body ?? null,
        reply_to_username: reply?.username ?? null,
        reply_to_mine: reply?.sender_id === recipient?.userId,
        seen: false,
        delivered: isMine ? (kind === 'dm' ? peerOnline : true) : true,
        media_type: mediaType,
        media_url: mediaUrl,
        media_duration_seconds: mediaDurationSeconds,
        file_name: fileName,
        file_size: fileSize,
        is_forwarded: Boolean(isForwarded),
        expires_at: expiresAt,
        poll_id: pollId,
        is_deleted: false,
        reactions: [],
      };
      try { socket.send(JSON.stringify({ type: 'message', message: chatMessage })); } catch { /* disconnected socket */ }
    }
    if (kind === 'lobby') this.state.waitUntil(publishAdminUpdate(this.env, { type: 'chat-count', delta: 1 }));
    else this.state.waitUntil((async () => {
      let recipients: string[] = [];
      if (kind === 'dm') {
        recipients = dmPeerId ? [dmPeerId] : [];
      } else {
        const rows = await this.env.DB.prepare('SELECT user_id FROM group_memberships WHERE group_id = ? AND user_id <> ?').bind(roomId, senderId).all<{ user_id: string }>();
        recipients = rows.results.map((row) => row.user_id);
      }
      const online = new Set(this.state.getWebSockets().map((socket) => (socket.deserializeAttachment() as { userId?: string } | null)?.userId ?? ''));
      const pushTitle = kind === 'dm' ? `${username}` : `${username} in group`;
      const pushSnippet = body ? (body.length > 80 ? body.slice(0, 77) + '...' : body) : (mediaType ? `[${mediaType}]` : 'Sent a message');
      const clickUrl = `/#chat=${kind}:${roomId}`;
      await queueChatPush(this.env, recipients.filter((recipient) => !online.has(recipient)), pushTitle, pushSnippet, clickUrl);
    })());
  }
}

export class AdminLiveFeed {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === '/publish' && request.method === 'POST') {
      const payload = await request.json<Record<string, unknown>>().catch(() => null);
      if (!payload || (payload.type !== 'campaign' && payload.type !== 'chat-count')) return json({ error: 'Invalid live update.' }, 400);
      if (!this.state.getWebSockets().length) return json({ ok: true });
      if (payload.type === 'chat-count' && typeof payload.delta === 'number') {
        await this.state.blockConcurrencyWhile(async () => {
          const current = await this.env.DB.prepare('SELECT COUNT(*) AS count FROM messages').first<{ count: number }>();
          const snapshot = JSON.stringify({ type: 'chat-count', count: Number(current?.count ?? 0) });
          for (const socket of this.state.getWebSockets()) { try { socket.send(snapshot); } catch { /* disconnected socket */ } }
        });
        return json({ ok: true });
      }
      const serialized = JSON.stringify(payload);
      for (const socket of this.state.getWebSockets()) { try { socket.send(serialized); } catch { /* disconnected socket */ } }
      return json({ ok: true });
    }
    if ((path !== '/connect' && path !== '/api/ws/admin-live') || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const adminId = request.headers.get('x-admin-id') ?? '';
    if (!adminId) return json({ error: 'Administrator access required.' }, 403);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    await this.state.blockConcurrencyWhile(async () => {
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ adminId });
      const result = await this.env.DB.prepare('SELECT COUNT(*) AS count FROM messages').first<{ count: number }>();
      server.send(JSON.stringify({ type: 'chat-count', count: Number(result?.count ?? 0) }));
      server.send(JSON.stringify({ type: 'connected' }));
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket) {
    try { socket.close(1008, 'Admin live feed is read-only.'); } catch { /* already closed */ }
  }
}

type RandomParticipant = { userId: string; connectionId: string | null; connected: boolean };
type RandomChatMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  replyToMessageId: string | null;
  replyToBody: string | null;
  replyToSenderId: string | null;
  kind?: 'message' | 'call';
  callStatus?: string | null;
  callDurationSeconds?: number;
};
type RandomMatch = {
  id: string;
  participants: [RandomParticipant, RandomParticipant];
  status: 'active' | 'recovering';
  recoveryDeadline: number | null;
  createdAt: number;
  messages?: RandomChatMessage[];
};
type RandomAttachment = {
  kind?: 'initializing' | 'waiting' | 'matched' | 'rejected' | 'ended';
  userId?: string;
  connectionId?: string;
  matchId?: string;
  room?: string;
  waiting?: boolean;
};

const RANDOM_MATCH_PREFIX = 'random-match:';
const RANDOM_USER_PREFIX = 'random-user:';
const RANDOM_RECOVERY_PREFIX = 'random-recovery:';
const RANDOM_RECOVERY_MS = 2 * 60 * 60_000;
const RANDOM_EDIT_WINDOW_MS = 15 * 60_000;

export class RandomPool {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/call-participant' && request.method === 'POST') {
      const userId = request.headers.get('x-user-id') ?? '';
      const body = await request.json<{ matchId?: string }>().catch((): { matchId?: string } => ({}));
      const matchId = cleanText(body.matchId, 80);
      const match = matchId ? await this.state.storage.get<RandomMatch>('random-match:' + matchId) : null;
      const participant = match?.participants.find((item) => item.userId === userId);
      const peer = match?.participants.find((item) => item.userId !== userId);
      if (!userId || !match || match.status !== 'active' || !participant?.connected || !peer?.connected) return json({ error: 'Random Chat match is not active.' }, 409);
      return json({ peerId: peer.userId });
    }
    if (url.pathname === '/call-event' && request.method === 'POST') {
      const body = await request.json<{ matchId?: string; callId?: string; callerId?: string; status?: string; createdAt?: string; durationSeconds?: number }>().catch((): { matchId?: string; callId?: string; callerId?: string; status?: string; createdAt?: string; durationSeconds?: number } => ({}));
      const matchId = cleanText(body.matchId, 80); const callId = cleanText(body.callId, 80); const callerId = cleanText(body.callerId, 80);
      if (!matchId || !callId || !callerId) return json({ error: 'Invalid Random Chat call event.' }, 400);
      return this.state.blockConcurrencyWhile(async () => {
        const match = await this.state.storage.get<RandomMatch>('random-match:' + matchId);
        if (!match || !match.participants.some((item) => item.userId === callerId)) {
          await this.env.VOICE_CALL_SESSIONS.get(this.env.VOICE_CALL_SESSIONS.idFromName(callId)).fetch(new Request('https://voice-session.internal/match-ended', { method: 'POST' }));
          return json({ ok: true, skipped: true });
        }
        match.messages ??= [];
        let event = match.messages.find((item) => item.id === callId);
        if (!event) {
          event = {
            id: callId,
            senderId: callerId,
            body: 'Voice call',
            createdAt: body.createdAt || new Date().toISOString(),
            editedAt: null,
            replyToMessageId: null,
            replyToBody: null,
            replyToSenderId: null,
            kind: 'call',
            callStatus: cleanText(body.status, 20),
            callDurationSeconds: Math.max(0, Number(body.durationSeconds ?? 0)),
          };
          match.messages.push(event);
        } else {
          event.callStatus = cleanText(body.status, 20);
          event.callDurationSeconds = Math.max(0, Number(body.durationSeconds ?? 0));
        }
        await this.state.storage.put('random-match:' + match.id, match);
        for (const participant of match.participants) {
          if (!participant.connected) continue;
          const socket = this.socketFor(match.id, participant);
          if (socket?.readyState === WebSocket.OPEN) {
            try { socket.send(JSON.stringify({ type: 'call-event', message: this.randomMessageFor(event, participant.userId) })); } catch { /* match recovery handles a disconnect */ }
          }
        }
        return json({ ok: true });
      });
    }
    if (url.pathname === '/revoke') {
      const { userId } = await request.json<{ userId: string }>();
      if (!userId) return json({ error: 'User ID is required.' }, 400);
      await this.state.blockConcurrencyWhile(async () => {
        const matchId = await this.state.storage.get<string>(`${RANDOM_USER_PREFIX}${userId}`);
        if (matchId) {
          const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${matchId}`);
          if (match) await this.endMatch(match, 'suspended', userId);
        }
        for (const socket of this.state.getWebSockets()) {
          const meta = socket.deserializeAttachment() as RandomAttachment | null;
          if (meta?.userId !== userId) continue;
          if (meta.room && !meta.kind) this.notifyLegacyPeer(meta.room, socket);
          try {
            if (meta.kind && meta.kind !== 'ended') socket.serializeAttachment({ ...meta, kind: 'ended' });
            socket.close(4001, 'Account suspended');
          } catch { /* already closed */ }
        }
      });
      return json({ ok: true });
    }

    if (url.pathname === '/leave' && request.method === 'POST') {
      const userId = request.headers.get('x-user-id') ?? '';
      const body = await request.json<{ matchId?: string }>().catch((): { matchId?: string } => ({}));
      const matchId = cleanText(body.matchId, 80);
      if (!userId) return json({ error: 'Authenticated random chat required.' }, 401);
      await this.state.blockConcurrencyWhile(async () => {
        if (matchId) {
          const activeMatchId = await this.state.storage.get<string>(`${RANDOM_USER_PREFIX}${userId}`);
          if (activeMatchId !== matchId) return;
          const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${matchId}`);
          if (match) await this.endMatch(match, 'left', userId);
          return;
        }
        for (const socket of this.state.getWebSockets()) {
          const meta = socket.deserializeAttachment() as RandomAttachment | null;
          if (meta?.userId === userId && (meta.kind === 'waiting' || meta.waiting === true)) {
            try { socket.serializeAttachment({ ...meta, kind: 'ended' }); socket.close(1000, 'Search cancelled'); } catch { /* already closed */ }
          }
        }
      });
      return json({ ok: true });
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    if (!userId) return json({ error: 'Authenticated random chat required.' }, 401);
    const action = url.searchParams.get('action') ?? 'search';
    const matchId = cleanText(url.searchParams.get('matchId'), 80);
    if (!['search', 'resume', 'next'].includes(action)) return json({ error: 'Invalid random chat action.' }, 400);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connectionId = crypto.randomUUID();
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ kind: 'initializing', userId, connectionId } satisfies RandomAttachment);
    try {
      await this.state.blockConcurrencyWhile(async () => {
        if (action === 'resume') await this.resumeMatch(server, userId, connectionId, matchId);
        else if (action === 'next') {
          const activeMatchId = await this.state.storage.get<string>(`${RANDOM_USER_PREFIX}${userId}`);
          if (!matchId || activeMatchId !== matchId) { this.reject(server, userId, connectionId, 'session-expired'); return; }
          const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${matchId}`);
          if (!match) { this.reject(server, userId, connectionId, 'session-expired'); return; }
          await this.endMatch(match, 'next', userId);
          await this.joinSearch(server, userId, connectionId);
        } else {
          const activeMatchId = await this.state.storage.get<string>(`${RANDOM_USER_PREFIX}${userId}`);
          if (activeMatchId) {
            const activeMatch = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${activeMatchId}`);
            if (!activeMatch) {
              await this.state.storage.delete(`${RANDOM_USER_PREFIX}${userId}`);
            } else {
              this.reject(server, userId, connectionId, 'already-active');
              return;
            }
          }
          await this.joinSearch(server, userId, connectionId);
        }
      });
    } catch (error) {
      console.error('Random chat session setup failed', { action, error });
      this.reject(server, userId, connectionId, 'connection-error');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    let rawJson: { type?: unknown; body?: unknown; messageId?: unknown; replyToMessageId?: unknown } | null = null;
    try { rawJson = JSON.parse(typeof message === 'string' ? message : ''); } catch {}
    if (rawJson?.type === 'ping') {
      try { socket.send(JSON.stringify({ type: 'pong' })); } catch {}
      return;
    }

    const attachment = socket.deserializeAttachment() as RandomAttachment | null;
    if (!attachment) return;
    if (!attachment.kind && attachment.room) { await this.forwardLegacyMessage(socket, message, attachment.room); return; }
    if (attachment.kind !== 'matched' || !attachment.matchId || !attachment.userId || !attachment.connectionId) return;
    const senderId = attachment.userId;

    await this.state.blockConcurrencyWhile(async () => {
      const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${attachment.matchId}`);
      const participant = match?.participants.find((item) => item.userId === attachment.userId);
      if (!match || match.status !== 'active' || !participant?.connected || participant.connectionId !== attachment.connectionId) return;
      const peerParticipant = match.participants.find((item) => item.userId !== attachment.userId);
      if (!peerParticipant || !peerParticipant.connected || !peerParticipant.connectionId) {
        try { socket.send(JSON.stringify({ type: 'paused' })); } catch { /* sender disconnected */ }
        return;
      }
      const peer = this.socketFor(match.id, peerParticipant);
      if (!peer || peer.readyState !== WebSocket.OPEN) {
        await this.markDisconnected(match, peerParticipant.userId, 1006);
        try { socket.send(JSON.stringify({ type: 'paused' })); } catch { /* sender disconnected */ }
        return;
      }
      let data: { type?: unknown; body?: unknown; messageId?: unknown; replyToMessageId?: unknown };
      try { data = JSON.parse(typeof message === 'string' ? message : '') as typeof data; } catch { return; }
      match.messages ??= [];
      if (data.type === 'edit') {
        const messageId = cleanText(data.messageId, 80);
        const body = cleanText(data.body, 1000);
        const target = match.messages.find((item) => item.id === messageId);
        if (!body || !target || target.senderId !== senderId || Date.now() - Date.parse(target.createdAt) > RANDOM_EDIT_WINDOW_MS) {
          try { socket.send(JSON.stringify({ type: 'error', message: 'You can edit your own messages for 15 minutes after sending.' })); } catch { /* sender disconnected */ }
          return;
        }
        target.body = body;
        target.editedAt = new Date().toISOString();
        await this.state.storage.put(`${RANDOM_MATCH_PREFIX}${match.id}`, match);
        const update = { type: 'message-updated', message: this.randomMessageFor(target, senderId) };
        try { socket.send(JSON.stringify(update)); } catch { await this.markDisconnected(match, senderId, 1006); }
        try { peer.send(JSON.stringify({ ...update, message: this.randomMessageFor(target, peerParticipant.userId) })); }
        catch { await this.markDisconnected(match, peerParticipant.userId, 1006); }
        return;
      }

      const body = cleanText(data.body, 1000);
      if (!body) return;
      const replyToMessageId = typeof data.replyToMessageId === 'string' ? cleanText(data.replyToMessageId, 80) : '';
      const replyTarget = replyToMessageId ? match.messages.find((item) => item.id === replyToMessageId) : null;
      if (replyToMessageId && !replyTarget) {
        try { socket.send(JSON.stringify({ type: 'error', message: 'That message is no longer available to reply to.' })); } catch { /* sender disconnected */ }
        return;
      }
      const chatMessage: RandomChatMessage = {
        id: crypto.randomUUID(), senderId, body, createdAt: new Date().toISOString(), editedAt: null,
        replyToMessageId: replyTarget?.id ?? null, replyToBody: replyTarget?.body ?? null, replyToSenderId: replyTarget?.senderId ?? null,
      };
      match.messages.push(chatMessage);
      await this.state.storage.put(`${RANDOM_MATCH_PREFIX}${match.id}`, match);
      const event = (recipientId: string) => JSON.stringify({
        type: 'message', body, created_at: chatMessage.createdAt,
        message: this.randomMessageFor(chatMessage, recipientId),
      });
      try { socket.send(event(senderId)); } catch { await this.markDisconnected(match, senderId, 1006); }
      try { peer.send(event(peerParticipant.userId)); } catch { await this.markDisconnected(match, peerParticipant.userId, 1006); }
    });
  }

  async webSocketClose(socket: WebSocket, code: number, _reason: string) {
    const attachment = socket.deserializeAttachment() as RandomAttachment | null;
    if (!attachment || attachment.kind === 'ended' || attachment.kind === 'rejected') return;
    if (!attachment.kind && attachment.room) { this.notifyLegacyPeer(attachment.room, socket); return; }
    if (attachment.kind !== 'matched' || !attachment.matchId || !attachment.userId || !attachment.connectionId) return;

    await this.state.blockConcurrencyWhile(async () => {
      const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${attachment.matchId}`);
      const participant = match?.participants.find((item) => item.userId === attachment.userId);
      if (!match || !participant?.connected || participant.connectionId !== attachment.connectionId) return;
      await this.markDisconnected(match, attachment.userId!, code);
    });
  }

  async alarm() {
    await this.state.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const recoveries = await this.state.storage.list<boolean>({ prefix: RANDOM_RECOVERY_PREFIX });
      for (const key of recoveries.keys()) {
        const remainder = key.slice(RANDOM_RECOVERY_PREFIX.length);
        const separator = remainder.indexOf(':');
        const deadline = Number(remainder.slice(0, separator));
        if (!Number.isFinite(deadline) || deadline > now) continue;
        const matchId = remainder.slice(separator + 1);
        const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${matchId}`);
        if (match?.status === 'recovering' && match.recoveryDeadline === deadline) await this.endMatch(match, 'expired');
        else await this.state.storage.delete(key);
      }
      await this.scheduleRecoveryAlarm();
    });
  }

  private async joinSearch(socket: WebSocket, userId: string, connectionId: string) {
    const sameUserWaiting = this.state.getWebSockets().find((candidate) => {
      if (candidate === socket) return false;
      const meta = candidate.deserializeAttachment() as RandomAttachment | null;
      return meta?.userId === userId && (meta.kind === 'waiting' || meta.waiting === true) && candidate.readyState === WebSocket.OPEN;
    });
    if (sameUserWaiting) {
      try {
        sameUserWaiting.serializeAttachment({ ...(sameUserWaiting.deserializeAttachment() as RandomAttachment), kind: 'ended' });
        sameUserWaiting.close(1000, 'Replaced by new search');
      } catch { /* already closed */ }
    }
    const peer = this.state.getWebSockets().find((candidate) => {
      if (candidate === socket || candidate.readyState !== WebSocket.OPEN) return false;
      const meta = candidate.deserializeAttachment() as RandomAttachment | null;
      return meta?.kind === 'waiting' && meta.userId !== userId;
    });
    if (!peer) {
      socket.serializeAttachment({ kind: 'waiting', userId, connectionId } satisfies RandomAttachment);
      socket.send(JSON.stringify({ type: 'waiting' }));
      return;
    }

    const peerAttachment = peer.deserializeAttachment() as RandomAttachment;
    const matchId = crypto.randomUUID();
    const participants: RandomMatch['participants'] = [
      { userId, connectionId, connected: true },
      { userId: peerAttachment.userId!, connectionId: peerAttachment.connectionId!, connected: true },
    ];
    const match: RandomMatch = { id: matchId, participants, status: 'active', recoveryDeadline: null, createdAt: Date.now() };
    await this.state.storage.put(`${RANDOM_MATCH_PREFIX}${matchId}`, match);
    await this.state.storage.put(`${RANDOM_USER_PREFIX}${userId}`, matchId);
    await this.state.storage.put(`${RANDOM_USER_PREFIX}${peerAttachment.userId}`, matchId);
    socket.serializeAttachment({ kind: 'matched', userId, connectionId, matchId } satisfies RandomAttachment);
    peer.serializeAttachment({ kind: 'matched', userId: peerAttachment.userId!, connectionId: peerAttachment.connectionId!, matchId } satisfies RandomAttachment);
    socket.send(JSON.stringify({ type: 'matched', matchId, partnerOnline: true, messages: [] }));
    try { peer.send(JSON.stringify({ type: 'matched', matchId, partnerOnline: true, messages: [] })); }
    catch { await this.markDisconnected(match, peerAttachment.userId!, 1006); }
  }

  private async resumeMatch(socket: WebSocket, userId: string, connectionId: string, matchId: string) {
    const activeMatchId = await this.state.storage.get<string>(`${RANDOM_USER_PREFIX}${userId}`);
    if (!matchId || activeMatchId !== matchId) { this.reject(socket, userId, connectionId, 'session-expired'); return; }
    const match = await this.state.storage.get<RandomMatch>(`${RANDOM_MATCH_PREFIX}${matchId}`);
    if (!match) { await this.state.storage.delete(`${RANDOM_USER_PREFIX}${userId}`); this.reject(socket, userId, connectionId, 'session-expired'); return; }
    const participant = match.participants.find((item) => item.userId === userId);
    if (!participant) { this.reject(socket, userId, connectionId, 'session-expired'); return; }
    if (match.recoveryDeadline !== null && match.recoveryDeadline <= Date.now()) {
      await this.endMatch(match, 'expired');
      this.reject(socket, userId, connectionId, 'session-expired');
      return;
    }
    if (participant.connected) {
      const existing = this.socketFor(match.id, participant);
      if (existing) {
        try {
          existing.serializeAttachment({ ...(existing.deserializeAttachment() as RandomAttachment), kind: 'ended' });
          existing.close(1000, 'Replaced by new connection');
        } catch { /* already closed */ }
      }
    }

    participant.connected = true;
    participant.connectionId = connectionId;
    socket.serializeAttachment({ kind: 'matched', userId, connectionId, matchId } satisfies RandomAttachment);
    const partnerOnline = match.participants.every((item) => item.connected);
    if (partnerOnline) {
      if (match.recoveryDeadline !== null) await this.state.storage.delete(this.recoveryKey(match.recoveryDeadline, match.id));
      match.recoveryDeadline = null;
      match.status = 'active';
    } else {
      if (match.recoveryDeadline === null) {
        match.recoveryDeadline = Date.now() + RANDOM_RECOVERY_MS;
        await this.state.storage.put(this.recoveryKey(match.recoveryDeadline, match.id), true);
      }
      match.status = 'recovering';
    }
    await this.state.storage.put(`${RANDOM_MATCH_PREFIX}${match.id}`, match);
    await this.scheduleRecoveryAlarm();
    socket.send(JSON.stringify({ type: 'matched', matchId: match.id, resumed: true, partnerOnline, remainingMs: this.remainingMs(match), messages: (match.messages ?? []).map((item) => this.randomMessageFor(item, userId)) }));
    if (partnerOnline) {
      for (const other of match.participants) {
        if (other.userId === userId) continue;
        const peer = this.socketFor(match.id, other);
        if (peer?.readyState === WebSocket.OPEN) { try { peer.send(JSON.stringify({ type: 'match-resumed' })); } catch { /* next close handler will recover */ } }
      }
    } else {
      try { socket.send(JSON.stringify({ type: 'partner-reconnecting', remainingMs: this.remainingMs(match) })); } catch { /* socket closed during resume */ }
    }
    console.log('Random chat recovery attempt', { outcome: partnerOnline ? 'resumed' : 'waiting-for-partner' });
  }

  private randomMessageFor(message: RandomChatMessage, recipientId: string) {
    return {
      id: message.id, body: message.body, mine: message.senderId === recipientId, time: message.createdAt,
      editedAt: message.editedAt,
      kind: message.kind ?? 'message',
      callStatus: message.callStatus ?? null,
      callDurationSeconds: message.callDurationSeconds ?? 0,
      replyTo: message.replyToMessageId ? {
        id: message.replyToMessageId, body: message.replyToBody ?? '', mine: message.replyToSenderId === recipientId,
      } : null,
    };
  }

  private async markDisconnected(match: RandomMatch, userId: string, closeCode: number) {
    const participant = match.participants.find((item) => item.userId === userId);
    if (!participant || !participant.connected) return;
    participant.connected = false;
    participant.connectionId = null;
    match.status = 'recovering';
    if (match.recoveryDeadline === null) {
      match.recoveryDeadline = Date.now() + RANDOM_RECOVERY_MS;
      await this.state.storage.put(this.recoveryKey(match.recoveryDeadline, match.id), true);
    }
    await this.state.storage.put(`${RANDOM_MATCH_PREFIX}${match.id}`, match);
    const notification = JSON.stringify({ type: 'partner-reconnecting', remainingMs: this.remainingMs(match) });
    for (const peer of match.participants) {
      if (peer.userId === userId || !peer.connected) continue;
      const peerSocket = this.socketFor(match.id, peer);
      if (peerSocket?.readyState === WebSocket.OPEN) { try { peerSocket.send(notification); } catch { /* peer close will be handled separately */ } }
    }
    await this.scheduleRecoveryAlarm();
    console.log('Random chat socket closed', { closeCode, outcome: 'recovery-window-open' });
  }

  private async endMatch(match: RandomMatch, reason: 'left' | 'next' | 'expired' | 'suspended', actorId?: string) {
    const activeCalls = await this.env.DB.prepare("SELECT id FROM voice_calls WHERE scope = 'random' AND random_match_id = ?").bind(match.id).all<{ id: string }>();
    await Promise.all(activeCalls.results.map(({ id }) => this.env.VOICE_CALL_SESSIONS.get(this.env.VOICE_CALL_SESSIONS.idFromName(id)).fetch(new Request('https://voice-session.internal/match-ended', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }))));
    if (match.recoveryDeadline !== null) await this.state.storage.delete(this.recoveryKey(match.recoveryDeadline, match.id));
    for (const participant of match.participants) {
      const userKey = `${RANDOM_USER_PREFIX}${participant.userId}`;
      if (await this.state.storage.get<string>(userKey) === match.id) await this.state.storage.delete(userKey);
    }
    await this.state.storage.delete(`${RANDOM_MATCH_PREFIX}${match.id}`);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as RandomAttachment | null;
      if (attachment?.kind !== 'matched' || attachment.matchId !== match.id) continue;
      const isActor = actorId === attachment.userId;
      try {
        socket.send(JSON.stringify({ type: isActor ? 'session-ended' : 'partner-left', reason }));
        socket.serializeAttachment({ ...attachment, kind: 'ended' });
        socket.close(reason === 'suspended' ? 4001 : 1000, reason === 'suspended' ? 'Account suspended' : 'Chat ended');
      } catch { /* disconnected socket */ }
    }
    await this.scheduleRecoveryAlarm();
  }

  private reject(socket: WebSocket, userId: string, connectionId: string, type: string) {
    try {
      socket.serializeAttachment({ kind: 'rejected', userId, connectionId } satisfies RandomAttachment);
      socket.send(JSON.stringify({ type }));
      socket.close(1008, type);
    } catch { /* handshake already closed */ }
  }

  private socketFor(matchId: string, participant: RandomParticipant) {
    if (!participant.connectionId) return null;
    return this.state.getWebSockets().find((socket) => {
      const attachment = socket.deserializeAttachment() as RandomAttachment | null;
      return attachment?.kind === 'matched' && attachment.matchId === matchId && attachment.userId === participant.userId && attachment.connectionId === participant.connectionId;
    }) ?? null;
  }

  private async scheduleRecoveryAlarm() {
    const keys = await this.state.storage.list<boolean>({ prefix: RANDOM_RECOVERY_PREFIX });
    let nearest: number | null = null;
    for (const key of keys.keys()) {
      const remainder = key.slice(RANDOM_RECOVERY_PREFIX.length);
      const deadline = Number(remainder.slice(0, remainder.indexOf(':')));
      if (Number.isFinite(deadline) && (nearest === null || deadline < nearest)) nearest = deadline;
    }
    if (nearest === null) { await this.state.storage.deleteAlarm(); return; }
    const current = await this.state.storage.getAlarm();
    if (current !== nearest) await this.state.storage.setAlarm(nearest);
  }

  private recoveryKey(deadline: number, matchId: string) {
    return `${RANDOM_RECOVERY_PREFIX}${String(deadline).padStart(13, '0')}:${matchId}`;
  }

  private remainingMs(match: RandomMatch) {
    return Math.max(0, (match.recoveryDeadline ?? Date.now()) - Date.now());
  }

  private async forwardLegacyMessage(socket: WebSocket, message: string | ArrayBuffer, room: string) {
    const raw = typeof message === 'string' ? message : '';
    let body = '';
    try { body = cleanText((JSON.parse(raw) as { body?: unknown }).body, 1000); } catch { return; }
    if (!body) return;
    const payload = JSON.stringify({ type: 'message', body, created_at: new Date().toISOString() });
    for (const peer of this.state.getWebSockets()) {
      const peerData = peer.deserializeAttachment() as RandomAttachment | null;
      if (peer !== socket && !peerData?.kind && peerData?.room === room) { try { peer.send(payload); } catch { /* disconnected peer */ } }
    }
  }

  private notifyLegacyPeer(room: string, socket: WebSocket) {
    for (const peer of this.state.getWebSockets()) {
      const data = peer.deserializeAttachment() as RandomAttachment | null;
      if (peer !== socket && !data?.kind && data?.room === room) {
        try { peer.send(JSON.stringify({ type: 'partner-left' })); peer.serializeAttachment({ kind: 'ended', userId: data.userId ?? '', connectionId: '' }); } catch { /* disconnected peer */ }
      }
    }
  }
}

export class StudiesFeed {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/revoke') {
      const { userId } = await request.json<{ userId: string }>();
      for (const socket of this.state.getWebSockets()) {
        const meta = socket.deserializeAttachment() as { userId?: string } | null;
        if (meta?.userId === userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
      }
      return json({ ok: true });
    }
    if (url.pathname === '/publish') {
      const sectionId = url.searchParams.get('sectionId') ?? '';
      const event = await request.json<Record<string, unknown>>();
      const payload = JSON.stringify({ ...event, sectionId });
      for (const socket of this.state.getWebSockets()) {
        const meta = socket.deserializeAttachment() as { sectionId?: string } | null;
        if (meta?.sectionId === sectionId) { try { socket.send(payload); } catch { /* disconnected socket */ } }
      }
      return json({ ok: true });
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    const sectionId = request.headers.get('x-study-section') ?? '';
    if (!userId || !sectionId) return json({ error: 'Authenticated Studies connection required.' }, 401);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId, sectionId });
    server.send(JSON.stringify({ type: 'connected', sectionId }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket) {
    try { socket.close(1008, 'Studies is read-only for members.'); } catch { /* already closed */ }
  }
}

export class PollsFeed {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/revoke') {
      const { userId } = await request.json<{ userId: string }>();
      for (const socket of this.state.getWebSockets()) {
        const meta = socket.deserializeAttachment() as { userId?: string } | null;
        if (meta?.userId === userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
      }
      return json({ ok: true });
    }
    if (url.pathname === '/publish') {
      const event = JSON.stringify({ type: 'polls-updated' });
      for (const socket of this.state.getWebSockets()) { try { socket.send(event); } catch { /* disconnected socket */ } }
      return json({ ok: true });
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    if (!userId) return json({ error: 'Authenticated poll connection required.' }, 401);
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId });
    server.send(JSON.stringify({ type: 'connected' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket) {
    try { socket.close(1008, 'Poll updates are read-only.'); } catch { /* already closed */ }
  }
}

export class SideQuestsFeed {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/revoke') {
      const { userId } = await request.json<{ userId: string }>();
      for (const socket of this.state.getWebSockets()) {
        const meta = socket.deserializeAttachment() as { userId?: string } | null;
        if (meta?.userId === userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
      }
      return json({ ok: true });
    }
    if (url.pathname === '/publish') {
      const event = JSON.stringify({ type: 'side-quests-updated' });
      for (const socket of this.state.getWebSockets()) { try { socket.send(event); } catch { /* disconnected socket */ } }
      return json({ ok: true });
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    if (!userId) return json({ error: 'Authenticated side quest connection required.' }, 401);
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId });
    server.send(JSON.stringify({ type: 'connected' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket) {
    try { socket.close(1008, 'Side quest updates are read-only.'); } catch { /* already closed */ }
  }
}

export class DinoLeaderboardFeed {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/revoke' && request.method === 'POST') {
      const body = await request.json<{ userId?: string }>().catch((): { userId?: string } => ({}));
      if (body.userId) {
        for (const socket of this.state.getWebSockets()) {
          const meta = socket.deserializeAttachment() as { userId?: string } | null;
          if (meta?.userId === body.userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
        }
      }
      return json({ ok: true });
    }
    if (url.pathname === '/publish' && request.method === 'POST') {
      const event = JSON.stringify({ type: 'dino-leaderboard-updated' });
      for (const socket of this.state.getWebSockets()) { try { socket.send(event); } catch { /* disconnected socket */ } }
      return json({ ok: true });
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id') ?? '';
    if (!userId) return json({ error: 'Authenticated Dino leaderboard connection required.' }, 401);
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId });
    server.send(JSON.stringify({ type: 'connected' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket) {
    try { socket.close(1008, 'Dino leaderboard updates are read-only.'); } catch { /* already closed */ }
  }
}
