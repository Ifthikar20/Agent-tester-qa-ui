/**
 * The HTTP surface, in one place.
 *
 * Every call funnels through `req`, which turns a non-2xx into a thrown Error
 * carrying the server's own message — so a view can `catch (e) { this.error =
 * e.message }` and show the same words the server chose, rather than "Request
 * failed". Seven statuses are worth naming on the error object, because each
 * is the app asking a person for something rather than reporting a fault: a
 * 409 with `needsOrigin` wants a decision, a 409 `runner_busy` wants patience
 * (another organisation has the browser), a 403 `step_up_required` wants a
 * fresh sign-in, a 403 `forbidden` wants an owner or admin, a 402
 * `entitlement` wants a bigger plan, a 409 `chat_busy` wants the reply being
 * written to finish, and a 403 `switched_off` wants nothing at all — the
 * operator turned the feature off. The view offers the right button — or the
 * right sentence — instead of a red box. And the parsed answer rides along as
 * `err.body` for the few refusals that carry more than a sentence: a compile
 * the runner would not send to Claude (409 `no_model`, 429 `budget`, 503
 * `unavailable`) says why in `message` and hands back the mock's `spec`, so
 * the panel still has checks to show.
 *
 * Every path goes through `apiUrl`, which is the identity function while the
 * backend serves this app and a real origin once it does not. Writing the
 * paths bare would work today and fail silently the day the frontend is
 * deployed on its own — as 404s from a static host, which look like a broken
 * API rather than a missing one.
 */
import { apiUrl } from '@/config';
import { useSession } from '@/stores/session';

