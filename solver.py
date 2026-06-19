"""Reference implementation of the Matrix Position Solver.

This is the Python twin of ``solver.js`` (the module the GitHub Pages app
actually loads). The deployed app runs the JavaScript version; this file exists
so the algorithm can be unit-tested with ``python test_solver.py`` -- there is
no JS runtime in this environment, so Python is the test harness. The two
implementations are intentionally line-for-line equivalent. If you change one,
change the other, and ``test_solver.py`` has a parity test to catch drift.

The puzzle
----------
Each active row holds one element at a position in ``1..7``. A move picks a row
and a direction. The chosen row shifts, and dependent rows shift according to
the dependency matrix:

    deps[r][j] == 'x'  -> moving row r shifts row j the SAME direction
    deps[r][j] == 'o'  -> moving row r shifts row j the OPPOSITE direction
    deps[r][j] == '.'  -> row j is unaffected by moving row r

Directions: ``'left'`` = +1 (toward position 7), ``'right'`` = -1 (toward 1).

A move is *blocked* (illegal) if it would push ANY element outside ``[1, 7]``.
Goal: bring every active element to position 4 in the fewest moves. ``solve``
returns the shortest move list (it is a breadth-first search), ``[]`` if the
puzzle is already solved, or ``None`` if no solution exists.
"""
from collections import deque

MIN_POS, MAX_POS, TARGET = 1, 7, 4


def apply_move(state, row, direction, deps, n):
    """Apply one move and return the new state tuple, or ``None`` if blocked.

    Self-contained (reads ``deps`` directly) so it mirrors the JS public API and
    is what the UI uses to render intermediate states. ``solve`` uses the
    precomputed-effects fast path below; ``test_solver`` checks they agree.
    """
    delta = 1 if direction == "left" else -1
    new_state = list(state)

    if state[row] != 0:
        p = state[row] + delta
        if p < MIN_POS or p > MAX_POS:
            return None
        new_state[row] = p

    for j in range(n):
        if j == row or state[j] == 0:
            continue
        dep = deps[row][j]
        if dep == "x":
            p = state[j] + delta
            if p < MIN_POS or p > MAX_POS:
                return None
            new_state[j] = p
        elif dep == "o":
            p = state[j] - delta
            if p < MIN_POS or p > MAX_POS:
                return None
            new_state[j] = p

    return tuple(new_state)


def build_effects(deps, n):
    """Precompute, per row, the list of ``(index, sign)`` it shifts when moved.

    ``sign`` is +1 for "same direction" (the row itself and 'x' deps) and -1 for
    "opposite" ('o' deps). Doing this once turns each move into a short walk over
    only the affected indices instead of an n-wide rescan of the dependency
    strings on every one of the millions of BFS expansions.
    """
    effects = []
    for r in range(n):
        row_eff = [(r, 1)]
        for j in range(n):
            if j == r:
                continue
            if deps[r][j] == "x":
                row_eff.append((j, 1))
            elif deps[r][j] == "o":
                row_eff.append((j, -1))
        effects.append(row_eff)
    return effects


def _step(state, row, delta, effects):
    """Fast move using precomputed effects. Returns new tuple or ``None``."""
    new_state = list(state)
    for j, sign in effects[row]:
        if state[j] == 0:
            continue
        p = state[j] + sign * delta
        if p < MIN_POS or p > MAX_POS:
            return None
        new_state[j] = p
    return tuple(new_state)


def _reconstruct(parent, end):
    """Walk the parent map back to the start to recover the move list."""
    moves = []
    node = end
    while parent[node] is not None:
        prev, row, direction = parent[node]
        moves.append((row, direction))
        node = prev
    moves.reverse()
    return moves


def solve(state, deps, n, active):
    """Shortest move sequence bringing every ``active`` row to position 4.

    Breadth-first search, so the returned path is guaranteed minimal. Memory is
    O(states): instead of carrying a growing move list with every queued node
    (the old approach -- O(states x path length)), we store one parent pointer
    per discovered state and rebuild the path once at the end.

    Returns the list of ``(row, direction)`` moves, ``[]`` if already solved, or
    ``None`` if unsolvable / the search space cap is exceeded.
    """
    start = tuple(state)
    if all(start[i] == TARGET for i in active):
        return []

    effects = build_effects(deps, n)
    directions = (("left", 1), ("right", -1))

    parent = {start: None}  # state -> (prev_state, row, direction); start -> None
    queue = deque([start])
    max_states = 5_000_000

    while queue:
        cur = queue.popleft()
        for row in range(n):
            for direction, delta in directions:
                nxt = _step(cur, row, delta, effects)
                if nxt is None or nxt in parent:
                    continue
                parent[nxt] = (cur, row, direction)
                if all(nxt[i] == TARGET for i in active):
                    return _reconstruct(parent, nxt)
                queue.append(nxt)
                if len(parent) > max_states:
                    return None
    return None
