# Pad Poker

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

Touch works everywhere too. iOS only exposes a controller to the page after its
first button press.

## Layout

- `js/engine.js` – game rules: blinds, betting rounds, min-raise, side pots, showdown. No DOM.
- `js/cards.js` – deck and 7-card hand evaluator.
- `js/ai.js` – opponents: Chen-formula preflop, Monte Carlo equity vs pot odds postflop, per-player style.
- `js/input.js` – gamepad polling + keyboard → semantic buttons.
- `js/main.js` – rendering, action bar, menus, game loop.
- `sw.js`, `manifest.webmanifest` – offline + install.

## Roadmap

- [x] Stage 1: playable game, AI, controller, PWA shell
- [ ] Stage 2: chip/card animations, sound, haptics
- [ ] Stage 3: saved progress, settings (table size, speed, stacks), stats
- [ ] Stage 4: stronger AI (position, ranges, bet-sizing tells)
