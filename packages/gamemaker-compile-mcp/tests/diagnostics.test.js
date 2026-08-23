import assert from "node:assert/strict";
import test from "node:test";

import { MAX_DIAGNOSTICS, MAX_MESSAGE_LENGTH, parseIgorDiagnostics } from "../dist/diagnostics.js";

/**
 * Verbatim excerpt of a real failing build captured from Igor with runtime
 * 2024.14.3.260. The surrounding noise is kept so the parser is exercised
 * against the log it will actually receive, not a tidied-up version.
 */
const REAL_LOG = [
  "Options: C:\\ProgramData\\GameMakerStudio2\\Cache\\runtimes\\runtime-2024.14.3.260\\bin\\platform_setting_defaults.json",
  "Release build",
  "[Compile] Run asset compiler",
  "Error : gml_Object_obj_gm_bridge_pilot_Create_0(1) : cannot redeclare a builtin variable",
  "Error : gml_Object_obj_gm_bridge_pilot_Create_0(1) : unexpected symbol \";\" in expression",
  "Error : gml_Object_obj_gm_bridge_pilot_Create_0(1) : malformed assignment statement",
  "Writing Chunk... LOCL size ... 0.00 MB",
  "Stats : GMA : Elapsed=206.0828",
  "C:\\ProgramData\\GameMakerStudio2\\Cache\\runtimes\\runtime-2024.14.3.260/bin/assetcompiler/windows/x64/GMAssetCompiler.dll exited with non-zero status (1)",
  "--- STDERR ---",
  "",
].join("\n");

test("REAL LOG: extracts every compiler error and ignores the noise", () => {
  const report = parseIgorDiagnostics(REAL_LOG);
  assert.equal(report.errorCount, 3);
  assert.equal(report.warningCount, 0);
  assert.equal(report.truncated, false);
  assert.equal(report.diagnostics.length, 3);
  for (const diagnostic of report.diagnostics) {
    assert.equal(diagnostic.severity, "error");
    assert.equal(diagnostic.object, "obj_gm_bridge_pilot");
    assert.equal(diagnostic.event, "Create_0");
    assert.equal(diagnostic.line, 1);
  }
  assert.equal(report.diagnostics[1].message, 'unexpected symbol ";" in expression');
});

test("REAL LOG: chunk, stats and compiler-exit lines are never diagnostics", () => {
  const report = parseIgorDiagnostics(REAL_LOG);
  for (const diagnostic of report.diagnostics) {
    assert.equal(/Writing Chunk|Stats|GMAssetCompiler/.test(diagnostic.message), false);
  }
});

test("SYMBOLS: object events, scripts and unknown shapes each decompose predictably", () => {
  const log = [
    "Error : gml_Object_obj_player_Step_0(12) : variable not set",
    "Error : gml_Object_obj_ui_menu_Draw_64(3) : bad draw call",
    "Error : gml_Script_scr_damage(7) : missing argument",
    "Error : gml_GlobalScript_scr_init(1) : bad global",
    "Error : something_else(9) : opaque symbol",
  ].join("\n");
  const [step, draw, script, globalScript, opaque] = parseIgorDiagnostics(log).diagnostics;
  assert.equal(step.object, "obj_player");
  assert.equal(step.event, "Step_0");
  assert.equal(draw.object, "obj_ui_menu", "the object name may itself contain underscores");
  assert.equal(draw.event, "Draw_64");
  assert.equal(script.script, "scr_damage");
  assert.equal(globalScript.script, "scr_init");
  assert.equal(opaque.symbol, "something_else");
  assert.equal(opaque.object, undefined);
  assert.equal(opaque.script, undefined);
});

test("WARNINGS: counted separately from errors", () => {
  const report = parseIgorDiagnostics([
    "Warning : gml_Object_obj_a_Create_0(2) : deprecated function",
    "Error : gml_Object_obj_a_Create_0(3) : broken",
  ].join("\n"));
  assert.equal(report.warningCount, 1);
  assert.equal(report.errorCount, 1);
  assert.equal(report.diagnostics[0].severity, "warning");
});

