// Rolling and respawn invulnerability look different on purpose: a roll is
// something you did, a respawn is something that happened to you.
if (roll > 0) {
  draw_sprite_ext(sprite_index, image_index, x, y, 1, 1, image_angle, make_colour_rgb(200, 240, 255), 1);
} else if (invuln > 0 && (invuln div 4) % 2 == 0) {
  draw_sprite_ext(sprite_index, image_index, x, y, 1, 1, 0, c_white, 0.35);
} else {
  draw_self();
}
