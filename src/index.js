require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Shoukaku, Connectors } = require('shoukaku');
const { commandData } = require('./commands');
const pkg = require('../package.json');
let Canvas = null;
try {
  Canvas = require('@napi-rs/canvas');
} catch (error) {
  Canvas = null;
}

const defaultVolumeRaw = Number(process.env.DEFAULT_VOLUME);
const voteSkipRatioRaw = Number(process.env.VOTE_SKIP_RATIO);
const queueModeDefaultRaw = String(process.env.QUEUE_MODE_DEFAULT || 'linear').toLowerCase();
const nowPlayingUpdateSecRaw = Number(process.env.NOW_PLAYING_UPDATE_SEC || 15);
const liveLyricsUpdateSecRaw = Number(process.env.LIVE_LYRICS_UPDATE_SEC || 15);
const autoDisconnectSecRaw = Number(process.env.AUTO_DISCONNECT_SEC || 180);
const normalizationEnabledDefaultRaw = String(process.env.NORMALIZATION_ENABLED_DEFAULT || 'false')
  .toLowerCase()
  .trim();
const normalizationTargetRaw = Number(process.env.NORMALIZATION_TARGET_DEFAULT || 100);
const eqPresetDefaultRaw = String(process.env.EQ_PRESET_DEFAULT || 'off').toLowerCase();
const nowPlayingCardRaw = String(process.env.NOW_PLAYING_CARD || 'false').toLowerCase();
const autoCleanMaxCheckRaw = Number(process.env.AUTOCLEAN_MAX_CHECK || 50);
const maxQueueLengthDefaultRaw = Number(process.env.MAX_QUEUE_LENGTH_DEFAULT || 200);
const prefixDefaultRaw = String(process.env.PREFIX_DEFAULT || '!').trim();
const alwaysOnDefaultRaw = String(process.env.ALWAYS_ON_DEFAULT || 'false').toLowerCase().trim();
const webhookUrlRaw = String(process.env.WEBHOOK_URL || '').trim();
const stationsFile = process.env.STATIONS_FILE || 'stations.json';
const guildSettingsFile = process.env.GUILD_SETTINGS_FILE || 'guild-settings.json';
const guildStatsFile = process.env.GUILD_STATS_FILE || 'guild-stats.json';
const queueSnapshotsFile = process.env.QUEUE_SNAPSHOTS_FILE || 'queue-snapshots.json';

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  lavalinkHost: process.env.LAVALINK_HOST || 'localhost',
  lavalinkPort: Number(process.env.LAVALINK_PORT || 2333),
  lavalinkPassword: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
  lavalinkSecure: String(process.env.LAVALINK_SECURE || 'false').toLowerCase() === 'true',
  defaultVolume: clampNumber(defaultVolumeRaw, 0, 150),
  idleTimeoutMs: clampNumber(Number(process.env.IDLE_TIMEOUT_SEC || 60), 10, 3600) * 1000,
  playlistMaxTracks: clampNumber(Number(process.env.PLAYLIST_MAX_TRACKS || 10), 1, 500),
  voteSkipRatio: Number.isNaN(voteSkipRatioRaw) ? 0.5 : clampNumber(voteSkipRatioRaw, 0.2, 1),
  queueModeDefault: queueModeDefaultRaw === 'fair' ? 'fair' : 'linear',
  nowPlayingUpdateMs: clampNumber(nowPlayingUpdateSecRaw, 0, 300) * 1000,
  liveLyricsUpdateMs: clampNumber(liveLyricsUpdateSecRaw, 5, 300) * 1000,
  autoDisconnectMs: clampNumber(autoDisconnectSecRaw, 30, 3600) * 1000,
  normalizationEnabledDefault: normalizationEnabledDefaultRaw === 'true',
  normalizationTargetDefault: clampNumber(normalizationTargetRaw, 10, 200),
  eqPresetDefault: eqPresetDefaultRaw || 'off',
  nowPlayingCard: nowPlayingCardRaw === 'true',
  autoCleanMaxCheck: clampNumber(autoCleanMaxCheckRaw, 5, 200),
  maxQueueLengthDefault: clampNumber(maxQueueLengthDefaultRaw, 10, 1000),
  prefixDefault: prefixDefaultRaw || '!',
  alwaysOnDefault: alwaysOnDefaultRaw === 'true',
  webhookUrl: webhookUrlRaw,
  stationsFile,
  guildSettingsFile,
  guildStatsFile,
  queueSnapshotsFile
};

if (!config.token || !config.clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}
if (Number.isNaN(defaultVolumeRaw)) {
  console.error('Missing DEFAULT_VOLUME in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const nodes = buildNodes();

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes);

const queues = new Map();
const searchSessions = new Map();
const SEARCH_SESSION_TTL_MS = 2 * 60 * 1000;
const settingsStore = loadJsonFile(config.guildSettingsFile, {});
const statsStore = loadJsonFile(config.guildStatsFile, {});
const snapshotsStore = loadJsonFile(config.queueSnapshotsFile, {});
let settingsSaveTimer = null;
let statsSaveTimer = null;
let snapshotsSaveTimer = null;

const EQ_PRESETS = {
  off: Array(15).fill(0),
  bass: [0.25, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.05, -0.05, -0.05, -0.05, -0.05, -0.05, -0.05, -0.05],
  pop: [0.05, 0.1, 0.15, 0.1, 0.05, 0, -0.05, -0.05, 0, 0.05, 0.1, 0.1, 0.05, 0, -0.05],
  rock: [0.15, 0.1, 0.05, 0, -0.05, -0.05, 0, 0.05, 0.1, 0.15, 0.1, 0.05, 0, -0.05, -0.05],
  electronic: [0.2, 0.15, 0.1, 0, -0.05, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.15, 0.1, 0.05, 0],
  vocal: [-0.05, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.05, -0.05],
  night: [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.2, -0.2]
};

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Slash commands available:', commandData.length);
});

shoukaku.on('ready', (name) => {
  console.log(`Lavalink node ready: ${name}`);
});

shoukaku.on('error', (name, error) => {
  console.error(`Lavalink error on node ${name}:`, error);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    try {
      await handleSearchSelect(interaction);
    } catch (error) {
      console.error('Select menu error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'Something went wrong while handling that selection.' });
      } else {
        await interaction.reply({ content: 'Something went wrong while handling that selection.', ephemeral: true });
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'play':
        await handlePlay(interaction);
        break;
      case 'playnext':
        await handlePlay(interaction, { insertNext: true });
        break;
      case 'search':
        await handleSearch(interaction);
        break;
      case 'insert':
        await handleInsert(interaction);
        break;
      case 'pause':
        await handlePause(interaction);
        break;
      case 'resume':
        await handleResume(interaction);
        break;
      case 'skip':
        await handleSkip(interaction);
        break;
      case 'unskip':
        await handleUnskip(interaction);
        break;
      case 'jumpback':
        await handleJumpBack(interaction);
        break;
      case 'voteskip':
        await handleVoteSkip(interaction);
        break;
      case 'skipto':
        await handleSkipTo(interaction);
        break;
      case 'stop':
        await handleStop(interaction);
        break;
      case 'clearqueue':
        await handleClearQueue(interaction);
        break;
      case 'removeuser':
        await handleRemoveUser(interaction);
        break;
      case 'queuelock':
        await handleQueueLock(interaction);
        break;
      case 'queuefreeze':
        await handleQueueFreeze(interaction);
        break;
      case 'sleep':
        await handleSleep(interaction);
        break;
      case 'mode247':
        await handleMode247(interaction);
        break;
      case 'queuesnapshot':
        await handleQueueSnapshot(interaction);
        break;
      case 'leave':
        await handleLeave(interaction);
        break;
      case 'queue':
        await handleQueue(interaction);
        break;
      case 'nowplaying':
        await handleNowPlaying(interaction);
        break;
      case 'nowplayingcard':
        await handleNowPlayingCard(interaction);
        break;
      case 'botinfo':
        await handleBotInfo(interaction);
        break;
      case 'replay':
        await handleReplay(interaction);
        break;
      case 'volume':
        await handleVolume(interaction);
        break;
      case 'forward':
        await handleForward(interaction);
        break;
      case 'rewind':
        await handleRewind(interaction);
        break;
      case 'seek':
        await handleSeek(interaction);
        break;
      case 'lyrics':
        await handleLyrics(interaction);
        break;
      case 'lyricslive':
        await handleLyricsLive(interaction);
        break;
      case 'normalize':
        await handleNormalize(interaction);
        break;
      case 'eq':
        await handleEq(interaction);
        break;
      case 'loop':
        await handleLoop(interaction);
        break;
      case 'shuffle':
        await handleShuffle(interaction);
        break;
      case 'remove':
        await handleRemove(interaction);
        break;
      case 'move':
        await handleMove(interaction);
        break;
      case 'queuemode':
        await handleQueueMode(interaction);
        break;
      case 'radio':
        await handleRadio(interaction);
        break;
      case 'autoclean':
        await handleAutoClean(interaction);
        break;
      case 'ping':
        await handlePing(interaction);
        break;
      case 'settings':
        await handleSettings(interaction);
        break;
      case 'toptracks':
        await handleTopTracks(interaction);
        break;
      case 'topartists':
        await handleTopArtists(interaction);
        break;
      case 'history':
        await handleHistory(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    }
  } catch (error) {
    console.error('Command error:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Something went wrong while handling that command.' });
    } else {
      await interaction.reply({ content: 'Something went wrong while handling that command.', ephemeral: true });
    }
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!client.user) return;

  const queue = queues.get(oldState.guild.id);
  if (oldState.member?.id === client.user.id) {
    if (oldState.channelId && !newState.channelId && queue) {
      stopNowPlayingUpdates(queue);
      await stopLiveLyrics(queue, 'Live lyrics stopped (voice state update).');
      clearIdleTimer(queue);
      clearAloneTimer(queue);
      queues.delete(oldState.guild.id);
    }
    return;
  }

  if (!queue) return;
  if (oldState.channelId === queue.voiceChannelId || newState.channelId === queue.voiceChannelId) {
    await updateAloneTimer(queue);
  }
});

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function loadJsonFile(filePath, fallback) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return fallback;
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return fallback;
    return data;
  } catch (error) {
    console.error(`Failed to read JSON file at ${resolved}:`, error);
    return fallback;
  }
}

