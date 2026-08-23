t += 1;
var _at = ft_path(kind, t);
x = _at.x;
y = _at.y;

if (t > 40 && ft_off_screen(x, y)) {
  // It escaped rather than died, so the formation can no longer be completed
  // and no bonus is owed. Nothing to record: the bonus counts kills.
  instance_destroy();
  exit;
}

if (fires && instance_exists(obj_player) && y < obj_player.y - 40 && (t % 48) == 0) {
  var _shot = instance_create_depth(x, y + 8, -5, obj_eshot);
  var _aim = point_direction(x, y, obj_player.x, obj_player.y);
  _shot.vx = lengthdir_x(2.4, _aim);
  _shot.vy = lengthdir_y(2.4, _aim);
}

if (!instance_exists(obj_player)) exit;
if (obj_player.roll > 0 || obj_player.invuln > 0) exit;
if (point_distance(x, y, obj_player.x, obj_player.y) > 12) exit;

ft_explode(x, y);
ft_explode(obj_player.x, obj_player.y);
instance_destroy(obj_player);
global.ft_lives -= 1;
global.ft_lives_lost += 1;
global.ft_respawn = FT_RESPAWN_FRAMES;
instance_destroy();
