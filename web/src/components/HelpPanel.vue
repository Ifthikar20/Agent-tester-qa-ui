<script setup>
/**
 * Help, in the page: what this product is, the questions people ask first,
 * where the written documentation is, and how to reach a person.
 *
 * A panel that slides in over the page rather than a separate page, because
 * the question usually arrives in the middle of something — a run that
 * refused an origin, a canvas that is black — and the answer should not cost
 * the place you were. Escape and the scrim close it; the documentation opens
 * in a new tab, so this app stays where it was.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { useUi } from '@/stores/ui';

const ui = useUi();

/**
 * Where the written documentation lives: this repository, on the branch this
 * UI ships from. One place to change when the docs move.
 */
const DOCS = 'https://github.com/Ifthikar20/poc-qa-stack/blob/Feature/September-26';
const LINKS = [
  { label: 'README — how ghostclick works, end to end', href: `${DOCS}/README.md` },
  { label: 'Setup — running it on a laptop, or with sign-in', href: `${DOCS}/SETUP.md` },
  { label: 'Sign-in, organisations and plans', href: `${DOCS}/docs/AUTH.md` },
  { label: 'Deploying to a server', href: `${DOCS}/docs/DEPLOY.md` },
  { label: 'The line between the UI, the runner and the control plane', href: `${DOCS}/docs/BOUNDARY.md` },
];

const FAQ = [
  { q: 'What is a suite?', a: 'A project you have onboarded: the pages it has and the cases that drive them. Suites live in suites/<organisation>/ on the runner and belong in git; run history stays on the runner.' },
  { q: 'How do I record a test?', a: 'Console → paste a URL and press Open → Record → click, type and scroll on the video → Stop. "Use as script" puts the recording in the script box; opening the console from a suite lets you save it straight in as a case.' },
  { q: 'Why did a run refuse an address?', a: 'Every goto is checked against the organisation’s allowed origins, and only a person can allow one (Origins & vault, owners and admins). A different host or scheme is a different origin: allowing example.com does not allow www.example.com.' },
  { q: 'Where do passwords and secrets go?', a: 'In the vault. A step says $NAME and the runner fills the value at the moment it types; the value never reaches this page, the log, a script or a diagram. Set them in .ghostclick/<organisation>/secrets.json on the runner, or GC_SECRET_NAME on a laptop.' },
  { q: 'What does Agentic monitoring do?', a: 'Pick an element on the page and write a rule in plain English — "font size must not exceed 18px", "must keep exactly 5 rows". The runner watches it on every change and opens an incident with before/after clips, the numbers and a verdict; when the page recovers, the incident closes itself.' },
  { q: 'Why is the canvas black or blank?', a: 'It says which kind of waiting this is: the runner is connecting, nothing is open yet, another organisation is driving, or the first frame has not arrived. Paste a URL and press Open; a page sitting still sends no frames until something moves, so "Ask for a frame" fetches one.' },
  { q: 'Can I use a dark theme?', a: 'Yes — Origins & vault → Appearance: Light, Dark, or follow this device. It is remembered by this browser, not by the account.' },
  { q: 'Who sees a support request?', a: 'It is stored on the runner and read by whoever operates it, and it turns on support access for your organisation so they know you are happy to be looked at. The same button turns it off again.' },
];

function onKey(e) { if (e.key === 'Escape') ui.closeHelp(); }
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="fixed inset-0 z-30 flex justify-end bg-ink/40" @click.self="ui.closeHelp()">
    <aside class="flex h-full w-full max-w-md flex-col border-l border-hairline bg-panel shadow-2xl"
           role="dialog" aria-modal="true" aria-labelledby="help-title">
      <header class="flex items-center gap-3 border-b border-hairline px-5 py-4">
        <h2 id="help-title" class="text-[16px] font-medium">Help</h2>
        <span class="text-[12.5px] text-ink-3">Answers first, documentation second, a person third.</span>
        <button type="button" class="ml-auto grid size-8 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                aria-label="Close help" title="Close (Esc)" @click="ui.closeHelp()">
          <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p class="eyebrow mb-2">Questions people ask first</p>
        <div class="divide-y divide-hairline rounded-xl border border-hairline">
          <details v-for="f in FAQ" :key="f.q" class="group px-4 py-3">
            <summary class="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-medium marker:content-none">
              <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 text-ink-3 transition-transform group-open:rotate-90"
                   fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 4l4 4-4 4" />
              </svg>
              {{ f.q }}
            </summary>
            <p class="mt-2 pl-5.5 text-[13px] leading-relaxed text-ink-2">{{ f.a }}</p>
          </details>
        </div>

        <p class="eyebrow mb-2 mt-6">Documentation</p>
        <ul class="divide-y divide-hairline rounded-xl border border-hairline">
          <li v-for="l in LINKS" :key="l.href">
            <a :href="l.href" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-3 text-[13.5px] hover:bg-ink/[0.03]">
              <span class="min-w-0 flex-1">{{ l.label }}</span>
              <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 3.5h6.5V10M12.5 3.5 4 12" />
              </svg>
            </a>
          </li>
        </ul>

        <p class="eyebrow mb-2 mt-6">Reach a person</p>
        <div class="card p-4">
          <p class="text-[13.5px] font-medium">Request support</p>
          <p class="mt-1 text-[13px] leading-relaxed text-ink-2">
            Tell us what you are trying to do and what happened. Sending a request turns on support
            access for your organisation, so whoever operates this runner knows to look.
          </p>
          <button type="button" class="mt-3 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-deep"
                  @click="ui.closeHelp(); ui.openSupport()">Request support</button>
        </div>
      </div>
    </aside>
  </div>
</template>
