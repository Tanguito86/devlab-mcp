-- Every drawable in FORTYTWO.
--
-- The player and the enemy are character maps, because they are the shapes the
-- eye actually reads and a pixel in the wrong place is visible. The sea, the
-- explosion and the two bullets are generated: they are texture and motion, and
-- hand-placing four hundred rows of water would be worse, not better.

local palette = {
  ["."] = { 0, 0, 0, 0 },
  -- airframe
  ["o"] = { 26, 30, 44, 255 },    -- outline
  ["a"] = { 118, 132, 152, 255 }, -- alloy
  ["A"] = { 176, 190, 208, 255 }, -- alloy lit
  ["s"] = { 78, 88, 108, 255 },   -- alloy shade
  ["g"] = { 108, 196, 214, 255 }, -- canopy glass
  ["G"] = { 176, 232, 240, 255 }, -- canopy glare
  ["r"] = { 208, 62, 62, 255 },   -- roundel / markings
  ["y"] = { 240, 190, 74, 255 },  -- prop hub
  -- enemy
  ["e"] = { 116, 100, 72, 255 },  -- olive
  ["E"] = { 190, 174, 132, 255 }, -- olive lit
  ["d"] = { 62, 52, 40, 255 },    -- olive shade
}

local function check(rows, label, w)
  for y, row in ipairs(rows) do
    if #row ~= w then error(label .. " row " .. y .. " is " .. #row .. " chars, expected " .. w) end
    for x = 1, w do
      if palette[row:sub(x, x)] == nil then
        error(label .. " row " .. y .. " col " .. x .. " uses unknown colour " .. string.format("%q", row:sub(x, x)))
      end
    end
  end
  if #rows ~= w then error(label .. " has " .. #rows .. " rows, expected " .. w) end
  return rows
end

local function blit(image, rows, ox, oy, w)
  for y = 0, w - 1 do
    local row = rows[y + 1]
    for x = 0, w - 1 do
      local c = palette[row:sub(x + 1, x + 1)]
      image:drawPixel(ox + x, oy + y, app.pixelColor.rgba(c[1], c[2], c[3], c[4]))
    end
  end
end

-- Twin-boom fighter, 24x24, banking left / level / banking right. The banks are
-- not mirrored copies: the near wing shortens and the far one lengthens, which
-- is what makes a bank read at this size.
local playerLevel = {
  "........................",
  "..........oyo...........",
  "..........oyo...........",
  ".........oaAao..........",
  ".........oaAao..........",
  "....o.....oAo.....o.....",
  "...oao...oaAao...oao....",
  "...oao..oaAGAao..oao....",
  "...oao..oaAgAao..oao....",
  "..oaAao.oaAgAao.oaAao...",
  "..oaAao.oaAgAao.oaAao...",
  "..oaAaooaaAgAaaooaAao...",
  "..oaAaoaaaAgAaaaoaAao...",
  ".ooaaaoaArAgArAaoaaaoo..",
  ".oaaaaoaaaAgAaaaoaaaao..",
  ".oassaooaaAaAaaooassao..",
  ".oassao.oaaaaaao.oassao.",
  "..osso..osaaaaso..osso..",
  "..osso...osaaso...osso..",
  "...oo....oasao....oo....",
  ".........oasao..........",
  "..........oso...........",
  "..........ooo...........",
  "........................",
}

-- A bank is generated rather than drawn. At 24 pixels a one-pixel shift of the
-- booms is invisible; squashing the whole airframe horizontally and sliding it
-- toward the raised wing is what actually reads as roll, and it cannot drift
-- out of register with the level frame the way a second hand-drawn map can.
--
-- Sampling the nearest source column loses the canopy and the prop hub: they
-- are two pixels wide, a 0.62 squeeze makes them one and a bit, and whether
-- they survive comes down to phase. So each output column takes the
-- highest-priority colour among the columns it covers instead. Detail wins over
-- body, body wins over outline, and outline wins over nothing.
local BANK_PRIORITY = { ["G"] = 7, ["g"] = 6, ["y"] = 6, ["r"] = 5, ["A"] = 4, ["a"] = 3, ["s"] = 2, ["o"] = 1, ["."] = 0 }

