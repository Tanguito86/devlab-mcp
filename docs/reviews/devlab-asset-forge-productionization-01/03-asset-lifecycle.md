# Asset lifecycle

Canonical states are `DRAFT`, `PILOT`, `CANDIDATE`, `APPROVED`, `DEPRECATED`, and `REJECTED`. Only the six specified transitions are accepted. Builders cannot approve; BLOCKER or REQUIRED findings prevent promotion; approval requires complete evidence; deprecated entries remain resolvable. Cinder remains `PILOT`; the pipeline emits a deterministic `PILOT -> CANDIDATE` candidate record without applying it.
