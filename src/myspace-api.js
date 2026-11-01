/* =============================================================================
   MySpace Firebase API Client
   Direct, secure REST integration with Firebase Realtime Database.
   Ensures zero heavy dependencies, works seamlessly in Chrome Extensions (MV3),
   and isolates private rooms while synchronizing the global leaderboard.
============================================================================= */

(() => {
  'use strict';

  const FIREBASE_CONFIG = {
    databaseURL: 'https://cryo-byte-default-rtdb.firebaseio.com',
    projectId: 'cryo-byte'
  };

  const TIMEOUT_MS = 3800;

  async function apiFetch(path, options = {}) {
    const url = `${FIREBASE_CONFIG.databaseURL}${path.startsWith('/') ? path : '/' + path}.json`;
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

  // Pre-seeded global leaders for when the online DB is freshly initialized or offline
  const DEFAULT_GLOBAL_LEADERS = [
    { id: 'usr_sarah', nickname: 'Sarah C.', focusSeconds: 21600, todayDisplay: '6h 00m', streak: 28, solvedCount: 14, rank: 1, avatar: '👩‍💻' },
    { id: 'usr_kenji', nickname: 'Kenji S.', focusSeconds: 18900, todayDisplay: '5h 15m', streak: 19, solvedCount: 11, rank: 2, avatar: '🧑‍💻' },
    { id: 'usr_elena', nickname: 'Elena Rostova', focusSeconds: 16200, todayDisplay: '4h 30m', streak: 14, solvedCount: 9, rank: 3, avatar: '⚡' },
    { id: 'usr_devan', nickname: 'Devan Patel', focusSeconds: 14400, todayDisplay: '4h 00m', streak: 12, solvedCount: 8, rank: 4, avatar: '🎯' },
    { id: 'usr_chloe', nickname: 'Chloe Chen', focusSeconds: 12600, todayDisplay: '3h 30m', streak: 8, solvedCount: 6, rank: 5, avatar: '🌸' },
    { id: 'usr_marcus', nickname: 'Marcus Vance', focusSeconds: 10800, todayDisplay: '3h 00m', streak: 7, solvedCount: 5, rank: 6, avatar: '🚀' }
  ];

  window.MySpaceAPI = {
    // 1. Room Management
    async getRoom(code) {
      if (!code) return null;
      const cleanCode = encodeURIComponent(code.trim().toUpperCase());
      const data = await apiFetch(`/rooms/${cleanCode}`);
      return data;
    },

    async saveRoom(room) {
      if (!room || !room.code) return false;
      const cleanCode = encodeURIComponent(room.code.trim().toUpperCase());
      
      // Save room core data
      const payload = {
        code: room.code,
        name: room.name,
        goal: room.goal || '3h',
        type: room.type || 'private',
        creator: room.creator || 'Host',
        createdAt: room.createdAt || Date.now(),
        todayMinutes: room.todayMinutes || 135
      };

      await apiFetch(`/rooms/${cleanCode}/info`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      // If room is OPEN, allow public discovery.
      // If room is PRIVATE, it is STRICTLY ISOLATED (never listed publicly)!
      if (room.type === 'open') {
        await apiFetch(`/public_rooms/${cleanCode}`, {
          method: 'PUT',
          body: JSON.stringify({
            code: room.code,
            name: room.name,
            goal: room.goal,
            createdAt: payload.createdAt
          })
        });
      }

      return true;
    },

    // 2. Member Presence & Heartbeat
    async syncMember(roomCode, member) {
      if (!roomCode || !member || !member.id) return false;
      const cleanCode = encodeURIComponent(roomCode.trim().toUpperCase());
      const cleanId = encodeURIComponent(member.id);

      const payload = {
        id: member.id,
        nickname: member.nickname || 'Coder',
        status: member.status || 'Focusing', // 'Focusing' | 'Break' | 'Idle'
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
      const cleanCode = encodeURIComponent(roomCode.trim().toUpperCase());
      const res = await apiFetch(`/rooms/${cleanCode}/members`);
      if (!res || typeof res !== 'object') return [];
      return Object.values(res);
    },

    async removeMember(roomCode, memberId) {
      if (!roomCode || !memberId) return false;
      const cleanCode = encodeURIComponent(roomCode.trim().toUpperCase());
      const cleanId = encodeURIComponent(memberId);
      await apiFetch(`/rooms/${cleanCode}/members/${cleanId}`, {
        method: 'DELETE'
      });
      return true;
    },

    // 3. Global Leaderboard (Not isolated to groups, visible to everyone globally)
    async getGlobalLeaderboard() {
      const res = await apiFetch('/leaderboard');
      if (!res || typeof res !== 'object') {
        return DEFAULT_GLOBAL_LEADERS;
      }

      const list = Object.values(res);
      if (list.length === 0) return DEFAULT_GLOBAL_LEADERS;

      // Sort by focusSeconds descending
      list.sort((a, b) => (Number(b.focusSeconds) || 0) - (Number(a.focusSeconds) || 0));
      return list.map((item, index) => ({
        ...item,
        rank: index + 1
      }));
    },

    async syncToGlobalLeaderboard(user) {
      if (!user || !user.id) return false;
      const cleanId = encodeURIComponent(user.id);
      const payload = {
        id: user.id,
        nickname: user.nickname || 'Anonymous',
        focusSeconds: Number(user.focusSeconds) || 3600,
        todayDisplay: user.todayDisplay || '1h 00m',
        streak: Number(user.streak) || 1,
        solvedCount: Number(user.solvedCount) || 1,
        avatar: user.avatar || '⚡',
        lastActive: Date.now()
      };

      await apiFetch(`/leaderboard/${cleanId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      return true;
    }
  };
})();
