/* =============================================================================
   MySpace Firebase API Client
   Direct, secure REST integration with Firebase Realtime Database.
   Features:
   - Weekly Leaderboard Reset every Monday at 5:30 AM IST (00:00:00 UTC) worldwide
   - Top 20 Global Rankings with real player sync
   - Real-time Focus Rooms with private isolation & presence
   - Anonymous Authentication support with token caching
   - Graceful offline fallback
============================================================================= */

(() => {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDFxKflziyBvZuP15V9teZ0E7Y_U_AlGjg',
    authDomain: 'cryo-byte.firebaseapp.com',
    databaseURL: 'https://cryo-byte-default-rtdb.firebaseio.com',
    projectId: 'cryo-byte'
  };

  const TIMEOUT_MS = 4500;

  // Cached anonymous auth token and persistent session
  const AUTH_STORAGE_KEY = 'ms_firebase_auth';
  let cachedAuth = null; // { idToken, refreshToken, localId, tokenExpiry }

  // Load auth session from chrome.storage.local
  async function loadCachedAuth() {
    if (cachedAuth && cachedAuth.idToken) return cachedAuth;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await new Promise(resolve => {
          chrome.storage.local.get([AUTH_STORAGE_KEY], res => resolve(res ? res[AUTH_STORAGE_KEY] : null));
        });
        if (stored && stored.idToken && stored.tokenExpiry) {
          cachedAuth = stored;
          return cachedAuth;
        }
      }
    } catch (e) {}
    return null;
  }

  // Save auth session to chrome.storage.local
  async function saveAuthSession(authData) {
    cachedAuth = authData;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [AUTH_STORAGE_KEY]: authData });
      }
    } catch (e) {}
  }

  // Refresh expired token using Google Secure Token API
  async function refreshAuthToken(refreshToken) {
    if (!refreshToken) return null;
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });
      const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (res.ok) {
        const data = await res.json();
        const idToken = data.id_token || data.access_token;
        const newRefreshToken = data.refresh_token || refreshToken;
        const localId = data.user_id || (cachedAuth && cachedAuth.localId);
        const expiresIn = Number(data.expires_in || 3600);
        const tokenExpiry = Date.now() + (expiresIn - 120) * 1000;
        const newAuth = { idToken, refreshToken: newRefreshToken, localId, tokenExpiry };
        await saveAuthSession(newAuth);
        return idToken;
      }
    } catch (e) {}
    return null;
  }

  // Calculate deterministic weekly cycle ID: resets every Monday at 5:30 AM IST (00:00:00 UTC) worldwide.
  // Using pure UTC epoch methods guarantees users in every country/timezone transition at the identical wall-clock moment.
  function getWeeklyCycleId(now = new Date()) {
    const d = new Date(now.getTime());
    const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    
    // Cycle starts on Monday at 00:00:00 UTC (= 5:30 AM IST).
    // Sunday (0) belongs to the cycle that started 6 days ago.
    // Mon (1) through Sat (6) belong to Monday of this current week.
    const diffDays = (day === 0) ? 6 : (day - 1);

    const cycleStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffDays, 0, 0, 0, 0));
    const y = cycleStart.getUTCFullYear();
    const m = String(cycleStart.getUTCMonth() + 1).padStart(2, '0');
    const dateStr = String(cycleStart.getUTCDate()).padStart(2, '0');
    return `week_${y}_${m}_${dateStr}`;
  }

  // Calculate deterministic daily 24h cycle ID: resets every day at 5:30 AM IST (00:00:00 UTC) worldwide.
  function getDailyCycleId(now = new Date()) {
    const d = new Date(now.getTime());
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dateStr = String(d.getUTCDate()).padStart(2, '0');
    return `day_${y}_${m}_${dateStr}`;
  }

  // Calculate human-readable countdown to upcoming 5:30 AM IST (00:00:00 UTC) reset worldwide
  function getTimeUntilDailyReset(now = new Date()) {
    const d = new Date(now.getTime());
    const nextReset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
    const diffMs = Math.max(0, nextReset.getTime() - d.getTime());
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${Math.max(1, minutes)}m`;
  }

  // Calculate human-readable countdown to upcoming Monday 5:30 AM IST (00:00:00 UTC) worldwide
  function getTimeUntilReset(now = new Date()) {
    const d = new Date(now.getTime());
    const day = d.getUTCDay();

    // Days until upcoming Monday 00:00:00 UTC:
    // Sunday (0) -> 1 day (tomorrow)
    // Monday (1) -> 7 days (next Monday)
    // Tuesday (2) -> 6 days ... Saturday (6) -> 2 days
    const daysUntil = (day === 0) ? 1 : (8 - day);

    const nextReset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntil, 0, 0, 0, 0));
    const diffMs = Math.max(0, nextReset.getTime() - d.getTime());
    
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${Math.max(1, minutes)}m`;
  }

  // Normalize room codes: accepts "9X42", "glow-9x42", "GLOW-9X42", etc.
  function normalizeRoomCode(raw) {
    if (!raw) return '';
    let clean = String(raw).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (clean.startsWith('GLOW-')) return clean;
    if (clean.startsWith('GLOW')) return `GLOW-${clean.slice(4)}`;
    if (clean.length === 4) return `GLOW-${clean}`;
    return clean;
  }

  // Fetch or refresh Firebase anonymous auth token
  async function getAuthToken() {
    await loadCachedAuth();
    if (cachedAuth && cachedAuth.idToken && Date.now() < cachedAuth.tokenExpiry) {
      return cachedAuth.idToken;
    }

    // Try refreshing existing token silently
    if (cachedAuth && cachedAuth.refreshToken) {
      const refreshed = await refreshAuthToken(cachedAuth.refreshToken);
      if (refreshed) return refreshed;
    }

    // Otherwise create brand new anonymous session
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.idToken) {
          const expiresIn = Number(data.expiresIn || 3600);
          const newAuth = {
            idToken: data.idToken,
            refreshToken: data.refreshToken || null,
            localId: data.localId || null,
            tokenExpiry: Date.now() + (expiresIn - 120) * 1000
          };
          await saveAuthSession(newAuth);
          return newAuth.idToken;
        }
      }
    } catch (e) {
      // Offline or network error
    }
    return cachedAuth ? cachedAuth.idToken : null;
  }

  // Get persistent authenticated user UID (matches auth.uid for security rules)
  async function getAuthUserId() {
    await loadCachedAuth();
    if (cachedAuth && cachedAuth.localId) {
      return cachedAuth.localId;
    }
    await getAuthToken();
    return (cachedAuth && cachedAuth.localId) || null;
  }

  async function apiFetch(path, options = {}) {
    const token = await getAuthToken();
    const authParam = token ? `?auth=${token}` : '';
    const url = `${FIREBASE_CONFIG.databaseURL}${path.startsWith('/') ? path : '/' + path}.json${authParam}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      return null;
    }
  }

  // Default Public Community Focus Room (no fake members)
  const COMMUNITY_ROOMS = {
    'GLOW-LEET': {
      info: {
        code: 'GLOW-LEET',
        name: 'LeetGlow Lounge',
        goal: '3 hours',
        type: 'open',
        topic: 'General DSA',
        creator: 'Community',
        creatorId: 'community_system',
        avatar: 'LG',
        createdAt: 1730000000000
      },
      members: {}
    }
  };

  window.MySpaceAPI = {
    normalizeRoomCode,
    getWeeklyCycleId,
    getDailyCycleId,
    getTimeUntilReset,
    getTimeUntilDailyReset,
    getAuthUserId,

    // 1. Room Management
    async getRoom(code) {
      if (!code) return null;
      const cleanCode = encodeURIComponent(normalizeRoomCode(code));
      let data = await apiFetch(`/rooms/${cleanCode}`);
      if (!data || !data.info) {
        const norm = normalizeRoomCode(code);
        if (COMMUNITY_ROOMS[norm]) {
          data = JSON.parse(JSON.stringify(COMMUNITY_ROOMS[norm]));
          // Seed to Firebase in background so presence syncs seamlessly
          apiFetch(`/rooms/${cleanCode}`, {
            method: 'PUT',
            body: JSON.stringify(data)
          }).catch(() => {});
          apiFetch(`/public_rooms/${cleanCode}`, {
            method: 'PUT',
            body: JSON.stringify({
              code: data.info.code,
              name: data.info.name,
              goal: data.info.goal,
              topic: data.info.topic || 'General DSA',
              creator: data.info.creator,
              creatorId: data.info.creatorId || '',
              avatar: data.info.avatar || '🌐',
              memberCount: Object.keys(data.members || {}).length,
              createdAt: data.info.createdAt
            })
          }).catch(() => {});
        }
      }
      return data;
    },

    async saveRoom(room) {
      if (!room || !room.code) return false;
      const cleanCode = encodeURIComponent(normalizeRoomCode(room.code));
      
      const payload = {
        code: normalizeRoomCode(room.code),
        name: room.name,
        goal: room.goal || '3 hours',
        type: room.type || 'private',
        topic: room.topic || 'General DSA',
        creator: room.creator || 'Host',
        creatorId: room.creatorId || '',
        createdAt: room.createdAt || Date.now()
      };

      await apiFetch(`/rooms/${cleanCode}/info`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      // If room is OPEN, allow discovery in directory
      if (room.type === 'open') {
        await apiFetch(`/public_rooms/${cleanCode}`, {
          method: 'PUT',
          body: JSON.stringify({
            code: payload.code,
            name: payload.name,
            goal: payload.goal,
            topic: payload.topic,
            creator: payload.creator || 'Host',
            creatorId: payload.creatorId || '',
            avatar: '🌐',
            memberCount: (room.members && room.members.length) || 1,
            createdAt: payload.createdAt
          })
        });
      }

      return true;
    },

    // Update real-time member count for public rooms
    async updatePublicRoomMemberCount(roomCode, count) {
      if (!roomCode) return;
      const cleanCode = encodeURIComponent(normalizeRoomCode(roomCode));
      await apiFetch(`/public_rooms/${cleanCode}/memberCount`, {
        method: 'PUT',
        body: JSON.stringify(Math.max(0, count))
      });
    },

    // Query All Public Available Groups from Server
    async getPublicRooms() {
      const res = await apiFetch(`/public_rooms`);
      let list = [];
      if (res && typeof res === 'object') {
        list = Object.values(res).filter(r => r && r.code);
      }
      // Sort newest first
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Merge active community hubs
      const existingCodes = new Set(list.map(r => normalizeRoomCode(r.code)));
      Object.values(COMMUNITY_ROOMS).forEach(cr => {
        if (!existingCodes.has(normalizeRoomCode(cr.info.code))) {
          list.push({
            code: cr.info.code,
            name: cr.info.name,
            goal: cr.info.goal,
            topic: cr.info.topic || 'General DSA',
            creator: cr.info.creator,
            creatorId: cr.info.creatorId || '',
            avatar: cr.info.avatar,
            memberCount: Object.keys(cr.members || {}).length,
            createdAt: cr.info.createdAt,
            isCommunity: true
          });
        }
      });

      return list;
    },

    // 2. Member Presence & Live Heartbeat
    async syncMember(roomCode, member, options = {}) {
      if (!roomCode || !member || !member.id) return false;
      const cleanCode = encodeURIComponent(normalizeRoomCode(roomCode));
      const cleanId = encodeURIComponent(member.id);

      const payload = {
        id: member.id,
        nickname: member.nickname || 'Coder',
        status: member.status || 'Active',
        timerFormatted: member.timerFormatted || '24:58',
        isHost: Boolean(member.isHost),
        avatar: member.avatar || 'AN',
        todayFocusSeconds: Number(member.todayFocusSeconds) || 0,
        cycleDate: member.cycleDate || getDailyCycleId(),
        currentProblem: member.currentProblem || null,
        recentSolve: member.recentSolve || null,
        lastActive: Date.now()
      };

      await apiFetch(`/rooms/${cleanCode}/members/${cleanId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      // Update public_rooms/{code}/memberCount in the syncMember flow
      try {
        let count = typeof options === 'number'
          ? options
          : (options && options.memberCount !== undefined ? options.memberCount : member.memberCount);

        const isPublic = typeof options === 'object' && options !== null && options.isPublic !== undefined
          ? options.isPublic
          : member.isPublic;

        // Skip updating public_rooms if explicitly marked private
        if (isPublic !== false) {
          if (count === undefined || count === null) {
            const membersRes = await apiFetch(`/rooms/${cleanCode}/members`);
            if (membersRes && typeof membersRes === 'object') {
              count = Object.keys(membersRes).length;
            }
          }

          const finalCount = Math.max(1, Number(count) || 1);

          if (isPublic === true) {
            await apiFetch(`/public_rooms/${cleanCode}/memberCount`, {
              method: 'PUT',
              body: JSON.stringify(finalCount)
            });
          } else {
            // Verify public room entry exists before writing to avoid orphan nodes
            const pubRoom = await apiFetch(`/public_rooms/${cleanCode}/code`);
            if (pubRoom) {
              await apiFetch(`/public_rooms/${cleanCode}/memberCount`, {
                method: 'PUT',
                body: JSON.stringify(finalCount)
              });
            }
          }
        }
      } catch (e) {
        // Silently catch network or non-public room errors
      }

      return true;
    },

    async getRoomMembers(roomCode) {
      if (!roomCode) return [];
      const cleanCode = encodeURIComponent(normalizeRoomCode(roomCode));
      const res = await apiFetch(`/rooms/${cleanCode}/members`);
      if (!res || typeof res !== 'object') return [];
      return Object.values(res);
    },

    async removeMember(roomCode, memberId) {
      if (!roomCode || !memberId) return false;
      const cleanCode = encodeURIComponent(normalizeRoomCode(roomCode));
      const cleanId = encodeURIComponent(memberId);
      await apiFetch(`/rooms/${cleanCode}/members/${cleanId}`, {
        method: 'DELETE'
      });
      return true;
    },

    // 3. Weekly Global Leaderboard (Top 20, resets Monday 5:30 AM IST / 00:00:00 UTC)
    async getGlobalLeaderboard() {
      const cycleId = getWeeklyCycleId();
      const res = await apiFetch(`/leaderboard/${cycleId}`);
      
      let list = [];
      if (res && typeof res === 'object') {
        list = Object.values(res).filter(u => u && u.id && (Number(u.focusSeconds) || 0) > 0);
      }

      // Sort by focusSeconds descending
      list.sort((a, b) => (Number(b.focusSeconds) || 0) - (Number(a.focusSeconds) || 0));

      // Limit to top 20 players
      const top20 = list.slice(0, 20);
      return top20.map((item, index) => ({
        ...item,
        rank: index + 1,
        weeklyDisplay: item.weeklyDisplay || item.todayDisplay || '0m'
      }));
    },

    async syncToGlobalLeaderboard(user) {
      if (!user || !user.id) return false;
      const cycleId = getWeeklyCycleId();
      const cleanId = encodeURIComponent(user.id);

      const focusSec = Number(user.focusSeconds) || 0;
      const displayVal = user.weeklyDisplay || user.todayDisplay || '0m';

      const payload = {
        id: user.id,
        nickname: user.nickname || 'Anonymous',
        focusSeconds: focusSec,
        weeklyDisplay: displayVal,
        todayDisplay: displayVal, // preserve for backward compatibility
        streak: Math.max(0, Number(user.streak) || 0),
        solvedCount: Math.max(0, Number(user.solvedCount) || 0),
        roomName: user.roomName || 'Solo Coder',
        isPrivate: Boolean(user.isPrivateRoom),
        avatar: user.avatar || 'AN',
        lastActive: Date.now()
      };

      await apiFetch(`/leaderboard/${cycleId}/${cleanId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      return true;
    }
  };
})();
