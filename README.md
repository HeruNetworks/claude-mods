# Heru mods

Small Claude Code mods for Heru Networks.

- **model-switch**: one-tap model switch (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.2) with effort set to medium, plus /opus, /sonnet, /haiku, /fable and /models.

Install:

```
/plugin install model-switch --marketplace HeruNetworks/claude-mods
```

Or from a shell (used by the cloud environment's setup script):

```
claude plugin marketplace add HeruNetworks/claude-mods
claude plugin install model-switch@heru-mods
```

## heru-brain

Every Claude Code chat starts briefed and is recorded, by code:

- On the first message the chat is registered with the Heru Brain, renamed to its dated title, and given the briefing (company facts, hard lines, what is waiting, the last 48 hours, live app versions).
- Each message, each final reply and each app release is saved to the Brain's recorder.

It uses the chat's own Heru Brain connector, so it holds no keys. Without that connector it does nothing.

`claude plugin install heru-brain@heru-mods`
