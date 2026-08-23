var _ladder = bench_ladder();

// instance_destroy is processed at the end of a step, so the previous rung is
// only really gone once one has elapsed.
if (global.bench_phase == -1) {
  bench_spawn(global.bench_mode, _ladder[global.bench_rung]);
  global.bench_phase = 0;
  global.bench_frame = 0;
  exit;
}

// The hitbox moves, so the collision test cannot fold into a constant.
global.bench_px = room_width * 0.5 + dcos(current_time * 0.06) * 60;

var _mark = get_timer();
if (global.bench_mode == MODE_AOS) bench_update_aos();
else if (global.bench_mode == MODE_SOA) bench_update_soa();
var _updateUs = get_timer() - _mark;

global.bench_frame += 1;

if (global.bench_phase == 0) {
  if (global.bench_frame >= BENCH_WARMUP) {
    global.bench_phase = 1;
    global.bench_frame = 0;
    global.bench_accum = 0;
    global.bench_update_us = 0;
    global.bench_draw_us = 0;
  }
  exit;
}

global.bench_accum += delta_time;
global.bench_update_us += _updateUs;
if (global.bench_frame < BENCH_FRAMES) exit;

var _count = _ladder[global.bench_rung];
var _average = global.bench_accum / BENCH_FRAMES;
bench_record(global.bench_mode, _count, _average,
  global.bench_update_us / BENCH_FRAMES, global.bench_draw_us / BENCH_FRAMES);

var _abandon = _average > BENCH_ABANDON_US;
global.bench_rung += 1;

if (_abandon || global.bench_rung >= array_length(_ladder)) {
  if (_abandon) {
    show_debug_message("BENCH ABANDON mode=" + bench_mode_name(global.bench_mode) + " past n=" + string(_count));
  }
  global.bench_rung = 0;
  global.bench_mode += 1;
  if (global.bench_mode >= MODE_COUNT) {
    // A single pass ranked the three modes differently every time it ran, by
    // as much as thirty per cent. Repeating the whole ladder is what makes a
    // ranking mean anything.
    global.bench_mode = 0;
    global.bench_pass += 1;
    show_debug_message("BENCH PASS " + string(global.bench_pass) + "/" + string(BENCH_PASSES) + " complete");
    if (global.bench_pass >= BENCH_PASSES) {
      bench_clear();
      bench_report();
      game_end();
      exit;
    }
  }
}

bench_begin();
