/* LeetThemes — focus mode. */
(function () {
  'use strict';

  const CLASSES = {
    enabled: 'lct-focus',
    hideHeader: 'lct-focus-hide-header',
    hidePromos: 'lct-focus-hide-promos',
    hideSidebar: 'lct-focus-hide-sidebar',
    hideDiscussion: 'lct-focus-hide-discussion',
    hideFooter: 'lct-focus-hide-footer'
  };

  class FocusMode {
    constructor() {
      this.enabled = false;
      this.widgets = null;
      this.onChange = null;
    }

    init(widgets, onChange) {
      this.widgets = widgets;
      this.onChange = onChange;
      widgets.configure({ focusExit: this.exit.bind(this) });
    }

    apply(settings) {
      const config = (settings && settings.focus) || {};
      this.enabled = Boolean(config.enabled);
      const root = document.documentElement;
      root.classList.toggle(CLASSES.enabled, this.enabled);
      Object.keys(CLASSES).forEach(function (key) {
        if (key === 'enabled') return;
        root.classList.toggle(CLASSES[key], this.enabled && config[key] !== false);
      }.bind(this));
      if (this.widgets) this.widgets.setFocus(this.enabled);
    }

    exit() {
      if (this.onChange) this.onChange(false);
    }
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.focus = new FocusMode();
})();
