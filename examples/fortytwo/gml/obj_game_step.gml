// The sea advances even after the run ends, so a finished screen is not frozen.
global.ft_sea_y += FT_SCROLL;
if (global.ft_sea_y >= sprite_get_height(spr_sea)) global.ft_sea_y -= sprite_get_height(spr_sea);

if (global.ft_over) {
  if (global.ft_testing) exit;
  if (keyboard_check_pressed(ord("R"))) {
    ft_reset_run();
    instance_create_depth(room_width * 0.5, room_height - 70, -10, obj_player);
  }
  exit;
}

global.ft_frame += 1;
ft_run_waves();

if (global.ft_respawn > 0) {
  global.ft_respawn -= 1;
  if (global.ft_respawn == 0) {
    var _player = instance_create_depth(room_width * 0.5, room_height - 70, -10, obj_player);
    _player.invuln = FT_INVULN_FRAMES;
  }
}

// A frame of every wave's opening, captured before anything has been shot at.
if (global.ft_testing) {
  var _waves = ft_waves();
  for (var _i = 0; _i < array_length(_waves); _i += 1) {
    if (global.ft_frame == _waves[_i].at + 40) {
      screen_save("ft-wave" + string(_i + 1) + ".png");
    }
  }
}

if (global.ft_lives <= 0) {
  global.ft_over = true;
  show_debug_message("FT OVER reason=lives score=" + string(global.ft_score)
    + " kills=" + string(global.ft_kills) + " bonuses=" + string(global.ft_bonuses)
    + " rolls=" + string(global.ft_rolls_used) + " lost=" + string(global.ft_lives_lost)
    + " frame=" + string(global.ft_frame));
  if (global.ft_testing) game_end();
  exit;
}

if (ft_waves_exhausted()) {
  global.ft_over = true;
  show_debug_message("FT CLEAR score=" + string(global.ft_score)
    + " kills=" + string(global.ft_kills) + " bonuses=" + string(global.ft_bonuses)
    + " rolls=" + string(global.ft_rolls_used) + " lost=" + string(global.ft_lives_lost)
    + " lives=" + string(global.ft_lives) + " frame=" + string(global.ft_frame));
  if (global.ft_testing) {
    screen_save("ft-clear.png");
    game_end();
  }
}