test("DEDUPE: an identical diagnostic repeated in the log is reported once", () => {
  const line = "Error : gml_Object_obj_a_Create_0(1) : same problem";
  const report = parseIgorDiagnostics([line, line, line].join("\n"));
  assert.equal(report.diagnostics.length, 1);
  assert.equal(report.errorCount, 1);
});

test("LEAK: a path inside a compiler message is scrubbed", () => {
  const report = parseIgorDiagnostics([
    "Error : gml_Object_obj_a_Create_0(1) : cannot open C:\\Users\\someone\\secret\\thing.png",
    "Error : gml_Object_obj_a_Create_0(2) : missing /home/someone/project/asset.png",
  ].join("\n"));
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("someone"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(/[A-Za-z]:\\\\/.test(serialized), false);
  assert.ok(report.diagnostics[0].message.includes("<path>"));
});

test("LEAK: absolute paths with spaces are scrubbed as complete units", () => {
  const report = parseIgorDiagnostics([
    "Error : gml_Object_obj_a_Create_0(1) : failed at C:\\Users\\Alice\\My Project\\private file.gml: unexpected token",
    "Warning : gml_Script_scr_a(2) : failed at \\\\build-server\\Private Share\\game files\\secret.yy; unavailable",
    "Error : gml_Script_scr_b(3) : failed at /home/alice/My Project/private/script.gml: unexpected token",
    "Warning : gml_Script_scr_c(4) : output directory C:\\Users\\Alice\\My Project is unavailable",
  ].join("\n"));
  const serialized = JSON.stringify(report);
  for (const leaked of ["Alice", "My Project", "private file", "build-server", "Private Share", "game files", "secret.yy", "/home/alice", "private/script.gml"]) {
    assert.equal(serialized.includes(leaked), false, `${leaked} must not survive path scrubbing`);
  }
  assert.equal(report.diagnostics.every(({ message }) => message.includes("<path>")), true);
});

test("LEAK: a path presented as the compiler symbol is never reflected", () => {
  const report = parseIgorDiagnostics([
    "Error : C:\\Users\\Alice\\secret\\Player.gml(12) : unexpected symbol",
    "Warning : /home/alice/private/Player.gml(3) : deprecated",
  ].join("\n"));
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("Alice"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("alice"), false);
  assert.equal(serialized.includes("private"), false);
  assert.deepEqual(report.diagnostics.map(({ symbol }) => symbol), ["<path>", "<path>"]);
});

test("CAP: a flood of diagnostics is truncated but still counted", () => {
  const lines = Array.from({ length: MAX_DIAGNOSTICS + 25 }, (_, index) =>
    `Error : gml_Object_obj_a_Create_0(${index + 1}) : problem ${index}`);
  const report = parseIgorDiagnostics(lines.join("\n"));
  assert.equal(report.diagnostics.length, MAX_DIAGNOSTICS);
  assert.equal(report.errorCount, MAX_DIAGNOSTICS + 25);
  assert.equal(report.truncated, true);
});

test("CAP: an absurdly long message is clipped", () => {
  const report = parseIgorDiagnostics(`Error : gml_Object_obj_a_Create_0(1) : ${"x".repeat(5_000)}`);
  assert.ok(report.diagnostics[0].message.length <= MAX_MESSAGE_LENGTH);
});

test("EMPTY: a clean or unrelated log yields nothing rather than guesses", () => {
  for (const log of ["", "Release build\nIgor complete.", "totally unrelated text"]) {
    const report = parseIgorDiagnostics(log);
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.errorCount, 0);
    assert.equal(report.truncated, false);
  }
});

test("MALFORMED: lines that only look like diagnostics are skipped", () => {
  const report = parseIgorDiagnostics([
    "Error : no line number here : whatever",
    "Error : gml_Object_obj_a_Create_0(notanumber) : nope",
    "Errors were found",
  ].join("\n"));
  assert.deepEqual(report.diagnostics, []);
});