function saveJsonFile(filePath, data) {
  const resolved = path.resolve(process.cwd(), filePath);
  try {
    fs.writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.error(`Failed to write JSON file at ${resolved}:`, error);
  }
}

function scheduleSettingsSave() {
  if (settingsSaveTimer) return;
  settingsSaveTimer = setTimeout(() => {
    saveJsonFile(config.guildSettingsFile, settingsStore);
    settingsSaveTimer = null;
  }, 2000);
}

function scheduleStatsSave() {
  if (statsSaveTimer) return;
  statsSaveTimer = setTimeout(() => {
    saveJsonFile(config.guildStatsFile, statsStore);
    statsSaveTimer = null;
  }, 2000);
}

function scheduleSnapshotsSave() {
  if (snapshotsSaveTimer) return;
  snapshotsSaveTimer = setTimeout(() => {
    saveJsonFile(config.queueSnapshotsFile, snapshotsStore);
    snapshotsSaveTimer = null;
  }, 2000);
}

function getDefaultGuildSettings() {
  return {
    prefix: config.prefixDefault,
    defaultVolume: config.defaultVolume,
    queueMode: config.queueModeDefault,
    voteSkipRatio: config.voteSkipRatio,
    nowPlayingUpdateSec: config.nowPlayingUpdateMs / 1000,
    autoDisconnectSec: config.autoDisconnectMs / 1000,
    maxQueueLength: config.maxQueueLengthDefault,
    alwaysOn: config.alwaysOnDefault,
    normalization: {
      enabled: config.normalizationEnabledDefault,
      target: config.normalizationTargetDefault
    },
    eqPreset: config.eqPresetDefault
  };
}

function mergeGuildSettings(defaults, overrides) {
  const merged = { ...defaults, ...overrides };
  merged.normalization = {
    ...defaults.normalization,
    ...(overrides?.normalization || {})
  };
  return merged;
}

function getGuildSettings(guildId) {
  const defaults = getDefaultGuildSettings();
  const overrides = settingsStore[guildId] || {};
  return mergeGuildSettings(defaults, overrides);
}

function updateGuildSettings(guildId, patch) {
  const current = settingsStore[guildId] || {};
  const next = mergeGuildSettings(getDefaultGuildSettings(), { ...current, ...patch });
  settingsStore[guildId] = next;
  scheduleSettingsSave();
  return next;
}

function getGuildStats(guildId) {
  if (!statsStore[guildId]) {
    statsStore[guildId] = { tracks: {} };
  }
  if (!statsStore[guildId].tracks) {
    statsStore[guildId].tracks = {};
  }
  return statsStore[guildId];
}

function getGuildSnapshots(guildId) {
  if (!snapshotsStore[guildId]) {
    snapshotsStore[guildId] = {};
  }
  return snapshotsStore[guildId];
}

function buildNodes() {
  const nodes = [
    {
      name: 'main',
      url: `${config.lavalinkHost}:${config.lavalinkPort}`,
      auth: config.lavalinkPassword,
      secure: config.lavalinkSecure
    }
  ];

  const fallbackRaw = process.env.LAVALINK_FALLBACKS;
  if (fallbackRaw) {
    const fallbackNodes = parseFallbackNodes(fallbackRaw);
    nodes.push(...fallbackNodes);
  }

  return nodes;
}

function parseFallbackNodes(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('LAVALINK_FALLBACKS must be a JSON array.');
    }
    return parsed.map((node, index) => normalizeFallbackNode(node, index)).filter(Boolean);
  } catch (error) {
    console.error('Invalid LAVALINK_FALLBACKS. Expected JSON array of nodes.', error);
    process.exit(1);
  }
}

function normalizeFallbackNode(node, index) {
  if (!node || typeof node !== 'object') return null;
  const name = node.name ? String(node.name) : `fallback-${index + 1}`;
  const url =
    node.url ||
    (node.host && node.port ? `${String(node.host)}:${Number(node.port)}` : null);
  const auth = node.auth || node.password || null;
  const secure = typeof node.secure === 'boolean' ? node.secure : String(node.secure || 'false').toLowerCase() === 'true';

  if (!url || !auth) {
    console.warn(`Skipping fallback node ${name}: missing url/host/port or auth.`);
    return null;
  }

  return { name, url, auth, secure };
}

function loadStations() {
  const filePath = path.resolve(process.cwd(), config.stationsFile);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => normalizeStation(entry)).filter(Boolean);
  } catch (error) {
    console.error(`Failed to read stations file at ${filePath}:`, error);
    return [];
  }
}

function normalizeStation(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const name = String(entry.name || '').trim();
  const url = String(entry.url || '').trim();
  if (!name || !url) return null;
  return { name, url };
}

function getQueue(guildId) {
  return queues.get(guildId) || null;
}

function createQueue(guildId, voiceChannelId, textChannelId, player) {
  const settings = getGuildSettings(guildId);
  const queue = {
    guildId,
    voiceChannelId,
    textChannelId,
    player,
    tracks: [],
    history: [],
    current: null,
    loop: 'off',
    idleTimer: null,
    volume: clampNumber(settings.defaultVolume, 0, 150),
    nowPlayingMessageId: null,
    nowPlayingInterval: null,
    mode: settings.queueMode,
    skipVotes: new Set(),
    liveLyrics: null,
    aloneTimer: null,
    sleepTimer: null,
    sleepEndsAt: null,
    locked: false,
    frozen: false,
    settings,
    alwaysOn: settings.alwaysOn,
    normalization: {
      enabled: settings.normalization.enabled,
      target: clampNumber(settings.normalization.target, 10, 200)
    },
    eqPreset: settings.eqPreset
  };
  queues.set(guildId, queue);
  return queue;
}

function clearIdleTimer(queue) {
  if (queue.idleTimer) {
    clearTimeout(queue.idleTimer);
    queue.idleTimer = null;
  }
}

function setIdleTimer(queue) {
  if (queue.alwaysOn) return;
  clearIdleTimer(queue);
  queue.idleTimer = setTimeout(async () => {
    await safeDisconnect(queue);
    queues.delete(queue.guildId);
  }, config.idleTimeoutMs);
}

async function safeDisconnect(queue) {
  try {
    stopNowPlayingUpdates(queue);
    await stopLiveLyrics(queue, 'Live lyrics stopped (player disconnected).');
    clearAloneTimer(queue);
    clearSleepTimer(queue);
    if (typeof shoukaku.leaveVoiceChannel === 'function') {
      await shoukaku.leaveVoiceChannel(queue.guildId);
      return;
    }
    const player = queue.player;
    if (player && typeof player.destroy === 'function') {
      await player.destroy();
      return;
    }
    if (player?.connection && typeof player.connection.disconnect === 'function') {
      player.connection.disconnect();
    }
  } catch (error) {
    console.error('Failed to disconnect player:', error);
  }
}

function applySettingsToQueue(queue) {
  const settings = getGuildSettings(queue.guildId);
  queue.settings = settings;
  if (queue.mode !== settings.queueMode) {
    queue.mode = settings.queueMode;
    setQueueMode(queue, queue.mode);
  }
  queue.volume = clampNumber(settings.defaultVolume, 0, 150);
  queue.normalization = {
    enabled: settings.normalization.enabled,
    target: clampNumber(settings.normalization.target, 10, 200)
  };
  queue.eqPreset = settings.eqPreset;
  queue.alwaysOn = settings.alwaysOn;
  if (queue.alwaysOn) {
    clearIdleTimer(queue);
    clearAloneTimer(queue);
  }
}

async function applyAudioSettings(queue) {
  await setVolumeSafe(queue.player, queue.volume);
  await applyNormalization(queue);
  await applyEqPreset(queue, queue.eqPreset);
}

async function applyNormalization(queue) {
  if (
    !queue?.player ||
    typeof queue.player.setFilterVolume !== 'function' ||
    typeof queue.player.setGlobalVolume !== 'function'
  ) {
    return;
  }
  const target = queue.normalization?.enabled ? queue.normalization.target : 100;
  const filterVolume = clampNumber(target, 10, 200) / 100;
  await setFilterVolumeSafe(queue.player, filterVolume);
}

async function applyEqPreset(queue, preset) {
  if (!queue?.player || typeof queue.player.setEqualizer !== 'function') {
    return;
  }
  const gains = EQ_PRESETS[preset] || EQ_PRESETS.off;
  const equalizer = gains.map((gain, band) => ({ band, gain }));
  await queue.player.setEqualizer(equalizer);
}

function clearAloneTimer(queue) {
  if (queue?.aloneTimer) {
    clearTimeout(queue.aloneTimer);
    queue.aloneTimer = null;
  }
}

function clearSleepTimer(queue) {
  if (queue?.sleepTimer) {
    clearTimeout(queue.sleepTimer);
    queue.sleepTimer = null;
  }
  if (queue) {
    queue.sleepEndsAt = null;
  }
}

async function updateAloneTimer(queue) {
  if (!queue) return;
  if (queue.alwaysOn) {
    clearAloneTimer(queue);
    return;
  }
  const autoDisconnectMs = clampNumber(queue.settings?.autoDisconnectSec ?? 0, 0, 3600) * 1000;
  if (!autoDisconnectMs) return;

  try {
    const guild = await client.guilds.fetch(queue.guildId);
    const channel = await guild.channels.fetch(queue.voiceChannelId);
    if (!channel || !channel.members) return;
    const nonBotMembers = channel.members.filter((member) => !member.user.bot);
    if (nonBotMembers.size === 0) {
      if (!queue.aloneTimer) {
        queue.aloneTimer = setTimeout(async () => {
          await safeDisconnect(queue);
          queues.delete(queue.guildId);
        }, autoDisconnectMs);
      }
    } else {
      clearAloneTimer(queue);
    }
  } catch (error) {
    // Ignore errors if fetch fails.
  }
}

function setSleepTimer(queue, minutes) {
  clearSleepTimer(queue);
  const delayMs = Math.max(1, Number(minutes)) * 60 * 1000;
  queue.sleepEndsAt = Date.now() + delayMs;
  queue.sleepTimer = setTimeout(async () => {
    try {
      queue.tracks = [];
      queue.current = null;
      await stopTrackSafe(queue.player);
      await safeDisconnect(queue);
      queues.delete(queue.guildId);
    } catch (error) {
      console.error('Sleep timer failed to stop playback:', error);
    }
  }, delayMs);
}

