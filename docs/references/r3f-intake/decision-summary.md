# Decision summary

R3F remains a separate architecture lane at pin `0a107412ac64667b1908422e859447952f57feef`. Expected benefits are declarative composition and test-renderer coverage. Risks include React/reconciler overhead, user-owned WebGPU device-loss recovery, asynchronous disposal, persistent loader caches, and touch-event gaps. Runtime benchmark is mandatory before adoption.
