/**
 * The agents behind a reply, as the page names them.
 *
 * The runner has tools (chat-tools.js); a person watching a reply being made
 * sees WHO is at work — the defects agent reading the registry, the runner
 * driving a case, the planner drafting checks, the docs agent looking a
 * section up — because that is the shape of the thing: different specialists
 * invoked behind one question. One table maps a tool to the agent that owns
 * it, so the working view (ChatActivity.vue) and the kept badges under a
 * reply (ChatView.vue) name them the same way, and a new tool needs one line.
 */
export const AGENTS = Object.freeze({
  defects:         { name: 'Defects', icon: 'defects' },
  defect:          { name: 'Defects', icon: 'defects' },
  run_history:     { name: 'Run history', icon: 'history' },
  suites:          { name: 'Suites', icon: 'suite' },
  suite:           { name: 'Suites', icon: 'suite' },
  find:            { name: 'Suites', icon: 'suite' },
  pages_scanned:   { name: 'Pages', icon: 'console' },
  monitoring:      { name: 'Monitoring', icon: 'monitor' },
  runner_state:    { name: 'Runner', icon: 'console' },
  run_case:        { name: 'Runner', icon: 'play' },
  run_suite:       { name: 'Runner', icon: 'play' },
  run_page_check:  { name: 'Runner', icon: 'play' },
  scan_page:       { name: 'Planner', icon: 'spark' },
  quickstart:      { name: 'Planner', icon: 'spark' },
  plan_page_tests: { name: 'Planner', icon: 'spark' },
  run_drafts:      { name: 'Runner', icon: 'play' },
  docs:            { name: 'Docs', icon: 'list' },
});

/** The agent a tool belongs to; an unknown tool is the runner's. */
export const agentOf = (tool) => AGENTS[tool] ?? { name: 'Runner', icon: 'console' };

/**
 * What the mind is doing before any agent has been asked, as loading text
 * that moves: one line a beat, so a wait reads as work rather than a hang.
 */
export const THINKING = Object.freeze([
  'Understanding the question…',
  'Deciding which agent to ask…',
  'Reading the records…',
  'Putting an answer together…',
]);