async function req(path, { method = 'GET', body } = {}) {
  // null whenever there is no control plane, and then no header is sent and
  // the runner — also unauthenticated — does not ask for one.
  const token = await useSession().executorToken().catch(() => null);

  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* 204, or a proxy in the way */ }
  if (!res.ok) {
    // A 401 from the RUNNER means the token is spent, not that the person is
    // signed out — their Django session may be perfectly good. Dropping the
    // cached token makes the next call mint a fresh one instead of retrying a
    // dead one until someone reloads the page.
    if (res.status === 401) useSession().forgetToken();
    const err = new Error(data.error || `${method} ${path} failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    if (data.needsOrigin) err.needsOrigin = data.needsOrigin;
    // The plan said no (docs/AUTH.md §10): which limit, and which plan it is.
    if (res.status === 402 && data.error === 'entitlement') {
      err.entitlement = { limit: data.limit, plan: data.plan };
      err.message = `Your ${data.plan ?? 'current'} plan does not allow this (${data.limit ?? 'limit reached'})`;
    }
    // One browser, one driving organisation (docs/AUTH.md §10): someone
    // else has it, and the honest answer is to say so and wait.
    if (res.status === 409 && data.error === 'runner_busy') {
      err.busy = { org: data.org ?? null };
      err.message = 'Another organisation is driving the runner right now — try again when it is free';
    }
    // One reply at a time per organisation (the chat): the runner names the
    // turn it is writing, and the page waits for that rather than retrying.
    if (res.status === 409 && data.error === 'chat_busy') {
      err.chatBusy = { turnId: data.turnId ?? null, conversationId: data.conversationId ?? null };
      err.message = 'A reply is still being written — wait for it to finish';
    }
    // The operator turned this off for the whole deployment: no plan and no
    // role would change the answer, so a view says so rather than offering a
    // retry. `switchedOff` names the switch, e.g. 'runner.chat'.
    if (res.status === 403 && data.error === 'switched_off') {
      err.switchedOff = data.switch ?? null;
      err.message = data.message || `${data.switch ?? 'This'} is turned off on this deployment`;
    }
    // Origins and the vault are an owner's or admin's to change.
    if (res.status === 403 && data.error === 'forbidden') {
      err.forbidden = true;
      err.message = 'Only an owner or admin of this organisation can do that';
    }
    // Allowing an origin wants a recent proof of the strongest factor the
    // account has (docs/AUTH.md §9): the view opens the reauthentication
    // sheet, forgets the token so the next one carries a fresh `su`, and
    // retries. The words are for the rare caller with no sheet.
    if (res.status === 403 && data.error === 'step_up_required') {
      err.stepUp = true;
      err.message = 'Allowing an origin needs a recent sign-in — confirm it is you, then retry';
    }
    throw err;
  }
  return data;
}

/**
 * A binary body, with the same token the JSON calls use.
 *
 * An `<img src>` cannot carry an Authorization header, so a gated image has to
 * be fetched and turned into a blob URL — the same thing ConsoleView does with
 * screencast frames. Returns null rather than throwing: a missing icon is the
 * normal case, not an error worth a red box.
 */
async function bytes(path) {
  const token = await useSession().executorToken().catch(() => null);
  try {
    const res = await fetch(apiUrl(path), {
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 401) useSession().forgetToken();
    if (!res.ok) return null;
    return await res.blob();
  } catch { return null; }
}

export const api = {
  state:   () => req('/api/state'),
  // A 30-second, single-use ticket the socket is opened with, so the token
  // itself never goes into a URL (docs/AUTH.md §9).
  socketTicket: () => req('/api/socket-ticket', { method: 'POST' }),
  runs:    (suite) => req(`/api/runs${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`),
  defects: () => req('/api/defects'),
  hero:    () => req('/api/hero'),
  siteIcon: (origin) => bytes(`/api/sites/icon?origin=${encodeURIComponent(origin)}`),

  origins:      () => req('/api/origins'),
  allowOrigin:  (origin) => req('/api/origins', { method: 'POST', body: { origin } }),
  removeOrigin: (origin) => req('/api/origins', { method: 'DELETE', body: { origin } }),

  suites:      () => req('/api/suites'),
  cases:       () => req('/api/cases'),
  quickstart:  (url) => req('/api/suites/quickstart', { method: 'POST', body: { url } }),
  suite:       (id) => req(`/api/suites/${id}`),
  createSuite: (body) => req('/api/suites', { method: 'POST', body }),
  updateSuite: (id, body) => req(`/api/suites/${id}`, { method: 'PATCH', body }),
  deleteSuite: (id) => req(`/api/suites/${id}`, { method: 'DELETE' }),

  addPage:    (id, body) => req(`/api/suites/${id}/pages`, { method: 'POST', body }),
  updatePage: (id, pid, body) => req(`/api/suites/${id}/pages/${pid}`, { method: 'PATCH', body }),
  removePage: (id, pid) => req(`/api/suites/${id}/pages/${pid}`, { method: 'DELETE' }),
  scanPage:   (id, pid) => req(`/api/suites/${id}/pages/${pid}/scan`, { method: 'POST' }),
  pageCheck:  (id, pid) => req(`/api/suites/${id}/pages/${pid}/check`),

  addCase:    (id, body) => req(`/api/suites/${id}/cases`, { method: 'POST', body }),
  updateCase: (id, cid, body) => req(`/api/suites/${id}/cases/${cid}`, { method: 'PATCH', body }),
  removeCase: (id, cid) => req(`/api/suites/${id}/cases/${cid}`, { method: 'DELETE' }),

  runSuite:   (id, caseId, pace) => {
    const q = new URLSearchParams();
    if (caseId) q.set('case', caseId);
    // Only when it is actually chosen — an absent pace means "the server's
    // default", which is not the same as any number this app could guess.
    if (pace !== undefined) q.set('pace', String(pace));
    return req(`/api/suites/${id}/run${q.size ? `?${q}` : ''}`, { method: 'POST' });
  },

  // Agentic monitoring: the runner's monitors, incidents and screenshot clips.
  // A clip is bytes behind the gate, so it comes back as a Blob (Shot.vue).
  monitoring:      () => req('/api/monitoring'),
  // ?suite= narrows both to a project's own (the suite it was made from, or the
  // suite whose origin the monitored page is on).
  monitors:        (suite) => req(`/api/monitors${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`),
  createMonitor:   (body) => req('/api/monitors', { method: 'POST', body }),
  // The checks a rule would compile to, before the monitor exists — the
  // script shown under the sentence as it is typed. Nothing is kept.
  previewMonitor:  (body) => req('/api/monitors/preview', { method: 'POST', body }),
  // The same sentence compiled by Claude, on request and from the daily
  // budget, so what the model makes of it is seen before the monitor exists.
  // A refusal throws with `err.body.message` and the mock's `err.body.spec`.
  compileMonitor:  (body) => req('/api/monitors/compile', { method: 'POST', body }),
  removeMonitor:   (id) => req(`/api/monitors/${id}`, { method: 'DELETE' }),
  pauseMonitor:    (id) => req(`/api/monitors/${id}/pause`, { method: 'POST' }),
  resumeMonitor:   (id) => req(`/api/monitors/${id}/resume`, { method: 'POST' }),
  incidents:       (status, suite) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (suite) q.set('suite', suite);
    return req(`/api/incidents${q.size ? `?${q}` : ''}`);
  },
  resolveIncident: (id) => req(`/api/incidents/${id}/resolve`, { method: 'POST' }),
  monitorShot:     (name) => bytes(`/api/monitors/shots/${encodeURIComponent(name)}`),

  // Help & support: a request from the top bar, and the access switch it turns on.
  support:        () => req('/api/support'),
  requestSupport: (body) => req('/api/support/request', { method: 'POST', body }),
  disableSupport: () => req('/api/support/access', { method: 'DELETE' }),

  // Chat: a conversation with the runner about what it knows (stores/chat.js).
  // A turn is a 202 — the reply is written on the socket as chat.* events,
  // because an answer that runs a case takes as long as the case does. An
  // older runner has none of these routes and answers 404, which the store
  // reads as "not offered" rather than as a fault.
  chat:             () => req('/api/chat'),
  chatConversation: (id) => req(`/api/chat/${encodeURIComponent(id)}`),
  chatTurn:         (body) => req('/api/chat/turns', { method: 'POST', body }),
  deleteChat:       (id) => req(`/api/chat/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
