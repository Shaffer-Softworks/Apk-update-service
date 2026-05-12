# APK Update Service

Home Assistant addon that replaces the Node-RED "APK Update Service" flow.
It subscribes to a [webhookrelay.com](https://webhookrelay.com) bucket over
WebSocket, listens for GitHub release events, downloads the matching APK
assets into the addon's persistent storage, and serves them to your Android
clients over a small HTTP API.

## What it does

1. Opens a WebSocket to `wss://my.webhookrelay.com/v1/socket` and subscribes
   to your configured bucket.
2. When a GitHub `release` webhook arrives, it:
   - Parses the release body for `versionCode: <n>` and `versionName: <s>` lines.
   - For each configured flavor, finds the first asset whose filename matches
     `filename_pattern` (a JavaScript regular expression).
   - Downloads that asset (using the GitHub API URL with your token) to
     `/data/apks/<original-filename>`.
   - Persists per-flavor state (filename, sha256, timestamp) to
     `/data/state.json`.
3. Serves the public Android API and a small admin API for the Ingress UI:
   - `GET /api/latest.json?flavor=<id>` — JSON metadata for the Android
     in-app updater.
   - `GET /api/download/<file>` — the APK binary with the correct
     `Content-Type` and `Content-Disposition` for Android.
   - `GET /api/admin/state` — JSON used by the dashboard (webhookrelay
     status, `versionCode` / `versionName`, per-flavor state, paths).
   - `GET /api/admin/files` — JSON list of `.apk` files in persistent
     storage (`name`, `size`, `mtimeMs`), newest first; same filename
     safety rules as `/api/download/<file>`.
   - `POST /api/admin/refresh` — asks the service to reconnect webhookrelay.
   - Home Assistant Ingress UI — static page that calls the admin routes,
     shows current release info, **File management** (list + download links
     for each APK on disk), per-flavor table with latest.json copy, and
     Reload / Reconnect actions.

## Installation

This is a single-addon repository. In Home Assistant:

1. **Settings → Add-ons → Add-on store → ⋮ → Repositories**
2. Add the URL of the Git repository that contains this folder.
3. Refresh; the addon "APK Update Service" appears under the new repository.
4. Install, configure (see below), then start.

The addon exposes TCP port `8099`. Map it to a stable LAN port (default is
also `8099`) so Android devices can reach `http://<ha-host>:8099/api/...`.

## Configuration

```yaml
webhookrelay:
  key: "<webhookrelay key>"
  secret: "<webhookrelay secret>"
  bucket: "<bucket name or id>"
github_token: "<GitHub PAT with repo:read>"
download_base_url: ""          # optional; e.g. https://updates.example.com
flavors:
  - id: keypad
    filename_pattern: ".*keypad.*\\.apk$"
  - id: tablet
    filename_pattern: ".*tablet(?!.*dpc).*\\.apk$"
  - id: tabletdpc
    filename_pattern: ".*tablet.*dpc.*\\.apk$"
log_level: info
```

### Options reference

| Key | Required | Notes |
| --- | --- | --- |
| `webhookrelay.key` / `webhookrelay.secret` | yes | Credentials for your webhookrelay account |
| `webhookrelay.bucket` | yes | The bucket that receives your GitHub release webhook |
| `github_token` | yes | Personal access token used to download release assets (`Authorization: token …`) |
| `download_base_url` | no | Public base URL the Android client should use; if blank, the addon derives it from the incoming request (`x-forwarded-proto`/`x-forwarded-host` aware) |
| `flavors[].id` | yes | URL-safe id used in `?flavor=<id>` |
| `flavors[].filename_pattern` | yes | Case-insensitive regex matched against the GitHub asset `name` |
| `flavors[].package_name` | no | Informational only; surfaced via the admin API |
| `log_level` | no | `debug`, `info`, `warn`, or `error` |

### GitHub release body format

The release description must contain two lines (anywhere in the body):

```
versionCode: 1003
versionName: 2.3.0
```

`assets[].digest` (the GitHub `sha256:…` digest) is recorded as the per-flavor
SHA-256 and returned to the Android client.

### Webhookrelay setup

1. In the webhookrelay dashboard, create a bucket and copy its name/id.
2. On the bucket, add an input that gives you a public HTTPS endpoint.
3. In your GitHub repository: **Settings → Webhooks → Add webhook**
   - Payload URL: the webhookrelay input URL.
   - Content type: `application/json`.
   - Events: just **Releases**.
4. Create an access token (key + secret) under the webhookrelay account
   and paste it into this addon's options.

No inbound networking to your Home Assistant instance is required —
this addon connects out to webhookrelay over WebSocket and receives events.

## Android client expectations

The Android self-updater should call:

```
GET http://<host>:8099/api/latest.json?flavor=<id>
```

Response:

```json
{
  "versionCode": 1003,
  "versionName": "2.3.0",
  "fileName": "app-officeKeypad-release.apk",
  "apkUrl": "http://<host>:8099/api/download/app-officeKeypad-release.apk",
  "sha256": "…64 hex chars…"
}
```

Download the APK with a plain `GET` on `apkUrl`. The response has
`Content-Type: application/vnd.android.package-archive` and a
`Content-Disposition` filename.

## Ingress dashboard and admin JSON

The Open Web UI page (same port as the API) loads static assets and calls:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/state` | Dashboard data: webhookrelay status, release fields, per-flavor state, configured flavor ids/patterns |
| `GET` | `/api/admin/files` | `{ "files": [ … ] }` — each entry has `name`, `size`, `mtimeMs` for `.apk` files in storage |
| `POST` | `/api/admin/refresh` | Trigger webhookrelay reconnect |

The UI renders **File management** from `/api/admin/files` and uses
`/api/download/<filename>` for each **Download** link so behavior matches
Android clients. There is no separate authentication layer on these routes;
they are only as exposed as your Home Assistant port mapping and Ingress
settings allow.

## Storage layout

- `/data/options.json` — written by Home Assistant from your configuration.
- `/data/state.json` — per-flavor state, atomic writes.
- `/data/apks/<filename>.apk` — downloaded assets.

## Differences from the Node-RED flow

- Flavors are configurable; assets are matched by filename regex instead of
  positional `assets[0]`/`assets[1]`/`assets[2]` index, which was fragile.
- `apkUrl` now correctly includes the `/api/download/` path segment (the
  Node-RED `Build latest.json …` functions concatenated `baseUrl` directly
  to the filename).
- The QR-code provisioning flow is intentionally not ported.
- State is persisted to disk (`/data/state.json`) and survives restarts;
  Node-RED globals were memory-only.
