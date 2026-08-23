// FORTYTWO -- the shmup skeleton: scrolling sea, waves on a timetable, enemies
// on parametric paths, shooting, the loop-the-loop, and a formation bonus.
//
// The pieces meant to outlive this game are the wave table and the path
// function. Both are data read by an interpreter, not code per enemy, which is
// the same shape a danmaku's pattern system needs.

#macro FT_SCROLL 1.4

#macro FT_PLAYER_SPEED 2.4
#macro FT_FIRE_COOLDOWN 7
#macro FT_SHOT_SPEED 8

#macro FT_ROLL_FRAMES 34
#macro FT_ROLL_CHARGES 3

#macro FT_RESPAWN_FRAMES 70
#macro FT_INVULN_FRAMES 100

#macro FT_BANK_LEFT 0
#macro FT_BANK_LEVEL 1
#macro FT_BANK_RIGHT 2

#macro FT_SCORE_KILL 100
#macro FT_FORMATION_BONUS 1000

/// The timetable. `at` is the frame the wave starts, `gap` the frames between
/// its members, and `fires` whether they shoot back.
function ft_waves() {
  return [
    { at:  90, kind: "sweep_left",  count: 5, gap: 11, fires: false },
    { at: 260, kind: "sweep_right", count: 5, gap: 11, fires: false },
    { at: 430, kind: "dive_centre", count: 6, gap: 9,  fires: true  },
    { at: 620, kind: "sweep_left",  count: 6, gap: 9,  fires: true  },
    { at: 800, kind: "arc_wide",    count: 7, gap: 8,  fires: true  },
    { at: 990, kind: "dive_centre", count: 8, gap: 7,  fires: true  },
  ];
}

/// Where an enemy of this kind is, `_t` frames after it entered. Pure: the same
/// t always gives the same point, which is what makes a run reproducible.
function ft_path(_kind, _t) {
  var _w = room_width;
  switch (_kind) {
    case "sweep_left":
      return { x: -24 + _t * 2.1, y: 56 + dsin(_t * 2.4) * 46 };
    case "sweep_right":
      return { x: _w + 24 - _t * 2.1, y: 56 + dsin(_t * 2.4) * 46 };
    case "dive_centre":
      return { x: _w * 0.5 + dsin(_t * 2.6) * 96, y: -24 + _t * 1.7 };
    case "arc_wide":
      return { x: _w * 0.5 + dcos(200 - _t * 1.4) * 132, y: -24 + _t * 1.35 };
    default:
      return { x: _w * 0.5, y: -24 + _t * 2 };
  }
}

function ft_off_screen(_x, _y) {
  return _x < -60 || _x > room_width + 60 || _y < -80 || _y > room_height + 60;
}

function ft_explode(_x, _y) {
  instance_create_depth(_x, _y, -20, obj_boom);
}

function ft_score(_amount) {
  global.ft_score += _amount;
}

/// A whole formation shot down is worth more than its planes, which is what
/// makes chasing the last one of a wave a decision rather than tidying up.
///
/// It counts kills, not survivors. Tracking how many were still alive paid the
/// bonus when the last of a formation escaped off the bottom of the screen,
/// which rewards exactly the thing the bonus exists to discourage.
function ft_enemy_killed(_wave) {
  ft_score(FT_SCORE_KILL);
  global.ft_killed[_wave] += 1;
  if (global.ft_killed[_wave] == global.ft_size[_wave]) {
    ft_score(FT_FORMATION_BONUS);
    global.ft_bonuses += 1;
    show_debug_message("FT FORMATION wave=" + string(_wave) + " bonus=" + string(FT_FORMATION_BONUS));
  }
}

function ft_reset_run() {
  global.ft_frame = 0;
  global.ft_score = 0;
  global.ft_lives = 3;
  global.ft_bonuses = 0;
  global.ft_kills = 0;
  global.ft_rolls_used = 0;
  global.ft_lives_lost = 0;
  global.ft_over = false;
  global.ft_respawn = 0;

  var _waves = ft_waves();
  var _count = array_length(_waves);
  global.ft_spawned = array_create(_count, 0);
  global.ft_killed = array_create(_count, 0);
  global.ft_size = array_create(_count, 0);
  for (var _i = 0; _i < _count; _i += 1) global.ft_size[_i] = _waves[_i].count;

  with (obj_enemy) instance_destroy();
  with (obj_shot) instance_destroy();
  with (obj_eshot) instance_destroy();
}

/// Releases whichever wave members are due this frame.
function ft_run_waves() {
  var _waves = ft_waves();
  for (var _i = 0; _i < array_length(_waves); _i += 1) {
    var _wave = _waves[_i];
    if (global.ft_spawned[_i] >= _wave.count) continue;
    var _due = _wave.at + global.ft_spawned[_i] * _wave.gap;
    if (global.ft_frame < _due) continue;
    var _start = ft_path(_wave.kind, 0);
    var _enemy = instance_create_depth(_start.x, _start.y, 0, obj_enemy);
    _enemy.kind = _wave.kind;
    _enemy.wave = _i;
    _enemy.fires = _wave.fires;
    global.ft_spawned[_i] += 1;
  }
}

function ft_waves_exhausted() {
  for (var _i = 0; _i < array_length(global.ft_spawned); _i += 1) {
    if (global.ft_spawned[_i] < global.ft_size[_i]) return false;
  }
  return !instance_exists(obj_enemy);
}
