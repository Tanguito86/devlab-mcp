// THAW -- sliding ice puzzle. All rules live here so they can be reasoned about
// in one place and replayed deterministically by the test build.

#macro THAW_TILE 16
#macro THAW_HALF 8
// Index 0 is GameMaker's reserved blank tile, so the usable tiles start at 1.
#macro TILE_BLANK 0
#macro TILE_FLOOR 1
#macro TILE_WALL  2
#macro TILE_GOAL  3

#macro FACE_DOWN  0
#macro FACE_LEFT  1
#macro FACE_RIGHT 2
#macro FACE_UP    3

/// Levels in Sokoban notation, 20x15 to match the room.
///   #  wall      .  floor     o  goal
///   B  block     b  block on goal
///   @  hero      +  hero on goal
function thaw_levels() {
  return [
    // 1 -- one push. The goal sits against a wall, which is what stops the ice.
    [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#...@B........o#...#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    // 2 -- two goals against the outer wall. Order does not matter; getting
    //      behind each block does.
    [
      "####################",
      "#..................#",
      "#..................#",
      "#....B............o#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#....@.............#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#o............B....#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    // 3 -- the goal is in a corner, so the block has to be turned: push it to
    //      the far wall, then get above it and push it down.
    [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#...@B.............#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#.................o#",
      "####################",
    ],
  ];
}

/// Moves the test build replays, one string per level: L R U D.
function thaw_solutions() {
  return ["R", "LUUUURRRRRRRRRRRDDDDDDDDL", "URDLDDDDDDDDR"];
}

function thaw_tilemap() {
  return layer_tilemap_get_id(layer_get_id("Tiles_level"));
}

/// Anything outside the grid counts as wall, so callers never bounds-check.
function thaw_tile(_cx, _cy) {
  if (_cx < 0 || _cy < 0 || _cx >= global.thaw_w || _cy >= global.thaw_h) return TILE_WALL;
  return tile_get_index(tilemap_get(thaw_tilemap(), _cx, _cy));
}

function thaw_is_wall(_cx, _cy) {
  return thaw_tile(_cx, _cy) == TILE_WALL;
}

function thaw_block_at(_cx, _cy) {
  with (obj_block) {
    if (cx == _cx && cy == _cy) return id;
  }
  return noone;
}

/// Ice does not stop where it is pushed: it travels until something stops it.
/// Returns how many cells it covered, so a shove into a wall reads as no move.
function thaw_slide(_block, _dx, _dy) {
  var _moved = 0;
  while (true) {
    var _nx = _block.cx + _dx;
    var _ny = _block.cy + _dy;
    if (thaw_is_wall(_nx, _ny)) break;
    if (thaw_block_at(_nx, _ny) != noone) break;
    _block.cx = _nx;
    _block.cy = _ny;
    _moved += 1;
  }
  return _moved;
}

/// One step of the rules. The hero takes the cell the block left, and a push
/// that moves nothing moves nobody.
function thaw_try_move(_dx, _dy) {
  var _hx = obj_hero.cx + _dx;
  var _hy = obj_hero.cy + _dy;
  if (thaw_is_wall(_hx, _hy)) return false;

  var _block = thaw_block_at(_hx, _hy);
  if (_block != noone && thaw_slide(_block, _dx, _dy) == 0) return false;

  obj_hero.cx = _hx;
  obj_hero.cy = _hy;
  global.thaw_moves += 1;
  return true;
}

function thaw_solved() {
  for (var _y = 0; _y < global.thaw_h; _y += 1) {
    for (var _x = 0; _x < global.thaw_w; _x += 1) {
      if (thaw_tile(_x, _y) == TILE_GOAL && thaw_block_at(_x, _y) == noone) return false;
    }
  }
  return true;
}

/// True while anything is still travelling to its cell. Input is ignored then,
/// so a held key cannot queue a second move mid-slide.
function thaw_moving() {
  var _moving = false;
  with (obj_block) {
    if (x != cx * THAW_TILE + THAW_HALF || y != cy * THAW_TILE + THAW_HALF) _moving = true;
  }
  with (obj_hero) {
    if (x != cx * THAW_TILE + THAW_HALF || y != cy * THAW_TILE + THAW_HALF) _moving = true;
  }
  return _moving;
}

/// Eases one instance toward its cell. Instances call this on themselves.
function thaw_settle() {
  var _tx = cx * THAW_TILE + THAW_HALF;
  var _ty = cy * THAW_TILE + THAW_HALF;
  if (snap) {
    x = _tx;
    y = _ty;
    snap = false;
    return;
  }
  var _speed = 3;
  x += clamp(_tx - x, -_speed, _speed);
  y += clamp(_ty - y, -_speed, _speed);
}

function thaw_load(_index) {
  var _levels = thaw_levels();
  if (_index < 0) _index = 0;
  if (_index >= array_length(_levels)) _index = array_length(_levels) - 1;

  global.thaw_level = _index;
  global.thaw_moves = 0;
  global.thaw_won = false;
  global.thaw_cursor = 1;
  // A short beat before the first move, so a level is legible on screen before
  // anything happens to it -- and so the test build can photograph it.
  global.thaw_delay = 12;
  // The test build feeds the recorded solution through the same code path the
  // keyboard uses, so a passing replay exercises the real rules.
  global.thaw_replay = global.thaw_testing ? thaw_solutions()[_index] : "";

  var _rows = _levels[_index];
  global.thaw_h = array_length(_rows);
  global.thaw_w = string_length(_rows[0]);

  with (obj_block) instance_destroy();
  // The hero is created here rather than placed in the room, so nothing depends
  // on the order instance Create events happen to run in.
  if (!instance_exists(obj_hero)) instance_create_layer(0, 0, "Instances", obj_hero);

  var _tilemap = thaw_tilemap();
  for (var _y = 0; _y < global.thaw_h; _y += 1) {
    var _row = _rows[_y];
    for (var _x = 0; _x < global.thaw_w; _x += 1) {
      var _char = string_char_at(_row, _x + 1);
      var _tile = TILE_FLOOR;
      if (_char == "#") _tile = TILE_WALL;
      else if (_char == "o" || _char == "b" || _char == "+") _tile = TILE_GOAL;
      tilemap_set(_tilemap, _tile, _x, _y);

      if (_char == "B" || _char == "b") {
        var _block = instance_create_layer(0, 0, "Instances", obj_block);
        _block.cx = _x;
        _block.cy = _y;
        _block.snap = true;
      }
      if (_char == "@" || _char == "+") {
        obj_hero.cx = _x;
        obj_hero.cy = _y;
        obj_hero.snap = true;
        obj_hero.facing = FACE_DOWN;
      }
    }
  }
  show_debug_message("THAW level=" + string(_index + 1) + " size=" + string(global.thaw_w) + "x" + string(global.thaw_h));
}

/// One move per call, from the replay in a test build and from the keyboard
/// otherwise. Returns "" when nothing was asked for.
function thaw_next_move() {
  if (global.thaw_replay != "") {
    if (global.thaw_cursor > string_length(global.thaw_replay)) return "";
    var _move = string_char_at(global.thaw_replay, global.thaw_cursor);
    global.thaw_cursor += 1;
    return _move;
  }
  if (keyboard_check_pressed(vk_left)  || keyboard_check_pressed(ord("A"))) return "L";
  if (keyboard_check_pressed(vk_right) || keyboard_check_pressed(ord("D"))) return "R";
  if (keyboard_check_pressed(vk_up)    || keyboard_check_pressed(ord("W"))) return "U";
  if (keyboard_check_pressed(vk_down)  || keyboard_check_pressed(ord("S"))) return "D";
  return "";
}

/// True once the replay has nothing left to give.
function thaw_replay_spent() {
  return global.thaw_replay != "" && global.thaw_cursor > string_length(global.thaw_replay);
}
