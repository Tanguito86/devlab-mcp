var _mark = get_timer();
if (global.bench_mode == MODE_AOS) bench_draw_aos();
else if (global.bench_mode == MODE_SOA) bench_draw_soa();
if (global.bench_phase == 1) global.bench_draw_us += get_timer() - _mark;
