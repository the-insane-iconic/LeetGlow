/* ============================================================
   LeetGlow Landing Page — script.js
   Vanilla JS. No external libraries. No frameworks.
   ============================================================ */

'use strict';

// ── Theme Gallery Data ────────────────────────────────────────
const THEMES = [
  {
    id: 'sakura-dream',
    name: 'Sakura Dream',
    tagline: 'soft launch era',
    cat: 'Anime',
    colors: ['#fbeef2', '#d8538c', '#8f7be8', '#2d1527'],
    bg: 'linear-gradient(145deg, #2d1527 0%, #1a0d1e 50%, #0e0810 100%)',
  },
  {
    id: 'forest-mist',
    name: 'Forest Mist',
    tagline: 'touch grass, digitally',
    cat: 'Nature',
    colors: ['#0b1410', '#7fd18b', '#d8c27a', '#e8f3e6'],
    bg: 'linear-gradient(145deg, #0b1410 0%, #112018 50%, #0b1410 100%)',
  },
  {
    id: 'midnight-ink',
    name: 'Midnight Ink',
    tagline: 'quiet luxury focus',
    cat: 'Minimal',
    colors: ['#0b0d10', '#7aa2ff', '#a78bfa', '#e9edf2'],
    bg: 'linear-gradient(145deg, #0b0d10 0%, #0f1420 50%, #080a0f 100%)',
  },
  {
    id: 'lofi-cafe',
    name: 'Lofi Caf\u00e9',
    tagline: 'cozy grind hours',
    cat: 'Lofi',
    colors: ['#1c1410', '#d4956a', '#a07850', '#f0e8d8'],
    bg: 'linear-gradient(145deg, #1c1410 0%, #221810 50%, #120e08 100%)',
  },
  {
    id: 'cyber-grid',
    name: 'Cyber Grid',
    tagline: 'future is loading',
    cat: 'Minimal',
    colors: ['#030508', '#00e5ff', '#ff2d6b', '#e0f7ff'],
    bg: 'linear-gradient(145deg, #030508 0%, #050a12 50%, #030508 100%)',
  },
  {
    id: 'neon-arcade',
    name: 'Neon Arcade',
    tagline: 'pixel perfection',
    cat: 'Classic',
    colors: ['#0a0612', '#ff6bff', '#ffe600', '#f5f5f5'],
    bg: 'linear-gradient(145deg, #0a0612 0%, #120818 50%, #0a0612 100%)',
  },
];

// ── FAQ Data ──────────────────────────────────────────────────
const FAQ_DATA = [
  {
    q: 'Is LeetGlow really free?',
    a: 'Yes — completely. The core extension, all 12 themes, live wallpapers, focus timer, ambient sound, and community features are 100% free, forever. There is an optional \u20b929 one-time purchase for extra bonus themes. No subscription. No ads.',
  },
  {
    q: 'Does it slow down LeetCode?',
    a: 'No measurable impact. LeetGlow is under 2 MB, runs only on LeetCode pages, and uses CSS transforms + requestAnimationFrame for all animations. The wallpapers are hardware-accelerated. Benchmarks show zero difference in LeetCode page load times.',
  },
  {
    q: 'What is the \u20b929 premium?',
    a: 'A completely optional, one-time purchase of \u20b929 (\u224825 cents USD) that unlocks a handful of bonus themes beyond the already-generous free set. No recurring charge. No account required. Pay once, own it.',
  },
  {
    q: 'Does it track my activity?',
    a: 'Never. LeetGlow is zero-tracking and local-first. All your preferences, solve history, and moment snapshots are stored in your browser\u2019s local storage. Nothing leaves your machine. No analytics. No telemetry.',
  },
  {
    q: 'Which browsers are supported?',
    a: 'Chrome and Chromium-based browsers (Edge, Brave, Arc, Opera). A Firefox port is planned. The extension is available on the Chrome Web Store and installs in under 30 seconds.',
  },
  {
    q: 'Can I use my own wallpaper?',
    a: 'Yes. LeetGlow includes a custom wallpaper upload feature. Upload any image from your device and it will be applied as your LeetCode background, styled to match your chosen theme\u2019s color palette.',
  },
  {
    q: 'What are Live Wallpapers?',
    a: 'Studio Ghibli-inspired animated scenes that play as your LeetCode background at 60 FPS. Pink Sakura, Golden Hour, Moon Field, and Ultimate Goku \u2014 each with subtle motion: drifting cherry blossoms, shifting light, swaying grass. They\u2019re calm, not distracting.',
  },
  {
    q: 'How do I share my moments?',
    a: 'After an accepted submission, click the LeetGlow share button that appears. It generates a stylized card with your code snippet, runtime stats, and your current theme applied. You can copy the image or share directly to social platforms.',
  },
];