local function bankedPixel(rows, w, squeeze, shift)
  local centre = (w - 1) / 2
  local half = 0.5 / squeeze
  return function(x, y)
    local source = centre + (x - centre - shift) / squeeze
    local from = math.floor(source - half + 0.5)
    local to = math.floor(source + half + 0.5)
    local best, bestRank = ".", -1
    for sx = from, to do
      if sx >= 0 and sx <= w - 1 then
        local ch = rows[y + 1]:sub(sx + 1, sx + 1)
        local rank = BANK_PRIORITY[ch] or 0
        if rank > bestRank then best, bestRank = ch, rank end
      end
    end
    return best
  end
end

-- Enemy fighter, 16x16, nose-down toward the player.
local enemy = {
  "................",
  "................",
  "......oddo......",
  "......oEEo......",
  ".o....oEEo....o.",
  "oeo..oeEEeo..oeo",
  "oeo.oeeEEeeo.oeo",
  "oEo.oeeEEeeo.oEo",
  "oEooeeeEEeeeooEo",
  "oEoeeedEEdeeeoEo",
  "oeoeeeeEEeeeeoeo",
  ".ooeedeEEedeeoo.",
  "..ooeeeddeeeoo..",
  "...oodeeeedoo...",
  ".....ooddoo.....",
  "................",
}

local outdir = app.params["outdir"]
if not outdir then error("--script-param outdir is required") end

check(playerLevel, "player level", 24)
check(enemy, "enemy", 16)

-- Frame order is left, level, right, so image_index maps straight to bank.
local player = Sprite(24, 24, ColorMode.RGB)
local banks = {
  bankedPixel(playerLevel, 24, 0.62, -2.5),
  bankedPixel(playerLevel, 24, 1.00, 0),
  bankedPixel(playerLevel, 24, 0.62, 2.5),
}
for index, fetch in ipairs(banks) do
  local frame = index == 1 and player.frames[1] or player:newEmptyFrame(index)
  frame.duration = 0.1
  local image = Image(24, 24, ColorMode.RGB)
  for y = 0, 23 do
    for x = 0, 23 do
      local c = palette[fetch(x, y)]
      image:drawPixel(x, y, app.pixelColor.rgba(c[1], c[2], c[3], c[4]))
    end
  end
  player:newCel(player.layers[1], frame, image, Point(0, 0))
end
player:saveAs(outdir .. "/spr_player.aseprite")

local enemySprite = Sprite(16, 16, ColorMode.RGB)
blit(enemySprite.cels[1].image, enemy, 0, 0, 16)
enemySprite:saveAs(outdir .. "/spr_enemy.aseprite")

-- Bullets: a lit core inside a saturated body, which is what keeps a 4px shape
-- visible over water.
local function bullet(w, h, core, body, edge, name)
  local sprite = Sprite(w, h, ColorMode.RGB)
  local image = sprite.cels[1].image
  local cx, cy = (w - 1) / 2, (h - 1) / 2
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local dx = (x - cx) / (w / 2)
      local dy = (y - cy) / (h / 2)
      local d = math.sqrt(dx * dx + dy * dy)
      local c
      if d > 1.0 then c = { 0, 0, 0, 0 }
      elseif d > 0.75 then c = edge
      elseif d > 0.35 then c = body
      else c = core end
      image:drawPixel(x, y, app.pixelColor.rgba(c[1], c[2], c[3], c[4]))
    end
  end
  sprite:saveAs(outdir .. "/" .. name .. ".aseprite")
end

bullet(4, 10, { 255, 252, 232, 255 }, { 250, 214, 96, 255 }, { 196, 128, 32, 255 }, "spr_shot")
bullet(6, 6, { 255, 236, 240, 255 }, { 236, 84, 108, 255 }, { 128, 26, 48, 255 }, "spr_eshot")

