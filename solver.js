/*
 * Matrix Position Solver -- core algorithm.
 *
 * Loaded by the GitHub Pages app (index.html) and unit-tested directly by
 * solver.test.js (run it in test.html, or with `node --test` if Node is
 * installed). This is the single source of truth -- there is no separate
 * implementation to keep in sync.
 *
 * Puzzle: each active row holds one element at position 1..7. A MOVE slides one
 * row any number of positions in a single direction; dependent rows slide along
 * per the dependency matrix:
 *   deps[r][j] === 'x'  -> moving row r shifts row j the SAME direction
 *   deps[r][j] === 'o'  -> ... the OPPOSITE direction
 *   deps[r][j] === '.'  -> row j unaffected by moving row r
 * direction 'left' = +1 (toward 7), 'right' = -1 (toward 1).
 * The slide is legal only while EVERY element stays inside [1, 7]; it is blocked
 * at the position where any element would cross a boundary.
 *
 * Goal: bring every active element to position 4 in the fewest MOVES (slides).
 * solve() returns a list of [row, direction, count] moves (count = how many
 * positions that slide travels), [] if already solved, or null if unsolvable.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MatrixSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_POS = 1, MAX_POS = 7, TARGET = 4;

  // Slide a row by ONE position. Returns a new state array, or null if blocked
  // (any element would leave [1,7]). This is the primitive the UI uses to
  // animate a slide one step at a time, and a slide of N is just N of these.
  function applyMove(state, row, dir, deps, n) {
    var delta = dir === 'left' ? 1 : -1;
    var ns = state.slice();

    if (state[row] !== 0) {
      var p = state[row] + delta;
      if (p < MIN_POS || p > MAX_POS) return null;
      ns[row] = p;
    }

    for (var j = 0; j < n; j++) {
      if (j === row || state[j] === 0) continue;
      var dep = deps[row][j];
      if (dep === 'x') {
        var px = state[j] + delta;
        if (px < MIN_POS || px > MAX_POS) return null;
        ns[j] = px;
      } else if (dep === 'o') {
        var po = state[j] - delta;
        if (po < MIN_POS || po > MAX_POS) return null;
        ns[j] = po;
      }
    }

    return ns;
  }

  // Per row, the list of [index, sign] it shifts when moved: sign +1 for "same"
  // (the row itself and 'x' deps), -1 for 'o'. Computed once so each slide step
  // walks only affected indices instead of rescanning the dependency strings.
  function buildEffects(deps, n) {
    var effects = [];
    for (var r = 0; r < n; r++) {
      var rowEff = [[r, 1]];
      for (var j = 0; j < n; j++) {
        if (j === r) continue;
        if (deps[r][j] === 'x') rowEff.push([j, 1]);
        else if (deps[r][j] === 'o') rowEff.push([j, -1]);
      }
      effects.push(rowEff);
    }
    return effects;
  }

  // One slide step using precomputed effects. Returns new array or null.
  function stepEff(state, rowEff, delta, n) {
    var ns = state.slice();
    for (var e = 0; e < rowEff.length; e++) {
      var idx = rowEff[e][0];
      if (state[idx] === 0) continue;
      var p = state[idx] + rowEff[e][1] * delta;
      if (p < MIN_POS || p > MAX_POS) return null;
      ns[idx] = p;
    }
    return ns;
  }

  // Pack a state (each cell 0..7) into one integer to key the Map far faster
  // than a joined string. Up to 7 rows -> max 8^7, a safe integer.
  function encode(state, n) {
    var k = 0;
    for (var i = 0; i < n; i++) k = k * 8 + state[i];
    return k;
  }

  function reconstruct(parent, endKey) {
    var moves = [];
    var k = endKey;
    var info = parent.get(k);
    while (info) {
      moves.push([info.row, info.dir, info.count]);
      k = info.prevKey;
      info = parent.get(k);
    }
    moves.reverse();
    return moves;
  }

  // Breadth-first search where each edge is a full slide (any distance in one
  // direction), so BFS minimizes the number of MOVES. Every prefix of a slide
  // is reachable from the current state in one move, so we record each new
  // position along the slide; we keep sliding past already-seen states because
  // a longer slide can still reach a brand-new state in that single move.
  // Memory is O(states): one parent pointer per state, path rebuilt at the end.
  function solve(state, deps, n, active) {
    var start = state.slice();
    if (active.every(function (i) { return start[i] === TARGET; })) return [];

    var effects = buildEffects(deps, n);
    var dirs = [['left', 1], ['right', -1]];

    var parent = new Map();            // key -> {prevKey, row, dir, count}; start -> null
    parent.set(encode(start, n), null);
    var queue = [start];
    var head = 0;
    var MAX_STATES = 5000000;

    while (head < queue.length) {
      var cur = queue[head++];
      var curKey = encode(cur, n);

      for (var r = 0; r < n; r++) {
        var rowEff = effects[r];
        for (var di = 0; di < dirs.length; di++) {
          var dir = dirs[di][0], delta = dirs[di][1];

          var s = cur;
          var count = 0;
          while (true) {
            var ns = stepEff(s, rowEff, delta, n);
            if (ns === null) break;        // slide blocked at a boundary
            count++;
            s = ns;
            var k = encode(s, n);
            if (parent.has(k)) continue;   // seen, but keep sliding further
            parent.set(k, { prevKey: curKey, row: r, dir: dir, count: count });

            var solved = true;
            for (var a = 0; a < active.length; a++) {
              if (s[active[a]] !== TARGET) { solved = false; break; }
            }
            if (solved) return reconstruct(parent, k);

            queue.push(s);
            if (parent.size > MAX_STATES) return null;
          }
        }
      }
    }
    return null;
  }

  return {
    applyMove: applyMove,
    solve: solve,
    encode: encode,
    buildEffects: buildEffects,
    MIN_POS: MIN_POS,
    MAX_POS: MAX_POS,
    TARGET: TARGET
  };
});
