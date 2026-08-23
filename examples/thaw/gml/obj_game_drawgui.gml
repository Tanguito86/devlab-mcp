// A strip behind the text, because white on pale snow and grey rock is
// unreadable at this size. The lines are kept short: the default font is wide
// enough that a full sentence runs off a 320px screen.
draw_set_alpha(0.72);
draw_set_colour(make_colour_rgb(14, 18, 30));
draw_rectangle(0, 0, room_width, 26, false);
draw_set_alpha(1);

draw_set_colour(c_white);
draw_text(6, 1, "THAW  " + string(global.thaw_level + 1) + "/" + string(array_length(thaw_levels()))
  + "   moves " + string(global.thaw_moves));

if (global.thaw_won) {
  draw_set_colour(make_colour_rgb(255, 208, 128));
  if (global.thaw_level >= array_length(thaw_levels()) - 1) draw_text(6, 13, "All clear.  R replays.");
  else draw_text(6, 13, "Solved.  Space next.  R retry.");
} else {
  draw_set_colour(make_colour_rgb(168, 190, 214));
  draw_text(6, 13, "Arrows/WASD move.  R retry.");
}
draw_set_colour(c_white);
