# PotFeeds systemd user units (feeder + keeper)

Run each agent as a **user** service so it survives logout but never needs
root. Units are *not enabled* by default — enable them explicitly once the
deploy has happened and the keys are in `.env`.

## Requirements

- The repo lives at `~/potfeeds` (the units use `%h` so this matches whatever
  `$HOME` is).
- `.env` at the repo root has real values: `PORTALDOT_RPC`, `AGGREGATOR_ADDRESS`,
  `KEEPER_REGISTRY_ADDRESS`, `FEEDER_KEY`, `KEEPER_KEY` (and `DEPLOYER_KEY`).
- Contracts are deployed on Portaldot testnet (`npm run deploy:testnet`) before
  starting either agent — the agents fail fast if the addresses are missing.

## Install

```bash
mkdir -p ~/.config/systemd/user
cp ~/potfeeds/deploy/systemd/potfeeds-*.service ~/.config/systemd/user/
systemctl --user daemon-reload

# allow user services to run when no one is logged in (optional, recommended)
loginctl enable-linger $(whoami)
```

## Start (only after a real deploy)

```bash
systemctl --user start potfeeds-feeder
systemctl --user start potfeeds-keeper

# make them auto-start on login (do this once you trust them)
systemctl --user enable potfeeds-feeder potfeeds-keeper
```

## Inspect

```bash
systemctl --user status potfeeds-feeder
journalctl --user -u potfeeds-feeder -f
journalctl --user -u potfeeds-keeper -f
```

## Notes

- The feeder/keeper loop every `POLL_SEC` (default 30 s) and the units restart
  on failure with a 10 s backoff.
- Use *different* keys for feeder vs keeper if you can (`FEEDER_KEY` vs
  `KEEPER_KEY`); the agents fall back to `DEPLOYER_KEY` if either is unset.
- Nothing here touches the network config; the agents read the same
  `deployments/portaldotTestnet.json` the deploy script writes.
