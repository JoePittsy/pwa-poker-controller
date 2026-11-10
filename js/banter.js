// What the opponents say. Keyed by player name, then by moment.
export const LINES = {
  Mav: {
    again: ['You again! Round two!', 'Missed me?'], revenge: ['Payback! Ha!', "That's for last time."],
    allin: ['YOLO!', 'All of it. Why not?', "Let's dance!"],
    win: ['Too easy!', 'Chaos pays.', 'Ha! Again!'],
    bluffed: ['Had nothing. Loved it.', 'You folded THAT?', 'Never had it.'],
    steal: ['Mine now.', 'Thanks for the chips!'],
    lose: ['Worth it.', 'I regret nothing.', 'Eh. Easy come.'],
    bust: ['What a ride!', 'Totally worth it.'],
    tank: ['Ooh, tempting…', 'Should I? I should.'],
  },
  Dot: {
    again: ['I have adjusted my model of you.', 'I took notes.'], revenge: ['As revised.', 'I learned from last time.'],
    allin: ["I've done the maths.", "I'm sure this time.", 'Oh dear. All in.'],
    win: ['As calculated.', 'Patience pays.', 'Lovely.'],
    bluffed: ["…don't tell anyone.", 'My heart is racing.'],
    steal: ["I'll take that, thanks."],
    lose: ['That was unlikely.', 'I ran the numbers…', 'Oh, bother.'],
    bust: ['Statistically unfair.', 'I played it right!'],
    tank: ['Let me think…', 'One moment, please.'],
  },
  Rex: {
    again: ["I don't forget.", 'You. Again.'], revenge: ['Now we are even.', 'Told you I would be back.'],
    allin: ['Pay up.', 'Your move.', 'All in. Scared?'],
    win: ['Like clockwork.', 'Feed me.', 'Next.'],
    bluffed: ['Smelled the fear.', 'You blinked.'],
    steal: ['Weak.', 'Thought so.'],
    lose: ['Lucky.', 'Enjoy it while it lasts.', 'Noted.'],
    bust: ["This table's rigged.", "I'll be back."],
    tank: ['Interesting…', 'What are you hiding?'],
  },
  Ivy: {
    again: ["I'm not folding to you this time!", 'Hi again!'], revenge: ['Ha! Got you back!', 'See? I stuck around.'],
    allin: ["I can't fold this!", 'Okay okay, all in!', "I'm stuck to it."],
    win: ['I knew calling was right!', 'See? Never fold.', 'Yay!'],
    bluffed: ['Wait, that worked?'],
    steal: ['Oh! I win?'],
    lose: ['But I had a pair…', 'I had to see it.', 'Aw.'],
    bust: ["I just couldn't fold…", "One more call wouldn't hurt…"],
    tank: ['I kind of want to see…', "Hmm, it's only chips…"],
  },
  Gus: {
    again: ['Good to see you again.', 'Round two, then.'], revenge: ['Fair is fair.', 'That squares it.'],
    allin: ['Seems right.', 'All in. No drama.', 'Here we go.'],
    win: ['Solid.', "That'll do.", 'Good hand.'],
    bluffed: ['Sometimes you gotta.'],
    steal: ["I'll take it."],
    lose: ['Fair enough.', 'Nice hand.', 'It happens.'],
    bust: ['Good game, all.', 'Well played.'],
    tank: ['Give me a sec.', 'Thinking…'],
  },
  Vera: {
    allin: ['House rules.', 'I already know how this ends.'], win: ['The house always wins.', 'As expected.'],
    bluffed: ['You should have looked closer.'], steal: ['Thank you, darling.'], lose: ['Interesting. Again.', 'Hm. You got lucky.'],
    bust: ["Well. That's never happened."], tank: ['Let me read you\u2026'],
  },
  Otto: {
    allin: ['Why not? It is only money!', 'All of it! Ha!'], win: ['Marvellous!', 'More champagne!'],
    bluffed: ['I had napkins!'], steal: ['Splendid.'], lose: ['Oh, bother. Fetch more.', 'Easy come!'],
    bust: ['I shall need a bigger boat.'], tank: ['Decisions, decisions\u2026'],
  },
  Stone: {
    allin: ['I have it.', 'All in.'], win: ['Told you.', 'Mm.'],
    bluffed: ['\u2026'], steal: ['Fold.'], lose: ['Hm.', 'Fine.'],
    bust: ['\u2026well played.'], tank: ['\u2026'],
  },
};

const last = {};
export function line(name, moment) {
  const opts = LINES[name]?.[moment];
  if (!opts) return '';
  let pick = opts[Math.floor(Math.random() * opts.length)];
  if (opts.length > 1 && pick === last[name + moment]) pick = opts[(opts.indexOf(pick) + 1) % opts.length];
  last[name + moment] = pick;
  return pick;
}
