-- Every drawable in THAW, emitted as .aseprite files into --script-param outdir.
--
-- Art is written as character maps so the drawing is legible in the source, and
-- every map is checked before a pixel is placed: a mistyped row used to draw
-- transparent, which reads as a hole in the tile rather than as an error.

local TILE = 16

local palette = {
  ["."] = { 0, 0, 0, 0 },
  -- snow floor
  ["f"] = { 223, 233, 242, 255 },
  ["F"] = { 240, 247, 255, 255 },
  ["e"] = { 200, 214, 229, 255 },
  -- rock wall
  ["r"] = { 74, 85, 104, 255 },
  ["R"] = { 113, 128, 150, 255 },
  ["d"] = { 45, 55, 72, 255 },
  -- goal pad
  ["g"] = { 232, 163, 61, 255 },
  ["G"] = { 250, 200, 120, 255 },
  -- ice block
  ["i"] = { 142, 202, 230, 255 },
  ["I"] = { 200, 235, 250, 255 },
  ["j"] = { 69, 123, 157, 255 },
  ["o"] = { 26, 32, 54, 255 },
  -- character
  ["c"] = { 43, 58, 85, 255 },   -- coat
  ["C"] = { 66, 87, 122, 255 },  -- coat light
  ["s"] = { 230, 57, 70, 255 },  -- scarf
  ["k"] = { 240, 200, 168, 255 },-- skin
  ["b"] = { 32, 38, 58, 255 },   -- boots
  ["y"] = { 250, 250, 250, 255 },-- eye white / breath
}