-- Explosion: an expanding shell that hollows out and thins as it cools. The
-- first attempt filled the interior on every frame, so the last two read as
-- solid brown discs rather than as smoke coming apart.
local boom = Sprite(16, 16, ColorMode.RGB)
local shells = {
  -- outer radius, ring thickness, alpha, hot / mid tones
  { outer = 4.5,  thickness = 4.5, alpha = 255, hot = { 255, 250, 220 }, mid = { 255, 186, 72 } },
  { outer = 7.0,  thickness = 3.4, alpha = 255, hot = { 255, 232, 168 }, mid = { 244, 148, 48 } },
  { outer = 9.2,  thickness = 2.2, alpha = 210, hot = { 236, 178, 108 }, mid = { 186, 100, 44 } },
  { outer = 11.0, thickness = 1.3, alpha = 120, hot = { 150, 118, 100 }, mid = { 96, 72, 62 } },
}
for index, shell in ipairs(shells) do
  local frame = index == 1 and boom.frames[1] or boom:newEmptyFrame(index)
  frame.duration = 0.05
  local image = Image(16, 16, ColorMode.RGB)
  for y = 0, 15 do
    for x = 0, 15 do
      local dx, dy = x - 7.5, y - 7.5
      local d = math.sqrt(dx * dx + dy * dy)
      -- A ragged rim, so the shell never reads as a drawn circle.
      local ragged = shell.outer - ((x * 7 + y * 13 + index * 29) % 5) * 0.4
      local inner = ragged - shell.thickness
      if d <= ragged and d >= inner then
        local hot = (ragged - d) > shell.thickness * 0.45
        local tone = hot and shell.hot or shell.mid
        image:drawPixel(x, y, app.pixelColor.rgba(tone[1], tone[2], tone[3], shell.alpha))
      else
        image:drawPixel(x, y, app.pixelColor.rgba(0, 0, 0, 0))
      end
    end
  end
  boom:newCel(boom.layers[1], frame, image, Point(0, 0))
end
boom:saveAs(outdir .. "/spr_boom.aseprite")

-- Sea: 64x64 and tileable by construction, since every wave is placed with
-- wrapped coordinates. Deep water with a few crests, dark enough that a bullet
-- reads over it.
local sea = Sprite(64, 64, ColorMode.RGB)
local water = sea.cels[1].image
local deep = { 18, 42, 78 }
local mid = { 26, 58, 102 }
for y = 0, 63 do
  for x = 0, 63 do
    -- A gentle swell, periodic in both axes so the tile meets itself.
    local swell = math.sin(x * math.pi / 32 + y * math.pi / 16) * 0.5 + 0.5
    local t = swell * 0.6
    local c = {
      math.floor(deep[1] + (mid[1] - deep[1]) * t),
      math.floor(deep[2] + (mid[2] - deep[2]) * t),
      math.floor(deep[3] + (mid[3] - deep[3]) * t),
    }
    water:drawPixel(x, y, app.pixelColor.rgba(c[1], c[2], c[3], 255))
  end
end
local crests = { { 6, 9, 5 }, { 30, 18, 7 }, { 51, 27, 4 }, { 14, 40, 6 }, { 40, 52, 8 }, { 58, 60, 5 } }
for _, crest in ipairs(crests) do
  local cx, cy, len = crest[1], crest[2], crest[3]
  for i = 0, len - 1 do
    local x = (cx + i) % 64
    local y = (cy + math.floor(i / 4)) % 64
    water:drawPixel(x, y, app.pixelColor.rgba(120, 168, 208, 255))
    water:drawPixel(x, (y + 1) % 64, app.pixelColor.rgba(58, 96, 148, 255))
  end
end
sea:saveAs(outdir .. "/spr_sea.aseprite")

print("ART ok: player 3 frames, enemy, 2 bullets, boom 4 frames, sea 64x64")
