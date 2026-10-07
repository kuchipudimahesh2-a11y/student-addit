import * as webpush from 'web-push';

type PushQueueMessage = { campaignId: string };

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CHAT_ROOMS: DurableObjectNamespace;
  RANDOM_POOL: DurableObjectNamespace;
  STUDIES_FEED: DurableObjectNamespace;
  POLLS_FEED: DurableObjectNamespace;
  STUDIES_BUCKET: R2Bucket;
  PUSH_QUEUE: Queue<PushQueueMessage>;
  SESSION_SECRET?: string;
  ADMIN_BOOTSTRAP_SECRET?: string;
  ADMIN_TEST_MODE?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
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
  headers.set('access-control-allow-headers', 'Authorization, Content-Type, X-File-Name');
  headers.set('access-control-max-age', '86400');
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
  if (env.ADMIN_TEST_MODE === 'true' && loopback && token === 'local-admin-test') {
    const testId = '00000000-0000-4000-8000-000000000001';
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, name, username, gender, password_hash, recovery_question, recovery_answer_hash, role)
      VALUES (?, 'Local test admin', 'localtestadmin0001', 'male', 'local-test-disabled', 'Local testing only', 'local-test-disabled', 'admin')`).bind(testId).run();
    await env.DB.prepare('INSERT OR IGNORE INTO scores (user_id, best_score) VALUES (?, 0)').bind(testId).run();
    return env.DB.prepare('SELECT id, name, username, gender, role, is_suspended, created_at FROM users WHERE id = ?').bind(testId).first<Omit<User, 'password_hash' | 'recovery_question' | 'recovery_answer_hash'>>();
  }
  const [payload, signature] = token.split('.');
  if (!payload || !signature || await hmac(secret(env), payload) !== signature) return null;
  try {
    const data = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { sub: string; exp: number };
    if (!data.sub || data.exp < Date.now()) return null;
    const user = await env.DB.prepare('SELECT id, name, username, gender, role, is_suspended, created_at FROM users WHERE id = ?').bind(data.sub).first<Omit<User, 'password_hash' | 'recovery_question' | 'recovery_answer_hash'>>();
    return user && !user.is_suspended ? user : null;
  } catch { return null; }
}

function publicUser(user: Pick<User, 'id' | 'name' | 'username' | 'gender' | 'role' | 'created_at'>) {
  return { id: user.id, name: user.name, username: user.username, gender: user.gender, isAdmin: user.role === 'admin', createdAt: user.created_at };
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

async function writeAudit(env: Env, actorId: string, action: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await env.DB.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actorId, action, targetId, JSON.stringify(details)).run();
}

async function publishStudyUpdate(env: Env, sectionId: string, payload: Record<string, unknown>) {
  const id = env.STUDIES_FEED.idFromName('global');
  const stub = env.STUDIES_FEED.get(id);
  await stub.fetch(new Request(`https://studies.internal/publish?sectionId=${encodeURIComponent(sectionId)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }));
}

async function publishPollUpdate(env: Env) {
  const stub = env.POLLS_FEED.get(env.POLLS_FEED.idFromName('global'));
  await stub.fetch(new Request('https://polls.internal/publish', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'polls-updated' }),
  }));
}

