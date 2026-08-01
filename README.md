# Brief of the Future — the website

A plain static site. No build step, no framework, no npm install. `index.html`
is the whole page; the browser loads the CSS and JS files directly. To work on
it, run a local server from the project root and open the address it prints:

```bash
npx --yes http-server site -c-1
```

Opening `index.html` by double-clicking mostly works, but videos and fonts
behave differently over `file://`, so use the server when checking anything
that moves.

## What each file does

| File | Job |
| --- | --- |
| `index.html` | Every section of the page, in order, top to bottom. |
| `css/style.css` | All styling. Section by section, in the same order as the HTML. |
| `js/main.js` | The page's behaviour: preloader, menu, cursor, scroll animations, the film section. |
| `js/splash-cursor.js` | The fluid simulation behind the hero. |
| `js/laser-flow.js` | The light beam effect. |
| `js/lamp-alpha.js` | The hanging lamp, drawn to a canvas so its background can be transparent. |
| `js/magic-bento.js` | The glow that follows your cursor across the pricing cards. |
| `js/process-map.js` | The connected-boxes diagram in the process section. |
| `js/line-sidebar.js` | The section markers down the left edge. |
| `js/variable-proximity.js` | Letters that thicken as the cursor nears them. |

Every JS file is loaded by a `<script>` tag at the bottom of `index.html`.
Nothing loads dynamically. If a file is not in that list, it is not running.

## The assets folder

Only ten files, and every one is in use:

| File | Used by |
| --- | --- |
| `film.mp4` | The full 60s brand film with sound. Plays when SOUND ON is pressed. |
| `film-loop.mp4` | The silent 46s cut that loops in the film section by default. |
| `film-poster.jpg` | The still shown before the film loads. |
| `work-bg.mp4` | Background of the services section. |
| `lamp2.mp4` / `.webm` | The lamp. |
| `museum2.jpg` | The gallery wall the film docks into. |
| `logo.webp` | The mark in the nav. |
| `favicon.png`, `apple-touch-icon.png` | Browser tab and phone home screen. |

Both film files come from `../video`. See that folder's README before
replacing them, especially the colour section, because getting it wrong
produces a video that reports the right duration and never shows a picture.

## Two rules that keep this tidy

**1. After changing any CSS or JS, bump the version.** Every link in
`index.html` ends with `?v=20260801a`. Browsers cache aggressively, so without
a bump you will keep seeing the old file and think your change did nothing.
All of them share one value on purpose: find and replace `?v=20260801a` with
today's date plus a letter, everywhere in `index.html`, and you are done.

**2. When you stop using a file, move it out, don't leave it.** There is an
`_archive/` folder at the project root for that. On 1 Aug 2026 this folder
held four JS files that nothing loaded and nine media files that only those
dead scripts referenced, about 32 MB of it. None of it was obviously dead from
the outside, which is exactly the problem.

To check nothing has rotted since, from the `site` folder:

```bash
for f in assets/*.*; do n=$(basename "$f"); echo "$(grep -rl "$n" index.html css/ js/ | wc -l) $n"; done | sort -n
```

Anything printing `0` is referenced by nothing and can be archived.
