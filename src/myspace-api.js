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

  // Cached anonymous auth token
  let cachedIdToken = null;
  let tokenExpiry = 0;

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
    if (cachedIdToken && Date.now() < tokenExpiry) {
      return cachedIdToken;
    }
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.idToken) {
          cachedIdToken = data.idToken;
          tokenExpiry = Date.now() + (Number(data.expiresIn || 3600) - 120) * 1000;
          return cachedIdToken;
        }
      }
    } catch (e) {
      // Offline or network error
    }
    return null;
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

  // Default Global Leaderboard Benchmark (Ansh as sole initial benchmark player)
  const DEFAULT_GLOBAL_LEADERS = [
    {
      id: 'usr_ansh',
      nickname: 'Ansh',
      focusSeconds: 21600,
      todayDisplay: '6h 00m',
      streak: 28,
      solvedCount: 14,
      rank: 1,
      avatar: 'AN',
      roomName: 'LeetGlow Squad'
    }
  ];

  // Single Default Public Community Focus Room (Created by Ansh)
  const COMMUNITY_ROOMS = {
    'GLOW-LEET': {
      info: {
        code: 'GLOW-LEET',
        name: 'LeetGlow Squad',
        goal: '3 hours',
        type: 'open',
        creator: 'Ansh',
        avatar: 'LS',
        createdAt: Date.now() - 3600000
      },
      members: {
        'usr_ansh': {
          id: 'usr_ansh',
          nickname: 'Ansh',
          status: 'Active',
          timerFormatted: '25:00',
          isHost: true,
          avatar: 'AN',
          lastActive: Date.now()
        }
      }
    }
  };

  window.MySpaceAPI = {
    normalizeRoomCode,
    getWeeklyCycleId,
    getTimeUntilReset,

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
              creator: data.info.creator,
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
        creator: room.creator || 'Host',
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
            creator: payload.creator || 'Host',
            avatar: '🌐',
            memberCount: (room.members && room.members.length) || 1,
            createdAt: payload.createdAt
          })
        });
      }

      return true;
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
            creator: cr.info.creator,
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
    async syncMember(roomCode, member) {
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
        lastActive: Date.now()
      };

      await apiFetch(`/rooms/${cleanCode}/members/${cleanId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
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
        list = Object.values(res);
      }

      // Merge initial benchmark player (Ansh) if not yet in active cycle
      const existingIds = new Set(list.map(u => u.id));
      DEFAULT_GLOBAL_LEADERS.forEach(u => {
        if (!existingIds.has(u.id)) {
          list.push(u);
        }
      });

      // Sort by focusSeconds descending
      list.sort((a, b) => (Number(b.focusSeconds) || 0) - (Number(a.focusSeconds) || 0));

      // Limit to top 20 players
      const top20 = list.slice(0, 20);
      return top20.map((item, index) => ({
        ...item,
        rank: index + 1
      }));
    },

    async syncToGlobalLeaderboard(user) {
      if (!user || !user.id) return false;
      const cycleId = getWeeklyCycleId();
      const cleanId = encodeURIComponent(user.id);

      const payload = {
        id: user.id,
        nickname: user.nickname || 'Anonymous',
        focusSeconds: Number(user.focusSeconds) || 0,
        todayDisplay: user.todayDisplay || '0m',
        streak: Number(user.streak) || 1,
        solvedCount: Number(user.solvedCount) || 1,
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
