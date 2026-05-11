# Changelog

## 0.1.1

- Add `build.yaml` mapping each supported architecture to its Home Assistant base image so the Supervisor can populate the `BUILD_FROM` ARG (previous build failed with `base name (${BUILD_FROM}) should not be blank`).
- Drop deprecated `armv7` and `armhf` architectures from `config.yaml`; the addon now declares `aarch64` and `amd64` only, matching the modern Home Assistant supported arch list.

## 0.1.0

- Initial release. Ports the Node-RED APK update flow to a Home Assistant addon.
- WebSocket subscription to webhookrelay for GitHub release events.
- Downloads release assets matching configured flavor filename patterns to `/data/apks`.
- Persists per-flavor state to `/data/state.json` so versions survive restarts.
- Serves `GET /api/latest.json?flavor=<id>` and `GET /api/download/<file>` for Android self-updaters; `apkUrl` now correctly includes the `/api/download/` path segment.
- Minimal ingress UI showing per-flavor state and a webhookrelay reconnect button.
- Flavors are user-configurable and matched to release assets by filename regex (replaces the brittle `assets[0|1|2]` indexing in the Node-RED flow).
- QR-code provisioning endpoint is intentionally not ported.

### Known follow-ups

- No `icon.png`/`logo.png` shipped yet; Home Assistant uses its generic addon icon. Drop a 250x250 PNG named `icon.png` next to `config.yaml` to override.
