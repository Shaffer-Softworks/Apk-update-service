# Changelog

## 1.1.3

- Fix GitHub asset downloads failing with transient TLS/SSL errors by using Node
  `https` instead of `fetch`, with retries and backoff.
- Serialize release webhook handling so duplicate events do not open parallel
  downloads to GitHub.
- Admin: `POST /api/admin/sync-release` fetches the latest GitHub release and
  downloads APKs (recovery when a webhook succeeded but downloads failed).
- Docker image: install `ca-certificates` for reliable HTTPS.

## 1.1.2

- Ship `icon.png` (256×256 PNG) beside `config.yaml` so Home Assistant shows a custom add-on icon instead of the default puzzle piece.
- Ingress UI: **File management** section lists APKs under `/data/apks` (or `APK_DIR`) with size, modified time, and **Download** links to `GET /api/download/<file>` (same URL Android clients use).
- Admin API: `GET /api/admin/files` returns `{ "files": [ { "name", "size", "mtimeMs" } ] }` for safe `.apk` filenames only.

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
