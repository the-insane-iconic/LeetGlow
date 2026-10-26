/* =============================================================================
   LeetGlow Landing Page Logic
   Interactive mockup switching, FAQ accordion & smooth transitions
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Interactive Theme Switcher in Hero Mockup
  const themePills = document.querySelectorAll('.theme-pill-btn');
  const stage = document.getElementById('previewStage');

  const THEME_WALLPAPERS = {
    'blue-dragon': 'assets/blue-dragon.webp',
    'harvest': 'assets/harvest-moon.webp',
    'golden-hour': 'assets/golden-hour.webp',
    'moon-field': 'assets/moon-field.webp'
  };

  themePills.forEach(pill => {
    pill.addEventListener('click', () => {
      themePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const themeKey = pill.getAttribute('data-theme');
      if (THEME_WALLPAPERS[themeKey] && stage) {
        stage.style.backgroundImage = `url('${THEME_WALLPAPERS[themeKey]}')`;
      }
    });
  });

  // Set default initial background
  if (stage) {
    stage.style.backgroundImage = `url('assets/blue-dragon.webp')`;
  }

  // 2. FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Close all
        faqItems.forEach(i => i.classList.remove('active'));
        // Toggle current
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // 3. Navbar scroll elevation
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  });
});
