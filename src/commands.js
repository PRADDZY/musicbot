const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a track or playlist from a supported source')
    .addStringOption((option) =>
      option.setName('query').setDescription('URL or search query').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('file').setDescription('Audio file attachment (mp3, m4a, ogg, flac)').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('playnext')
    .setDescription('Play a track next (adds to the front of the queue)')
    .addStringOption((option) =>
      option.setName('query').setDescription('URL or search query').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('file').setDescription('Audio file attachment (mp3, m4a, ogg, flac)').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search and pick from the top results')
    .addStringOption((option) =>
      option.setName('query').setDescription('Search query').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('insert')
    .setDescription('Insert a track at a specific queue position')
    .addStringOption((option) =>
      option.setName('query').setDescription('URL or search query').setRequired(false)
    )
    .addAttachmentOption((option) =>
      option.setName('file').setDescription('Audio file attachment (mp3, m4a, ogg, flac)').setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Queue position (1 = next up)')
        .setMinValue(1)
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  new SlashCommandBuilder().setName('unskip').setDescription('Restore the most recently played track'),
  new SlashCommandBuilder()
    .setName('jumpback')
    .setDescription('Jump back to a recently played track')
    .addIntegerOption((option) =>
      option.setName('count').setDescription('How many tracks back (default 1)').setMinValue(1).setMaxValue(20).setRequired(false)
    ),
  new SlashCommandBuilder().setName('voteskip').setDescription('Vote to skip the current track'),
  new SlashCommandBuilder()
    .setName('skipto')
    .setDescription('Skip to a specific position in the queue')
    .addIntegerOption((option) =>
      option.setName('position').setDescription('Queue position (1 = next up)').setMinValue(1).setRequired(true)
    ),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
  new SlashCommandBuilder().setName('clearqueue').setDescription('Clear the upcoming queue'),
  new SlashCommandBuilder()
    .setName('removeuser')
    .setDescription('Remove queued tracks requested by a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('User whose tracks should be removed').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('queuelock')
    .setDescription('Lock or unlock queue mutations')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Lock or unlock queue modifications')
        .setRequired(true)
        .addChoices(
          { name: 'lock', value: 'lock' },
          { name: 'unlock', value: 'unlock' }
        )
    ),
  new SlashCommandBuilder()
    .setName('queuefreeze')
    .setDescription('Freeze or unfreeze queue mutations (manager only)')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Enable or disable freeze mode').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('sleep')
    .setDescription('Set or cancel a sleep timer')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Set or cancel the sleep timer')
        .setRequired(true)
        .addChoices(
          { name: 'set', value: 'set' },
          { name: 'cancel', value: 'cancel' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Minutes before stopping playback (for set)')
        .setMinValue(1)
        .setMaxValue(720)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('mode247')
    .setDescription('Enable or disable 24/7 mode')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Keep bot connected when idle').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('queuesnapshot')
    .setDescription('Save, load, list, or delete queue snapshots')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Snapshot action')
        .setRequired(true)
        .addChoices(
          { name: 'save', value: 'save' },
          { name: 'load', value: 'load' },
          { name: 'list', value: 'list' },
          { name: 'delete', value: 'delete' }
        )
    )
    .addStringOption((option) =>
      option.setName('name').setDescription('Snapshot name (required for save/load/delete)').setRequired(false)
    ),
  new SlashCommandBuilder().setName('leave').setDescription('Disconnect from the voice channel'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the currently playing track'),
  new SlashCommandBuilder().setName('nowplayingcard').setDescription('Show a now playing image card'),
  new SlashCommandBuilder().setName('botinfo').setDescription('Show bot status and Lavalink info'),
  new SlashCommandBuilder().setName('replay').setDescription('Restart the current track'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set playback volume (0-150)')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('Volume level').setMinValue(0).setMaxValue(150).setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('forward')
    .setDescription('Seek forward by a number of seconds')
    .addIntegerOption((option) =>
      option.setName('seconds').setDescription('Seconds to skip forward').setMinValue(1).setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('rewind')
    .setDescription('Seek backward by a number of seconds')
    .addIntegerOption((option) =>
      option.setName('seconds').setDescription('Seconds to rewind').setMinValue(1).setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a position in the current track')
    .addIntegerOption((option) =>
      option.setName('seconds').setDescription('Position in seconds').setMinValue(0).setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Fetch lyrics for the current track or a query')
    .addStringOption((option) =>
      option.setName('query').setDescription('Format: Artist - Title').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('lyricslive')
    .setDescription('Start or stop live lyrics updates')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Start or stop live lyrics')
        .setRequired(true)
        .addChoices(
          { name: 'start', value: 'start' },
          { name: 'stop', value: 'stop' }
        )
    )
    .addStringOption((option) =>
      option.setName('query').setDescription('Format: Artist - Title').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('normalize')
    .setDescription('Enable or disable volume normalization')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Enable normalization').setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('target')
        .setDescription('Target volume (10-200)')
        .setMinValue(10)
        .setMaxValue(200)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('eq')
    .setDescription('Set an equalizer preset')
    .addStringOption((option) =>
      option
        .setName('preset')
        .setDescription('EQ preset')
        .setRequired(true)
        .addChoices(
          { name: 'off', value: 'off' },
          { name: 'bass', value: 'bass' },
          { name: 'pop', value: 'pop' },
          { name: 'rock', value: 'rock' },
          { name: 'electronic', value: 'electronic' },
          { name: 'vocal', value: 'vocal' },
          { name: 'night', value: 'night' }
        )
    ),
  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'off', value: 'off' },
          { name: 'track', value: 'track' },
          { name: 'queue', value: 'queue' }
        )
    ),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue'),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption((option) =>
      option.setName('position').setDescription('Queue position (1 = next up)').setMinValue(1).setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track within the queue')
    .addIntegerOption((option) =>
      option.setName('from').setDescription('Position to move').setMinValue(1).setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName('to').setDescription('New position').setMinValue(1).setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('queuemode')
    .setDescription('Set queue mode')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Queue mode')
        .setRequired(true)
        .addChoices(
          { name: 'linear', value: 'linear' },
          { name: 'fair', value: 'fair' }
        )
    ),
  new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Play a preset radio station')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('List or play stations')
        .setRequired(true)
        .addChoices(
          { name: 'list', value: 'list' },
          { name: 'play', value: 'play' }
        )
    )
    .addStringOption((option) =>
      option.setName('station').setDescription('Station name (for play)').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('autoclean')
    .setDescription('Clean up the queue')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Cleanup mode')
        .setRequired(true)
        .addChoices(
          { name: 'duplicates', value: 'duplicates' },
          { name: 'unavailable', value: 'unavailable' },
          { name: 'all', value: 'all' }
        )
    ),
  new SlashCommandBuilder().setName('ping').setDescription('Show Discord and Lavalink latency'),
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View or update guild settings')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('View or set settings')
        .setRequired(true)
        .addChoices(
          { name: 'view', value: 'view' },
          { name: 'set', value: 'set' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('key')
        .setDescription('Setting key (for set)')
        .setRequired(false)
        .addChoices(
          { name: 'prefix', value: 'prefix' },
          { name: 'default_volume', value: 'default_volume' },
          { name: 'queue_mode', value: 'queue_mode' },
          { name: 'vote_skip_ratio', value: 'vote_skip_ratio' },
          { name: 'now_playing_update_sec', value: 'now_playing_update_sec' },
          { name: 'auto_disconnect_sec', value: 'auto_disconnect_sec' },
          { name: 'max_queue_length', value: 'max_queue_length' },
          { name: 'always_on', value: 'always_on' },
          { name: 'normalization_enabled', value: 'normalization_enabled' },
          { name: 'normalization_target', value: 'normalization_target' },
          { name: 'eq_preset', value: 'eq_preset' }
        )
    )
    .addStringOption((option) =>
      option.setName('value').setDescription('Setting value (for set)').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('toptracks')
    .setDescription('Show the most played tracks in this server')
    .addIntegerOption((option) =>
      option.setName('limit').setDescription('Number of tracks to show').setMinValue(1).setMaxValue(20).setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('topartists')
    .setDescription('Show the most played artists in this server')
    .addIntegerOption((option) =>
      option.setName('limit').setDescription('Number of artists to show').setMinValue(1).setMaxValue(20).setRequired(false)
    ),
  new SlashCommandBuilder().setName('history').setDescription('Show recently played tracks')
];

module.exports = {
  commandData: commands.map((cmd) => cmd.toJSON())
};
