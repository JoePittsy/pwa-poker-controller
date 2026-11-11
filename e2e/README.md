# Browser tests

These drive the real game in headless Chromium, with several browsers at one table for the online ones.
They are separate from `npm run check` because they take minutes and need a browser.

```
cd e2e
npm install
npx playwright install chromium   # once
npm run all                       # or: bash run.sh online-disconnect
```

`run.sh` serves the site on port 8080 and starts a local relay on port 1884 (the scripts point the game
at it, so nothing touches the public relays). Each script prints what it saw; read the output rather than
an exit code.

| Script | What it covers |
| --- | --- |
| `layout-iphone` | Nothing overlaps or runs off screen at iPhone 14 landscape size. Arguments are: output folder, width, height (`run.sh` passes `shots 750 369`) |
| `first-run` | A new player's first minutes: taps to the first decision, hands advancing by themselves, and the hand label never naming a card before it has turned |
| `single-player-soak` | A run plays on hand after hand without errors |
| `run-deal-shop-route` | A run from the deal picker through a cleared table, the shop, the route choice, a reload and a bust |
| `run-walk-away-and-speed` | Walking away once half the table is out, and the bonus for a fast clear |
| `replay` | A recorded hand plays back and the live game resumes exactly |
| `pass-and-play` | Players sharing a device never see each other's cards |
| `backup` | A backup made on one device restores on another |
| `online-disconnect` | Turn timer, pause on disconnect, rejoin, replace with a computer player |
| `online-spectators` | Spectators get no hole cards before a showdown |
| `online-chat` | Faces, quick lines and typed messages reach everyone as plain text |
| `online-snooping` | A listener on the relay reads nothing; forged and replayed actions are ignored |
| `online-host-takeover` | The host vanishes mid-hand; a guest takes over and the others follow with every chip accounted for |
| `online-standings` | Finishing order, room standings across two games, and the history screen |
| `tables-and-bankroll` | Cash game (including closing the app mid-session), sit-and-go and the heads-up ladder |
| `online-rebuy-and-late-seat` | A spectator takes a computer player's seat mid-game; a busted player buys back in |
| `online-six-players` | Six players, on a clean relay and with 20% of messages dropped and 20% delayed |
