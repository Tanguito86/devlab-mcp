# Activation floor

Activation now arms a logical, serialized `floorArmed` flag at exactly 75%. Below 75% it decays normally; once armed it cannot decay below 0.75. Completion remains 1.0.

Behavioral coverage includes 74% release, exact 75%, 89% release, pause, pre-checkpoint restart, and exact checkpoint restoration. Restart clears the flag and pending state; Relay A checkpoint restoration re-arms only its completed state.
