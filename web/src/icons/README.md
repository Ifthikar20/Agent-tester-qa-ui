# Icons

Drop a PNG in this folder and the app draws it. Nobody has to change any code
for it — the file's **name** is what connects it to the place it appears.

## The names in use

| file name | where it appears |
|---|---|
| `history.png` | sidebar — Run history |
| `defects.png` | sidebar — Defects |
| `console.png` | sidebar — Console |
| `monitor.png` | sidebar — Agentic monitoring |
| `chat.png` | sidebar — Chat |
| `settings.png` | sidebar — Origins & vault |
| `org.png` | sidebar — Organisation |
| `security.png` | sidebar — Security |
| `suite.png` | a test suite, on cards |

Until a name has a PNG, the app draws its own line-art version of it. The set
can arrive one file at a time; nothing breaks in between.

## The four forms of each

Only the first is required.

```
console.png           the icon
console@2x.png        the same drawing at twice the pixels, for a dense screen
console.dark.png      what to show while the app is in its dark theme
console.dark@2x.png   …and that one at twice the pixels
```

The app picks the right one by itself: the dark file appears only in the dark
theme, and the `@2x` file only on a screen that can show it. If you draw only
`console.dark.png`, it is used in both themes rather than leaving a gap.

## Drawing them

- **Transparent background.** The icon sits on the sidebar, on a hover tint and
  on a selected row, and a white square shows on all three.
- **Export at 2× the largest box it appears in**, then name that file `@2x` and
  export the 1× beside it. The boxes today are 16 px in the sidebar, 20 px in
  the collapsed rail, and 48 px on cards — so the largest is 48, and a
  `suite@2x.png` is 96 × 96.
- The icons are drawn square and are scaled to fit their box, so keep the
  drawing centred with a little air around it.
- One visual weight across the set matters more than any single icon: they are
  seen as a column, not one at a time.

## Getting a new one into the app

Save the file here and start the app (`npm start` from the repository root, or
`npm run build`). The build notices the new file and picks it up — there is no
list to add it to.

To use a **new** name somewhere in the app, save `whatever.png` here and write,
in any template:

```vue
<Icon name="whatever" class="size-12" />
```

`class` sets the size — the icon fills whatever box it is given.