local function check(rows, label, height)
  if #rows ~= (height or TILE) then
    error(label .. " has " .. #rows .. " rows, expected " .. (height or TILE))
  end
  for y, row in ipairs(rows) do
    if #row ~= TILE then
      error(label .. " row " .. y .. " is " .. #row .. " chars, expected " .. TILE)
    end
    for x = 1, TILE do
      if palette[row:sub(x, x)] == nil then
        error(label .. " row " .. y .. " col " .. x .. " uses unknown colour " .. string.format("%q", row:sub(x, x)))
      end
    end
  end
  return rows
end

local function blit(image, rows, originX)
  for y = 0, TILE - 1 do
    local row = rows[y + 1]
    for x = 0, TILE - 1 do
      local c = palette[row:sub(x + 1, x + 1)]
      image:drawPixel(originX + x, y, app.pixelColor.rgba(c[1], c[2], c[3], c[4]))
    end
  end
end

local blank = {}
for _ = 1, TILE do blank[#blank + 1] = string.rep(".", TILE) end

-- Snow, with a few compacted specks so a large floor is not a flat slab.
local floor = {
  "ffffffffffffffff",
  "ffFfffffffefffff",
  "ffffffeffffffFff",
  "fFffffffffffffff",
  "ffffffffFfffffef",
  "ffeffffffffffFff",
  "ffffFfffffffffff",
  "fffffffefffffFff",
  "fFfffffffffeffff",
  "ffffffFfffffffff",
  "ffefffffffffFfff",
  "fffffFffefffffff",
  "ffffffffffffffef",
  "fFffefffffFfffff",
  "ffffffffffffffff",
  "ffeffffFfffffFff",
}

-- Rock, lit from the top-left, with a chipped edge so walls read as solid.
local wall = {
  "RRRRRRRRRRRRRRRR",
  "Rrrrrrrrrrrrrrrd",
  "RrrRrrrrrrRrrrrd",
  "Rrrrrrrdrrrrrrrd",
  "RrrrrrrrrrrrRrrd",
  "RrdrrrrrRrrrrrrd",
  "Rrrrrrrrrrrrrrrd",
  "RrrrrRrrrrrdrrrd",
  "Rrrrrrrrrrrrrrrd",
  "RrrrdrrrrrrrrRrd",
  "RrRrrrrrrrrrrrrd",
  "Rrrrrrrrdrrrrrrd",
  "Rrrrrrrrrrrrrrrd",
  "RrrrrrRrrrdrrrrd",
  "Rrrrrrrrrrrrrrrd",
  "dddddddddddddddd",
}

-- The goal pad: a warm ring inlaid in the snow, so a covered pad still reads.
local goal = {
  "ffffffffffffffff",
  "ffffffffffffffff",
  "ffffggggggggffff",
  "fffgGGGGGGGGgfff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "ffgGffffffffGgff",
  "fffgGGGGGGGGgfff",
  "ffffggggggggffff",
  "ffffffffffffffff",
  "ffffffffffffffff",
}

-- The ice block, bevelled so its facing is unambiguous on a snow floor.
local block = {
  "oooooooooooooooo",
  "oIIIIIIIIIIIIIIo",
  "oIIiiiiiiiiiiIjo",
  "oIiiiiiiiiiiiijo",
  "oIiiIIiiiiiiiijo",
  "oIiiIIiiiiiiiijo",
  "oIiiiiiiiiiiiijo",
  "oIiiiiiiiIiiiijo",
  "oIiiiiiiiIiiiijo",
  "oIiiiiiiiiiiiijo",
  "oIiiiiiiiiiiiijo",
  "oIiiiiiiiiiiiijo",
  "oIiiiiiiiiiiiijo",
  "oIjjjjjjjjjjjjjo",
  "ojjjjjjjjjjjjjjo",
  "oooooooooooooooo",
}

-- Four facings, one per frame: down, left, right, up.
local hero = {
  down = {
    "................",
    ".....oooooo.....",
    "....occCCcco....",
    "....ockkkkco....",
    "....okykkyko....",
    "....okkkkkko....",
    ".....okkkko.....",
    "....osssssso....",
    "...occCCCCcco...",
    "...ocCCCCCCco...",
    "...ocCCCCCCco...",
    "...occCCCCcco...",
    "....occccco.....",
    "....ob....bo....",
    "....obb..bbo....",
    ".....oo..oo.....",
  },
  left = {
    "................",
    ".....oooooo.....",
    "....occcccco....",
    "....okkkkkco....",
    "....oykkkkco....",
    "....okkkkkco....",
    ".....okkkko.....",
    "....ossssso.....",
    "...occCCCcco....",
    "...ocCCCCCco....",
    "...ocCCCCCco....",
    "...occCCCcco....",
    "....occcco......",
    "....ob..bo......",
    "...obb.bbo......",
    "...oo..oo.......",
  },
  right = {
    "................",
    ".....oooooo.....",
    "....occcccco....",
    "....ockkkkko....",
    "....ockkkkyo....",
    "....ockkkkko....",
    ".....okkkko.....",
    "....ossssso.....",
    "....occCCCcco...",
    "....ocCCCCCco...",
    "....ocCCCCCco...",
    "....occCCCcco...",
    "......occcco....",
    "......ob..bo....",
    "......obb.bbo...",
    ".......oo..oo...",
  },
  up = {
    "................",
    ".....oooooo.....",
    "....occCCcco....",
    "....occCCcco....",
    "....occCCcco....",
    "....occCCcco....",
    ".....occcco.....",
    "....osssssso....",
    "...occCCCCcco...",
    "...ocCCCCCCco...",
    "...ocCCCCCCco...",
    "...occCCCCcco...",
    "....occccco.....",
    "....ob....bo....",
    "....obb..bbo....",
    ".....oo..oo.....",
  },
}

local outdir = app.params["outdir"]
if not outdir then error("--script-param outdir is required") end

-- Tileset. Index 0 is GameMaker's reserved blank tile: a cell holding it draws
-- nothing, so the first slot is deliberately empty and the usable tiles start
-- at 1. Painting index 0 expecting floor is the classic way to lose a level.
check(floor, "floor"); check(wall, "wall"); check(goal, "goal")
local tiles = { blank, floor, wall, goal }
local tileset = Sprite(TILE * #tiles, TILE, ColorMode.RGB)
for index, rows in ipairs(tiles) do
  blit(tileset.cels[1].image, rows, (index - 1) * TILE)
end
tileset:saveAs(outdir .. "/ts_thaw.aseprite")

-- Ice block.
check(block, "block")
local blockSprite = Sprite(TILE, TILE, ColorMode.RGB)
blit(blockSprite.cels[1].image, block, 0)
blockSprite:saveAs(outdir .. "/spr_block.aseprite")

-- Hero, one frame per facing in the order the game indexes them.
local facings = { "down", "left", "right", "up" }
local heroSprite = Sprite(TILE, TILE, ColorMode.RGB)
for index, facing in ipairs(facings) do
  check(hero[facing], "hero " .. facing)
  local frame = index == 1 and heroSprite.frames[1] or heroSprite:newEmptyFrame(index)
  frame.duration = 0.2
  local image = Image(TILE, TILE, ColorMode.RGB)
  blit(image, hero[facing], 0)
  heroSprite:newCel(heroSprite.layers[1], frame, image, Point(0, 0))
end
heroSprite:saveAs(outdir .. "/spr_hero.aseprite")

print("ART ok: tileset " .. #tiles .. " tiles, hero " .. #facings .. " facings")
