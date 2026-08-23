// Replays thaw_solutions() against thaw_levels() using the same rules the GML
// implements, so a broken solution is caught in a second rather than after a
// two-minute Igor build. Reads the GML directly: one source of truth.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GML = fileURLToPath(new URL("../gml/scr_thaw.gml", import.meta.url));
const source = readFileSync(GML, "utf8");

function block(name) {
  const start = source.indexOf(`function ${name}()`);
  if (start < 0) throw new Error(`${name} not found in scr_thaw.gml`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`${name} is unbalanced`);
}

const strings = (text) => [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);

// thaw_levels returns an array of arrays; each inner array is one level.
const levels = block("thaw_levels")
  .split(/\[\s*\n/)
  .slice(1)
  .map((chunk) => strings(chunk))
  .filter((rows) => rows.length > 0);
const solutions = strings(block("thaw_solutions"));

const DIRS = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };

function parse(rows) {
  const walls = new Set();
  const goals = new Set();
  const blocks = new Set();
  let hero = null;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const key = `${x},${y}`;
      if (ch === "#") walls.add(key);
      if ("ob+".includes(ch)) goals.add(key);
      if ("Bb".includes(ch)) blocks.add(key);
      if ("@+".includes(ch)) hero = [x, y];
    });
  });
  return { walls, goals, blocks, hero, w: rows[0].length, h: rows.length };
}

function replay(state, moves) {
  const isWall = (x, y) => x < 0 || y < 0 || x >= state.w || y >= state.h || state.walls.has(`${x},${y}`);
  let ignored = 0;
  for (const move of moves) {
    const dir = DIRS[move];
    if (!dir) throw new Error(`unknown move ${JSON.stringify(move)}`);
    const [dx, dy] = dir;
    const [hx, hy] = [state.hero[0] + dx, state.hero[1] + dy];
    if (isWall(hx, hy)) { ignored += 1; continue; }

    if (state.blocks.has(`${hx},${hy}`)) {
      let [bx, by] = [hx, hy];
      let travelled = 0;
      while (!isWall(bx + dx, by + dy) && !state.blocks.has(`${bx + dx},${by + dy}`)) {
        bx += dx; by += dy; travelled += 1;
      }
      if (travelled === 0) { ignored += 1; continue; }
      state.blocks.delete(`${hx},${hy}`);
      state.blocks.add(`${bx},${by}`);
    }
    state.hero = [hx, hy];
  }
  const unmet = [...state.goals].filter((goal) => !state.blocks.has(goal));
  return { solved: unmet.length === 0, unmet, ignored };
}

let failures = 0;
console.log(`levels: ${levels.length}   solutions: ${solutions.length}`);
if (levels.length !== solutions.length) {
  console.log(`MISMATCH: every level needs a solution`);
  failures += 1;
}

levels.forEach((rows, index) => {
  const state = parse(rows);
  const label = `level ${index + 1}`;
  if (!state.hero) { console.log(`${label}: no hero`); failures += 1; return; }
  if (state.goals.size !== state.blocks.size) {
    console.log(`${label}: ${state.goals.size} goal(s) but ${state.blocks.size} block(s)`);
    failures += 1;
  }
  const moves = solutions[index] ?? "";
  const result = replay(state, moves);
  const note = result.ignored ? `  (${result.ignored} move(s) hit a wall and did nothing)` : "";
  if (result.solved) {
    console.log(`${label}: SOLVED in ${moves.length} move(s)${note}`);
  } else {
    console.log(`${label}: NOT SOLVED -- goals still empty: ${result.unmet.join(" ")}${note}`);
    failures += 1;
  }
});

if (failures) {
  console.log(`\n${failures} problem(s)`);
  process.exitCode = 1;
} else {
  console.log("\nall levels solvable by their recorded solution");
}
