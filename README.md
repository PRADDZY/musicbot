# Discord Music Bot (Lavalink)

A Discord music bot that uses Lavalink for playback and supports multiple streaming services via Lavalink source plugins.

## Features
- Slash commands for play, playnext, search, insert, pause, resume, skip, unskip, jumpback, voteskip, skipto, stop, clearqueue, removeuser, queuelock, queuefreeze, sleep, mode247, queuesnapshot, queue, nowplaying, nowplayingcard, botinfo, replay, volume, forward, rewind, seek, lyrics, lyricslive, normalize, eq, loop, shuffle, remove, move, queuemode, radio, autoclean, ping, settings, toptracks, topartists, history, leave
- `/play` accepts URLs, search queries, or an attached audio file (mp3, m4a, ogg, flac)
- `/playnext` inserts tracks at the front of the queue
- `/lyrics` fetches lyrics for the current track or a query
- `/lyricslive` shows live-updating lyrics for the current track
- `/search` provides a pick list for search results
- `/insert` places tracks at a specific queue position
- `/voteskip` enables vote-based skipping
- `/queuemode` supports fair or linear queueing
- `/radio` plays a preset station URL from `stations.json`
- `/nowplayingcard` renders an image card (requires `@napi-rs/canvas`)
- `/normalize` sets volume normalization (filter volume)
- `/eq` applies EQ presets
- `/autoclean` removes duplicates or unavailable tracks
- `/settings` stores per-guild defaults and limits in `guild-settings.json`
- `/mode247` keeps the bot connected when idle (per-guild setting)
- `/queuelock` and `/queuefreeze` add queue protection controls
- `/queuesnapshot` saves and reloads queue states from `queue-snapshots.json`
- `/toptracks` shows the most played tracks (from `guild-stats.json`)
- `/topartists` shows the most played artists (derived from `guild-stats.json`)
- Lavalink backend for stable audio delivery
- Multi-source support (Spotify, Apple Music, Deezer, SoundCloud, Bandcamp, YouTube, and more) when corresponding Lavalink plugins are installed

## Requirements
- Node.js 18.17+ (recommended 20+)
- A Discord application + bot token
- Lavalink server (Java 17+ or Docker)

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy env template and fill values:
   ```bash
   cp .env.example .env
   ```
   Set `DISCORD_GUILD_ID` for faster command updates in a single test server (optional).
   Configure `LAVALINK_FALLBACKS` if you want automatic node failover.
   Update `stations.json` with radio/lofi station URLs if you want to use `/radio`.
   Set `ALWAYS_ON_DEFAULT=true` if you want 24/7 mode on by default for new guild settings.
   Optional: install `@napi-rs/canvas` to enable `/nowplayingcard`.
   Example fallback format:
   ```bash
   LAVALINK_FALLBACKS=[{"name":"backup","host":"127.0.0.1","port":2334,"password":"youshallnotpass","secure":false}]
   ```

3. Start Lavalink:
   - With Docker:
     ```bash
     docker compose up -d
     ```
   - Or run Lavalink manually with `lavalink/application.yml`.

4. Deploy slash commands:
   ```bash
   npm run deploy-commands
   ```

5. Start the bot:
   ```bash
   npm start
   ```

## Lavalink plugins (important)
Major streaming services require Lavalink source plugins. `lavalink/application.yml` is preconfigured with:
- `dev.lavalink.youtube:youtube-plugin:1.16.0` for YouTube support.
- `com.github.topi314.lavasrc:lavasrc-plugin:4.8.1` for Spotify, Apple Music, Deezer, Tidal, Qobuz, VK Music, Yandex Music, JioSaavn, and more.

LavaSrc resolves metadata and mirrors to playable sources; some services (like Spotify/Apple/Tidal) are not streamed directly and require a mirror provider in the `providers` list. DRM-protected content may not be playable even with plugins.

