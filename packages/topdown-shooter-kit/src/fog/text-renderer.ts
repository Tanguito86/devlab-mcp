import type { FogSnapshot } from "./fog-system.js";

export function renderFogSnapshotText(snapshot: FogSnapshot): string {
  const tierRows: string[] = [];
  const obstacleRows: string[] = [];
  for (let y = 0; y < snapshot.height; y += 1) {
    let tiers = "";
    let obstacles = "";
    for (let x = 0; x < snapshot.width; x += 1) {
      const index = y * snapshot.width + x;
      const cell = snapshot.cells[index]!;
      tiers += cell.currentVisible ? "3" : String(cell.knowledgeTier);
      obstacles += snapshot.obstacles[index] ? "#" : ".";
    }
    tierRows.push(tiers);
    obstacleRows.push(obstacles);
  }
  return `tiers\n${tierRows.join("\n")}\nobstacles\n${obstacleRows.join("\n")}\n`;
}
