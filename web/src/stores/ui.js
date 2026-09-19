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
const CHATS_KEY = 'gc.nav.chats';
/**
 * Below Tailwind's `md` the sidebar starts as its rail: on a phone the expanded
 * 248px would leave a third of the screen for the page. A stored choice wins
 * either way — toggleNav writes '1' and '0', so '0' is a choice too — and it
 * is read once, at load: turning a phone does not re-decide.
 */
const NARROW_QUERY = '(max-width: 767px)';

export const useUi = defineStore('ui', {
  state: () => ({
    navCollapsed: (() => {
      try {
        const saved = localStorage.getItem(KEY);
        if (saved === '1' || saved === '0') return saved === '1';
      } catch { /* private window */ }
      try { return window.matchMedia(NARROW_QUERY).matches; } catch { return false; }
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
    /** The recent chats under Chat in the sidebar, open unless this viewer folded them. */
    chatsOpen: (() => {
      try { return localStorage.getItem(CHATS_KEY) !== '0'; } catch { return true; }
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

    toggleChats() {
      this.chatsOpen = !this.chatsOpen;
      try { localStorage.setItem(CHATS_KEY, this.chatsOpen ? '1' : '0'); } catch { /* private window */ }
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
