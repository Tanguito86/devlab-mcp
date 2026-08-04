# Device loss

Device loss recovery passes in all four required live states: Encounter 1 with hatch state, checkpoint, Calibration, and Overload.

Every run attests native hardware WebGPU, detects loss, recreates the renderer/resources, preserves byte-exact simulation state while stopped, restores one canvas/loop, trusted input, procedural audio, and capture contract, and reports no runtime or network error.
