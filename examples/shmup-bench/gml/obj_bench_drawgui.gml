draw_set_colour(c_white);
draw_text(6, 4, bench_mode_name(global.bench_mode) + "  n=" + string(bench_ladder()[global.bench_rung]));
draw_text(6, 18, "hits " + string(global.bench_hits));
