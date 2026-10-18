import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, BarChart2, BookOpen, Check, CheckCheck, ChevronDown, CircleHelp, Clock, Copy, Download, FileText, Film, Forward, Gamepad2, Globe, Info, Link2, LoaderCircle, LogOut, MessageSquareText, Mic, MoreVertical, Paperclip, Pause, Pencil, Phone, PhoneCall, Pin, Play, Plus, QrCode, Reply, RotateCcw, Search, Send, Shield, Smile, Sparkles, Star, Trash2, Trophy, UserCheck, UserMinus, UserPlus, Users, Video, X } from 'lucide-react';
import QRCode from 'qrcode';
import './group-invites.css';
import './group-requests.css';
import './community-hub.css';
import './chat-message-actions.css';
import './chat-games.css';
import { useVoiceCalls } from './VoiceCalls';
import {
  getInboxCache,
  saveInboxCache,
  getMessages,
  saveMessages,
  getRoomDraft,
  saveRoomDraft,
} from './db/addaDb';

type DmGame = {
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
  board_state: string[];
  winning_line: number[] | null;
  score_x?: number;
  score_o?: number;
  created_at: string;
  updated_at: string;
};
export type ChatPollOption = {
  id: string;
  text: string;
  votes: number;
  hasVoted?: boolean;
};
export type ChatPoll = {
  id: string;
  question: string;
  options: ChatPollOption[];
  totalVotes: number;
  allowMultiple?: boolean;
  closed?: boolean;
};
export type ChatMessage = {
  id: string;
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
  media_type?: string | null;
  media_url?: string | null;
  media_duration_seconds?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  is_forwarded?: boolean | number | null;
  expires_at?: string | null;
  poll_id?: string | null;
  is_starred?: boolean | number | null;
  poll?: ChatPoll | null;
  is_deleted?: boolean;
  reactions?: Array<{ emoji: string; count: number; users: string[]; hasReacted?: boolean }>;
};
type SystemAnnouncement = {
  id: string;
  title: string | null;
  body: string;
  image_url?: string | null;
  created_at: string;
};
type Dm = {
  conversation_id: string;
  peer_id?: string;
  peer_username: string;
  peer_avatar_url?: string | null;
  last_message: string | null;
  last_at: string | null;
  unread_count?: number;
  pinned_message_id?: string | null;
  disappearing_duration_seconds?: number | null;
};
type Group = {
  id: string;
  name: string;
  visibility: 'public' | 'private';
  require_approval: number;
  role: 'admin' | 'member';
  joined_at: string;
  last_message: string | null;
  last_at: string | null;
  unread_count?: number;
  pinned_message_id?: string | null;
  disappearing_duration_seconds?: number | null;
  announcement_only?: number | boolean | null;
};
type RequestItem = {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_avatar_url?: string | null;
  recipient_id: string;
  recipient_username: string;
  recipient_avatar_url?: string | null;
  created_at: string;
  incoming: number;
};
type Invitation = {
  id: string;
  group_id: string;
  name: string;
  inviter_username: string;
};
type GroupJoinRequest = {
  id: string;
  group_id: string;
  name: string;
  username: string;
  created_at: string;
};
type MyGroupJoinRequest = {
  id: string;
  group_id: string;
  name: string;
  created_at: string;
};
type PublicGroup = {
  id: string;
  name: string;
  require_approval: number;
  member_count: number;
  is_member: number;
  request_pending: number;
};
type PublicUserItem = {
  id: string;
  name: string;
  username: string;
  gender?: 'male' | 'female';
  createdAt: string;
  friendStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends';
  requestId: string | null;
  conversationId: string | null;
  avatarUrl?: string | null;
};
function readGroupInviteToken() { const prefix = '#group-invite='; return location.hash.startsWith(prefix) ? location.hash.slice(prefix.length) : ''; }
function clearGroupInviteToken() {
  if (location.hash.startsWith('#group-invite='))
    history.replaceState(null, '', `${location.pathname}${location.search}`);
}
function groupInviteUrl(token: string) { const origin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev') ? 'https://student-addit.pages.dev' : location.origin; const invite = new URL('/', origin); invite.hash = `group-invite=${token}`; return invite.toString(); }
const appOrigin = location.hostname === 'student-addit.pages.dev' || location.hostname.endsWith('.student-addit.pages.dev') ? 'https://student-addit.mgp899123.workers.dev' : '';
const apiRoot = `${appOrigin}/api`;
const wsRoot = appOrigin ? appOrigin.replace(/^http/, 'ws') : `${location.protocol}//${location.host}`;
async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiRoot}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers } }); const data = await response.json().catch(() => ({})); if (!response.ok)
    throw new Error(data.error || 'Could not complete that action.'); return data as T;
}
function getMediaUrl(url: string | null | undefined, token: string): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
export function CommunityChats({
  token,
  currentUser,
  initialTargetUser,
  onClearTargetUser,
  newChatTrigger,
  onClearNewChatTrigger,
  defaultTab = 'chats',
  onActiveChatChange,
}: {
  token: string;
  currentUser?: { id: string; username: string } | null;
  initialTargetUser?: string | null;
  onClearTargetUser?: () => void;
  newChatTrigger?: number;
  onClearNewChatTrigger?: () => void;
  defaultTab?: 'chats' | 'discover' | 'requests';
  onActiveChatChange?: (hasActiveChat: boolean) => void;
}) {
  const [dms, setDms] = useState<Dm[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);
  const [myJoinRequests, setMyJoinRequests] = useState<MyGroupJoinRequest[]>([]);
  const [selected, setSelected] = useState<{
    kind: 'dm' | 'group' | 'system';
    id: string;
    label: string;
  } | null>(null);
  const [inboxTab, setInboxTab] = useState<'chats' | 'discover' | 'requests' | 'select-contact'>(defaultTab);

  // Notify parent shell when inside active chat or select-contact so top and bottom chrome are hidden
  useEffect(() => {
    onActiveChatChange?.(Boolean(selected) || inboxTab === 'select-contact');
  }, [selected, inboxTab, onActiveChatChange]);

  // Support mobile back swipe / Android system back / browser back button
  useEffect(() => {
    if (!selected) return;
    if (!window.history.state?.chatRoomOpen) {
      window.history.pushState({ chatRoomOpen: true }, '');
    }
    const handlePopState = () => {
      setSelected(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selected ? `${selected.kind}:${selected.id}` : null]);

  const handleExitChat = useCallback(() => {
    if (window.history.state?.chatRoomOpen) {
      window.history.back();
    }
    setSelected(null);
  }, []);

  // Support mobile back swipe / Android system back / browser back button when in select-contact view
  useEffect(() => {
    if (inboxTab !== 'select-contact') return;
    if (!window.history.state?.selectContactOpen) {
      window.history.pushState({ selectContactOpen: true }, '');
    }
    const handlePopState = () => {
      setInboxTab('chats');
      setContactSearch('');
      setShowContactSearch(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [inboxTab]);

  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [friendId, setFriendId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [requireApproval, setRequireApproval] = useState(false);
  const [search, setSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [publicGroups, setPublicGroups] = useState<PublicGroup[]>([]);
  const [joiningPublicGroup, setJoiningPublicGroup] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [showContactSearch, setShowContactSearch] = useState(false);

  useEffect(() => {
    if (defaultTab) {
      setInboxTab(defaultTab);
    }
  }, [defaultTab]);
  const [publicUsers, setPublicUsers] = useState<PublicUserItem[]>([]);
  const [publicUsersCursor, setPublicUsersCursor] = useState<string | null>(null);
  const [loadingPublicUsers, setLoadingPublicUsers] = useState(false);
  const [loadingMorePublicUsers, setLoadingMorePublicUsers] = useState(false);
  const [hasMorePublicUsers, setHasMorePublicUsers] = useState(true);
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null);
  const discoverSentinelRef = useRef<HTMLDivElement>(null);
  const [hubView, setHubView] = useState<'home' | 'friend' | 'create' | 'discover' | 'invite' | null>(null);
  const [createdGroup, setCreatedGroup] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [invitedUsernames, setInvitedUsernames] = useState<string[]>([]);
  const [setupInviteUrl, setSetupInviteUrl] = useState('');
  const [setupInviteCopied, setSetupInviteCopied] = useState(false);
  const [setupInviteBusy, setSetupInviteBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingInviteToken, setPendingInviteToken] = useState(readGroupInviteToken);
  const [invitePreview, setInvitePreview] = useState<{
    id: string;
    name: string;
    visibility: string;
    require_approval: number;
    member_count: number;
    is_member: boolean;
    request_pending: boolean;
  } | null>(null);
  const [invitePreviewError, setInvitePreviewError] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);

  useEffect(() => {
    if (newChatTrigger && newChatTrigger > 0) {
      setError('');
      setNotice('');
      setHubView('home');
      onClearNewChatTrigger?.();
    }
  }, [newChatTrigger, onClearNewChatTrigger]);
  const refresh = useCallback(async () => {
    const [friendData, groupData, myRequests, announcementData] = await Promise.all([
      request<{
        conversations: Dm[];
        requests: RequestItem[];
      }>('/friends', token),
      request<{
        groups: Group[];
        invitations: Invitation[];
        joinRequests: GroupJoinRequest[];
      }>('/groups', token),
      request<{
        requests: MyGroupJoinRequest[];
      }>('/group-join-requests', token),
      request<{
        announcements: SystemAnnouncement[];
      }>('/announcements', token).catch(() => ({ announcements: [] as SystemAnnouncement[] })),
    ]);
    setDms(friendData.conversations);
    setRequests(friendData.requests);
    setGroups(groupData.groups);
    setInvitations(groupData.invitations);
    setJoinRequests(groupData.joinRequests);
    setMyJoinRequests(myRequests.requests);
    setAnnouncements(announcementData.announcements || []);
    void saveInboxCache({
      dms: friendData.conversations,
      groups: groupData.groups,
      announcements: announcementData.announcements || [],
      requests: friendData.requests,
    });
  }, [token]);

  // Instant cold-start from IndexedDB
  useEffect(() => {
    void getInboxCache().then((cached) => {
      if (!cached) return;
      if (cached.dms && cached.dms.length > 0) setDms((prev) => (prev.length === 0 ? cached.dms : prev));
      if (cached.groups && cached.groups.length > 0) setGroups((prev) => (prev.length === 0 ? cached.groups : prev));
      if (cached.announcements && cached.announcements.length > 0) setAnnouncements((prev) => (prev.length === 0 ? cached.announcements : prev));
      if (cached.requests && cached.requests.length > 0) {
        const cachedReqs = cached.requests;
        setRequests((prev) => (prev.length === 0 ? cachedReqs : prev));
      }
    });
  }, []);

  useEffect(() => { void refresh().catch((e) => setError(e.message)); }, [refresh]);
  useEffect(() => {
    if (!initialTargetUser) return;
    const target = initialTargetUser.toLowerCase();
    const existing = dms.find(d => d.peer_username.toLowerCase() === target);
    if (existing) {
      setSelected({ kind: 'dm', id: existing.conversation_id, label: existing.peer_username });
      onClearTargetUser?.();
    } else {
      setFriendId(initialTargetUser);
      setHubView('friend');
      onClearTargetUser?.();
    }
  }, [initialTargetUser, dms, onClearTargetUser]);
  useEffect(() => {
    const updateInvite = () => {
      const next = readGroupInviteToken(); if (next) {
        setPendingInviteToken(next);
        setInvitePreview(null);
        setInvitePreviewError('');
      }
    }; window.addEventListener('hashchange', updateInvite); return () => window.removeEventListener('hashchange', updateInvite);
  }, []);
  useEffect(() => {
    const query = search.trim(); if (query.length < 2) {
      setPublicGroups([]);
      return;
    } let cancelled = false; const timer = setTimeout(() => {
      void request<{
        groups: PublicGroup[];
      }>(`/groups/discover?q=${encodeURIComponent(query)}`, token).then((data) => {
        if (!cancelled)
          setPublicGroups(data.groups);
      }).catch((e) => {
        if (!cancelled)
          setError(e.message);
      });
    }, 250); return () => { cancelled = true; clearTimeout(timer); };
  }, [search, token]);
  useEffect(() => {
    if (!pendingInviteToken)
      return; setInvitePreview(null); setInvitePreviewError(''); void request<{
        group: NonNullable<typeof invitePreview>;
      }>('/group-invites/preview', token, { method: 'POST', body: JSON.stringify({ token: pendingInviteToken }) }).then((data) => setInvitePreview(data.group)).catch((e) => setInvitePreviewError(e.message || 'This invite link is no longer available.'));
  }, [pendingInviteToken, previewRetry, token]);
  const submit = async (event: FormEvent, action: () => Promise<void>) => {
    event.preventDefault(); setError(''); setNotice(''); try {
      await action();
    }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Could not complete that action.');
      }
  };
  const sendRequest = async (event: FormEvent) => submit(event, async () => { await request('/friend-requests', token, { method: 'POST', body: JSON.stringify({ username: friendId }) }); setFriendId(''); setHubView(null); setInboxTab('requests'); setNotice('Friend request sent. You can follow its status in Requests.'); await refresh(); });
  const createGroup = async (event: FormEvent) => submit(event, async () => {
    const data = await request<{
      group: {
        id: string;
        name: string;
      };
    }>('/groups', token, { method: 'POST', body: JSON.stringify({ name: groupName, visibility, requireApproval }) }); setCreatedGroup(data.group); setGroupName(''); setInviteUsername(''); setInvitedUsernames([]); setSetupInviteUrl(''); setHubView('invite'); setNotice('Your group is ready. Invite people now or skip this step.'); await refresh();
  });
  const sendGroupInvitation = async (event: FormEvent) => submit(event, async () => {
    if (!createdGroup)
      return; const username = inviteUsername.trim().replace(/^#/, ''); await request('/groups/' + encodeURIComponent(createdGroup.id) + '/invitations', token, { method: 'POST', body: JSON.stringify({ username }) }); setInvitedUsernames((current) => current.includes(username) ? current : [...current, username]); setInviteUsername(''); setNotice('Invitation sent to #' + username + '.');
  });
  const createSetupInviteLink = async () => {
    if (!createdGroup || setupInviteBusy)
      return; setSetupInviteBusy(true); setError(''); try {
        const data = await request<{
          inviteLink: {
            token: string;
          };
        }>('/groups/' + encodeURIComponent(createdGroup.id) + '/invite-links', token, { method: 'POST' });
        setSetupInviteUrl(groupInviteUrl(data.inviteLink.token));
        setNotice('Invite link created. Anyone with this link can preview and join the group.');
      }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite link.');
    }
    finally {
      setSetupInviteBusy(false);
    }
  };
  const copySetupInvite = async () => {
    if (!setupInviteUrl)
      return; try {
        await navigator.clipboard.writeText(setupInviteUrl);
        setSetupInviteCopied(true);
        setTimeout(() => setSetupInviteCopied(false), 1800);
      }
    catch {
      const field = document.createElement('textarea');
      field.value = setupInviteUrl;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (copied) {
        setSetupInviteCopied(true);
        setTimeout(() => setSetupInviteCopied(false), 1800);
      }
      else
        setError('Copy was blocked. Select and copy the invite link instead.');
    }
  };
  const finishGroupSetup = useCallback(async () => {
    if (!createdGroup)
      return; const group = createdGroup; setHubView(null); setCreatedGroup(null); setSelected({ kind: 'group', id: group.id, label: group.name }); setNotice('“' + group.name + '” is ready.'); try {
        await refresh();
      }
    catch (e) {
      setError(e instanceof Error ? e.message : 'The group is open, but its list could not be refreshed.');
    }
  }, [createdGroup, refresh]);
  useEffect(() => {
    if (!hubView)
      return; const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape')
          return; if (hubView === 'invite' && createdGroup)
          void finishGroupSetup();
        else
          setHubView(null);
      }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape);
  }, [hubView, createdGroup, finishGroupSetup]);
  const joinPublicGroup = async (group: PublicGroup) => {
    setJoiningPublicGroup(group.id); setError(''); setNotice(''); try {
      const data = await request<{
        status: string;
        group: {
          id: string;
          name: string;
        };
      }>('/groups/' + encodeURIComponent(group.id) + '/join', token, { method: 'POST' });
      setPublicGroups((current) => current.map((item) => item.id === group.id ? { ...item, is_member: data.status === 'joined' || data.status === 'member' ? 1 : item.is_member, request_pending: data.status === 'pending' ? 1 : item.request_pending } : item));
      await refresh();
      if (data.status === 'joined' || data.status === 'member') {
        setSelected({ kind: 'group', id: data.group.id, label: data.group.name });
        setHubView(null);
        setNotice('You joined ' + data.group.name + '.');
      }
      else {
        setHubView(null);
        setInboxTab('requests');
        setNotice('Your request to join ' + data.group.name + ' is waiting for an admin.');
      }
    }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Could not join this group.');
      }
      finally {
      setJoiningPublicGroup('');
    }
  };
  const joinFromInvite = async () => {
    if (!pendingInviteToken)
      return; setJoiningInvite(true); setError(''); try {
        const data = await request<{
          status: string;
          group: {
            id: string;
            name: string;
          };
        }>('/group-invites/join', token, { method: 'POST', body: JSON.stringify({ token: pendingInviteToken }) });
        clearGroupInviteToken();
        setPendingInviteToken('');
        setInvitePreview(null);
        await refresh();
        if (data.status === 'joined' || data.status === 'member') {
          setSelected({ kind: 'group', id: data.group.id, label: data.group.name });
          setNotice(data.status === 'member' ? `You’re already in ${data.group.name}.` : `You joined ${data.group.name}.`);
        }
        else
          setNotice(`Your request to join ${data.group.name} is waiting for an admin.`);
      }
    catch (e) {
      setInvitePreviewError(e instanceof Error ? e.message : 'This invite link is no longer available.');
    }
    finally {
      setJoiningInvite(false);
    }
  };
  const respond = async (type: 'friend-requests' | 'group-invitations', item: {
    id: string;
  }, action: 'accept' | 'decline') => {
    setError(''); try {
      await request('/' + type + '/' + encodeURIComponent(item.id) + '/respond', token, { method: 'POST', body: JSON.stringify({ action }) });
      await refresh();
      if (type === 'group-invitations' && action === 'accept') {
        const invitation = item as Invitation;
        setSelected({ kind: 'group', id: invitation.group_id, label: invitation.name });
        setInboxTab('chats');
      }
    }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Could not respond.');
      }
  };
  const respondJoinRequest = async (item: GroupJoinRequest, action: 'accept' | 'decline') => {
    setError(''); try {
      await request(`/group-join-requests/${encodeURIComponent(item.id)}/respond`, token, { method: 'POST', body: JSON.stringify({ action }) });
      await refresh();
      if (action === 'accept')
        setSelected({ kind: 'group', id: item.group_id, label: item.name });
    }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update the join request.');
      }
  };
  const cancelMyJoinRequest = async (item: MyGroupJoinRequest) => {
    setError(''); try {
      await request(`/group-join-requests/${encodeURIComponent(item.id)}`, token, { method: 'DELETE' });
      setMyJoinRequests((current) => current.filter((requestItem) => requestItem.id !== item.id));
      setPublicGroups((current) => current.map((group) => group.id === item.group_id ? { ...group, request_pending: 0 } : group));
      setNotice(`Your request for ${item.name} was withdrawn.`);
    }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel the request.');
      }
  };
  const cancelFriendRequest = async (item: RequestItem) => {
    setError(''); try {
      await request('/friend-requests/' + encodeURIComponent(item.id), token, { method: 'DELETE' });
      await refresh();
      setNotice('Your request to #' + item.recipient_username + ' was cancelled.');
    }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel the friend request.');
      }
  };
  const loadPublicUsers = useCallback(async (searchQuery: string, cursorToUse?: string | null, isInitial = false) => {
    if (isInitial) setLoadingPublicUsers(true);
    else setLoadingMorePublicUsers(true);
    try {
      const params = new URLSearchParams({ limit: '15' });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (cursorToUse) params.set('cursor', cursorToUse);
      const data = await request<{ users: PublicUserItem[]; nextCursor: string | null }>(`/public-users?${params.toString()}`, token);
      if (isInitial) {
        setPublicUsers(data.users);
      } else {
        setPublicUsers((prev) => {
          const existingIds = new Set(prev.map((u) => u.id));
          const newItems = data.users.filter((u) => !existingIds.has(u.id));
          return [...prev, ...newItems];
        });
      }
      setPublicUsersCursor(data.nextCursor);
      setHasMorePublicUsers(!!data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load community members.');
    } finally {
      setLoadingPublicUsers(false);
      setLoadingMorePublicUsers(false);
    }
  }, [token]);
  useEffect(() => {
    const query = chatSearch.trim();
    if (!query) {
      setPublicUsers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        void loadPublicUsers(query, null, true);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatSearch, loadPublicUsers]);
  useEffect(() => {
    if (inboxTab !== 'discover' || !hasMorePublicUsers || loadingPublicUsers || loadingMorePublicUsers) return;
    const sentinel = discoverSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMorePublicUsers && !loadingPublicUsers && !loadingMorePublicUsers && publicUsersCursor) {
          void loadPublicUsers(chatSearch, publicUsersCursor, false);
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [inboxTab, hasMorePublicUsers, loadingPublicUsers, loadingMorePublicUsers, publicUsersCursor, chatSearch, loadPublicUsers]);
  const handleSendFriendRequest = async (targetUser: PublicUserItem) => {
    setActionBusyUserId(targetUser.id);
    setError('');
    try {
      const res = await request<{ ok: boolean; requestId?: string }>('/friend-requests', token, {
        method: 'POST',
        body: JSON.stringify({ username: targetUser.username }),
      });
      setPublicUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, friendStatus: 'pending_sent', requestId: res.requestId ?? null }
            : u
        )
      );
      setNotice(`Friend request sent to #${targetUser.username}.`);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send friend request.');
    } finally {
      setActionBusyUserId(null);
    }
  };
  const handleCancelFriendRequest = async (targetUser: PublicUserItem) => {
    if (!targetUser.requestId) return;
    setActionBusyUserId(targetUser.id);
    setError('');
    try {
      await request(`/friend-requests/${encodeURIComponent(targetUser.requestId)}`, token, {
        method: 'DELETE',
      });
      setPublicUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, friendStatus: 'none', requestId: null }
            : u
        )
      );
      setNotice(`Request to #${targetUser.username} cancelled.`);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel request.');
    } finally {
      setActionBusyUserId(null);
    }
  };
  const handleRespondFriendRequest = async (targetUser: PublicUserItem, action: 'accept' | 'decline') => {
    if (!targetUser.requestId) return;
    setActionBusyUserId(targetUser.id);
    setError('');
    try {
      const res = await request<{ ok: boolean; status: string; conversationId?: string }>(
        `/friend-requests/${encodeURIComponent(targetUser.requestId)}/respond`,
        token,
        { method: 'POST', body: JSON.stringify({ action }) }
      );
      if (action === 'accept') {
        setPublicUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id
              ? { ...u, friendStatus: 'friends', conversationId: res.conversationId ?? null }
              : u
          )
        );
        setNotice(`You and #${targetUser.username} are now connected!`);
      } else {
        setPublicUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id
              ? { ...u, friendStatus: 'none', requestId: null }
              : u
          )
        );
        setNotice(`Request from #${targetUser.username} declined.`);
      }
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not respond to request.');
    } finally {
      setActionBusyUserId(null);
    }
  };
  const handleOpenFriendChat = (targetUser: PublicUserItem) => {
    if (targetUser.conversationId) {
      setSelected({ kind: 'dm', id: targetUser.conversationId, label: `#${targetUser.username}` });
      setInboxTab('chats');
    } else {
      const existingDm = dms.find((d) => d.peer_username === targetUser.username);
      if (existingDm) {
        setSelected({ kind: 'dm', id: existingDm.conversation_id, label: `#${targetUser.username}` });
        setInboxTab('chats');
      } else {
        void refresh().then(() => {
          const freshDm = dms.find((d) => d.peer_username === targetUser.username);
          if (freshDm) {
            setSelected({ kind: 'dm', id: freshDm.conversation_id, label: `#${targetUser.username}` });
            setInboxTab('chats');
          }
        });
      }
    }
  };
  const handleOpenSelfChat = async () => {
    if (!currentUser) return;
    try {
      const res = await request<{ ok?: boolean; conversationId?: string }>('/conversations/self', token, { method: 'POST' });
      if (res.conversationId) {
        setSelected({ kind: 'dm', id: res.conversationId, label: `${currentUser.username} (You)` });
        setInboxTab('chats');
        setHubView(null);
        void refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open notes with yourself.');
    }
  };
  const handleSelectChat = (item: { kind: 'dm' | 'group' | 'system'; id: string; label: string }) => {
    if (item.kind === 'dm') {
      setDms((prev) => prev.map((d) => d.conversation_id === item.id ? { ...d, unread_count: 0 } : d));
      void request(`/conversations/${encodeURIComponent(item.id)}/read`, token, { method: 'POST' }).catch(() => {});
    } else if (item.kind === 'group') {
      setGroups((prev) => prev.map((g) => g.id === item.id ? { ...g, unread_count: 0 } : g));
      void request(`/groups/${encodeURIComponent(item.id)}/read`, token, { method: 'POST' }).catch(() => {});
    }
    setSelected({ kind: item.kind, id: item.id, label: item.label });
  };
  const PINNED_STORAGE_KEY = 'student_adda_pinned_chats';
  const [pinnedChats, setPinnedChats] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem(PINNED_STORAGE_KEY);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });

  const togglePinChat = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPinnedChats((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [key, ...prev];
      try { localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [inboxFolder, setInboxFolder] = useState<'all' | 'unread' | 'direct' | 'groups' | 'starred'>('all');

  const latestAnnouncement = announcements[0];
  const officialInboxItem = {
    kind: 'system' as const,
    id: 'student-adda',
    label: 'STUDENT ADDA',
    preview: latestAnnouncement
      ? (latestAnnouncement.title ? `${latestAnnouncement.title} — ${latestAnnouncement.body}` : latestAnnouncement.body)
      : 'Official updates, feature releases & community announcements',
    sortAt: latestAnnouncement?.created_at || '9999-99-99T99:99:99Z',
    icon: 'official' as const,
    avatarUrl: null as string | null,
    unreadCount: 0,
    isOfficial: true,
  };
  const rawUserChats = [
    ...groups.map((group) => ({
      kind: 'group' as const,
      id: group.id,
      label: group.name,
      preview: group.last_message || (group.role === 'admin' ? 'Group · you’re an admin' : 'Group conversation'),
      sortAt: group.last_at || group.joined_at,
      icon: 'group' as const,
      avatarUrl: null as string | null,
      unreadCount: Number(group.unread_count ?? 0),
      isOfficial: false,
    })),
    ...dms.map((dm) => ({
      kind: 'dm' as const,
      id: dm.conversation_id,
      label: `#${dm.peer_username}`,
      preview: dm.last_message || 'Private conversation',
      sortAt: dm.last_at || '',
      icon: dm.peer_username[0]?.toUpperCase() || '#',
      avatarUrl: dm.peer_avatar_url || null,
      unreadCount: Number(dm.unread_count ?? 0),
      isOfficial: false,
    })),
  ];

  const totalUnreadCount = rawUserChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const userChats = rawUserChats
    .filter((item) => `${item.label} ${item.preview}`.toLowerCase().includes(chatSearch.trim().toLowerCase()))
    .filter((item) => {
      if (inboxFolder === 'unread') return item.unreadCount > 0;
      if (inboxFolder === 'direct') return item.kind === 'dm';
      if (inboxFolder === 'groups') return item.kind === 'group';
      if (inboxFolder === 'starred') return pinnedChats.includes(`${item.kind}:${item.id}`);
      return true;
    })
    .sort((a, b) => {
      const aPinned = pinnedChats.includes(`${a.kind}:${a.id}`);
      const bPinned = pinnedChats.includes(`${b.kind}:${b.id}`);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return b.sortAt.localeCompare(a.sortAt);
    });

  const matchesOfficial = inboxFolder === 'all' && (!chatSearch.trim() || 'student adda'.includes(chatSearch.trim().toLowerCase()) || officialInboxItem.preview.toLowerCase().includes(chatSearch.trim().toLowerCase()));
  const inbox = matchesOfficial ? [officialInboxItem, ...userChats] : userChats;
  const requestCount = requests.length + invitations.length + joinRequests.length + myJoinRequests.length;
  return <div className={"page-wrap community-chat-page " + (selected ? 'has-selected-chat' : '')}>    <div className="community-grid">
    <section className="community-inbox">
      {inboxTab === 'chats' && (
        <div className="community-inbox-topbar">
          <label className="community-inbox-search whatsapp-search">
            <Search size={18} />
            <input
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder="Search chats, people, groups..."
              aria-label="Search chats, people, groups"
            />
            {chatSearch && (
              <button
                type="button"
                onClick={() => { setChatSearch(''); setPublicUsers([]); }}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </label>
          {requestCount > 0 && (
            <button
              type="button"
              className="community-requests-compact-chip"
              onClick={() => { setError(''); setNotice(''); setInboxTab('requests'); }}
              title={`${requestCount} pending requests`}
            >
              <Users size={14} />
              <span>Requests</span>
              <span className="community-unread-badge mini">{requestCount}</span>
            </button>
          )}
        </div>
      )}

      {inboxTab === 'chats' && !chatSearch.trim() && (
        <div className="inbox-folder-tabs" role="tablist" aria-label="Chat folders">
          <button
            type="button"
            className={`inbox-folder-pill ${inboxFolder === 'all' ? 'active' : ''}`}
            onClick={() => setInboxFolder('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`inbox-folder-pill ${inboxFolder === 'unread' ? 'active' : ''}`}
            onClick={() => setInboxFolder('unread')}
          >
            Unread {totalUnreadCount > 0 && <span className="folder-count-badge">{totalUnreadCount}</span>}
          </button>
          <button
            type="button"
            className={`inbox-folder-pill ${inboxFolder === 'direct' ? 'active' : ''}`}
            onClick={() => setInboxFolder('direct')}
          >
            Direct
          </button>
          <button
            type="button"
            className={`inbox-folder-pill ${inboxFolder === 'groups' ? 'active' : ''}`}
            onClick={() => setInboxFolder('groups')}
          >
            Groups
          </button>
          <button
            type="button"
            className={`inbox-folder-pill ${inboxFolder === 'starred' ? 'active' : ''}`}
            onClick={() => setInboxFolder('starred')}
          >
            Pinned
          </button>
        </div>
      )}

      {!hubView && (error || notice) && <div className={"study-status " + (error ? 'error' : '')}>{error || notice}</div>}
      {inboxTab === 'chats' ? (
        <div className="community-inbox-list" aria-label="Conversations">
          {chatSearch.trim() && inbox.length > 0 && (
            <div className="community-section-label">CHATS</div>
          )}
          {inbox.map((item) => (
            <button
              className={"community-inbox-row " + (selected?.kind === item.kind && selected.id === item.id ? 'selected' : '') + (item.isOfficial ? ' is-official-row' : '')}
              key={item.kind + ':' + item.id}
              onClick={() => handleSelectChat(item)}
            >
              <span className={"community-inbox-avatar " + (item.icon === 'group' ? 'group' : item.icon === 'official' ? 'official' : '')}>
                {item.icon === 'official' ? <Sparkles size={20} /> : item.avatarUrl ? <img src={item.avatarUrl} alt={item.label} className="inbox-avatar-img" /> : item.icon === 'group' ? <Users size={20} /> : item.icon}
              </span>
              <span className="community-inbox-copy">
                <span>
                  <b className="inbox-title-with-badge">
                    {pinnedChats.includes(`${item.kind}:${item.id}`) && <Pin size={12} className="inbox-pinned-icon" />}
                    {item.label}
                    {item.isOfficial && <span className="official-verified-badge mini" title="Verified Official Channel"><Check size={9} strokeWidth={3} /></span>}
                  </b>
                  <time>{item.isOfficial ? 'OFFICIAL' : formatInboxTime(item.sortAt)}</time>
                </span>
                <span className="community-inbox-preview-row">
                  <small>{item.preview}</small>
                  {item.unreadCount > 0 && <span className="community-unread-badge" aria-label={`${item.unreadCount} unread`}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</span>}
                  {!item.isOfficial && (
                    <button
                      type="button"
                      className="inbox-row-pin-action"
                      onClick={(e) => togglePinChat(`${item.kind}:${item.id}`, e)}
                      title={pinnedChats.includes(`${item.kind}:${item.id}`) ? 'Unpin chat' : 'Pin chat to top'}
                      aria-label={pinnedChats.includes(`${item.kind}:${item.id}`) ? 'Unpin chat' : 'Pin chat to top'}
                    >
                      <Pin size={12} className={pinnedChats.includes(`${item.kind}:${item.id}`) ? 'is-pinned' : ''} />
                    </button>
                  )}
                </span>
              </span>
            </button>
          ))}

          {/* Integrated Discover People when searching */}
          {chatSearch.trim().length >= 1 && (
            <div className="community-search-discover-block">
              <div className="community-section-label">
                <span>DISCOVER PEOPLE ON ADDA</span>
                {loadingPublicUsers && <LoaderCircle className="spin" size={12} />}
              </div>
              {publicUsers.length > 0 ? (
                publicUsers.map((person) => (
                  <article className="community-people-row" key={person.id}>
                    <span className="community-people-avatar">
                      {person.avatarUrl ? <img src={person.avatarUrl} alt={person.username} className="person-avatar-img" /> : (person.username[0]?.toUpperCase() || '?')}
                    </span>
                    <div className="community-people-info">
                      <b className="community-people-name">#{person.username}</b>
                      <span className="community-people-handle">Public member · adda ID</span>
                    </div>
                    <div className="community-people-actions">
                      {person.friendStatus === 'friends' ? (
                        <button type="button" className="community-people-action-btn friends" onClick={() => handleOpenFriendChat(person)}><MessageSquareText size={13} /> Chat</button>
                      ) : person.friendStatus === 'pending_sent' ? (
                        <button type="button" className="community-people-action-btn pending" disabled={actionBusyUserId === person.id} onClick={() => void handleCancelFriendRequest(person)} title="Click to cancel"><UserCheck size={13} /> Requested</button>
                      ) : person.friendStatus === 'pending_received' ? (
                        <div className="community-people-split-actions">
                          <button type="button" className="community-people-action-btn accept" disabled={actionBusyUserId === person.id} onClick={() => void handleRespondFriendRequest(person, 'accept')}><Check size={13} /> Accept</button>
                          <button type="button" className="community-people-action-btn decline" disabled={actionBusyUserId === person.id} onClick={() => void handleRespondFriendRequest(person, 'decline')}>Decline</button>
                        </div>
                      ) : (
                        <button type="button" className="community-people-action-btn add" disabled={actionBusyUserId === person.id} onClick={() => void handleSendFriendRequest(person)}><UserPlus size={13} /> Add</button>
                      )}
                    </div>
                  </article>
                ))
              ) : !loadingPublicUsers && !inbox.length ? (
                <div className="community-inbox-empty">
                  <Search size={22} />
                  <strong>No chats or people found</strong>
                  <span>Try searching for another name or adda ID.</span>
                </div>
              ) : null}
            </div>
          )}

          {!chatSearch.trim() && !inbox.length && (
            <div className="community-inbox-empty">
              <MessageSquareText size={24} />
              <strong>Your chats will appear here</strong>
              <span>Start a conversation or find people on Adda.</span>
            </div>
          )}

          {!chatSearch.trim() && (
            <div className="community-inbox-footer">
              <button
                type="button"
                className="community-discover-explore-btn"
                onClick={() => { setError(''); setNotice(''); setHubView('home'); }}
              >
                <Globe size={15} /> Find more people &amp; groups
              </button>
            </div>
          )}
          <button
            type="button"
            className="student-addit-fab"
            onClick={() => { setError(''); setNotice(''); setContactSearch(''); setShowContactSearch(false); setInboxTab('select-contact'); }}
            aria-label="Select contact"
            title="Select contact"
          >
            <Pencil size={22} />
          </button>
        </div>
      ) : inboxTab === 'select-contact' ? (
        <section className="whatsapp-select-contact-view" aria-label="Select contact">
          <div className="wa-select-contact-topbar">
            <button
              type="button"
              className="wa-back-btn"
              onClick={() => {
                if (window.history.state?.selectContactOpen) {
                  window.history.back();
                }
                setInboxTab('chats');
                setContactSearch('');
                setShowContactSearch(false);
              }}
              aria-label="Back to chats"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="wa-title-box">
              <h2>Select contact</h2>
              <span className="wa-subtitle">
                {dms.length + (currentUser ? 1 : 0)} contacts
              </span>
            </div>
            <div className="wa-topbar-actions">
              <button
                type="button"
                className={`wa-action-btn ${showContactSearch ? 'active' : ''}`}
                onClick={() => {
                  setShowContactSearch((prev) => {
                    if (prev) setContactSearch('');
                    return !prev;
                  });
                }}
                aria-label="Search contacts"
                title="Search contacts"
              >
                <Search size={19} />
              </button>
              <button
                type="button"
                className="wa-action-btn"
                onClick={() => { setInboxTab('discover'); }}
                aria-label="Discover accounts"
                title="Discover accounts"
              >
                <MoreVertical size={19} />
              </button>
            </div>
          </div>

          {showContactSearch && (
            <div className="wa-search-input-wrapper">
              <Search size={16} />
              <input
                autoFocus
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts by name or ID..."
                aria-label="Search contacts"
              />
              <button
                type="button"
                className="wa-search-clear-btn"
                onClick={() => {
                  if (contactSearch) {
                    setContactSearch('');
                  } else {
                    setShowContactSearch(false);
                  }
                }}
                aria-label={contactSearch ? 'Clear search text' : 'Close search'}
                title={contactSearch ? 'Clear search text' : 'Close search'}
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div className="wa-select-contact-content">
            <button
              type="button"
              className="wa-contact-action-row"
              onClick={() => { setHubView('create'); }}
            >
              <div className="wa-action-circle green">
                <UserPlus size={19} />
              </div>
              <span className="wa-action-text">New group</span>
            </button>

            <button
              type="button"
              className="wa-contact-action-row"
              onClick={() => { setHubView('friend'); }}
            >
              <div className="wa-action-circle green">
                <UserPlus size={19} />
              </div>
              <span className="wa-action-text">New contact</span>
              <span className="wa-action-trailing-icon" title="Add contact by ID">
                <QrCode size={18} />
              </span>
            </button>

            <button
              type="button"
              className="wa-contact-action-row"
              onClick={() => { setHubView('discover'); }}
            >
              <div className="wa-action-circle green">
                <Users size={19} />
              </div>
              <span className="wa-action-text">New community</span>
            </button>

            <div className="wa-contacts-section-header">
              <span>Contacts on Student Addit</span>
            </div>

            {currentUser && !contactSearch.trim() && (
              <div
                className="wa-contact-person-row self-row"
                onClick={() => void handleOpenSelfChat()}
              >
                <div className="wa-person-avatar self">
                  {currentUser.username[0]?.toUpperCase() || 'Y'}
                </div>
                <div className="wa-person-info">
                  <strong className="wa-person-name">{currentUser.username} <small className="you-tag">(You)</small></strong>
                  <span className="wa-person-status">Message yourself</span>
                </div>
              </div>
            )}

            {dms
              .filter((d) => !contactSearch.trim() || d.peer_username.toLowerCase().includes(contactSearch.toLowerCase()))
              .map((dm) => (
                <div
                  key={dm.conversation_id}
                  className="wa-contact-person-row"
                  onClick={() => {
                    setSelected({ kind: 'dm', id: dm.conversation_id, label: `#${dm.peer_username}` });
                    setInboxTab('chats');
                    setHubView(null);
                  }}
                >
                  <div className="wa-person-avatar">
                    {dm.peer_avatar_url ? (
                      <img src={dm.peer_avatar_url} alt={dm.peer_username} />
                    ) : (
                      dm.peer_username.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="wa-person-info">
                    <strong className="wa-person-name">#{dm.peer_username}</strong>
                    <span className="wa-person-status">{dm.last_message ? dm.last_message.slice(0, 35) : 'Hey there! I am using Student Addit.'}</span>
                  </div>
                </div>
              ))}

            {publicUsers
              .filter((u) => u.username !== currentUser?.username && (!dms.some((d) => d.peer_username === u.username)) && (!contactSearch.trim() || u.username.toLowerCase().includes(contactSearch.toLowerCase()) || u.name.toLowerCase().includes(contactSearch.toLowerCase())))
              .map((u) => (
                <div
                  key={u.id}
                  className="wa-contact-person-row"
                  onClick={() => {
                    handleOpenFriendChat(u);
                    setHubView(null);
                  }}
                >
                  <div className="wa-person-avatar public-user">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.username} />
                    ) : (
                      u.username.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="wa-person-info">
                    <strong className="wa-person-name">{u.name} <small style={{ color: '#8696a0', fontWeight: 400 }}>#{u.username}</small></strong>
                    <span className="wa-person-status">Student Addit member</span>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : inboxTab === 'discover' ? <section className="community-discover-people-view" aria-label="Discover public accounts">
        <div className="community-discover-people-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="community-view-back-btn" onClick={() => setInboxTab('chats')} aria-label="Back to chats"><ArrowLeft size={16} /></button>
            <div><span className="eyebrow">COMMUNITY</span><h2>Public accounts</h2></div>
          </div>
          <span className="community-discover-count-badge">{publicUsers.length}</span>
        </div>
        <div className="community-discover-people-list" role="feed">
          {loadingPublicUsers && !publicUsers.length ? (
            <div className="community-people-loading"><LoaderCircle className="spin" size={24} /><span>Finding people on adda…</span></div>
          ) : publicUsers.length === 0 ? (
            <div className="community-inbox-empty"><Globe size={23} /><strong>{chatSearch ? 'No accounts match' : 'No public accounts yet'}</strong><span>{chatSearch ? 'Try searching another ID.' : 'Public accounts will appear here.'}</span></div>
          ) : (
            <>
              {publicUsers.map((person) => (
                <article className="community-people-card" key={person.id}>
                  <span className="community-people-avatar">
                    {person.avatarUrl ? <img src={person.avatarUrl} alt={person.username} className="person-avatar-img" /> : (person.username[0]?.toUpperCase() || '?')}
                  </span>
                  <div className="community-people-info">
                    <div className="community-people-name-line">
                      <b className="community-people-name">#{person.username}</b>
                      <span className="community-people-badge">Public</span>
                    </div>
                    <span className="community-people-handle">adda ID</span>
                  </div>
                  <div className="community-people-actions">
                    {person.friendStatus === 'friends' ? (
                      <button type="button" className="community-people-action-btn friends" onClick={() => handleOpenFriendChat(person)}><MessageSquareText size={13} /> Chat</button>
                    ) : person.friendStatus === 'pending_sent' ? (
                      <button type="button" className="community-people-action-btn pending" disabled={actionBusyUserId === person.id} onClick={() => void handleCancelFriendRequest(person)} title="Click to cancel"><UserCheck size={13} /> Requested</button>
                    ) : person.friendStatus === 'pending_received' ? (
                      <div className="community-people-split-actions">
                        <button type="button" className="community-people-action-btn accept" disabled={actionBusyUserId === person.id} onClick={() => void handleRespondFriendRequest(person, 'accept')}><Check size={13} /> Accept</button>
                        <button type="button" className="community-people-action-btn decline" disabled={actionBusyUserId === person.id} onClick={() => void handleRespondFriendRequest(person, 'decline')}>Decline</button>
                      </div>
                    ) : (
                      <button type="button" className="community-people-action-btn add" disabled={actionBusyUserId === person.id} onClick={() => void handleSendFriendRequest(person)}><UserPlus size={13} /> Add</button>
                    )}
                  </div>
                </article>
              ))}
              {hasMorePublicUsers && (
                <div ref={discoverSentinelRef} className="community-discover-sentinel">
                  {loadingMorePublicUsers ? (
                    <div className="community-people-loading-more"><LoaderCircle className="spin" size={16} /><span>Loading more accounts…</span></div>
                  ) : (
                    <button type="button" className="community-load-more-btn" onClick={() => void loadPublicUsers(chatSearch, publicUsersCursor, false)}>Load more</button>
                  )}
                </div>
              )}
              {!hasMorePublicUsers && publicUsers.length > 0 && (
                <div className="community-discover-end"><span>You’ve seen all public accounts ({publicUsers.length})</span></div>
              )}
            </>
          )}
        </div>
      </section> : <section className="community-requests-view" aria-label="Requests and invitations">
        <div className="community-requests-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="community-view-back-btn" onClick={() => setInboxTab('chats')} aria-label="Back to chats"><ArrowLeft size={16} /></button>
            <div><span className="eyebrow">STAY IN THE LOOP</span><h2>Requests &amp; invites</h2></div>
          </div>
          <span className="community-requests-total">{requestCount}</span>
        </div>
        {!!(requests.filter((item) => !!item.incoming).length) && <section className="community-request-section"><h3>Friend requests <span>{requests.filter((item) => !!item.incoming).length}</span></h3>
          {requests.filter((item) => !!item.incoming).map((item) => <article className="community-request-card" key={item.id}>
            <span className="community-request-avatar">
              {item.sender_avatar_url ? <img src={item.sender_avatar_url} alt={item.sender_username} className="request-avatar-img" /> : (item.sender_username[0]?.toUpperCase() || '?')}
            </span>
            <div className="community-request-copy"><b>#{item.sender_username}</b><small>Wants to chat with you</small></div>
            <div className="community-request-actions"><button type="button" className="community-request-accept" onClick={() => void respond('friend-requests', item, 'accept')}><Check size={14} /> Accept</button><button type="button" className="community-request-decline" onClick={() => void respond('friend-requests', item, 'decline')}>Decline</button></div>
          </article>)}
        </section>}
        {!!invitations.length && <section className="community-request-section"><h3>Group invitations <span>{invitations.length}</span></h3>
          {invitations.map((item) => <article className="community-request-card" key={item.id}><span className="community-request-avatar group"><Users size={17} /></span><div className="community-request-copy"><b>{item.name}</b><small>Invited by #{item.inviter_username}</small></div><div className="community-request-actions"><button type="button" className="community-request-accept" onClick={() => void respond('group-invitations', item, 'accept')}><Check size={14} /> Join</button><button type="button" className="community-request-decline" onClick={() => void respond('group-invitations', item, 'decline')}>Decline</button></div></article>)}
        </section>}
        {!!joinRequests.length && <section className="community-request-section"><h3>Group join requests <span>{joinRequests.length}</span></h3>
          {joinRequests.map((item) => <article className="community-request-card" key={item.id}><span className="community-request-avatar">{item.username[0]?.toUpperCase() || '?'}</span><div className="community-request-copy"><b>#{item.username}</b><small>Wants to join <strong>{item.name}</strong></small></div><div className="community-request-actions"><button type="button" className="community-request-accept" onClick={() => void respondJoinRequest(item, 'accept')}><Check size={14} /> Approve</button><button type="button" className="community-request-decline" onClick={() => void respondJoinRequest(item, 'decline')}>Decline</button></div></article>)}
        </section>}
        {!!requests.filter((item) => !item.incoming).length && <section className="community-request-section"><h3>Sent friend requests <span>{requests.filter((item) => !item.incoming).length}</span></h3>
          {requests.filter((item) => !item.incoming).map((item) => <article className="community-request-card outgoing" key={item.id}>
            <span className="community-request-avatar">
              {item.recipient_avatar_url ? <img src={item.recipient_avatar_url} alt={item.recipient_username} className="request-avatar-img" /> : (item.recipient_username[0]?.toUpperCase() || '?')}
            </span>
            <div className="community-request-copy"><b>#{item.recipient_username}</b><small>Waiting for their reply</small></div>
            <button type="button" className="community-cancel-request" onClick={() => void cancelFriendRequest(item)}>Cancel request</button>
          </article>)}
        </section>}
        {!!myJoinRequests.length && <section className="community-request-section"><h3>Group requests you sent <span>{myJoinRequests.length}</span></h3>
          {myJoinRequests.map((item) => <article className="community-request-card outgoing" key={item.id}><span className="community-request-avatar group"><Users size={17} /></span><div className="community-request-copy"><b>{item.name}</b><small>Waiting for a group admin</small></div><button type="button" className="community-cancel-request" onClick={() => void cancelMyJoinRequest(item)}>Cancel request</button></article>)}
        </section>}
        {!requestCount && <div className="community-requests-empty"><span><Check size={19} /></span><b>You’re all caught up</b><small>Friend requests, group invites, and join approvals will show up here.</small></div>}
      </section>}
    </section>
    <section className="community-room">{selected ? (selected.kind === 'system' ? <OfficialChannelRoom announcements={announcements} onBack={handleExitChat} /> : <CommunityRoom key={selected.kind + ':' + selected.id} token={token} kind={selected.kind} id={selected.id} label={selected.label} isAdmin={groups.some((group) => group.id === selected.id && group.role === 'admin')} currentUser={currentUser} avatarUrl={selected.kind === 'dm' ? dms.find((d) => d.conversation_id === selected.id)?.peer_avatar_url : null} dms={dms} groups={groups} onRefresh={refresh} onBack={handleExitChat} />) : <div className="community-room-empty"><div><MessageSquareText size={25} /></div><h2>Your next good conversation.</h2><p>Choose a chat from the list, or start a new one.</p></div>}</section>
  </div>
    {!!hubView && <div className="community-hub-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        if (hubView === 'invite' && createdGroup)
          void finishGroupSetup();
        else
          setHubView(null);
      }
    }}>
      <section className="community-hub-dialog" role="dialog" aria-modal="true" aria-labelledby="community-hub-title">
        <header className="community-hub-header">
          <div>{hubView !== 'home' && hubView !== 'invite' && <button type="button" className="community-hub-back" onClick={() => { setError(''); setNotice(''); setHubView('home'); }} aria-label="Back"><ArrowLeft size={17} /></button>}<span className="eyebrow">{hubView === 'invite' ? 'GROUP SETUP · STEP 2 OF 2' : hubView === 'create' ? 'GROUP SETUP · STEP 1 OF 2' : 'YOUR PEOPLE, YOUR ROOMS'}</span><h2 id="community-hub-title">{hubView === 'home' ? 'Start something new' : hubView === 'friend' ? 'Start a private chat' : hubView === 'create' ? 'Create a group' : hubView === 'discover' ? 'Find a group' : 'Invite your people'}</h2></div>
          <button type="button" className="community-hub-close" onClick={() => {
            if (hubView === 'invite' && createdGroup)
              void finishGroupSetup();
            else
              setHubView(null);
          }} aria-label="Close"><X size={18} /></button>
        </header>
        {(error || notice) && <div className={"study-status " + (error ? 'error' : '')}>{error || notice}</div>}
        {hubView === 'home' && <div className="community-hub-options">
          <button type="button" className="community-hub-option" onClick={() => { setError(''); setNotice(''); setHubView(null); setInboxTab('discover'); }}><span className="community-hub-option-icon warm"><Globe size={19} /></span><span><b>Discover people</b><small>Browse public community accounts, send friend requests, and chat.</small></span><ArrowUpRight size={17} /></button>
          <button type="button" className="community-hub-option" onClick={() => { setError(''); setNotice(''); setHubView('friend'); }}><span className="community-hub-option-icon"><MessageSquareText size={19} /></span><span><b>New chat by ID</b><small>Find a person by their exact adda ID and send a request.</small></span><ArrowUpRight size={17} /></button>
          <button type="button" className="community-hub-option" onClick={() => { setError(''); setNotice(''); setHubView('create'); }}><span className="community-hub-option-icon warm"><Users size={19} /></span><span><b>Create a group</b><small>Make a room for friends, classmates, or a team.</small></span><ArrowUpRight size={17} /></button>
          <button type="button" className="community-hub-option" onClick={() => { setError(''); setNotice(''); setHubView('discover'); }}><span className="community-hub-option-icon"><Search size={19} /></span><span><b>Find groups</b><small>Search public rooms and join or ask to join.</small></span><ArrowUpRight size={17} /></button>
        </div>}
        {hubView === 'friend' && <form className="community-hub-form" onSubmit={(event) => void sendRequest(event)}><p>Enter the person’s adda ID. They’ll see your request in their Requests tab.</p><label className="community-hub-field"><span>Adda ID</span><input autoFocus value={friendId} onChange={(event) => setFriendId(event.target.value)} placeholder="For example, mahira494" aria-label="Adda ID" /></label><div className="community-hub-actions"><button type="button" className="community-hub-secondary" onClick={() => setHubView('home')}>Back</button><button className="community-hub-primary" disabled={!friendId.trim()}><Users size={16} /> Send request</button></div></form>}
        {hubView === 'create' && <form className="community-hub-form" onSubmit={(event) => void createGroup(event)}><p>Set up your room first. You can invite people directly or share a link in the next step.</p><label className="community-hub-field"><span>Group name</span><input autoFocus required minLength={2} maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Biology study group" /></label><label className="community-hub-field"><span>Who can find it?</span><select value={visibility} onChange={(event) => { const next = event.target.value as 'public' | 'private'; setVisibility(next); setRequireApproval(next === 'private'); }}><option value="public">Public · anyone can find it</option><option value="private">Private · invite only</option></select></label>{visibility === 'public' && <label className="community-approval-toggle community-hub-approval"><input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} /><span>Approve new members before they join</span></label>}<div className="community-hub-actions"><button type="button" className="community-hub-secondary" onClick={() => setHubView('home')}>Back</button><button className="community-hub-primary"><Plus size={16} /> Create group</button></div></form>}        {hubView === 'invite' && createdGroup && <div className="community-hub-form"><p><b>{createdGroup.name}</b> is ready. Invite members now, or open your group and do this later.</p><form className="community-hub-invite-form" onSubmit={(event) => void sendGroupInvitation(event)}><label className="community-hub-field"><span>Invite by adda ID</span><input autoFocus value={inviteUsername} onChange={(event) => setInviteUsername(event.target.value)} placeholder="Enter an adda ID" /></label><button className="community-hub-primary" disabled={!inviteUsername.trim()}><Users size={15} /> Send invite</button></form>
          {!!invitedUsernames.length && <div className="community-hub-invited"><b>Invitations sent</b><div>{invitedUsernames.map((username) => <span key={username}><Check size={13} /> #{username}</span>)}</div></div>}
          <div className="community-hub-link"><div><b>Share an invite link</b><small>Anyone with the link can preview the group and join.</small></div>{!setupInviteUrl ? <button type="button" className="community-hub-secondary" onClick={() => void createSetupInviteLink()} disabled={setupInviteBusy}><Link2 size={15} />{setupInviteBusy ? 'Creating…' : 'Create link'}</button> : <><input readOnly value={setupInviteUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Group invite link" /><button type="button" className="community-hub-secondary" onClick={() => void copySetupInvite()}><Copy size={15} />{setupInviteCopied ? 'Copied' : 'Copy link'}</button></>}</div>          <div className="community-hub-actions"><button type="button" className="community-hub-secondary" onClick={() => void finishGroupSetup()}>Skip for now</button><button type="button" className="community-hub-primary" onClick={() => void finishGroupSetup()}>Open group <ArrowUpRight size={15} /></button></div>
        </div>}
        {hubView === 'discover' && <div className="community-hub-form"><p>Search public groups by name. Open groups let you join right away; some ask an admin first.</p><label className="community-search-box community-hub-search"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search public groups" aria-label="Search public groups" /></label>{search.trim().length < 2 ? <div className="community-hub-search-empty">Type at least 2 characters to search.</div> : <div className="community-discover-results">{publicGroups.map((group) => <div className="community-discover-card" key={group.id}><span className="community-avatar"><Users size={16} /></span><div><b>{group.name}</b><small>{group.member_count} {group.member_count === 1 ? 'member' : 'members'} · {group.require_approval ? 'admin approval' : 'open to join'}</small></div><button type="button" disabled={!!group.is_member || !!group.request_pending || joiningPublicGroup === group.id} onClick={() => void joinPublicGroup(group)}>{group.is_member ? 'Joined' : group.request_pending ? 'Request sent' : joiningPublicGroup === group.id ? 'Joining…' : group.require_approval ? 'Request' : 'Join'}</button></div>)}{!publicGroups.length && <p className="community-muted">No public groups match that search yet.</p>}</div>}<div className="community-hub-actions"><button type="button" className="community-hub-secondary" onClick={() => setHubView('home')}>Back</button></div></div>}
      </section>
    </div>}
    {!!pendingInviteToken && <div className="community-invite-backdrop"><section className="community-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="group-invite-title"><button className="community-invite-close" onClick={() => { clearGroupInviteToken(); setPendingInviteToken(''); }} aria-label="Close invite"><X size={18} /></button><div className="community-avatar"><Link2 size={18} /></div><span className="eyebrow">YOU’VE BEEN INVITED</span>{invitePreview ? <><h2 id="group-invite-title">Join {invitePreview.name}?</h2><p>{invitePreview.member_count} {invitePreview.member_count === 1 ? 'member' : 'members'} · {invitePreview.visibility === 'private' ? 'Private group' : 'Public group'}{invitePreview.require_approval ? ' · admin approval required' : ''}</p>{invitePreview.is_member ? <button className="small-action" onClick={() => { clearGroupInviteToken(); setPendingInviteToken(''); setSelected({ kind: 'group', id: invitePreview.id, label: invitePreview.name }); }}>Open group <ArrowUpRight size={15} /></button> : invitePreview.request_pending ? <button className="small-action" disabled>Request sent · waiting for an admin</button> : <button className="small-action" onClick={() => void joinFromInvite()} disabled={joiningInvite}>{joiningInvite ? 'Joining…' : invitePreview.require_approval ? 'Request to join' : 'Join group'} <ArrowUpRight size={15} /></button>}</> : <><h2 id="group-invite-title">{invitePreviewError ? 'Invite unavailable' : 'Checking your invite…'}</h2><p>{invitePreviewError || 'One moment while we look up the group.'}</p><div className="community-invite-dialog-actions"><button onClick={() => { clearGroupInviteToken(); setPendingInviteToken(''); }}>{invitePreviewError ? 'Close' : 'Not now'}</button>{invitePreviewError && <button onClick={() => { setInvitePreviewError(''); setPreviewRetry((retry) => retry + 1); }}>Try again</button>}</div></>}</section></div>}
  </div>;
}
function formatInboxTime(value: string) {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function messageTime(value: string) {
  return Date.parse(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
}

type RoomCache = {
  messages: ChatMessage[];
  hasOlder: boolean;
  scrollPos?: number;
  draft: string;
  lastFetchedAt: number;
};
const chatRoomCache = new Map<string, RoomCache>();

type SocketPoolEntry = {
  ws: WebSocket;
  releaseTimer?: ReturnType<typeof setTimeout>;
  onMessageHandlers: Set<(event: MessageEvent) => void>;
  onOpenHandlers: Set<() => void>;
  onCloseHandlers: Set<() => void>;
};
const chatSocketPool = new Map<string, SocketPoolEntry>();

function updateChatRoomCache(roomKey: string, updates: Partial<RoomCache>) {
  const existing = chatRoomCache.get(roomKey) ?? {
    messages: [],
    hasOlder: false,
    draft: '',
    lastFetchedAt: Date.now(),
  };
  chatRoomCache.set(roomKey, { ...existing, ...updates });
}

function OfficialChannelRoom({
  announcements,
  onBack,
}: {
  announcements: SystemAnnouncement[];
  onBack: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [announcements]);

  const ordered = [...announcements].reverse();

  return (
    <>
      <header className="community-room-head official-room-head">
        <button className="community-back-button" onClick={onBack} aria-label="Back to chats">
          <ArrowLeft size={19} />
        </button>
        <div className="community-avatar official-avatar">
          <Sparkles size={18} />
        </div>
        <div className="official-head-info">
          <div className="official-title-line">
            <b>STUDENT ADDA</b>
            <span className="official-verified-badge" title="Official Student Adda Channel">
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="official-tag">OFFICIAL</span>
          </div>
          <small>BROADCAST CHANNEL · ANNOUNCEMENTS &amp; UPDATES</small>
        </div>
        <span className="live-status official-live-status">
          <i className="online-dot" /> VERIFIED
        </span>
      </header>

      <div className="community-message-list official-channel-feed" ref={listRef}>
        <div className="official-welcome-card">
          <div className="official-welcome-icon">
            <Sparkles size={24} />
          </div>
          <h3>Welcome to the Student Adda Channel</h3>
          <p>
            This is the official broadcast channel for Student Adda. You will receive real-time news,
            platform updates, new game announcements, and tournament notices here directly from the team.
          </p>
          <div className="official-welcome-meta">
            <span>✨ Verified Channel</span>
            <span>•</span>
            <span>📢 Administrator Broadcasts</span>
          </div>
        </div>

        {ordered.length === 0 ? (
          <div className="community-room-empty small">
            <MessageSquareText size={22} />
            <p>No announcements posted yet. Check back soon for updates!</p>
          </div>
        ) : (
          ordered.map((post) => (
            <article className="official-announcement-card" key={post.id}>
              <div className="official-card-head">
                <div className="official-card-sender">
                  <span className="official-mini-avatar">
                    <Sparkles size={13} />
                  </span>
                  <b>STUDENT ADDA</b>
                  <span className="official-verified-badge mini">
                    <Check size={9} strokeWidth={3} />
                  </span>
                  <span className="official-role-badge">ADMIN</span>
                </div>
                <time>
                  {new Date(post.created_at.replace(' ', 'T') + (post.created_at.includes('Z') ? '' : 'Z')).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>

              {post.title && <h4 className="official-card-title">{post.title}</h4>}

              <div className="official-card-body">
                <p>{post.body}</p>
              </div>

              {post.image_url && (
                <div className="official-card-image-wrap" onClick={() => setExpandedImage(post.image_url!)}>
                  <img
                    src={post.image_url}
                    alt={post.title || 'Student Adda Announcement'}
                    className="official-card-image"
                    loading="lazy"
                  />
                  <div className="image-zoom-hint">Click image to enlarge</div>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <div className="official-channel-footer">
        <div className="official-footer-lock">
          <span>🔒</span>
        </div>
        <div className="official-footer-copy">
          <strong>One-way Broadcast Channel</strong>
          <small>Only Student Adda administrators can post announcements and updates here.</small>
        </div>
      </div>

      {expandedImage && (
        <div className="official-image-modal" onClick={() => setExpandedImage(null)}>
          <div className="official-image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="official-modal-close" onClick={() => setExpandedImage(null)}>
              <X size={20} />
            </button>
            <img src={expandedImage} alt="Enlarged announcement" />
          </div>
        </div>
      )}
    </>
  );
}

const POPULAR_REACTION_GIFS = [
  { label: 'Thumbs Up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { label: 'Celebration', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { label: 'Laughing', url: 'https://media.giphy.com/media/26n6Gx9moCgs1DnFe/giphy.gif' },
  { label: 'Clapping', url: 'https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif' },
  { label: 'Mind Blown', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { label: 'Dancing', url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif' },
  { label: 'High Five', url: 'https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif' },
  { label: 'Heart Eyes', url: 'https://media.giphy.com/media/uw0KqTWZPAIfJK51ZK/giphy.gif' },
];

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>'"]+/i);
  return match ? match[0] : null;
}

function LinkPreviewCard({ url, token }: { url: string; token: string }) {
  const [preview, setPreview] = useState<{
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    site_name: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    const fetchPreview = async () => {
      try {
        const res = await fetch(`${apiRoot}/link-preview?url=${encodeURIComponent(url)}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json() as { preview?: typeof preview };
        if (!unmounted && data.preview) {
          setPreview(data.preview);
        }
      } catch {}
      finally {
        if (!unmounted) setLoading(false);
      }
    };
    fetchPreview();
    return () => { unmounted = true; };
  }, [url, token]);

  if (loading || !preview || (!preview.title && !preview.description && !preview.image)) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-link-preview-card"
      onClick={(e) => e.stopPropagation()}
    >
      {preview.image && (
        <div className="chat-link-preview-thumb">
          <img src={preview.image} alt="" loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
        </div>
      )}
      <div className="chat-link-preview-info">
        {preview.site_name && <small className="chat-link-preview-domain">{preview.site_name}</small>}
        {preview.title && <strong className="chat-link-preview-title">{preview.title}</strong>}
        {preview.description && <p className="chat-link-preview-desc">{preview.description}</p>}
      </div>
    </a>
  );
}

function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderFormattedBody(text: string, currentUsername?: string, searchQuery?: string) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      const uname = part.slice(1);
      const isMe = Boolean(currentUsername && uname.toLowerCase() === currentUsername.toLowerCase());
      return (
        <span key={index} className={`chat-mention-tag ${isMe ? 'chat-mention-mine' : ''}`}>
          {part}
        </span>
      );
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      const escaped = escapeRegex(q);
      const subparts = part.split(new RegExp(`(${escaped})`, 'gi'));
      return subparts.map((sub, sIdx) => {
        if (sub.toLowerCase() === q.toLowerCase()) {
          return <mark key={`${index}-${sIdx}`} className="chat-search-highlight">{sub}</mark>;
        }
        return sub;
      });
    }
    return part;
  });
}

function DocumentMessageCard({ m, token }: { m: ChatMessage; token: string }) {
  const downloadUrl = getMediaUrl(m.media_url || '', token) + (m.media_url?.includes('?') ? '&' : '?') + 'download=1';
  const fileName = m.file_name || 'Document';
  const sizeStr = m.file_size ? (m.file_size > 1024 * 1024 ? `${(m.file_size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(m.file_size / 1024)} KB`) : '';
  const ext = (fileName.split('.').pop() || '').toUpperCase();
  const badgeColor = ext === 'PDF' ? '#ef4444' : ext === 'DOC' || ext === 'DOCX' ? '#3b82f6' : ext === 'XLS' || ext === 'XLSX' || ext === 'CSV' ? '#10b981' : ext === 'PPT' || ext === 'PPTX' ? '#f59e0b' : '#8b5cf6';

  return (
    <div className="chat-document-card" onClick={(e) => e.stopPropagation()}>
      <div className="chat-document-icon" style={{ borderColor: badgeColor, color: badgeColor }}>
        <FileText size={22} />
        <span className="doc-badge" style={{ backgroundColor: badgeColor }}>{ext || 'DOC'}</span>
      </div>
      <div className="chat-document-info">
        <span className="chat-document-name" title={fileName}>{fileName}</span>
        {sizeStr && <span className="chat-document-size">{sizeStr}</span>}
      </div>
      <a
        href={downloadUrl}
        download={fileName}
        className="chat-document-download"
        title={`Download ${fileName}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download size={16} />
      </a>
    </div>
  );
}

function PollMessageCard({
  poll,
  onVote,
}: {
  poll: ChatPoll;
  onVote: (pollId: string, optionId: string) => void;
}) {
  const total = poll.totalVotes || 0;
  return (
    <div className="chat-poll-card" onClick={(e) => e.stopPropagation()}>
      <div className="chat-poll-header">
        <span className="chat-poll-badge"><BarChart2 size={13} /> Poll</span>
        <strong className="chat-poll-question">{poll.question}</strong>
      </div>
      <div className="chat-poll-options">
        {poll.options.map((opt) => {
          const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
          return (
            <button
              key={opt.id}
              type="button"
              className={`chat-poll-option ${opt.hasVoted ? 'voted' : ''}`}
              onClick={() => onVote(poll.id, opt.id)}
            >
              <div className="chat-poll-bar" style={{ width: `${pct}%` }} />
              <div className="chat-poll-option-content">
                <span className="chat-poll-radio">{opt.hasVoted ? '●' : '○'}</span>
                <span className="chat-poll-option-text">{opt.text}</span>
                <span className="chat-poll-option-percent">{pct}% ({opt.votes})</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="chat-poll-footer">
        <small>{total} {total === 1 ? 'vote' : 'votes'}</small>
      </div>
    </div>
  );
}

function VoiceNotePlayer({ src, durationSeconds }: { src: string; durationSeconds?: number | null }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const format = (sec: number) => {
    const s = Math.floor(sec || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="voice-note-player" onClick={(e) => e.stopPropagation()}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration || durationSeconds || 0)}
      />
      <button type="button" className="voice-note-toggle" onClick={toggle} aria-label={playing ? 'Pause audio' : 'Play audio'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="voice-note-waveform">
        <div className="voice-note-progress" style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} />
        <div className="voice-note-bars">
          {[40, 70, 30, 90, 60, 100, 50, 80, 45, 95, 65, 35, 75, 85, 55, 45].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <span className="voice-note-time">{format(playing ? currentTime : duration)}</span>
      <button
        type="button"
        className="voice-note-speed-pill"
        onClick={cycleSpeed}
        title="Playback speed (1x, 1.5x, 2x)"
      >
        {playbackRate}x
      </button>
    </div>
  );
}

function MessageRow({
  m,
  kind,
  token,
  avatarUrl,
  isActiveAction,
  currentUser,
  searchQuery,
  onOpenActionMenu,
  onReply,
  onZoomImage,
  onJumpToMessage,
  onToggleReaction,
  onVotePoll,
}: {
  m: ChatMessage;
  kind: 'dm' | 'group';
  token: string;
  avatarUrl?: string | null;
  isActiveAction: boolean;
  currentUser?: { id: string; username: string } | null;
  searchQuery?: string;
  onOpenActionMenu: (m: ChatMessage, rect: DOMRect) => void;
  onReply: (m: ChatMessage) => void;
  onZoomImage: (url: string) => void;
  onJumpToMessage: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onVotePoll: (pollId: string, optionId: string) => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSwipingRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isSwipingRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      if (!isSwipingRef.current && cardRef.current) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(40); } catch {}
        }
        const rect = cardRef.current.getBoundingClientRect();
        onOpenActionMenu(m, rect);
      }
    }, 420);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (Math.abs(dy) > 8 || dx < -8) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    if (dx > 8 && Math.abs(dx) > Math.abs(dy)) {
      isSwipingRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const clamped = Math.min(dx * 0.55, 60);
      setSwipeX(clamped);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (swipeX >= 38) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(25); } catch {}
      }
      onReply(m);
    }
    setSwipeX(0);
    touchStartRef.current = null;
    isSwipingRef.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (cardRef.current) {
      onOpenActionMenu(m, cardRef.current.getBoundingClientRect());
    }
  };

  const timeStr = new Date(m.created_at.replace(' ', 'T') + (m.created_at.includes('Z') ? '' : 'Z')).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <article
      className={`community-message ${m.mine ? 'mine' : 'peer'} ${m.is_deleted ? 'is-deleted' : ''} ${isActiveAction ? 'is-active-action' : ''}`}
      data-message-id={m.id}
    >
      <div className="wa-swipe-container">
        <div className={`wa-swipe-reply-indicator ${swipeX > 8 ? 'is-visible' : ''} ${swipeX >= 38 ? 'is-triggered' : ''}`}>
          <Reply size={16} />
        </div>

        {kind === 'group' && !m.mine && (
          <div className="message-peer-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={m.username} /> : <span className="community-avatar-initial">{m.username[0]?.toUpperCase() || 'A'}</span>}
          </div>
        )}

        <div
          ref={cardRef}
          className="community-bubble-card"
          style={{ transform: swipeX ? `translateX(${swipeX}px)` : undefined }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={handleContextMenu}
        >
          {/* Forwarded Header Badge */}
          {Boolean(m.is_forwarded) && !m.is_deleted && (
            <div className="wa-forwarded-badge">
              <Forward size={12} />
              <span>Forwarded</span>
            </div>
          )}

          {/* In group chats, display sender username for incoming messages */}
          {kind === 'group' && !m.mine && (
            <span className="wa-bubble-sender">#{m.username}</span>
          )}

          {/* Quoted Reply Snippet */}
          {m.reply_to_message_id && !m.is_deleted && (
            <button type="button" className="community-reply-quote" onClick={() => void onJumpToMessage(m.reply_to_message_id!)}>
              <b>{m.reply_to_mine ? 'You' : `#${m.reply_to_username || 'member'}`}</b>
              <span>{m.reply_to_body || 'Message unavailable'}</span>
            </button>
          )}

          {m.is_deleted ? (
            <div className="deleted-message-text">🚫 <i>This message was deleted</i></div>
          ) : (
            <>
              {/* Interactive In-Chat Poll Card */}
              {m.poll && (
                <PollMessageCard poll={m.poll} onVote={onVotePoll} />
              )}

              {/* Document / PDF Card */}
              {(m.media_type === 'document' || m.file_name) && (
                <DocumentMessageCard m={m} token={token} />
              )}

              {/* Media Voice Note */}
              {m.media_url && m.media_type?.startsWith('audio/') && (
                <VoiceNotePlayer src={getMediaUrl(m.media_url, token)} durationSeconds={m.media_duration_seconds} />
              )}

              {/* Media Image */}
              {m.media_url && !m.media_type?.startsWith('audio/') && m.media_type !== 'document' && !m.file_name && (
                <div className="chat-media-image-wrap" onClick={() => onZoomImage(getMediaUrl(m.media_url, token))}>
                  <img src={getMediaUrl(m.media_url, token)} alt="Attachment" className="chat-media-image" loading="lazy" />
                </div>
              )}

              {/* Message Body with Mentions and Search Highlight */}
              {m.body && <span className="community-bubble-text">{renderFormattedBody(m.body, currentUser?.username, searchQuery)}</span>}

              {/* Link Preview */}
              {m.body && extractUrl(m.body) && (
                <LinkPreviewCard url={extractUrl(m.body)!} token={token} />
              )}

              {/* WhatsApp Inline Timestamp and Ticks */}
              <span className="wa-bubble-time-ticks">
                <time>{timeStr}</time>
                {m.expires_at && <span className="wa-bubble-indicator expiring" title="Disappearing message"><Clock size={11} /></span>}
                {Boolean(m.is_starred) && <span className="wa-bubble-indicator starred" title="Starred message"><Star size={11} fill="#eab308" color="#eab308" /></span>}
                {m.edited_at && !m.is_deleted && <span className="wa-bubble-edited">Edited</span>}
                {m.mine && !m.is_deleted && (
                  <span className={`chat-tick-status ${(kind === 'dm' && m.seen) ? 'seen' : m.delivered ? 'delivered' : 'sent'}`}>
                    {(kind === 'dm' && m.seen) ? (
                      <CheckCheck size={14} className="tick-blue" />
                    ) : m.delivered ? (
                      <CheckCheck size={14} className="tick-grey" />
                    ) : (
                      <Check size={14} className="tick-grey" />
                    )}
                  </span>
                )}
              </span>

              {/* Desktop Hover Chevron Trigger */}
              <button
                type="button"
                className="wa-message-dropdown-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (cardRef.current) onOpenActionMenu(m, cardRef.current.getBoundingClientRect());
                }}
                title="Message options"
                aria-label="Message options"
              >
                <ChevronDown size={14} />
              </button>

              {/* Reactions Chips nestled on bubble corner */}
              {m.reactions && m.reactions.length > 0 && (
                <div className="chat-reactions-display">
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`chat-reaction-chip ${r.hasReacted ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleReaction(m.id, r.emoji);
                      }}
                      title={r.users?.join(', ') || ''}
                    >
                      <span>{r.emoji}</span>
                      <span className="chat-reaction-count">{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function CommunityRoom({
  token,
  kind,
  id,
  label,
  isAdmin,
  currentUser,
  avatarUrl,
  dms = [],
  groups = [],
  onRefresh,
  onBack,
}: {
  token: string;
  kind: 'dm' | 'group';
  id: string;
  label: string;
  isAdmin: boolean;
  currentUser?: { id: string; username: string } | null;
  avatarUrl?: string | null;
  dms?: Dm[];
  groups?: Group[];
  onRefresh: () => Promise<void>;
  onBack: () => void;
}) {
  const roomKey = kind + ':' + id;
  const initialCached = chatRoomCache.get(roomKey);

  const { startDmCall, busy: callBusy } = useVoiceCalls();
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialCached?.messages ?? []);
  const [hasOlder, setHasOlder] = useState(() => initialCached?.hasOlder ?? false);
  const [value, setValue] = useState(() => initialCached?.draft ?? '');
  const [error, setError] = useState('');
  const [live, setLive] = useState(() => {
    const pooled = chatSocketPool.get(roomKey);
    return pooled?.ws.readyState === WebSocket.OPEN;
  });
  const [retryCount, setRetryCount] = useState(0);
  const [section, setSection] = useState<'chat' | 'studies' | 'polls'>('chat');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const editingMessageIdRef = useRef<string | null>(null);
  const [peerOnline, setPeerOnline] = useState<boolean>(() => label.includes('(You)'));
  const [peerTyping, setPeerTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Expanded chat features state
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardTargetMessage, setForwardTargetMessage] = useState<ChatMessage | null>(null);
  const [showInChatPollModal, setShowInChatPollModal] = useState(false);
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);
  const [disappearingDuration, setDisappearingDuration] = useState<number>(0);
  const [isAnnouncementOnly, setIsAnnouncementOnly] = useState<boolean>(false);
  const [groupMembers, setGroupMembers] = useState<{ id: string; username: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const emitTyping = (isTyping: boolean) => {
    if (kind !== 'dm' && kind !== 'group') return;
    if (label.includes('(You)')) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (isTyping) {
      if (lastTypingSentRef.current > 0 && now - lastTypingSentRef.current < 1800) return;
      lastTypingSentRef.current = now;
      try {
        socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: true }));
      } catch {}
    } else {
      lastTypingSentRef.current = 0;
      try {
        socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
      } catch {}
    }
  };

  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);
  const draftRef = useRef(value);
  const initialScrollRestoredRef = useRef(false);

  // Rich Chat Media, GIFs, Voice Note state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  // In-Chat 2-Player Games state
  const [activeGame, setActiveGame] = useState<DmGame | null>(null);
  const [showGamesMenu, setShowGamesMenu] = useState(false);
  const [selectedGridSize, setSelectedGridSize] = useState<3 | 6>(3);
  const [gameBusy, setGameBusy] = useState(false);
  const dismissedGameIdRef = useRef<string | null>(null);

  // WhatsApp-style Group & Action sheets state
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [showCreateStudyModal, setShowCreateStudyModal] = useState(false);

  // Hydrate draft from IndexedDB on room change
  useEffect(() => {
    void getRoomDraft(roomKey).then((savedDraft) => {
      if (savedDraft && !draftRef.current) {
        setValue(savedDraft);
        draftRef.current = savedDraft;
      }
    });
  }, [roomKey]);

  // Persist draft debounced to IndexedDB
  useEffect(() => {
    draftRef.current = value;
    const timer = setTimeout(() => {
      void saveRoomDraft(roomKey, value);
    }, 250);
    return () => clearTimeout(timer);
  }, [roomKey, value]);

  // Hydrate initial messages from IndexedDB for zero-latency cold-start
  useEffect(() => {
    if (messages.length === 0) {
      void getMessages(roomKey).then((cached) => {
        if (cached && cached.length > 0) {
          setMessages((curr) => (curr.length === 0 ? cached : curr));
        }
      });
    }
  }, [roomKey]);

  useEffect(() => {
    if (kind !== 'dm') {
      setActiveGame(null);
      setShowGamesMenu(false);
      return;
    }
    let cancel = false;
    void request<{ game: DmGame | null }>(`/conversations/${encodeURIComponent(id)}/games/active`, token)
      .then((res) => {
        if (!cancel) {
          if (res.game && res.game.id !== dismissedGameIdRef.current) {
            setActiveGame(res.game);
          } else {
            setActiveGame(null);
          }
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [id, kind, token]);

  // Media & Rich Chat handlers
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
      }
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Strictly reject all video files
    if (file.type.startsWith('video/')) {
      setError('Video sharing is strictly not supported.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('File is too large (maximum 15 MB).');
      return;
    }

    setUploadingMedia(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${apiRoot}/chat/upload`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await res.json()) as { error?: string; mediaUrl?: string; mediaType?: string; fileName?: string; fileSize?: number };
      if (!res.ok || !data.mediaUrl) {
        throw new Error(data.error || 'Upload failed');
      }

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'send',
          body: '',
          mediaType: data.mediaType || file.type || 'application/octet-stream',
          mediaUrl: data.mediaUrl,
          mediaDurationSeconds: null,
          fileName: data.fileName || file.name,
          fileSize: data.fileSize || file.size,
          replyToMessageId: replyTarget?.id ?? null,
        }));
        setReplyTarget(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingMedia(false);
    }
  };

  const sendGif = (url: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'send',
      body: '',
      mediaType: 'image/gif',
      mediaUrl: url,
      mediaDurationSeconds: null,
      replyToMessageId: replyTarget?.id ?? null,
    }));
    setShowGifPicker(false);
    setReplyTarget(null);
  };

  const startVoiceRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      recorder.start(100);
      setRecordingVoice(true);
      setVoiceDuration(0);
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      const startTime = Date.now();
      voiceTimerRef.current = setInterval(() => {
        setVoiceDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } catch {
      setError('Microphone access denied or unavailable.');
    }
  };

  const cancelVoiceRecording = () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((t) => t.stop());
      voiceStreamRef.current = null;
    }
    setRecordingVoice(false);
    setVoiceDuration(0);
    voiceChunksRef.current = [];
  };

  const stopAndSendVoiceNote = () => {
    if (!mediaRecorderRef.current) return;
    const durationSec = voiceDuration;
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    setUploadingMedia(true);

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(voiceChunksRef.current, { type: mimeType });
        if (voiceStreamRef.current) {
          voiceStreamRef.current.getTracks().forEach((t) => t.stop());
          voiceStreamRef.current = null;
        }
        setRecordingVoice(false);
        setVoiceDuration(0);
        voiceChunksRef.current = [];

        if (audioBlob.size === 0) return;

        const form = new FormData();
        form.append('file', audioBlob, 'voicenote.webm');
        const res = await fetch(`${apiRoot}/chat/upload`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: form,
        });
        const data = (await res.json()) as { error?: string; mediaUrl?: string; mediaType?: string };
        if (!res.ok || !data.mediaUrl) {
          throw new Error(data.error || 'Could not upload voice note');
        }

        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'send',
            body: '',
            mediaType: data.mediaType || 'audio/webm',
            mediaUrl: data.mediaUrl,
            mediaDurationSeconds: durationSec,
            replyToMessageId: replyTarget?.id ?? null,
          }));
          setReplyTarget(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send voice note');
      } finally {
        setUploadingMedia(false);
      }
    };
    try {
      recorder.stop();
    } catch {
      setUploadingMedia(false);
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'react',
      messageId,
      emoji,
    }));
  };

  const deleteForEveryone = (messageId: string) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'delete',
      messageId,
    }));
  };

  const messagePath = kind === 'dm' ? `/conversations/${encodeURIComponent(id)}/messages` : `/groups/${encodeURIComponent(id)}/messages`;
  const load = useCallback(async () => {
    const data = await request<{ messages: ChatMessage[] }>(messagePath, token);
    const msgs = data.messages.map((m) => ({
      ...m,
      reactions: m.reactions?.map((r) => ({
        ...r,
        hasReacted: Boolean(currentUser?.username && Array.isArray(r.users) && r.users.includes(currentUser.username)),
      })),
    }));
    setMessages(msgs);
    setHasOlder(msgs.length === 200);
    updateChatRoomCache(roomKey, {
      messages: msgs,
      hasOlder: msgs.length === 200,
      lastFetchedAt: Date.now(),
    });
    void saveMessages(roomKey, msgs);

    if (kind === 'group') {
      void request<{ group: { pinned_message_id?: string; disappearing_duration_seconds?: number; announcement_only?: number | boolean }; members?: { user_id: string; username: string }[] }>(`/groups/${encodeURIComponent(id)}`, token).then((res) => {
        if (res?.group) {
          if (res.group.pinned_message_id !== undefined) setPinnedMessageId(res.group.pinned_message_id || null);
          if (res.group.disappearing_duration_seconds !== undefined) setDisappearingDuration(res.group.disappearing_duration_seconds || 0);
          if (res.group.announcement_only !== undefined) setIsAnnouncementOnly(Boolean(res.group.announcement_only));
        }
        if (res?.members) {
          setGroupMembers(res.members.map((m) => ({ id: m.user_id, username: m.username })));
        }
      }).catch(() => {});
    } else {
      void request<{ conversations: Dm[] }>('/conversations', token).then((res) => {
        const currentDm = res?.conversations?.find((c) => c.conversation_id === id);
        if (currentDm) {
          if (currentDm.pinned_message_id !== undefined) setPinnedMessageId(currentDm.pinned_message_id || null);
          if (currentDm.disappearing_duration_seconds !== undefined) setDisappearingDuration(currentDm.disappearing_duration_seconds || 0);
          if (currentDm.peer_id && currentDm.peer_username) {
            setGroupMembers([{ id: currentDm.peer_id, username: currentDm.peer_username }]);
          }
        }
      }).catch(() => {});
    }
  }, [currentUser?.username, id, kind, messagePath, roomKey, token]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    try {
      const data = await request<{ messages: ChatMessage[] }>(`${messagePath}?before=${encodeURIComponent(`${first.created_at}|${first.id}`)}`, token);
      const msgs = data.messages.map((m) => ({
        ...m,
        reactions: m.reactions?.map((r) => ({
          ...r,
          hasReacted: Boolean(currentUser?.username && Array.isArray(r.users) && r.users.includes(currentUser.username)),
        })),
      }));
      if (listRef.current) preserveScrollRef.current = { height: listRef.current.scrollHeight, top: listRef.current.scrollTop };
      setMessages((current) => {
        const next = [...msgs, ...current];
        updateChatRoomCache(roomKey, { messages: next });
        void saveMessages(roomKey, next);
        return next;
      });
      setHasOlder(msgs.length === 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load older messages.');
    }
  };

  useEffect(() => {
    // 1. If not cached or older than 45 seconds, refresh messages
    const cached = chatRoomCache.get(roomKey);
    if (!cached || Date.now() - cached.lastFetchedAt > 45_000) {
      void load().catch((e) => setError(e.message));
    }

    let cancelled = false;
    let activeEntry = chatSocketPool.get(roomKey);
    if (activeEntry) {
      if (activeEntry.releaseTimer) {
        clearTimeout(activeEntry.releaseTimer);
        activeEntry.releaseTimer = undefined;
      }
      if (activeEntry.ws.readyState === WebSocket.CLOSING || activeEntry.ws.readyState === WebSocket.CLOSED) {
        chatSocketPool.delete(roomKey);
        activeEntry = undefined;
      }
    }

    const isRoomActiveAndVisible = () => {
      if (typeof document === 'undefined') return false;
      if (document.visibilityState !== 'visible') return false;
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
      return true;
    };

    let lastHttpReadTime = 0;
    const markAsRead = () => {
      if (!isRoomActiveAndVisible()) return;
      if (activeEntry?.ws.readyState === WebSocket.OPEN) {
        try { activeEntry.ws.send(JSON.stringify({ type: 'read' })); } catch {}
      } else {
        const now = Date.now();
        if (now - lastHttpReadTime > 5000) {
          lastHttpReadTime = now;
          const readUrl = kind === 'dm' ? `/conversations/${encodeURIComponent(id)}/read` : `/groups/${encodeURIComponent(id)}/read`;
          void request(readUrl, token, { method: 'POST' }).catch(() => {});
        }
      }
    };

    const handleOpen = () => {
      setLive(true);
      if (isRoomActiveAndVisible()) markAsRead();
      const c = chatRoomCache.get(roomKey);
      if (!c || Date.now() - c.lastFetchedAt > 30_000) {
        void load();
      }
      if (kind === 'dm') {
        void request<{ ok?: boolean; peerOnline?: boolean }>(`/conversations/${encodeURIComponent(id)}/presence`, token)
          .then((res) => {
            if (typeof res?.peerOnline === 'boolean') {
              setPeerOnline(res.peerOnline);
            }
          })
          .catch(() => {});
      }
    };

    const handleVisibilityOrFocus = () => {
      if (isRoomActiveAndVisible()) {
        markAsRead();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'connected') {
          if (typeof data.peerOnline === 'boolean') {
            setPeerOnline(data.peerOnline);
          }
        } else if (data.type === 'presence') {
          if (typeof data.peerOnline === 'boolean') {
            setPeerOnline(data.peerOnline);
          } else if (data.joinedUserId && currentUser?.id && data.joinedUserId !== currentUser.id) {
            setPeerOnline(true);
          }
        } else if (data.type === 'typing') {
          if (data.userId && currentUser?.id && data.userId !== currentUser.id) {
            if (data.isTyping) {
              setPeerTyping(true);
              setPeerOnline(true);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => {
                setPeerTyping(false);
              }, 3500);
              if (listRef.current) {
                const isNearBottom = listRef.current.scrollHeight - listRef.current.scrollTop - listRef.current.clientHeight < 140;
                if (isNearBottom) {
                  setTimeout(() => {
                    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
                  }, 60);
                }
              }
            } else {
              setPeerTyping(false);
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
              }
            }
          }
        } else if (data.type === 'message' && data.message?.id) {
          setPeerTyping(false);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
          }
          if (!data.message.mine) {
            setPeerOnline(true);
          }
          const newMsg: ChatMessage = {
            ...data.message,
            reactions: data.message.reactions?.map((r: any) => ({
              ...r,
              hasReacted: Boolean(currentUser?.username && Array.isArray(r.users) && r.users.includes(currentUser.username)),
            })),
          };
          setMessages((current) => {
            const next = current.some((m) => m.id === newMsg.id) ? current : [...current, newMsg];
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
          if (!data.message.mine && activeEntry?.ws.readyState === WebSocket.OPEN) {
            if (isRoomActiveAndVisible()) {
              markAsRead();
            }
          }
        } else if (data.type === 'message-deleted' && typeof data.messageId === 'string') {
          setMessages((current) => {
            const next = current.map((m) => m.id === data.messageId ? { ...m, is_deleted: true, body: '', media_url: null } : m);
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
        } else if (data.type === 'message-reactions-updated' && typeof data.messageId === 'string') {
          setMessages((current) => {
            const next = current.map((m) => {
              if (m.id !== data.messageId) return m;
              const reactions = (data.reactions || []).map((r: any) => ({
                ...r,
                hasReacted: Boolean(currentUser?.username && Array.isArray(r.users) && r.users.includes(currentUser.username)),
              }));
              return { ...m, reactions };
            });
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
        } else if (data.type === 'read-receipt' && typeof data.readAt === 'string') {
          const readMs = Date.parse(data.readAt.replace(' ', 'T') + (data.readAt.includes('Z') ? '' : 'Z'));
          setMessages((current) => {
            const next = current.map((m) => {
              if (m.mine && (!m.seen || !m.delivered)) {
                const msgMs = Date.parse(m.created_at.replace(' ', 'T') + (m.created_at.includes('Z') ? '' : 'Z'));
                const isEarlier = (!Number.isNaN(msgMs) && !Number.isNaN(readMs))
                  ? (msgMs <= readMs)
                  : (m.created_at <= data.readAt);
                if (isEarlier) {
                  return { ...m, seen: true, delivered: true };
                }
              }
              return m;
            });
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
        } else if (data.type === 'call-event' && data.message?.id) {
          setMessages((current) => {
            const next = current.some((m) => m.id === data.message.id)
              ? current.map((m) => m.id === data.message.id ? data.message as ChatMessage : m)
              : [...current, data.message as ChatMessage].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
        } else if (data.type === 'message-updated' && data.message?.id) {
          setMessages((current) => {
            const next = current.map((m) => m.id === data.message.id ? { ...m, body: data.message.body, edited_at: data.message.edited_at } : m);
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
          if (data.message.id === editingMessageIdRef.current) {
            editingMessageIdRef.current = null;
            setEditingMessageId(null);
            setValue('');
          }
        } else if (data.type === 'message-pinned') {
          setPinnedMessageId(data.messageId || null);
        } else if (data.type === 'poll-update' && data.poll) {
          setMessages((current) => {
            const next = current.map((m) => m.poll_id === data.poll.id ? { ...m, poll: data.poll } : m);
            updateChatRoomCache(roomKey, { messages: next });
            void saveMessages(roomKey, next);
            return next;
          });
        } else if (data.type === 'game-started' || data.type === 'game-updated') {
          if (data.game) {
            dismissedGameIdRef.current = null;
            setActiveGame(data.game as DmGame);
          }
        } else if (data.type === 'game-abandoned' || data.type === 'game-closed') {
          if (data.gameId) dismissedGameIdRef.current = data.gameId as string;
          setActiveGame((curr) => (curr?.id === data.gameId || !data.gameId ? null : curr));
          if (data.type === 'game-abandoned' && data.abandonedBy && currentUser?.id && data.abandonedBy !== currentUser.id) {
            setError(data.username ? `#${data.username} ended the game.` : 'The other player ended the game.');
            setTimeout(() => setError((prev) => (prev?.includes('ended the game') ? '' : prev)), 3500);
          }
        } else if (data.type === 'error' && typeof data.message === 'string') {
          setError(data.message);
        }
      } catch { /* ignore invalid frames */ }
    };

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const handleClose = () => {
      setLive(false);
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          setRetryCount((c) => c + 1);
        }, 2000);
      }
    };

    const attachEntry = (entry: SocketPoolEntry) => {
      if (cancelled) return;
      activeEntry = entry;
      socketRef.current = entry.ws;
      entry.onOpenHandlers.add(handleOpen);
      entry.onMessageHandlers.add(handleMessage);
      entry.onCloseHandlers.add(handleClose);

      if (entry.ws.readyState === WebSocket.OPEN) {
        setLive(true);
        if (isRoomActiveAndVisible()) markAsRead();
      }
    };

    if (activeEntry) {
      attachEntry(activeEntry);
    } else {
      void (async () => {
        let ws: WebSocket;
        try {
          const res = await request<{ ticket: string }>('/chat/ws-ticket', token, {
            method: 'POST',
            body: JSON.stringify({ kind, id }),
          });
          if (cancelled) return;
          ws = new WebSocket(`${wsRoot}/api/ws/room?kind=${kind}&id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(res.ticket)}`);
        } catch {
          if (cancelled) return;
          ws = new WebSocket(`${wsRoot}/api/ws/room?kind=${kind}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
        }
        const newEntry: SocketPoolEntry = {
          ws,
          onMessageHandlers: new Set(),
          onOpenHandlers: new Set(),
          onCloseHandlers: new Set(),
        };
        ws.onopen = () => {
          newEntry.onOpenHandlers.forEach((handler) => handler());
        };
        ws.onmessage = (event) => {
          newEntry.onMessageHandlers.forEach((handler) => handler(event));
        };
        ws.onclose = () => {
          newEntry.onCloseHandlers.forEach((handler) => handler());
          chatSocketPool.delete(roomKey);
        };
        ws.onerror = () => ws.close();
        chatSocketPool.set(roomKey, newEntry);
        attachEntry(newEntry);
      })();
    }

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);

      updateChatRoomCache(roomKey, {
        draft: draftRef.current,
        scrollPos: listRef.current?.scrollTop,
      });

      if (activeEntry) {
        activeEntry.onOpenHandlers.delete(handleOpen);
        activeEntry.onMessageHandlers.delete(handleMessage);
        activeEntry.onCloseHandlers.delete(handleClose);

        // 45-second idle grace period: keep connection alive in case user comes right back
        if (activeEntry.onMessageHandlers.size === 0) {
          if (activeEntry.releaseTimer) clearTimeout(activeEntry.releaseTimer);
          const toRelease = activeEntry;
          toRelease.releaseTimer = setTimeout(() => {
            if (toRelease.onMessageHandlers.size === 0) {
              if (toRelease.ws.readyState === WebSocket.OPEN || toRelease.ws.readyState === WebSocket.CONNECTING) {
                toRelease.ws.close();
              }
              chatSocketPool.delete(roomKey);
            }
          }, 45_000);
        }
      }
    };
  }, [id, kind, load, roomKey, token, retryCount]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const preserve = preserveScrollRef.current;
    if (preserve) {
      list.scrollTop = preserve.top + list.scrollHeight - preserve.height;
      preserveScrollRef.current = null;
    } else if (!initialScrollRestoredRef.current) {
      const cached = chatRoomCache.get(roomKey);
      if (typeof cached?.scrollPos === 'number') {
        list.scrollTop = cached.scrollPos;
      } else {
        list.scrollTop = list.scrollHeight;
      }
      initialScrollRestoredRef.current = true;
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, roomKey]);
  const send = (event: FormEvent) => {
    event.preventDefault();
    emitTyping(false);
    const body = value.trim();
    if (!body) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError('Chat is reconnecting… message kept as draft.');
      setRetryCount((c) => c + 1);
      return;
    }
    setError('');
    if (editingMessageId) { socketRef.current.send(JSON.stringify({ type: 'edit', messageId: editingMessageId, body })); return; }
    socketRef.current.send(JSON.stringify({ type: 'send', body, replyToMessageId: replyTarget?.id ?? null }));
    setValue('');
    setReplyTarget(null);
    void saveRoomDraft(roomKey, '');
  };
  const beginReply = (message: ChatMessage) => { editingMessageIdRef.current = null; setEditingMessageId(null); setValue(''); setReplyTarget(message); };
  const beginEdit = (message: ChatMessage) => { editingMessageIdRef.current = message.id; setReplyTarget(null); setEditingMessageId(message.id); setValue(message.body); setError(''); };

  const [actionTargetMessage, setActionTargetMessage] = useState<ChatMessage | null>(null);
  const [actionPopupPos, setActionPopupPos] = useState<{ top: number; left: number; alignRight: boolean } | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastNotice(msg);
    toastTimeoutRef.current = setTimeout(() => setToastNotice(null), 2000);
  };

  const openActionMenu = (m: ChatMessage, rect: DOMRect) => {
    const isMine = m.mine;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < 260 ? Math.max(16, rect.top - 240) : rect.bottom + 6;
    const alignRight = isMine || rect.left > window.innerWidth / 2;
    const left = alignRight ? Math.max(16, rect.right) : Math.min(window.innerWidth - 180, rect.left);
    setActionPopupPos({ top, left, alignRight });
    setActionTargetMessage(m);
  };

  const closeActionMenu = () => {
    setActionTargetMessage(null);
    setActionPopupPos(null);
  };

  const copyMessageText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard');
    } catch {
      showToast('Could not copy');
    }
    closeActionMenu();
  };

  const formatDateDivider = (dateStr: string) => {
    const date = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };
  const jumpToMessage = async (messageId: string) => {
    let target = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find((element) => element.dataset.messageId === messageId);
    if (!target) {
      try {
        const data = await request<{ message: ChatMessage }>(`${messagePath}/${encodeURIComponent(messageId)}`, token);
        if (listRef.current) preserveScrollRef.current = { height: listRef.current.scrollHeight, top: listRef.current.scrollTop };
        setMessages((current) => current.some((message) => message.id === data.message.id) ? current : [...current, data.message].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
        await new Promise((resolve) => setTimeout(resolve, 60));
        target = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find((element) => element.dataset.messageId === messageId);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the message you replied to.'); return; }
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); target?.classList.add('community-message-highlight'); setTimeout(() => target?.classList.remove('community-message-highlight'), 1200);
  };

  const startGame = (gridSize: 3 | 6 = selectedGridSize) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError('Connecting to chat... please try again.');
      return;
    }
    dismissedGameIdRef.current = null;
    setGameBusy(true);
    socketRef.current.send(JSON.stringify({ type: 'game-start', gridSize }));
    setShowGamesMenu(false);
    setTimeout(() => setGameBusy(false), 600);
  };

  const makeGameMove = (cellIndex: number) => {
    if (!activeGame || activeGame.status !== 'in_progress' || socketRef.current?.readyState !== WebSocket.OPEN) return;
    if (activeGame.board_state[cellIndex]) return;
    if (currentUser?.id && activeGame.turn_user_id !== currentUser.id) return;
    socketRef.current.send(JSON.stringify({ type: 'game-move', gameId: activeGame.id, cellIndex }));
  };

  const abandonGame = () => {
    if (!activeGame) return;
    dismissedGameIdRef.current = activeGame.id;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'game-abandon', gameId: activeGame.id }));
    }
    setActiveGame(null);
  };

  const closeGame = () => {
    if (!activeGame) return;
    dismissedGameIdRef.current = activeGame.id;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'game-close', gameId: activeGame.id }));
    }
    setActiveGame(null);
  };

  const isPlayerX = activeGame ? (currentUser?.id ? activeGame.player_x_id === currentUser.id : true) : true;
  const mySymbol = isPlayerX ? 'X' : 'O';
  const peerSymbol = isPlayerX ? 'O' : 'X';
  const peerUsername = activeGame ? (isPlayerX ? activeGame.player_o_username : activeGame.player_x_username) : 'friend';
  const isMyTurn = Boolean(activeGame && currentUser?.id && activeGame.turn_user_id === currentUser.id && activeGame.status === 'in_progress');

  const handleVotePoll = async (pollId: string, optionId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'poll-vote',
        pollId,
        optionId,
      }));
    } else {
      try {
        const res = await request<{ poll: ChatPoll }>(`/chat/polls/${encodeURIComponent(pollId)}/vote`, token, {
          method: 'POST',
          body: JSON.stringify({ optionId }),
        });
        setMessages((curr) => curr.map((m) => m.poll_id === pollId ? { ...m, poll: res.poll } : m));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not register vote.');
      }
    }
  };

  const visibleMessages = messages.filter((m) => {
    if (m.expires_at) {
      const exp = Date.parse(m.expires_at.replace(' ', 'T') + (m.expires_at.includes('Z') ? '' : 'Z'));
      if (!isNaN(exp) && exp <= Date.now()) return false;
    }
    return true;
  });

  const searchMatchingIds = visibleMessages
    .filter((m) => !m.is_deleted && m.body && chatSearchQuery.trim() && m.body.toLowerCase().includes(chatSearchQuery.trim().toLowerCase()))
    .map((m) => m.id);

  const goToNextSearchMatch = () => {
    if (searchMatchingIds.length === 0) return;
    const nextIdx = (currentSearchIndex + 1) % searchMatchingIds.length;
    setCurrentSearchIndex(nextIdx);
    void jumpToMessage(searchMatchingIds[nextIdx]);
  };

  const goToPrevSearchMatch = () => {
    if (searchMatchingIds.length === 0) return;
    const prevIdx = (currentSearchIndex - 1 + searchMatchingIds.length) % searchMatchingIds.length;
    setCurrentSearchIndex(prevIdx);
    void jumpToMessage(searchMatchingIds[prevIdx]);
  };

  const pinnedMessage = pinnedMessageId ? visibleMessages.find((m) => m.id === pinnedMessageId) : null;

  const handleForwardMessage = async (targetKind: 'dm' | 'group', targetId: string) => {
    if (!forwardTargetMessage) return;
    try {
      await request('/chat/forward', token, {
        method: 'POST',
        body: JSON.stringify({
          targetKind,
          targetId,
          body: forwardTargetMessage.body || '',
          mediaType: forwardTargetMessage.media_type || null,
          mediaUrl: forwardTargetMessage.media_url || null,
          mediaDurationSeconds: forwardTargetMessage.media_duration_seconds || null,
          fileName: forwardTargetMessage.file_name || null,
          fileSize: forwardTargetMessage.file_size || null,
        }),
      });
      setShowForwardModal(false);
      setForwardTargetMessage(null);
      showToast('Message forwarded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forward message');
    }
  };

  const handleUpdateDisappearingDuration = async (seconds: number) => {
    try {
      await request(kind === 'dm' ? `/conversations/${encodeURIComponent(id)}/disappearing` : `/groups/${encodeURIComponent(id)}/disappearing`, token, {
        method: 'PATCH',
        body: JSON.stringify({ durationSeconds: seconds }),
      });
      setDisappearingDuration(seconds);
      setShowDisappearingModal(false);
      showToast(seconds > 0 ? 'Disappearing messages turned on' : 'Disappearing messages turned off');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update disappearing timer');
    }
  };

  const filteredMembers = mentionQuery !== null
    ? groupMembers.filter((m) =>
        m.username.toLowerCase().includes(mentionQuery) &&
        m.username.toLowerCase() !== currentUser?.username?.toLowerCase()
      )
    : [];

  const insertMention = (targetUsername: string) => {
    const textBeforeMention = value.replace(/@([a-zA-Z0-9_]*)$/, `@${targetUsername} `);
    setValue(textBeforeMention);
    setMentionQuery(null);
  };

  return <><header className="community-room-head">
      <button className="community-back-button" onClick={onBack} aria-label="Back to chats"><ArrowLeft size={19} /></button>
      <div
        className={`community-avatar ${kind === 'group' ? 'clickable-group-head' : ''}`}
        onClick={() => kind === 'group' && setShowGroupInfo(true)}
        role={kind === 'group' ? 'button' : undefined}
        title={kind === 'group' ? 'Group Info & Settings' : undefined}
      >
        {avatarUrl ? <img src={avatarUrl} alt={label} className="inbox-avatar-img" /> : <span className="community-avatar-initial">{label.replace(/^#/, '')[0]?.toUpperCase() || <MessageSquareText size={18} />}</span>}
      </div>
      <div
        className={`room-head-meta ${kind === 'group' ? 'clickable-group-head' : ''}`}
        onClick={() => kind === 'group' && setShowGroupInfo(true)}
        role={kind === 'group' ? 'button' : undefined}
        title={kind === 'group' ? 'Group Info & Settings' : undefined}
      >
        <b>{label.replace(/^#/, '')}</b>
        <div className="room-head-status-line">
          {peerTyping ? (
            <span className="typing-status-text">
              typing<span className="typing-dot-pulse">...</span>
            </span>
          ) : kind === 'dm' ? (
            <>
              <i className={(peerOnline || label.includes('(You)')) ? 'online-dot' : 'offline-dot'} />
              <span>{(peerOnline || label.includes('(You)')) ? 'Online' : 'Offline'}</span>
            </>
          ) : (
            <>
              <i className={live ? 'online-dot' : 'offline-dot'} />
              <span>{isAdmin ? 'Admin' : 'Member'}{isAnnouncementOnly ? ' · Announcements only' : ''} · Tap for group info</span>
            </>
          )}
        </div>
      </div>
      {kind === 'dm' ? (
        <div className="room-call-actions">
          <button
            type="button"
            className="room-call-btn"
            disabled={!live || callBusy}
            title="Voice call"
            aria-label="Voice call"
            onClick={() => void startDmCall(id, 'audio').catch((e) => setError(e instanceof Error ? e.message : 'Could not start a call.'))}
          >
            <Phone size={19} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            disabled={!live || callBusy}
            title="Video call & Screen share"
            aria-label="Video call & Screen share"
            onClick={() => void startDmCall(id, 'video').catch((e) => setError(e instanceof Error ? e.message : 'Could not start a video call.'))}
          >
            <Video size={19} />
          </button>
          <button
            type="button"
            className={`room-call-btn ${showChatSearch ? 'active' : ''}`}
            title="Search in chat"
            aria-label="Search in chat"
            onClick={() => setShowChatSearch((v) => !v)}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Media, Links & Docs"
            aria-label="Media, Links & Docs"
            onClick={() => setShowMediaGallery(true)}
          >
            <Film size={18} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Starred messages"
            aria-label="Starred messages"
            onClick={() => setShowStarredModal(true)}
          >
            <Star size={18} />
          </button>
          <button
            type="button"
            className={`room-call-btn ${disappearingDuration > 0 ? 'active' : ''}`}
            title={disappearingDuration > 0 ? `Disappearing messages active (${disappearingDuration === 86400 ? '24h' : disappearingDuration === 604800 ? '7d' : '90d'})` : 'Disappearing messages'}
            aria-label="Disappearing messages"
            onClick={() => setShowDisappearingModal(true)}
          >
            <Clock size={18} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Games & activities"
            aria-label="Games & activities"
            onClick={() => setShowGamesMenu((v) => !v)}
          >
            <MoreVertical size={19} />
          </button>
        </div>
      ) : (
        <div className="room-call-actions">
          <button
            type="button"
            className={`room-call-btn ${showChatSearch ? 'active' : ''}`}
            title="Search in chat"
            aria-label="Search in chat"
            onClick={() => setShowChatSearch((v) => !v)}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Media, Links & Docs"
            aria-label="Media, Links & Docs"
            onClick={() => setShowMediaGallery(true)}
          >
            <Film size={18} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Starred messages"
            aria-label="Starred messages"
            onClick={() => setShowStarredModal(true)}
          >
            <Star size={18} />
          </button>
          <button
            type="button"
            className={`room-call-btn ${disappearingDuration > 0 ? 'active' : ''}`}
            title={disappearingDuration > 0 ? 'Disappearing messages on' : 'Disappearing messages'}
            aria-label="Disappearing messages"
            onClick={() => setShowDisappearingModal(true)}
          >
            <Clock size={18} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Group Polls"
            aria-label="Group Polls"
            onClick={() => setSection('polls')}
          >
            <CircleHelp size={19} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Group Studies"
            aria-label="Group Studies"
            onClick={() => setSection('studies')}
          >
            <BookOpen size={19} />
          </button>
          <button
            type="button"
            className="room-call-btn"
            title="Group Info & Settings"
            aria-label="Group Info & Settings"
            onClick={() => setShowGroupInfo(true)}
          >
            <Info size={19} />
          </button>
        </div>
      )}
    </header>

    {/* Sticky Pinned Message Banner */}
    {pinnedMessage && (
      <div className="wa-pinned-message-banner" onClick={() => void jumpToMessage(pinnedMessage.id)}>
        <Pin size={15} className="wa-pinned-icon" />
        <div className="wa-pinned-content">
          <small>PINNED MESSAGE · #{pinnedMessage.username}</small>
          <span>{pinnedMessage.body || (pinnedMessage.file_name ? `📄 ${pinnedMessage.file_name}` : '📎 Media attachment')}</span>
        </div>
        <button
          type="button"
          className="wa-pinned-unpin-btn"
          onClick={(e) => {
            e.stopPropagation();
            setPinnedMessageId(null);
            socketRef.current?.send(JSON.stringify({ action: 'pin-message', messageId: null }));
            setToastNotice('Message unpinned');
            setTimeout(() => setToastNotice(''), 2500);
          }}
          title="Unpin message"
          aria-label="Unpin message"
        >
          <X size={14} />
        </button>
      </div>
    )}

    {/* In-Chat Message Inline Search Bar */}
    {showChatSearch && (
      <div className="chat-inline-search-bar">
        <Search size={16} className="chat-search-input-icon" />
        <input
          type="text"
          placeholder="Search in this chat..."
          value={chatSearchQuery}
          onChange={(e) => {
            setChatSearchQuery(e.target.value);
            setCurrentSearchIndex(0);
          }}
          autoFocus
        />
        {chatSearchQuery.trim() && (
          <span className="chat-search-matches-counter">
            {searchMatchingIds.length > 0 ? `${currentSearchIndex + 1} of ${searchMatchingIds.length}` : 'No matches'}
          </span>
        )}
        <button
          type="button"
          className="chat-search-nav-btn"
          disabled={searchMatchingIds.length === 0}
          onClick={goToPrevSearchMatch}
          aria-label="Previous match"
          title="Previous match"
        >
          ▲
        </button>
        <button
          type="button"
          className="chat-search-nav-btn"
          disabled={searchMatchingIds.length === 0}
          onClick={goToNextSearchMatch}
          aria-label="Next match"
          title="Next match"
        >
          ▼
        </button>
        <button
          type="button"
          className="chat-search-close-btn"
          onClick={() => {
            setShowChatSearch(false);
            setChatSearchQuery('');
          }}
          aria-label="Close search"
        >
          <X size={16} />
        </button>
      </div>
    )}

    {kind === 'group' && <div className="community-room-tabs"><button className={section === 'chat' ? 'active' : ''} onClick={() => setSection('chat')}><MessageSquareText size={15} /> Chat</button><button className={section === 'studies' ? 'active' : ''} onClick={() => setSection('studies')}><BookOpen size={15} /> Studies</button><button className={section === 'polls' ? 'active' : ''} onClick={() => setSection('polls')}><CircleHelp size={15} /> Polls</button></div>}
    {section === 'chat' ? <>
        {hasOlder && <button className="community-load-older" onClick={() => void loadOlder()}>Load earlier messages</button>}
        <div className="community-message-list" ref={listRef}>
          {visibleMessages.length ? (
            (() => {
              let lastDate: string | null = null;
              return visibleMessages.map((m) => {
                const messageDate = formatDateDivider(m.created_at);
                const showDivider = messageDate !== lastDate;
                lastDate = messageDate;

                return (
                  <div key={m.id} className="wa-message-group-item">
                    {showDivider && (
                      <div className="chat-date-divider">
                        <span className="chat-date-pill">{messageDate}</span>
                      </div>
                    )}
                    {m.type === 'call' ? (
                      <article className="community-call-event" data-message-id={m.id}>
                        <PhoneCall size={16} />
                        <span>
                          <b>{m.call_status === 'completed' ? 'Voice call completed' : m.call_status === 'ended' ? 'Voice call ended' : m.call_status === 'connected' ? 'Voice call in progress' : m.call_status === 'accepted' ? 'Voice call accepted' : m.call_status === 'missed' ? 'Missed voice call' : m.call_status === 'declined' ? 'Voice call declined' : m.call_status === 'cancelled' ? 'Voice call cancelled' : m.call_status === 'failed' ? 'Voice call did not connect' : m.call_status === 'ringing' ? 'Voice call request' : 'Voice call'}</b>
                          <small>{new Date(m.created_at.replace(' ', 'T') + (m.created_at.includes('Z') ? '' : 'Z')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{(m.call_duration_seconds || 0) > 0 ? ' · ' + Math.floor((m.call_duration_seconds || 0) / 60) + ':' + String((m.call_duration_seconds || 0) % 60).padStart(2, '0') : ''}</small>
                        </span>
                      </article>
                    ) : (
                      <MessageRow
                        m={m}
                        kind={kind}
                        avatarUrl={avatarUrl}
                        token={token}
                        isActiveAction={actionTargetMessage?.id === m.id}
                        currentUser={currentUser}
                        searchQuery={chatSearchQuery}
                        onOpenActionMenu={openActionMenu}
                        onReply={beginReply}
                        onZoomImage={setZoomImageUrl}
                        onJumpToMessage={jumpToMessage}
                        onToggleReaction={toggleReaction}
                        onVotePoll={handleVotePoll}
                      />
                    )}
                  </div>
                );
              });
            })()
          ) : (
            <div className="community-room-empty small">
              <MessageSquareText size={22} />
              <p>Send the first message.</p>
            </div>
          )}
          {peerTyping && (
            <div className="wa-typing-row">
              <div className="wa-typing-bubble" aria-label="Partner is typing">
                <span className="wa-typing-dot" />
                <span className="wa-typing-dot" />
                <span className="wa-typing-dot" />
              </div>
            </div>
          )}
        </div>

        {actionTargetMessage && actionPopupPos && (
          <>
            <div className="wa-action-backdrop" onClick={closeActionMenu} />
            <div
              className={`wa-action-popup-wrapper ${actionPopupPos.alignRight ? 'align-right' : 'align-left'}`}
              style={{
                top: `${actionPopupPos.top}px`,
                left: actionPopupPos.alignRight ? undefined : `${actionPopupPos.left}px`,
                right: actionPopupPos.alignRight ? `${Math.max(16, window.innerWidth - actionPopupPos.left)}px` : undefined,
              }}
            >
              {!actionTargetMessage.is_deleted && (
                <div className={`wa-floating-reaction-bar ${actionTargetMessage.mine ? 'mine' : 'peer'}`}>
                  {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`wa-floating-emoji-btn ${actionTargetMessage.reactions?.some((r) => r.emoji === emoji && r.hasReacted) ? 'is-active' : ''}`}
                      onClick={() => {
                        toggleReaction(actionTargetMessage.id, emoji);
                        closeActionMenu();
                      }}
                      title={`React ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div className={`wa-context-action-menu ${actionTargetMessage.mine ? 'mine' : 'peer'}`}>
                {!actionTargetMessage.is_deleted && (
                  <button
                    type="button"
                    className="wa-context-action-item"
                    onClick={() => {
                      beginReply(actionTargetMessage);
                      closeActionMenu();
                    }}
                  >
                    <span>Reply</span>
                    <Reply size={15} />
                  </button>
                )}

                {actionTargetMessage.body && !actionTargetMessage.is_deleted && (
                  <button
                    type="button"
                    className="wa-context-action-item"
                    onClick={() => void copyMessageText(actionTargetMessage.body)}
                  >
                    <span>Copy</span>
                    <Copy size={15} />
                  </button>
                )}

                {/* Star / Unstar action */}
                {!actionTargetMessage.is_deleted && (
                  <button
                    type="button"
                    className="wa-context-action-item"
                    onClick={async () => {
                      try {
                        const target = actionTargetMessage;
                        closeActionMenu();
                        const res = await request<{ ok: boolean; is_starred: boolean }>(`/chat/messages/${encodeURIComponent(target.id)}/star`, token, { method: 'POST' });
                        setMessages((prev) => prev.map((m) => m.id === target.id ? { ...m, is_starred: res.is_starred } : m));
                        setToastNotice(res.is_starred ? 'Message starred' : 'Message unstarred');
                        setTimeout(() => setToastNotice(''), 2500);
                      } catch {}
                    }}
                  >
                    <span>{actionTargetMessage.is_starred ? 'Unstar' : 'Star'}</span>
                    <Star size={15} fill={actionTargetMessage.is_starred ? '#eab308' : 'none'} color={actionTargetMessage.is_starred ? '#eab308' : 'currentColor'} />
                  </button>
                )}

                {/* Pin / Unpin action */}
                {!actionTargetMessage.is_deleted && (
                  <button
                    type="button"
                    className="wa-context-action-item"
                    onClick={() => {
                      const isPinned = pinnedMessageId === actionTargetMessage.id;
                      const nextPin = isPinned ? null : actionTargetMessage.id;
                      setPinnedMessageId(nextPin);
                      socketRef.current?.send(JSON.stringify({
                        action: 'pin-message',
                        messageId: nextPin,
                      }));
                      closeActionMenu();
                      setToastNotice(nextPin ? 'Message pinned to top' : 'Message unpinned');
                      setTimeout(() => setToastNotice(''), 2500);
                    }}
                  >
                    <span>{pinnedMessageId === actionTargetMessage.id ? 'Unpin' : 'Pin to top'}</span>
                    <Pin size={15} />
                  </button>
                )}

                {/* Forward action */}
                {!actionTargetMessage.is_deleted && (
                  <button
                    type="button"
                    className="wa-context-action-item"
                    onClick={() => {
                      setForwardTargetMessage(actionTargetMessage);
                      setShowForwardModal(true);
                      closeActionMenu();
                    }}
                  >
                    <span>Forward</span>
                    <Forward size={15} />
                  </button>
                )}

                {actionTargetMessage.mine &&
                  !actionTargetMessage.media_url &&
                  !actionTargetMessage.is_deleted &&
                  Date.now() - messageTime(actionTargetMessage.created_at) <= 15 * 60_000 && (
                    <button
                      type="button"
                      className="wa-context-action-item"
                      onClick={() => {
                        beginEdit(actionTargetMessage);
                        closeActionMenu();
                      }}
                    >
                      <span>Edit</span>
                      <Pencil size={15} />
                    </button>
                  )}

                {actionTargetMessage.mine && !actionTargetMessage.is_deleted && (
                  <>
                    <div className="wa-context-action-divider" />
                    <button
                      type="button"
                      className="wa-context-action-item is-delete"
                      onClick={() => {
                        deleteForEveryone(actionTargetMessage.id);
                        closeActionMenu();
                      }}
                    >
                      <span>Delete for everyone</span>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {toastNotice && (
          <div className="wa-toast-notice">
            {toastNotice}
          </div>
        )}
        {(replyTarget || editingMessageId) && <div className="community-composer-context"><div><b>{editingMessageId ? 'Editing your message' : `Replying to ${replyTarget?.mine ? 'your message' : `#${replyTarget?.username}`}`}</b><span>{editingMessageId ? messages.find((m) => m.id === editingMessageId)?.body : replyTarget?.body}</span></div><button type="button" onClick={() => { setReplyTarget(null); editingMessageIdRef.current = null; setEditingMessageId(null); setValue(''); }} aria-label="Cancel reply or edit"><X size={16} /></button></div>}
    {activeGame && (
      <div className="chat-game-panel">
        <div className="chat-game-panel-head">
          <div className="chat-game-title-badge">
            <Gamepad2 size={16} />
            <span>Tic-Tac-Toe</span>
            <span className="chat-game-size-pill">{activeGame.grid_size}×{activeGame.grid_size}</span>
          </div>
          <div className="chat-game-players">
            {activeGame.grid_size === 6 && (
              <div className="chat-game-scores" title="Points (3-in-a-row matches)">
                <span className="chat-score-badge is-x">X: {activeGame.score_x ?? 0} pts</span>
                <span className="chat-score-divider">vs</span>
                <span className="chat-score-badge is-o">O: {activeGame.score_o ?? 0} pts</span>
              </div>
            )}
            <span className={`chat-player-tag is-x ${activeGame.turn_user_id === activeGame.player_x_id && activeGame.status === 'in_progress' ? 'is-current-turn' : ''}`}>
              #{activeGame.player_x_username} (X)
            </span>
            <span className={`chat-player-tag is-o ${activeGame.turn_user_id === activeGame.player_o_id && activeGame.status === 'in_progress' ? 'is-current-turn' : ''}`}>
              #{activeGame.player_o_username} (O)
            </span>
            <button
              type="button"
              className="chat-games-close-btn"
              onClick={() => {
                if (activeGame.status === 'in_progress') abandonGame();
                else closeGame();
              }}
              title="Close game"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="chat-game-status-bar">
          {activeGame.status === 'won' ? (
            <span className="chat-game-turn-pill won">
              <Trophy size={13} /> {activeGame.winner_id === currentUser?.id ? '🎉 You won the game!' : `👏 #${activeGame.winner_id === activeGame.player_x_id ? activeGame.player_x_username : activeGame.player_o_username} won the game!`}
              {activeGame.grid_size === 6 && ` (${activeGame.score_x ?? 0} - ${activeGame.score_o ?? 0} pts)`}
            </span>
          ) : activeGame.status === 'draw' ? (
            <span className="chat-game-turn-pill draw">
              🤝 It's a draw!
              {activeGame.grid_size === 6 && ` (${activeGame.score_x ?? 0} - ${activeGame.score_o ?? 0} pts)`}
            </span>
          ) : isMyTurn ? (
            <span className="chat-game-turn-pill my-turn">
              <span className="chat-turn-dot" /> Your turn! Tap an empty square ({mySymbol}){activeGame.grid_size === 6 ? ' · Match 3 for 1 pt' : ''}
            </span>
          ) : (
            <span className="chat-game-turn-pill peer-turn">
              <span className="chat-turn-dot waiting" /> Waiting for #{peerUsername}'s move ({peerSymbol})...
            </span>
          )}
        </div>

        <div className="chat-board-wrap">
          <div className={`chat-board grid-${activeGame.grid_size}`}>
            {activeGame.board_state.map((cell, idx) => (
              <button
                key={idx}
                type="button"
                className={`chat-board-cell ${cell === 'X' ? 'cell-x' : cell === 'O' ? 'cell-o' : ''} ${activeGame.winning_line?.includes(idx) ? 'winning-cell' : ''}`}
                disabled={!!cell || activeGame.status !== 'in_progress' || !isMyTurn}
                onClick={() => makeGameMove(idx)}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>

        {activeGame.status !== 'in_progress' ? (
          <div className="chat-game-foot">
            <button type="button" className="chat-game-action-btn primary" onClick={() => startGame(3)}>
              <RotateCcw size={12} /> Play Again (3×3)
            </button>
            <button type="button" className="chat-game-action-btn primary" onClick={() => startGame(6)}>
              <RotateCcw size={12} /> Play Again (6×6)
            </button>
            <button type="button" className="chat-game-action-btn" onClick={closeGame}>
              Close
            </button>
          </div>
        ) : (
          <div className="chat-game-foot">
            <small style={{ fontSize: '10px', color: '#888b80', fontFamily: 'var(--mono)' }}>
              {activeGame.grid_size === 3 ? 'Classic: 3 in a row to win' : 'Points Battle: Match 3 in a row for 1 pt · Ends when board fills or no lines remain'}
            </small>
            <button type="button" className="chat-game-action-btn" onClick={abandonGame} style={{ marginLeft: 'auto' }}>
              End Game
            </button>
          </div>
        )}
      </div>
    )}
    {showGamesMenu && (
      <div className="chat-games-sheet">
        <div className="chat-games-sheet-head">
          <strong><Gamepad2 size={16} /> Play in Chat</strong>
          <button type="button" className="chat-games-close-btn" onClick={() => setShowGamesMenu(false)} aria-label="Close games">
            <X size={15} />
          </button>
        </div>
        <div className="chat-games-grid">
          <div className="chat-game-card">
            <div className="chat-game-card-head">
              <div className="chat-game-title-group">
                <span className="chat-game-icon-box"><Gamepad2 size={16} /></span>
                <strong>Tic-Tac-Toe</strong>
              </div>
              <span className="chat-game-badge active-badge">Ready</span>
            </div>
            <p>Choose your grid size and take turns directly in this chat.</p>
            <div className="chat-grid-selector">
              <button type="button" className={`chat-grid-btn ${selectedGridSize === 3 ? 'selected' : ''}`} onClick={() => setSelectedGridSize(3)}>
                <strong>3 × 3</strong>
                <small>Classic · 3 in a row</small>
              </button>
              <button type="button" className={`chat-grid-btn ${selectedGridSize === 6 ? 'selected' : ''}`} onClick={() => setSelectedGridSize(6)}>
                <strong>6 × 6</strong>
                <small>Points Battle · 3 in a row</small>
              </button>
            </div>
            <button type="button" className="chat-game-start-btn" onClick={() => startGame(selectedGridSize)} disabled={gameBusy}>
              <Gamepad2 size={14} /> Start Game ({selectedGridSize}×{selectedGridSize})
            </button>
          </div>

          <div className="chat-game-card disabled">
            <div className="chat-game-card-head">
              <div className="chat-game-title-group">
                <span className="chat-game-icon-box"><Sparkles size={16} /></span>
                <strong>Truth or Dare</strong>
              </div>
              <span className="chat-game-badge coming-soon-badge">Coming soon</span>
            </div>
            <p>Spicy, funny, and casual questions for two people. Currently in development.</p>
            <button type="button" className="chat-game-action-btn" disabled style={{ marginTop: 'auto', opacity: 0.6 }}>
              Coming soon
            </button>
          </div>
        </div>
      </div>
    )}
    {showGifPicker && (
      <div className="chat-gif-picker-modal">
        <div className="chat-gif-picker-head">
          <strong><Film size={15} /> GIF Reactions</strong>
          <button type="button" className="chat-gif-close-btn" onClick={() => setShowGifPicker(false)} aria-label="Close GIF picker">
            <X size={15} />
          </button>
        </div>
        <div className="chat-gif-picker-grid">
          {POPULAR_REACTION_GIFS.map((g) => (
            <button key={g.url} type="button" className="chat-gif-item" onClick={() => sendGif(g.url)}>
              <img src={g.url} alt={g.label} loading="lazy" />
              <span>{g.label}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    {zoomImageUrl && (
      <div className="chat-image-lightbox" onClick={() => setZoomImageUrl(null)}>
        <button type="button" className="chat-lightbox-close" onClick={() => setZoomImageUrl(null)} aria-label="Close image">
          <X size={22} />
        </button>
        <img src={zoomImageUrl} alt="Enlarged view" onClick={(e) => e.stopPropagation()} />
      </div>
    )}

    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,audio/*,.pdf,.docx,.pptx,.xlsx,.txt,.csv,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,text/markdown"
      style={{ display: 'none' }}
      onChange={(e) => void handleFileSelect(e)}
    />

    {kind === 'group' && isAnnouncementOnly && !isAdmin ? (
      <div className="wa-announcement-locked-banner">
        <Shield size={16} />
        <span>Only community admins can send messages in this group</span>
      </div>
    ) : recordingVoice ? (
      <div className="voice-recording-bar">
        <div className="voice-recording-pulse" />
        <span className="voice-recording-timer">
          Recording {Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, '0')}
        </span>
        <button type="button" className="voice-cancel-btn" onClick={cancelVoiceRecording} title="Cancel recording">
          <X size={16} /> Cancel
        </button>
        <button type="button" className="voice-send-btn" onClick={stopAndSendVoiceNote} title="Send voice note" disabled={uploadingMedia}>
          {uploadingMedia ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
        </button>
      </div>
    ) : (
      <>
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <div className="chat-mention-autocomplete-popup">
            <div className="chat-mention-popup-title">Mention member</div>
            {filteredMembers.slice(0, 5).map((m) => (
              <button
                key={m.id}
                type="button"
                className="chat-mention-popup-item"
                onClick={() => insertMention(m.username)}
              >
                <span className="chat-mention-popup-avatar">{m.username[0]?.toUpperCase()}</span>
                <span className="chat-mention-popup-name">@{m.username}</span>
              </button>
            ))}
          </div>
        )}
        <form className="student-addit-composer" onSubmit={send}>
          <button
            type="button"
            className={`composer-circle-btn plus-btn ${showAttachmentMenu ? 'active' : ''}`}
            onClick={() => {
              setShowGamesMenu(false);
              setShowGifPicker(false);
              setShowAttachmentMenu((v) => !v);
            }}
            title="Attachments & Actions"
            aria-label="Attachments & Actions"
          >
            <Plus size={20} />
          </button>

          <div className="composer-input-pill">
            <input
              disabled={!live}
              value={value}
              onChange={(e) => {
                const text = e.target.value;
                setValue(text);
                if (text.trim()) {
                  emitTyping(true);
                } else {
                  emitTyping(false);
                }
                const cursorPos = e.target.selectionStart ?? text.length;
                const textBeforeCursor = text.slice(0, cursorPos);
                const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
                if (match) {
                  setMentionQuery(match[1].toLowerCase());
                } else {
                  setMentionQuery(null);
                }
              }}
              onBlur={() => {
                emitTyping(false);
                setTimeout(() => setMentionQuery(null), 250);
              }}
              maxLength={2000}
              placeholder={!live ? 'Reconnecting to this room…' : editingMessageId ? 'Edit your message…' : 'Message...'}
              aria-label={editingMessageId ? 'Edit message' : 'Message'}
            />
            <button
              type="button"
              className="composer-pill-icon-btn"
              onClick={() => setShowGifPicker((v) => !v)}
              title="GIF reactions"
              aria-label="Choose GIF"
              disabled={!live}
            >
              <Smile size={19} />
            </button>
            <button
              type="button"
              className="composer-pill-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach photo or document"
              aria-label="Attach photo or document"
              disabled={!live || uploadingMedia}
            >
              {uploadingMedia ? <LoaderCircle size={18} className="spin" /> : <Paperclip size={19} />}
            </button>
          </div>

          {value.trim() || editingMessageId ? (
            <button
              type="submit"
              className="composer-circle-btn send-btn"
              disabled={!live || !value.trim()}
              aria-label={editingMessageId ? 'Save edit' : 'Send message'}
            >
              {editingMessageId ? <Check size={20} /> : <Send size={18} />}
            </button>
          ) : (
            <button
              type="button"
              className="composer-circle-btn mic-btn"
              onClick={() => void startVoiceRecording()}
              title="Record voice note"
              aria-label="Record voice note"
              disabled={!live || uploadingMedia}
            >
              <Mic size={20} />
            </button>
          )}
        </form>
      </>
    )}

    {/* WhatsApp Composer Attachment Menu */}
    {showAttachmentMenu && (
      <div className="whatsapp-attachment-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="whatsapp-attachment-grid">
          <button
            type="button"
            className="whatsapp-attach-item doc-item"
            onClick={() => {
              setShowAttachmentMenu(false);
              fileInputRef.current?.click();
            }}
          >
            <span className="whatsapp-attach-icon-circle doc-color">
              <FileText size={22} />
            </span>
            <span className="whatsapp-attach-label">Document</span>
          </button>
          <button
            type="button"
            className="whatsapp-attach-item poll-item"
            onClick={() => {
              setShowAttachmentMenu(false);
              setShowInChatPollModal(true);
            }}
          >
            <span className="whatsapp-attach-icon-circle poll-color">
              <BarChart2 size={22} />
            </span>
            <span className="whatsapp-attach-label">Poll</span>
          </button>
          {kind === 'group' && (
            <button
              type="button"
              className="whatsapp-attach-item studies-item"
              onClick={() => {
                setShowAttachmentMenu(false);
                setShowCreateStudyModal(true);
              }}
            >
              <span className="whatsapp-attach-icon-circle studies-color">
                <BookOpen size={22} />
              </span>
              <span className="whatsapp-attach-label">Studies</span>
            </button>
          )}
          {kind === 'dm' && (
            <button
              type="button"
              className="whatsapp-attach-item games-item"
              onClick={() => {
                setShowAttachmentMenu(false);
                setShowGamesMenu(true);
              }}
            >
              <span className="whatsapp-attach-icon-circle games-color">
                <Gamepad2 size={22} />
              </span>
              <span className="whatsapp-attach-label">Games</span>
            </button>
          )}
          <button
            type="button"
            className="whatsapp-attach-item media-item"
            onClick={() => {
              setShowAttachmentMenu(false);
              fileInputRef.current?.click();
            }}
          >
            <span className="whatsapp-attach-icon-circle media-color">
              <Paperclip size={22} />
            </span>
            <span className="whatsapp-attach-label">Photos</span>
          </button>
        </div>
      </div>
    )}

    {error && <div className="chat-error">{error}</div>}</> : kind === 'group' && section === 'studies' ? (
      <GroupStudies
        token={token}
        id={id}
        isAdmin={isAdmin}
        onOpenUpload={() => setShowCreateStudyModal(true)}
      />
    ) : kind === 'group' ? (
      <GroupPolls
        token={token}
        id={id}
        isAdmin={isAdmin}
        onOpenCreatePoll={() => setShowCreatePollModal(true)}
      />
    ) : null}

    {/* Group Info & Actions Modals */}
    {kind === 'group' && (
      <>
        <GroupInfoSheet
          token={token}
          id={id}
          isAdmin={isAdmin}
          groupName={label.replace(/^#/, '')}
          isOpen={showGroupInfo}
          onClose={() => setShowGroupInfo(false)}
          onRefresh={onRefresh}
          onSelectSection={(sec) => {
            setSection(sec);
            setShowGroupInfo(false);
          }}
          currentUser={currentUser}
        />
        <CreatePollModal
          token={token}
          groupId={id}
          isOpen={showCreatePollModal}
          onClose={() => setShowCreatePollModal(false)}
          onCreated={() => {
            setSection('polls');
            void onRefresh();
          }}
        />
        <CreateStudyModal
          token={token}
          groupId={id}
          isOpen={showCreateStudyModal}
          onClose={() => setShowCreateStudyModal(false)}
          onCreated={() => {
            setSection('studies');
            void onRefresh();
          }}
        />
      </>
    )}

    {/* Expanded Chat Feature Modals */}
    <InChatPollModal
      token={token}
      kind={kind}
      id={id}
      isOpen={showInChatPollModal}
      onClose={() => setShowInChatPollModal(false)}
      onCreated={() => {
        void load();
      }}
    />

    <ForwardMessageModal
      isOpen={showForwardModal}
      onClose={() => {
        setShowForwardModal(false);
        setForwardTargetMessage(null);
      }}
      messageToForward={forwardTargetMessage}
      dms={dms || []}
      groups={groups || []}
      onForward={handleForwardMessage}
    />

    <StarredMessagesModal
      isOpen={showStarredModal}
      onClose={() => setShowStarredModal(false)}
      kind={kind}
      id={id}
      token={token}
      onJumpToMessage={(msgId) => {
        setShowStarredModal(false);
        void jumpToMessage(msgId);
      }}
      onUnstar={async (msgId) => {
        await request(`/chat/messages/${encodeURIComponent(msgId)}/star`, token, {
          method: 'POST',
        });
        setMessages((curr) => curr.map((m) => m.id === msgId ? { ...m, is_starred: 0 } : m));
      }}
    />

    <MediaGalleryDrawer
      isOpen={showMediaGallery}
      onClose={() => setShowMediaGallery(false)}
      messages={visibleMessages}
      token={token}
      onZoomImage={setZoomImageUrl}
      onJumpToMessage={(msgId) => {
        setShowMediaGallery(false);
        void jumpToMessage(msgId);
      }}
    />

    <DisappearingMessagesModal
      isOpen={showDisappearingModal}
      onClose={() => setShowDisappearingModal(false)}
      currentDuration={disappearingDuration}
      onSelectDuration={handleUpdateDisappearingDuration}
    />
  </>;
}

function GroupInfoSheet({
  token,
  id,
  isAdmin,
  groupName,
  isOpen,
  onClose,
  onRefresh,
  onSelectSection,
  currentUser,
}: {
  token: string;
  id: string;
  isAdmin: boolean;
  groupName: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSelectSection: (sec: 'chat' | 'studies' | 'polls') => void;
  currentUser?: { id: string; username: string } | null;
}) {
  const [username, setUsername] = useState('');
  const [members, setMembers] = useState<{ user_id: string; username: string; role: string }[]>([]);
  const [group, setGroup] = useState<{ name: string; visibility: 'public' | 'private'; require_approval: number }>({ name: groupName, visibility: 'public', require_approval: 0 });
  const [inviteLinks, setInviteLinks] = useState<{ id: string; created_at: string; use_count: number; last_used_at: string | null }[]>([]);
  const [joinRequests, setJoinRequests] = useState<{ id: string; user_id: string; username: string; created_at: string }[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteQr, setInviteQr] = useState('');
  const [searchMember, setSearchMember] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(groupName);
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>('public');
  const [editApproval, setEditApproval] = useState(false);
  const [editAnnouncementOnly, setEditAnnouncementOnly] = useState(false);
  const [editDisappearingDuration, setEditDisappearingDuration] = useState<number>(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await request<{
        members: typeof members;
        group: typeof group & { announcement_only?: number | boolean; disappearing_duration_seconds?: number };
        inviteLinks: typeof inviteLinks;
        joinRequests?: typeof joinRequests;
      }>(`/groups/${encodeURIComponent(id)}`, token);
      setMembers(data.members || []);
      setGroup(data.group);
      setEditName(data.group.name);
      setEditVisibility(data.group.visibility);
      setEditApproval(Boolean(data.group.require_approval));
      setEditAnnouncementOnly(Boolean(data.group.announcement_only));
      setEditDisappearingDuration(Number(data.group.disappearing_duration_seconds || 0));
      setInviteLinks(data.inviteLinks ?? []);
      setJoinRequests(data.joinRequests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load group info.');
    }
  }, [id, token]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load]);

  if (!isOpen) return null;

  const saveSettings = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    try {
      setBusy(true);
      await request(`/groups/${encodeURIComponent(id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          visibility: editVisibility,
          requireApproval: editApproval,
          announcementOnly: editAnnouncementOnly,
          disappearingDurationSeconds: editDisappearingDuration,
        }),
      });
      setIsEditingName(false);
      setError('Group settings updated.');
      await load();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  const inviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      setBusy(true);
      await request(`/groups/${encodeURIComponent(id)}/invitations`, token, {
        method: 'POST',
        body: JSON.stringify({ username: username.trim() }),
      });
      setUsername('');
      setError('Invitation sent.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not invite member.');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string, targetUsername: string) => {
    if (!window.confirm(`Remove @${targetUsername} from ${group.name}?`)) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/members?userId=${encodeURIComponent(userId)}`, token, {
        method: 'DELETE',
      });
      await load();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove member.');
    }
  };

  const handleJoinRequest = async (requestId: string, status: 'accepted' | 'declined') => {
    try {
      await request(`/groups/join-requests/${encodeURIComponent(requestId)}`, token, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await load();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${status} request.`);
    }
  };

  const createInviteLink = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await request<{ inviteLink: { id: string; token: string } }>(
        `/groups/${encodeURIComponent(id)}/invite-links`,
        token,
        { method: 'POST' }
      );
      const url = groupInviteUrl(data.inviteLink.token);
      setInviteUrl(url);
      setInviteQr(
        await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 240,
          color: { dark: '#28302a', light: '#fbfaf6' },
        })
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite link.');
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const field = document.createElement('textarea');
      field.value = inviteUrl;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } else setError('Copy was blocked. Select and copy the invite link instead.');
    }
  };

  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${group.name} · Adda group`,
          text: `Join ${group.name} on Adda`,
          url: inviteUrl,
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Could not open the share sheet.');
      }
    } else await copyInvite();
  };

  const revokeInvite = async (linkId: string) => {
    if (!window.confirm('Revoke this group invite link? Anyone holding it will no longer be able to join.')) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/invite-links/${encodeURIComponent(linkId)}`, token, {
        method: 'DELETE',
      });
      setInviteUrl('');
      setInviteQr('');
      await load();
      setError('Invite link revoked.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke this link.');
    }
  };

  const downloadQr = () => {
    if (!inviteQr) return;
    const link = document.createElement('a');
    link.href = inviteQr;
    link.download = `${group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'adda'}-group-invite.png`;
    link.click();
  };

  const leaveGroup = async () => {
    if (isAdmin) {
      alert('Group admins cannot leave the group directly. Please transfer admin ownership first.');
      return;
    }
    if (!window.confirm(`Are you sure you want to leave ${group.name}?`)) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/leave`, token, { method: 'POST' });
      onClose();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave group.');
    }
  };

  const filteredMembers = members.filter((m) =>
    m.username.toLowerCase().includes(searchMember.toLowerCase().trim())
  );

  return (
    <div className="wa-drawer-backdrop" onClick={onClose}>
      <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wa-drawer-header">
          <button type="button" className="wa-drawer-back-btn" onClick={onClose} aria-label="Close group info">
            <ArrowLeft size={20} />
          </button>
          <h2>Group Info</h2>
          <button type="button" className="wa-drawer-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="wa-drawer-content">
          {/* Hero Profile Card */}
          <div className="wa-info-hero-card">
            <div className="wa-info-avatar">
              <span>{group.name[0]?.toUpperCase() || <Users size={28} />}</span>
            </div>
            {isEditingName && isAdmin ? (
              <form className="wa-name-edit-form" onSubmit={(e) => void saveSettings(e)}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
                <button type="submit" disabled={busy}><Check size={16} /></button>
                <button type="button" onClick={() => setIsEditingName(false)}><X size={16} /></button>
              </form>
            ) : (
              <div className="wa-info-title-row">
                <h1>{group.name}</h1>
                {isAdmin && (
                  <button type="button" className="wa-edit-btn" onClick={() => setIsEditingName(true)} title="Edit group name">
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            )}
            <p className="wa-info-subtitle">
              Group · {members.length} {members.length === 1 ? 'participant' : 'participants'}
            </p>
            <div className="wa-info-pills">
              <span className={`wa-pill ${group.visibility}`}>
                <Globe size={12} /> {group.visibility === 'public' ? 'Public Group' : 'Private Group'}
              </span>
              {isAdmin && <span className="wa-pill admin-badge"><Shield size={12} /> You're Admin</span>}
            </div>
          </div>

          {/* Quick Action Shortcuts */}
          <div className="wa-info-actions-row">
            <button type="button" className="wa-action-shortcut" onClick={() => onSelectSection('chat')}>
              <span className="wa-shortcut-icon chat-bg"><MessageSquareText size={18} /></span>
              <span>Chat</span>
            </button>
            <button type="button" className="wa-action-shortcut" onClick={() => onSelectSection('studies')}>
              <span className="wa-shortcut-icon studies-bg"><BookOpen size={18} /></span>
              <span>Studies</span>
            </button>
            <button type="button" className="wa-action-shortcut" onClick={() => onSelectSection('polls')}>
              <span className="wa-shortcut-icon polls-bg"><CircleHelp size={18} /></span>
              <span>Polls</span>
            </button>
          </div>

          {/* Join Requests (Admin Only) */}
          {isAdmin && joinRequests.length > 0 && (
            <div className="wa-info-section-card">
              <div className="wa-section-card-title">
                <UserCheck size={16} />
                <span>Pending Join Requests ({joinRequests.length})</span>
              </div>
              <div className="wa-join-requests-list">
                {joinRequests.map((req) => (
                  <div className="wa-join-request-row" key={req.id}>
                    <div>
                      <b>#{req.username}</b>
                      <small>{new Date(req.created_at).toLocaleDateString()}</small>
                    </div>
                    <div className="wa-request-btn-group">
                      <button type="button" className="wa-accept-btn" onClick={() => void handleJoinRequest(req.id, 'accepted')}>
                        Accept
                      </button>
                      <button type="button" className="wa-decline-btn" onClick={() => void handleJoinRequest(req.id, 'declined')}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin Group Settings Card */}
          {isAdmin && (
            <div className="wa-info-section-card">
              <div className="wa-section-card-title">
                <Shield size={16} />
                <span>Group Permissions &amp; Settings</span>
              </div>
              <form className="wa-settings-form" onSubmit={(e) => void saveSettings(e)}>
                <label className="wa-setting-field">
                  <span>Group Visibility</span>
                  <select
                    value={editVisibility}
                    onChange={(e) => setEditVisibility(e.target.value as 'public' | 'private')}
                  >
                    <option value="public">Public · Searchable by anyone</option>
                    <option value="private">Private · Invite link only</option>
                  </select>
                </label>
                <label className="wa-setting-toggle">
                  <input
                    type="checkbox"
                    checked={editApproval}
                    onChange={(e) => setEditApproval(e.target.checked)}
                  />
                  <span>Approve new members before they can join</span>
                </label>
                <label className="wa-setting-toggle">
                  <input
                    type="checkbox"
                    checked={editAnnouncementOnly}
                    onChange={(e) => setEditAnnouncementOnly(e.target.checked)}
                  />
                  <span>Announcement-only (only admins can send messages)</span>
                </label>
                <label className="wa-setting-field">
                  <span>Disappearing Messages</span>
                  <select
                    value={editDisappearingDuration}
                    onChange={(e) => setEditDisappearingDuration(Number(e.target.value))}
                  >
                    <option value={0}>Off</option>
                    <option value={86400}>24 hours</option>
                    <option value={604800}>7 days</option>
                    <option value={7776000}>90 days</option>
                  </select>
                </label>
                <button type="submit" className="wa-save-settings-btn" disabled={busy}>
                  <Check size={15} /> Save Changes
                </button>
              </form>
            </div>
          )}

          {/* Invite via Link & QR */}
          <div className="wa-info-section-card">
            <div className="wa-section-card-title">
              <Link2 size={16} />
              <span>Invite via Link &amp; QR</span>
            </div>
            {isAdmin && (
              <div className="wa-invite-create-bar">
                <button
                  type="button"
                  className="wa-create-link-btn"
                  onClick={() => {
                    if (!inviteLinks.length || window.confirm('Create a new link and revoke the old one?')) void createInviteLink();
                  }}
                  disabled={busy}
                >
                  <Link2 size={14} /> {busy ? 'Creating...' : inviteLinks.length ? 'Rotate Link' : 'Generate Invite Link'}
                </button>
              </div>
            )}
            {inviteUrl ? (
              <div className="wa-invite-active-box">
                <input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
                <div className="wa-invite-actions-row">
                  <button type="button" onClick={() => void copyInvite()}>
                    <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button type="button" onClick={() => void shareInvite()}>
                    <ArrowUpRight size={14} /> Share
                  </button>
                  <button type="button" onClick={downloadQr} disabled={!inviteQr}>
                    <QrCode size={14} /> Save QR
                  </button>
                </div>
                {inviteQr && (
                  <div className="wa-invite-qr-preview">
                    <img src={inviteQr} alt={`QR for ${group.name}`} />
                    <small>Scan to preview &amp; join group</small>
                  </div>
                )}
              </div>
            ) : inviteLinks.length > 0 ? (
              <div className="wa-active-links-list">
                <p className="wa-muted-tip">
                  Active link ({inviteLinks[0].use_count} joins). Rotate it to get a fresh copy and QR code.
                </p>
                {isAdmin && inviteLinks.map((link) => (
                  <div className="wa-active-link-row" key={link.id}>
                    <span><Link2 size={13} /> Active · {link.use_count} joins</span>
                    <button type="button" onClick={() => void revokeInvite(link.id)}>Revoke</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wa-muted-tip">No active invite link yet. Tap Generate Link above.</p>
            )}
          </div>

          {/* Participants Card */}
          <div className="wa-info-section-card">
            <div className="wa-section-card-title">
              <Users size={16} />
              <span>{members.length} {members.length === 1 ? 'Participant' : 'Participants'}</span>
            </div>

            {isAdmin && (
              <form className="wa-add-member-form" onSubmit={(e) => void inviteMember(e)}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Invite by adda ID (e.g. mahi23)"
                  aria-label="Invite by adda ID"
                />
                <button type="submit" disabled={!username.trim() || busy}>
                  <UserPlus size={15} /> Invite
                </button>
              </form>
            )}

            <div className="wa-member-search">
              <Search size={14} />
              <input
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                placeholder="Search participants..."
              />
            </div>

            <div className="wa-members-list">
              {filteredMembers.map((m) => {
                const isMe = currentUser?.id === m.user_id;
                const isMemberAdmin = m.role === 'admin';
                return (
                  <div className="wa-member-row" key={m.user_id}>
                    <div className="wa-member-avatar">
                      <span>{m.username[0]?.toUpperCase()}</span>
                    </div>
                    <div className="wa-member-info">
                      <b>#{m.username} {isMe && <span className="wa-you-tag">(You)</span>}</b>
                      {isMemberAdmin && <span className="wa-role-tag">Group Admin</span>}
                    </div>
                    {isAdmin && !isMe && !isMemberAdmin && (
                      <button
                        type="button"
                        className="wa-remove-member-btn"
                        onClick={() => void removeMember(m.user_id, m.username)}
                        title="Remove from group"
                      >
                        <UserMinus size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
              {!filteredMembers.length && <p className="wa-muted-tip">No participants matched your search.</p>}
            </div>
          </div>

          {/* Danger zone / Leave group */}
          <div className="wa-info-footer-card">
            <button type="button" className="wa-leave-btn" onClick={() => void leaveGroup()}>
              <LogOut size={16} /> Leave Group
            </button>
          </div>

          {error && <div className="wa-drawer-toast">{error}</div>}
        </div>
      </div>
    </div>
  );
}

function CreatePollModal({
  token,
  groupId,
  isOpen,
  onClose,
  onCreated,
}: {
  token: string;
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const addOption = () => {
    if (options.length < 8) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx));
    }
  };

  const updateOption = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanQ = question.trim();
    if (cleanQ.length < 3) {
      setError('Please enter a question with at least 3 characters.');
      return;
    }
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOpts.length < 2) {
      setError('Please provide at least 2 non-empty options.');
      return;
    }
    const lower = cleanOpts.map((o) => o.toLowerCase());
    if (new Set(lower).size !== cleanOpts.length) {
      setError('All options must be unique.');
      return;
    }

    try {
      setBusy(true);
      setError('');
      await request(`/groups/${encodeURIComponent(groupId)}/polls`, token, {
        method: 'POST',
        body: JSON.stringify({ question: cleanQ, options: cleanOpts }),
      });
      setQuestion('');
      setOptions(['', '']);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create poll.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div className="wa-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-header">
          <div className="wa-modal-title">
            <span className="wa-modal-icon-badge poll-bg"><BarChart2 size={18} /></span>
            <div>
              <h3>Create Poll</h3>
              <small>Ask a question for group members</small>
            </div>
          </div>
          <button type="button" className="wa-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="wa-modal-form">
          <div className="wa-modal-field">
            <label>Question</label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask your question..."
              maxLength={240}
              autoFocus
              required
            />
          </div>

          <div className="wa-modal-field">
            <div className="wa-field-header">
              <label>Options</label>
              <small>{options.length}/8 options</small>
            </div>
            <div className="wa-poll-options-inputs">
              {options.map((opt, idx) => (
                <div className="wa-poll-input-row" key={idx}>
                  <span className="wa-option-number">{idx + 1}</span>
                  <input
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    maxLength={160}
                    required={idx < 2}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="wa-remove-opt-btn"
                      onClick={() => removeOption(idx)}
                      title="Remove option"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 8 && (
              <button type="button" className="wa-add-opt-btn" onClick={addOption}>
                <Plus size={15} /> Add option
              </button>
            )}
          </div>

          {error && <div className="wa-form-error">{error}</div>}

          <div className="wa-modal-actions">
            <button type="button" className="wa-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="wa-submit-btn poll-theme" disabled={busy || !question.trim()}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <BarChart2 size={16} />}
              <span>Create Poll</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateStudyModal({
  token,
  groupId,
  isOpen,
  onClose,
  onCreated,
}: {
  token: string;
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [mode, setMode] = useState<'note' | 'file'>('note');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSections = useCallback(async () => {
    try {
      const data = await request<{ sections: { id: string; name: string }[] }>(
        `/groups/${encodeURIComponent(groupId)}/studies`,
        token
      );
      setSections(data.sections || []);
      if (data.sections && data.sections.length > 0 && !selectedSectionId) {
        setSelectedSectionId(data.sections[0].id);
      }
      if (!data.sections || data.sections.length === 0) {
        setIsCreatingFolder(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load folders.');
    }
  }, [groupId, selectedSectionId, token]);

  useEffect(() => {
    if (isOpen) {
      void loadSections();
    }
  }, [isOpen, loadSections]);

  if (!isOpen) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      let sectionId = selectedSectionId;

      if (isCreatingFolder) {
        const folderName = newFolderName.trim();
        if (folderName.length < 2) {
          setError('Folder names need at least 2 characters.');
          setBusy(false);
          return;
        }
        const created = await request<{ section: { id: string } }>(
          `/groups/${encodeURIComponent(groupId)}/studies/sections`,
          token,
          { method: 'POST', body: JSON.stringify({ name: folderName }) }
        );
        sectionId = created.section.id;
        setSelectedSectionId(sectionId);
        setIsCreatingFolder(false);
        setNewFolderName('');
      }

      if (!sectionId) {
        setError('Please select or create a study folder first.');
        setBusy(false);
        return;
      }

      if (mode === 'note') {
        const text = body.trim();
        if (!text) {
          setError('Write a study note before posting.');
          setBusy(false);
          return;
        }
        await request(
          `/groups/${encodeURIComponent(groupId)}/studies/sections/${encodeURIComponent(sectionId)}`,
          token,
          { method: 'POST', body: JSON.stringify({ body: text }) }
        );
      } else {
        if (!file) {
          setError('Select a document or file to upload.');
          setBusy(false);
          return;
        }
        const res = await fetch(
          `${apiRoot}/groups/${encodeURIComponent(groupId)}/studies/sections/${encodeURIComponent(sectionId)}/files`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': file.type || 'application/octet-stream',
              'x-file-name': encodeURIComponent(file.name),
            },
            body: file,
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not upload file.');
      }

      setBody('');
      setFile(null);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save study item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div className="wa-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-header">
          <div className="wa-modal-title">
            <span className="wa-modal-icon-badge studies-bg"><BookOpen size={18} /></span>
            <div>
              <h3>Share Study Material</h3>
              <small>Share notes or upload files for this group</small>
            </div>
          </div>
          <button type="button" className="wa-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="wa-modal-form">
          {/* Folder selector */}
          <div className="wa-modal-field">
            <div className="wa-field-header">
              <label>Study Folder</label>
              {sections.length > 0 && (
                <button
                  type="button"
                  className="wa-link-btn"
                  onClick={() => setIsCreatingFolder((v) => !v)}
                >
                  {isCreatingFolder ? 'Choose existing' : '+ New folder'}
                </button>
              )}
            </div>
            {isCreatingFolder ? (
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name (e.g. Unit 1 Notes, Formulas)"
                maxLength={80}
                required
                autoFocus
              />
            ) : (
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                required
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Mode Tabs: Note vs File */}
          <div className="wa-mode-tabs">
            <button
              type="button"
              className={mode === 'note' ? 'active' : ''}
              onClick={() => setMode('note')}
            >
              <FileText size={15} /> Write Note
            </button>
            <button
              type="button"
              className={mode === 'file' ? 'active' : ''}
              onClick={() => setMode('file')}
            >
              <Paperclip size={15} /> Upload File / PDF
            </button>
          </div>

          {mode === 'note' ? (
            <div className="wa-modal-field">
              <label>Study Note Content</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write study notes, questions, summaries, or formulas..."
                rows={4}
                required
              />
            </div>
          ) : (
            <div className="wa-modal-field">
              <label>Choose File (PDF, DOCX, PPT, Image up to 25 MB)</label>
              <div className="wa-file-dropzone">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
                {file ? (
                  <div className="wa-chosen-file-preview">
                    <b>{file.name}</b>
                    <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                  </div>
                ) : (
                  <p>Click or drag a file to attach</p>
                )}
              </div>
            </div>
          )}

          {error && <div className="wa-form-error">{error}</div>}

          <div className="wa-modal-actions">
            <button type="button" className="wa-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="wa-submit-btn studies-theme" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <BookOpen size={16} />}
              <span>Share with Group</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InChatPollModal({
  token,
  kind,
  id,
  isOpen,
  onClose,
  onCreated,
}: {
  token: string;
  kind: 'dm' | 'group';
  id: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const addOption = () => {
    if (options.length < 8) setOptions([...options, '']);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanQ = question.trim();
    if (cleanQ.length < 3) {
      setError('Please enter a question with at least 3 characters.');
      return;
    }
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOpts.length < 2) {
      setError('Please provide at least 2 non-empty options.');
      return;
    }
    const lower = cleanOpts.map((o) => o.toLowerCase());
    if (new Set(lower).size !== cleanOpts.length) {
      setError('All options must be unique.');
      return;
    }

    try {
      setBusy(true);
      setError('');
      await request('/chat/polls', token, {
        method: 'POST',
        body: JSON.stringify({
          conversationId: kind === 'dm' ? id : undefined,
          groupId: kind === 'group' ? id : undefined,
          question: cleanQ,
          options: cleanOpts,
        }),
      });
      setQuestion('');
      setOptions(['', '']);
      if (onCreated) onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create poll.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div className="wa-modal-card in-chat-poll-card" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-head">
          <div className="wa-modal-title">
            <BarChart2 size={18} />
            <strong>Create in-chat poll</strong>
          </div>
          <button type="button" className="wa-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="wa-modal-body">
          <label className="wa-modal-field">
            <span>Poll Question</span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <div className="wa-poll-options-builder">
            <span className="wa-builder-label">Options (2 to 8)</span>
            {options.map((opt, idx) => (
              <div key={idx} className="wa-builder-opt-row">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  maxLength={100}
                  required
                />
                {options.length > 2 && (
                  <button type="button" className="wa-remove-opt-btn" onClick={() => removeOption(idx)} aria-label="Remove option">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 8 && (
              <button type="button" className="wa-add-opt-btn" onClick={addOption}>
                <Plus size={14} /> Add option
              </button>
            )}
          </div>
          {error && <div className="wa-modal-error">{error}</div>}
          <div className="wa-modal-actions">
            <button type="button" className="wa-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="wa-btn-submit" disabled={busy}>
              {busy ? <LoaderCircle size={15} className="spin" /> : 'Send Poll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ForwardMessageModal({
  isOpen,
  onClose,
  messageToForward,
  dms,
  groups,
  onForward,
}: {
  isOpen: boolean;
  onClose: () => void;
  messageToForward: ChatMessage | null;
  dms: Dm[];
  groups: Group[];
  onForward: (targetKind: 'dm' | 'group', targetId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen || !messageToForward) return null;

  const q = search.trim().toLowerCase();
  const allTargets = [
    ...dms.map((d) => ({
      kind: 'dm' as const,
      id: d.conversation_id,
      label: `#${d.peer_username}`,
      avatar: d.peer_avatar_url,
    })),
    ...groups.map((g) => ({
      kind: 'group' as const,
      id: g.id,
      label: g.name,
      avatar: null,
    })),
  ].filter((t) => !q || t.label.toLowerCase().includes(q));

  const handleSelect = async (kind: 'dm' | 'group', id: string) => {
    try {
      setBusy(true);
      await onForward(kind, id);
      onClose();
    } catch {}
    finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div className="wa-modal-card forward-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-head">
          <div className="wa-modal-title">
            <Forward size={18} />
            <strong>Forward message to...</strong>
          </div>
          <button type="button" className="wa-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="forward-message-preview">
          <small>Forwarding:</small>
          <p>{messageToForward.body || (messageToForward.file_name ? `📄 ${messageToForward.file_name}` : '📎 Media attachment')}</p>
        </div>
        <div className="forward-search-wrap">
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats or groups..."
            autoFocus
          />
        </div>
        <div className="forward-targets-list">
          {allTargets.length === 0 ? (
            <div className="forward-empty">No chats found</div>
          ) : (
            allTargets.map((target) => (
              <button
                key={`${target.kind}:${target.id}`}
                type="button"
                className="forward-target-item"
                onClick={() => void handleSelect(target.kind, target.id)}
                disabled={busy}
              >
                <span className="forward-target-avatar">
                  {target.avatar ? (
                    <img src={target.avatar} alt={target.label} />
                  ) : target.kind === 'group' ? (
                    <Users size={16} />
                  ) : (
                    target.label[1]?.toUpperCase() || '#'
                  )}
                </span>
                <span className="forward-target-name">{target.label}</span>
                <span className="forward-target-arrow"><Forward size={14} /></span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StarredMessagesModal({
  isOpen,
  onClose,
  kind,
  id,
  token,
  onJumpToMessage,
  onUnstar,
}: {
  isOpen: boolean;
  onClose: () => void;
  kind: 'dm' | 'group';
  id: string;
  token: string;
  onJumpToMessage: (id: string) => void;
  onUnstar: (id: string) => Promise<void>;
}) {
  const [starred, setStarred] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const param = kind === 'dm' ? `conversationId=${encodeURIComponent(id)}` : `groupId=${encodeURIComponent(id)}`;
      void request<{ messages: ChatMessage[] }>(`/chat/starred?${param}`, token)
        .then((res) => setStarred(res.messages || []))
        .catch(() => setStarred([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, kind, id, token]);

  if (!isOpen) return null;

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div className="wa-modal-card starred-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-head">
          <div className="wa-modal-title">
            <Star size={18} fill="#eab308" color="#eab308" />
            <strong>Starred Messages</strong>
          </div>
          <button type="button" className="wa-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="starred-list-body">
          {loading ? (
            <div className="starred-loading"><LoaderCircle size={20} className="spin" /> Loading bookmarks...</div>
          ) : starred.length === 0 ? (
            <div className="starred-empty">
              <Star size={28} />
              <p>No starred messages yet</p>
              <small>Star important study notes, dates, or formulas to find them quickly later.</small>
            </div>
          ) : (
            starred.map((m) => (
              <div key={m.id} className="starred-item-card" onClick={() => { onJumpToMessage(m.id); onClose(); }}>
                <div className="starred-item-meta">
                  <strong>#{m.username}</strong>
                  <time>{new Date(m.created_at.replace(' ', 'T') + (m.created_at.includes('Z') ? '' : 'Z')).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                  <button
                    type="button"
                    className="starred-unstar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onUnstar(m.id);
                      setStarred((prev) => prev.filter((item) => item.id !== m.id));
                    }}
                    title="Remove from starred"
                  >
                    <Star size={14} fill="#eab308" color="#eab308" />
                  </button>
                </div>
                <div className="starred-item-content">
                  {m.file_name ? <span>📄 {m.file_name}</span> : m.body ? <span>{m.body}</span> : <i>Attachment</i>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MediaGalleryDrawer({
  isOpen,
  onClose,
  messages,
  token,
  onZoomImage,
  onJumpToMessage,
}: {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  token: string;
  onZoomImage: (url: string) => void;
  onJumpToMessage: (id: string) => void;
}) {
  const [tab, setTab] = useState<'media' | 'docs' | 'links'>('media');

  if (!isOpen) return null;

  const mediaList = messages.filter((m) => !m.is_deleted && m.media_url && m.media_type !== 'document' && !m.file_name);
  const docsList = messages.filter((m) => !m.is_deleted && (m.media_type === 'document' || m.file_name));
  const linksList = messages.filter((m) => !m.is_deleted && m.body && extractUrl(m.body));

  return (
    <div className="wa-drawer-backdrop" onClick={onClose}>
      <aside className="wa-gallery-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="wa-drawer-header">
          <strong>Media, Links & Docs</strong>
          <button type="button" className="wa-drawer-close" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <div className="wa-drawer-tabs">
          <button className={`wa-drawer-tab ${tab === 'media' ? 'active' : ''}`} onClick={() => setTab('media')}>
            Media ({mediaList.length})
          </button>
          <button className={`wa-drawer-tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>
            Docs ({docsList.length})
          </button>
          <button className={`wa-drawer-tab ${tab === 'links' ? 'active' : ''}`} onClick={() => setTab('links')}>
            Links ({linksList.length})
          </button>
        </div>
        <div className="wa-drawer-content">
          {tab === 'media' && (
            mediaList.length === 0 ? (
              <div className="wa-gallery-empty">No photos or voice notes shared yet</div>
            ) : (
              <div className="wa-media-grid">
                {mediaList.map((m) => (
                  m.media_type?.startsWith('audio/') ? (
                    <div key={m.id} className="wa-media-audio-thumb" onClick={() => onJumpToMessage(m.id)}>
                      <Mic size={18} />
                      <small>{m.media_duration_seconds ? `${Math.round(m.media_duration_seconds)}s` : 'Voice'}</small>
                    </div>
                  ) : (
                    <div key={m.id} className="wa-media-thumb" onClick={() => onZoomImage(getMediaUrl(m.media_url!, token))}>
                      <img src={getMediaUrl(m.media_url!, token)} alt="" loading="lazy" />
                    </div>
                  )
                ))}
              </div>
            )
          )}

          {tab === 'docs' && (
            docsList.length === 0 ? (
              <div className="wa-gallery-empty">No documents shared yet (PDF, DOCX, etc.)</div>
            ) : (
              <div className="wa-docs-list">
                {docsList.map((m) => {
                  const fileName = m.file_name || 'Document';
                  const size = m.file_size ? `${Math.round(m.file_size / 1024)} KB` : '';
                  const downloadUrl = getMediaUrl(m.media_url || '', token) + (m.media_url?.includes('?') ? '&' : '?') + 'download=1';
                  return (
                    <div key={m.id} className="wa-doc-item" onClick={() => onJumpToMessage(m.id)}>
                      <div className="wa-doc-icon"><FileText size={20} /></div>
                      <div className="wa-doc-meta">
                        <strong title={fileName}>{fileName}</strong>
                        <small>{size} · #{m.username}</small>
                      </div>
                      <a href={downloadUrl} download={fileName} className="wa-doc-download-link" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                        <Download size={15} />
                      </a>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'links' && (
            linksList.length === 0 ? (
              <div className="wa-gallery-empty">No shared links found</div>
            ) : (
              <div className="wa-links-list">
                {linksList.map((m) => {
                  const url = extractUrl(m.body!)!;
                  return (
                    <div key={m.id} className="wa-link-item">
                      <div className="wa-link-header">
                        <Link2 size={14} />
                        <a href={url} target="_blank" rel="noopener noreferrer" className="wa-link-anchor">{url}</a>
                      </div>
                      <p className="wa-link-snippet">{m.body}</p>
                      <small>Shared by #{m.username}</small>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </aside>
    </div>
  );
}

function DisappearingMessagesModal({
  isOpen,
  onClose,
  currentDuration,
  onSelectDuration,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentDuration: number;
  onSelectDuration: (durationSeconds: number) => Promise<void>;
}) {
  const [selectedDuration, setSelectedDuration] = useState(currentDuration || 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelectedDuration(currentDuration || 0);
  }, [currentDuration, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setBusy(true);
      await onSelectDuration(selectedDuration);
      onClose();
    } catch {}
    finally {
      setBusy(false);
    }
  };

  const options = [
    { value: 0, label: 'Off', desc: 'Messages stay in the chat history' },
    { value: 86400, label: '24 hours', desc: 'Messages disappear 24 hours after being sent' },
    { value: 604800, label: '7 days', desc: 'Messages disappear 7 days after being sent' },
    { value: 7776000, label: '90 days', desc: 'Messages disappear 90 days after being sent' },
  ];

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div className="wa-modal-card disappearing-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-head">
          <div className="wa-modal-title">
            <Clock size={18} />
            <strong>Disappearing Messages</strong>
          </div>
          <button type="button" className="wa-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="disappearing-modal-body">
          <p className="disappearing-desc">
            Make new messages disappear from this conversation for everyone after the chosen period. Existing messages will not be affected.
          </p>
          <div className="disappearing-options-list">
            {options.map((opt) => (
              <label key={opt.value} className={`disappearing-opt-item ${selectedDuration === opt.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="disappearing_duration"
                  value={opt.value}
                  checked={selectedDuration === opt.value}
                  onChange={() => setSelectedDuration(opt.value)}
                />
                <div className="disappearing-opt-copy">
                  <strong>{opt.label}</strong>
                  <small>{opt.desc}</small>
                </div>
              </label>
            ))}
          </div>
          <div className="wa-modal-actions">
            <button type="button" className="wa-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="wa-btn-submit" onClick={() => void handleSave()} disabled={busy}>
              {busy ? <LoaderCircle size={15} className="spin" /> : 'Save Setting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupStudies({
  token,
  id,
  isAdmin,
  onOpenUpload,
}: {
  token: string;
  id: string;
  isAdmin: boolean;
  onOpenUpload?: () => void;
}) {
  const [sections, setSections] = useState<{ id: string; name: string; post_count: number }[]>([]);
  const [selected, setSelected] = useState('');
  const [posts, setPosts] = useState<{ id: string; body: string; author_username: string; created_at: string; attachments?: { id: string; fileName: string; contentType: string; sizeBytes: number }[] }[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [error, setError] = useState('');

  const loadSections = useCallback(async () => {
    try {
      const data = await request<{ sections: typeof sections }>(`/groups/${encodeURIComponent(id)}/studies`, token);
      setSections(data.sections || []);
      if (!selected && data.sections && data.sections[0]) {
        setSelected(data.sections[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load studies.');
    }
  }, [id, selected, token]);

  const loadPosts = useCallback(async () => {
    if (!selected) return setPosts([]);
    try {
      const data = await request<{ posts: typeof posts }>(
        `/groups/${encodeURIComponent(id)}/studies/sections/${encodeURIComponent(selected)}`,
        token
      );
      setPosts(data.posts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load posts.');
    }
  }, [id, selected, token]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;
    let backoff = 2500;
    const connect = async () => {
      try {
        const { ticket } = await request<{ ticket: string }>('/studies/ws-ticket', token, { method: 'POST', body: JSON.stringify({ sectionId: selected }) });
        if (stopped) return;
        const ws = new WebSocket(`${wsRoot}/api/ws/studies?sectionId=${encodeURIComponent(selected)}&ticket=${encodeURIComponent(ticket)}`);
        socket = ws;
        ws.onopen = () => { backoff = 2500; };
        ws.onmessage = (event) => {
          try {
            if (JSON.parse(String(event.data)).type !== 'connected') { void loadPosts(); void loadSections(); }
          } catch { void loadPosts(); }
        };
        ws.onclose = () => {
          if (!stopped) {
            timer = setTimeout(() => void connect(), backoff);
            backoff = Math.min(backoff * 2, 30000);
          }
        };
        ws.onerror = () => ws?.close();
      } catch {
        if (!stopped) {
          timer = setTimeout(() => void connect(), backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      }
    };
    void connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
  }, [selected, token, loadPosts, loadSections]);

  const createSection = async (e: FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (name.length < 2) return;
    try {
      const data = await request<{ section: { id: string } }>(
        `/groups/${encodeURIComponent(id)}/studies/sections`,
        token,
        { method: 'POST', body: JSON.stringify({ name }) }
      );
      setNewFolderName('');
      setIsCreatingFolder(false);
      setSelected(data.section.id);
      await loadSections();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder.');
    }
  };

  const archive = async (sectionId: string) => {
    if (!window.confirm('Archive this study folder?')) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/studies/sections/${encodeURIComponent(sectionId)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      });
      if (selected === sectionId) setSelected('');
      await loadSections();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive folder.');
    }
  };

  const renameSection = async (sectionId: string, current: string) => {
    const next = window.prompt('Rename this Study folder', current);
    if (next === null || !next.trim()) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/studies/sections/${encodeURIComponent(sectionId)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ name: next.trim() }),
      });
      await loadSections();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename folder.');
    }
  };

  const editPost = async (postId: string, current: string) => {
    const next = window.prompt('Edit this study note', current);
    if (next === null || !next.trim()) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/studies/posts/${encodeURIComponent(postId)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ body: next }),
      });
      await loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update note.');
    }
  };

  const deletePost = async (postId: string) => {
    if (!window.confirm('Remove this study note and attachment?')) return;
    try {
      await request(`/groups/${encodeURIComponent(id)}/studies/posts/${encodeURIComponent(postId)}`, token, {
        method: 'DELETE',
      });
      await loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove post.');
    }
  };

  return (
    <div className="wa-studies-view">
      <div className="wa-studies-head">
        <div className="wa-studies-head-info">
          <div className="wa-icon-title">
            <BookOpen size={20} />
            <b>Group Studies &amp; Documents</b>
          </div>
          <small>Shared study notes, guides, and files for this group</small>
        </div>
        {isAdmin && onOpenUpload && (
          <button type="button" className="wa-primary-header-btn studies-btn" onClick={onOpenUpload}>
            <Plus size={16} /> Share Material
          </button>
        )}
      </div>

      {/* Folders navigation bar */}
      <div className="wa-study-folders-bar">
        <div className="wa-folder-chips">
          {sections.map((s) => (
            <div className={`wa-folder-chip ${selected === s.id ? 'active' : ''}`} key={s.id}>
              <button type="button" onClick={() => setSelected(s.id)}>
                <BookOpen size={13} />
                <span>{s.name}</span>
                <span className="wa-chip-count">{s.post_count || 0}</span>
              </button>
              {isAdmin && selected === s.id && (
                <div className="wa-chip-admin-actions">
                  <button type="button" title="Rename folder" onClick={() => void renameSection(s.id, s.name)}>
                    <Pencil size={11} />
                  </button>
                  <button type="button" title="Archive folder" onClick={() => void archive(s.id)}>
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {isAdmin && (
            <button
              type="button"
              className="wa-new-folder-chip"
              onClick={() => setIsCreatingFolder((v) => !v)}
            >
              <Plus size={13} /> {isCreatingFolder ? 'Cancel' : 'New Folder'}
            </button>
          )}
        </div>

        {isCreatingFolder && (
          <form className="wa-quick-folder-form" onSubmit={(e) => void createSection(e)}>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name..."
              maxLength={80}
              autoFocus
            />
            <button type="submit" disabled={newFolderName.trim().length < 2}>
              Create
            </button>
          </form>
        )}
      </div>

      {/* Posts & Files in selected folder */}
      <div className="wa-studies-content">
        {posts.map((p) => (
          <article className="wa-study-card" key={p.id}>
            <div className="wa-study-card-head">
              <span className="wa-study-author">#{p.author_username}</span>
              <div className="wa-study-head-right">
                <small>{new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small>
                {isAdmin && (
                  <div className="wa-study-post-actions">
                    <button type="button" onClick={() => void editPost(p.id, p.body)} title="Edit note">
                      <Pencil size={12} />
                    </button>
                    <button type="button" onClick={() => void deletePost(p.id)} title="Delete post">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {p.body && <p className="wa-study-body">{p.body}</p>}

            {p.attachments && p.attachments.length > 0 && (
              <div className="wa-study-attachments-list">
                {p.attachments.map((a) => (
                  <a
                    key={a.id}
                    className="wa-study-file-card"
                    href={`${apiRoot}/studies/files/${encodeURIComponent(a.id)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      void fetch(`${apiRoot}/studies/files/${encodeURIComponent(a.id)}`, {
                        headers: { authorization: `Bearer ${token}` },
                      })
                        .then((res) => res.blob())
                        .then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = a.fileName;
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        })
                        .catch(() => setError('Could not download that file.'));
                    }}
                  >
                    <span className="wa-file-icon-box">
                      <FileText size={18} />
                    </span>
                    <div className="wa-file-meta">
                      <b>{a.fileName}</b>
                      <small>{(a.sizeBytes / 1024 / 1024).toFixed(2)} MB · Download</small>
                    </div>
                    <span className="wa-file-download-arrow">
                      <Download size={16} />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}

        {!posts.length && selected && (
          <div className="wa-empty-state">
            <BookOpen size={30} />
            <h4>No study materials in this folder yet</h4>
            <p>
              {isAdmin
                ? "Tap '+ Share Material' to add study notes or upload files for the group."
                : 'Study notes and documents shared by group admins will appear here.'}
            </p>
            {isAdmin && onOpenUpload && (
              <button type="button" className="wa-create-empty-btn" onClick={onOpenUpload}>
                <Plus size={15} /> Add first study item
              </button>
            )}
          </div>
        )}

        {!sections.length && (
          <div className="wa-empty-state">
            <BookOpen size={32} />
            <h4>No study folders in this group yet</h4>
            <p>
              {isAdmin
                ? 'Create a folder to start organizing study notes, PDFs, and guides.'
                : 'No study materials have been published in this group yet.'}
            </p>
          </div>
        )}
      </div>

      {error && <p className="chat-error">{error}</p>}
    </div>
  );
}

function GroupPolls({
  token,
  id,
  isAdmin,
  onOpenCreatePoll,
}: {
  token: string;
  id: string;
  isAdmin: boolean;
  onOpenCreatePoll?: () => void;
}) {
  const [polls, setPolls] = useState<{ id: string; question: string; status: string; total_votes?: number; my_vote: string | null; options: { id: string; label: string; votes: number }[] }[]>([]);
  const [error, setError] = useState('');
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await request<{ polls: typeof polls }>(`/groups/${encodeURIComponent(id)}/polls`, token);
      setPolls(data.polls || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load polls.');
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;
    let backoff = 3000;
    const connect = async () => {
      if (stopped) return;
      let ws: WebSocket;
      try {
        const ticketData = await request<{ ticket: string }>('/polls/ws-ticket', token, { method: 'POST' });
        if (stopped) return;
        ws = new WebSocket(`${wsRoot}/api/ws/polls?ticket=${encodeURIComponent(ticketData.ticket)}`);
      } catch {
        if (stopped) return;
        ws = new WebSocket(`${wsRoot}/api/ws/polls?token=${encodeURIComponent(token)}`);
      }
      socket = ws;
      ws.onopen = () => { backoff = 3000; };
      ws.onmessage = (event) => {
        try {
          if (JSON.parse(String(event.data)).type === 'polls-updated') void load();
        } catch {}
      };
      ws.onclose = () => {
        if (!stopped) {
          timer = setTimeout(() => void connect(), backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      };
      ws.onerror = () => ws?.close();
    };
    void connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
  }, [load, token]);

  const vote = async (pollId: string, optionId: string) => {
    try {
      setVotingId(pollId);
      await request(`/groups/${encodeURIComponent(id)}/polls/${encodeURIComponent(pollId)}/vote`, token, {
        method: 'POST',
        body: JSON.stringify({ optionId }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not vote.');
    } finally {
      setVotingId(null);
    }
  };

  const closePoll = async (pollId: string, status: string) => {
    try {
      await request(`/groups/${encodeURIComponent(id)}/polls/${encodeURIComponent(pollId)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update poll.');
    }
  };

  return (
    <div className="wa-polls-view">
      <div className="wa-polls-head">
        <div className="wa-polls-head-info">
          <div className="wa-icon-title">
            <CircleHelp size={20} />
            <b>Group Polls</b>
          </div>
          <small>Ask questions, vote, and see group responses live</small>
        </div>
        {isAdmin && onOpenCreatePoll && (
          <button type="button" className="wa-primary-header-btn poll-btn" onClick={onOpenCreatePoll}>
            <Plus size={16} /> Create Poll
          </button>
        )}
      </div>

      <div className="wa-polls-list">
        {polls.map((poll) => {
          const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
          const hasVoted = Boolean(poll.my_vote);
          const isClosed = poll.status === 'closed';

          return (
            <article className="wa-poll-card" key={poll.id}>
              <div className="wa-poll-card-header">
                <h3>{poll.question}</h3>
                <span className={`wa-poll-status-pill ${poll.status}`}>
                  {isClosed ? 'Closed' : 'Active'}
                </span>
              </div>

              <div className="wa-poll-options-list">
                {poll.options.map((opt) => {
                  const isSelected = poll.my_vote === opt.id;
                  const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`wa-poll-option-btn ${isSelected ? 'selected' : ''} ${hasVoted || isClosed ? 'revealed' : ''}`}
                      disabled={hasVoted || isClosed || votingId === poll.id}
                      onClick={() => void vote(poll.id, opt.id)}
                    >
                      <div className="wa-option-content">
                        <span className={`wa-option-indicator ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <Check size={12} />}
                        </span>
                        <span className="wa-option-label">{opt.label}</span>
                        {(hasVoted || isClosed) && (
                          <span className="wa-option-votes-badge">
                            {opt.votes} ({pct}%)
                          </span>
                        )}
                      </div>
                      {(hasVoted || isClosed) && (
                        <div className="wa-option-progress-track">
                          <div
                            className="wa-option-progress-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="wa-poll-card-footer">
                <small className="wa-poll-vote-count">
                  {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                  {hasVoted && ' · You voted'}
                </small>
                {isAdmin && (
                  <button
                    type="button"
                    className="wa-poll-admin-toggle"
                    onClick={() => void closePoll(poll.id, isClosed ? 'open' : 'closed')}
                  >
                    {isClosed ? 'Reopen poll' : 'Close poll'}
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {!polls.length && (
          <div className="wa-empty-state">
            <CircleHelp size={32} />
            <h4>No polls in this group yet</h4>
            <p>
              {isAdmin
                ? "Conduct a poll to gather feedback or make group decisions!"
                : 'When an admin creates a poll, it will appear here for you to vote.'}
            </p>
            {isAdmin && onOpenCreatePoll && (
              <button type="button" className="wa-create-empty-btn" onClick={onOpenCreatePoll}>
                <Plus size={15} /> Create your first poll
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="chat-error">{error}</p>}
    </div>
  );
}
