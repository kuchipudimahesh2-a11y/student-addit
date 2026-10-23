/**
 * Adda Offline Storage Engine — Native HTML5 IndexedDB Client
 * Lightweight, zero-dependency, transactional offline persistence for:
 * 1. Chat messages (DMs, Group Chats, System Announcements)
 * 2. Chat rooms metadata & persistent message drafts
 * 3. Inbox conversation lists (instant cold-start)
 * 4. Game high scores & personal bests (Dino Run + Mini-games)
 * 5. Team rivalry leaderboards (Boys vs Girls)
 * 6. Offline sync queue (auto-flushes pending scores once reconnected)
 */

const DB_NAME = 'adda_offline_db';
const DB_VERSION = 3;

export interface CachedMessage {
  id: string;
  roomKey: string; // e.g. "dm:conv-123" or "group:grp-456"
  username: string;
  mine: boolean;
  body: string;
  created_at: string;
  edited_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to_body?: string | null;
  reply_to_username?: string | null;
  reply_to_mine?: boolean;
  type?: 'message' | 'call';
  call_status?: string | null;
  call_duration_seconds?: number;
  seen?: boolean;
  delivered?: boolean;
  media_type?: 'image' | 'gif' | 'voice_note' | 'document' | null;
  media_url?: string | null;
  media_duration_seconds?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  is_deleted?: boolean;
  is_forwarded?: boolean | number | null;
  is_starred?: boolean | number | null;
  reactions?: Array<{ emoji: string; count: number; users: string[]; hasReacted?: boolean; reactedByMe?: boolean }>;
  link_preview?: { title?: string; description?: string; image?: string; domain?: string; url: string } | null;
  poll_id?: string | null;
  poll?: any | null;
  expires_at?: string | null;
}

export interface CachedRoom {
  roomKey: string;
  kind?: 'dm' | 'group' | 'system';
  id?: string;
  label?: string;
  draft: string;
  hasOlder?: boolean;
  lastFetchedAt: number;
}

export interface CachedInbox {
  key: string; // e.g. "inbox:usr_123"
  dms: any[];
  groups: any[];
  announcements: any[];
  requests?: any[];
  updatedAt: number;
}

export function getAccountRoomKey(roomKey: string, accountId?: string | null): string {
  if (!accountId || !roomKey) return roomKey;
  if (roomKey.startsWith(accountId + ':')) return roomKey;
  return `${accountId}:${roomKey}`;
}

export interface CachedGameScore {
  gameId: string;
  personalBest: number;
  lastScore: number;
  updatedAt: number;
  synced: boolean;
}

export interface CachedLeaderboard {
  key?: string; // e.g. "team_board"
  personalBest: number;
  totals: Array<{ gender: string; total: number }>;
  topPlayers: Array<{ username: string; totalScore: number; bestRun: number }>;
  playerRank?: { rank: number | null; username: string; totalScore: number; bestRun: number };
  season?: { number: number; nextResetAt: string } | null;
  cachedAt?: number;
}

export interface QueuedOfflineScore {
  queueId?: number;
  gameId: string;
  score: number;
  createdAt: number;
  attempts: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function getDb(): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open Adda IndexedDB database.'));
    };

    request.onblocked = () => {
      console.warn('[AddaDB] Database upgrade blocked by another open tab.');
      dbPromise = null;
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try {
          db.close();
        } catch {}
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Safe migration for DB v3: Recreate chat_messages with compound keyPath ['roomKey', 'id']
      if (event.oldVersion > 0 && event.oldVersion < 3 && db.objectStoreNames.contains('chat_messages')) {
        try {
          db.deleteObjectStore('chat_messages');
        } catch { /* ignore migration store recreation errors */ }
      }

      // 1. Chat Messages Store (Compound keyPath: ['roomKey', 'id'] prevents cross-room collision)
      if (!db.objectStoreNames.contains('chat_messages')) {
        const msgStore = db.createObjectStore('chat_messages', { keyPath: ['roomKey', 'id'] });
        msgStore.createIndex('roomKey', 'roomKey', { unique: false });
        msgStore.createIndex('room_created', ['roomKey', 'created_at'], { unique: false });
      }

      // 2. Chat Rooms Store (Drafts & Metadata)
      if (!db.objectStoreNames.contains('chat_rooms')) {
        db.createObjectStore('chat_rooms', { keyPath: 'roomKey' });
      }

      // 3. Inbox Cache Store (Cold-start conversations list)
      if (!db.objectStoreNames.contains('inbox_cache')) {
        db.createObjectStore('inbox_cache', { keyPath: 'key' });
      }

      // 4. Game Scores Store (Personal bests & offline scores)
      if (!db.objectStoreNames.contains('game_scores')) {
        db.createObjectStore('game_scores', { keyPath: 'gameId' });
      }

      // 5. Game Leaderboards Store (Team rivalry totals & tops)
      if (!db.objectStoreNames.contains('game_leaderboards')) {
        db.createObjectStore('game_leaderboards', { keyPath: 'key' });
      }

      // 6. Offline Sync Queue (Unsynced scores & actions)
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'queueId', autoIncrement: true });
      }

      // Safe migration for DB v2: Invalidate legacy un-scoped inbox_data
      if (event.oldVersion < 2 && db.objectStoreNames.contains('inbox_cache')) {
        try {
          const tx = (event.target as IDBOpenDBRequest).transaction;
          if (tx) {
            const store = tx.objectStore('inbox_cache');
            store.delete('inbox_data');
          }
        } catch { /* ignore migration cleanup failure */ }
      }
    };
  });

  return dbPromise;
}

