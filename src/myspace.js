/* =============================================================================
   My Space — Collaborative Focus & Competitive Arena
   Handles view routing, focus room lobby, two-column group dashboard,
   weekly global leaderboard with Monday 5:30 AM IST (00:00 UTC) reset, live member presence,
   in-page LeetCode timer sync, and secure Firebase Realtime Database integration.
============================================================================= */

(() => {
  'use strict';

  const STORAGE_KEYS = {
    ROOM: 'msActiveRoom',
    NICKNAME: 'msUserNickname',
    USER_ID: 'msUserId',
    FOCUS_TIME: 'msTodayFocusSeconds',
    FOCUS_CYCLE: 'msTodayFocusCycle',
    WEEKLY_FOCUS_TIME: 'msWeeklyFocusSeconds',
    WEEKLY_FOCUS_CYCLE: 'msWeeklyFocusCycle',
    POMODORO: 'lctPomodoro',
    SETTINGS: 'lctSettings',
    STATS: 'lcStats',
    CURRENT_PROBLEM: 'lcCurrentProblem',
    RECENT_SOLVE: 'lcRecentSolve',
    PENDING_JOIN_CODE: 'msPendingJoinCode'
  };

  const DEFAULT_TIMER_SECONDS = 25 * 60; // 25 minutes default Pomodoro
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in SVG -> ~326.72

  const state = {
    currentView: 'lobby', // 'lobby' | 'create' | 'join' | 'workspace'
    activeWorkspaceTab: 'group', // 'group' | 'leaderboard'
    activeRoom: null,
    nickname: '',
    userId: '',
    nicknameModalOpen: false,
    leaveConfirmOpen: false,
    pendingJoinCode: null, // set when auto-navigated via ?glowroom=GLOW-XXXX
    selectedRoomType: 'private', // 'private' | 'open'
    selectedTopic: 'All', // 'All' | 'Blind 75' | 'Dynamic Programming' | etc.
    currentProblem: null, // { slug, number, title, difficulty }
    recentSolve: null,    // { slug, number, title, difficulty, timestamp }
    
    // Focus Timer State
    timer: {
      secondsLeft: DEFAULT_TIMER_SECONDS,
      totalSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false,
      status: 'Focusing', // 'Focusing' | 'Break' | 'Paused' | 'Idle'
      interval: null
    },

    todayFocusSeconds: 0,
    lastFocusCycle: null, // daily cycle ID (resets 5:30 AM IST / 00:00 UTC)
    weeklyFocusSeconds: 0,
    lastWeeklyCycle: null, // weekly cycle ID (resets Monday 5:30 AM IST / 00:00 UTC)
    streak: 0,
    solvedCount: 0,
    members: [],
    globalLeaders: [],
    leaderboardLoading: false,
    settingsMenuOpen: false,
    memberPollInterval: null
  };

  function formatTime(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatHoursMinutes(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `GLOW-${code}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Extract clean 1-2 character uppercase initials from any nickname/name
  function getInitials(name) {
    if (!name) return 'C';
    const cleaned = String(name).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    if (!cleaned) return 'C';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Generate shareable room invite link: https://leetcode.com/problems/{slug}/?glowroom=GLOW-XXXX
  function getShareableRoomUrl(roomCode) {
    const rawCode = roomCode || (state.activeRoom && state.activeRoom.code) || '';
    const normCode = window.MySpaceAPI ? window.MySpaceAPI.normalizeRoomCode(rawCode) : rawCode.trim().toUpperCase();
    const slug = (state.currentProblem && state.currentProblem.slug) ? state.currentProblem.slug : 'two-sum';
    return `https://leetcode.com/problems/${encodeURIComponent(slug)}/?glowroom=${encodeURIComponent(normCode)}`;
  }

  // Cryptographically safe host verification by userId (falls back to nickname)
  function checkIsHost(room) {
    if (!room) return false;
    if (room.creatorId && state.userId) {
      return room.creatorId === state.userId;
    }
    return Boolean(room.isHost || (state.nickname && room.creator === state.nickname));
  }

  // Render unified DSA problem status pill (Solving: Yellow | Solved: Green | Next question: Yellow)
  function renderMemberBadges(m, isYou) {
    const prob = isYou ? (state.currentProblem || m.currentProblem) : m.currentProblem;
    const solve = isYou ? (state.recentSolve || m.recentSolve) : m.recentSolve;

    if (!prob && !solve) return '';

    const probSlug = prob ? String(prob.slug || (prob.title || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    const solveSlug = solve ? String(solve.slug || (solve.title || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    const probNum = prob ? String(prob.number || '').trim() : '';
    const solveNum = solve ? String(solve.number || '').trim() : '';

    const solveTime = solve ? Number(solve.timestamp || 0) : 0;
    const isFreshSolve = solve && (Date.now() - solveTime < 30 * 60 * 1000);

    const isSameProblem = Boolean(
      (probSlug && solveSlug && probSlug === solveSlug) ||
      (probNum && solveNum && probNum === solveNum)
    );

    let isSolved = false;
    let displayNum = '';
    let displayTitle = '';

    if (isFreshSolve && isSameProblem) {
      // Solved this exact problem and hasn't navigated away to a different problem
      isSolved = true;
      displayNum = probNum || solveNum;
      displayTitle = (prob && prob.title) || (solve && solve.title) || 'Problem';
    } else if (prob && (prob.title || prob.slug)) {
      // Actively on a problem (unsolved, or navigated to next question!)
      isSolved = false;
      displayNum = probNum;
      displayTitle = prob.title || prob.slug;
    } else if (isFreshSolve && solve && solve.title) {
      // Solved recently and not currently on any problem page
      isSolved = true;
      displayNum = solveNum;
      displayTitle = solve.title;
    } else {
      return '';
    }

    const numPrefix = displayNum ? `#${displayNum} ` : '';
    const fullLabel = `${numPrefix}${displayTitle}`;
    const statusText = isSolved ? `Solved: ${fullLabel}` : `Solving: ${fullLabel}`;

    if (isSolved) {
      return `
        <div class="ms-member-badges">
          <span class="ms-member-pill pill-solved" title="${escapeHtml(statusText)}">
            <svg class="ms-pill-check-icon" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span class="ms-pill-text">${escapeHtml(fullLabel)}</span>
          </span>
        </div>
      `;
    }

    return `
      <div class="ms-member-badges">
        <span class="ms-member-pill pill-solving" title="${escapeHtml(statusText)}">
          <span class="ms-pill-target-icon">🎯</span>
          <span class="ms-pill-text">${escapeHtml(fullLabel)}</span>
        </span>
      </div>
    `;
  }

  // Calculate real consecutive days streak and total solved clears from LeetCode data (lcStats)
  function computeStreakAndClears(lcStats) {
    if (!lcStats || typeof lcStats !== 'object') {
      return { streak: 0, clears: 0 };
    }
    const days = Array.isArray(lcStats.days) ? lcStats.days : [];
    const clears = Math.max(0, Number(lcStats.clears) || 0);
    const set = new Set(days);

    function formatDay(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    let streak = 0;
    const d = new Date();
    // Check if streak was maintained today
    if (set.has(formatDay(d))) {
      while (set.has(formatDay(d))) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
    } else {
      // Check if streak is still active from yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (set.has(formatDay(yesterday))) {
        const cur = new Date(yesterday.getTime());
        while (set.has(formatDay(cur))) {
          streak++;
          cur.setDate(cur.getDate() - 1);
        }
      }
    }

    return { streak, clears };
  }

  // Polished floating notification (clean, minimal, professional)
  function showMySpaceToast(message) {
    let toast = document.getElementById('msToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'msToast';
      toast.className = 'ms-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <svg class="ms-toast-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
        <path d="M13.25 4.75L6 12L2.75 8.75" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="ms-toast-text">${escapeHtml(message)}</span>
    `;
    toast.classList.remove('visible');
    void toast.offsetWidth;
    toast.classList.add('visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2200);
  }

  // Get a member's 24h cumulative focus seconds (resets daily at 5:30 AM IST / 00:00:00 UTC)
  function getMemberCumulativeSeconds(m, isYou) {
    if (isYou) return state.todayFocusSeconds;
    const curCycle = window.MySpaceAPI ? window.MySpaceAPI.getDailyCycleId() : '';
    if (m.cycleDate && m.cycleDate === curCycle && m.todayFocusSeconds !== undefined) {
      return Math.max(0, Number(m.todayFocusSeconds) || 0);
    }
    if (m.todayFocusSeconds !== undefined && Number(m.todayFocusSeconds) > 0) {
      return Math.max(0, Number(m.todayFocusSeconds) || 0);
    }
    return 0;
  }

  function renderCumulativeMembersHtml() {
    const list = [...state.members];
    const items = list.map((m) => {
      const isYou = m.id === state.userId;
      const seconds = getMemberCumulativeSeconds(m, isYou);
      return {
        ...m,
        isYou,
        seconds
      };
    });

    // Rank highest cumulative practice time first
    items.sort((a, b) => b.seconds - a.seconds);

    return items.map((item) => `
      <div class="ms-cumulative-item ${item.isYou ? 'is-you' : ''}">
        <div class="ms-cumulative-left">
          <div class="ms-member-avatar-wrap ${item.isYou ? 'is-you' : ''}" style="width: 26px; height: 26px; font-size: 10px;">
            <span class="ms-avatar-text">${escapeHtml(getInitials(item.nickname || 'Coder'))}</span>
          </div>
          <span class="ms-cumulative-name">${escapeHtml(item.nickname || 'Coder')}${item.isYou ? ' (You)' : ''}</span>
        </div>
        <span class="ms-cumulative-time">${formatHoursMinutes(item.seconds)}</span>
      </div>
    `).join('');
  }

  // Resets focus time daily at 5:30 AM IST (00:00:00 UTC) worldwide
  function checkDailyReset() {
    if (!window.MySpaceAPI) return;
    const currentCycle = window.MySpaceAPI.getDailyCycleId();
    if (state.lastFocusCycle && state.lastFocusCycle !== currentCycle) {
      state.todayFocusSeconds = 0;
      state.lastFocusCycle = currentCycle;
      persistTodayFocus();
      updateTimerUI();
      updateMembersListUI();
    }
  }

  // Resets weekly focus time every Monday at 5:30 AM IST (00:00:00 UTC) worldwide
  function checkWeeklyReset() {
    if (!window.MySpaceAPI || !window.MySpaceAPI.getWeeklyCycleId) return;
    const currentWeekCycle = window.MySpaceAPI.getWeeklyCycleId();
    if (state.lastWeeklyCycle && state.lastWeeklyCycle !== currentWeekCycle) {
      state.weeklyFocusSeconds = 0;
      state.lastWeeklyCycle = currentWeekCycle;
      persistTodayFocus();
    }
  }

  // Format member status based on presence and active time
  function formatMemberStatus(member, isYou) {
    if (isYou) {
      if (state.timer.status === 'Break') {
        return {
          text: `Break • ${formatTime(state.timer.secondsLeft)}`,
          dotClass: 'dot-break',
          textClass: 'status-break'
        };
      } else {
        return {
          text: `Active • ${formatTime(state.timer.secondsLeft)}`,
          dotClass: 'dot-active',
          textClass: 'status-active'
        };
      }
    }

    const now = Date.now();
    const lastActive = Number(member.lastActive) || (now - 60000);
    const diffSec = Math.max(0, Math.floor((now - lastActive) / 1000));
    const isOnline = diffSec < 180; // active in last 3 minutes

    if (!isOnline) {
      let timeAgo = '';
      if (diffSec < 3600) {
        const m = Math.max(1, Math.floor(diffSec / 60));
        timeAgo = `${m}m ago`;
      } else if (diffSec < 86400) {
        const h = Math.floor(diffSec / 3600);
        timeAgo = `${h}h ago`;
      } else {
        const d = Math.floor(diffSec / 86400);
        timeAgo = `${d}d ago`;
      }
      return {
        text: `Active ${timeAgo}`,
        dotClass: 'dot-offline',
        textClass: 'status-offline'
      };
    }

    if (member.status === 'Break') {
      return {
        text: `Break • ${member.timerFormatted || '04:32'}`,
        dotClass: 'dot-break',
        textClass: 'status-break'
      };
    } else {
      const timeStr = member.timerFormatted ? ` • ${member.timerFormatted}` : '';
      return {
        text: `Active${timeStr}`,
        dotClass: 'dot-active',
        textClass: 'status-active'
      };
    }
  }

  // ===========================================================================
  // 1. LOBBY VIEW
  // ===========================================================================
  function renderLobbyView() {
    return `
      <div id="msViewLobby" class="ms-view ms-view-lobby">
        <!-- Study Banner -->
        <div class="ms-banner">
          <div class="ms-banner-content">
            <div class="ms-banner-user-row">
              <button id="msLobbyNicknameBtn" class="ms-banner-nick-pill" type="button" title="${state.nickname ? 'Change Nickname' : 'Set Nickname'}">
                <span class="ms-nick-avatar">${escapeHtml(getInitials(state.nickname || 'Coder'))}</span>
                <span class="ms-nick-text">${escapeHtml(state.nickname || 'Set Nickname')}</span>
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </div>
            <h2 class="ms-banner-title">Focus Together</h2>
            <p class="ms-banner-sub">Invite friends, stay consistent, and grow together.</p>
          </div>
        </div>

        <!-- 3 Feature Highlight Cards -->
        <div class="ms-features-grid">
          <div class="ms-feature-card">
            <div class="ms-feature-icon-wrap icon-focus">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span class="ms-feature-label">Stay Focused</span>
          </div>

          <div class="ms-feature-card">
            <div class="ms-feature-icon-wrap icon-progress">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <span class="ms-feature-label">Track Progress</span>
          </div>

          <div class="ms-feature-card">
            <div class="ms-feature-icon-wrap icon-challenge">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
                <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
              </svg>
            </div>
            <span class="ms-feature-label">Friendly Challenges</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="ms-lobby-actions">
          <button id="msOpenCreateBtn" class="ms-btn ms-btn-primary" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create a Room</span>
          </button>

          <button id="msOpenJoinBtn" class="ms-btn ms-btn-secondary" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Join with Room Code</span>
          </button>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // 2. CREATE ROOM VIEW (Fixed Sleek Layout & Classes)
  // ===========================================================================
  function renderCreateView() {
    return `
      <div id="msViewCreate" class="ms-view ms-view-create">
        <div class="ms-view-header">
          <button class="ms-back-btn ms-btn-back-lobby" type="button" aria-label="Back to Lobby">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h2 class="ms-view-title">Create a Focus Room</h2>
        </div>

        <div class="ms-form-card ms-create-room-card">
          <div class="ms-card-section-head">
            <div class="ms-section-badge-icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div>
              <h3 class="ms-card-section-title">New Study Session</h3>
              <p class="ms-card-section-sub">Configure your focus goals and invite peers to solve together.</p>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msRoomNameInput">
              <span>Room Name</span>
              <span class="ms-hint">Visible to members</span>
            </label>
            <input
              id="msRoomNameInput"
              class="ms-form-input"
              type="text"
              placeholder="e.g. Study Squad, LeetCode Grind"
              value="Study Squad"
              maxlength="32"
            />
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msRoomGoalSelect">
              <span>Goal (Daily)</span>
              <span class="ms-hint">Target per member</span>
            </label>
            <div class="ms-select-container">
              <span class="ms-select-lead-icon">🎯</span>
              <select id="msRoomGoalSelect">
                <option value="1 hour">1 hour</option>
                <option value="2 hours">2 hours</option>
                <option value="3 hours" selected>3 hours</option>
                <option value="4 hours">4 hours</option>
                <option value="5 hours">5 hours</option>
              </select>
              <span class="ms-select-arrow-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label">
              <span>Room Type</span>
              <span class="ms-hint">Access control</span>
            </label>
            <div class="ms-room-types" role="radiogroup" aria-label="Room Type">
              <button
                type="button"
                class="ms-room-type-btn ${state.selectedRoomType === 'private' ? 'active' : ''}"
                data-type="private"
                role="radio"
                aria-checked="${state.selectedRoomType === 'private'}"
              >
                <div class="type-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div class="ms-room-type-info">
                  <span class="ms-room-type-title">Private</span>
                  <span class="ms-room-type-desc">Invite code only</span>
                </div>
              </button>

              <button
                type="button"
                class="ms-room-type-btn ${state.selectedRoomType === 'open' ? 'active' : ''}"
                data-type="open"
                role="radio"
                aria-checked="${state.selectedRoomType === 'open'}"
              >
                <div class="type-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div class="ms-room-type-info">
                  <span class="ms-room-type-title">Public</span>
                  <span class="ms-room-type-desc">Open to all</span>
                </div>
              </button>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msRoomTopicSelect">
              <span>DSA Focus Topic</span>
              <span class="ms-hint">Practice theme</span>
            </label>
            <div class="ms-select-container">
              <span class="ms-select-lead-icon">📚</span>
              <select id="msRoomTopicSelect">
                <option value="General DSA" selected>General DSA / Mixed Practice</option>
                <option value="Blind 75 / Grind 75">Blind 75 / Grind 75</option>
                <option value="Dynamic Programming">Dynamic Programming (DP)</option>
                <option value="Trees & Graphs">Trees, Graphs & BFS/DFS</option>
                <option value="Arrays & Two Pointers">Arrays & Two Pointers</option>
                <option value="Contest Prep">Weekly Contest Prep ⏱️</option>
              </select>
              <span class="ms-select-arrow-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msCreatorNicknameInput">
              <span>Your Nickname</span>
              <span class="ms-hint">Shown in room</span>
            </label>
            <input
              id="msCreatorNicknameInput"
              class="ms-form-input"
              type="text"
              placeholder="e.g. Alex"
              value="${escapeHtml(state.nickname || '')}"
              maxlength="20"
            />
          </div>

          <div id="msCreateError" class="ms-error-text" hidden></div>

          <button id="msSubmitCreateBtn" class="ms-btn ms-btn-primary ms-btn-block" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create Room</span>
          </button>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // 3. JOIN ROOM VIEW (Container 1: Enter Code | Container 2: Public Available Groups)
  // ===========================================================================
  function renderJoinView() {
    return `
      <div id="msViewJoin" class="ms-view ms-view-join">
        <div class="ms-view-header">
          <button class="ms-back-btn ms-btn-back-lobby" type="button" aria-label="Back to Lobby">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h2 class="ms-view-title">Join a Focus Room</h2>
        </div>

        <!-- Container 1: Enter Room Code -->
        <div class="ms-form-card ms-join-code-card">
          <div class="ms-card-section-head">
            <div class="ms-section-badge-icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h3 class="ms-card-section-title">Enter Room Code</h3>
              <p class="ms-card-section-sub">Have an invite code from a friend? Enter it below.</p>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msJoinCodeInput">
              <span>Room Code</span>
              <span class="ms-hint">Ask your study partner</span>
            </label>
            <div class="ms-code-input-wrap">
              <span class="ms-code-prefix">GLOW-</span>
              <input
                id="msJoinCodeInput"
                class="ms-code-input"
                type="text"
                placeholder="9X42"
                value="${escapeHtml(state.pendingJoinCode ? state.pendingJoinCode.replace(/^GLOW-/i, '') : '')}"
                maxlength="6"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msJoinNicknameInput">Your Nickname</label>
            <input
              id="msJoinNicknameInput"
              class="ms-form-input"
              type="text"
              placeholder="e.g. Alex"
              value="${escapeHtml(state.nickname || '')}"
              maxlength="20"
            />
          </div>

          <div id="msJoinError" class="ms-error-text" hidden></div>

          <button id="msSubmitJoinBtn" class="ms-btn ms-btn-primary ms-btn-block" type="button">
            Join Room
          </button>
        </div>

        <!-- Container 2: Public Available Groups on Server -->
        <div class="ms-form-card ms-public-groups-card">
          <div class="ms-card-section-head ms-public-head">
            <div class="ms-section-badge-icon icon-globe">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div class="ms-public-title-area">
              <div class="ms-public-title-row">
                <h3 class="ms-card-section-title">Public Available Groups</h3>
                <span class="ms-live-indicator">
                  <span class="ms-live-dot"></span>
                  <span>Online</span>
                </span>
              </div>
              <p class="ms-card-section-sub">Browse and join open study squads on the server.</p>
            </div>
            <button id="msRefreshPublicBtn" class="ms-btn-refresh" type="button" title="Refresh public groups" aria-label="Refresh">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </button>
          </div>

          <div class="ms-topic-pills-bar" id="msTopicPillsBar">
            <button type="button" class="ms-topic-pill ${state.selectedTopic === 'All' ? 'active' : ''}" data-topic="All">All Topics</button>
            <button type="button" class="ms-topic-pill ${state.selectedTopic === 'Blind 75' ? 'active' : ''}" data-topic="Blind 75">Blind 75</button>
            <button type="button" class="ms-topic-pill ${state.selectedTopic === 'Dynamic Programming' ? 'active' : ''}" data-topic="Dynamic Programming">Dynamic Programming</button>
            <button type="button" class="ms-topic-pill ${state.selectedTopic === 'Trees & Graphs' ? 'active' : ''}" data-topic="Trees & Graphs">Trees & Graphs</button>
            <button type="button" class="ms-topic-pill ${state.selectedTopic === 'Arrays' ? 'active' : ''}" data-topic="Arrays">Arrays</button>
            <button type="button" class="ms-topic-pill ${state.selectedTopic === 'Contest Prep' ? 'active' : ''}" data-topic="Contest Prep">Contest Prep</button>
          </div>

          <div id="msPublicRoomsList" class="ms-public-rooms-list">
            <div class="ms-public-loading">
              <span class="ms-spinner"></span>
              <span>Loading public groups...</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // 4. ACTIVE GROUP WORKSPACE (Two-Column Layout + Leaderboard + Sticky Nav)
  // ===========================================================================
  function renderActiveWorkspace() {
    const room = state.activeRoom || {};
    const memberCount = (state.members && state.members.length) || 1;
    const goalText = room.goal || '3h';
    const shortGoal = goalText.replace(/\s*hours?/, 'h');
    const goalHours = parseInt(goalText, 10) || 3;
    const todayGoalSec = goalHours * 3600;
    const progressPct = Math.min(100, Math.round((state.todayFocusSeconds / todayGoalSec) * 100));

    // Calculate circular timer offset
    const pct = Math.max(0, Math.min(1, state.timer.secondsLeft / state.timer.totalSeconds));
    const strokeOffset = CIRCLE_CIRCUMFERENCE * (1 - pct);

    return `
      <div id="msWorkspace" class="ms-workspace" data-workspace-tab="${state.activeWorkspaceTab}">
        <!-- 1. Sleek Group Info Header Card -->
        <div class="ms-group-info-card">
          <div class="ms-group-info-left">
            <img class="ms-group-thumb" src="../textures/myspace-banner.webp" alt="Room Banner" />
            <div class="ms-group-meta">
              <h3 class="ms-group-name" title="${escapeHtml(room.name || 'Study Squad')}">${escapeHtml(room.name || 'Study Squad')}</h3>
              <div class="ms-group-sub">
                <span class="ms-meta-item">${memberCount} member${memberCount === 1 ? '' : 's'}</span>
                <span class="dot">•</span>
                <span class="ms-meta-item">Goal: ${escapeHtml(shortGoal)}</span>
                ${room.topic ? `<span class="dot">•</span><span class="ms-topic-tag" title="${escapeHtml(room.topic)}">${escapeHtml(room.topic)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="ms-group-actions">
            <button id="msGroupShareBtn" class="ms-group-action-btn ms-group-share-btn" type="button" title="Share Room Invite Link" aria-label="Share Room Invite Link">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <button id="msGroupSettingsBtn" class="ms-group-action-btn ms-group-settings-btn" type="button" title="Group Settings" aria-label="Settings">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Settings Popup Menu -->
        <div id="msSettingsMenu" class="ms-settings-menu" style="display: ${state.settingsMenuOpen ? 'flex' : 'none'};">
          <button id="msChangeNicknameBtn" class="ms-menu-item" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Change Nickname</span>
          </button>
          <button id="msCopyCodeBtn" class="ms-menu-item" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Copy Invite Link</span>
          </button>
          <button id="msLeaveGroupBtn" class="ms-menu-item danger" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Leave Group</span>
          </button>
        </div>

        <!-- Inline Leave Confirmation Dialog -->
        ${state.leaveConfirmOpen ? `
          <div class="ms-leave-inline-confirm" id="msLeaveInlineConfirm" role="alert">
            <div class="ms-leave-confirm-info">
              <svg class="ms-leave-confirm-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span class="ms-leave-confirm-text">Leave this session? Your focus time is saved.</span>
            </div>
            <div class="ms-leave-confirm-actions">
              <button id="msCancelLeaveBtn" class="ms-btn-inline-cancel" type="button">Cancel</button>
              <button id="msConfirmLeaveBtn" class="ms-btn-inline-leave" type="button">Leave</button>
            </div>
          </div>
        ` : ''}

        <!-- 2. Flexible Content Size Area -->
        <div class="ms-workspace-body">
          ${state.activeWorkspaceTab === 'group' ? renderGroupContent(progressPct, strokeOffset) : renderLeaderboardContent()}
        </div>

        <!-- 3. Sticky Bottom Navigation Bar (Anchored downward above footer) -->
        <nav class="ms-bottom-nav" role="tablist" aria-label="Group Navigation">
          <button
            id="msNavGroupBtn"
            class="ms-nav-btn ${state.activeWorkspaceTab === 'group' ? 'active' : ''}"
            type="button"
            role="tab"
            aria-selected="${state.activeWorkspaceTab === 'group'}"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Group</span>
          </button>

          <button
            id="msNavLeaderboardBtn"
            class="ms-nav-btn ${state.activeWorkspaceTab === 'leaderboard' ? 'active' : ''}"
            type="button"
            role="tab"
            aria-selected="${state.activeWorkspaceTab === 'leaderboard'}"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
              <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
            </svg>
            <span>Leaderboard</span>
          </button>

          <button
            class="ms-nav-btn disabled"
            type="button"
            title="Challenges & Arena (Coming Soon)"
            disabled
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Arena</span>
            <span class="ms-nav-soon">Soon</span>
          </button>
        </nav>
      </div>
    `;
  }

  function renderGroupContent(progressPct, strokeOffset) {
    const isFocusing = state.timer.status === 'Focusing';
    const isBreak = state.timer.status === 'Break';
    const timeFormatted = formatTime(state.timer.secondsLeft);
    const room = state.activeRoom || {};

    // Donut progress calculation for bottom card
    const donutCirc = 2 * Math.PI * 13; // r=13 -> ~81.68
    const donutOffset = donutCirc * (1 - (progressPct / 100));

    return `
      <div class="ms-group-dashboard">
        <!-- Two Columns Section -->
        <div class="ms-group-columns">
          <!-- Left Column: Circular Focus Timer -->
          <div class="ms-col-timer">
            <div class="ms-timer-gauge">
              <svg class="ms-timer-svg" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="msTimerGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#ec4899" />
                    <stop offset="100%" stop-color="#f43f5e" />
                  </linearGradient>
                </defs>
                <circle class="ms-timer-bg-arc" cx="60" cy="60" r="52" />
                <circle
                  class="ms-timer-progress-arc"
                  cx="60" cy="60" r="52"
                  stroke-dasharray="${CIRCLE_CIRCUMFERENCE}"
                  stroke-dashoffset="${strokeOffset}"
                />
              </svg>

              <div class="ms-timer-center">
                <span class="ms-timer-label">${isBreak ? 'Break' : 'Focus'}</span>
                <span class="ms-timer-digits">${timeFormatted}</span>
                <span class="ms-timer-status-pill ${isBreak ? 'status-break' : isFocusing ? 'status-focus' : 'status-idle'}">
                  ${isBreak ? '☕ Break' : isFocusing ? '🍃 Focusing' : '⏸ Paused'}
                </span>
              </div>
            </div>

            <!-- Timer Actions -->
            <div class="ms-timer-actions">
              <button id="msTimerPlayBtn" class="ms-btn-timer-play" type="button" title="${state.timer.isRunning ? 'Pause' : 'Start'}">
                ${state.timer.isRunning ? `
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1.5" />
                    <rect x="14" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                ` : `
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                `}
              </button>

              <button id="msTimerStopBtn" class="ms-btn-timer-stop" type="button" title="Reset Session">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Right Column: Members and Status -->
          <div class="ms-col-members">
            <div class="ms-members-header">
              <span>Members (${state.members.length})</span>
            </div>

            <div class="ms-members-scroll">
              ${state.members.map((m) => {
                const isYou = m.id === state.userId;
                const { text, dotClass, textClass } = formatMemberStatus(m, isYou);

                return `
                  <div class="ms-member-row ${isYou ? 'is-you' : ''}">
                    <div class="ms-member-avatar-wrap ${isYou ? 'is-you' : ''}">
                      <span class="ms-avatar-text">${escapeHtml(getInitials(m.nickname || 'Coder'))}</span>
                      <span class="ms-member-dot ${dotClass}"></span>
                    </div>
                    <div class="ms-member-info">
                      <span class="ms-member-name-line">
                        <span>${escapeHtml(m.nickname || 'Coder')}${isYou ? ' (You)' : ''}</span>
                        ${m.isHost ? '<span class="ms-member-crown" title="Host">👑</span>' : ''}
                      </span>
                      <span class="ms-member-status-text ${textClass}">
                        ${escapeHtml(text)}
                      </span>
                      ${renderMemberBadges(m, isYou)}
                    </div>
                  </div>
                `;
              }).join('')}

              ${state.members.length === 1 ? `
                <div class="ms-member-invite-hint">
                  <span>Study squad active! Invite friends to code together live:</span>
                  <button id="msCopyInviteHintBtn" class="ms-btn-hint-share" type="button">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span>Copy Room Invite Link</span>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Bottom Card: Group Status / Daily Progress Bar -->
        <div class="ms-group-stats-card">
          <div class="ms-stat-box">
            <span class="ms-stat-label">Today (Room)</span>
            <span class="ms-stat-val">${formatHoursMinutes(state.todayFocusSeconds)}</span>
          </div>

          <div class="ms-stat-box">
            <span class="ms-stat-label">Goal</span>
            <span class="ms-stat-val">${escapeHtml(room.goal || '3h')}</span>
          </div>

          <div class="ms-stat-progress-wrap">
            <div class="ms-stat-donut">
              <svg viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="13" fill="none" stroke="#f1f5f9" stroke-width="3" />
                <circle
                  cx="16" cy="16" r="13"
                  fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round"
                  stroke-dasharray="${donutCirc}"
                  stroke-dashoffset="${donutOffset}"
                />
              </svg>
            </div>
            <div class="ms-stat-progress-text">
              <span class="ms-stat-progress-title">Progress</span>
              <span class="ms-stat-progress-pct">${progressPct}%</span>
            </div>
          </div>
        </div>

        <!-- 24h Cumulative Practice Time Container (Resets daily at 5:30 AM IST) -->
        <div class="ms-cumulative-card">
          <div class="ms-cumulative-head">
            <div class="ms-cumulative-title-wrap">
              <span class="ms-cumulative-icon">⏱️</span>
              <span class="ms-cumulative-title">Daily Practice (24h)</span>
            </div>
            <span class="ms-cumulative-badge">Resets 5:30 AM IST</span>
          </div>

          <div id="msCumulativeList" class="ms-cumulative-list">
            ${renderCumulativeMembersHtml()}
          </div>
        </div>
      </div>
    `;
  }

  // Weekly Leaderboard View (Top 20 worldwide)
  function renderLeaderboardContent() {
    const leaders = (state.globalLeaders && state.globalLeaders.length) ? state.globalLeaders : [];
    const userRankIdx = leaders.findIndex(l => l.id === state.userId || (state.nickname && l.nickname === state.nickname));
    const isUserInTop20 = userRankIdx >= 0 && userRankIdx < 20;
    const currentRoomName = state.activeRoom
      ? (state.activeRoom.type === 'private' ? 'Private Squad 🔒' : (state.activeRoom.name || 'Study Squad'))
      : 'Solo Coder';

    return `
      <div class="ms-leaderboard-view">
        <div class="ms-leaderboard-header">
          <div class="ms-lb-title">
            <span>🏆 Global Focus Arena</span>
          </div>
          <div class="ms-lb-badge-group">
            <button id="msRefreshLeaderboardBtn" class="ms-btn-refresh ms-lb-refresh-btn" type="button" title="Refresh leaderboard" aria-label="Refresh leaderboard">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </button>
            <span class="ms-lb-badge">Top 20</span>
          </div>
        </div>

        <div class="ms-leaderboard-list">
          ${state.leaderboardLoading && leaders.length === 0 ? `
            <div class="ms-lb-loading">
              <div class="ms-lb-spinner"></div>
              <span>Connecting to Global Arena...</span>
            </div>
          ` : leaders.length === 0 ? `
            <div class="ms-lb-empty">
              <span class="ms-lb-empty-icon">🏆</span>
              <span class="ms-lb-empty-title">Be the first on the board!</span>
              <p class="ms-lb-empty-sub">Focus with LeetGlow to climb this week's global ranking.</p>
            </div>
          ` : leaders.map((item) => {
            const isYou = item.id === state.userId || (state.nickname && item.nickname === state.nickname);
            const rankClass = item.rank === 1 ? 'ms-lb-rank-1' : item.rank === 2 ? 'ms-lb-rank-2' : item.rank === 3 ? 'ms-lb-rank-3' : '';
            const rankEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

            return `
              <div class="ms-lb-item ${isYou ? 'is-you' : ''}">
                <div class="ms-lb-rank-badge ${rankClass}">
                  <span>${rankEmoji}</span>
                </div>
                <div class="ms-member-avatar-wrap ${isYou ? 'is-you' : ''}" style="width: 28px; height: 28px; font-size: 11px;">
                  <span class="ms-avatar-text">${escapeHtml(item.avatar || getInitials(item.nickname || 'Coder'))}</span>
                </div>
                <div class="ms-lb-user-info">
                  <span class="ms-lb-name">${escapeHtml(item.nickname)}${isYou ? ' (You)' : ''}</span>
                  <span class="ms-lb-stats">${Number(item.streak) > 0 ? `🔥 ${item.streak}d streak • ` : ''}${Number(item.solvedCount) > 0 ? `✓ ${item.solvedCount} solved • ` : ''}🏷️ ${escapeHtml(item.roomName || 'Solo Coder')}</span>
                </div>
                <span class="ms-lb-hours">${escapeHtml(item.weeklyDisplay || item.todayDisplay || '0m')}</span>
              </div>
            `;
          }).join('')}

          ${(!isUserInTop20 && leaders.length > 0) ? `
            <div class="ms-lb-pinned-user">
              <div class="ms-lb-item is-you">
                <div class="ms-lb-rank-badge">
                  <span>#${leaders.length + 1}</span>
                </div>
                <div class="ms-member-avatar-wrap is-you" style="width: 28px; height: 28px; font-size: 11px;">
                  <span class="ms-avatar-text">${escapeHtml(getInitials(state.nickname || 'You'))}</span>
                </div>
                <div class="ms-lb-user-info">
                  <span class="ms-lb-name">${escapeHtml(state.nickname || 'You')} (You)</span>
                  <span class="ms-lb-stats">${state.streak > 0 ? `🔥 ${state.streak}d streak • ` : ''}${state.solvedCount > 0 ? `✓ ${state.solvedCount} solved • ` : ''}🏷️ ${escapeHtml(currentRoomName)}</span>
                </div>
                <span class="ms-lb-hours">${formatHoursMinutes(Math.max(state.weeklyFocusSeconds || 0, state.todayFocusSeconds || 0))}</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Modal: Set / Change Nickname Prompt
  function renderNicknameModal(container) {
    if (!state.nicknameModalOpen) return;

    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'msNicknameModal';
    modalBackdrop.className = 'ms-modal-backdrop';
    modalBackdrop.innerHTML = `
      <div class="ms-modal-card" role="dialog" aria-modal="true" aria-labelledby="msModalTitle">
        <div class="ms-modal-badge">
          <span class="ms-modal-icon">👋</span>
        </div>
        <h3 id="msModalTitle" class="ms-modal-title">${state.nickname ? 'Update Nickname' : 'Welcome to My Space'}</h3>
        <p class="ms-modal-sub">${state.nickname ? 'Change the name visible to your study squad and leaderboard.' : 'Choose your coder nickname to get started with focus rooms and practice.'}</p>
        <div class="ms-modal-form">
          <div class="ms-form-group">
            <label class="ms-form-label" for="msModalNicknameInput">
              <span>Nickname</span>
              <span class="ms-hint">Max 20 chars</span>
            </label>
            <input
              id="msModalNicknameInput"
              class="ms-form-input"
              type="text"
              placeholder="e.g. Alex, CodeNinja"
              value="${escapeHtml(state.nickname || '')}"
              maxlength="20"
              autocomplete="off"
              spellcheck="false"
            />
            <div id="msModalNicknameError" class="ms-error-text" hidden></div>
          </div>
          <div class="ms-modal-actions">
            <button id="msModalSaveNicknameBtn" class="ms-btn ms-btn-primary ms-btn-block" type="button">
              ${state.nickname ? 'Save Nickname' : 'Get Started'}
            </button>
            ${state.nickname ? `
              <button id="msModalCancelNicknameBtn" class="ms-btn-modal-cancel" type="button">Cancel</button>
            ` : `
              <button id="msModalSkipNicknameBtn" class="ms-btn-modal-cancel" type="button">Skip for now</button>
            `}
          </div>
        </div>
      </div>
    `;

    container.appendChild(modalBackdrop);

    const input = modalBackdrop.querySelector('#msModalNicknameInput');
    const saveBtn = modalBackdrop.querySelector('#msModalSaveNicknameBtn');
    const cancelBtn = modalBackdrop.querySelector('#msModalCancelNicknameBtn');
    const skipBtn = modalBackdrop.querySelector('#msModalSkipNicknameBtn');
    const errorEl = modalBackdrop.querySelector('#msModalNicknameError');

    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);

    function submitNickname() {
      const val = (input && input.value.trim()) || '';
      if (!val) {
        if (errorEl) {
          errorEl.textContent = 'Please enter a nickname (1-20 characters)';
          errorEl.hidden = false;
        }
        if (input) input.focus();
        return;
      }
      state.nickname = val;
      state.nicknameModalOpen = false;
      chrome.storage.local.set({ [STORAGE_KEYS.NICKNAME]: val });

      // Update self in room if active
      if (state.activeRoom) {
        const selfMember = state.members.find(m => m.id === state.userId);
        if (selfMember) {
          selfMember.nickname = val;
          selfMember.avatar = getInitials(val);
        }
        if (state.activeRoom.creator === state.nickname || state.activeRoom.isHost) {
          state.activeRoom.creator = val;
        }
        chrome.storage.local.set({ [STORAGE_KEYS.ROOM]: state.activeRoom });
        syncHeartbeat();
      }

      render();
      showMySpaceToast(`Nickname saved: ${val}`);
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', submitNickname);
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNickname();
        } else if (e.key === 'Escape' && state.nickname) {
          state.nicknameModalOpen = false;
          render();
        }
      });
      input.addEventListener('input', () => {
        if (errorEl) errorEl.hidden = true;
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        state.nicknameModalOpen = false;
        render();
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const defaultNick = 'Coder';
        state.nickname = defaultNick;
        state.nicknameModalOpen = false;
        chrome.storage.local.set({ [STORAGE_KEYS.NICKNAME]: defaultNick });
        render();
        showMySpaceToast(`Using default nickname: ${defaultNick}`);
      });
    }
  }

  // ===========================================================================
  // 5. VIEW RENDER DISPATCHER
  // ===========================================================================
  function render() {
    const container = document.getElementById('view-myspace');
    if (!container) return;

    state.settingsMenuOpen = false;

    if (state.activeRoom) {
      container.dataset.view = 'workspace';
      container.dataset.workspaceTab = state.activeWorkspaceTab;
      container.innerHTML = renderActiveWorkspace();
      bindWorkspaceEvents(container);
      renderNicknameModal(container);
      return;
    }

    container.dataset.workspaceTab = '';
    if (state.currentView === 'create') {
      container.dataset.view = 'create';
      container.innerHTML = renderCreateView();
      bindCreateEvents(container);
    } else if (state.currentView === 'join') {
      container.dataset.view = 'join';
      container.innerHTML = renderJoinView();
      bindJoinEvents(container);
    } else {
      container.dataset.view = 'lobby';
      container.innerHTML = renderLobbyView();
      bindLobbyEvents(container);
    }
    renderNicknameModal(container);
  }

  // ===========================================================================
  // 6. EVENT BINDINGS
  // ===========================================================================
  function bindLobbyEvents(container) {
    const nickBtn = container.querySelector('#msLobbyNicknameBtn');
    if (nickBtn) {
      nickBtn.addEventListener('click', () => {
        state.nicknameModalOpen = true;
        render();
      });
    }

    const createBtn = container.querySelector('#msOpenCreateBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        state.currentView = 'create';
        render();
      });
    }

    const joinBtn = container.querySelector('#msOpenJoinBtn');
    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        state.currentView = 'join';
        render();
      });
    }
  }

  function bindCreateEvents(container) {
    const backBtn = container.querySelector('.ms-btn-back-lobby, .ms-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        state.currentView = 'lobby';
        render();
      });
    }

    const typeBtns = container.querySelectorAll('.ms-room-type-btn');
    typeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedRoomType = btn.dataset.type || 'private';
        typeBtns.forEach((b) => {
          const isSelected = b === btn;
          b.classList.toggle('active', isSelected);
          b.setAttribute('aria-checked', String(isSelected));
        });
      });
    });

    const submitBtn = container.querySelector('#msSubmitCreateBtn');
    const nameInput = container.querySelector('#msRoomNameInput');
    const goalSelect = container.querySelector('#msRoomGoalSelect');
    const topicSelect = container.querySelector('#msRoomTopicSelect');
    const nicknameInput = container.querySelector('#msCreatorNicknameInput');
    const errorEl = container.querySelector('#msCreateError');

    // Dismiss error on input and allow Enter submission
    [nameInput, nicknameInput].forEach((inp) => {
      if (!inp) return;
      inp.addEventListener('input', () => {
        if (errorEl) errorEl.hidden = true;
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (submitBtn) submitBtn.click();
        }
      });
    });

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const roomName = (nameInput && nameInput.value.trim()) || 'Study Squad';
        const goal = (goalSelect && goalSelect.value) || '3 hours';
        const topic = (topicSelect && topicSelect.value) || 'General DSA';
        const nickname = (nicknameInput && nicknameInput.value.trim()) || state.nickname;

        if (!nickname) {
          if (errorEl) {
            errorEl.textContent = 'Please enter your nickname before creating the room';
            errorEl.hidden = false;
          }
          if (nicknameInput) nicknameInput.focus();
          return;
        }

        submitBtn.disabled = true;
        const prevContent = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span>Creating Room...</span>`;

        try {
          const roomCode = generateRoomCode();
          const timerFormatted = formatTime(state.timer.secondsLeft || DEFAULT_TIMER_SECONDS);
          const initialMembers = [
            {
              id: state.userId,
              nickname: nickname,
              status: state.timer.status || 'Active',
              timerFormatted: timerFormatted,
              isHost: true,
              avatar: getInitials(nickname),
              currentProblem: state.currentProblem,
              recentSolve: state.recentSolve,
              joinedAt: Date.now()
            }
          ];

          const room = {
            code: roomCode,
            name: roomName,
            goal: goal,
            topic: topic,
            type: state.selectedRoomType,
            creator: nickname,
            creatorId: state.userId,
            createdAt: Date.now(),
            members: initialMembers
          };

          state.activeRoom = room;
          state.nickname = nickname;
          state.members = initialMembers;

          // Persist locally
          await chrome.storage.local.set({
            [STORAGE_KEYS.ROOM]: room,
            [STORAGE_KEYS.NICKNAME]: nickname
          });

          // Sync with Firebase in background
          if (window.MySpaceAPI) {
            await window.MySpaceAPI.saveRoom(room);
            await window.MySpaceAPI.syncMember(roomCode, initialMembers[0], {
              memberCount: 1,
              isPublic: room.type === 'open'
            });
          }

          startMemberPolling();
          render();
        } catch (err) {
          console.error('[MySpace] Failed to create room:', err);
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevContent;
          if (errorEl) {
            errorEl.textContent = 'Failed to create room. Please try again.';
            errorEl.hidden = false;
          }
        }
      });
    }
  }

  function bindJoinEvents(container) {
    const backBtn = container.querySelector('.ms-btn-back-lobby, .ms-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        state.currentView = 'lobby';
        render();
      });
    }

    const codeInput = container.querySelector('#msJoinCodeInput');
    const nicknameInput = container.querySelector('#msJoinNicknameInput');
    const submitBtn = container.querySelector('#msSubmitJoinBtn');
    const errorEl = container.querySelector('#msJoinError');
    const publicListEl = container.querySelector('#msPublicRoomsList');
    const refreshBtn = container.querySelector('#msRefreshPublicBtn');

    if (codeInput) {
      if (state.pendingJoinCode) {
        codeInput.value = state.pendingJoinCode.replace(/^GLOW-/i, '');
        showMySpaceToast(`Invite code ${state.pendingJoinCode} pre-filled! 🔗`);
        state.pendingJoinCode = null;
      }

      codeInput.addEventListener('input', () => {
        let val = codeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (val.startsWith('GLOW-')) {
          val = val.slice(5);
        } else if (val.startsWith('GLOW')) {
          val = val.slice(4);
        }
        val = val.replace(/-/g, '').slice(0, 6);
        codeInput.value = val;
        if (errorEl) errorEl.hidden = true;
      });

      codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (submitBtn) submitBtn.click();
        }
      });
    }

    // Shared execution logic for joining with direct code or public group
    async function executeJoin(rawCode, targetBtn, feedbackEl) {
      const suffix = String(rawCode || '').replace(/^GLOW-?/i, '').trim();
      if (!suffix || suffix.length < 3) {
        if (feedbackEl) {
          feedbackEl.textContent = 'Please enter a valid room code';
          feedbackEl.hidden = false;
        }
        if (codeInput) codeInput.focus();
        return;
      }

      const nickname = (nicknameInput && nicknameInput.value.trim()) || state.nickname;
      if (!nickname) {
        if (feedbackEl) {
          feedbackEl.textContent = 'Please enter your nickname before joining';
          feedbackEl.hidden = false;
        }
        if (nicknameInput) nicknameInput.focus();
        return;
      }
      const code = window.MySpaceAPI ? window.MySpaceAPI.normalizeRoomCode(rawCode) : rawCode;

      const prevText = targetBtn ? targetBtn.textContent : '';
      if (targetBtn) {
        targetBtn.disabled = true;
        targetBtn.textContent = 'Connecting...';
      }

      try {
        let onlineRoom = null;
        if (window.MySpaceAPI) {
          onlineRoom = await window.MySpaceAPI.getRoom(code);
        }

        // Validate if room was found in database
        if (!onlineRoom || !onlineRoom.info) {
          if (targetBtn) {
            targetBtn.disabled = false;
            targetBtn.textContent = prevText || 'Join Room';
          }
          if (feedbackEl) {
            feedbackEl.innerHTML = `Room <strong>${escapeHtml(code)}</strong> not found.<br><span style="font-size: 10px; opacity: 0.85;">Check the code with your room host. (Make sure they clicked "Create Room")</span>`;
            feedbackEl.hidden = false;
          }
          if (codeInput) codeInput.focus();
          return;
        }

        const roomInfo = onlineRoom.info;
        const roomName = roomInfo.name || 'Study Squad';
        const roomGoal = roomInfo.goal || '3 hours';
        const roomTopic = roomInfo.topic || 'General DSA';
        const roomType = roomInfo.type || 'open';
        const creator = roomInfo.creator || 'Host';
        const creatorId = roomInfo.creatorId || '';

        const isHost = Boolean((creatorId && creatorId === state.userId) || creator === nickname);
        const me = {
          id: state.userId,
          nickname: nickname,
          status: 'Active',
          timerFormatted: '25:00',
          isHost: isHost,
          avatar: getInitials(nickname),
          currentProblem: state.currentProblem,
          recentSolve: state.recentSolve,
          joinedAt: Date.now()
        };

        // Extract existing remote members or sample peers
        const remoteMembersObj = onlineRoom.members || {};
        const existingRemoteList = Object.values(remoteMembersObj).filter(m => m && m.id !== state.userId);
        const initialMembers = [me, ...existingRemoteList];

        const room = {
          code: code,
          name: roomName,
          goal: roomGoal,
          topic: roomTopic,
          type: roomType,
          creator: creator,
          creatorId: creatorId,
          joinedAt: Date.now(),
          members: initialMembers
        };

        state.activeRoom = room;
        state.nickname = nickname;
        state.members = initialMembers;

        chrome.storage.local.set({
          [STORAGE_KEYS.ROOM]: room,
          [STORAGE_KEYS.NICKNAME]: nickname
        });

        if (window.MySpaceAPI) {
          window.MySpaceAPI.syncMember(code, me, {
            memberCount: initialMembers.length,
            isPublic: roomType === 'open'
          });
        }

        startMemberPolling();
        render();
      } catch (err) {
        console.error('Failed to join room:', err);
        if (targetBtn) {
          targetBtn.disabled = false;
          targetBtn.textContent = prevText || 'Join Room';
        }
        if (feedbackEl) {
          feedbackEl.textContent = 'Failed to connect. Please check network.';
          feedbackEl.hidden = false;
        }
      }
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const rawVal = (codeInput && codeInput.value.trim().toUpperCase()) || '';
        const fullCode = rawVal.startsWith('GLOW-') ? rawVal : ('GLOW-' + rawVal);
        executeJoin(fullCode, submitBtn, errorEl);
      });
    }

    // Load and render Container 2: Public Available Groups from Server
    async function loadPublicRooms() {
      if (!publicListEl) return;
      publicListEl.innerHTML = `
        <div class="ms-public-loading">
          <span class="ms-spinner"></span>
          <span>Loading public groups...</span>
        </div>
      `;

      try {
        const allRooms = window.MySpaceAPI ? await window.MySpaceAPI.getPublicRooms() : [];
        const rooms = (state.selectedTopic && state.selectedTopic !== 'All')
          ? allRooms.filter(r => (r.topic || '').toLowerCase().includes(state.selectedTopic.toLowerCase()))
          : allRooms;
        if (!rooms || rooms.length === 0) {
          publicListEl.innerHTML = `
            <div class="ms-public-empty">
              <p>No open rooms active right now.</p>
              <button id="msQuickCreateFromJoinBtn" class="ms-link-btn" type="button">+ Create an Open Room</button>
            </div>
          `;
          const quickCreate = publicListEl.querySelector('#msQuickCreateFromJoinBtn');
          if (quickCreate) {
            quickCreate.addEventListener('click', () => {
              state.currentView = 'create';
              render();
            });
          }
          return;
        }

        publicListEl.innerHTML = rooms.map(room => {
          const count = room.memberCount || 1;
          const initials = getInitials(room.name || 'Room');
          return `
            <div class="ms-public-room-item" data-code="${escapeHtml(room.code)}">
              <div class="ms-public-room-left">
                <div class="ms-public-room-badge">
                  <span class="ms-avatar-text">${escapeHtml(initials)}</span>
                </div>
                <div class="ms-public-room-meta">
                  <div class="ms-public-room-name-row">
                    <span class="ms-public-room-name" title="${escapeHtml(room.name)}">${escapeHtml(room.name)}</span>
                    <span class="ms-public-room-code-tag">${escapeHtml(room.code)}</span>
                  </div>
                  <div class="ms-public-room-sub">
                    <span>👥 ${count} online</span>
                    <span class="dot">•</span>
                    <span>🎯 ${escapeHtml(room.goal || '3 hours')}</span>
                    ${room.topic ? `<span class="dot">•</span><span class="ms-topic-badge">${escapeHtml(room.topic)}</span>` : ''}
                  </div>
                </div>
              </div>
              <button class="ms-btn-join-public" data-code="${escapeHtml(room.code)}" type="button">
                <span>Join</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          `;
        }).join('');

        // Attach Join button events for public groups
        publicListEl.querySelectorAll('.ms-btn-join-public').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = btn.dataset.code;
            if (code) {
              executeJoin(code, btn, errorEl);
            }
          });
        });

        // Clicking a room row auto-populates Container 1 input
        publicListEl.querySelectorAll('.ms-public-room-item').forEach(item => {
          item.addEventListener('click', () => {
            const code = item.dataset.code;
            if (codeInput && code) {
              const stripped = code.replace(/^GLOW-?/i, '');
              codeInput.value = stripped;
              codeInput.focus();
            }
          });
        });
      } catch (err) {
        console.error('Error fetching public rooms:', err);
        if (publicListEl) {
          publicListEl.innerHTML = `
            <div class="ms-public-empty">
              <span>Could not load rooms. Click refresh to retry.</span>
            </div>
          `;
        }
      }
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('rotating');
        setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
        loadPublicRooms();
      });
    }

    const pillsBar = container.querySelector('#msTopicPillsBar');
    if (pillsBar) {
      pillsBar.querySelectorAll('.ms-topic-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          pillsBar.querySelectorAll('.ms-topic-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          state.selectedTopic = pill.dataset.topic || 'All';
          loadPublicRooms();
        });
      });
    }

    // Initial load
    loadPublicRooms();
  }

  function bindWorkspaceEvents(container) {
    // 1. Settings button & dropdown menu management
    const settingsBtn = container.querySelector('#msGroupSettingsBtn');
    const settingsMenu = container.querySelector('#msSettingsMenu');

    function closeSettingsMenu() {
      state.settingsMenuOpen = false;
      if (settingsMenu) settingsMenu.style.display = 'none';
      document.removeEventListener('click', onOutsideClick);
    }

    function onOutsideClick(e) {
      if (
        settingsMenu &&
        !settingsMenu.contains(e.target) &&
        settingsBtn &&
        !settingsBtn.contains(e.target)
      ) {
        closeSettingsMenu();
      }
    }

    if (settingsBtn && settingsMenu) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.settingsMenuOpen = !state.settingsMenuOpen;
        settingsMenu.style.display = state.settingsMenuOpen ? 'flex' : 'none';
        if (state.settingsMenuOpen) {
          document.removeEventListener('click', onOutsideClick);
          setTimeout(() => {
            document.addEventListener('click', onOutsideClick);
          }, 0);
        } else {
          document.removeEventListener('click', onOutsideClick);
        }
      });
    }

    // 1b. Share Extension Link button (One-click copy with instant feedback)
    const shareBtn = container.querySelector('#msGroupShareBtn');
    if (shareBtn && state.activeRoom) {
      shareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeSettingsMenu();
        const shareUrl = getShareableRoomUrl(state.activeRoom.code);
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = shareUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }

        const origHtml = shareBtn.innerHTML;
        shareBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        `;
        shareBtn.classList.add('copied');
        showMySpaceToast('Room invite link copied! 🔗');

        setTimeout(() => {
          shareBtn.innerHTML = origHtml;
          shareBtn.classList.remove('copied');
        }, 2000);
      });
    }

    // 1c. Invite Hint Copy Button in members list
    const hintCopyBtn = container.querySelector('#msCopyInviteHintBtn');
    if (hintCopyBtn && state.activeRoom) {
      hintCopyBtn.addEventListener('click', async () => {
        const shareUrl = getShareableRoomUrl(state.activeRoom.code);
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = shareUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const span = hintCopyBtn.querySelector('span');
        if (span) span.textContent = 'Copied Link! ✓';
        showMySpaceToast('Room invite link copied! 🔗');
        setTimeout(() => {
          if (span) span.textContent = 'Copy Room Invite Link';
        }, 2000);
      });
    }

    // Change Nickname
    const changeNickBtn = container.querySelector('#msChangeNicknameBtn');
    if (changeNickBtn) {
      changeNickBtn.addEventListener('click', () => {
        closeSettingsMenu();
        state.nicknameModalOpen = true;
        render();
      });
    }

    // Copy Room Invite Link
    const copyBtn = container.querySelector('#msCopyCodeBtn');
    if (copyBtn && state.activeRoom) {
      copyBtn.addEventListener('click', async () => {
        const shareUrl = getShareableRoomUrl(state.activeRoom.code);
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = shareUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const span = copyBtn.querySelector('span');
        if (span) span.textContent = 'Copied Link! ✓';
        showMySpaceToast('Room invite link copied! 🔗');
        setTimeout(() => {
          if (span) span.textContent = 'Copy Invite Link';
          closeSettingsMenu();
        }, 1200);
      });
    }

    // Leave Group Safety & Inline Confirmation
    const leaveBtn = container.querySelector('#msLeaveGroupBtn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        closeSettingsMenu();
        state.leaveConfirmOpen = true;
        render();
      });
    }

    const cancelLeaveBtn = container.querySelector('#msCancelLeaveBtn');
    if (cancelLeaveBtn) {
      cancelLeaveBtn.addEventListener('click', () => {
        state.leaveConfirmOpen = false;
        render();
      });
    }

    const confirmLeaveBtn = container.querySelector('#msConfirmLeaveBtn');
    if (confirmLeaveBtn) {
      confirmLeaveBtn.addEventListener('click', () => {
        state.leaveConfirmOpen = false;
        if (state.activeRoom && window.MySpaceAPI) {
          window.MySpaceAPI.removeMember(state.activeRoom.code, state.userId);
          if (state.activeRoom.type === 'open' && window.MySpaceAPI.updatePublicRoomMemberCount) {
            const remainingCount = Math.max(0, (state.members ? state.members.length : 1) - 1);
            window.MySpaceAPI.updatePublicRoomMemberCount(state.activeRoom.code, remainingCount);
          }
        }
        stopMemberPolling();
        stopTimer();
        state.activeRoom = null;
        state.currentView = 'lobby';
        chrome.storage.local.remove([STORAGE_KEYS.ROOM], () => {
          render();
        });
      });
    }

    // 2. Timer Controls
    const playBtn = container.querySelector('#msTimerPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (state.timer.isRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
      });
    }

    const stopBtn = container.querySelector('#msTimerStopBtn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        resetTimer();
      });
    }

    // 3. Sticky Bottom Navigation
    const navGroupBtn = container.querySelector('#msNavGroupBtn');
    const navLbBtn = container.querySelector('#msNavLeaderboardBtn');

    if (navGroupBtn) {
      navGroupBtn.addEventListener('click', () => {
        closeSettingsMenu();
        if (state.activeWorkspaceTab !== 'group') {
          state.activeWorkspaceTab = 'group';
          render();
        }
      });
    }

    if (navLbBtn) {
      navLbBtn.addEventListener('click', () => {
        closeSettingsMenu();
        if (state.activeWorkspaceTab !== 'leaderboard') {
          state.activeWorkspaceTab = 'leaderboard';
          render();
          fetchAndRenderLeaderboard(container);
        }
      });
    }

    // 4. Attach Leaderboard Refresh Button Listener
    attachLeaderboardRefresh(container);
  }

  // Fetch and smoothly render Global Leaderboard
  async function fetchAndRenderLeaderboard(container) {
    if (!window.MySpaceAPI || !window.MySpaceAPI.getGlobalLeaderboard) return;

    if (!state.globalLeaders || state.globalLeaders.length === 0) {
      state.leaderboardLoading = true;
      const bodyEl = (container && container.querySelector('.ms-workspace-body')) || document.querySelector('.ms-workspace-body');
      if (bodyEl && state.activeWorkspaceTab === 'leaderboard') {
        bodyEl.innerHTML = renderLeaderboardContent();
        attachLeaderboardRefresh(bodyEl);
      }
    }

    try {
      const freshLeaders = await window.MySpaceAPI.getGlobalLeaderboard();
      if (Array.isArray(freshLeaders) && freshLeaders.length > 0) {
        state.globalLeaders = freshLeaders;
        try {
          chrome.storage.local.set({
            ms_leaderboard_cache: { leaders: freshLeaders, updatedAt: Date.now() }
          });
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[MySpace] Failed to fetch leaderboard:', err);
    } finally {
      state.leaderboardLoading = false;
      if (state.activeWorkspaceTab === 'leaderboard') {
        const bodyEl = (container && container.querySelector('.ms-workspace-body')) || document.querySelector('.ms-workspace-body');
        if (bodyEl) {
          bodyEl.innerHTML = renderLeaderboardContent();
          attachLeaderboardRefresh(bodyEl);
        }
      }
    }
  }

  // Attach on-demand refresh for Global Leaderboard
  function attachLeaderboardRefresh(container) {
    const refreshLbBtn = container.querySelector('#msRefreshLeaderboardBtn');
    if (!refreshLbBtn) return;

    refreshLbBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (refreshLbBtn.classList.contains('rotating')) return;
      refreshLbBtn.classList.add('rotating');

      try {
        if (window.MySpaceAPI) {
          const freshLeaders = await window.MySpaceAPI.getGlobalLeaderboard();
          if (Array.isArray(freshLeaders) && freshLeaders.length > 0) {
            state.globalLeaders = freshLeaders;
            try {
              chrome.storage.local.set({
                ms_leaderboard_cache: { leaders: freshLeaders, updatedAt: Date.now() }
              });
            } catch (e) {}
          }
        }
      } catch (err) {
        console.error('Failed to refresh leaderboard:', err);
      } finally {
        setTimeout(() => {
          refreshLbBtn.classList.remove('rotating');
          if (state.activeWorkspaceTab === 'leaderboard') {
            const bodyEl = container.querySelector('.ms-workspace-body') || (container.classList && container.classList.contains('ms-workspace-body') ? container : document.querySelector('.ms-workspace-body'));
            if (bodyEl) {
              bodyEl.innerHTML = renderLeaderboardContent();
              attachLeaderboardRefresh(bodyEl);
            }
          }
        }, 500);
      }
    });
  }

  // ===========================================================================
  // 7. TIMER ENGINE, SYNC & HEARTBEAT
  // ===========================================================================
  function startTimer() {
    if (state.timer.isRunning) return;
    state.timer.isRunning = true;
    state.timer.status = 'Focusing';

    if (state.timer.interval) clearInterval(state.timer.interval);
    state.timer.interval = setInterval(() => {
      if (state.timer.secondsLeft > 0) {
        state.timer.secondsLeft -= 1;
        if (state.timer.status === 'Focusing') {
          checkDailyReset();
          checkWeeklyReset();
          state.todayFocusSeconds += 1;
          state.weeklyFocusSeconds += 1;
        }

        // Sync every 30 seconds
        if (state.timer.secondsLeft % 30 === 0) {
          syncHeartbeat();
          persistTodayFocus();
        }

        updateTimerUI();
      } else {
        // Session complete -> Switch to Break
        state.timer.status = 'Break';
        state.timer.secondsLeft = 5 * 60; // 5 min break
        state.timer.totalSeconds = 5 * 60;
        syncHeartbeat(true);
        syncToPomodoroWidget();
        persistTodayFocus();
        updateTimerUI();
      }
    }, 1000);

    syncHeartbeat(false);
    syncToPomodoroWidget();
    persistTodayFocus();
    updateTimerUI();
  }

  function pauseTimer() {
    state.timer.isRunning = false;
    state.timer.status = 'Paused';
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
    syncHeartbeat(true);
    syncToPomodoroWidget();
    persistTodayFocus();
    updateTimerUI();
  }

  function resetTimer() {
    state.timer.isRunning = false;
    state.timer.status = 'Idle';
    state.timer.secondsLeft = DEFAULT_TIMER_SECONDS;
    state.timer.totalSeconds = DEFAULT_TIMER_SECONDS;
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
    syncHeartbeat(true);
    syncToPomodoroWidget();
    persistTodayFocus();
    updateTimerUI();
  }

  function stopTimer() {
    state.timer.isRunning = false;
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
    syncToPomodoroWidget();
  }

  // Bi-directional sync with LeetCode page's on-page Pomodoro dock pill
  function syncToPomodoroWidget() {
    try {
      const isBreak = state.timer.status === 'Break';
      const endAt = state.timer.isRunning ? Date.now() + (state.timer.secondsLeft * 1000) : 0;

      chrome.storage.local.set({
        [STORAGE_KEYS.POMODORO]: {
          mode: isBreak ? 'break' : 'work',
          cycles: 0,
          remaining: state.timer.secondsLeft * 1000,
          running: state.timer.isRunning,
          endAt: endAt,
          updatedAt: Date.now(),
          source: 'myspace'
        }
      });

      // Ensure Pomodoro widget is enabled in settings so the dock pill is visible
      if (state.timer.isRunning) {
        chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (res) => {
          const cfg = res[STORAGE_KEYS.SETTINGS] || {};
          if (!cfg.pomodoro || !cfg.pomodoro.enabled) {
            cfg.pomodoro = cfg.pomodoro || {};
            cfg.pomodoro.enabled = true;
            chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: cfg });
          }
        });
      }
    } catch (err) {
      // Extension context invalidated
    }
  }

  // Adopt Pomodoro state updates triggered by the on-page widget
  function adoptPomodoroState(saved) {
    if (!saved) return;
    const mode = saved.mode || 'work';
    const running = Boolean(saved.running && saved.endAt);
    const endAt = running ? Number(saved.endAt) : 0;
    const remainingMs = running ? Math.max(0, endAt - Date.now()) : (Number(saved.remaining) || DEFAULT_TIMER_SECONDS * 1000);
    const remainingSec = Math.max(0, Math.round(remainingMs / 1000));

    state.timer.isRunning = running;
    state.timer.status = mode === 'work' ? (running ? 'Focusing' : 'Paused') : 'Break';
    state.timer.secondsLeft = remainingSec;
    state.timer.totalSeconds = (mode === 'break' ? 5 : 25) * 60;

    if (running) {
      if (!state.timer.interval) {
        state.timer.interval = setInterval(() => {
          if (state.timer.secondsLeft > 0) {
            state.timer.secondsLeft -= 1;
            if (state.timer.status === 'Focusing') {
              checkDailyReset();
              checkWeeklyReset();
              state.todayFocusSeconds += 1;
              state.weeklyFocusSeconds += 1;
            }
            if (state.timer.secondsLeft % 30 === 0) {
              syncHeartbeat();
              persistTodayFocus();
            }
            updateTimerUI();
          } else {
            state.timer.status = 'Break';
            state.timer.secondsLeft = 5 * 60;
            state.timer.totalSeconds = 5 * 60;
            syncHeartbeat();
            updateTimerUI();
          }
        }, 1000);
      }
    } else {
      if (state.timer.interval) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
      }
    }
    updateTimerUI();
  }

  function watchPomodoroStorage() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEYS.POMODORO]) {
          const saved = changes[STORAGE_KEYS.POMODORO].newValue;
          if (!saved || saved.source === 'myspace') return;
          adoptPomodoroState(saved);
        }
        if (changes[STORAGE_KEYS.STATS]) {
          const { streak, clears } = computeStreakAndClears(changes[STORAGE_KEYS.STATS].newValue);
          state.streak = streak;
          state.solvedCount = clears;
          if (state.activeWorkspaceTab === 'leaderboard') {
            const container = document.getElementById('view-myspace');
            const bodyEl = container && container.querySelector('.ms-workspace-body');
            if (bodyEl) bodyEl.innerHTML = renderLeaderboardContent();
          }
        }
        if (changes[STORAGE_KEYS.CURRENT_PROBLEM]) {
          state.currentProblem = changes[STORAGE_KEYS.CURRENT_PROBLEM].newValue || null;
          updateMembersListUI();
          syncHeartbeat();
        }
        if (changes[STORAGE_KEYS.RECENT_SOLVE]) {
          state.recentSolve = changes[STORAGE_KEYS.RECENT_SOLVE].newValue || null;
          if (state.recentSolve && state.recentSolve.title) {
            showMySpaceToast(`🎉 Cleared ${state.recentSolve.title}!`);
          }
          updateMembersListUI();
          syncHeartbeat();
        }
      });
    } catch (err) {
      // Extension context invalidated
    }
  }

  let saveFocusDebounce = null;
  function persistTodayFocus() {
    clearTimeout(saveFocusDebounce);
    saveFocusDebounce = setTimeout(() => {
      chrome.storage.local.set({
        [STORAGE_KEYS.FOCUS_TIME]: state.todayFocusSeconds,
        [STORAGE_KEYS.FOCUS_CYCLE]: state.lastFocusCycle || (window.MySpaceAPI ? window.MySpaceAPI.getDailyCycleId() : ''),
        [STORAGE_KEYS.WEEKLY_FOCUS_TIME]: state.weeklyFocusSeconds,
        [STORAGE_KEYS.WEEKLY_FOCUS_CYCLE]: state.lastWeeklyCycle || (window.MySpaceAPI ? window.MySpaceAPI.getWeeklyCycleId() : '')
      });
    }, 400);
  }

  function updateTimerUI() {
    const container = document.getElementById('view-myspace');
    if (!container || state.activeWorkspaceTab !== 'group') return;

    // 1. Digits
    const digitsEl = container.querySelector('.ms-timer-digits');
    if (digitsEl) digitsEl.textContent = formatTime(state.timer.secondsLeft);

    // 2. Arc Gauge
    const arcEl = container.querySelector('.ms-timer-progress-arc');
    if (arcEl) {
      const pct = Math.max(0, Math.min(1, state.timer.secondsLeft / state.timer.totalSeconds));
      arcEl.style.strokeDashoffset = (CIRCLE_CIRCUMFERENCE * (1 - pct)).toFixed(2);
    }

    // 3. Status Pill
    const pillEl = container.querySelector('.ms-timer-status-pill');
    if (pillEl) {
      const isBreak = state.timer.status === 'Break';
      const isFocusing = state.timer.status === 'Focusing';
      pillEl.className = `ms-timer-status-pill ${isBreak ? 'status-break' : isFocusing ? 'status-focus' : 'status-idle'}`;
      pillEl.textContent = isBreak ? '☕ Break' : isFocusing ? '🍃 Focusing' : '⏸ Paused';
    }

    // 4. Update your row in members list
    const yourRow = container.querySelector('.ms-member-row.is-you .ms-member-status-text');
    const yourDot = container.querySelector('.ms-member-row.is-you .ms-member-dot');
    if (yourRow) {
      const isBreak = state.timer.status === 'Break';
      yourRow.className = `ms-member-status-text ${isBreak ? 'status-break' : 'status-active'}`;
      yourRow.textContent = isBreak ? `Break • ${formatTime(state.timer.secondsLeft)}` : `Active • ${formatTime(state.timer.secondsLeft)}`;
      if (yourDot) {
        yourDot.className = `ms-member-dot ${isBreak ? 'dot-break' : 'dot-active'}`;
      }
    }

    // 5. Update play button icon
    const playBtn = container.querySelector('#msTimerPlayBtn');
    if (playBtn) {
      playBtn.innerHTML = state.timer.isRunning ? `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1.5" />
          <rect x="14" y="4" width="4" height="16" rx="1.5" />
        </svg>
      ` : `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      `;
    }

    // 6. Update bottom progress card
    const todayValEl = container.querySelector('.ms-stat-box:first-child .ms-stat-val');
    if (todayValEl) {
      todayValEl.textContent = formatHoursMinutes(state.todayFocusSeconds);
    }

    const room = state.activeRoom || {};
    const goalHours = parseInt(room.goal || '3h', 10) || 3;
    const todayGoalSec = goalHours * 3600;
    const progressPct = Math.min(100, Math.round((state.todayFocusSeconds / todayGoalSec) * 100));

    const donutCirc = 2 * Math.PI * 13;
    const donutOffset = donutCirc * (1 - (progressPct / 100));
    const donutCircle = container.querySelector('.ms-stat-donut circle:nth-child(2)');
    if (donutCircle) {
      donutCircle.style.strokeDashoffset = donutOffset.toFixed(2);
    }

    const pctEl = container.querySelector('.ms-stat-progress-pct');
    if (pctEl) {
      pctEl.textContent = `${progressPct}%`;
    }

    // 7. Update cumulative 24h practice time row for current user
    const youCumulativeTimeEl = container.querySelector('.ms-cumulative-item.is-you .ms-cumulative-time');
    if (youCumulativeTimeEl) {
      youCumulativeTimeEl.textContent = formatHoursMinutes(state.todayFocusSeconds);
    }
  }

  function updateMembersListUI() {
    const container = document.getElementById('view-myspace');
    if (!container || state.activeWorkspaceTab !== 'group') return;

    // 1. Header Count
    const headerCount = container.querySelector('.ms-members-header span');
    if (headerCount) {
      headerCount.textContent = `Members (${state.members.length})`;
    }

    // 2. Group Subtitle
    const groupSub = container.querySelector('.ms-group-sub');
    if (groupSub && state.activeRoom) {
      const memberCount = (state.members && state.members.length) || 1;
      const rawGoal = state.activeRoom.goal || '3h';
      const shortGoal = rawGoal.replace(/\s*hours?/, 'h');
      groupSub.innerHTML = `
        <span class="ms-meta-item">${memberCount} member${memberCount === 1 ? '' : 's'}</span>
        <span class="dot">•</span>
        <span class="ms-meta-item">Goal: ${escapeHtml(shortGoal)}</span>
        ${state.activeRoom.topic ? `<span class="dot">•</span><span class="ms-topic-tag" title="${escapeHtml(state.activeRoom.topic)}">${escapeHtml(state.activeRoom.topic)}</span>` : ''}
      `;
    }

    // 3. Members Scroll Container
    const scrollEl = container.querySelector('.ms-members-scroll');
    if (scrollEl) {
      const roomCode = (state.activeRoom && state.activeRoom.code) || '';
      const rowsHtml = state.members.map((m) => {
        const isYou = m.id === state.userId;
        const { text, dotClass, textClass } = formatMemberStatus(m, isYou);

        return `
          <div class="ms-member-row ${isYou ? 'is-you' : ''}">
            <div class="ms-member-avatar-wrap ${isYou ? 'is-you' : ''}">
              <span class="ms-avatar-text">${escapeHtml(getInitials(m.nickname || 'Coder'))}</span>
              <span class="ms-member-dot ${dotClass}"></span>
            </div>
            <div class="ms-member-info">
              <span class="ms-member-name-line">
                <span>${escapeHtml(m.nickname || 'Coder')}${isYou ? ' (You)' : ''}</span>
                ${m.isHost ? '<span class="ms-member-crown">👑</span>' : ''}
              </span>
              <span class="ms-member-status-text ${textClass}">
                ${escapeHtml(text)}
              </span>
              ${renderMemberBadges(m, isYou)}
            </div>
          </div>
        `;
      }).join('');

      const inviteHintHtml = state.members.length === 1 ? `
        <div class="ms-member-invite-hint">
          <span>Study squad active! Invite friends to code together live:</span>
          <button id="msCopyInviteHintBtn" class="ms-btn-hint-share" type="button">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Copy Room Invite Link</span>
          </button>
        </div>
      ` : '';

      scrollEl.innerHTML = rowsHtml + inviteHintHtml;

      const hintCopyBtn = scrollEl.querySelector('#msCopyInviteHintBtn');
      if (hintCopyBtn && state.activeRoom) {
        hintCopyBtn.addEventListener('click', async () => {
          const shareUrl = getShareableRoomUrl(state.activeRoom.code);
          try {
            await navigator.clipboard.writeText(shareUrl);
          } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = shareUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          const span = hintCopyBtn.querySelector('span');
          if (span) span.textContent = 'Copied Link! ✓';
          showMySpaceToast('Room invite link copied! 🔗');
          setTimeout(() => {
            if (span) span.textContent = 'Copy Room Invite Link';
          }, 1500);
        });
      }
    }

    // 4. Update Cumulative 24h Practice List
    const cumulativeListEl = container.querySelector('#msCumulativeList');
    if (cumulativeListEl) {
      cumulativeListEl.innerHTML = renderCumulativeMembersHtml();
    }
  }

  // Real-time polling for room member presence
  function startMemberPolling() {
    stopMemberPolling();
    if (!state.activeRoom) return;

    // Poll immediately, then every 5 seconds
    pollRoomMembers();
    state.memberPollInterval = setInterval(pollRoomMembers, 5000);
  }

  function stopMemberPolling() {
    if (state.memberPollInterval) {
      clearInterval(state.memberPollInterval);
      state.memberPollInterval = null;
    }
  }

  async function pollRoomMembers() {
    if (!state.activeRoom || !window.MySpaceAPI) return;

    try {
      const remoteMembers = await window.MySpaceAPI.getRoomMembers(state.activeRoom.code);
      const isHost = checkIsHost(state.activeRoom);
      const isBreak = state.timer.status === 'Break';
      const curCycle = window.MySpaceAPI ? window.MySpaceAPI.getDailyCycleId() : '';
      const you = {
        id: state.userId,
        nickname: state.nickname || 'You',
        status: isBreak ? 'Break' : 'Active',
        timerFormatted: formatTime(state.timer.secondsLeft),
        isHost: isHost,
        avatar: getInitials(state.nickname || 'You'),
        todayFocusSeconds: state.todayFocusSeconds,
        cycleDate: curCycle,
        currentProblem: state.currentProblem || null,
        recentSolve: state.recentSolve || null,
        lastActive: Date.now()
      };

      // Filter out stale peers (no activity in 3+ minutes) to prevent ghost members
      const STALE_THRESHOLD_MS = 3 * 60 * 1000;
      const now = Date.now();
      const peers = (remoteMembers || []).filter(m => {
        if (!m || !m.id || m.id === state.userId) return false;
        if (m.lastActive && (now - Number(m.lastActive)) > STALE_THRESHOLD_MS) return false;
        return true;
      });

      // Real users only (no mock peers)
      state.members = [you, ...peers];
      updateMembersListUI();

      // If room is public, dynamically update active online member count
      if (state.activeRoom.type === 'open' && window.MySpaceAPI.updatePublicRoomMemberCount) {
        window.MySpaceAPI.updatePublicRoomMemberCount(state.activeRoom.code, state.members.length);
      }
    } catch (err) {
      // Keep existing members if network fetch fails
    }
  }

  let lastLeaderboardSync = 0;
  function syncHeartbeat(forceLeaderboard = false) {
    if (!window.MySpaceAPI) return;

    const isPrivate = Boolean(state.activeRoom && state.activeRoom.type === 'private');
    const roomName = state.activeRoom
      ? (isPrivate ? 'Private Squad 🔒' : (state.activeRoom.name || 'Study Squad'))
      : 'Solo Focus';

    // 1. If in active room, sync presence
    if (state.activeRoom) {
      const isHost = checkIsHost(state.activeRoom);
      const isBreak = state.timer.status === 'Break';
      const curCycle = window.MySpaceAPI ? window.MySpaceAPI.getDailyCycleId() : '';
      const me = {
        id: state.userId,
        nickname: state.nickname || 'You',
        status: isBreak ? 'Break' : 'Active',
        timerFormatted: formatTime(state.timer.secondsLeft),
        isHost: isHost,
        avatar: getInitials(state.nickname || 'You'),
        todayFocusSeconds: state.todayFocusSeconds,
        cycleDate: curCycle,
        currentProblem: state.currentProblem || null,
        recentSolve: state.recentSolve || null,
        lastActive: Date.now()
      };
      const isOpen = state.activeRoom && state.activeRoom.type === 'open';
      const currentMemberCount = (state.members && state.members.length) || 1;
      window.MySpaceAPI.syncMember(state.activeRoom.code, me, {
        memberCount: currentMemberCount,
        isPublic: isOpen
      });
    }

    // 2. Sync to weekly global leaderboard (throttled to every 5 minutes or on milestones to avoid DB load)
    const now = Date.now();
    const shouldSyncLeaderboard = forceLeaderboard || (now - lastLeaderboardSync >= 5 * 60 * 1000);
    const weeklySec = Math.max(state.weeklyFocusSeconds || 0, state.todayFocusSeconds || 0);
    if (weeklySec > 0 && shouldSyncLeaderboard) {
      lastLeaderboardSync = now;
      window.MySpaceAPI.syncToGlobalLeaderboard({
        id: state.userId,
        nickname: state.nickname || 'You',
        focusSeconds: weeklySec,
        weeklyDisplay: formatHoursMinutes(weeklySec),
        todayDisplay: formatHoursMinutes(weeklySec),
        streak: state.streak,
        solvedCount: state.solvedCount,
        roomName: roomName,
        isPrivateRoom: isPrivate,
        avatar: getInitials(state.nickname || 'You')
      });
    }
  }

  // ===========================================================================
  // 8. INITIALIZATION
  // ===========================================================================
  function init() {
    chrome.storage.local.get([
      STORAGE_KEYS.ROOM,
      STORAGE_KEYS.NICKNAME,
      STORAGE_KEYS.USER_ID,
      STORAGE_KEYS.FOCUS_TIME,
      STORAGE_KEYS.FOCUS_CYCLE,
      STORAGE_KEYS.WEEKLY_FOCUS_TIME,
      STORAGE_KEYS.WEEKLY_FOCUS_CYCLE,
      STORAGE_KEYS.POMODORO,
      STORAGE_KEYS.STATS,
      STORAGE_KEYS.CURRENT_PROBLEM,
      STORAGE_KEYS.RECENT_SOLVE,
      STORAGE_KEYS.PENDING_JOIN_CODE
    ], async (res) => {
      const curCycle = window.MySpaceAPI ? window.MySpaceAPI.getDailyCycleId() : '';
      state.lastFocusCycle = (res && res[STORAGE_KEYS.FOCUS_CYCLE]) ? res[STORAGE_KEYS.FOCUS_CYCLE] : curCycle;

      const curWeekCycle = window.MySpaceAPI ? window.MySpaceAPI.getWeeklyCycleId() : '';
      state.lastWeeklyCycle = (res && res[STORAGE_KEYS.WEEKLY_FOCUS_CYCLE]) ? res[STORAGE_KEYS.WEEKLY_FOCUS_CYCLE] : curWeekCycle;

      // Check for incoming room invite link (?glowroom=GLOW-XXXX)
      if (res && res[STORAGE_KEYS.PENDING_JOIN_CODE]) {
        state.pendingJoinCode = String(res[STORAGE_KEYS.PENDING_JOIN_CODE]).trim().toUpperCase();
        chrome.storage.local.remove([STORAGE_KEYS.PENDING_JOIN_CODE]);
        state.currentView = 'join';
      }

      // Link userId with Firebase persistent anonymous UID (data.localId)
      if (res && res[STORAGE_KEYS.USER_ID]) {
        state.userId = res[STORAGE_KEYS.USER_ID];
      }
      if (window.MySpaceAPI && window.MySpaceAPI.getAuthUserId) {
        try {
          const uid = await window.MySpaceAPI.getAuthUserId();
          if (uid) {
            state.userId = uid;
            chrome.storage.local.set({ [STORAGE_KEYS.USER_ID]: uid });
          }
        } catch (e) {}
      }
      if (!state.userId) {
        state.userId = 'usr_' + Math.random().toString(36).substring(2, 9);
        chrome.storage.local.set({ [STORAGE_KEYS.USER_ID]: state.userId });
      }

      if (res && res[STORAGE_KEYS.NICKNAME]) {
        const savedNick = String(res[STORAGE_KEYS.NICKNAME]).trim();
        if (savedNick && savedNick !== String.fromCharCode(86, 105, 110, 97, 121)) {
          state.nickname = savedNick;
        } else {
          state.nickname = '';
        }
      } else {
        state.nickname = '';
      }

      if (!state.nickname) {
        state.nicknameModalOpen = true;
      }

      // Load active DSA problem if opened on LeetCode
      if (res && res[STORAGE_KEYS.CURRENT_PROBLEM]) {
        state.currentProblem = res[STORAGE_KEYS.CURRENT_PROBLEM];
      }
      if (res && res[STORAGE_KEYS.RECENT_SOLVE]) {
        state.recentSolve = res[STORAGE_KEYS.RECENT_SOLVE];
      }

      // Load real streak and problem clear stats from LeetCode solver data
      if (res && res[STORAGE_KEYS.STATS]) {
        const { streak, clears } = computeStreakAndClears(res[STORAGE_KEYS.STATS]);
        state.streak = streak;
        state.solvedCount = clears;
      }

      // Check if 24-hour cycle has reset (resets at 5:30 AM IST / 00:00:00 UTC worldwide)
      if (res && res[STORAGE_KEYS.FOCUS_CYCLE] && res[STORAGE_KEYS.FOCUS_CYCLE] !== curCycle) {
        state.todayFocusSeconds = 0;
        state.lastFocusCycle = curCycle;
        persistTodayFocus();
      } else if (res && res[STORAGE_KEYS.FOCUS_TIME]) {
        state.todayFocusSeconds = Number(res[STORAGE_KEYS.FOCUS_TIME]) || state.todayFocusSeconds;
      }

      // Check if weekly cycle has reset (resets Monday 5:30 AM IST / 00:00:00 UTC worldwide)
      if (res && res[STORAGE_KEYS.WEEKLY_FOCUS_CYCLE] && res[STORAGE_KEYS.WEEKLY_FOCUS_CYCLE] !== curWeekCycle) {
        state.weeklyFocusSeconds = 0;
        state.lastWeeklyCycle = curWeekCycle;
        persistTodayFocus();
      } else if (res && res[STORAGE_KEYS.WEEKLY_FOCUS_TIME]) {
        state.weeklyFocusSeconds = Number(res[STORAGE_KEYS.WEEKLY_FOCUS_TIME]) || 0;
      } else {
        // Fallback: seed weekly with current today's focus seconds
        state.weeklyFocusSeconds = state.todayFocusSeconds || 0;
      }

      if (res && res[STORAGE_KEYS.ROOM]) {
        state.activeRoom = res[STORAGE_KEYS.ROOM];
        const isHost = checkIsHost(state.activeRoom);
        state.members = [
          {
            id: state.userId,
            nickname: state.nickname || 'You',
            status: 'Active',
            timerFormatted: '25:00',
            isHost: isHost,
            avatar: getInitials(state.nickname || 'You'),
            currentProblem: state.currentProblem,
            recentSolve: state.recentSolve,
            lastActive: Date.now()
          }
        ];
        startMemberPolling();
      }

      // Check for active Pomodoro runtime state
      if (res && res[STORAGE_KEYS.POMODORO]) {
        adoptPomodoroState(res[STORAGE_KEYS.POMODORO]);
      }

      // Load cached global leaderboard immediately, then prefetch fresh in background
      chrome.storage.local.get(['ms_leaderboard_cache'], (cacheRes) => {
        if (cacheRes && cacheRes.ms_leaderboard_cache && Array.isArray(cacheRes.ms_leaderboard_cache.leaders)) {
          state.globalLeaders = cacheRes.ms_leaderboard_cache.leaders;
        }
        if (window.MySpaceAPI && window.MySpaceAPI.getGlobalLeaderboard) {
          window.MySpaceAPI.getGlobalLeaderboard().then((leaders) => {
            if (Array.isArray(leaders) && leaders.length > 0) {
              state.globalLeaders = leaders;
              chrome.storage.local.set({
                ms_leaderboard_cache: { leaders, updatedAt: Date.now() }
              });
              if (state.activeWorkspaceTab === 'leaderboard') {
                const bodyEl = document.querySelector('.ms-workspace-body');
                if (bodyEl) {
                  bodyEl.innerHTML = renderLeaderboardContent();
                  attachLeaderboardRefresh(bodyEl);
                }
              }
            }
          }).catch(() => {});
        }
      });

      watchPomodoroStorage();

      // Listen for runtime room invite links while extension is already open
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEYS.PENDING_JOIN_CODE] && changes[STORAGE_KEYS.PENDING_JOIN_CODE].newValue) {
          state.pendingJoinCode = String(changes[STORAGE_KEYS.PENDING_JOIN_CODE].newValue).trim().toUpperCase();
          chrome.storage.local.remove([STORAGE_KEYS.PENDING_JOIN_CODE]);
          state.currentView = 'join';
          render();
          showMySpaceToast(`Found room invite: ${state.pendingJoinCode} 🔗`);
        }
      });

      render();
    });
  }

  window.LeetGlowMySpace = {
    init,
    render,
    getState: () => ({ ...state })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
