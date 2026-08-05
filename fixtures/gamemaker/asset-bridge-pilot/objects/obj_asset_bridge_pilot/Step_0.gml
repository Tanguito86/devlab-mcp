bridge_ticks += 1;
if (bridge_ticks >= 90) {
    if (bridge_evidence_dir != "") {
        screen_save(bridge_evidence_dir + "/runtime-before.png");
    }
    game_end();
}