// ── Utility ───────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── 1. Scroll Reveal (IntersectionObserver) ───────────────────
function initScrollReveal() {
  const items = $$('.reveal-item');
  if (!items.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  items.forEach((el) => observer.observe(el));
}

// Trigger hero items immediately (above fold)
function revealHeroItems() {
  const heroItems = $$('.hero .reveal-item');
  // Small delay to ensure CSS transition is active
  requestAnimationFrame(() => {
    heroItems.forEach((el) => el.classList.add('revealed'));
  });
}

// ── 2. Navbar ──────────────────────────────────────────────────
function initNavbar() {
  const navbar = $('#navbar');
  if (!navbar) return;

  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile toggle
  const toggle = $('.nav-toggle');
  const mobileMenu = $('#mobile-menu');
  if (!toggle || !mobileMenu) return;

  toggle.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    mobileMenu.setAttribute('aria-hidden', String(!isOpen));
  });

  // Close menu on link click
  $$('a', mobileMenu).forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden', 'true');
    });
  });
}

// ── 3. Theme Gallery ──────────────────────────────────────────
function initThemeGallery() {
  const viewport = $('#gallery-viewport');
  const dotsContainer = $('#gallery-dots');
  const prevBtn = $('#gallery-prev');
  const nextBtn = $('#gallery-next');
  if (!viewport) return;

  let currentIndex = 0;

  // Build cards
  THEMES.forEach((theme, i) => {
    const card = document.createElement('div');
    card.className = 'theme-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', theme.name);

    const swatchHTML = theme.colors
      .map((c) => `<div class="theme-swatch" style="background:${c};" title="${c}"></div>`)
      .join('');

    card.innerHTML = `
      <div class="theme-card-preview">
        <div class="theme-card-bg" style="background:${theme.bg};"></div>
        <span class="theme-card-cat">${theme.cat}</span>
      </div>
      <div class="theme-card-body">
        <h3 class="theme-card-name">${theme.name}</h3>
        <p class="theme-card-tagline">${theme.tagline}</p>
        <div class="theme-swatches">${swatchHTML}</div>
      </div>
    `;
    viewport.appendChild(card);

    // Build dot
    if (dotsContainer) {
      const dot = document.createElement('button');
      dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to theme ${i + 1}: ${theme.name}`);
      dot.addEventListener('click', () => scrollToCard(i));
      dotsContainer.appendChild(dot);
    }
  });

  const cards = $$('.theme-card', viewport);
  const dots = $$('.gallery-dot', dotsContainer);

  function scrollToCard(index) {
    if (index < 0) index = 0;
    if (index >= cards.length) index = cards.length - 1;
    currentIndex = index;

    const card = cards[index];
    if (!card) return;
    viewport.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });

    dots.forEach((d, i) => {
      d.classList.toggle('active', i === index);
      d.setAttribute('aria-selected', String(i === index));
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => scrollToCard(currentIndex - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => scrollToCard(currentIndex + 1));

  // Keyboard navigation
  viewport.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') scrollToCard(currentIndex - 1);
    if (e.key === 'ArrowRight') scrollToCard(currentIndex + 1);
  });

  // Track scroll position for dot sync
  let scrollTimer;
  viewport.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const viewportLeft = viewport.scrollLeft;
      const cardWidth = cards[0] ? cards[0].offsetWidth + 16 : 0; // gap
      const newIndex = Math.round(viewportLeft / cardWidth);
      if (newIndex !== currentIndex) {
        currentIndex = Math.max(0, Math.min(newIndex, cards.length - 1));
        dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
      }
    }, 80);
  }, { passive: true });

  // Drag to scroll
  let isDragging = false;
  let dragStartX = 0;
  let scrollStartLeft = 0;

  viewport.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.pageX;
    scrollStartLeft = viewport.scrollLeft;
    viewport.style.scrollBehavior = 'auto';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.pageX - dragStartX;
    viewport.scrollLeft = scrollStartLeft - dx;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      viewport.style.scrollBehavior = '';
    }
  });
}

// ── 4. Editor Theme Switcher ──────────────────────────────────
function initEditorDemo() {
  const tabs = $$('.theme-tab');
  const window_ = $('#monaco-window');
  const toast = $('#editor-toast');
  if (!window_ || !tabs.length) return;

  let toastTimer = null;

  function showToast() {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.classList.remove('show');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('show');
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
      });
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const theme = tab.dataset.theme;
      window_.setAttribute('data-active-theme', theme);

      // Show the accepted toast on switch
      showToast();
    });
  });

  // Auto-show toast on first load (after delay)
  setTimeout(showToast, 1800);
}

// ── 5. Focus Timer ────────────────────────────────────────────
function initFocusTimer() {
  const startBtn = $('#timer-start');
  const resetBtn = $('#timer-reset');
  const display = $('#timer-display');
  const ring = $('#ring-progress');
  if (!startBtn || !display) return;

  const TOTAL_SECONDS = 25 * 60; // 25 minutes
  const CIRCUMFERENCE = 528; // 2π × 84

  let secondsLeft = TOTAL_SECONDS;
  let intervalId = null;
  let isRunning = false;

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function updateRing(seconds) {
    if (!ring) return;
    const fraction = seconds / TOTAL_SECONDS;
    const offset = CIRCUMFERENCE * (1 - fraction);
    ring.style.strokeDashoffset = offset;
  }

  function tick() {
    if (secondsLeft <= 0) {
      stop();
      return;
    }
    secondsLeft--;
    display.textContent = formatTime(secondsLeft);
    updateRing(secondsLeft);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    startBtn.textContent = 'Pause';
    intervalId = setInterval(tick, 1000);
  }

  function pause() {
    if (!isRunning) return;
    isRunning = false;
    startBtn.textContent = 'Resume';
    clearInterval(intervalId);
  }

  function stop() {
    clearInterval(intervalId);
    isRunning = false;
    startBtn.textContent = 'Start';
  }

  function reset() {
    stop();
    secondsLeft = TOTAL_SECONDS;
    display.textContent = formatTime(secondsLeft);
    updateRing(secondsLeft);
    startBtn.textContent = 'Start';
  }

  startBtn.addEventListener('click', () => {
    if (isRunning) {
      pause();
    } else {
      start();
    }
  });

  resetBtn.addEventListener('click', reset);

  // Initialize display
  updateRing(TOTAL_SECONDS);
}

// ── 6. Chapter Mini-Timer (decorative, Ch.02) ─────────────────
function initChapterTimer() {
  const digits = $('#chapter-timer-digits');
  const ring = $('#chapter-ring');
  if (!digits || !ring) return;

  const CIRCUM = 314; // 2π × 50
  let s = 25 * 60;
  ring.style.strokeDasharray = CIRCUM;
  ring.style.strokeDashoffset = 0;

  // Animate slowly when in view
  let started = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !started) {
        started = true;
        setInterval(() => {
          if (s <= 0) return;
          s--;
          const frac = s / (25 * 60);
          ring.style.strokeDashoffset = CIRCUM * (1 - frac);
          const m = Math.floor(s / 60);
          const sec = s % 60;
          digits.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }, 1000);
      }
    },
    { threshold: 0.5 }
  );

  const chapterRingEl = ring.closest('.timer-mockup-mini');
  if (chapterRingEl) observer.observe(chapterRingEl);
}

// ── 7. Accepted Toast & Celebration (Ch.03) ───────────────────
function initCelebration() {
  const toast = $('#accepted-toast');
  const petals = $$('.petal');
  const replayBtn = $('#replay-celebration');
  if (!toast) return;

  function play() {
    toast.classList.remove('pulse');
    petals.forEach((p) => p.classList.remove('falling'));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('pulse');
        petals.forEach((p) => p.classList.add('falling'));
      });
    });
  }

  // Auto-trigger when in view
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        setTimeout(play, 400);
        observer.disconnect();
      }
    },
    { threshold: 0.5 }
  );

  const showcase = toast.closest('.accepted-showcase');
  if (showcase) observer.observe(showcase);

  if (replayBtn) replayBtn.addEventListener('click', play);
}

// ── 8. FAQ ────────────────────────────────────────────────────
function initFAQ() {
  const questionEls = $$('.faq-q');
  const answerPanel = $('#faq-answer-panel');
  const accordionEl = $('#faq-accordion');

  // Populate desktop answer panel
  if (answerPanel) {
    // Build answer divs
    FAQ_DATA.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'faq-answer' + (i === 0 ? ' active' : '');
      div.id = `faq-answer-${i}`;
      div.setAttribute('role', 'region');
      div.innerHTML = `<h3>${item.q}</h3><p>${item.a}</p>`;
      answerPanel.appendChild(div);
    });
  }

  // Desktop question list interactions
  questionEls.forEach((el) => {
    const idx = parseInt(el.dataset.faq, 10);

    el.addEventListener('click', () => activateQuestion(idx));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateQuestion(idx);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = questionEls[idx + 1];
        if (next) next.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = questionEls[idx - 1];
        if (prev) prev.focus();
      }
    });
  });

  function activateQuestion(idx) {
    questionEls.forEach((el) => {
      el.classList.toggle('active', parseInt(el.dataset.faq, 10) === idx);
      el.setAttribute('aria-expanded', String(parseInt(el.dataset.faq, 10) === idx));
    });

    $$('.faq-answer', answerPanel).forEach((ans, i) => {
      ans.classList.toggle('active', i === idx);
    });
  }

  // Mobile accordion
  if (accordionEl) {
    FAQ_DATA.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'accordion-item';

      const btn = document.createElement('button');
      btn.className = 'accordion-q';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `
        ${item.q}
        <svg class="accordion-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;

      const body = document.createElement('div');
      body.className = 'accordion-body';
      body.textContent = item.a;

      btn.addEventListener('click', () => {
        const isOpen = body.classList.contains('open');
        // Close all
        $$('.accordion-q').forEach((b) => {
          b.classList.remove('open');
          b.setAttribute('aria-expanded', 'false');
        });
        $$('.accordion-body').forEach((b) => b.classList.remove('open'));

        if (!isOpen) {
          btn.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          body.classList.add('open');
        }
      });

      div.appendChild(btn);
      div.appendChild(body);
      accordionEl.appendChild(div);
    });
  }
}