/* ==========================================================================
   1. Chat Messages Persistence (Account Scoped)
   ========================================================================== */

function normalizeDbRecordTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value) return new Date().toISOString();
  const s = value.trim();
  if (s.includes('T') && (s.endsWith('Z') || s.includes('+'))) return s;
  return s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z');
}

export async function pruneOldMessages(days = 30): Promise<number> {
  if (!isIndexedDbSupported()) return 0;
  try {
    const db = await getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const tx = db.transaction('chat_messages', 'readwrite');
    const store = tx.objectStore('chat_messages');
    let deletedCount = 0;
    const req = store.openCursor();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const val = cursor.value as CachedMessage;
          if (val && val.created_at && val.created_at < cutoff && !val.is_starred) {
            cursor.delete();
            deletedCount += 1;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
      req.onerror = () => resolve(deletedCount);
    });
  } catch {
    return 0;
  }
}

export async function deleteCachedMessage(roomKey: string, messageId: string, accountId?: string | null): Promise<void> {
  if (!isIndexedDbSupported() || !roomKey || !messageId) return;
  try {
    const db = await getDb();
    const tx = db.transaction('chat_messages', 'readwrite');
    const store = tx.objectStore('chat_messages');
    const scopedKey = getAccountRoomKey(roomKey, accountId);
    store.delete([scopedKey, messageId]);
  } catch (err) {
    console.warn('[AddaDB] deleteCachedMessage error:', err);
  }
}

export async function saveMessages(roomKey: string, messages: any[], accountId?: string | null): Promise<void> {
  if (!isIndexedDbSupported() || !messages || messages.length === 0) return;
  const scopedKey = getAccountRoomKey(roomKey, accountId);

  const performWrite = async () => {
    const db = await getDb();
    const tx = db.transaction('chat_messages', 'readwrite');
    const store = tx.objectStore('chat_messages');

    for (const msg of messages) {
      if (!msg || !msg.id) continue;
      if (msg.is_deleted) {
        store.delete([scopedKey, msg.id]);
        continue;
      }
      const record: CachedMessage = {
        id: msg.id,
        roomKey: scopedKey,
        username: msg.username || '',
        mine: Boolean(msg.mine),
        body: msg.body || '',
        created_at: normalizeDbRecordTimestamp(msg.created_at),
        edited_at: msg.edited_at ?? null,
        reply_to_message_id: msg.reply_to_message_id ?? null,
        reply_to_body: msg.reply_to_body ?? null,
        reply_to_username: msg.reply_to_username ?? null,
        reply_to_mine: msg.reply_to_mine ?? false,
        type: msg.type ?? 'message',
        call_status: msg.call_status ?? null,
        call_duration_seconds: msg.call_duration_seconds ?? 0,
        seen: msg.seen ?? false,
        delivered: msg.delivered ?? false,
        media_type: msg.media_type ?? null,
        media_url: msg.media_url ?? null,
        media_duration_seconds: msg.media_duration_seconds ?? null,
        file_name: msg.file_name ?? null,
        file_size: msg.file_size ?? null,
        is_deleted: false,
        is_forwarded: msg.is_forwarded ?? false,
        is_starred: msg.is_starred ?? false,
        reactions: Array.isArray(msg.reactions)
          ? msg.reactions.map((r: any) => ({
              emoji: String(r.emoji || ''),
              count: Number(r.count || 0),
              users: Array.isArray(r.users) ? r.users : [],
              hasReacted: Boolean(r.hasReacted),
              reactedByMe: Boolean(r.reactedByMe),
            }))
          : [],
        link_preview: msg.link_preview ?? null,
        poll_id: msg.poll_id ?? null,
        poll: msg.poll ?? null,
        expires_at: msg.expires_at ?? null,
      };
      store.put(record);
    }

    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  try {
    await performWrite();
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.message?.toLowerCase().includes('quota')) {
      console.warn('[AddaDB] QuotaExceededError encountered, pruning old messages (>30d)...');
      await pruneOldMessages(30);
      try {
        await performWrite();
      } catch (retryErr) {
        console.warn('[AddaDB] saveMessages retry failed after quota eviction:', retryErr);
      }
    } else {
      console.warn('[AddaDB] saveMessages error:', err);
    }
  }
}

