draw_set_alpha(0.72);
draw_set_colour(make_colour_rgb(8, 16, 30));
draw_rectangle(0, 0, room_width, 26, false);
draw_set_alpha(1);

draw_set_colour(c_white);
draw_text(6, 1, "SCORE " + string(global.ft_score));
draw_text(6, 13, "LIVES " + string(global.ft_lives)
  + "   ROLL " + string(instance_exists(obj_player) ? obj_player.rolls : 0));

if (global.ft_over) {
  draw_set_colour(make_colour_rgb(255, 208, 128));
  draw_text(6, room_height - 20, global.ft_lives > 0 ? "ALL CLEAR.  R restarts." : "DOWN.  R restarts.");
}
draw_set_colour(c_white);