// ── 9. Smooth Anchor Scrolling ────────────────────────────────
function initSmoothAnchors() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;

    e.preventDefault();
    const navHeight = 64;
    const top = target.getBoundingClientRect().top + window.scrollY - navHeight;

    window.scrollTo({ top, behavior: 'smooth' });
  });
}

// ── 10. Chapter Spine Scroll Sync ────────────────────────────
function initChapterSpine() {
  const marker = $('#spine-marker');
  const chapters = $$('.chapter');
  if (!marker || !chapters.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = chapters.indexOf(entry.target);
          const fraction = idx / (chapters.length - 1);
          marker.style.marginTop = `${fraction * 80}%`;
        }
      });
    },
    { threshold: 0.3 }
  );

  chapters.forEach((ch) => observer.observe(ch));
}

// ── 11. Marquee Pause on Hover ────────────────────────────────
function initMarqueePause() {
  const inner = $('.marquee-inner');
  if (!inner) return;

  const track = inner.closest('.marquee-track');
  if (!track) return;

  track.addEventListener('mouseenter', () => {
    inner.style.animationPlayState = 'paused';
  });

  track.addEventListener('mouseleave', () => {
    inner.style.animationPlayState = 'running';
  });
}

// ── 12. Keyboard Support for Gallery ─────────────────────────
function initGalleryKeyboard() {
  const gallery = $('#gallery-viewport');
  if (!gallery) return;

  gallery.setAttribute('tabindex', '0');
  gallery.setAttribute('role', 'region');
  gallery.setAttribute('aria-label', 'Theme gallery. Use arrow keys to navigate.');
}

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  revealHeroItems();
  initScrollReveal();
  initNavbar();
  initThemeGallery();
  initEditorDemo();
  initFocusTimer();
  initChapterTimer();
  initCelebration();
  initFAQ();
  initSmoothAnchors();
  initChapterSpine();
  initMarqueePause();
  initGalleryKeyboard();

  // Slight performance: add will-change only when scrolling
  let scrollRAF;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRAF);
    scrollRAF = requestAnimationFrame(() => {
      // spine marker is handled by IntersectionObserver — nothing to do here
    });
  }, { passive: true });
});
