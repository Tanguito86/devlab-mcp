var _in = ft_input();

if (_in.roll && roll == 0 && rolls > 0) {
  roll = FT_ROLL_FRAMES;
  rolls -= 1;
  global.ft_rolls_used += 1;
}

var _dx = (_in.right ? 1 : 0) - (_in.left ? 1 : 0);
var _dy = (_in.down ? 1 : 0) - (_in.up ? 1 : 0);
// Diagonals must not be faster than the cardinals.
if (_dx != 0 && _dy != 0) {
  _dx *= 0.7071;
  _dy *= 0.7071;
}
x = clamp(x + _dx * FT_PLAYER_SPEED, 14, room_width - 14);
y = clamp(y + _dy * FT_PLAYER_SPEED, 26, room_height - 14);

if (roll > 0) {
  roll -= 1;
  // The loop is the whole tell that you are invulnerable, so it spins a full
  // turn over its duration rather than wobbling.
  image_angle = (1 - roll / FT_ROLL_FRAMES) * 360;
  image_index = FT_BANK_LEVEL;
} else {
  image_angle = 0;
  image_index = _dx < -0.1 ? FT_BANK_LEFT : (_dx > 0.1 ? FT_BANK_RIGHT : FT_BANK_LEVEL);
}

if (invuln > 0) invuln -= 1;

if (cooldown > 0) cooldown -= 1;
if (_in.fire && cooldown == 0 && roll == 0) {
  cooldown = FT_FIRE_COOLDOWN;
  instance_create_depth(x - 7, y - 6, -5, obj_shot);
  instance_create_depth(x + 7, y - 6, -5, obj_shot);
}
