// A block that has come to rest on a goal is tinted warm, so progress is
// readable without counting pads.
if (thaw_tile(cx, cy) == TILE_GOAL) {
  draw_sprite_ext(sprite_index, 0, x, y, 1, 1, 0, make_colour_rgb(255, 224, 170), 1);
} else {
  draw_self();
}
