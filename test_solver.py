"""Unit tests for the Matrix Position Solver (solver.py).

solver.py is the Python twin of solver.js, the module the GitHub Pages app
loads. There is no JS runtime here, so these tests exercise the Python twin to
validate the shared algorithm. Run with:

    python test_solver.py            # or: python -m unittest -v test_solver
"""
import itertools
import random
import unittest

from solver import (
    apply_move,
    build_effects,
    solve,
    _step,
    MIN_POS,
    MAX_POS,
    TARGET,
)


def no_deps(n):
    return [["." for _ in range(n)] for _ in range(n)]


def replay(state, moves, deps, n):
    """Replay a move list with the public apply_move; return final state.

    Returns None if any move is blocked, so tests can assert a solution never
    relies on an illegal move.
    """
    cur = tuple(state)
    for row, direction in moves:
        cur = apply_move(cur, row, direction, deps, n)
        if cur is None:
            return None
    return cur


def oracle_distance(state, deps, n, active):
    """Independent plain-BFS shortest distance, using only apply_move.

    Deliberately written differently from solve() (no precomputed effects, no
    parent pointers -- just (state, depth) tuples) so it cross-checks both the
    correctness and the optimality of solve().
    """
    start = tuple(state)
    if all(start[i] == TARGET for i in active):
        return 0
    seen = {start}
    frontier = [start]
    depth = 0
    while frontier:
        depth += 1
        nxt = []
        for cur in frontier:
            for row in range(n):
                for direction in ("left", "right"):
                    s = apply_move(cur, row, direction, deps, n)
                    if s is None or s in seen:
                        continue
                    if all(s[i] == TARGET for i in active):
                        return depth
                    seen.add(s)
                    nxt.append(s)
        frontier = nxt
    return None


# Dependency matrix used across several rule/solve tests.
DEPS5 = [
    ["x", ".", ".", "o", "."],
    ["x", "x", "o", ".", "o"],
    ["o", ".", "x", ".", "."],
    [".", ".", "o", "x", "o"],
    ["x", "o", ".", ".", "x"],
]


class TestDirections(unittest.TestCase):
    def test_left_increments(self):
        self.assertEqual(apply_move((4, 4), 0, "left", no_deps(2), 2), (5, 4))

    def test_right_decrements(self):
        self.assertEqual(apply_move((4, 4), 0, "right", no_deps(2), 2), (3, 4))

    def test_constants(self):
        self.assertEqual((MIN_POS, MAX_POS, TARGET), (1, 7, 4))


class TestEdgeBlocking(unittest.TestCase):
    def test_right_from_min_blocked(self):
        self.assertIsNone(apply_move((1, 4), 0, "right", no_deps(2), 2))

    def test_left_from_max_blocked(self):
        self.assertIsNone(apply_move((7, 4), 0, "left", no_deps(2), 2))

    def test_empty_primary_row_not_blocked(self):
        # An empty primary row (0) just propagates deps; here there are none.
        self.assertEqual(apply_move((0,), 0, "left", no_deps(1), 1), (0,))

    def test_move_to_each_boundary_allowed(self):
        self.assertEqual(apply_move((6, 4), 0, "left", no_deps(2), 2), (7, 4))
        self.assertEqual(apply_move((2, 4), 0, "right", no_deps(2), 2), (1, 4))


class TestRowBasedDeps(unittest.TestCase):
    def setUp(self):
        self.deps_x = [[".", "x"], [".", "."]]
        self.deps_o = [[".", "o"], [".", "."]]

    def test_x_same_direction(self):
        self.assertEqual(apply_move((4, 4), 0, "left", self.deps_x, 2), (5, 5))
        self.assertEqual(apply_move((4, 4), 0, "right", self.deps_x, 2), (3, 3))

    def test_o_opposite_direction(self):
        self.assertEqual(apply_move((4, 4), 0, "left", self.deps_o, 2), (5, 3))
        self.assertEqual(apply_move((4, 4), 0, "right", self.deps_o, 2), (3, 5))

    def test_deps_are_directional(self):
        # deps[0][1] set, deps[1][0] not: moving R2 must NOT move R1.
        self.assertEqual(apply_move((4, 4), 1, "left", self.deps_x, 2), (4, 5))

    def test_dependent_row_blocks_at_edge(self):
        self.assertIsNone(apply_move((4, 7), 0, "left", self.deps_x, 2))
        self.assertIsNone(apply_move((4, 1), 0, "right", self.deps_x, 2))
        self.assertIsNone(apply_move((4, 1), 0, "left", self.deps_o, 2))
        self.assertIsNone(apply_move((4, 7), 0, "right", self.deps_o, 2))

    def test_empty_dependent_row_ignored(self):
        # R2 empty: moving R1 shifts only R1 even though deps[0][1]=='x'.
        self.assertEqual(apply_move((4, 0), 0, "left", self.deps_x, 2), (5, 0))


