global.ft_testing = ft_testing();
random_set_seed(19420101);
show_debug_message("FT BOOT testing=" + string(global.ft_testing));

// The sea is tiled in this object's Draw event rather than set up as a
// background layer.
//
// An authored room declares its background layer with spriteId null, and
// layer_background_get_id on such a layer faults rather than returning -1 --
// which on a headless run is an invisible "Code Error" dialog and a hang, with
// no way to read the message. Tiling the sprite needs no layer element to
// exist, is one call, and cannot fail that way.
global.ft_sea_y = 0;
// In front of the room's background layer and behind everything that plays.
// The layer is at depth 100 -- an authored room, not the 200 the IDE writes --
// and higher depth means further back, so 150 put the sea behind the black.
depth = 50;

if (!global.ft_testing) window_set_size(room_width * 2, room_height * 2);

ft_reset_run();
instance_create_depth(room_width * 0.5, room_height - 70, -10, obj_player);

show_debug_message("FT START testing=" + string(global.ft_testing)
  + " room=" + string(room_width) + "x" + string(room_height)
  + " waves=" + string(array_length(ft_waves())));
