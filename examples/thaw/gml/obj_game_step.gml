// Nothing is decided while ice is still travelling: a held key must not queue
// a second move into a cell that is about to be occupied.
if (thaw_moving()) exit;

if (global.thaw_delay > 0) {
  global.thaw_delay -= 1;
  // One frame of every level, captured where it is still untouched. Cheaper
  // than trusting that "the logic passed" means "it looks right".
  if (global.thaw_delay == 0 && global.thaw_testing) {
    screen_save("thaw-level" + string(global.thaw_level + 1) + ".png");
  }
  exit;
}

if (global.thaw_won) {
  var _last = global.thaw_level >= array_length(thaw_levels()) - 1;
  if (global.thaw_testing) {
    if (_last) {
      show_debug_message("THAW ALL SOLVED");
      game_end();
    } else {
      thaw_load(global.thaw_level + 1);
    }
    exit;
  }
  if (keyboard_check_pressed(vk_space) && !_last) thaw_load(global.thaw_level + 1);
  if (keyboard_check_pressed(ord("R"))) thaw_load(global.thaw_level);
  exit;
}

if (global.thaw_testing && thaw_replay_spent()) {
  show_debug_message("THAW FAILED level=" + string(global.thaw_level + 1) + " moves=" + string(global.thaw_moves));
  game_end();
  exit;
}

if (!global.thaw_testing && keyboard_check_pressed(ord("R"))) {
  thaw_load(global.thaw_level);
  exit;
}

var _move = thaw_next_move();
if (_move == "") exit;

if (_move == "L") { obj_hero.facing = FACE_LEFT;  thaw_try_move(-1,  0); }
if (_move == "R") { obj_hero.facing = FACE_RIGHT; thaw_try_move( 1,  0); }
if (_move == "U") { obj_hero.facing = FACE_UP;    thaw_try_move( 0, -1); }
if (_move == "D") { obj_hero.facing = FACE_DOWN;  thaw_try_move( 0,  1); }

if (thaw_solved()) {
  global.thaw_won = true;
  show_debug_message("THAW SOLVED level=" + string(global.thaw_level + 1) + " moves=" + string(global.thaw_moves));
}
