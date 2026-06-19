/*
 * Unit tests for solver.js -- the SAME file the GitHub Pages app ships. No
 * duplicate implementation. Two ways to run, no build step:
 *   - Browser: open test.html (loads solver.js + this file, shows pass/fail).
 *   - Node (if installed): `node solver.test.js`
 */
(function () {
  'use strict';

  var MS = (typeof module !== 'undefined' && module.exports)
    ? require('./solver.js')
    : (typeof MatrixSolver !== 'undefined' ? MatrixSolver : null);

  if (!MS) throw new Error('MatrixSolver not found (load solver.js first).');

  var TARGET = MS.TARGET;

  // --- tiny assertion harness ---
  var results = [];
  function test(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (e) { results.push({ name: name, ok: false, detail: e.message }); }
  }
  function eq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
  function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected truthy'); }
  function isNull(x, msg) { if (x !== null) throw new Error((msg || 'expected null') + ', got ' + JSON.stringify(x)); }

  // --- helpers ---
  function noDeps(n) {
    var d = [];
    for (var i = 0; i < n; i++) { d.push([]); for (var j = 0; j < n; j++) d[i].push('.'); }
    return d;
  }
  // Replay a slide solution one position at a time; null if any step is blocked.
  function replay(state, moves, deps, n) {
    var cur = state.slice();
    for (var m = 0; m < moves.length; m++) {
      var row = moves[m][0], dir = moves[m][1], count = moves[m][2];
      for (var t = 0; t < count; t++) {
        cur = MS.applyMove(cur, row, dir, deps, n);
        if (cur === null) return null;
      }
    }
    return cur;
  }
  // Independent slide-BFS shortest distance, using only the public applyMove,
  // to cross-check solve()'s optimality without sharing its internals.
  function oracle(state, deps, n, active) {
    var key = function (s) { return s.join(','); };
    var allT = function (s) { for (var i = 0; i < active.length; i++) if (s[active[i]] !== TARGET) return false; return true; };
    var start = state.slice();
    if (allT(start)) return 0;
    var seen = {}; seen[key(start)] = true;
    var frontier = [start], dist = 0;
    while (frontier.length) {
      dist++;
      var nf = [];
      for (var f = 0; f < frontier.length; f++) {
        var cur = frontier[f];
        for (var r = 0; r < n; r++) {
          for (var di = 0; di < 2; di++) {
            var dir = di ? 'right' : 'left', s = cur;
            while (true) {
              var ns = MS.applyMove(s, r, dir, deps, n);
              if (ns === null) break;
              s = ns;
              var k = key(s);
              if (seen[k]) continue;
              if (allT(s)) return dist;
              seen[k] = true;
              nf.push(s);
            }
          }
        }
      }
      frontier = nf;
    }
    return null;
  }
  function mkRng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randint(rand, a, b) { return a + Math.floor(rand() * (b - a + 1)); }

  var DEPS5 = [
    ['x', '.', '.', 'o', '.'],
    ['x', 'x', 'o', '.', 'o'],
    ['o', '.', 'x', '.', '.'],
    ['.', '.', 'o', 'x', 'o'],
    ['x', 'o', '.', '.', 'x']
  ];

  // === applyMove: single-step primitive ===
  test('left increments toward 7', function () { eq(MS.applyMove([4, 4], 0, 'left', noDeps(2), 2), [5, 4]); });
  test('right decrements toward 1', function () { eq(MS.applyMove([4, 4], 0, 'right', noDeps(2), 2), [3, 4]); });
  test('right from 1 blocked', function () { isNull(MS.applyMove([1, 4], 0, 'right', noDeps(2), 2)); });
  test('left from 7 blocked', function () { isNull(MS.applyMove([7, 4], 0, 'left', noDeps(2), 2)); });
  test('move to boundary 7 allowed', function () { eq(MS.applyMove([6, 4], 0, 'left', noDeps(2), 2), [7, 4]); });
  test('empty primary row unchanged', function () { eq(MS.applyMove([0], 0, 'left', noDeps(1), 1), [0]); });

  test('x dep -> same direction', function () {
    var d = [['.', 'x'], ['.', '.']];
    eq(MS.applyMove([4, 4], 0, 'left', d, 2), [5, 5]);
    eq(MS.applyMove([4, 4], 0, 'right', d, 2), [3, 3]);
  });
  test('o dep -> opposite direction', function () {
    var d = [['.', 'o'], ['.', '.']];
    eq(MS.applyMove([4, 4], 0, 'left', d, 2), [5, 3]);
    eq(MS.applyMove([4, 4], 0, 'right', d, 2), [3, 5]);
  });
  test('deps are directional (R2 move does not move R1)', function () {
    eq(MS.applyMove([4, 4], 1, 'left', [['.', 'x'], ['.', '.']], 2), [4, 5]);
  });
  test('dependent row blocks slide at edge', function () {
    var dx = [['.', 'x'], ['.', '.']], dox = [['.', 'o'], ['.', '.']];
    isNull(MS.applyMove([4, 7], 0, 'left', dx, 2));
    isNull(MS.applyMove([4, 1], 0, 'right', dx, 2));
    isNull(MS.applyMove([4, 1], 0, 'left', dox, 2));
    isNull(MS.applyMove([4, 7], 0, 'right', dox, 2));
  });
  test('empty dependent row ignored', function () {
    eq(MS.applyMove([4, 0], 0, 'left', [['.', 'x'], ['.', '.']], 2), [5, 0]);
  });
  test('row3 rule (o . x . .)', function () { eq(MS.applyMove([4, 5, 6, 5, 1], 2, 'right', DEPS5, 5), [5, 5, 5, 5, 1]); });
  test('row5 rule (x o . . x)', function () { eq(MS.applyMove([4, 5, 6, 5, 1], 4, 'left', DEPS5, 5), [5, 4, 6, 5, 2]); });

  // === buildEffects ===
  test('buildEffects: self only when no deps', function () {
    eq(MS.buildEffects(noDeps(3), 3), [[[0, 1]], [[1, 1]], [[2, 1]]]);
  });
  test('buildEffects: signs match x/o', function () {
    var e = MS.buildEffects([['x', 'x', 'o'], ['.', 'x', '.'], ['.', '.', '.']], 3)[0];
    eq(e, [[0, 1], [1, 1], [2, -1]]);
  });

  // === encode ===
  test('encode is injective for distinct states', function () {
    ok(MS.encode([1, 2, 3], 3) !== MS.encode([1, 3, 2], 3));
    eq(MS.encode([0, 0, 0], 3), 0);
  });

  // === solve: slide model (one slide = one move) ===
  test('already solved returns []', function () { eq(MS.solve([4, 4], noDeps(2), 2, [0, 1]), []); });

  test('single row 1->4 is ONE slide of 3', function () {
    var m = MS.solve([1], noDeps(1), 1, [0]);
    eq(m, [[0, 'left', 3]]);
    eq(replay([1], m, noDeps(1), 1), [4]);
  });

  test('ignores inactive rows', function () {
    var m = MS.solve([1, 0], noDeps(2), 2, [0]);
    ok(m !== null);
    eq(replay([1, 0], m, noDeps(2), 2), [4, 0]);
  });

  test("user 5x5 solves in 6 slides and replay lands all on 4", function () {
    var st = [4, 5, 6, 5, 1], active = [0, 1, 2, 3, 4];
    var m = MS.solve(st, DEPS5, 5, active);
    ok(m !== null, 'should be solvable');
    eq(m.length, 6, 'expected 6 moves');
    eq(m.length, oracle(st, DEPS5, 5, active), 'matches oracle');
    var fin = replay(st, m, DEPS5, 5);
    ok(fin !== null, 'no blocked move');
    for (var i = 0; i < 5; i++) ok(fin[i] === TARGET, 'R' + (i + 1) + ' at 4');
  });

  test('unsolvable puzzle returns null', function () {
    // R1 and R2 are locked together, gap of 1 never closes.
    isNull(MS.solve([4, 5], [['.', 'x'], ['x', '.']], 2, [0, 1]));
  });

  test('moves never split a slide (no consecutive same row+dir)', function () {
    var m = MS.solve([4, 5, 6, 5, 1], DEPS5, 5, [0, 1, 2, 3, 4]);
    for (var i = 1; i < m.length; i++) ok(!(m[i][0] === m[i - 1][0] && m[i][1] === m[i - 1][1]), 'consecutive same slide');
    for (var j = 0; j < m.length; j++) ok(m[j][2] >= 1, 'count >= 1');
  });

  test('optimality vs oracle on fixed cases', function () {
    var cases = [
      [[1], noDeps(1), 1, [0]],
      [[1, 7], noDeps(2), 2, [0, 1]],
      [[4, 5, 6, 5, 1], DEPS5, 5, [0, 1, 2, 3, 4]],
      [[2, 6, 3], [['x', 'o', '.'], ['.', 'x', 'o'], ['o', '.', 'x']], 3, [0, 1, 2]]
    ];
    cases.forEach(function (c) {
      var m = MS.solve(c[0], c[1], c[2], c[3]);
      var d = oracle(c[0], c[1], c[2], c[3]);
      eq(m === null ? null : m.length, d, 'state ' + JSON.stringify(c[0]));
    });
  });

  test('fuzz: 500 random puzzles match oracle and replay valid', function () {
    var rand = mkRng(20240607);
    var syms = ['x', 'o', '.', '.'];
    var checked = 0;
    for (var t = 0; t < 500; t++) {
      var n = randint(rand, 2, 4);
      var deps = [];
      for (var r = 0; r < n; r++) { deps.push([]); for (var j = 0; j < n; j++) deps[r].push(syms[randint(rand, 0, 3)]); }
      var state = []; for (var i = 0; i < n; i++) state.push(randint(rand, 1, 7));
      var active = []; for (var a = 0; a < n; a++) active.push(a);
      var m = MS.solve(state, deps, n, active);
      var d = oracle(state, deps, n, active);
      eq(m === null ? null : m.length, d, 'fuzz state ' + JSON.stringify(state) + ' deps ' + JSON.stringify(deps));
      if (m) {
        var fin = replay(state, m, deps, n);
        ok(fin !== null, 'fuzz blocked move');
        for (var k = 0; k < active.length; k++) ok(fin[active[k]] === TARGET, 'fuzz not solved');
        checked++;
      }
    }
    ok(checked > 0, 'no solvable random puzzles generated');
  });

  // --- report ---
  var passed = results.filter(function (r) { return r.ok; }).length;
  var failed = results.length - passed;
  var summary = { passed: passed, failed: failed, results: results };

  if (typeof module !== 'undefined' && module.exports) {
    results.forEach(function (r) {
      console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' -- ' + r.detail));
    });
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
  } else if (typeof window !== 'undefined') {
    window.__TEST_RESULTS__ = summary;
    if (typeof window.renderTestResults === 'function') window.renderTestResults(summary);
  }
})();
