import { createRouter, createWebHistory } from 'vue-router';
import { safeNext, useSession } from '@/stores/session';
import { useLive } from '@/stores/live';
import { api } from '@/api';

/**
 * Routes mirror the sidebar, and every one of them is linkable — a suite page
 * you can paste into a ticket is most of what makes this feel like a product
 * rather than a demo.
 *
 * `meta.open` marks the pages that render with nobody signed in: sign in, sign
 * up, the code, the reset, and the invitation landing. The control plane's
 * mails link straight to them (auth/config/settings.py HEADLESS_FRONTEND_URLS),
 * so their paths are a contract, not a choice.
 */
const routes = [
  // The front door, and the only page that renders for someone with no account.
  // `anonymousOnly` sends a signed-in arrival to the prompt, and with no control
  // plane configured the guard does the same — a landing page advertising a
  // sign-in that does not exist would be a dead end.
  { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue'),
    meta: { open: true, anonymousOnly: true } },
  /**
   * The first run: a workspace nobody has named yet.
   *
   * Its own route rather than a modal over the app, because there is no app to
   * put it over — the sidebar's first line is the workspace's name, and
   * everything under it belongs to a workspace. It renders on its own, with no
   * shell (App.vue), for the same reason.
   */
  { path: '/welcome', name: 'welcome', component: () => import('@/views/WelcomeView.vue') },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
  { path: '/suites', name: 'suites', component: () => import('@/views/SuitesView.vue') },
  { path: '/suites/new', name: 'suite-new', component: () => import('@/views/OnboardView.vue') },
  {
    path: '/suites/:id',
    component: () => import('@/views/SuiteView.vue'),
    props: true,
    children: [
      { path: '', name: 'suite', component: () => import('@/views/SuiteOverview.vue') },
      { path: 'pages', name: 'suite-pages', component: () => import('@/views/SuitePages.vue') },
      { path: 'cases', name: 'suite-cases', component: () => import('@/views/SuiteCases.vue') },
      // The same cases as what they do, rather than as the document they are stored in.
      { path: 'tests', name: 'suite-tests', component: () => import('@/views/SuiteTests.vue') },
      // And one of them, on its own page: the steps as a flow, the runs it has
      // had, and the button that runs it. A test is a thing you link somebody
      // to, like a defect (/defects/DEF-2609-007) — so it has an address.
      { path: 'tests/:testId', name: 'suite-test', component: () => import('@/views/SuiteTest.vue') },
      { path: 'runs', name: 'suite-runs', component: () => import('@/views/SuiteRuns.vue') },
      // What the project IS, rather than what it holds: its name, its id, the
      // address it is about, what the runner should know before it decides
      // anything here — and the one page from which it can be deleted.
      { path: 'settings', name: 'suite-settings', component: () => import('@/views/SuiteSettings.vue') },
    ],
  },
  // The list, and the list with one defect's drawer open (/defects/DEF-2609-007): a number is a link.
  { path: '/defects/:id?', name: 'defects', component: () => import('@/views/DefectsView.vue') },
  { path: '/console', name: 'console', component: () => import('@/views/ConsoleView.vue') },
  // Watch an element on the driven page against a rule in plain English.
  { path: '/monitoring', name: 'monitoring', component: () => import('@/views/MonitoringView.vue') },
  // What the monitors caught. Its own page: reading what has happened is a
  // different errand from setting up what to watch.
  { path: '/monitoring/incidents', name: 'incidents', component: () => import('@/views/IncidentsView.vue') },
  { path: '/chat', name: 'chat', component: () => import('@/views/ChatView.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  // The organisation you act for (docs/AUTH.md §10): members, roles,
  // invitations, the plan and how much of it the runner counts as used.
  { path: '/organisation', name: 'organisation', component: () => import('@/views/OrganizationView.vue') },

  // The account pages (docs/AUTH.md §4, §5, §7).
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { open: true, anonymousOnly: true } },
  // The second factor after a password (docs/AUTH.md §5): open, because
  // nobody is signed in until the code lands.
  { path: '/login/mfa', name: 'mfa', component: () => import('@/views/MfaChallengeView.vue'), meta: { open: true, anonymousOnly: true } },
  { path: '/signup', name: 'signup', component: () => import('@/views/SignupView.vue'), meta: { open: true, anonymousOnly: true } },
  { path: '/verify', name: 'verify', component: () => import('@/views/VerifyView.vue'), meta: { open: true } },
  { path: '/forgot-password', name: 'forgot-password', component: () => import('@/views/ForgotPasswordView.vue'), meta: { open: true, anonymousOnly: true } },
  // ?key=, not /:key — the edge's access log can delete a query parameter
  // and cannot redact a path segment (docker/Caddyfile, [ops-supply-4]).
  { path: '/reset-password', name: 'reset-password', component: () => import('@/views/ResetPasswordView.vue'), meta: { open: true } },
  { path: '/invite', name: 'invite', component: () => import('@/views/InviteView.vue'), meta: { open: true } },
  { path: '/security', name: 'security', component: () => import('@/views/SecurityView.vue') },
  { path: '/security/password', name: 'security-password', component: () => import('@/views/ChangePasswordView.vue') },
  { path: '/security/email', name: 'security-email', component: () => import('@/views/ChangeEmailView.vue') },
  // Where a 403 mfa_required sends you: the account has to enrol an
  // authenticator before the control plane lets it do anything else. Also
  // where Security sends you to add one by choice.
  { path: '/security/mfa', name: 'security-mfa', component: () => import('@/views/SecurityMfaView.vue') },
  { path: '/security/sessions', name: 'security-sessions', component: () => import('@/views/SessionsView.vue') },
  // The prompt is where a person lands: describing what to test in words is
  // the front door, and the suites are what that produces.
  { path: '/:rest(.*)', redirect: '/chat' },
];

const router = createRouter({
  history: createWebHistory('/app/'),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * Nothing renders until we know who you are.
 *
 * `boot()` resolves once and is cheap afterwards, but the await matters on a
 * cold load: without it the first navigation decides against `user === null`
 * before /auth/me has answered, so a signed-in person sees the login form
 * flash and then get replaced. Waiting once is better than that.
 *
 * With no control plane configured, `required` is false and this is a no-op —
 * the guard never redirects and the account pages are unreachable.
 */
/**
 * Has anybody said what this workspace is called?
 *
 * Asked of the runner once and remembered, because it gates every navigation
 * and the answer only changes when somebody answers it. The live store is
 * preferred whenever it has one: the socket's greeting carries the workspace,
 * and the first-run flow writes the saved answer straight into it — so
 * finishing the flow is seen here immediately rather than bouncing off a
 * cached "no" all the way back to /welcome.
 *
 * A runner that will not answer is treated as named. A first-run screen shown
 * because the network hiccuped would be worse than one never shown at all.
 */
let asked = null;
async function workspaceNamed() {
  const live = useLive();
  if (live.workspace) return live.workspace.named;
  asked ??= api.workspace().then((r) => r.workspace).catch(() => ({ named: true }));
  return (await asked).named;
}

router.beforeEach(async (to) => {
  const session = useSession();
  if (!session.ready) await session.boot();
  /**
   * The first run, and only where it is this runner's question to ask.
   *
   * With a control plane the organisation was named when somebody signed up,
   * and identity is the control plane's (docs/AUTH.md §10) — asking again here
   * would be a second source for one fact. With none there is nobody to ask,
   * so the runner asks.
   */
  if (!session.required && to.name !== 'welcome' && !(await workspaceNamed())) return { name: 'welcome' };
  /**
   * And once it is past, it is OFF.
   *
   * A first run is a thing you do once. Left reachable, `/welcome` is a page
   * that offers to rename the workspace and add "the first site to test" to
   * somebody who has six — and worse, it is reachable by typing the address,
   * which means it is reachable by a stale bookmark and by the back button
   * immediately after finishing it. Closing the route is the only way to say
   * "done"; leaving it open and merely not linking to it is not the same
   * thing, and the difference shows up the first time somebody presses Back.
   *
   * Renaming lives in Settings, and adding a project on /suites/new. Both are
   * ordinary pages that stay, which is why nothing is lost by shutting this.
   */
  if (to.name === 'welcome' && (session.required || await workspaceNamed())) return '/chat';
  if (!session.required) return to.meta.open ? '/chat' : true;
  if (session.signedIn) {
    // The password that signed in is breached: one page, until it changes.
    if (session.mustChangePassword && to.name !== 'security-password') return { name: 'security-password' };
    // The policy demands an authenticator and there is none: the control
    // plane refuses everything but enrolment (docs/AUTH.md §5.4), so the
    // enrolment page and the changes it allows are the only places to be.
    if (session.mfa.required && !session.mfa.enrolled
        && !['security-mfa', 'security-password'].includes(to.name)) return { name: 'security-mfa' };
    // A signed-in arrival at an anonymous-only page is the return from a
    // Google sign-in landing on /login (docs/AUTH.md §6): the session is
    // already there, so go where the person was headed — a path inside
    // this app, or the prompt.
    return to.meta.anonymousOnly ? (safeNext(to.query.next) || '/chat') : true;
  }
  if (to.meta.open) return true;
  // A code is waiting to be entered (a reload mid-sign-up): that screen, not the form.
  if (session.flow === 'verify_email' && to.name !== 'verify') return { name: 'verify' };
  // The password landed and the second factor did not, yet (a reload mid-sign-in).
  if (session.flow === 'mfa_authenticate' && to.name !== 'mfa') return { name: 'mfa' };
  // Remember where they were going; the form sends them back after.
  return { name: 'login', query: to.fullPath === '/chat' ? {} : { next: to.fullPath } };
});

export default router;
