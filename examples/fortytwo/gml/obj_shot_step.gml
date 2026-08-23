y -= FT_SHOT_SPEED;
if (y < -12) { instance_destroy(); exit; }

var _enemy = instance_place(x, y, obj_enemy);
if (_enemy != noone) {
  ft_explode(_enemy.x, _enemy.y);
  global.ft_kills += 1;
  ft_enemy_killed(_enemy.wave);
  instance_destroy(_enemy);
  instance_destroy();
}
