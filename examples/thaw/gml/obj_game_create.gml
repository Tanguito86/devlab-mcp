global.thaw_testing = thaw_testing();
global.thaw_w = 0;
global.thaw_h = 0;
global.thaw_level = 0;
global.thaw_moves = 0;
global.thaw_won = false;
global.thaw_replay = "";
global.thaw_cursor = 1;

// A 320x240 room is unreadable at 1:1 on a modern display.
if (!global.thaw_testing) window_set_size(320 * 3, 240 * 3);

thaw_load(0);
show_debug_message("THAW ready testing=" + string(global.thaw_testing) + " levels=" + string(array_length(thaw_levels())));