class TestKnownRules(unittest.TestCase):
    def test_row3_rule(self):
        # Row 3 = [o . x . .] -> moving R3 affects R1 (opposite) only.
        r = apply_move((4, 5, 6, 5, 1), 2, "right", DEPS5, 5)
        self.assertEqual(r, (5, 5, 5, 5, 1))

    def test_row5_rule(self):
        # Row 5 = [x o . . x] -> moving R5 affects R1 (same), R2 (opposite).
        r = apply_move((4, 5, 6, 5, 1), 4, "left", DEPS5, 5)
        self.assertEqual(r, (5, 4, 6, 5, 2))


class TestApplyMoveParity(unittest.TestCase):
    """The public apply_move and solve()'s fast _step must always agree."""

    def test_parity_random(self):
        rng = random.Random(1234)
        symbols = ("x", "o", ".")
        for _ in range(4000):
            n = rng.randint(1, 5)
            deps = [[rng.choice(symbols) for _ in range(n)] for _ in range(n)]
            state = tuple(rng.randint(0, 7) for _ in range(n))
            effects = build_effects(deps, n)
            for row in range(n):
                for direction, delta in (("left", 1), ("right", -1)):
                    self.assertEqual(
                        apply_move(state, row, direction, deps, n),
                        _step(state, row, delta, effects),
                        msg=f"mismatch n={n} state={state} row={row} dir={direction} deps={deps}",
                    )


class TestSolve(unittest.TestCase):
    def test_already_solved_returns_empty(self):
        self.assertEqual(solve([4, 4], no_deps(2), 2, [0, 1]), [])

    def test_single_row_no_deps(self):
        moves = solve([1], no_deps(1), 1, [0])
        self.assertEqual(replay([1], moves, no_deps(1), 1), (4,))
        self.assertEqual(len(moves), 3)  # 1 -> 4 is exactly three left moves

    def test_ignores_inactive_rows(self):
        # R2 has no element; only R1 must reach 4.
        deps = no_deps(2)
        moves = solve([1, 0], deps, 2, [0])
        self.assertEqual(replay([1, 0], moves, deps, 2), (4, 0))

    def test_user_puzzle_5x5_solvable_and_valid(self):
        state, active = [4, 5, 6, 5, 1], [0, 1, 2, 3, 4]
        moves = solve(state, DEPS5, 5, active)
        self.assertIsNotNone(moves)
        final = replay(state, moves, DEPS5, 5)
        self.assertIsNotNone(final, "solution used a blocked move")
        self.assertTrue(all(final[i] == TARGET for i in active))

    def test_unsolvable_returns_none(self):
        # R1 and R2 are locked together (each moves the other the same way), so
        # their gap of 1 never closes and they cannot both reach 4.
        deps = [[".", "x"], ["x", "."]]
        self.assertIsNone(solve([4, 5], deps, 2, [0, 1]))

    def test_solution_is_shortest(self):
        # Cross-check solve() length against the independent BFS oracle.
        cases = [
            ([1], no_deps(1), 1, [0]),
            ([1, 7], no_deps(2), 2, [0, 1]),
            ([4, 5, 6, 5, 1], DEPS5, 5, [0, 1, 2, 3, 4]),
            ([2, 6, 3], [["x", "o", "."], [".", "x", "o"], ["o", ".", "x"]], 3, [0, 1, 2]),
        ]
        for state, deps, n, active in cases:
            moves = solve(state, deps, n, active)
            dist = oracle_distance(state, deps, n, active)
            self.assertEqual(
                None if moves is None else len(moves), dist,
                msg=f"non-optimal for state={state} deps={deps}",
            )

    def test_random_solutions_are_valid_and_optimal(self):
        rng = random.Random(99)
        symbols = ("x", "o", ".", ".")  # bias toward sparse deps
        checked = 0
        for _ in range(300):
            n = rng.randint(2, 4)
            deps = [[rng.choice(symbols) for _ in range(n)] for _ in range(n)]
            state = [rng.randint(1, 7) for _ in range(n)]
            active = list(range(n))
            moves = solve(state, deps, n, active)
            dist = oracle_distance(state, deps, n, active)
            # solve and the oracle must agree on solvability and distance.
            self.assertEqual(
                None if moves is None else len(moves), dist,
                msg=f"state={state} deps={deps}",
            )
            if moves:
                final = replay(state, moves, deps, n)
                self.assertIsNotNone(final, f"blocked move; state={state} deps={deps}")
                self.assertTrue(all(final[i] == TARGET for i in active))
                checked += 1
        self.assertGreater(checked, 0, "no solvable random puzzles were generated")


class TestBuildEffects(unittest.TestCase):
    def test_includes_self_with_positive_sign(self):
        eff = build_effects(no_deps(3), 3)
        for r in range(3):
            self.assertEqual(eff[r], [(r, 1)])

    def test_signs_match_deps(self):
        deps = [["x", "x", "o"], [".", "x", "."], [".", ".", "."]]
        # Row 0 moves itself (+), R2 same (+, 'x'), R3 opposite (-, 'o').
        self.assertEqual(set(build_effects(deps, 3)[0]), {(0, 1), (1, 1), (2, -1)})


if __name__ == "__main__":
    unittest.main(verbosity=2)
