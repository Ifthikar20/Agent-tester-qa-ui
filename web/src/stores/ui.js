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
const DOCK_TAB = 'gc.dock.tab';
const DOCK_OPEN = 'gc.dock.open';
const DOCK_HEIGHT = 'gc.dock.height';
/**
 * The tabs of the console's dock, in the order the strip shows them. The one
 * list: the view draws it, the store validates a remembered choice against it.
 */
export const DOCK_TABS = ['run', 'log', 'nav', 'console', 'script', 'targets'];
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
    /**
     * The dock along the bottom of the console: which tab is showing, whether
     * it is open or folded down to its tabs, and how tall it was dragged.
     *
     * Folded until this viewer opens it or a run starts. Open from the first
     * visit, it sat over the Open and Record buttons on a laptop-height window
     * before there was anything in it to read — and folded is not hidden: the
     * tabs stay on screen, with the run's result and the error counts on them.
     */
    dockTab: (() => {
      // Only a tab the dock has; a value from another version falls back to the run.
      try { const v = localStorage.getItem(DOCK_TAB); return DOCK_TABS.includes(v) ? v : 'run'; } catch { return 'run'; }
    })(),
    dockOpen: (() => {
      try { return localStorage.getItem(DOCK_OPEN) === '1'; } catch { return false; }
    })(),
    dockHeight: (() => {
      try { return Number(localStorage.getItem(DOCK_HEIGHT)) || 260; } catch { return 260; }
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

    /** Pick a tab. Picking the one already showing folds the dock down to its tabs. */
    showDock(tab) {
      if (this.dockOpen && this.dockTab === tab) this.dockOpen = false;
      else { this.dockTab = tab; this.dockOpen = true; }
      this.keepDock();
    },

    toggleDock() {
      this.dockOpen = !this.dockOpen;
      this.keepDock();
    },

    /** Bring a tab forward, open. For a run starting, which should never fold anything. */
    reveal(tab) {
      this.dockTab = tab;
      this.dockOpen = true;
      this.keepDock();
    },

    /**
     * Size the dock without keeping it: a drag calls this on every move and
     * keeps once at the end. Never shorter than a few lines, never taller than
     * most of the window — the page it sits over still has to be usable.
     */
    sizeDock(px) {
      this.dockHeight = Math.round(Math.min(Math.max(px, 96), Math.max(96, window.innerHeight * 0.6)));
    },

    keepDock() {
      try {
        localStorage.setItem(DOCK_TAB, this.dockTab);
        localStorage.setItem(DOCK_OPEN, this.dockOpen ? '1' : '0');
        localStorage.setItem(DOCK_HEIGHT, String(this.dockHeight));
      } catch { /* private window */ }
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
