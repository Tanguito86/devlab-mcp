x += vx;
y += vy;
if (ft_off_screen(x, y)) { instance_destroy(); exit; }

if (!instance_exists(obj_player)) exit;
if (obj_player.roll > 0 || obj_player.invuln > 0) exit;
if (point_distance(x, y, obj_player.x, obj_player.y) > 8) exit;

ft_explode(obj_player.x, obj_player.y);
instance_destroy(obj_player);
global.ft_lives -= 1;
global.ft_lives_lost += 1;
global.ft_respawn = FT_RESPAWN_FRAMES;
instance_destroy();