Built-in Lavalink sources (SoundCloud, Bandcamp, Twitch, Vimeo, HTTP) are enabled in `lavalink/application.yml`. The HTTP source is required for playback of Discord attachment URLs. The YouTube built-in source is disabled to avoid conflicts with the YouTube plugin. The YouTube plugin's settings live under the root `plugins: youtube:` block.

Only Spotify is enabled among LavaSrc sources in the current config; Apple Music, Deezer, Tidal, Qobuz, VK, Yandex, and JioSaavn are disabled.

`lavalink/application.yml` now contains secrets and is ignored by git. Use `lavalink/application.example.yml` as a template.

Replace the placeholder credential values in `lavalink/application.yml` with your own tokens/keys. If you do not have credentials for a service, set that source to `false`.

## Commands
- `/play query` - Play a track or playlist from a supported source
- `/playnext query` - Add a track to the front of the queue
- `/search query` - Search and pick a result to queue
- `/insert query position` - Insert a track at a specific position
- `/pause` - Pause playback
- `/resume` - Resume playback
- `/skip` - Skip the current track
- `/unskip` - Restore the most recently played track
- `/jumpback [count]` - Jump back in playback history
- `/voteskip` - Vote to skip the current track
- `/skipto position` - Skip to a queue position
- `/stop` - Stop playback and clear the queue
- `/clearqueue` - Clear the upcoming queue
- `/removeuser user` - Remove queued tracks by user
- `/queuelock lock|unlock` - Restrict queue mutations
- `/queuefreeze enabled` - Freeze queue mutations (manager-only override)
- `/sleep set minutes` - Set sleep timer
- `/sleep cancel` - Cancel sleep timer
- `/mode247 enabled` - Toggle always-on behavior per guild
- `/queuesnapshot list` - List saved snapshots
- `/queuesnapshot save name` - Save the current queue as a snapshot
- `/queuesnapshot load name` - Load a saved snapshot
- `/queuesnapshot delete name` - Delete a snapshot
- `/leave` - Disconnect from voice
- `/queue` - Show the current queue
- `/nowplaying` - Show the current track
- `/nowplayingcard` - Show a now playing image card
- `/botinfo` - Show bot and Lavalink status
- `/replay` - Restart the current track
- `/volume level` - Set volume (0-150)
- `/forward seconds` - Seek forward
- `/rewind seconds` - Seek backward
- `/seek seconds` - Seek to a position
- `/lyrics [Artist - Title]` - Fetch lyrics
- `/lyricslive start [Artist - Title]` - Live lyrics updates
- `/lyricslive stop` - Stop live lyrics updates
- `/normalize enabled [target]` - Enable/disable normalization (filter volume)
- `/eq preset` - Apply an EQ preset
- `/loop mode` - Loop off/track/queue
- `/shuffle` - Shuffle the queue
- `/remove position` - Remove a track
- `/move from to` - Move a track
- `/queuemode mode` - Set queue mode (linear or fair)
- `/radio list` - Show configured stations
- `/radio play station` - Play a station from `stations.json`
- `/autoclean mode` - Remove duplicates/unavailable tracks
- `/ping` - Discord and Lavalink latency
- `/settings view|set` - View or update per-guild settings
- `/toptracks [limit]` - Show most played tracks
- `/topartists [limit]` - Show most played artists
- `/history` - Show recently played tracks

## Notes
- Some services are DRM-protected. For those, Lavalink plugins typically resolve metadata and stream from an available source. Ensure you comply with each service's terms.
- If the bot doesn't connect, confirm your Lavalink host/port/password and that the Lavalink server is reachable.
- Per-guild settings are stored in `guild-settings.json`, play counts in `guild-stats.json`, and queue snapshots in `queue-snapshots.json`.
- Prefix is stored for future prefix-based commands; this bot uses slash commands today.
- Set `NOW_PLAYING_CARD=true` to attach image cards to now playing announcements (requires `@napi-rs/canvas`).