/**
 * Reads up to `limit` most recent cached messages for a room in chronological order.
 * Uses cursor direction 'prev' to select the latest records, then reverses the result.
 */
export async function getMessages(roomKey: string, limit = 200, accountId?: string | null): Promise<CachedMessage[]> {
  if (!isIndexedDbSupported()) return [];
  try {
    const db = await getDb();
    const tx = db.transaction('chat_messages', 'readonly');
    const store = tx.objectStore('chat_messages');
    const index = store.index('room_created');
    const scopedKey = getAccountRoomKey(roomKey, accountId);

    // Query messages by scoped roomKey bound range
    const range = IDBKeyRange.bound([scopedKey, ''], [scopedKey, '\uffff']);

    return new Promise((resolve) => {
      const results: CachedMessage[] = [];
      // 'prev' fetches the latest messages first
      const cursorReq = index.openCursor(range, 'prev');

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          // Reverse back to chronological order (oldest -> newest) for display
          resolve(results.reverse());
        }
      };

      cursorReq.onerror = () => {
        resolve([]);
      };
    });
  } catch (err) {
    console.warn('[AddaDB] getMessages error:', err);
    return [];
  }
}

/* ==========================================================================
   2. Room Metadata & Unsent Drafts Persistence (Account Scoped)
   ========================================================================== */

export async function saveRoomDraft(roomKey: string, draft: string, accountId?: string | null): Promise<void> {
  if (!isIndexedDbSupported() || !roomKey) return;
  try {
    const db = await getDb();
    const tx = db.transaction('chat_rooms', 'readwrite');
    const store = tx.objectStore('chat_rooms');
    const scopedKey = getAccountRoomKey(roomKey, accountId);

    const getReq = store.get(scopedKey);
    getReq.onsuccess = () => {
      const existing = (getReq.result as CachedRoom | undefined) ?? {
        roomKey: scopedKey,
        draft: '',
        lastFetchedAt: Date.now(),
      };
      existing.draft = draft;
      store.put(existing);
    };
  } catch (err) {
    console.warn('[AddaDB] saveRoomDraft error:', err);
  }
}

export async function getRoomDraft(roomKey: string, accountId?: string | null): Promise<string> {
  if (!isIndexedDbSupported() || !roomKey) return '';
  try {
    const db = await getDb();
    const tx = db.transaction('chat_rooms', 'readonly');
    const store = tx.objectStore('chat_rooms');
    const scopedKey = getAccountRoomKey(roomKey, accountId);
    return new Promise((resolve) => {
      const req = store.get(scopedKey);
      req.onsuccess = () => resolve(req.result?.draft || '');
      req.onerror = () => resolve('');
    });
  } catch {
    return '';
  }
}

export async function saveRoomMetadata(roomKey: string, metadata: Partial<CachedRoom>, accountId?: string | null): Promise<void> {
  if (!isIndexedDbSupported() || !roomKey) return;
  try {
    const db = await getDb();
    const tx = db.transaction('chat_rooms', 'readwrite');
    const store = tx.objectStore('chat_rooms');
    const scopedKey = getAccountRoomKey(roomKey, accountId);

    const getReq = store.get(scopedKey);
    getReq.onsuccess = () => {
      const existing = (getReq.result as CachedRoom | undefined) ?? {
        roomKey: scopedKey,
        draft: '',
        lastFetchedAt: Date.now(),
      };
      store.put({ ...existing, ...metadata });
    };
  } catch (err) {
    console.warn('[AddaDB] saveRoomMetadata error:', err);
  }
}

