# PokerPad

No-limit Texas Hold'em against five AI opponents, built as an installable PWA for
landscape phones and playable with a game controller (including iOS Safari).

No build step and no dependencies: plain HTML, CSS and ES modules.

## Run

```sh
npm start        # serves on http://localhost:8080
npm test         # engine + AI tests (Node 20+)
```

Any static host works (GitHub Pages: serve the repo root). HTTPS is needed for the
service worker / offline install. On iOS: open in Safari, Share → Add to Home Screen.

## Controls

| Controller | Keyboard | Action |
| --- | --- | --- |
| A | Enter / Space | Confirm focused button, next hand |
| B | Esc / F | Fold, back |
| X | C | Check / call |
| Y | R | Bet / raise (opens bet sizing) |
| D-pad / left stick | Arrows | Move focus; in bet sizing ←→ = 1 BB, ↑↓ = 5 BB |
| LB / RB | Q / E | Jump between bet presets (min, ½ pot, pot, all-in) |
| Start | P | Menu |

Touch works everywhere too. Sound starts after the first tap or key press (a browser rule);
sound and music toggles are in the menu. iOS only exposes a controller to the page after its
first button press.

## Layout

- `js/engine.js` – game rules: blinds, betting rounds, min-raise, side pots, showdown. No DOM.
- `js/cards.js` – deck and 7-card hand evaluator.
- `js/ai.js` – opponents: Chen-formula preflop, Monte Carlo equity vs pot odds postflop, per-player style.
- `js/input.js` – gamepad polling + keyboard → semantic buttons.
- `js/main.js` – rendering, action bar, menus, game loop.
- `js/audio.js` – sound effects, synthesised with WebAudio (no audio files).
- `js/music.js` – the background music: a composed lo-fi groove, also synthesised, that adds layers as a hand develops.
- `js/banter.js` – what each opponent says.
- `js/fx.js` – pops, screen shake, flying chips, particles, rolling numbers, rumble.
- `css/style.css` – flat print-poster look: paper, ink, spot colours, hard shadows.
- `fonts/` – Bricolage Grotesque (SIL Open Font License), bundled so it works offline.
- `sw.js`, `manifest.webmanifest` – offline + install.

## Roadmap

- [x] Stage 1: playable game, AI, controller, PWA shell
- [x] Stage 2: card/chip animations, synthesised sound and music, controller rumble
- [x] Saved progress between hands, automatic pick-up of new versions
- [x] Opponent character: tells, thinking time, banter, play that adapts to you
- [x] Runs: clear a table to climb to a tougher one; best run is remembered
- [x] Big-moment hand feel: all-in odds, river slam, staged reveals
- [x] Settings: speed, stack size, left-handed layout, rumble, table talk
- [x] Lifetime stats and last-hand history
- [x] Visible deck: shuffle, deal, burn cards
- [x] Opponent faces with moods, skip-hand after folding, blinds-up banner
- [x] Coach hints, hand-ranks reference, unlockable card backs
- [x] Real pause, four-colour deck, chip stacks, table venues, how-to-play primer
- [x] End-of-run summary, rule twists on later tables, bigger faces, per-venue music
- [x] Perks, boss fights, table-clear celebration, card squeeze, haptic patterns, daily deal, stickers
- [x] Opponent memory, five new opponents, share cards, quick table, pass-and-play, thrown chips
- [x] Slow-motion showdowns, table talk, difficulty, notebook, hand history with replay, hand review, short deck and Omaha
