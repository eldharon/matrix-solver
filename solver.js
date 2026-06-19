/*
 * Matrix Position Solver -- core algorithm used by the GitHub Pages app
 * (index.html). Kept in its own file so it can be loaded by the page AND
 * mirrored by solver.py for unit testing (test_solver.py). The Python twin is
 * the line-for-line equivalent; keep the two in sync.
 *
 * Puzzle: each active row holds one element at position 1..7. A move picks a
 * row and direction; the moved row shifts and dependent rows shift per the
 * dependency matrix:
 *   deps[r][j] === 'x'  -> moving row r shifts row j the SAME direction
 *   deps[r][j] === 'o'  -> ... the OPPOSITE direction
 *   deps[r][j] === '.'  -> row j unaffected by moving row r
 * direction 'left' = +1 (toward 7), 'right' = -1 (toward 1).
 * A move is blocked if it would push ANY element outside [1, 7].
 * Goal: bring every active element to position 4 in the fewest moves.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MatrixSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_POS = 1, MAX_POS = 7, TARGET = 4;

  // Self-contained move (reads deps directly). This is the public API the UI
  // uses to render the state after each step. solve() uses the precomputed
  // fast path below; test_solver checks the two agree.
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
  // (the row itself and 'x' deps), -1 for 'o'. Computed once so each BFS
  // expansion walks only affected indices instead of rescanning deps strings.
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

  // Pack a state (each cell 0..7) into one integer so it can key a Map/Set far
  // faster than a joined string. Up to 7 rows -> max 8^7, a safe integer.
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
      moves.push([info.row, info.dir]);
      k = info.prevKey;
      info = parent.get(k);
    }
    moves.reverse();
    return moves;
  }

  // Breadth-first search => shortest move list. Memory is O(states): one parent
  // pointer per discovered state, path rebuilt once at the end (the old code
  // copied a growing move array into every queued node).
  function solve(state, deps, n, active) {
    var start = state.slice();
    if (active.every(function (i) { return start[i] === TARGET; })) return [];

    var effects = buildEffects(deps, n);
    var dirs = [['left', 1], ['right', -1]];

    var parent = new Map();            // key -> {prevKey, row, dir}; start -> null
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

          var ns = cur.slice();
          var blocked = false;
          for (var e = 0; e < rowEff.length; e++) {
            var idx = rowEff[e][0];
            if (cur[idx] === 0) continue;
            var p = cur[idx] + rowEff[e][1] * delta;
            if (p < MIN_POS || p > MAX_POS) { blocked = true; break; }
            ns[idx] = p;
          }
          if (blocked) continue;

          var k = encode(ns, n);
          if (parent.has(k)) continue;
          parent.set(k, { prevKey: curKey, row: r, dir: dir });

          var solved = true;
          for (var a = 0; a < active.length; a++) {
            if (ns[active[a]] !== TARGET) { solved = false; break; }
          }
          if (solved) return reconstruct(parent, k);

          queue.push(ns);
          if (parent.size > MAX_STATES) return null;
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
