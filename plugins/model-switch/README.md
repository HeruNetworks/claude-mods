# model-switch

Switch Claude Code's model with one tap, handy from the Claude phone app in cloud sessions.

- A **Model** panel (in the phone app's Mods sheet; a band above the prompt on desktop) shows the current model and buttons for Opus 5.5 (best), Sonnet 5.5 (fast, cheaper), Haiku 5.5 (quickest) and Fable 5.2 (most capable). The active one has a dot.
- Every switch also sets effort to **medium**, so it is one tap. An effort row (Low, Medium, High, Max) changes it when needed.
- Backup slash commands: /opus, /sonnet, /haiku, /fable, and /models to reopen the panel.
- A toast confirms each switch.

Under the hood each button runs the built-in /model and /effort commands.