export async function getRoomMetadata(roomKey: string, accountId?: string | null): Promise<CachedRoom | null> {
  if (!isIndexedDbSupported() || !roomKey) return null;
  try {
    const db = await getDb();
    const tx = db.transaction('chat_rooms', 'readonly');
    const store = tx.objectStore('chat_rooms');
    const scopedKey = getAccountRoomKey(roomKey, accountId);
    return new Promise((resolve) => {
      const req = store.get(scopedKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/* ==========================================================================
   3. Inbox Conversation List Cache (Account-Scoped Cold-Start)
   ========================================================================== */

export async function saveInboxCache(data: {
  dms?: any[];
  groups?: any[];
  announcements?: any[];
  requests?: any[];
}, accountId?: string | null): Promise<void> {
  if (!isIndexedDbSupported()) return;
  try {
    const db = await getDb();
    const tx = db.transaction('inbox_cache', 'readwrite');
    const store = tx.objectStore('inbox_cache');
    const cacheKey = accountId ? `inbox:${accountId}` : 'inbox_data';

    const record: CachedInbox = {
      key: cacheKey,
      dms: data.dms || [],
      groups: data.groups || [],
      announcements: data.announcements || [],
      requests: data.requests || [],
      updatedAt: Date.now(),
    };
    store.put(record);
  } catch (err) {
    console.warn('[AddaDB] saveInboxCache error:', err);
  }
}

export async function getInboxCache(accountId?: string | null): Promise<CachedInbox | null> {
  if (!isIndexedDbSupported()) return null;
  try {
    const db = await getDb();
    const tx = db.transaction('inbox_cache', 'readonly');
    const store = tx.objectStore('inbox_cache');
    const cacheKey = accountId ? `inbox:${accountId}` : 'inbox_data';
    return new Promise((resolve) => {
      const req = store.get(cacheKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Clears private cached data for a specific authenticated user on logout.
 * Eliminates cross-account chat and inbox exposure on shared devices.
 */
export async function clearAccountData(accountId: string): Promise<void> {
  if (!isIndexedDbSupported() || !accountId) return;
  try {
    const db = await getDb();

    // 1. Remove account-scoped inbox cache and legacy inbox_data
    try {
      const inboxTx = db.transaction('inbox_cache', 'readwrite');
      const inboxStore = inboxTx.objectStore('inbox_cache');
      inboxStore.delete(`inbox:${accountId}`);
      inboxStore.delete('inbox_data');
    } catch {}

    // 2. Remove account-scoped room drafts & metadata
    try {
      const roomsTx = db.transaction('chat_rooms', 'readwrite');
      const roomsStore = roomsTx.objectStore('chat_rooms');
      const roomsCursorReq = roomsStore.openCursor();
      roomsCursorReq.onsuccess = () => {
        const cursor = roomsCursorReq.result;
        if (cursor) {
          const key = String(cursor.key);
          if (key.startsWith(`${accountId}:`)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch {}

    // 3. Remove account-scoped messages
    try {
      const msgTx = db.transaction('chat_messages', 'readwrite');
      const msgStore = msgTx.objectStore('chat_messages');
      const msgCursorReq = msgStore.openCursor();
      msgCursorReq.onsuccess = () => {
        const cursor = msgCursorReq.result;
        if (cursor) {
          const val = cursor.value as CachedMessage;
          if (val && typeof val.roomKey === 'string' && val.roomKey.startsWith(`${accountId}:`)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch {}
  } catch (err) {
    console.warn('[AddaDB] clearAccountData error:', err);
  }
}

/* ==========================================================================
   4. Game High Scores & Personal Bests Persistence
   ========================================================================== */

export async function saveGameScore(gameId: string, score: number, synced = true): Promise<void> {
  if (!isIndexedDbSupported() || !gameId) return;
  try {
    const db = await getDb();
    const tx = db.transaction('game_scores', 'readwrite');
    const store = tx.objectStore('game_scores');

    const getReq = store.get(gameId);
    getReq.onsuccess = () => {
      const existing = (getReq.result as CachedGameScore | undefined) ?? {
        gameId,
        personalBest: score,
        lastScore: score,
        updatedAt: Date.now(),
        synced,
      };

      const isReaction = gameId === 'reaction-test';
      let nextBest = existing.personalBest;
      if (existing.personalBest === undefined || existing.personalBest === null || existing.personalBest === 0) {
        nextBest = score;
      } else if (isReaction) {
        nextBest = Math.min(existing.personalBest, score); // lower ms is better
      } else {
        nextBest = Math.max(existing.personalBest, score); // higher pts is better
      }

      existing.personalBest = nextBest;
      existing.lastScore = score;
      existing.updatedAt = Date.now();
      existing.synced = synced;

      store.put(existing);
    };
  } catch (err) {
    console.warn('[AddaDB] saveGameScore error:', err);
  }
}

export async function getGameScores(): Promise<Record<string, number>> {
  if (!isIndexedDbSupported()) return {};
  try {
    const db = await getDb();
    const tx = db.transaction('game_scores', 'readonly');
    const store = tx.objectStore('game_scores');
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as CachedGameScore[]) || [];
        const map: Record<string, number> = {};
        for (const item of list) {
          if (item && item.gameId && typeof item.personalBest === 'number') {
            map[item.gameId] = item.personalBest;
          }
        }
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

/* ==========================================================================
   5. Team Rivalry Leaderboards Cache
   ========================================================================== */

export async function saveCachedLeaderboard(board: {
  personalBest?: number;
  totals?: Array<{ gender: string; total: number }>;
  topPlayers?: Array<{ username: string; totalScore: number; bestRun: number }>;
  playerRank?: { rank: number | null; username: string; totalScore: number; bestRun: number };
  season?: { number: number; nextResetAt: string } | null;
}): Promise<void> {
  if (!isIndexedDbSupported() || !board) return;
  try {
    const db = await getDb();
    const tx = db.transaction('game_leaderboards', 'readwrite');
    const store = tx.objectStore('game_leaderboards');

    const record: CachedLeaderboard = {
      key: 'team_board',
      personalBest: Number(board.personalBest ?? 0),
      totals: board.totals || [],
      topPlayers: board.topPlayers || [],
      playerRank: board.playerRank,
      season: board.season,
      cachedAt: Date.now(),
    };
    store.put(record);
  } catch (err) {
    console.warn('[AddaDB] saveCachedLeaderboard error:', err);
  }
}

export async function getCachedLeaderboard<T = CachedLeaderboard>(): Promise<T | null> {
  if (!isIndexedDbSupported()) return null;
  try {
    const db = await getDb();
    const tx = db.transaction('game_leaderboards', 'readonly');
    const store = tx.objectStore('game_leaderboards');
    return new Promise((resolve) => {
      const req = store.get('team_board');
      req.onsuccess = () => resolve((req.result as T) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/* ==========================================================================
   6. Offline Sync Queue (Flush When Reconnected)
   ========================================================================== */

export async function queueOfflineScore(gameId: string, score: number): Promise<void> {
  if (!isIndexedDbSupported() || !gameId) return;
  try {
    const db = await getDb();
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');

    const record: QueuedOfflineScore = {
      gameId,
      score,
      createdAt: Date.now(),
      attempts: 0,
    };
    store.add(record);
  } catch (err) {
    console.warn('[AddaDB] queueOfflineScore error:', err);
  }
}

export async function getPendingScores(): Promise<QueuedOfflineScore[]> {
  if (!isIndexedDbSupported()) return [];
  try {
    const db = await getDb();
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeQueuedScore(queueId: number): Promise<void> {
  if (!isIndexedDbSupported() || queueId === undefined) return;
  try {
    const db = await getDb();
    const tx = db.transaction('sync_queue', 'readwrite');
    tx.objectStore('sync_queue').delete(queueId);
  } catch (err) {
    console.warn('[AddaDB] removeQueuedScore error:', err);
  }
}

/**
 * Automatically flushes all pending offline scores to the backend server.
 * Can be called upon 'online' window events or on app startup.
 */
export async function flushPendingScores(
  token: string,
  apiCaller: (path: string, token: string, init?: RequestInit) => Promise<any>
): Promise<number> {
  if (!token || !isIndexedDbSupported()) return 0;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;

  try {
    const pending = await getPendingScores();
    if (!pending || pending.length === 0) return 0;

    let syncedCount = 0;
    for (const item of pending) {
      if (!item.queueId) continue;
      try {
        if (item.gameId === 'dino-run') {
          await apiCaller('/game/score', token, {
            method: 'POST',
            body: JSON.stringify({ score: item.score }),
          });
        } else {
          await apiCaller('/game/minigames/bests', token, {
            method: 'POST',
            body: JSON.stringify({ gameId: item.gameId, score: item.score }),
          });
        }
        await removeQueuedScore(item.queueId);
        await saveGameScore(item.gameId, item.score, true);
        syncedCount += 1;
      } catch {
        // Stop batch if network fails again
        break;
      }
    }
    return syncedCount;
  } catch (err) {
    console.warn('[AddaDB] flushPendingScores error:', err);
    return 0;
  }
}
