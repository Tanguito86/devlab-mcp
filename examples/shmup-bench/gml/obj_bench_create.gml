// Two independent caps. game_set_speed lifts the engine's own pacing; vsync
// paces against the display regardless, and it was vsync that produced five
// identical 6.944 ms readings on a 144 Hz panel in the first attempt.
game_set_speed(10000, gamespeed_fps);
display_reset(0, false);

// A fixed seed, so two runs place the same bullets and are comparable.
random_set_seed(20260823);

global.bench_aos = [];
global.bench_x = [];
global.bench_y = [];
global.bench_vx = [];
global.bench_vy = [];
global.bench_hits = 0;
global.bench_results = [];
global.bench_mode = MODE_AOS;
global.bench_rung = 0;
global.bench_pass = 0;
global.bench_px = room_width * 0.5;
global.bench_py = room_height - 48;
global.bench_update_us = 0;
global.bench_draw_us = 0;

bench_begin();
show_debug_message("BENCH START room=" + string(room_width) + "x" + string(room_height));
