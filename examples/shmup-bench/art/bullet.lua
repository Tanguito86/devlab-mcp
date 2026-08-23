-- One 8x8 danmaku bullet: bright core, saturated ring, dark outline. That
-- silhouette is what makes a bullet readable over a busy background, and it is
-- also the realistic draw cost, so the benchmark measures the real thing.
local W = 8

local palette = {
  ["."] = { 0, 0, 0, 0 },
  ["o"] = { 40, 10, 30, 255 },
  ["r"] = { 226, 54, 96, 255 },
  ["R"] = { 255, 122, 150, 255 },
  ["w"] = { 255, 246, 250, 255 },
}

local bullet = {
  "..oooo..",
  ".orrrro.",
  "orRRwRro",
  "orRwwwro",
  "orRwwRro",
  "orrRRrro",
  ".orrrro.",
  "..oooo..",
}

for y, row in ipairs(bullet) do
  if #row ~= W then error("bullet row " .. y .. " is " .. #row .. " chars, expected " .. W) end
  for x = 1, W do
    if palette[row:sub(x, x)] == nil then
      error("bullet row " .. y .. " col " .. x .. " uses unknown colour " .. string.format("%q", row:sub(x, x)))
    end
  end
end

local outdir = app.params["outdir"]
if not outdir then error("--script-param outdir is required") end

local sprite = Sprite(W, W, ColorMode.RGB)
local image = sprite.cels[1].image
for y = 0, W - 1 do
  for x = 0, W - 1 do
    local c = palette[bullet[y + 1]:sub(x + 1, x + 1)]
    image:drawPixel(x, y, app.pixelColor.rgba(c[1], c[2], c[3], c[4]))
  end
end
sprite:saveAs(outdir .. "/spr_bullet.aseprite")
print("ART ok: bullet " .. W .. "x" .. W)
