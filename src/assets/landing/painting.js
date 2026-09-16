/**
 * The painting, from one place.
 *
 * Two pages show it — the landing's canvas (LandingCanvas.vue) and the panel
 * beside every account page (AuthShell.vue) — and they should show the same
 * one. canvas.svg is a drawn stand-in; when the photograph of the real canvas
 * lands beside it, this is the one line that changes. Bundled, because the
 * runner serves this app under `img-src 'self' data: blob:` and would refuse
 * a picture fetched from anywhere else.
 */
export { default as painting } from './canvas.svg';
