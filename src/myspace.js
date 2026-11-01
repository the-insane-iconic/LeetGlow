/* =============================================================================
   My Space — Focus Together, Collaborative & Competitive Arena
   Handles view routing, room creation, and room joining.
============================================================================= */

(() => {
  'use strict';

  const STORAGE_KEYS = {
    ROOM: 'msActiveRoom',
    NICKNAME: 'msUserNickname'
  };

  const state = {
    currentView: 'lobby', // 'lobby' | 'create' | 'join' | 'room'
    activeRoom: null,
    nickname: '',
    selectedRoomType: 'private' // 'private' | 'open'
  };

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `GLOW-${code}`;
  }

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

  function renderActiveRoomPlaceholder() {
    const room = state.activeRoom || {};
    return `
      <div id="msViewRoom" class="ms-view ms-view-room">
        <div class="ms-view-header">
          <h3 class="ms-view-title">${escapeHtml(room.name || 'Focus Room')}</h3>
        </div>
        <div class="ms-form-card" style="text-align: center; align-items: center; padding: 24px 16px;">
          <div class="ms-feature-icon-wrap icon-focus" style="width: 52px; height: 52px; margin-bottom: 4px;">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h4 style="font-size: 15px; font-weight: 700; color: #fff;">Room Connected: ${escapeHtml(room.code || '')}</h4>
          <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 16px;">Daily Goal: ${escapeHtml(room.goal || '3 hours')} • ${escapeHtml(room.type || 'Private')}</p>
          <button id="msLeaveRoomBtn" class="ms-btn-secondary" type="button" style="width: auto; padding: 0 24px; height: 38px;">
            <span>Leave Room</span>
          </button>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render() {
    const container = document.getElementById('view-myspace');
    if (!container) return;

    if (state.activeRoom) {
      container.innerHTML = renderActiveRoomPlaceholder();
      bindRoomEvents(container);
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
    const errorEl = container.querySelector('#msCreateError');

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const roomName = (nameInput && nameInput.value.trim()) || 'Study Squad';
        const goal = (goalSelect && goalSelect.value) || '3 hours';
        const nickname = (nicknameInput && nicknameInput.value.trim()) || state.nickname || 'Host';

        const roomCode = generateRoomCode();
        const room = {
          code: roomCode,
          name: roomName,
          goal: goal,
          type: state.selectedRoomType,
          creator: nickname,
          createdAt: Date.now(),
          members: [
            {
              id: 'user_' + Date.now().toString(36),
              nickname: nickname,
              isHost: true,
              joinedAt: Date.now()
            }
          ]
        };

        state.activeRoom = room;
        state.nickname = nickname;

        chrome.storage.local.set({
          [STORAGE_KEYS.ROOM]: room,
          [STORAGE_KEYS.NICKNAME]: nickname
        }, () => {
          render();
        });
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
      submitBtn.addEventListener('click', () => {
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

        const room = {
          code: code,
          name: 'Focus Room',
          goal: '3 hours',
          type: 'open',
          creator: 'Host',
          joinedAt: Date.now(),
          members: [
            {
              id: 'user_' + Date.now().toString(36),
              nickname: nickname,
              isHost: false,
              joinedAt: Date.now()
            }
          ]
        };

        state.activeRoom = room;
        state.nickname = nickname;

        chrome.storage.local.set({
          [STORAGE_KEYS.ROOM]: room,
          [STORAGE_KEYS.NICKNAME]: nickname
        }, () => {
          render();
        });
      });
    }
  }

  function bindRoomEvents(container) {
    const leaveBtn = container.querySelector('#msLeaveRoomBtn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        state.activeRoom = null;
        state.currentView = 'lobby';
        chrome.storage.local.remove([STORAGE_KEYS.ROOM], () => {
          render();
        });
      });
    }
  }

  function init() {
    chrome.storage.local.get([STORAGE_KEYS.ROOM, STORAGE_KEYS.NICKNAME], (res) => {
      if (res && res[STORAGE_KEYS.ROOM]) {
        state.activeRoom = res[STORAGE_KEYS.ROOM];
      }
      if (res && res[STORAGE_KEYS.NICKNAME]) {
        state.nickname = res[STORAGE_KEYS.NICKNAME];
      }
      render();
    });
  }

  // Expose global interface for debugging or external calls
  window.LeetGlowMySpace = {
    init,
    render,
    getState: () => ({ ...state }),
    setRoom: (room) => {
      state.activeRoom = room;
      render();
    },
    leaveRoom: () => {
      state.activeRoom = null;
      state.currentView = 'lobby';
      chrome.storage.local.remove([STORAGE_KEYS.ROOM], () => render());
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
