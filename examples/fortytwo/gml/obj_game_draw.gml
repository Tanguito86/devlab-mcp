// Drawn here rather than in Draw Begin, and at a depth between the room's
// background layer and the gameplay.
//
// Draw Begin runs before any layer is painted, and an authored room's
// background layer is opaque black -- so a sea drawn in Draw Begin is there,
// and then the black paints straight over it. Nothing errors; the screen is
// simply black. The layer sits at depth 100, so this object sits at 50.
var _height = sprite_get_height(spr_sea);
draw_sprite_tiled_ext(spr_sea, 0, 0, global.ft_sea_y - _height, 1, 1, c_white, 1);
