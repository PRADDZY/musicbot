# Service Token Guide (LavaSrc + Lavalink)

This guide lists each service, the tokens/credentials expected by the current `lavalink/application.yml`, and how to obtain them at a high level. Use official developer portals and follow each service's terms. Some services may require a paid plan or do not provide public credentials for this use case.

## YouTube
**Tokens needed:** None in this config.
**Where:** The YouTube Lavalink plugin is configured via `plugins: youtube` settings (search/clients), not API keys.

## Spotify
**Tokens needed:**
- `clientId`
- `clientSecret`
- `spDc` (optional, cookie for lyrics support in LavaSrc)

**Where:**
- Create an app in the Spotify Developer Dashboard to get `clientId` and `clientSecret`.
- If you want lyrics support, get the `sp_dc` cookie from `open.spotify.com` in your browser's storage.

## Apple Music
**Tokens needed:**
- `mediaAPIToken` (MusicKit developer token)
- `countryCode` (e.g. `US`)

**Where:**
Create a MusicKit identifier and private key in the Apple Developer portal, then generate a MusicKit developer token (JWT) using your Team ID, Key ID, and `.p8` key.

**Status:** Disabled in current config.

## SoundCloud
**Tokens needed:** None in this config.
**Where:** Lavalink's built-in SoundCloud source is enabled. If you intend to use SoundCloud's API, you must register an app with SoundCloud. Note: SoundCloud's public API terms restrict usage for Discord bots.

## Deezer
**Tokens needed:**
- `arl` (session cookie)
- `masterDecryptionKey`

**Where:**
These are not provided as standard public developer credentials. Only proceed if you can obtain them and use them within Deezer's terms.

**Status:** Disabled in current config.

## TIDAL
**Tokens needed:**
- `token` (OAuth access token)
- `countryCode`

**Where:**
Use TIDAL's developer platform and OAuth flow to get an access token.

**Status:** Disabled in current config.

## Qobuz
**Tokens needed:**
- `userOauthToken`
- `appId`
- `appSecret`

**Where:**
Qobuz credentials are typically issued to partners; you may need a paid account and official access.

**Status:** Disabled in current config.

## VK Music
**Tokens needed:**
- `userToken`
- `decoderKey`

**Where:**
`userToken` is an OAuth token from VK's developer platform. `decoderKey` is not part of VK's public API and is a LavaSrc-specific requirement.

**Status:** Disabled in current config.

## Yandex Music
**Tokens needed:**
- `accessToken`

**Where:**
Obtain a standard OAuth access token from Yandex's developer platform.

**Status:** Disabled in current config.

## JioSaavn
**Tokens needed:**
- `secretKey`

**Where:**
JioSaavn does not publicly document a developer key for this use case; you'll need official credentials.

**Status:** Disabled in current config.

## Recommendations
- If you don't have credentials for a service, set that source to `false` in `lavalink/application.yml`.
- Keep tokens out of git. Store them in a private secret manager and inject them during deployment.
