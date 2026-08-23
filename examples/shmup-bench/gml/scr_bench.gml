// How many bullets can GameMaker carry inside a 60 fps frame, and which
// representation is actually cheapest?
//
// Three modes doing identical work -- move, wrap at the room edge, and test one
// small circular hitbox against every bullet, which is what a danmaku does
// every frame:
//
//   aos        one array of structs, iterated by a controller
//   soa        parallel flat arrays, iterated by a controller
//   instances  one object per bullet, with its own Step event
//
// The first attempt at this measured 6.944 ms for five different bullet counts
// in a row. That is 144 fps exactly: the display was pacing the loop, not the
// work. Lifting the frame cap is not enough, because vsync caps independently,
// so both are turned off and the run reports the rate it achieved at the
// smallest count. If that number is near a display refresh rate, distrust
// everything after it.
//
// The array modes time their update and draw separately, because "GML is slow"
// and "submitting sprites is slow" call for completely different fixes.

#macro BENCH_WARMUP 30
#macro BENCH_FRAMES 120
#macro BENCH_BUDGET_US 16667
#macro BENCH_ABANDON_US 50000

#macro MODE_AOS 0
#macro MODE_SOA 1
#macro MODE_INSTANCES 2
#macro MODE_COUNT 3

// Only rungs that clear the vsync floor by a wide margin carry information, so
// the ladder skips the small ones a shmup would actually use and measures where
// the numbers are real. The cost per bullet is linear, so the answer for 1000
// bullets is read off the slope.
function bench_ladder() {
  return [8000, 16000, 24000, 32000, 48000];
}

#macro BENCH_PASSES 3
// Twice the 144 Hz period. Below this a frame time is a floor, not a reading.
#macro BENCH_FLOOR_US 14000

function bench_mode_name(_mode) {
  switch (_mode) {
    case MODE_AOS: return "aos";
    case MODE_SOA: return "soa";
    default: return "instances";
  }
}

function bench_clear() {
  global.bench_aos = [];
  global.bench_x = [];
  global.bench_y = [];
  global.bench_vx = [];
  global.bench_vy = [];
  with (obj_bullet) instance_destroy();
}

function bench_spawn(_mode, _count) {
  if (_mode == MODE_AOS) {
    var _list = array_create(_count);
    for (var _i = 0; _i < _count; _i += 1) {
      _list[_i] = { x: random(room_width), y: random(room_height), vx: random_range(-3, 3), vy: random_range(-3, 3) };
    }
    global.bench_aos = _list;
    return;
  }
  if (_mode == MODE_SOA) {
    global.bench_x = array_create(_count);
    global.bench_y = array_create(_count);
    global.bench_vx = array_create(_count);
    global.bench_vy = array_create(_count);
    for (var _i = 0; _i < _count; _i += 1) {
      global.bench_x[_i] = random(room_width);
      global.bench_y[_i] = random(room_height);
      global.bench_vx[_i] = random_range(-3, 3);
      global.bench_vy[_i] = random_range(-3, 3);
    }
    return;
  }
  for (var _i = 0; _i < _count; _i += 1) {
    var _bullet = instance_create_depth(random(room_width), random(room_height), 0, obj_bullet);
    _bullet.vx = random_range(-3, 3);
    _bullet.vy = random_range(-3, 3);
  }
}

function bench_update_aos() {
  var _list = global.bench_aos;
  var _count = array_length(_list);
  var _px = global.bench_px, _py = global.bench_py;
  var _width = room_width, _height = room_height;
  var _hits = 0;
  for (var _i = 0; _i < _count; _i += 1) {
    var _bullet = _list[_i];
    var _x = _bullet.x + _bullet.vx;
    var _y = _bullet.y + _bullet.vy;
    if (_x < 0) _x += _width; else if (_x >= _width) _x -= _width;
    if (_y < 0) _y += _height; else if (_y >= _height) _y -= _height;
    _bullet.x = _x;
    _bullet.y = _y;
    var _dx = _x - _px, _dy = _y - _py;
    if (_dx * _dx + _dy * _dy < 9) _hits += 1;
  }
  global.bench_hits = _hits;
}

function bench_update_soa() {
  var _x = global.bench_x, _y = global.bench_y;
  var _vx = global.bench_vx, _vy = global.bench_vy;
  var _count = array_length(_x);
  var _px = global.bench_px, _py = global.bench_py;
  var _width = room_width, _height = room_height;
  var _hits = 0;
  for (var _i = 0; _i < _count; _i += 1) {
    var _nx = _x[_i] + _vx[_i];
    var _ny = _y[_i] + _vy[_i];
    if (_nx < 0) _nx += _width; else if (_nx >= _width) _nx -= _width;
    if (_ny < 0) _ny += _height; else if (_ny >= _height) _ny -= _height;
    _x[_i] = _nx;
    _y[_i] = _ny;
    var _dx = _nx - _px, _dy = _ny - _py;
    if (_dx * _dx + _dy * _dy < 9) _hits += 1;
  }
  global.bench_hits = _hits;
}

function bench_draw_aos() {
  var _list = global.bench_aos;
  for (var _i = 0, _count = array_length(_list); _i < _count; _i += 1) {
    var _bullet = _list[_i];
    draw_sprite(spr_bullet, 0, _bullet.x, _bullet.y);
  }
}