async function revokeUserSockets(env: Env, userId: string) {
  const targets = [
    [env.CHAT_ROOMS, 'lobby'],
    [env.RANDOM_POOL, 'global'],
    [env.STUDIES_FEED, 'global'],
    [env.POLLS_FEED, 'global'],
  ] as const;
  await Promise.all(targets.map(([namespace, name]) => namespace.get(namespace.idFromName(name)).fetch(new Request('https://internal/revoke', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }),
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

async function studyPost(env: Env, postId: string) {
  return env.DB.prepare(`SELECT p.id, p.section_id, p.author_id, p.body, p.created_at, p.updated_at, u.username AS author_username
    FROM study_posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`).bind(postId).first<Record<string, unknown>>();
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
  return `${base}${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/api/health') return json({ ok: true, service: 'adda' });

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
      await env.DB.prepare('INSERT INTO users (id, name, username, gender, password_hash, recovery_question, recovery_answer_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, name, username, gender, await digestPassword(password), question, await digestPassword(answer)).run();
      await env.DB.prepare('INSERT INTO scores (user_id, best_score) VALUES (?, 0)').bind(id).run();
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
    const section = await env.DB.prepare('SELECT id FROM study_sections WHERE id = ? AND is_archived = 0').bind(sectionId).first();
    if (!section) return json({ error: 'Study section not found.' }, 404);
    const stub = env.STUDIES_FEED.get(env.STUDIES_FEED.idFromName('global'));
    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);
    headers.set('x-study-section', sectionId);
    return stub.fetch(new Request(request, { headers }));
  }

  const user = await authUser(request, env);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

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

  if (path === '/api/polls' && request.method === 'GET') {
    const { results: pollRows } = await env.DB.prepare(`SELECT p.id, p.question, p.status, p.created_at,
      (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS total_votes,
      (SELECT option_id FROM poll_votes v WHERE v.poll_id = p.id AND v.user_id = ?) AS my_vote
      FROM polls p WHERE p.status = 'open' ORDER BY p.created_at DESC`).bind(user.id).all<Record<string, unknown>>();
    const { results: optionRows } = await env.DB.prepare(`SELECT o.id, o.poll_id, o.label, o.position,
      (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = o.poll_id AND v.option_id = o.id) AS votes
      FROM poll_options o ORDER BY o.poll_id, o.position`).all<Record<string, unknown>>();
    const optionsByPoll = new Map<string, Record<string, unknown>[]>();
    for (const option of optionRows) {
      const pollId = String(option.poll_id); const rows = optionsByPoll.get(pollId) ?? [];
      rows.push({ id: option.id, label: option.label, votes: Number(option.votes ?? 0) }); optionsByPoll.set(pollId, rows);
    }
    return json({ polls: pollRows.map((poll) => {
      const showResults = poll.status === 'closed' || !!poll.my_vote;
      const choices = optionsByPoll.get(String(poll.id)) ?? [];
      return { ...poll, total_votes: showResults ? Number(poll.total_votes ?? 0) : 0,
        options: showResults ? choices : choices.map((option) => ({ ...option, votes: 0 })) };
    }) });
  }

  const pollVoteMatch = path.match(/^\/api\/polls\/([^/]+)\/vote$/);
  if (pollVoteMatch && request.method === 'POST') {
    const pollId = decodeURIComponent(pollVoteMatch[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const optionId = typeof body.optionId === 'string' ? body.optionId.slice(0, 80) : '';
    if (!optionId) return json({ error: 'Choose an option before voting.' }, 400);
    const result = await env.DB.prepare(`INSERT INTO poll_votes (poll_id, user_id, option_id)
      SELECT p.id, ?, o.id FROM polls p JOIN poll_options o ON o.poll_id = p.id
      WHERE p.id = ? AND p.status = 'open' AND o.id = ? AND NOT EXISTS (SELECT 1 FROM poll_votes v WHERE v.poll_id = p.id AND v.user_id = ?)`)
      .bind(user.id, pollId, optionId, user.id).run();
    if (Number(result.meta.changes ?? 0) === 1) {
      await publishPollUpdate(env);
      return json({ ok: true });
    }
    const poll = await env.DB.prepare('SELECT status FROM polls WHERE id = ?').bind(pollId).first<{ status: string }>();
    if (!poll) return json({ error: 'Poll not found.' }, 404);
    const existingVote = await env.DB.prepare('SELECT 1 AS voted FROM poll_votes WHERE poll_id = ? AND user_id = ?').bind(pollId, user.id).first();
    if (existingVote) return json({ error: 'You have already voted in this poll.' }, 409);
    const option = await env.DB.prepare('SELECT 1 AS valid FROM poll_options WHERE poll_id = ? AND id = ?').bind(pollId, optionId).first();
    if (!option) return json({ error: 'That option does not belong to this poll.' }, 400);
    return json({ error: 'This poll is closed.' }, 409);
  }

  if (path === '/api/admin/polls' && request.method === 'GET') {
    const { results: polls } = await env.DB.prepare(`SELECT p.id, p.question, p.status, p.created_at, p.closed_at,
      (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS total_votes FROM polls p WHERE p.status = 'open' ORDER BY p.created_at DESC`).all<Record<string, unknown>>();
    const { results: options } = await env.DB.prepare(`SELECT o.id, o.poll_id, o.label, o.position,
      (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = o.poll_id AND v.option_id = o.id) AS votes
      FROM poll_options o ORDER BY o.poll_id, o.position`).all<Record<string, unknown>>();
    const optionsByPoll = new Map<string, Record<string, unknown>[]>();
    for (const option of options) {
      const pollId = String(option.poll_id); const rows = optionsByPoll.get(pollId) ?? [];
      rows.push({ id: option.id, label: option.label, votes: Number(option.votes ?? 0) }); optionsByPoll.set(pollId, rows);
    }
    return json({ polls: polls.map((poll) => ({ ...poll, total_votes: Number(poll.total_votes ?? 0), options: optionsByPoll.get(String(poll.id)) ?? [] })) });
  }

  if (path === '/api/admin/polls' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const question = cleanText(body.question, 240);
    const options = Array.isArray(body.options) ? body.options.map((item) => cleanText(item, 160)).filter(Boolean) : [];
    if (question.length < 3) return json({ error: 'Write a question with at least 3 characters.' }, 400);
    if (options.length < 2 || options.length > 8) return json({ error: 'Add between 2 and 8 answer choices.' }, 400);
    if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) return json({ error: 'Each answer choice must be unique.' }, 400);
    const pollId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO polls (id, question, created_by) VALUES (?, ?, ?)').bind(pollId, question, user.id),
      ...options.map((label, position) => env.DB.prepare('INSERT INTO poll_options (id, poll_id, label, position) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), pollId, label, position)),
    ]);
    await writeAudit(env, user.id, 'create_poll', pollId, { question, optionCount: options.length });
    await publishPollUpdate(env);
    return json({ id: pollId, status: 'open' }, 201);
  }

  const adminPollMatch = path.match(/^\/api\/admin\/polls\/([^/]+)$/);
  if (adminPollMatch && request.method === 'PATCH') {
    const pollId = decodeURIComponent(adminPollMatch[1]);
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    if (body.status !== 'open' && body.status !== 'closed') return json({ error: 'Choose whether the poll should be open or closed.' }, 400);
    const existing = await env.DB.prepare('SELECT id FROM polls WHERE id = ?').bind(pollId).first();
    if (!existing) return json({ error: 'Poll not found.' }, 404);
    await env.DB.prepare(`UPDATE polls SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?`)
      .bind(body.status, body.status, pollId).run();
    await writeAudit(env, user.id, body.status === 'closed' ? 'close_poll' : 'reopen_poll', pollId);
    await publishPollUpdate(env);
    return json({ ok: true, status: body.status });
  }

  if (path === '/api/me' && request.method === 'GET') return json({ user: publicUser(user) });

  if (path === '/api/notifications/vapid-public-key' && request.method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: 'Push notifications are not configured yet.' }, 503);
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (path === '/api/me/push-subscriptions' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ?').bind(user.id).all<{ endpoint: string }>();
    return json({ endpoints: results.map((item) => item.endpoint) });
  }

  if (path === '/api/me/push-subscriptions' && request.method === 'POST') {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: 'Push notifications are not configured yet.' }, 503);
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
    return json({ ok: true });
  }

  if (path === '/api/me/push-subscriptions' && request.method === 'DELETE') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.slice(0, 2048) : '';
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
    return json({ user: { ...user, username } });
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
    if (body.suspended && target.role === 'admin' && !target.is_suspended) {
      const others = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_suspended = 0 AND id <> ?").bind(targetId).first<{ count: number }>();
      if (Number(others?.count ?? 0) === 0) return json({ error: 'Keep at least one active administrator.' }, 409);
    }
    await env.DB.prepare('UPDATE users SET is_suspended = ? WHERE id = ?').bind(body.suspended ? 1 : 0, targetId).run();
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
    if (body.role === 'member' && target.role === 'admin') {
      const others = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_suspended = 0 AND id <> ?").bind(targetId).first<{ count: number }>();
      if (Number(others?.count ?? 0) === 0) return json({ error: 'Keep at least one active administrator.' }, 409);
    }
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, targetId).run();
    await writeAudit(env, user.id, body.role === 'admin' ? 'promote_admin' : 'remove_admin', targetId);
    return json({ ok: true, role: body.role });
  }

  if (path === '/api/studies/sections' && request.method === 'GET') {
    const includeArchived = adminOnly(user) && url.searchParams.get('includeArchived') === 'true';
    const sections = await env.DB.prepare(`SELECT s.id, s.name, s.is_archived, s.created_at, s.updated_at,
      (SELECT COUNT(*) FROM study_posts p WHERE p.section_id = s.id) AS post_count
      FROM study_sections s ${includeArchived ? '' : 'WHERE s.is_archived = 0'} ORDER BY s.updated_at DESC`).all();
    return json({ sections: sections.results });
  }

  if (path === '/api/studies/ws-ticket' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const sectionId = cleanText(body.sectionId, 80);
    const section = await env.DB.prepare('SELECT id FROM study_sections WHERE id = ? AND is_archived = 0').bind(sectionId).first();
    if (!section) return json({ error: 'Study section not found.' }, 404);
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare("INSERT INTO study_ws_tickets (token_hash, user_id, section_id, expires_at) VALUES (?, ?, ?, datetime('now', '+1 minute'))").bind(await sha256(ticket), user.id, sectionId).run();
    return json({ ticket, expiresIn: 60 });
  }

  const sectionPostsMatch = path.match(/^\/api\/studies\/sections\/([^/]+)\/posts$/);
  if (sectionPostsMatch && request.method === 'GET') {
    const sectionId = decodeURIComponent(sectionPostsMatch[1]);
    const section = await env.DB.prepare('SELECT id, name, is_archived FROM study_sections WHERE id = ?').bind(sectionId).first<{ id: string; name: string; is_archived: number }>();
    if (!section || (section.is_archived && !adminOnly(user))) return json({ error: 'Study section not found.' }, 404);
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
    const section = await env.DB.prepare('SELECT id FROM study_sections WHERE id = ?').bind(sectionId).first();
    if (!section) return json({ error: 'Study section not found.' }, 404);
    if (typeof body.name === 'string') {
      const name = cleanText(body.name, 80);
      if (name.length < 2) return json({ error: 'Section names need at least 2 characters.' }, 400);
      try { await env.DB.prepare('UPDATE study_sections SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, sectionId).run(); }
      catch { return json({ error: 'A section with that name already exists.' }, 409); }
    }
    if (typeof body.archived === 'boolean') await env.DB.prepare('UPDATE study_sections SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.archived ? 1 : 0, sectionId).run();
    const updated = await env.DB.prepare('SELECT id, name, is_archived, updated_at FROM study_sections WHERE id = ?').bind(sectionId).first();
    await writeAudit(env, user.id, body.archived === true ? 'archive_study_section' : 'update_study_section', sectionId, { name: body.name });
    await publishStudyUpdate(env, sectionId, { type: 'section-updated' });
    return json({ section: updated });
  }

  const adminSectionPostsMatch = path.match(/^\/api\/admin\/studies\/sections\/([^/]+)\/posts$/);
  if (adminSectionPostsMatch && request.method === 'POST') {
    const sectionId = decodeURIComponent(adminSectionPostsMatch[1]);
    const section = await env.DB.prepare('SELECT id FROM study_sections WHERE id = ? AND is_archived = 0').bind(sectionId).first();
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
    if (!post) return json({ error: 'Study post not found.' }, 404);
    await env.DB.prepare('UPDATE study_posts SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(text, postId).run();
    await writeAudit(env, user.id, 'edit_study_post', postId);
    await publishStudyUpdate(env, String(post.section_id), { type: 'post-updated', postId });
    return json({ ok: true });
  }
  if (adminPostMatch && request.method === 'DELETE') {
    const postId = decodeURIComponent(adminPostMatch[1]);
    const post = await studyPost(env, postId);
    if (!post) return json({ error: 'Study post not found.' }, 404);
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
    if (!post) return json({ error: 'Study post not found.' }, 404);
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
    const attachment = await env.DB.prepare(`SELECT a.object_key, a.file_name, a.content_type, s.is_archived FROM study_attachments a
      JOIN study_posts p ON p.id = a.post_id JOIN study_sections s ON s.id = p.section_id WHERE a.id = ?`).bind(decodeURIComponent(fileMatch[1]))
      .first<{ object_key: string; file_name: string; content_type: string; is_archived: number }>();
    if (!attachment || (attachment.is_archived && !adminOnly(user))) return json({ error: 'Study file not found.' }, 404);
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
    const messages = await env.DB.prepare(`SELECT m.id, m.body, m.created_at,
      CASE WHEN m.user_id = ? THEN 1 ELSE 0 END AS mine
      FROM messages m ORDER BY m.created_at DESC LIMIT 80`).bind(user.id).all<Record<string, unknown>>();
    return json({ messages: messages.results.reverse().map((message) => ({ ...message, mine: Boolean(message.mine) })) });
  }

  if (path === '/api/chat/people' && request.method === 'GET') {
    const members = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
    return json({ count: Number(members?.count ?? 0) });
  }

  if (path === '/api/game/score' && request.method === 'POST') {
    const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const score = Number(body.score);
    if (!Number.isSafeInteger(score) || score < 0 || score > 1000000) return json({ error: 'Invalid score.' }, 400);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO game_runs (id, user_id, score) VALUES (?, ?, ?)').bind(crypto.randomUUID(), user.id, score),
      env.DB.prepare('INSERT INTO scores (user_id, best_score) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET best_score = MAX(best_score, excluded.best_score), updated_at = CURRENT_TIMESTAMP').bind(user.id, score),
    ]);
    return json({ ok: true });
  }

  if (path === '/api/game/leaderboard' && request.method === 'GET') {
    const personal = await env.DB.prepare('SELECT best_score FROM scores WHERE user_id = ?').bind(user.id).first<{ best_score: number }>();
    const totals = await env.DB.prepare('SELECT u.gender, COALESCE(SUM(r.score), 0) AS total FROM users u LEFT JOIN game_runs r ON r.user_id = u.id GROUP BY u.gender').all();
    return json({ personalBest: Number(personal?.best_score ?? 0), totals: totals.results });
  }

  if (path === '/api/ws/chat' || path === '/api/ws/random') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
    const id = path.endsWith('/chat') ? env.CHAT_ROOMS.idFromName('lobby') : env.RANDOM_POOL.idFromName('global');
    const stub = path.endsWith('/chat') ? env.CHAT_ROOMS.get(id) : env.RANDOM_POOL.get(id);
    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);
    headers.set('x-user-handle', user.username);
    return stub.fetch(new Request(request, { headers }));
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
        badge: '/icons/adda-192.png',
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
}

async function failPushCampaign(env: Env, campaignId: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', last_error = 'Delivery retries exhausted', updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND status = 'pending'").bind(campaignId),
    env.DB.prepare("UPDATE notification_campaigns SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('queued', 'sending')").bind(campaignId),
  ]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return withCors(await handleApi(request, env), request); }
      catch (error) { console.error('API error', error); return withCors(json({ error: 'Something went wrong. Please try again.' }, 500), request); }
    }
    return env.ASSETS.fetch(request);
  },
  async queue(batch: MessageBatch<PushQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      const campaignId = typeof message.body?.campaignId === 'string' ? message.body.campaignId : '';
      if (!campaignId) { message.ack(); continue; }
      if (batch.queue === PUSH_DLQ_NAME) {
        await failPushCampaign(env, campaignId);
        message.ack();
        continue;
      }
      try {
        await processPushCampaign(env, campaignId);
        message.ack();
      } catch (error) {
        console.error('Push campaign batch failed', { campaignId, error });
        message.retry({ delaySeconds: Math.min(300, 15 * Math.max(1, message.attempts)) });
      }
    }
  },
};

export class ChatRoom {
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
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const handle = request.headers.get('x-user-handle') ?? 'guest';
    const userId = request.headers.get('x-user-id') ?? '';
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ handle, userId });
    server.send(JSON.stringify({ type: 'connected' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer) {
    const data = typeof message === 'string' ? JSON.parse(message) as { body?: unknown } : {};
    const body = cleanText(data.body, 2000);
    if (!body) return;
    const attachment = _socket.deserializeAttachment() as { handle?: string; userId?: string } | null;
    const id = crypto.randomUUID();
    const handle = attachment?.handle ?? 'guest';
    const senderId = attachment?.userId ?? '';
    await this.env.DB.prepare('INSERT INTO messages (id, user_id, body) VALUES (?, (SELECT id FROM users WHERE username = ?), ?)').bind(id, handle, body).run();
    const createdAt = new Date().toISOString();
    for (const socket of this.state.getWebSockets()) {
      const recipient = socket.deserializeAttachment() as { userId?: string } | null;
      const payload = JSON.stringify({ type: 'message', message: { id, mine: Boolean(senderId && recipient?.userId === senderId), body, created_at: createdAt } });
      try { socket.send(payload); } catch { /* disconnected socket */ }
    }
  }
}

export class RandomPool {
  private waiting: WebSocket | null = null;
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    if (new URL(request.url).pathname === '/revoke') {
      const { userId } = await request.json<{ userId: string }>();
      for (const socket of this.state.getWebSockets()) {
        const meta = socket.deserializeAttachment() as { userId?: string } | null;
        if (meta?.userId === userId) { try { socket.close(4001, 'Account suspended'); } catch { /* already closed */ } }
      }
      return json({ ok: true });
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const userId = request.headers.get('x-user-id') ?? '';
    this.state.acceptWebSocket(server);
    this.waiting ??= this.state.getWebSockets().find((ws) => {
      const meta = ws.deserializeAttachment() as { waiting?: boolean } | null;
      return meta?.waiting === true && ws.readyState === WebSocket.OPEN;
    }) ?? null;
    if (this.waiting && this.waiting.readyState === WebSocket.OPEN) {
      const peer = this.waiting;
      this.waiting = null;
      const room = crypto.randomUUID();
      const peerId = (peer.deserializeAttachment() as { userId?: string } | null)?.userId ?? '';
      server.serializeAttachment({ room, userId });
      peer.serializeAttachment({ room, userId: peerId });
      server.send(JSON.stringify({ type: 'matched' }));
      peer.send(JSON.stringify({ type: 'matched' }));
    } else {
      this.waiting = server;
      server.serializeAttachment({ waiting: true, userId });
      server.send(JSON.stringify({ type: 'waiting' }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const attachment = socket.deserializeAttachment() as { room?: string } | null;
    if (!attachment?.room) return;
    const raw = typeof message === 'string' ? message : '';
    let body = '';
    try { body = cleanText((JSON.parse(raw) as { body?: unknown }).body, 1000); } catch { return; }
    if (!body) return;
    const payload = JSON.stringify({ type: 'message', body, created_at: new Date().toISOString() });
    for (const peer of this.state.getWebSockets()) {
      const peerData = peer.deserializeAttachment() as { room?: string } | null;
      if (peer !== socket && peerData?.room === attachment.room) { try { peer.send(payload); } catch { /* disconnected socket */ } }
    }
  }

  async webSocketClose(socket: WebSocket) {
    if (this.waiting === socket) this.waiting = null;
    const attachment = socket.deserializeAttachment() as { room?: string } | null;
    if (attachment?.room) {
      for (const peer of this.state.getWebSockets()) {
        const data = peer.deserializeAttachment() as { room?: string } | null;
        if (data?.room === attachment.room) { peer.send(JSON.stringify({ type: 'partner-left' })); peer.serializeAttachment({ ended: true }); }
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