async function ensureQueueForInteraction(interaction, memberChannel) {
  if (!interaction.guild) {
    return { error: 'This command can only be used in a server.' };
  }
  if (!memberChannel) {
    return { error: 'Join a voice channel first.' };
  }

  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  const permissions = memberChannel.permissionsFor(botMember);
  if (!permissions?.has(PermissionsBitField.Flags.Connect) || !permissions?.has(PermissionsBitField.Flags.Speak)) {
    return { error: 'I need permission to connect and speak in your voice channel.' };
  }

  const node = getNode();
  const guildId = interaction.guild.id;
  const existingConnection =
    shoukaku.connections && typeof shoukaku.connections.get === 'function'
      ? shoukaku.connections.get(guildId)
      : null;

  if (existingConnection?.channelId && existingConnection.channelId !== memberChannel.id) {
    return { error: 'You need to be in the same voice channel as the bot.' };
  }

  const playerMap = node.players;
  let player = playerMap && typeof playerMap.get === 'function' ? playerMap.get(guildId) : null;
  if (!player && shoukaku.players && typeof shoukaku.players.get === 'function') {
    player = shoukaku.players.get(guildId) || null;
  }

  let joined = false;
  if (!player) {
    if (typeof shoukaku.joinVoiceChannel !== 'function') {
      throw new Error('Shoukaku does not support joinVoiceChannel.');
    }
    if (existingConnection && typeof shoukaku.leaveVoiceChannel === 'function') {
      await shoukaku.leaveVoiceChannel(guildId);
    }
    player = await shoukaku.joinVoiceChannel({
      guildId,
      channelId: memberChannel.id,
      shardId: interaction.guild.shardId,
      deaf: true
    });
    joined = true;
  }

  let queue = getQueue(guildId);
  if (!queue) {
    queue = createQueue(guildId, memberChannel.id, interaction.channelId, player);
    attachPlayerListeners(queue);
  } else {
    queue.player = player;
    if (queue.voiceChannelId !== memberChannel.id) {
      return { error: 'You need to be in the same voice channel as the bot.' };
    }
  }

  queue.voiceChannelId = memberChannel.id;
  queue.textChannelId = interaction.channelId;
  applySettingsToQueue(queue);

  if (joined) {
    try {
      await applyAudioSettings(queue);
    } catch (error) {
      console.error('Failed to apply audio settings on join:', error);
    }
  }

  await updateAloneTimer(queue);
  return { queue, player, node, joined };
}

function startNowPlayingUpdates(queue) {
  stopNowPlayingUpdates(queue);
  const updateSec = queue.settings?.nowPlayingUpdateSec ?? config.nowPlayingUpdateMs / 1000;
  const updateMs = clampNumber(Number(updateSec), 0, 300) * 1000;
  if (!updateMs) return;
  queue.nowPlayingInterval = setInterval(async () => {
    if (!queue.current) return;
    await announceNowPlaying(queue);
  }, updateMs);
}

function stopNowPlayingUpdates(queue) {
  if (queue.nowPlayingInterval) {
    clearInterval(queue.nowPlayingInterval);
    queue.nowPlayingInterval = null;
  }
}

async function stopLiveLyrics(queue, note) {
  if (!queue?.liveLyrics) return;
  const { channelId, messageId, intervalId } = queue.liveLyrics;
  clearInterval(intervalId);
  queue.liveLyrics = null;

  if (!note || !channelId || !messageId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(messageId);
    await message.edit({ content: note, embeds: [] });
  } catch (error) {
    // Ignore message edit failures.
  }
}

async function handlePlay(interaction, options = {}) {
  const { insertNext = false } = options;
  const rawQueryInput = interaction.options.getString('query');
  const attachment = interaction.options.getAttachment('file');
  const queryInput = rawQueryInput ? rawQueryInput.trim() : '';
  const query = attachment?.url || queryInput;
  const memberChannel = interaction.member?.voice?.channel;

  if (!interaction.guild) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  if (!query) {
    return interaction.reply({
      content: 'Provide a URL, search query, or attach an audio file.',
      ephemeral: true
    });
  }

  await interaction.deferReply();

  const prepared = await ensureQueueForInteraction(interaction, memberChannel);
  if (prepared.error) {
    return interaction.editReply({ content: prepared.error });
  }
  const { queue, player, node } = prepared;
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.editReply({ content: queueMutationBlock });
  }
  const resolveNode = player?.node || node;
  const resolved = await resolveTracks(resolveNode, query);
  if (!resolved.tracks.length) {
    return interaction.editReply({ content: 'No matches found for that query.' });
  }

  const isTextSearch =
    !!queryInput &&
    !attachment &&
    !isUrl(queryInput) &&
    !isSourceIdentifier(queryInput) &&
    !queryInput.toLowerCase().startsWith('ytsearch:');

  const allTracks = resolved.tracks.map((track) => mapTrack(track, interaction.user));
  let tracksToQueue = allTracks;
  if (isTextSearch || resolved.loadType === 'SEARCH_RESULT') {
    tracksToQueue = allTracks.slice(0, 1);
  } else if (resolved.loadType === 'PLAYLIST_LOADED' && allTracks.length > config.playlistMaxTracks) {
    tracksToQueue = allTracks.slice(0, config.playlistMaxTracks);
  }
  const limited = applyQueueLimit(queue, tracksToQueue);
  tracksToQueue = limited.tracks;
  if (!tracksToQueue.length) {
    return interaction.editReply({ content: `Queue limit reached (${limited.maxQueue}).` });
  }
  enqueueTracks(queue, tracksToQueue, insertNext);

  let response;
  if (isTextSearch || resolved.loadType === 'SEARCH_RESULT') {
    response = `Queued: ${formatTrack(tracksToQueue[0])}${insertNext ? ' (next up)' : ''}`;
  } else if (resolved.loadType === 'PLAYLIST_LOADED') {
    if (tracksToQueue.length < allTracks.length) {
      response = `Queued playlist: ${resolved.playlistName || 'Playlist'} (${tracksToQueue.length}/${allTracks.length} tracks)${insertNext ? ' (next up)' : ''}.`;
    } else {
      response = `Queued playlist: ${resolved.playlistName || 'Playlist'} (${tracksToQueue.length} tracks)${insertNext ? ' (next up)' : ''}.`;
    }
  } else {
    response = `Queued: ${formatTrack(tracksToQueue[0])}${insertNext ? ' (next up)' : ''}`;
  }
  if (limited.trimmed) {
    response += ` Queue limit applied (${limited.maxQueue}).`;
  }

  if (!queue.current) {
    await playNext(queue);
  }

  return interaction.editReply({ content: response });
}

async function handleSearch(interaction) {
  const queryInput = interaction.options.getString('query', true).trim();
  if (!interaction.guild) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }
  if (!queryInput) {
    return interaction.reply({ content: 'Provide a search query.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const node = getNode();
  const resolved = await resolveTracks(node, queryInput);
  const tracks = resolved.tracks.slice(0, 5).map((track) => mapTrack(track, interaction.user));

  if (!tracks.length) {
    return interaction.editReply({ content: 'No matches found for that query.' });
  }

  const sessionId = createSearchSession({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    tracks
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`search_select:${sessionId}`)
    .setPlaceholder('Select a track to queue')
    .addOptions(
      tracks.map((track, index) => ({
        label: truncateText(`${track.title}`, 100),
        description: truncateText(`${track.author} - ${formatDuration(track.length)}`, 100),
        value: String(index)
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.editReply({
    content: 'Pick a result to queue:',
    components: [row]
  });
}

async function handleSearchSelect(interaction) {
  if (!interaction.customId.startsWith('search_select:')) return;
  const sessionId = interaction.customId.replace('search_select:', '');
  const session = searchSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: 'That search has expired. Run /search again.', ephemeral: true });
  }
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: 'Only the user who started the search can pick a result.', ephemeral: true });
  }
  if (interaction.guildId !== session.guildId) {
    return interaction.reply({ content: 'This selection is no longer valid for this server.', ephemeral: true });
  }

  const index = Number(interaction.values?.[0]);
  const track = session.tracks[index];
  if (!track) {
    return interaction.update({ content: 'Invalid selection.', components: [] });
  }

  await interaction.deferUpdate();

  const memberChannel = interaction.member?.voice?.channel;
  const prepared = await ensureQueueForInteraction(interaction, memberChannel);
  if (prepared.error) {
    searchSessions.delete(sessionId);
    return interaction.editReply({ content: prepared.error, components: [] });
  }

  const { queue } = prepared;
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    searchSessions.delete(sessionId);
    return interaction.editReply({ content: queueMutationBlock, components: [] });
  }
  const limited = applyQueueLimit(queue, [track]);
  if (!limited.tracks.length) {
    searchSessions.delete(sessionId);
    return interaction.editReply({ content: `Queue limit reached (${limited.maxQueue}).`, components: [] });
  }
  enqueueTracks(queue, limited.tracks, false);
  if (!queue.current) {
    await playNext(queue);
  }

  searchSessions.delete(sessionId);
  return interaction.editReply({ content: `Queued: ${formatTrack(track)}`, components: [] });
}

async function handleInsert(interaction) {
  const rawQueryInput = interaction.options.getString('query');
  const attachment = interaction.options.getAttachment('file');
  const queryInput = rawQueryInput ? rawQueryInput.trim() : '';
  const query = attachment?.url || queryInput;
  const position = interaction.options.getInteger('position', true);
  const memberChannel = interaction.member?.voice?.channel;

  if (!interaction.guild) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  if (!query) {
    return interaction.reply({
      content: 'Provide a URL, search query, or attach an audio file.',
      ephemeral: true
    });
  }

  await interaction.deferReply();

  const prepared = await ensureQueueForInteraction(interaction, memberChannel);
  if (prepared.error) {
    return interaction.editReply({ content: prepared.error });
  }

  const { queue, player, node } = prepared;
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.editReply({ content: queueMutationBlock });
  }
  const resolveNode = player?.node || node;
  const resolved = await resolveTracks(resolveNode, query);
  if (!resolved.tracks.length) {
    return interaction.editReply({ content: 'No matches found for that query.' });
  }

  const isTextSearch =
    !!queryInput &&
    !attachment &&
    !isUrl(queryInput) &&
    !isSourceIdentifier(queryInput) &&
    !queryInput.toLowerCase().startsWith('ytsearch:');

  const allTracks = resolved.tracks.map((track) => mapTrack(track, interaction.user));
  let tracksToQueue = allTracks;
  if (isTextSearch || resolved.loadType === 'SEARCH_RESULT') {
    tracksToQueue = allTracks.slice(0, 1);
  } else if (resolved.loadType === 'PLAYLIST_LOADED' && allTracks.length > config.playlistMaxTracks) {
    tracksToQueue = allTracks.slice(0, config.playlistMaxTracks);
  }

  const limited = applyQueueLimit(queue, tracksToQueue);
  tracksToQueue = limited.tracks;
  if (!tracksToQueue.length) {
    return interaction.editReply({ content: `Queue limit reached (${limited.maxQueue}).` });
  }

  const actualIndex = insertTracksAt(queue, tracksToQueue, position);

  if (!queue.current) {
    await playNext(queue);
  }

  let message = `Inserted ${tracksToQueue.length} track${tracksToQueue.length === 1 ? '' : 's'} at position ${actualIndex + 1}.`;
  if (limited.trimmed) {
    message += ` Queue limit applied (${limited.maxQueue}).`;
  }
  return interaction.editReply({ content: message });
}

