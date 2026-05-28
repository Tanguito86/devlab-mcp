import test from "node:test";
import assert from "node:assert/strict";
import { filterUiNodes } from "../dist/uiFilters.js";
import { formatUiMatch, parseUiNodes } from "../dist/uiParser.js";

test("parseUiNodes reads common uiautomator attributes", () => {
  const xml = `<hierarchy>
    <node text="Play &amp; Pause" resource-id="com.example:id/play" class="android.widget.Button" package="com.example" clickable="true" enabled="true" bounds="[10,20][110,220]" />
  </hierarchy>`;

  const nodes = parseUiNodes(xml);

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].text, "Play & Pause");
  assert.equal(nodes[0].resourceId, "com.example:id/play");
  assert.equal(nodes[0].clickable, true);
  assert.deepEqual(nodes[0].bounds, { left: 10, top: 20, right: 110, bottom: 220 });
});

test("filterUiNodes combines string and boolean filters", () => {
  const nodes = parseUiNodes(`<node text="DSP" resource-id="com.example:id/dsp" class="android.widget.TextView" package="com.example" clickable="false" enabled="true" bounds="[0,0][100,100]" />`);
  const matches = filterUiNodes(nodes, { text: "dsp", className: "textview", enabled: true });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].centerX, 50);
  assert.match(formatUiMatch(matches[0], 0), /\[0\] "DSP"/);
});
