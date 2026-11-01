/* =============================================================================
   My Space — Collaborative Focus & Competitive Arena
   Handles view routing, focus room lobby, two-column group dashboard,
   global leaderboard, and Firebase Realtime Database sync.
============================================================================= */

(() => {
  'use strict';

  const STORAGE_KEYS = {
    ROOM: 'msActiveRoom',
    NICKNAME: 'msUserNickname',
    USER_ID: 'msUserId',
    FOCUS_TIME: 'msTodayFocusSeconds'
  };

  const DEFAULT_TIMER_SECONDS = 25 * 60; // 25 minutes default Pomodoro
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in SVG -> ~326.72

  const state = {
    currentView: 'lobby', // 'lobby' | 'create' | 'join' | 'workspace'
    activeWorkspaceTab: 'group', // 'group' | 'leaderboard'
    activeRoom: null,
    nickname: '',
    userId: '',
    selectedRoomType: 'private', // 'private' | 'open'
    
    // Focus Timer State
    timer: {
      secondsLeft: DEFAULT_TIMER_SECONDS,
      totalSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false,
      status: 'Focusing', // 'Focusing' | 'Break' | 'Paused'
      interval: null
    },

    todayFocusSeconds: 135 * 60, // 2h 15m default progress
    members: [],
    globalLeaders: [],
    settingsMenuOpen: false
  };

  // Sample peer members for immediate vibrant atmosphere when entering room
  const SAMPLE_PEERS = [
    { id: 'usr_aryan', nickname: 'Aryan', status: 'Focusing', timerFormatted: '18:12', isHost: false, avatar: '🧑‍💻', lastActive: Date.now() },
    { id: 'usr_riya', nickname: 'Riya', status: 'Break', timerFormatted: '04:32', isHost: false, avatar: '👩‍💻', lastActive: Date.now() },
    { id: 'usr_neha', nickname: 'Neha', status: 'Focusing', timerFormatted: '20:10', isHost: false, avatar: '🌸', lastActive: Date.now() }
  ];

  function formatTime(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatHoursMinutes(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
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

  // ===========================================================================
  // 1. LOBBY VIEW
  // ===========================================================================
  function renderLobbyView() {
    return `
      <div id="msViewLobby" class="ms-view ms-view-lobby">
        <!-- Study Banner -->
        <div class="ms-banner">
          <div class="ms-banner-content">
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
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
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
        <div class="ms-actions">
          <button id="msOpenCreateBtn" class="ms-btn-primary" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create a Room</span>
          </button>

          <button id="msOpenJoinBtn" class="ms-btn-secondary" type="button">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
  // 2. CREATE VIEW
  // ===========================================================================
  function renderCreateView() {
    return `
      <div id="msViewCreate" class="ms-view ms-view-create">
        <!-- Header -->
        <div class="ms-view-header">
          <button class="ms-back-btn ms-btn-back-lobby" type="button" title="Back to Lobby" aria-label="Back">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h3 class="ms-view-title">Create a Focus Room</h3>
        </div>

        <!-- Form Card -->
        <div class="ms-form-card">
          <div class="ms-form-group">
            <label class="ms-form-label" for="msRoomNameInput">
              <span>Room Name</span>
            </label>
            <input
              id="msRoomNameInput"
              class="ms-form-input"
              type="text"
              maxlength="32"
              placeholder="e.g. Study Squad"
              value="Study Squad"
            />
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msRoomGoalSelect">
              <span>Goal (Daily)</span>
            </label>
            <div class="ms-select-container">
              <span class="ms-select-lead-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </span>
              <select id="msRoomGoalSelect">
                <option value="1 hour">1 hour</option>
                <option value="2 hours">2 hours</option>
                <option value="3 hours" selected>3 hours</option>
                <option value="4 hours">4 hours</option>
                <option value="5+ hours">5+ hours</option>
              </select>
              <span class="ms-select-arrow-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label">
              <span>Room Type</span>
            </label>
            <div class="ms-room-types" role="radiogroup">
              <button
                type="button"
                class="ms-room-type-btn ${state.selectedRoomType === 'private' ? 'active' : ''}"
                data-type="private"
                role="radio"
                aria-checked="${state.selectedRoomType === 'private'}"
              >
                <span class="type-icon">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <div class="ms-room-type-info">
                  <span class="ms-room-type-title">Private</span>
                  <span class="ms-room-type-desc">Invite only</span>
                </div>
              </button>

              <button
                type="button"
                class="ms-room-type-btn ${state.selectedRoomType === 'open' ? 'active' : ''}"
                data-type="open"
                role="radio"
                aria-checked="${state.selectedRoomType === 'open'}"
              >
                <span class="type-icon">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </span>
                <div class="ms-room-type-info">
                  <span class="ms-room-type-title">Open</span>
                  <span class="ms-room-type-desc">Anyone with code</span>
                </div>
              </button>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msCreatorNicknameInput">
              <span>Your Nickname</span>
              <span class="ms-hint">(optional)</span>
            </label>
            <input
              id="msCreatorNicknameInput"
              class="ms-form-input"
              type="text"
              maxlength="20"
              placeholder="e.g. Alex"
              value="${escapeHtml(state.nickname || '')}"
            />
          </div>

          <span id="msCreateError" class="ms-error-text" hidden></span>

          <button id="msSubmitCreateBtn" class="ms-btn-primary" type="button" style="margin-top: 4px;">
            <span>Create Room</span>
          </button>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // 3. JOIN VIEW
  // ===========================================================================
  function renderJoinView() {
    return `
      <div id="msViewJoin" class="ms-view ms-view-join">
        <!-- Header -->
        <div class="ms-view-header">
          <button class="ms-back-btn ms-btn-back-lobby" type="button" title="Back to Lobby" aria-label="Back">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h3 class="ms-view-title">Join a Focus Room</h3>
        </div>

        <!-- Form Card -->
        <div class="ms-form-card">
          <div class="ms-form-group">
            <label class="ms-form-label" for="msJoinCodeInput">
              <span>Room Code</span>
            </label>
            <input
              id="msJoinCodeInput"
              class="ms-form-input ms-code-input"
              type="text"
              maxlength="10"
              placeholder="GLOW-..."
              spellcheck="false"
              autocomplete="off"
            />
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msJoinNicknameInput">
              <span>Your Nickname</span>
            </label>
            <input
              id="msJoinNicknameInput"
              class="ms-form-input"
              type="text"
              maxlength="20"
              placeholder="e.g. Alex"
              value="${escapeHtml(state.nickname || '')}"
            />
          </div>

          <span id="msJoinError" class="ms-error-text" hidden></span>

          <button id="msSubmitJoinBtn" class="ms-btn-primary" type="button" style="margin-top: 4px;">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span>Join Room</span>
          </button>
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
    const goalHours = parseInt(goalText, 10) || 3;
    const todayGoalSec = goalHours * 3600;
    const progressPct = Math.min(100, Math.round((state.todayFocusSeconds / todayGoalSec) * 100));

    // Calculate circular timer offset
    const pct = Math.max(0, Math.min(1, state.timer.secondsLeft / state.timer.totalSeconds));
    const strokeOffset = CIRCLE_CIRCUMFERENCE * (1 - pct);

    return `
      <div id="msWorkspace" class="ms-workspace">
        <!-- 1. Sleek Group Info Header Card -->
        <div class="ms-group-info-card">
          <div class="ms-group-info-left">
            <img class="ms-group-thumb" src="../textures/myspace-banner.webp" alt="Room Banner" />
            <div class="ms-group-meta">
              <h3 class="ms-group-name">${escapeHtml(room.name || 'Study Squad')}</h3>
              <div class="ms-group-sub">
                <span>${memberCount} members</span>
                <span class="dot">•</span>
                <span>Daily goal: ${escapeHtml(goalText)}</span>
              </div>
            </div>
          </div>
          <button id="msGroupSettingsBtn" class="ms-group-settings-btn" type="button" title="Group Settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <!-- Settings Popup Menu -->
        <div id="msSettingsMenu" class="ms-settings-menu" style="display: ${state.settingsMenuOpen ? 'flex' : 'none'};">
          <button id="msCopyCodeBtn" class="ms-menu-item" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy Room Code</span>
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

        ${state.activeWorkspaceTab === 'group' ? renderGroupContent(progressPct, strokeOffset) : renderLeaderboardContent()}

        <!-- 3. Sticky Bottom Navigation Bar (Sticks permanently above the footer) -->
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
              const isMemberFocus = m.status === 'Focusing';
              const isMemberBreak = m.status === 'Break';
              const dotClass = isMemberFocus ? '' : isMemberBreak ? 'dot-break' : 'dot-offline';
              const textClass = isMemberFocus ? '' : isMemberBreak ? 'status-break' : 'status-offline';

              return `
                <div class="ms-member-row">
                  <div class="ms-member-avatar-wrap">
                    <span>${m.avatar || '🧑‍💻'}</span>
                    <span class="ms-member-dot ${dotClass}"></span>
                  </div>
                  <div class="ms-member-info">
                    <span class="ms-member-name-line">
                      <span>${escapeHtml(m.nickname || 'Coder')}${isYou ? ' (You)' : ''}</span>
                      ${m.isHost ? '<span class="ms-member-crown">👑</span>' : ''}
                    </span>
                    <span class="ms-member-status-text ${textClass}">
                      ${isMemberFocus ? `Focusing • ${m.timerFormatted || '24:58'}` : isMemberBreak ? `Break • ${m.timerFormatted || '05:00'}` : 'Active 1h ago'}
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
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
              <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3" />
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
    `;
  }

  function renderLeaderboardContent() {
    const leaders = (state.globalLeaders && state.globalLeaders.length) ? state.globalLeaders : [];
    const you = leaders.find(l => l.id === state.userId) || {
      rank: 4,
      nickname: `${state.nickname || 'You'} (You)`,
      todayDisplay: formatHoursMinutes(state.todayFocusSeconds),
      streak: 3,
      solvedCount: 5,
      avatar: '⚡'
    };

    return `
      <div class="ms-leaderboard-view">
        <div class="ms-leaderboard-header">
          <div class="ms-lb-title">
            <span>🏆 Global Focus Arena</span>
          </div>
          <span class="ms-lb-badge">Worldwide</span>
        </div>

        <div class="ms-leaderboard-list">
          ${leaders.map((item) => {
            const isYou = item.id === state.userId;
            const rankClass = item.rank === 1 ? 'ms-lb-rank-1' : item.rank === 2 ? 'ms-lb-rank-2' : item.rank === 3 ? 'ms-lb-rank-3' : '';
            const rankEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

            return `
              <div class="ms-lb-item ${isYou ? 'is-you' : ''}">
                <div class="ms-lb-rank-badge ${rankClass}">
                  <span>${rankEmoji}</span>
                </div>
                <div class="ms-member-avatar-wrap" style="width: 32px; height: 32px; font-size: 15px;">
                  <span>${item.avatar || '🧑‍💻'}</span>
                </div>
                <div class="ms-lb-user-info">
                  <span class="ms-lb-name">${escapeHtml(item.nickname)}${isYou ? ' (You)' : ''}</span>
                  <span class="ms-lb-stats">🔥 ${item.streak || 1} day streak • ${item.solvedCount || 1} solved</span>
                </div>
                <span class="ms-lb-hours">${item.todayDisplay || '3h 15m'}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // 5. VIEW RENDER DISPATCHER
  // ===========================================================================
  function render() {
    const container = document.getElementById('view-myspace');
    if (!container) return;

    if (state.activeRoom) {
      container.innerHTML = renderActiveWorkspace();
      bindWorkspaceEvents(container);
      return;
    }

    if (state.currentView === 'create') {
      container.innerHTML = renderCreateView();
      bindCreateEvents(container);
    } else if (state.currentView === 'join') {
      container.innerHTML = renderJoinView();
      bindJoinEvents(container);
    } else {
      container.innerHTML = renderLobbyView();
      bindLobbyEvents(container);
    }
  }

  // ===========================================================================
  // 6. EVENT BINDINGS
  // ===========================================================================
  function bindLobbyEvents(container) {
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
    const backBtn = container.querySelector('.ms-btn-back-lobby');
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
    const nicknameInput = container.querySelector('#msCreatorNicknameInput');

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const roomName = (nameInput && nameInput.value.trim()) || 'Study Squad';
        const goal = (goalSelect && goalSelect.value) || '3 hours';
        const nickname = (nicknameInput && nicknameInput.value.trim()) || state.nickname || 'Host';

        const roomCode = generateRoomCode();
        const initialMembers = [
          {
            id: state.userId,
            nickname: nickname,
            status: 'Focusing',
            timerFormatted: '25:00',
            isHost: true,
            avatar: '👑',
            joinedAt: Date.now()
          },
          ...SAMPLE_PEERS
        ];

        const room = {
          code: roomCode,
          name: roomName,
          goal: goal,
          type: state.selectedRoomType,
          creator: nickname,
          createdAt: Date.now(),
          members: initialMembers
        };

        state.activeRoom = room;
        state.nickname = nickname;
        state.members = initialMembers;

        // Persist locally
        chrome.storage.local.set({
          [STORAGE_KEYS.ROOM]: room,
          [STORAGE_KEYS.NICKNAME]: nickname
        });

        // Sync with Firebase in background
        if (window.MySpaceAPI) {
          window.MySpaceAPI.saveRoom(room);
          window.MySpaceAPI.syncMember(roomCode, initialMembers[0]);
        }

        render();
      });
    }
  }

  function bindJoinEvents(container) {
    const backBtn = container.querySelector('.ms-btn-back-lobby');
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

    if (codeInput) {
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase();
        if (errorEl) errorEl.hidden = true;
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const code = (codeInput && codeInput.value.trim().toUpperCase()) || '';
        const nickname = (nicknameInput && nicknameInput.value.trim()) || state.nickname || 'Coder';

        if (!code || code.length < 3) {
          if (errorEl) {
            errorEl.textContent = 'Please enter a valid room code';
            errorEl.hidden = false;
          }
          if (codeInput) codeInput.focus();
          return;
        }

        // Try fetching online room from Firebase
        let onlineRoom = null;
        if (window.MySpaceAPI) {
          onlineRoom = await window.MySpaceAPI.getRoom(code);
        }

        const roomName = (onlineRoom && onlineRoom.info && onlineRoom.info.name) || 'Study Squad';
        const roomGoal = (onlineRoom && onlineRoom.info && onlineRoom.info.goal) || '3 hours';
        const roomType = (onlineRoom && onlineRoom.info && onlineRoom.info.type) || 'open';

        const me = {
          id: state.userId,
          nickname: nickname,
          status: 'Focusing',
          timerFormatted: '25:00',
          isHost: false,
          avatar: '👨‍💻',
          joinedAt: Date.now()
        };

        const initialMembers = [me, ...SAMPLE_PEERS];

        const room = {
          code: code,
          name: roomName,
          goal: roomGoal,
          type: roomType,
          creator: (onlineRoom && onlineRoom.info && onlineRoom.info.creator) || 'Host',
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
          window.MySpaceAPI.syncMember(code, me);
        }

        render();
      });
    }
  }

  function bindWorkspaceEvents(container) {
    // 1. Settings button
    const settingsBtn = container.querySelector('#msGroupSettingsBtn');
    const settingsMenu = container.querySelector('#msSettingsMenu');
    if (settingsBtn && settingsMenu) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.settingsMenuOpen = !state.settingsMenuOpen;
        settingsMenu.style.display = state.settingsMenuOpen ? 'flex' : 'none';
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (state.settingsMenuOpen && settingsMenu && !settingsMenu.contains(e.target)) {
        state.settingsMenuOpen = false;
        settingsMenu.style.display = 'none';
      }
    }, { once: true });

    // Copy Room Code
    const copyBtn = container.querySelector('#msCopyCodeBtn');
    if (copyBtn && state.activeRoom) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(state.activeRoom.code || '');
        copyBtn.querySelector('span').textContent = 'Copied! ✓';
        setTimeout(() => {
          if (copyBtn) copyBtn.querySelector('span').textContent = 'Copy Room Code';
        }, 1800);
      });
    }

    // Leave Group
    const leaveBtn = container.querySelector('#msLeaveGroupBtn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        if (state.activeRoom && window.MySpaceAPI) {
          window.MySpaceAPI.removeMember(state.activeRoom.code, state.userId);
        }
        stopTimer();
        state.activeRoom = null;
        state.currentView = 'lobby';
        state.settingsMenuOpen = false;
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
        if (state.activeWorkspaceTab !== 'group') {
          state.activeWorkspaceTab = 'group';
          render();
        }
      });
    }

    if (navLbBtn) {
      navLbBtn.addEventListener('click', async () => {
        if (state.activeWorkspaceTab !== 'leaderboard') {
          state.activeWorkspaceTab = 'leaderboard';
          if (window.MySpaceAPI) {
            state.globalLeaders = await window.MySpaceAPI.getGlobalLeaderboard();
          }
          render();
        }
      });
    }
  }

  // ===========================================================================
  // 7. TIMER ENGINE & HEARTBEAT
  // ===========================================================================
  function startTimer() {
    if (state.timer.isRunning) return;
    state.timer.isRunning = true;
    state.timer.status = 'Focusing';

    if (state.timer.interval) clearInterval(state.timer.interval);
    state.timer.interval = setInterval(() => {
      if (state.timer.secondsLeft > 0) {
        state.timer.secondsLeft -= 1;
        state.todayFocusSeconds += 1;

        // Sync every 30 seconds
        if (state.timer.secondsLeft % 30 === 0) {
          syncHeartbeat();
        }

        updateTimerUI();
      } else {
        // Session complete
        state.timer.status = 'Break';
        state.timer.secondsLeft = 5 * 60; // 5 min break
        state.timer.totalSeconds = 5 * 60;
        syncHeartbeat();
        updateTimerUI();
      }
    }, 1000);

    syncHeartbeat();
    updateTimerUI();
  }

  function pauseTimer() {
    state.timer.isRunning = false;
    state.timer.status = 'Paused';
    if (state.timer.interval) clearInterval(state.timer.interval);
    syncHeartbeat();
    updateTimerUI();
  }

  function resetTimer() {
    state.timer.isRunning = false;
    state.timer.status = 'Idle';
    state.timer.secondsLeft = DEFAULT_TIMER_SECONDS;
    state.timer.totalSeconds = DEFAULT_TIMER_SECONDS;
    if (state.timer.interval) clearInterval(state.timer.interval);
    syncHeartbeat();
    updateTimerUI();
  }

  function stopTimer() {
    state.timer.isRunning = false;
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
  }

  function updateTimerUI() {
    const container = document.getElementById('view-myspace');
    if (!container || state.activeWorkspaceTab !== 'group') return;

    const digitsEl = container.querySelector('.ms-timer-digits');
    if (digitsEl) digitsEl.textContent = formatTime(state.timer.secondsLeft);

    const arcEl = container.querySelector('.ms-timer-progress-arc');
    if (arcEl) {
      const pct = Math.max(0, Math.min(1, state.timer.secondsLeft / state.timer.totalSeconds));
      arcEl.style.strokeDashoffset = (CIRCLE_CIRCUMFERENCE * (1 - pct)).toFixed(2);
    }

    const pillEl = container.querySelector('.ms-timer-status-pill');
    if (pillEl) {
      const isBreak = state.timer.status === 'Break';
      const isFocusing = state.timer.status === 'Focusing';
      pillEl.className = `ms-timer-status-pill ${isBreak ? 'status-break' : isFocusing ? 'status-focus' : 'status-idle'}`;
      pillEl.textContent = isBreak ? '☕ Break' : isFocusing ? '🍃 Focusing' : '⏸ Paused';
    }

    // Update your row in members list
    const yourRow = container.querySelector('.ms-member-row:first-child .ms-member-status-text');
    if (yourRow) {
      yourRow.textContent = `${state.timer.status} • ${formatTime(state.timer.secondsLeft)}`;
    }

    // Update play button icon
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
  }

  function syncHeartbeat() {
    if (!state.activeRoom || !window.MySpaceAPI) return;

    const me = {
      id: state.userId,
      nickname: state.nickname || 'You',
      status: state.timer.status,
      timerFormatted: formatTime(state.timer.secondsLeft),
      isHost: Boolean(state.activeRoom.creator === state.nickname),
      avatar: '👨‍💻'
    };

    window.MySpaceAPI.syncMember(state.activeRoom.code, me);

    // Also update global leaderboard entry
    window.MySpaceAPI.syncToGlobalLeaderboard({
      id: state.userId,
      nickname: state.nickname || 'You',
      focusSeconds: state.todayFocusSeconds,
      todayDisplay: formatHoursMinutes(state.todayFocusSeconds),
      streak: 3,
      solvedCount: 6,
      avatar: '👨‍💻'
    });
  }

  // ===========================================================================
  // 8. INITIALIZATION
  // ===========================================================================
  function init() {
    chrome.storage.local.get([
      STORAGE_KEYS.ROOM,
      STORAGE_KEYS.NICKNAME,
      STORAGE_KEYS.USER_ID,
      STORAGE_KEYS.FOCUS_TIME
    ], (res) => {
      if (res && res[STORAGE_KEYS.USER_ID]) {
        state.userId = res[STORAGE_KEYS.USER_ID];
      } else {
        state.userId = 'usr_' + Math.random().toString(36).substring(2, 9);
        chrome.storage.local.set({ [STORAGE_KEYS.USER_ID]: state.userId });
      }

      if (res && res[STORAGE_KEYS.NICKNAME]) {
        state.nickname = res[STORAGE_KEYS.NICKNAME];
      } else {
        state.nickname = 'Vinay';
      }

      if (res && res[STORAGE_KEYS.FOCUS_TIME]) {
        state.todayFocusSeconds = Number(res[STORAGE_KEYS.FOCUS_TIME]) || state.todayFocusSeconds;
      }

      if (res && res[STORAGE_KEYS.ROOM]) {
        state.activeRoom = res[STORAGE_KEYS.ROOM];
        state.members = [
          {
            id: state.userId,
            nickname: state.nickname,
            status: 'Focusing',
            timerFormatted: '24:58',
            isHost: true,
            avatar: '👑'
          },
          ...SAMPLE_PEERS
        ];
      }

      // Preload global leaderboard
      if (window.MySpaceAPI) {
        window.MySpaceAPI.getGlobalLeaderboard().then((leaders) => {
          state.globalLeaders = leaders;
        });
      }

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
