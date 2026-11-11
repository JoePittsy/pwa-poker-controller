#!/usr/bin/env bash
# Starts the site and a local relay, then runs each browser script in turn and prints what it reports.
# The scripts print their findings for a person to read; a line saying "errors []" means the page raised none.
cd "$(dirname "$0")"
(cd .. && python3 -m http.server 8080 >/dev/null 2>&1) & SITE=$!
node relay.cjs >/dev/null 2>&1 & RELAY=$!
trap 'kill $SITE $RELAY 2>/dev/null' EXIT
sleep 2
mkdir -p shots
for t in ${@:-layout-iphone single-player-soak run-deal-shop-route run-walk-away-and-speed replay pass-and-play backup online-disconnect online-spectators online-chat online-snooping online-standings online-host-takeover online-rebuy-and-late-seat tables-and-bankroll online-six-players}; do
  echo "== $t"
  case $t in
    layout-iphone) timeout 200 node layout-iphone.cjs shots 750 369 ;;
    online-six-players) timeout 300 node online-six-players.cjs 0 && timeout 300 node online-six-players.cjs 0.2 ;;
    *) timeout 300 node "$t.cjs" shots ;;
  esac
done
