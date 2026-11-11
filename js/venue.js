// The table's look. Every place you can play has its own cloth: a colour, a printed pattern,
// an inner line, and its name in the corner. The patterns themselves are in the stylesheet.
import { $ } from './util.js';

const KINDS = ['kitchen', 'backroom', 'club', 'rollers', 'vault']; // the five venues of a run, in order
/** The cloth for a venue number (they repeat on later laps of a run). */
export const kindOf = (venue) => KINDS[((venue % KINDS.length) + KINDS.length) % KINDS.length];
/** Lays the table: its colour, which printed cloth, and the name shown in its corner. */
export function setTable(color, kind, name = '') {
  $('app').style.setProperty('--mat', color);
  const mat = $('mat');
  mat.dataset.kind = kind;
  mat.dataset.name = String(name).split(',')[0];
}