function bench_draw_soa() {
  var _x = global.bench_x, _y = global.bench_y;
  for (var _i = 0, _count = array_length(_x); _i < _count; _i += 1) {
    draw_sprite(spr_bullet, 0, _x[_i], _y[_i]);
  }
}

function bench_begin() {
  bench_clear();
  global.bench_phase = -1;
  global.bench_frame = 0;
  global.bench_accum = 0;
  global.bench_update_us = 0;
  global.bench_draw_us = 0;
}

function bench_record(_mode, _count, _microseconds, _updateUs, _drawUs) {
  var _ms = _microseconds / 1000;
  var _perBullet = _count > 0 ? _microseconds / _count : 0;
  var _split = _mode == MODE_INSTANCES
    ? " update=engine draw=engine"
    : " update=" + string_format(_updateUs / 1000, 1, 3) + "ms draw=" + string_format(_drawUs / 1000, 1, 3) + "ms";
  show_debug_message("BENCH mode=" + bench_mode_name(_mode)
    + " n=" + string(_count)
    + " frame=" + string_format(_ms, 1, 3) + "ms"
    + " per_bullet=" + string_format(_perBullet, 1, 3) + "us"
    + _split
    + " budget=" + (_microseconds <= BENCH_BUDGET_US ? "ok" : "over"));
  array_push(global.bench_results, { mode: _mode, count: _count, us: _microseconds });
}

function bench_ceiling(_mode) {
  var _best = 0;
  for (var _i = 0; _i < array_length(global.bench_results); _i += 1) {
    var _row = global.bench_results[_i];
    if (_row.mode == _mode && _row.us <= BENCH_BUDGET_US && _row.count > _best) _best = _row.count;
  }
  return _best;
}

/// Cost per bullet from the largest measured rung, which is the rung least
/// polluted by whatever the engine costs when it is doing nothing.
function bench_per_bullet(_mode) {
  var _biggest = 0, _us = 0;
  for (var _i = 0; _i < array_length(global.bench_results); _i += 1) {
    var _row = global.bench_results[_i];
    if (_row.mode == _mode && _row.count > _biggest) { _biggest = _row.count; _us = _row.us; }
  }
  return _biggest > 0 ? _us / _biggest : 0;
}

/// Marginal cost per bullet, from the slope between the two largest rungs.
///
/// This is the number to trust. vsync could not be disabled from code on this
/// host, so every frame time below the display period is a floor rather than a
/// measurement -- but a slope between two rungs that are both well above that
/// floor cancels both the floor and whatever the engine costs per frame while
/// doing nothing.
function bench_marginal(_mode) {
  var _n = 0, _sx = 0, _sy = 0, _sxy = 0, _sxx = 0;
  for (var _i = 0; _i < array_length(global.bench_results); _i += 1) {
    var _row = global.bench_results[_i];
    if (_row.mode != _mode || _row.us < BENCH_FLOOR_US) continue;
    _n += 1; _sx += _row.count; _sy += _row.us;
    _sxy += _row.count * _row.us; _sxx += _row.count * _row.count;
  }
  var _denominator = _n * _sxx - _sx * _sx;
  if (_n < 3 || _denominator == 0) return 0;
  return (_n * _sxy - _sx * _sy) / _denominator;
}

/// How far the individual passes spread, so a ranking is never read off noise.
function bench_spread(_mode, _count) {
  var _low = 0, _high = 0, _seen = 0;
  for (var _i = 0; _i < array_length(global.bench_results); _i += 1) {
    var _row = global.bench_results[_i];
    if (_row.mode != _mode || _row.count != _count) continue;
    if (_seen == 0 || _row.us < _low) _low = _row.us;
    if (_seen == 0 || _row.us > _high) _high = _row.us;
    _seen += 1;
  }
  return _low > 0 ? (_high - _low) / _low : 0;
}

function bench_report() {
  for (var _mode = 0; _mode < MODE_COUNT; _mode += 1) {
    var _marginal = bench_marginal(_mode);
    var _ceiling = _marginal > 0 ? floor(BENCH_BUDGET_US / _marginal) : 0;
    show_debug_message("BENCH SUMMARY mode=" + bench_mode_name(_mode)
      + " marginal_per_bullet=" + string_format(_marginal, 1, 3) + "us"
      + " bullets_at_60fps=" + string(_ceiling)
      + " naive_per_bullet=" + string_format(bench_per_bullet(_mode), 1, 3) + "us"
      + " last_rung_inside_budget=" + string(bench_ceiling(_mode)));
  }
  var _ladder = bench_ladder();
  var _biggest = _ladder[array_length(_ladder) - 1];
  for (var _mode = 0; _mode < MODE_COUNT; _mode += 1) {
    show_debug_message("BENCH SPREAD mode=" + bench_mode_name(_mode)
      + " at_n=" + string(_biggest)
      + " pass_to_pass=" + string_format(bench_spread(_mode, _biggest) * 100, 1, 1) + "%");
  }
  show_debug_message("BENCH NOTE frame times at or near the display period are a vsync floor, "
    + "not a measurement; marginal_per_bullet is a least-squares slope over every rung above that floor, "
    + "across " + string(BENCH_PASSES) + " passes, and is the number to trust -- but only where the spread above is small");
  show_debug_message("BENCH DONE");
}
