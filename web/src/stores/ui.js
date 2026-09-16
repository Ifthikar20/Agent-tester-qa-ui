/**
 * How the shell is arranged, remembered per viewer.
 *
 * Nothing here is about the runner or the suites — it is what THIS person did
 * to the window, and it belongs in the browser rather than on the server. Two
 * people on one deployment should not fight over whether the sidebar is open.
 *
 * The read-in-an-IIFE / write-in-the-action shape, and both halves wrapped, is
 * the pattern `gc.pace` already uses in stores/live.js. localStorage throws
 * rather than returning null in a private window, so an unwrapped read at store
 * construction takes the whole app down before it renders.
 */
import { defineStore } from 'pinia';
import { DARK_QUERY, THEME_KEY, parseChoice, resolve } from '@/theme';

const KEY = 'gc.nav.collapsed';

export const useUi = defineStore('ui', {
  state: () => ({
    navCollapsed: (() => {
      try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
    })(),
    /**
     * Light, dark, or the device's (src/theme.js). `systemDark` is the device's
     * current answer, which App.vue keeps live — so "system" follows a laptop
     * that turns dark at sunset without anyone reloading.
     */
    theme: (() => {
      try { return parseChoice(localStorage.getItem(THEME_KEY)); } catch { return 'system'; }
    })(),
    systemDark: (() => {
      try { return window.matchMedia(DARK_QUERY).matches; } catch { return false; }
    })(),
    /** The help panel and the support sheet, opened from any page's top bar. */
    helpOpen: false,
    supportOpen: false,
  }),

  getters: {
    /** What is actually drawn. Anything that paints by theme reads this, not `theme`. */
    dark: (s) => resolve(s.theme, s.systemDark) === 'dark',
  },

  actions: {
    toggleNav() {
      this.navCollapsed = !this.navCollapsed;
      try { localStorage.setItem(KEY, this.navCollapsed ? '1' : '0'); } catch { /* private window */ }
    },

    setTheme(choice) {
      this.theme = parseChoice(choice);
      try { localStorage.setItem(THEME_KEY, this.theme); } catch { /* private window */ }
    },

    openHelp() { this.supportOpen = false; this.helpOpen = true; },
    closeHelp() { this.helpOpen = false; },
    openSupport() { this.helpOpen = false; this.supportOpen = true; },
    closeSupport() { this.supportOpen = false; },
  },
});
