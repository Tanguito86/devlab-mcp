# Automated tests

Current automated results:

| Gate | Result |
| --- | --- |
| 06C game tests | 46/46 PASS |
| Gameplay-v2 contract | 8/8 PASS |
| Bot | 10/10 PASS; 0 softlocks; restart 10/10; checkpoint restore 10/10 |
| Adversarial | 45/45 PASS |
| DevLab packages | 173/173 PASS (shared 9, Android 42, browser 114, visual 8) |

New behavioral coverage includes real-action tutorial advancement, AIM/FIRE completion, FIRE/INTERACT separation, non-activation by shots, contextual range, same-tick prompt clearing, real active-hostile counters, off-screen indicator geometry, checkpoint objective reconstruction, incomplete retry, mobile multi-touch ownership, pointer cancel, and discrete HELP input.

The input-direction regression suite additionally proves W/S/A/D against the actual projected camera basis in desktop and portrait, mouse cursor aim through a ray-plane intersection, touch/desktop logical equivalence, projectile-to-aim alignment, and unchanged direction after restart and checkpoint restore.

The bot duration was 108.467 seconds. It is regression evidence only and is not substituted for the contractual human duration.
