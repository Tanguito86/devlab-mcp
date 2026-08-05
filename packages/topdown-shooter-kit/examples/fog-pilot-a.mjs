import { readFile } from "node:fs/promises";

import { FogSystem, renderFogSnapshotText } from "../dist/index.js";

const fixture = JSON.parse(await readFile(new URL("../fixtures/fog-pilot-a.json", import.meta.url), "utf8"));
const system = new FogSystem(fixture);

for (const sources of fixture.frames) {
  let result;
  do result = system.update(sources); while (!result.sweepComplete);
}

process.stdout.write(renderFogSnapshotText(system.getSnapshot()));
