-- Builds the `output_tileset.png` texture page GameMaker expects beside a
-- GMTileSet: every tile re-laid-out into a (tile + 2*border) cell, with the
-- tile's edge pixels bled outward so filtering never samples a neighbour.
--
--   aseprite -b --script-param src=... --script-param out=...
--            --script-param tile=16 --script-param border=2
--            --script-param columns=4 --script tileset-page.lua

local src = app.params["src"]
local out = app.params["out"]
local tile = tonumber(app.params["tile"])
local border = tonumber(app.params["border"] or "2")
local columns = tonumber(app.params["columns"])
if not (src and out and tile and columns) then
  error("src, out, tile and columns are required")
end

local source = app.open(src)
if source == nil then error("cannot open " .. src) end
local sourceImage = Image(source.cels[1].image)
local sourceColumns = math.floor(source.width / tile)
local sourceRows = math.floor(source.height / tile)
local count = sourceColumns * sourceRows

local cell = tile + border * 2
local rows = math.ceil(count / columns)
local page = Sprite(columns * cell, rows * cell, ColorMode.RGB)
local target = page.cels[1].image

for index = 0, count - 1 do
  local sx = (index % sourceColumns) * tile
  local sy = math.floor(index / sourceColumns) * tile
  local dx = (index % columns) * cell + border
  local dy = math.floor(index / columns) * cell + border

  for y = 0, tile - 1 do
    for x = 0, tile - 1 do
      target:drawPixel(dx + x, dy + y, sourceImage:getPixel(sx + x, sy + y))
    end
  end

  -- Bleed: clamp-to-edge, so the border repeats the nearest tile pixel.
  for offset = 1, border do
    for x = 0, tile - 1 do
      target:drawPixel(dx + x, dy - offset, sourceImage:getPixel(sx + x, sy))
      target:drawPixel(dx + x, dy + tile - 1 + offset, sourceImage:getPixel(sx + x, sy + tile - 1))
    end
    for y = 0, tile - 1 do
      target:drawPixel(dx - offset, dy + y, sourceImage:getPixel(sx, sy + y))
      target:drawPixel(dx + tile - 1 + offset, dy + y, sourceImage:getPixel(sx + tile - 1, sy + y))
    end
  end
  -- Corners take the nearest tile corner.
  for oy = 1, border do
    for ox = 1, border do
      target:drawPixel(dx - ox, dy - oy, sourceImage:getPixel(sx, sy))
      target:drawPixel(dx + tile - 1 + ox, dy - oy, sourceImage:getPixel(sx + tile - 1, sy))
      target:drawPixel(dx - ox, dy + tile - 1 + oy, sourceImage:getPixel(sx, sy + tile - 1))
      target:drawPixel(dx + tile - 1 + ox, dy + tile - 1 + oy, sourceImage:getPixel(sx + tile - 1, sy + tile - 1))
    end
  end
end

page:saveAs(out)
print("PAGE " .. page.width .. "x" .. page.height .. " for " .. count .. " tile(s)")
