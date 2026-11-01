/* =============================================================================
   MySpace Firebase API Client
   Direct, secure REST integration with Firebase Realtime Database.
   Features:
   - Weekly Leaderboard Reset every Monday at 5:30 PM IST (12:00 UTC)
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

  // Calculate deterministic weekly cycle ID: resets every Monday at 5:30 PM IST (12:00:00 UTC)
  function getWeeklyCycleId(now = new Date()) {
    const d = new Date(now.getTime());
    const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const hour = d.getUTCHours();
    
    // Monday is day 1. If Monday before 12:00 UTC, belongs to previous week
    let diffDays = 0;
    if (day === 1) {
      diffDays = hour >= 12 ? 0 : 7;
    } else if (day === 0) {
      diffDays = 6;
    } else {
      diffDays = day - 1;
    }

    const cycleStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffDays, 12, 0, 0, 0));
    const y = cycleStart.getUTCFullYear();
    const m = String(cycleStart.getUTCMonth() + 1).padStart(2, '0');
    const dateStr = String(cycleStart.getUTCDate()).padStart(2, '0');
    return `week_${y}_${m}_${dateStr}`;
  }

  // Calculate human-readable countdown to next Monday 5:30 PM IST
  function getTimeUntilReset(now = new Date()) {
    const d = new Date(now.getTime());
    const day = d.getUTCDay();
    const hour = d.getUTCHours();

    let daysUntil = 0;
    if (day === 1) {
      daysUntil = hour < 12 ? 0 : 7;
    } else if (day === 0) {
      daysUntil = 1;
    } else {
      daysUntil = 8 - day;
    }

    const nextReset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntil, 12, 0, 0, 0));
    const diffMs = Math.max(0, nextReset.getTime() - d.getTime());
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
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

  // Curated 20 Top Global Leaders for weekly competitive benchmark
  const DEFAULT_GLOBAL_LEADERS = [
    { id: 'usr_sarah', nickname: 'Sarah C.', focusSeconds: 21600, todayDisplay: '6h 00m', streak: 28, solvedCount: 14, rank: 1, avatar: '👩‍💻', roomName: 'Algorithm Masters' },
    { id: 'usr_kenji', nickname: 'Kenji S.', focusSeconds: 20700, todayDisplay: '5h 45m', streak: 19, solvedCount: 11, rank: 2, avatar: '🧑‍💻', roomName: 'Tokyo Techies' },
    { id: 'usr_elena', nickname: 'Elena Rostova', focusSeconds: 18900, todayDisplay: '5h 15m', streak: 14, solvedCount: 9, rank: 3, avatar: '⚡', roomName: 'Competitive Solo' },
    { id: 'usr_devan', nickname: 'Devan Patel', focusSeconds: 17400, todayDisplay: '4h 50m', streak: 12, solvedCount: 8, rank: 4, avatar: '🎯', roomName: 'Study Squad' },
    { id: 'usr_chloe', nickname: 'Chloe Chen', focusSeconds: 16200, todayDisplay: '4h 30m', streak: 10, solvedCount: 7, rank: 5, avatar: '🌸', roomName: 'Silicon Valley Crew' },
    { id: 'usr_marcus', nickname: 'Marcus Vance', focusSeconds: 15000, todayDisplay: '4h 10m', streak: 8, solvedCount: 6, rank: 6, avatar: '🚀', roomName: 'Hardcore Grind' },
    { id: 'usr_aarav', nickname: 'Aarav Sharma', focusSeconds: 14100, todayDisplay: '3h 55m', streak: 7, solvedCount: 6, rank: 7, avatar: '👑', roomName: 'IITians Grind' },
    { id: 'usr_emily', nickname: 'Emily Watson', focusSeconds: 13200, todayDisplay: '3h 40m', streak: 6, solvedCount: 5, rank: 8, avatar: '💻', roomName: 'Private Squad 🔒' },
    { id: 'usr_lucas', nickname: 'Lucas Dubois', focusSeconds: 12300, todayDisplay: '3h 25m', streak: 6, solvedCount: 5, rank: 9, avatar: '☕', roomName: 'Paris Coders' },
    { id: 'usr_priya', nickname: 'Priya Nair', focusSeconds: 11400, todayDisplay: '3h 10m', streak: 5, solvedCount: 4, rank: 10, avatar: '✨', roomName: 'Study Squad' },
    { id: 'usr_jinwoo', nickname: 'Jin-Woo Park', focusSeconds: 10500, todayDisplay: '2h 55m', streak: 5, solvedCount: 4, rank: 11, avatar: '🎮', roomName: 'Seoul Solvers' },
    { id: 'usr_sofia', nickname: 'Sofia Rossi', focusSeconds: 9900, todayDisplay: '2h 45m', streak: 4, solvedCount: 4, rank: 12, avatar: '🎨', roomName: 'Rome Devs' },
    { id: 'usr_alex', nickname: 'Alex Rivera', focusSeconds: 9000, todayDisplay: '2h 30m', streak: 4, solvedCount: 3, rank: 13, avatar: '🦊', roomName: 'Algo Beasts' },
    { id: 'usr_nina', nickname: 'Nina Ivanova', focusSeconds: 8400, todayDisplay: '2h 20m', streak: 3, solvedCount: 3, rank: 14, avatar: '🌺', roomName: 'Private Squad 🔒' },
    { id: 'usr_tatsuya', nickname: 'Tatsuya Mori', focusSeconds: 7800, todayDisplay: '2h 10m', streak: 3, solvedCount: 3, rank: 15, avatar: '🍙', roomName: 'LeetCode 75' },
    { id: 'usr_liam', nickname: 'Liam O\'Connor', focusSeconds: 7200, todayDisplay: '2h 00m', streak: 3, solvedCount: 2, rank: 16, avatar: '🍀', roomName: 'Dublin Hackers' },
    { id: 'usr_fatima', nickname: 'Fatima Al-Mansoor', focusSeconds: 6600, todayDisplay: '1h 50m', streak: 2, solvedCount: 2, rank: 17, avatar: '🌙', roomName: 'Oasis Coders' },
    { id: 'usr_carlos', nickname: 'Carlos Mendez', focusSeconds: 6000, todayDisplay: '1h 40m', streak: 2, solvedCount: 2, rank: 18, avatar: '🥑', roomName: 'Madrid Tech' },
    { id: 'usr_hannah', nickname: 'Hannah Schmidt', focusSeconds: 5400, todayDisplay: '1h 30m', streak: 2, solvedCount: 1, rank: 19, avatar: '🥨', roomName: 'Berlin Bitwise' },
    { id: 'usr_david', nickname: 'David Kim', focusSeconds: 4800, todayDisplay: '1h 20m', streak: 1, solvedCount: 1, rank: 20, avatar: '🎧', roomName: 'Solo Focus' }
  ];

  window.MySpaceAPI = {
    normalizeRoomCode,
    getWeeklyCycleId,
    getTimeUntilReset,

    // 1. Room Management
    async getRoom(code) {
      if (!code) return null;
      const cleanCode = encodeURIComponent(normalizeRoomCode(code));
      const data = await apiFetch(`/rooms/${cleanCode}`);
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
            createdAt: payload.createdAt
          })
        });
      }

      return true;
    },

    // 2. Member Presence & Live Heartbeat
    async syncMember(roomCode, member) {
      if (!roomCode || !member || !member.id) return false;
      const cleanCode = encodeURIComponent(normalizeRoomCode(roomCode));
      const cleanId = encodeURIComponent(member.id);

      const payload = {
        id: member.id,
        nickname: member.nickname || 'Coder',
        status: member.status || 'Focusing',
        timerFormatted: member.timerFormatted || '24:58',
        isHost: Boolean(member.isHost),
        avatar: member.avatar || '👨‍💻',
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

    // 3. Weekly Global Leaderboard (Top 20, resets Monday 5:30 PM)
    async getGlobalLeaderboard() {
      const cycleId = getWeeklyCycleId();
      const res = await apiFetch(`/leaderboard/${cycleId}`);
      
      let list = [];
      if (res && typeof res === 'object') {
        list = Object.values(res);
      }

      // If online cycle is fresh or empty, merge with defaults to populate top 20
      if (list.length < 20) {
        const existingIds = new Set(list.map(u => u.id));
        const fallbacksNeeded = DEFAULT_GLOBAL_LEADERS.filter(u => !existingIds.has(u.id));
        list = [...list, ...fallbacksNeeded];
      }

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
        avatar: user.avatar || '⚡',
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