async function handlePause(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  await setPausedSafe(queue.player, true);
  return interaction.reply({ content: 'Playback paused.' });
}

async function handleResume(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  await setPausedSafe(queue.player, false);
  return interaction.reply({ content: 'Playback resumed.' });
}

async function handleSkip(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  await stopTrackSafe(queue.player);
  return interaction.reply({ content: 'Skipped the current track.' });
}

async function handleUnskip(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.history.length === 0) {
    return interaction.reply({ content: 'No previous track available to unskip.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  const previous = queue.history.shift();
  enqueueTracks(queue, [previous], true);
  if (queue.current) {
    await stopTrackSafe(queue.player);
  } else {
    await playNext(queue);
  }

  return interaction.reply({ content: `Restored previous track: ${formatTrack(previous)}` });
}

async function handleJumpBack(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.history.length === 0) {
    return interaction.reply({ content: 'No playback history available.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  const count = interaction.options.getInteger('count') ?? 1;
  if (count < 1 || count > 20) {
    return interaction.reply({ content: 'Count must be between 1 and 20.', ephemeral: true });
  }
  if (queue.history.length < count) {
    return interaction.reply({ content: `Only ${queue.history.length} tracks in history.`, ephemeral: true });
  }

  const [target] = queue.history.splice(count - 1, 1);
  enqueueTracks(queue, [target], true);
  if (queue.current) {
    await stopTrackSafe(queue.player);
  } else {
    await playNext(queue);
  }

  return interaction.reply({ content: `Jumped back to: ${formatTrack(target)}` });
}

async function handleVoteSkip(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  const listeners = await getListenerCount(queue);
  if (listeners <= 1 || interaction.user.id === queue.current.requesterId) {
    await stopTrackSafe(queue.player);
    return interaction.reply({ content: 'Skipped the current track.' });
  }

  queue.skipVotes.add(interaction.user.id);
  const ratio = queue.settings?.voteSkipRatio ?? config.voteSkipRatio;
  const required = Math.max(1, Math.ceil(listeners * ratio));
  const votes = queue.skipVotes.size;

  if (votes >= required) {
    queue.skipVotes.clear();
    await stopTrackSafe(queue.player);
    return interaction.reply({ content: `Vote passed (${votes}/${required}). Skipping.` });
  }

  return interaction.reply({ content: `Vote added (${votes}/${required}).` });
}

async function handleSkipTo(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  const position = interaction.options.getInteger('position', true);
  if (position < 1 || position > queue.tracks.length) {
    return interaction.reply({ content: 'That position is out of range.', ephemeral: true });
  }

  queue.tracks = queue.tracks.slice(position - 1);
  await stopTrackSafe(queue.player);
  return interaction.reply({ content: `Skipped to position ${position}.` });
}

async function handleStop(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  queue.tracks = [];
  queue.current = null;
  await stopTrackSafe(queue.player);
  await safeDisconnect(queue);
  queues.delete(queue.guildId);

  return interaction.reply({ content: 'Stopped playback and cleared the queue.' });
}

async function handleClearQueue(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.tracks.length === 0) {
    return interaction.reply({ content: 'The queue is already empty.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  queue.tracks = [];
  return interaction.reply({ content: 'Cleared the upcoming queue.' });
}

async function handleRemoveUser(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.tracks.length === 0) {
    return interaction.reply({ content: 'The queue is empty.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  const user = interaction.options.getUser('user', true);
  const before = queue.tracks.length;
  queue.tracks = queue.tracks.filter((track) => track.requesterId !== user.id);
  if (queue.mode === 'fair' && queue.tracks.length > 1) {
    queue.tracks = rebuildFairQueue(queue.tracks);
  }
  const removed = before - queue.tracks.length;
  return interaction.reply({ content: `Removed ${removed} queued track(s) requested by ${user.tag}.` });
}

async function handleQueueLock(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  if (!hasManageGuildPermission(interaction)) {
    return interaction.reply({ content: 'You need Manage Server permission to lock the queue.', ephemeral: true });
  }

  const action = interaction.options.getString('action', true);
  queue.locked = action === 'lock';
  return interaction.reply({ content: `Queue lock ${queue.locked ? 'enabled' : 'disabled'}.` });
}

async function handleQueueFreeze(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  if (!hasManageGuildPermission(interaction)) {
    return interaction.reply({ content: 'You need Manage Server permission to freeze the queue.', ephemeral: true });
  }

  const enabled = interaction.options.getBoolean('enabled', true);
  queue.frozen = enabled;
  return interaction.reply({ content: `Queue freeze ${enabled ? 'enabled' : 'disabled'}.` });
}

async function handleSleep(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  const action = interaction.options.getString('action', true);
  if (action === 'cancel') {
    clearSleepTimer(queue);
    return interaction.reply({ content: 'Sleep timer cancelled.' });
  }

  const minutes = interaction.options.getInteger('minutes');
  if (!minutes || minutes < 1 || minutes > 720) {
    return interaction.reply({ content: 'Minutes must be between 1 and 720.', ephemeral: true });
  }
  setSleepTimer(queue, minutes);
  return interaction.reply({ content: `Sleep timer set for ${minutes} minute(s).` });
}

async function handleMode247(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }
  if (!hasManageGuildPermission(interaction)) {
    return interaction.reply({ content: 'You need Manage Server permission to change 24/7 mode.', ephemeral: true });
  }

  const enabled = interaction.options.getBoolean('enabled', true);
  const settings = updateGuildSettings(guildId, { alwaysOn: enabled });
  const queue = getQueue(guildId);
  if (queue) {
    queue.settings = settings;
    queue.alwaysOn = enabled;
    if (enabled) {
      clearIdleTimer(queue);
      clearAloneTimer(queue);
    } else if (!queue.current && queue.tracks.length === 0) {
      setIdleTimer(queue);
    }
  }

  return interaction.reply({ content: `24/7 mode ${enabled ? 'enabled' : 'disabled'}.` });
}

async function handleQueueSnapshot(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  const action = interaction.options.getString('action', true);
  const snapshots = getGuildSnapshots(guildId);

  if (action === 'list') {
    const names = Object.keys(snapshots);
    if (!names.length) {
      return interaction.reply({ content: 'No snapshots saved for this server.', ephemeral: true });
    }
    const lines = names.map((name) => {
      const size = snapshots[name]?.tracks?.length ?? 0;
      return `- ${name} (${size} tracks)`;
    });
    return interaction.reply({ content: `Saved snapshots:\n${lines.join('\n')}` });
  }

  const name = (interaction.options.getString('name') || '').trim().toLowerCase();
  if (!name) {
    return interaction.reply({ content: 'Provide a snapshot name.', ephemeral: true });
  }

  if (action === 'delete') {
    if (!snapshots[name]) {
      return interaction.reply({ content: 'Snapshot not found.', ephemeral: true });
    }
    delete snapshots[name];
    scheduleSnapshotsSave();
    return interaction.reply({ content: `Deleted snapshot: ${name}` });
  }

  if (action === 'save') {
    const queue = getQueue(guildId);
    if (!queue) {
      return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
    }
    if (!ensureSameChannel(interaction, queue)) {
      return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
    }

    const tracks = [];
    if (queue.current) tracks.push(queue.current);
    tracks.push(...queue.tracks);
    if (!tracks.length) {
      return interaction.reply({ content: 'Nothing to save in snapshot.', ephemeral: true });
    }

    snapshots[name] = {
      createdAt: new Date().toISOString(),
      tracks: tracks.map((track) => ({ ...track }))
    };
    scheduleSnapshotsSave();
    return interaction.reply({ content: `Saved snapshot '${name}' with ${tracks.length} track(s).` });
  }

  if (action === 'load') {
    const snapshot = snapshots[name];
    if (!snapshot || !Array.isArray(snapshot.tracks) || snapshot.tracks.length === 0) {
      return interaction.reply({ content: 'Snapshot not found or empty.', ephemeral: true });
    }

    await interaction.deferReply();
    const memberChannel = interaction.member?.voice?.channel;
    const prepared = await ensureQueueForInteraction(interaction, memberChannel);
    if (prepared.error) {
      return interaction.editReply({ content: prepared.error });
    }

    const { queue } = prepared;
    const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
    if (queueMutationBlock) {
      return interaction.editReply({ content: queueMutationBlock });
    }

    const limited = applyQueueLimit(queue, snapshot.tracks.map((track) => ({ ...track })));
    if (!limited.tracks.length) {
      return interaction.editReply({ content: `Queue limit reached (${limited.maxQueue}).` });
    }
    enqueueTracks(queue, limited.tracks, false);
    if (!queue.current) {
      await playNext(queue);
    }

    let message = `Loaded snapshot '${name}' (${limited.tracks.length} track(s)).`;
    if (limited.trimmed) {
      message += ` Queue limit applied (${limited.maxQueue}).`;
    }
    return interaction.editReply({ content: message });
  }

  return interaction.reply({ content: 'Unsupported snapshot action.', ephemeral: true });
}

async function handleLeave(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'I am not connected to a voice channel.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  await safeDisconnect(queue);
  queues.delete(queue.guildId);
  return interaction.reply({ content: 'Disconnected from the voice channel.' });
}

async function handleQueue(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || (!queue.current && queue.tracks.length === 0)) {
    return interaction.reply({ content: 'The queue is empty.', ephemeral: true });
  }

  const lines = [];
  if (queue.current) {
    lines.push(`Now playing: ${formatTrack(queue.current)}`);
  }
  lines.push(`Queue mode: ${queue.mode}`);

  const upcoming = queue.tracks.slice(0, 10).map((track, index) => {
    return `${index + 1}. ${formatTrack(track)}`;
  });

  if (upcoming.length) {
    lines.push('Up next:');
    lines.push(...upcoming);
  }

  if (queue.tracks.length > 10) {
    lines.push(`And ${queue.tracks.length - 10} more...`);
  }

  return interaction.reply({ content: lines.join('\n') });
}

async function handleNowPlaying(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }

  const embed = buildNowPlayingEmbed(queue, true);
  return interaction.reply({ embeds: [embed] });
}

async function handleNowPlayingCard(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!Canvas) {
    return interaction.reply({
      content: 'Now playing cards require the optional dependency `@napi-rs/canvas`.',
      ephemeral: true
    });
  }

  await interaction.deferReply();
  const card = await renderNowPlayingCard(queue);
  if (!card) {
    return interaction.editReply({ content: 'Unable to render a now playing card right now.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('Now Playing')
    .setImage(`attachment://${card.name}`)
    .setTimestamp(new Date());

  return interaction.editReply({
    embeds: [embed],
    files: [{ attachment: card.buffer, name: card.name }]
  });
}

async function handleBotInfo(interaction) {
  const queue = getQueue(interaction.guildId);
  const uptime = formatUptime(process.uptime());
  const memory = formatBytes(process.memoryUsage().rss);
  const nodeLines = Array.from(shoukaku.nodes.values()).map((node) => {
    const state = node.state || 'unknown';
    return `${node.name}: ${state}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Bot Status')
    .addFields(
      { name: 'Version', value: pkg.version || 'unknown', inline: true },
      { name: 'Uptime', value: uptime, inline: true },
      { name: 'Memory', value: memory, inline: true }
    )
    .setTimestamp(new Date());

  embed.addFields({
    name: 'Lavalink Nodes',
    value: nodeLines.length ? nodeLines.join('\n') : 'No nodes available',
    inline: false
  });

  if (queue?.current) {
    embed.addFields(
      { name: 'Now Playing', value: formatTrack(queue.current), inline: false },
      { name: 'Queue Length', value: String(queue.tracks.length), inline: true },
      { name: 'Queue Mode', value: queue.mode, inline: true }
    );
  }

  return interaction.reply({ embeds: [embed] });
}

async function handleReplay(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  await seekSafe(queue.player, 0);
  return interaction.reply({ content: 'Replaying the current track.' });
}

async function handleVolume(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  if (!supportsVolume(queue.player)) {
    return interaction.reply({ content: 'Volume control is not supported by the current Lavalink player.', ephemeral: true });
  }

  const level = interaction.options.getInteger('level', true);
  queue.volume = clampNumber(level, 0, 150);
  queue.settings = updateGuildSettings(queue.guildId, { defaultVolume: queue.volume });
  await setVolumeSafe(queue.player, queue.volume);
  return interaction.reply({ content: `Volume set to ${queue.volume}.` });
}

async function handleForward(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const length = queue.current.length || 0;
  if (!length) {
    return interaction.reply({ content: 'Cannot seek a live track.', ephemeral: true });
  }

  const seconds = interaction.options.getInteger('seconds') ?? 10;
  const position = (queue.player.position ?? 0) + seconds * 1000;
  const target = Math.min(position, length);
  await seekSafe(queue.player, target);
  return interaction.reply({ content: `Forwarded ${seconds} seconds.` });
}

async function handleRewind(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const length = queue.current.length || 0;
  if (!length) {
    return interaction.reply({ content: 'Cannot seek a live track.', ephemeral: true });
  }

  const seconds = interaction.options.getInteger('seconds') ?? 10;
  const position = (queue.player.position ?? 0) - seconds * 1000;
  const target = Math.max(position, 0);
  await seekSafe(queue.player, target);
  return interaction.reply({ content: `Rewound ${seconds} seconds.` });
}

async function handleSeek(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.current) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  const seconds = interaction.options.getInteger('seconds', true);
  const position = seconds * 1000;
  if (queue.current.length && position > queue.current.length) {
    return interaction.reply({ content: 'That seek position is past the end of the track.', ephemeral: true });
  }

  await seekSafe(queue.player, position);
  return interaction.reply({ content: `Seeked to ${formatDuration(position)}.` });
}

async function handleLyrics(interaction) {
  const query = interaction.options.getString('query');
  const queue = getQueue(interaction.guildId);

  let artist = '';
  let title = '';

  if (query) {
    const parsed = splitLyricsQuery(query.trim());
    if (parsed) {
      artist = parsed.artist;
      title = parsed.title;
    } else if (queue?.current?.author) {
      artist = queue.current.author;
      title = query.trim();
    } else {
      return interaction.reply({
        content: 'Provide a query in the format `Artist - Title`, or play a track first.',
        ephemeral: true
      });
    }
  } else if (queue?.current) {
    artist = queue.current.author;
    title = queue.current.title;
  } else {
    return interaction.reply({ content: 'Play a track or provide a query first.', ephemeral: true });
  }

  artist = sanitizeArtist(artist);
  title = sanitizeTitle(title);

  if (!artist || !title) {
    return interaction.reply({ content: 'Unable to parse artist and title for lyrics search.', ephemeral: true });
  }

  await interaction.deferReply();
  const lyrics = await fetchLyrics(artist, title);
  if (!lyrics) {
    return interaction.editReply({ content: 'Lyrics not found.' });
  }

  const maxLength = 3800;
  const trimmedLyrics = lyrics.length > maxLength ? `${lyrics.slice(0, maxLength)}...` : lyrics;
  const embed = new EmbedBuilder()
    .setTitle(`Lyrics: ${title}`)
    .setDescription(trimmedLyrics)
    .setFooter({ text: artist });

  return interaction.editReply({ embeds: [embed] });
}

async function handleLyricsLive(interaction) {
  const action = interaction.options.getString('action', true);
  const queue = getQueue(interaction.guildId);

  if (action === 'stop') {
    if (!queue?.liveLyrics) {
      return interaction.reply({ content: 'Live lyrics are not active.', ephemeral: true });
    }
    await stopLiveLyrics(queue, 'Live lyrics stopped.');
    return interaction.reply({ content: 'Live lyrics stopped.' });
  }

  if (!queue?.current) {
    return interaction.reply({ content: 'Start playback to use live lyrics.', ephemeral: true });
  }

  const query = interaction.options.getString('query');
  let artist = '';
  let title = '';

  if (query) {
    const parsed = splitLyricsQuery(query.trim());
    if (parsed) {
      artist = parsed.artist;
      title = parsed.title;
    } else if (queue?.current?.author) {
      artist = queue.current.author;
      title = query.trim();
    } else {
      return interaction.reply({
        content: 'Provide a query in the format `Artist - Title`, or play a track first.',
        ephemeral: true
      });
    }
  } else if (queue?.current) {
    artist = queue.current.author;
    title = queue.current.title;
  } else {
    return interaction.reply({ content: 'Play a track or provide a query first.', ephemeral: true });
  }

  artist = sanitizeArtist(artist);
  title = sanitizeTitle(title);

  if (!artist || !title) {
    return interaction.reply({ content: 'Unable to parse artist and title for lyrics search.', ephemeral: true });
  }

  await interaction.deferReply();

  const lyrics = await fetchLyrics(artist, title);
  if (!lyrics) {
    return interaction.editReply({ content: 'Lyrics not found.' });
  }

  const lines = lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return interaction.editReply({ content: 'Lyrics not found.' });
  }

  if (queue?.liveLyrics) {
    await stopLiveLyrics(queue, null);
  }

  const position = queue?.player?.position ?? 0;
  const embed = buildLiveLyricsEmbed(queue, lines, position);
  const message = await interaction.editReply({ embeds: [embed] });

  const trackId = queue.current?.encoded || `${queue.current?.title}-${queue.current?.author}`;
  const channelId = message.channelId || interaction.channelId;
  const intervalId = setInterval(async () => {
    if (!queue.current || trackId !== (queue.current.encoded || `${queue.current.title}-${queue.current.author}`)) {
      await stopLiveLyrics(queue, 'Live lyrics stopped (track changed).');
      return;
    }

    const updatedEmbed = buildLiveLyricsEmbed(queue, lines, queue.player?.position ?? 0);
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) return;
      const targetMessage = await channel.messages.fetch(message.id);
      await targetMessage.edit({ embeds: [updatedEmbed] });
    } catch (error) {
      // Ignore updates if message/channel is not available.
    }
  }, config.liveLyricsUpdateMs);

  queue.liveLyrics = {
    messageId: message.id,
    channelId,
    intervalId
  };
}

async function handleNormalize(interaction) {
  const enabled = interaction.options.getBoolean('enabled', true);
  const target = interaction.options.getInteger('target');
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  const queue = getQueue(guildId);
  if (queue) {
    if (!ensureSameChannel(interaction, queue)) {
      return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
    }
  }

  const patch = {
    normalization: {
      enabled,
      target: clampNumber(target ?? getGuildSettings(guildId).normalization.target, 10, 200)
    }
  };
  const settings = updateGuildSettings(guildId, patch);

  if (queue) {
    queue.settings = settings;
    queue.normalization = {
      enabled: settings.normalization.enabled,
      target: settings.normalization.target
    };
    await applyNormalization(queue);
  }

  const status = settings.normalization.enabled ? 'enabled' : 'disabled';
  return interaction.reply({
    content: `Normalization ${status} (target ${settings.normalization.target}).`
  });
}

async function handleEq(interaction) {
  const preset = interaction.options.getString('preset', true);
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  if (!EQ_PRESETS[preset]) {
    return interaction.reply({ content: 'Unknown EQ preset.', ephemeral: true });
  }

  const queue = getQueue(guildId);
  if (queue) {
    if (!ensureSameChannel(interaction, queue)) {
      return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
    }
  }

  const settings = updateGuildSettings(guildId, { eqPreset: preset });
  if (queue) {
    queue.settings = settings;
    queue.eqPreset = settings.eqPreset;
    await applyEqPreset(queue, queue.eqPreset);
  }

  return interaction.reply({ content: `EQ preset set to ${preset}.` });
}

async function handleLoop(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  const mode = interaction.options.getString('mode', true);
  queue.loop = mode;
  return interaction.reply({ content: `Loop mode set to ${mode}.` });
}

async function handleShuffle(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.tracks.length < 2) {
    return interaction.reply({ content: 'Not enough tracks to shuffle.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  shuffleArray(queue.tracks);
  return interaction.reply({ content: 'Queue shuffled.' });
}

async function handleRemove(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.tracks.length === 0) {
    return interaction.reply({ content: 'The queue is empty.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  const position = interaction.options.getInteger('position', true);
  if (position < 1 || position > queue.tracks.length) {
    return interaction.reply({ content: 'That position is out of range.', ephemeral: true });
  }

  const [removed] = queue.tracks.splice(position - 1, 1);
  return interaction.reply({ content: `Removed: ${formatTrack(removed)}` });
}

async function handleMove(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.tracks.length < 2) {
    return interaction.reply({ content: 'Not enough tracks to move.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  const from = interaction.options.getInteger('from', true);
  const to = interaction.options.getInteger('to', true);

  if (from < 1 || from > queue.tracks.length || to < 1 || to > queue.tracks.length) {
    return interaction.reply({ content: 'That position is out of range.', ephemeral: true });
  }

  const [track] = queue.tracks.splice(from - 1, 1);
  queue.tracks.splice(to - 1, 0, track);

  return interaction.reply({ content: `Moved track to position ${to}.` });
}

async function handleQueueMode(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }

  const mode = interaction.options.getString('mode', true);
  if (mode !== 'linear' && mode !== 'fair') {
    return interaction.reply({ content: 'Invalid queue mode.', ephemeral: true });
  }

  setQueueMode(queue, mode);
  queue.settings = updateGuildSettings(queue.guildId, { queueMode: mode });
  return interaction.reply({ content: `Queue mode set to ${mode}.` });
}

async function handleRadio(interaction) {
  const action = interaction.options.getString('action', true);
  const stations = loadStations();

  if (!stations.length) {
    return interaction.reply({
      content: `No stations configured. Add stations to ${config.stationsFile} and try again.`,
      ephemeral: true
    });
  }

  if (action === 'list') {
    const lines = stations.map((station, index) => `${index + 1}. ${station.name}`);
    return interaction.reply({ content: `Available stations:\n${lines.join('\n')}` });
  }

  const stationName = interaction.options.getString('station');
  if (!stationName) {
    return interaction.reply({ content: 'Provide a station name.', ephemeral: true });
  }

  const station = stations.find((entry) => entry.name.toLowerCase() === stationName.toLowerCase());
  if (!station) {
    const suggestions = stations.map((entry) => entry.name).join(', ');
    return interaction.reply({ content: `Station not found. Available: ${suggestions}` });
  }

  const memberChannel = interaction.member?.voice?.channel;
  await interaction.deferReply();
  const prepared = await ensureQueueForInteraction(interaction, memberChannel);
  if (prepared.error) {
    return interaction.editReply({ content: prepared.error });
  }

  const { queue, player, node } = prepared;
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.editReply({ content: queueMutationBlock });
  }
  const resolveNode = player?.node || node;
  const resolved = await resolveTracks(resolveNode, station.url);
  if (!resolved.tracks.length) {
    return interaction.editReply({ content: 'Unable to load that station URL.' });
  }

  const track = mapTrack(resolved.tracks[0], interaction.user);
  const limited = applyQueueLimit(queue, [track]);
  if (!limited.tracks.length) {
    return interaction.editReply({ content: `Queue limit reached (${limited.maxQueue}).` });
  }
  enqueueTracks(queue, limited.tracks, false);
  if (!queue.current) {
    await playNext(queue);
  }

  return interaction.editReply({ content: `Queued station: ${station.name}` });
}

async function handleAutoClean(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
  }
  if (!ensureSameChannel(interaction, queue)) {
    return interaction.reply({ content: 'You need to be in the same voice channel as the bot.', ephemeral: true });
  }
  const queueMutationBlock = getQueueMutationBlockReason(interaction, queue);
  if (queueMutationBlock) {
    return interaction.reply({ content: queueMutationBlock, ephemeral: true });
  }

  const mode = interaction.options.getString('mode', true);
  await interaction.deferReply();

  let removedDuplicates = 0;
  let removedUnavailable = 0;
  let checked = 0;

  if (mode === 'duplicates' || mode === 'all') {
    removedDuplicates = removeDuplicateTracks(queue);
  }
  if (mode === 'unavailable' || mode === 'all') {
    const result = await removeUnavailableTracks(queue);
    removedUnavailable = result.removed;
    checked = result.checked;
  }
  if (queue.mode === 'fair' && queue.tracks.length > 1) {
    queue.tracks = rebuildFairQueue(queue.tracks);
  }

  const parts = [`Removed duplicates: ${removedDuplicates}`];
  if (mode === 'unavailable' || mode === 'all') {
    parts.push(`Removed unavailable: ${removedUnavailable}`);
    parts.push(`Checked: ${checked}`);
  }

  return interaction.editReply({ content: parts.join(' | ') });
}

async function handlePing(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const discordPing = Math.round(client.ws.ping);
  const queue = getQueue(interaction.guildId);
  const playerPing = queue?.player?.ping ?? null;

  const lines = [];
  const nodesList = Array.from(shoukaku.nodes.values());
  for (const node of nodesList) {
    let restLatency = null;
    if (node.state === 1) {
      try {
        const start = Date.now();
        await node.rest.getPlayers();
        restLatency = Date.now() - start;
      } catch (error) {
        restLatency = null;
      }
    }
    const state = node.state === 1 ? 'connected' : 'disconnected';
    const players = node.stats?.players ?? 'n/a';
    const cpu = node.stats?.cpu?.systemLoad
      ? `${(node.stats.cpu.systemLoad * 100).toFixed(1)}%`
      : 'n/a';
    const ping = node.stats?.ping ?? 'n/a';
    lines.push(
      `${node.name}: ${state} | players ${players} | cpu ${cpu} | ping ${ping} | rest ${restLatency ?? 'n/a'}ms`
    );
  }

  const content = [
    `Discord gateway ping: ${discordPing}ms`,
    `Player ping: ${playerPing ?? 'n/a'}ms`,
    nodesList.length ? `Lavalink nodes:\n${lines.join('\n')}` : 'No Lavalink nodes available.'
  ].join('\n');

  return interaction.editReply({ content });
}

async function handleSettings(interaction) {
  const action = interaction.options.getString('action', true);
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  if (action === 'view') {
    const settings = getGuildSettings(guildId);
    return interaction.reply({
      content: `Current settings:\n${formatSettings(settings)}`,
      ephemeral: true
    });
  }

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: 'You need Manage Server permission to change settings.', ephemeral: true });
  }

  const key = interaction.options.getString('key');
  const value = interaction.options.getString('value');
  if (!key || value === null) {
    return interaction.reply({ content: 'Provide both a key and value.', ephemeral: true });
  }
  const patch = buildSettingsPatch(key, value, guildId);
  if (!patch) {
    return interaction.reply({ content: 'Invalid setting value.', ephemeral: true });
  }

  const updated = updateGuildSettings(guildId, patch);
  const queue = getQueue(guildId);
  if (queue) {
    applySettingsToQueue(queue);
    await applyAudioSettings(queue);
    if (queue.current) {
      startNowPlayingUpdates(queue);
    }
    await updateAloneTimer(queue);
  }

  return interaction.reply({ content: `Updated settings: ${key} = ${value}` });
}

async function handleTopTracks(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  const limit = clampNumber(interaction.options.getInteger('limit') ?? 10, 1, 20);
  const stats = getGuildStats(guildId);
  const tracks = Object.values(stats.tracks || {});

  if (!tracks.length) {
    return interaction.reply({ content: 'No track stats yet.', ephemeral: true });
  }

  tracks.sort((a, b) => b.count - a.count);
  const lines = tracks.slice(0, limit).map((entry, index) => {
    const title = entry.title || 'Unknown title';
    const author = entry.author || 'Unknown artist';
    const count = entry.count || 0;
    if (entry.uri) {
      return `${index + 1}. ${title} - ${author} (${count})`;
    }
    return `${index + 1}. ${title} - ${author} (${count})`;
  });

  return interaction.reply({ content: `Top tracks:\n${lines.join('\n')}` });
}

async function handleTopArtists(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  const limit = clampNumber(interaction.options.getInteger('limit') ?? 10, 1, 20);
  const stats = getGuildStats(guildId);
  const tracks = Object.values(stats.tracks || {});

  if (!tracks.length) {
    return interaction.reply({ content: 'No artist stats yet.', ephemeral: true });
  }

  const artists = new Map();
  for (const entry of tracks) {
    const author = String(entry.author || 'Unknown artist').trim() || 'Unknown artist';
    const key = author.toLowerCase();
    const current = artists.get(key) || { author, count: 0, trackCount: 0 };
    current.count += Number(entry.count || 0);
    current.trackCount += 1;
    artists.set(key, current);
  }

  const sorted = Array.from(artists.values()).sort((a, b) => b.count - a.count);
  const lines = sorted.slice(0, limit).map((entry, index) => {
    return `${index + 1}. ${entry.author} (${entry.count} plays, ${entry.trackCount} track${entry.trackCount === 1 ? '' : 's'})`;
  });

  return interaction.reply({ content: `Top artists:\n${lines.join('\n')}` });
}

async function handleHistory(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || queue.history.length === 0) {
    return interaction.reply({ content: 'No recently played tracks.', ephemeral: true });
  }

  const lines = queue.history.slice(0, 10).map((track, index) => `${index + 1}. ${formatTrack(track)}`);
  return interaction.reply({ content: `Recently played:\n${lines.join('\n')}` });
}

function ensureSameChannel(interaction, queue) {
  const memberChannelId = interaction.member?.voice?.channelId;
  if (!memberChannelId) return false;
  return memberChannelId === queue.voiceChannelId;
}

function hasManageGuildPermission(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);
}

function getQueueMutationBlockReason(interaction, queue) {
  if (!queue) return null;
  const isManager = hasManageGuildPermission(interaction);
  if (queue.frozen && !isManager) {
    return 'Queue is frozen. Only server managers can modify it.';
  }
  const isRequester = interaction.user?.id && queue.current?.requesterId === interaction.user.id;
  if (queue.locked && !isManager && !isRequester) {
    return 'Queue is locked. Only the current requester or a server manager can modify it.';
  }
  return null;
}

function getNode() {
  const node = (typeof shoukaku.getIdealNode === 'function' ? shoukaku.getIdealNode() : shoukaku.getNode?.()) || null;
  if (!node) {
    throw new Error('No Lavalink nodes are available. Check your Lavalink connection.');
  }
  return node;
}

function createSearchSession(session) {
  const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  searchSessions.set(sessionId, { ...session, createdAt: Date.now() });
  setTimeout(() => {
    searchSessions.delete(sessionId);
  }, SEARCH_SESSION_TTL_MS);
  return sessionId;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatSettings(settings) {
  return [
    `prefix: ${settings.prefix}`,
    `defaultVolume: ${settings.defaultVolume}`,
    `queueMode: ${settings.queueMode}`,
    `voteSkipRatio: ${settings.voteSkipRatio}`,
    `nowPlayingUpdateSec: ${settings.nowPlayingUpdateSec}`,
    `autoDisconnectSec: ${settings.autoDisconnectSec}`,
    `maxQueueLength: ${settings.maxQueueLength}`,
    `alwaysOn: ${settings.alwaysOn}`,
    `normalization.enabled: ${settings.normalization.enabled}`,
    `normalization.target: ${settings.normalization.target}`,
    `eqPreset: ${settings.eqPreset}`
  ].join('\n');
}

function parseBoolean(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true;
  if (['false', 'no', 'off', '0'].includes(normalized)) return false;
  return null;
}

function buildSettingsPatch(key, value, guildId) {
  const current = getGuildSettings(guildId);
  switch (key) {
    case 'default_volume': {
      const level = clampNumber(Number(value), 0, 150);
      if (Number.isNaN(Number(value))) return null;
      return { defaultVolume: level };
    }
    case 'prefix': {
      const trimmed = String(value).trim();
      if (!trimmed) return null;
      return { prefix: trimmed.slice(0, 5) };
    }
    case 'queue_mode': {
      if (value !== 'linear' && value !== 'fair') return null;
      return { queueMode: value };
    }
    case 'vote_skip_ratio': {
      const ratio = clampNumber(Number(value), 0.2, 1);
      if (Number.isNaN(Number(value))) return null;
      return { voteSkipRatio: ratio };
    }
    case 'now_playing_update_sec': {
      const seconds = clampNumber(Number(value), 0, 300);
      if (Number.isNaN(Number(value))) return null;
      return { nowPlayingUpdateSec: seconds };
    }
    case 'auto_disconnect_sec': {
      const seconds = clampNumber(Number(value), 30, 3600);
      if (Number.isNaN(Number(value))) return null;
      return { autoDisconnectSec: seconds };
    }
    case 'max_queue_length': {
      const length = clampNumber(Number(value), 10, 1000);
      if (Number.isNaN(Number(value))) return null;
      return { maxQueueLength: length };
    }
    case 'always_on': {
      const flag = parseBoolean(value);
      if (flag === null) return null;
      return { alwaysOn: flag };
    }
    case 'normalization_enabled': {
      const flag = parseBoolean(value);
      if (flag === null) return null;
      return {
        normalization: {
          ...current.normalization,
          enabled: flag
        }
      };
    }
    case 'normalization_target': {
      const target = clampNumber(Number(value), 10, 200);
      if (Number.isNaN(Number(value))) return null;
      return {
        normalization: {
          ...current.normalization,
          target
        }
      };
    }
    case 'eq_preset': {
      if (!EQ_PRESETS[value]) return null;
      return { eqPreset: value };
    }
    default:
      return null;
  }
}

function isUrl(query) {
  return /^https?:\/\//i.test(query);
}

function isSourceIdentifier(query) {
  return /^(spotify|applemusic|deezer|soundcloud|bandcamp):/i.test(query);
}

function insertTracksAt(queue, tracks, position) {
  const index = clampNumber(position - 1, 0, queue.tracks.length);
  queue.tracks.splice(index, 0, ...tracks);
  return index;
}

function setQueueMode(queue, mode) {
  queue.mode = mode;
  if (mode === 'fair' && queue.tracks.length > 1) {
    queue.tracks = rebuildFairQueue(queue.tracks);
  }
}

function rebuildFairQueue(tracks) {
  const buckets = new Map();
  const order = [];
  for (const track of tracks) {
    const key = track.requesterId || 'unknown';
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key).push(track);
  }

  const result = [];
  let added = true;
  while (added) {
    added = false;
    for (const key of order) {
      const bucket = buckets.get(key);
      if (bucket && bucket.length) {
        result.push(bucket.shift());
        added = true;
      }
    }
  }
  return result;
}

async function getListenerCount(queue) {
  try {
    const guild = client.guilds.cache.get(queue.guildId) || (await client.guilds.fetch(queue.guildId));
    const channel = guild.channels.cache.get(queue.voiceChannelId) || (await guild.channels.fetch(queue.voiceChannelId));
    if (!channel || !channel.members) return 0;
    return channel.members.filter((member) => !member.user.bot).size;
  } catch (error) {
    return 0;
  }
}

function splitLyricsQuery(input) {
  const separators = [' - ', ' – ', ' — ', ' | '];
  for (const sep of separators) {
    const index = input.indexOf(sep);
    if (index > 0) {
      const artist = input.slice(0, index).trim();
      const title = input.slice(index + sep.length).trim();
      if (artist && title) return { artist, title };
    }
  }
  return null;
}

function sanitizeTitle(title) {
  return title
    .replace(/\s*[\(\[][^)\]]*(official|lyrics|audio|video|mv|hd|remaster|live)[^)\]]*[\)\]]/gi, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
}

function sanitizeArtist(artist) {
  return artist.replace(/\s+-\s+topic$/i, '').trim();
}

async function fetchLyrics(artist, title) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data.lyrics !== 'string') return null;
    return data.lyrics;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveTracks(node, query) {
  const resolver = node.rest.resolve || node.rest.resolveTracks || node.rest.resolveTrack;
  if (!resolver) {
    throw new Error('Lavalink REST resolver is not available.');
  }

  const searchQuery = isUrl(query) || isSourceIdentifier(query) ? query : `ytsearch:${query}`;
  const result = await resolver.call(node.rest, searchQuery);

  const loadTypeRaw = result.loadType || result.loadtype || '';
  const loadType = String(loadTypeRaw).toUpperCase();

  if (loadType === 'NO_MATCHES' || loadType === 'LOAD_FAILED') {
    return { tracks: [], loadType };
  }

  if (loadType === 'TRACK_LOADED') {
    const track = result.data || (result.tracks && result.tracks[0]);
    return { tracks: track ? [track] : [], loadType };
  }

  if (loadType === 'PLAYLIST_LOADED') {
    const playlist = result.data || {};
    const tracks = playlist.tracks || result.tracks || [];
    const playlistName = playlist.info?.name || result.playlistInfo?.name || null;
    return { tracks, playlistName, loadType };
  }

  if (loadType === 'SEARCH_RESULT' || loadType === 'SEARCH_RESULTS') {
    const tracks = result.data || result.tracks || [];
    return { tracks, loadType: 'SEARCH_RESULT' };
  }

  const fallbackTracks = result.data || result.tracks || [];
  return { tracks: Array.isArray(fallbackTracks) ? fallbackTracks : [fallbackTracks], loadType: 'TRACK_LOADED' };
}

function mapTrack(track, requester) {
  const info = track.info || track.track?.info || track;
  return {
    encoded: track.encoded || track.track || track,
    title: info.title || 'Unknown title',
    author: info.author || info.artist || 'Unknown artist',
    length: info.length || info.duration || 0,
    uri: info.uri || info.url || null,
    artworkUrl: info.artworkUrl || info.thumbnail || info.image || null,
    source: info.sourceName || info.source || 'unknown',
    requesterId: requester?.id || null,
    requesterTag: requester?.tag || null
  };
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Live';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatUptime(seconds) {
  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}

function formatTrack(track) {
  const duration = formatDuration(track.length);
  return `${track.title} - ${track.author} (${duration})`;
}

function formatTrackMarkdown(track) {
  const duration = formatDuration(track.length);
  if (track.uri) {
    return `[${track.title}](${track.uri}) - ${track.author} (${duration})`;
  }
  return `${track.title} - ${track.author} (${duration})`;
}

function buildProgressBar(positionMs, lengthMs, size = 14) {
  if (!lengthMs || lengthMs <= 0) return 'Live';
  const ratio = Math.min(Math.max(positionMs / lengthMs, 0), 1);
  const filled = Math.round(size * ratio);
  const empty = Math.max(size - filled, 0);
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${formatDuration(positionMs)} / ${formatDuration(lengthMs)}`;
}

function buildNowPlayingEmbed(queue, includeProgress = true) {
  if (!queue.current) return null;
  const track = queue.current;
  const player = queue.player;
  const position = player?.position ?? 0;
  const length = track.length || 0;

  const embed = new EmbedBuilder()
    .setTitle('Now Playing')
    .setDescription(formatTrackMarkdown(track))
    .setTimestamp(new Date());

  if (track.artworkUrl) {
    embed.setThumbnail(track.artworkUrl);
  }

  if (includeProgress) {
    embed.addFields({
      name: 'Progress',
      value: buildProgressBar(position, length),
      inline: false
    });
  }

  embed.addFields(
    { name: 'Volume', value: String(queue.volume), inline: true },
    { name: 'Loop', value: queue.loop, inline: true },
    { name: 'Queue', value: String(queue.tracks.length), inline: true },
    { name: 'Mode', value: queue.mode, inline: true }
  );

  if (track.requesterTag) {
    embed.addFields({ name: 'Requested by', value: track.requesterTag, inline: true });
  }

  return embed;
}

function buildLiveLyricsEmbed(queue, lines, positionMs) {
  const track = queue?.current;
  const title = track?.title || 'Live Lyrics';
  const length = track?.length || 0;
  const totalLines = lines.length;
  const windowSize = 8;

  let index = 0;
  if (length > 0 && totalLines > 0) {
    index = Math.min(totalLines - 1, Math.floor((positionMs / length) * totalLines));
  }
  const start = Math.max(0, index - Math.floor(windowSize / 2));
  const slice = lines.slice(start, start + windowSize);

  const body = slice
    .map((line, offset) => {
      const lineIndex = start + offset;
      return lineIndex === index ? `**${line}**` : line;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`Live Lyrics: ${title}`)
    .setDescription(body || 'Lyrics unavailable.')
    .setTimestamp(new Date());

  if (length > 0) {
    embed.addFields({ name: 'Progress', value: buildProgressBar(positionMs, length), inline: false });
  }

  if (track?.author) {
    embed.setFooter({ text: track.author });
  }

  return embed;
}

async function renderNowPlayingCard(queue) {
  if (!Canvas || !queue?.current) return null;
  const { createCanvas, loadImage } = Canvas;
  const width = 900;
  const height = 240;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#141414');
  gradient.addColorStop(1, '#252525');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const track = queue.current;
  const artworkSize = 180;
  const padding = 24;
  let textOffsetX = padding;

  if (track.artworkUrl) {
    try {
      const art = await loadImage(track.artworkUrl);
      ctx.drawImage(art, padding, padding, artworkSize, artworkSize);
      textOffsetX = padding + artworkSize + 24;
    } catch (error) {
      textOffsetX = padding;
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Sans';
  ctx.fillText(truncateText(track.title, 50), textOffsetX, 70);

  ctx.fillStyle = '#cfcfcf';
  ctx.font = '20px Sans';
  ctx.fillText(truncateText(track.author, 40), textOffsetX, 110);

  const position = queue.player?.position ?? 0;
  const length = track.length || 0;
  const progressText = buildProgressBar(position, length, 18);

  ctx.fillStyle = '#9ad1ff';
  ctx.font = '16px Sans';
  ctx.fillText(progressText, textOffsetX, 150);

  const barX = textOffsetX;
  const barY = 170;
  const barWidth = width - barX - padding;
  const barHeight = 10;
  ctx.fillStyle = '#333333';
  ctx.fillRect(barX, barY, barWidth, barHeight);
  if (length > 0) {
    const ratio = Math.min(Math.max(position / length, 0), 1);
    ctx.fillStyle = '#1db954';
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
  }

  return { buffer: canvas.toBuffer('image/png'), name: 'now-playing.png' };
}

async function announceNowPlaying(queue) {
  const embed = buildNowPlayingEmbed(queue, true);
  if (!embed) return;

  let channel = client.channels.cache.get(queue.textChannelId);
  if (!channel) {
    try {
      channel = await client.channels.fetch(queue.textChannelId);
    } catch (error) {
      return;
    }
  }

  if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return;
  }

  if (queue.nowPlayingMessageId && channel.messages) {
    try {
      const message = await channel.messages.fetch(queue.nowPlayingMessageId);
      await message.edit({ embeds: [embed] });
      return;
    } catch (error) {
      queue.nowPlayingMessageId = null;
    }
  }

  try {
    let payload = { embeds: [embed] };
    if (config.nowPlayingCard && Canvas) {
      const card = await renderNowPlayingCard(queue);
      if (card) {
        embed.setImage(`attachment://${card.name}`);
        payload = {
          embeds: [embed],
          files: [{ attachment: card.buffer, name: card.name }]
        };
      }
    }
    const message = await channel.send(payload);
    queue.nowPlayingMessageId = message.id;
  } catch (error) {
    // Ignore send errors (missing perms, etc.)
  }
}

function enqueueTracks(queue, tracks, insertNext) {
  if (!insertNext) {
    queue.tracks.push(...tracks);
    if (queue.mode === 'fair' && queue.tracks.length > 1) {
      queue.tracks = rebuildFairQueue(queue.tracks);
    }
    return;
  }
  for (let i = tracks.length - 1; i >= 0; i -= 1) {
    queue.tracks.unshift(tracks[i]);
  }
}

function applyQueueLimit(queue, tracks) {
  const maxQueue = clampNumber(queue.settings?.maxQueueLength ?? config.maxQueueLengthDefault, 10, 1000);
  if (!maxQueue) return { tracks, trimmed: false, maxQueue };
  const available = maxQueue - queue.tracks.length;
  if (available <= 0) return { tracks: [], trimmed: true, maxQueue };
  if (tracks.length > available) {
    return { tracks: tracks.slice(0, available), trimmed: true, maxQueue };
  }
  return { tracks, trimmed: false, maxQueue };
}

function buildTrackKey(track) {
  if (track.uri) return track.uri;
  return `${track.title}|${track.author}|${track.length}`;
}

function recordTrackPlay(queue, track) {
  if (!track) return;
  const stats = getGuildStats(queue.guildId);
  const key = buildTrackKey(track);
  const entry = stats.tracks[key] || {
    title: track.title,
    author: track.author,
    uri: track.uri,
    count: 0,
    lastPlayed: null
  };
  entry.count += 1;
  entry.lastPlayed = new Date().toISOString();
  stats.tracks[key] = entry;
  scheduleStatsSave();
}

function removeDuplicateTracks(queue) {
  const seen = new Set();
  const original = queue.tracks.length;
  queue.tracks = queue.tracks.filter((track) => {
    const key = buildTrackKey(track);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return original - queue.tracks.length;
}

async function removeUnavailableTracks(queue) {
  const node = queue.player?.node || getNode();
  const total = queue.tracks.length;
  const maxCheck = Math.min(total, config.autoCleanMaxCheck);
  let removed = 0;
  let checked = 0;
  const kept = [];

  for (let i = 0; i < total; i += 1) {
    const track = queue.tracks[i];
    if (i >= maxCheck || !track?.uri) {
      kept.push(track);
      continue;
    }
    checked += 1;
    try {
      const result = await resolveTracks(node, track.uri);
      if (result.tracks.length) {
        kept.push(track);
      } else {
        removed += 1;
      }
    } catch (error) {
      kept.push(track);
    }
  }

  queue.tracks = kept;
  return { removed, checked };
}

function pushHistory(queue, track) {
  queue.history.unshift(track);
  if (queue.history.length > 20) {
    queue.history.pop();
  }
}

async function handleTrackFailure(queue, label, data) {
  console.error(`Track ${label}:`, data);
  stopNowPlayingUpdates(queue);
  await stopLiveLyrics(queue, 'Live lyrics stopped (track error).');
  if (queue.current) {
    pushHistory(queue, queue.current);
  }
  queue.current = null;
  await playNext(queue);
}

async function playNext(queue) {
  clearIdleTimer(queue);
  const next = queue.tracks.shift();

  if (!next) {
    queue.current = null;
    if (!queue.alwaysOn) {
      setIdleTimer(queue);
    }
    return;
  }

  queue.current = next;
  await playTrackSafe(queue.player, next.encoded);
}

function attachPlayerListeners(queue) {
  const player = queue.player;

  player.on('start', async () => {
    queue.skipVotes.clear();
    recordTrackPlay(queue, queue.current);
    try {
      await applyAudioSettings(queue);
    } catch (error) {
      console.error('Failed to apply audio settings:', error);
    }
    await announceNowPlaying(queue);
    startNowPlayingUpdates(queue);
  });

  player.on('end', async (data) => {
    const reason = String(data?.reason || '').toUpperCase();
    if (reason === 'REPLACED') return;

    stopNowPlayingUpdates(queue);
    await stopLiveLyrics(queue, 'Live lyrics stopped (track ended).');

    if (queue.current && queue.loop !== 'track') {
      pushHistory(queue, queue.current);
    }

    if (queue.loop === 'track' && queue.current) {
      queue.tracks.unshift(queue.current);
    } else if (queue.loop === 'queue' && queue.current) {
      queue.tracks.push(queue.current);
      if (queue.mode === 'fair' && queue.tracks.length > 1) {
        queue.tracks = rebuildFairQueue(queue.tracks);
      }
    }

    queue.current = null;
    await playNext(queue);
  });

  player.on('closed', async () => {
    stopNowPlayingUpdates(queue);
    await stopLiveLyrics(queue, 'Live lyrics stopped (player closed).');
    queues.delete(queue.guildId);
  });

  player.on('exception', async (data) => {
    await handleTrackFailure(queue, 'exception', data);
  });

  player.on('stuck', async (data) => {
    await handleTrackFailure(queue, 'stuck', data);
  });
}

async function playTrackSafe(player, encoded) {
  if (typeof player.playTrack === 'function') {
    return player.playTrack({ track: { encoded } });
  }
  if (typeof player.play === 'function') {
    return player.play(encoded);
  }
  throw new Error('Lavalink player does not support playTrack or play.');
}

async function stopTrackSafe(player) {
  if (typeof player.stopTrack === 'function') {
    return player.stopTrack();
  }
  if (typeof player.stop === 'function') {
    return player.stop();
  }
  throw new Error('Lavalink player does not support stopTrack or stop.');
}

async function setPausedSafe(player, paused) {
  if (typeof player.setPaused === 'function') {
    return player.setPaused(paused);
  }
  if (typeof player.pause === 'function') {
    return player.pause(paused);
  }
  throw new Error('Lavalink player does not support pause or setPaused.');
}

async function setVolumeSafe(player, volume) {
  if (typeof player.setGlobalVolume === 'function') {
    return player.setGlobalVolume(volume);
  }
  if (typeof player.setFilterVolume === 'function') {
    const filterVolume = Math.min(volume / 100, 5);
    return player.setFilterVolume(filterVolume);
  }
  if (typeof player.setVolume === 'function') {
    return player.setVolume(volume);
  }
  if (typeof player.volume === 'number') {
    player.volume = volume;
    return;
  }
  console.warn('Lavalink player does not support volume changes.');
}

async function setFilterVolumeSafe(player, volume) {
  if (typeof player.setFilterVolume === 'function') {
    return player.setFilterVolume(volume);
  }
  if (typeof player.setFilters === 'function') {
    return player.setFilters({ volume });
  }
  console.warn('Lavalink player does not support filter volume.');
}

async function seekSafe(player, position) {
  if (typeof player.seekTo === 'function') {
    return player.seekTo(position);
  }
  if (typeof player.seek === 'function') {
    return player.seek(position);
  }
  throw new Error('Lavalink player does not support seek.');
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function supportsVolume(player) {
  return (
    typeof player.setGlobalVolume === 'function' ||
    typeof player.setFilterVolume === 'function' ||
    typeof player.setVolume === 'function' ||
    typeof player.volume === 'number'
  );
}

client.login(config.token);
