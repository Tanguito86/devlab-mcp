// Deliberately the same arithmetic as bench_update_structs, so the two modes
// differ only in how the work is dispatched.
x += vx;
y += vy;
if (x < 0) x += room_width; else if (x >= room_width) x -= room_width;
if (y < 0) y += room_height; else if (y >= room_height) y -= room_height;
var _dx = x - global.bench_px;
var _dy = y - global.bench_py;
if (_dx * _dx + _dy * _dy < 9) global.bench_hits += 1;
