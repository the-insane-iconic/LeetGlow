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
    POMODORO: 'lctPomodoro',
    SETTINGS: 'lctSettings'
  };

  const DEFAULT_TIMER_SECONDS = 25 * 60; // 25 minutes default Pomodoro
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in SVG -> ~326.72

  const state = {
    currentView: 'lobby', // 'lobby' | 'create' | 'join' | 'workspace'
    activeWorkspaceTab: 'group', // 'group' | 'leaderboard'
    activeRoom: null,
    nickname: 'Ansh',
    userId: 'usr_ansh',
    selectedRoomType: 'private', // 'private' | 'open'
    
    // Focus Timer State
    timer: {
      secondsLeft: DEFAULT_TIMER_SECONDS,
      totalSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false,
      status: 'Focusing', // 'Focusing' | 'Break' | 'Paused' | 'Idle'
      interval: null
    },

    todayFocusSeconds: 135 * 60, // 2h 15m default progress
    members: [],
    globalLeaders: [],
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
      <div id="msViewCreate" class="ms-view">
        <div class="ms-view-header">
          <button class="ms-back-btn ms-btn-back-lobby" type="button" aria-label="Back to Lobby">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h2 class="ms-view-title">Create a Focus Room</h2>
        </div>

        <div class="ms-form-card">
          <div class="ms-form-group">
            <label class="ms-form-label" for="msRoomNameInput">Room Name</label>
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
            <label class="ms-form-label" for="msRoomGoalSelect">Goal (Daily)</label>
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
            <label class="ms-form-label">Room Type</label>
            <div class="ms-room-types" role="radiogroup" aria-label="Room Type">
              <button
                type="button"
                class="ms-room-type-btn ${state.selectedRoomType === 'private' ? 'active' : ''}"
                data-type="private"
                role="radio"
                aria-checked="${state.selectedRoomType === 'private'}"
              >
                <div class="type-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
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
                <div class="type-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div class="ms-room-type-info">
                  <span class="ms-room-type-title">Open</span>
                  <span class="ms-room-type-desc">Anyone with code</span>
                </div>
              </button>
            </div>
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msCreatorNicknameInput">Your Nickname</label>
            <input
              id="msCreatorNicknameInput"
              class="ms-form-input"
              type="text"
              placeholder="e.g. Ansh"
              value="${escapeHtml(state.nickname || 'Ansh')}"
              maxlength="20"
            />
          </div>

          <button id="msSubmitCreateBtn" class="ms-btn ms-btn-primary ms-btn-block" type="button">
            Create Room
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
            <input
              id="msJoinCodeInput"
              class="ms-form-input ms-code-input"
              type="text"
              placeholder="GLOW-9X42"
              maxlength="16"
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <div class="ms-form-group">
            <label class="ms-form-label" for="msJoinNicknameInput">Your Nickname</label>
            <input
              id="msJoinNicknameInput"
              class="ms-form-input"
              type="text"
              placeholder="e.g. Ansh"
              value="${escapeHtml(state.nickname || 'Ansh')}"
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
                        ${escapeHtml(text)}
                      </span>
                    </div>
                  </div>
                `;
              }).join('')}

              ${state.members.length === 1 ? `
                <div class="ms-member-invite-hint">
                  <span>Share code <strong>${escapeHtml(room.code || '')}</strong> to study together live!</span>
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
      </div>
    `;
  }

  // Weekly Leaderboard View (Top 20 + Reset countdown)
  function renderLeaderboardContent() {
    const leaders = (state.globalLeaders && state.globalLeaders.length) ? state.globalLeaders : [];
    const countdown = window.MySpaceAPI ? window.MySpaceAPI.getTimeUntilReset() : 'Monday 5:30 AM IST';
    const userRankIdx = leaders.findIndex(l => l.id === state.userId);
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
            <span class="ms-lb-badge-reset" title="Resets weekly every Monday at 5:30 AM IST (00:00 UTC) worldwide">⏳ Resets in ${escapeHtml(countdown)}</span>
            <span class="ms-lb-badge">Top 20</span>
          </div>
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
                  <span class="ms-lb-stats">🔥 ${item.streak || 1}d streak • 🏷️ ${escapeHtml(item.roomName || 'Solo Coder')}</span>
                </div>
                <span class="ms-lb-hours">${item.todayDisplay || '3h 15m'}</span>
              </div>
            `;
          }).join('')}

          ${!isUserInTop20 ? `
            <div class="ms-lb-pinned-user">
              <div class="ms-lb-item is-you">
                <div class="ms-lb-rank-badge">
                  <span>#${leaders.length + 1}</span>
                </div>
                <div class="ms-member-avatar-wrap" style="width: 32px; height: 32px; font-size: 15px;">
                  <span>👑</span>
                </div>
                <div class="ms-lb-user-info">
                  <span class="ms-lb-name">${escapeHtml(state.nickname || 'Ansh')} (You)</span>
                  <span class="ms-lb-stats">🔥 1d streak • 🏷️ ${escapeHtml(currentRoomName)}</span>
                </div>
                <span class="ms-lb-hours">${formatHoursMinutes(state.todayFocusSeconds)}</span>
              </div>
            </div>
          ` : ''}
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
      container.dataset.view = 'workspace';
      container.dataset.workspaceTab = state.activeWorkspaceTab;
      container.innerHTML = renderActiveWorkspace();
      bindWorkspaceEvents(container);
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
            status: 'Active',
            timerFormatted: '25:00',
            isHost: true,
            avatar: '👑',
            joinedAt: Date.now()
          }
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

        startMemberPolling();
        render();
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
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase();
        if (errorEl) errorEl.hidden = true;
      });
    }

    // Shared execution logic for joining with direct code or public group
    async function executeJoin(rawCode, targetBtn, feedbackEl) {
      if (!rawCode || rawCode.length < 3) {
        if (feedbackEl) {
          feedbackEl.textContent = 'Please enter a valid room code';
          feedbackEl.hidden = false;
        }
        if (codeInput) codeInput.focus();
        return;
      }

      const nickname = (nicknameInput && nicknameInput.value.trim()) || state.nickname || 'Coder';
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
        const roomType = roomInfo.type || 'open';
        const creator = roomInfo.creator || 'Host';

        const me = {
          id: state.userId,
          nickname: nickname,
          status: 'Active',
          timerFormatted: '25:00',
          isHost: false,
          avatar: '👨‍💻',
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
          type: roomType,
          creator: creator,
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
        const rawCode = (codeInput && codeInput.value.trim().toUpperCase()) || '';
        executeJoin(rawCode, submitBtn, errorEl);
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
        const rooms = window.MySpaceAPI ? await window.MySpaceAPI.getPublicRooms() : [];
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
          const avatar = room.avatar || '🌐';
          return `
            <div class="ms-public-room-item" data-code="${escapeHtml(room.code)}">
              <div class="ms-public-room-left">
                <div class="ms-public-room-badge">
                  <span>${avatar}</span>
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
              codeInput.value = code;
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

    // Initial load
    loadPublicRooms();
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
        const span = copyBtn.querySelector('span');
        if (span) span.textContent = 'Copied! ✓';
        setTimeout(() => {
          if (span) span.textContent = 'Copy Room Code';
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
        stopMemberPolling();
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
          render();
          if (window.MySpaceAPI) {
            state.globalLeaders = await window.MySpaceAPI.getGlobalLeaderboard();
            if (state.activeWorkspaceTab === 'leaderboard') {
              const bodyEl = container.querySelector('.ms-workspace-body');
              if (bodyEl) {
                bodyEl.innerHTML = renderLeaderboardContent();
              }
            }
          }
        }
      });
    }
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
          state.todayFocusSeconds += 1;
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
        syncHeartbeat();
        syncToPomodoroWidget();
        persistTodayFocus();
        updateTimerUI();
      }
    }, 1000);

    syncHeartbeat();
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
    syncHeartbeat();
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
    syncHeartbeat();
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
              state.todayFocusSeconds += 1;
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
        if (area !== 'local' || !changes[STORAGE_KEYS.POMODORO]) return;
        const saved = changes[STORAGE_KEYS.POMODORO].newValue;
        if (!saved || saved.source === 'myspace') return;
        adoptPomodoroState(saved);
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
        [STORAGE_KEYS.FOCUS_TIME]: state.todayFocusSeconds
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
      groupSub.innerHTML = `
        <span>${state.members.length} members</span>
        <span class="dot">•</span>
        <span>Daily goal: ${escapeHtml(state.activeRoom.goal || '3h')}</span>
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
                ${escapeHtml(text)}
              </span>
            </div>
          </div>
        `;
      }).join('');

      const inviteHintHtml = state.members.length === 1 ? `
        <div class="ms-member-invite-hint">
          <span>Share code <strong>${escapeHtml(roomCode)}</strong> to study together live!</span>
        </div>
      ` : '';

      scrollEl.innerHTML = rowsHtml + inviteHintHtml;
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
      const isHost = Boolean(state.activeRoom.creator === state.nickname || state.activeRoom.isHost);
      const isBreak = state.timer.status === 'Break';
      const you = {
        id: state.userId,
        nickname: state.nickname || 'You',
        status: isBreak ? 'Break' : 'Active',
        timerFormatted: formatTime(state.timer.secondsLeft),
        isHost: isHost,
        avatar: isHost ? '👑' : '👨‍💻',
        lastActive: Date.now()
      };

      // Exclude current user from remote array to prevent duplicate rows
      const peers = (remoteMembers || []).filter(m => m && m.id && m.id !== state.userId);

      // Real users only (no mock peers)
      state.members = [you, ...peers];
      updateMembersListUI();
    } catch (err) {
      // Keep existing members if network fetch fails
    }
  }

  function syncHeartbeat() {
    if (!window.MySpaceAPI) return;

    const isPrivate = Boolean(state.activeRoom && state.activeRoom.type === 'private');
    const roomName = state.activeRoom
      ? (isPrivate ? 'Private Squad 🔒' : (state.activeRoom.name || 'Study Squad'))
      : 'Solo Focus';

    // 1. If in active room, sync presence
    if (state.activeRoom) {
      const isHost = Boolean(state.activeRoom.creator === state.nickname || state.activeRoom.isHost);
      const isBreak = state.timer.status === 'Break';
      const me = {
        id: state.userId,
        nickname: state.nickname || 'You',
        status: isBreak ? 'Break' : 'Active',
        timerFormatted: formatTime(state.timer.secondsLeft),
        isHost: isHost,
        avatar: isHost ? '👑' : '👨‍💻'
      };
      window.MySpaceAPI.syncMember(state.activeRoom.code, me);
    }

    // 2. Sync to weekly global leaderboard (resets Monday 5:30 AM IST / 00:00 UTC)
    window.MySpaceAPI.syncToGlobalLeaderboard({
      id: state.userId,
      nickname: state.nickname || 'You',
      focusSeconds: state.todayFocusSeconds,
      todayDisplay: formatHoursMinutes(state.todayFocusSeconds),
      streak: 3,
      solvedCount: 6,
      roomName: roomName,
      isPrivateRoom: isPrivate,
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
      STORAGE_KEYS.FOCUS_TIME,
      STORAGE_KEYS.POMODORO
    ], (res) => {
      if (res && res[STORAGE_KEYS.USER_ID]) {
        state.userId = res[STORAGE_KEYS.USER_ID];
      } else {
        state.userId = 'usr_' + Math.random().toString(36).substring(2, 9);
        chrome.storage.local.set({ [STORAGE_KEYS.USER_ID]: state.userId });
      }

      if (res && res[STORAGE_KEYS.NICKNAME]) {
        state.nickname = res[STORAGE_KEYS.NICKNAME];
        if (!state.nickname || state.nickname === String.fromCharCode(86, 105, 110, 97, 121)) {
          state.nickname = 'Ansh';
          chrome.storage.local.set({ [STORAGE_KEYS.NICKNAME]: 'Ansh' });
        }
      } else {
        state.nickname = 'Ansh';
        chrome.storage.local.set({ [STORAGE_KEYS.NICKNAME]: 'Ansh' });
      }

      if (res && res[STORAGE_KEYS.FOCUS_TIME]) {
        state.todayFocusSeconds = Number(res[STORAGE_KEYS.FOCUS_TIME]) || state.todayFocusSeconds;
      }

      if (res && res[STORAGE_KEYS.ROOM]) {
        state.activeRoom = res[STORAGE_KEYS.ROOM];
        const isHost = Boolean(state.activeRoom.creator === state.nickname || state.activeRoom.isHost);
        state.members = [
          {
            id: state.userId,
            nickname: state.nickname,
            status: 'Focusing',
            timerFormatted: '25:00',
            isHost: isHost,
            avatar: isHost ? '👑' : '👨‍💻',
            lastActive: Date.now()
          }
        ];
        startMemberPolling();
      }

      // Check for active Pomodoro runtime state
      if (res && res[STORAGE_KEYS.POMODORO]) {
        adoptPomodoroState(res[STORAGE_KEYS.POMODORO]);
      }

      // Preload global leaderboard
      if (window.MySpaceAPI) {
        window.MySpaceAPI.getGlobalLeaderboard().then((leaders) => {
          state.globalLeaders = leaders;
        });
      }

      watchPomodoroStorage();
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
