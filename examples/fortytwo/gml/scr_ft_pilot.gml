// The autopilot the test build flies.
//
// A recorded input string would be the obvious way to make a shooter testable,
// but nobody can author a good one by hand and it breaks the moment a wave is
// retimed. An autopilot reading the live game state is deterministic for the
// same reason -- fixed waves, seeded RNG, pure paths -- and it keeps working
// when the design changes, which is what a regression test has to do.
//
// It is not meant to play well. It is meant to prove the systems connect:
// input moves the plane, shots kill enemies, kills score, hits cost a life.

#macro PILOT_DANGER_RADIUS 46

/// Returns { left, right, up, down, fire, roll } for this frame.
function ft_pilot_input() {
  var _none = { left: false, right: false, up: false, down: false, fire: true, roll: false };
  if (!instance_exists(obj_player)) return _none;

  var _px = obj_player.x;
  var _py = obj_player.y;

  // Nearest incoming threat, counting enemy shots and the planes themselves.
  var _threatX = 0;
  var _threatDistance = 100000;
  with (obj_eshot) {
    var _d = point_distance(x, y, _px, _py);
    if (_d < _threatDistance) { _threatDistance = _d; _threatX = x; }
  }
  with (obj_enemy) {
    var _d = point_distance(x, y, _px, _py);
    if (_d < _threatDistance) { _threatDistance = _d; _threatX = x; }
  }

  var _input = { left: false, right: false, up: false, down: false, fire: true, roll: false };

  // Rolls on a timer, not on danger.
  //
  // Rolling when threatened never fired: the pilot lines up under each enemy
  // and kills it long before it descends, so nothing ever came within the
  // danger radius -- not at 22 pixels, and not at 46 either. Two runs with
  // different radii produced byte-identical scores, which is what gave it away.
  // A timer is honest about what this is: an instrument exercising the roll
  // path -- charge spent, invulnerability, the spin, and no firing while
  // rolling -- rather than a pilot making a decision.
  if (obj_player.rolls > 0 && obj_player.roll == 0 && (global.ft_frame % 220) == 0) {
    _input.roll = true;
  }

  if (_threatDistance < PILOT_DANGER_RADIUS) {
    // Slide away from it, and off the wall rather than into it.
    var _away = _threatX < _px ? 1 : -1;
    if (_px + _away * 40 < 24 || _px + _away * 40 > room_width - 24) _away = -_away;
    if (_away < 0) _input.left = true; else _input.right = true;
  } else {
    // Otherwise line up under the lowest enemy, which is the one about to leave.
    var _targetX = room_width * 0.5;
    var _lowest = -100000;
    with (obj_enemy) {
      if (y > _lowest && y < _py - 30) { _lowest = y; _targetX = x; }
    }
    if (_targetX < _px - 4) _input.left = true;
    else if (_targetX > _px + 4) _input.right = true;
  }

  // Hold the bottom third: room to react, still close enough to hit things.
  var _home = room_height - 70;
  if (_py < _home - 8) _input.down = true;
  else if (_py > _home + 8) _input.up = true;

  return _input;
}

/// The keyboard, in the same shape, so the game reads one source of input.
function ft_human_input() {
  return {
    left:  keyboard_check(vk_left)  || keyboard_check(ord("A")),
    right: keyboard_check(vk_right) || keyboard_check(ord("D")),
    up:    keyboard_check(vk_up)    || keyboard_check(ord("W")),
    down:  keyboard_check(vk_down)  || keyboard_check(ord("S")),
    fire:  keyboard_check(ord("Z")) || keyboard_check(vk_space),
    roll:  keyboard_check_pressed(ord("X")) || keyboard_check_pressed(vk_shift),
  };
}

function ft_input() {
  return global.ft_testing ? ft_pilot_input() : ft_human_input();
}
