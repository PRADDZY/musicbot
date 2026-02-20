require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { commandData } = require('./commands');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
      console.log('Slash commands deployed to guild:', guildId);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log('Global slash commands deployed. Note: global commands can take up to 1 hour to update.');
    }
  } catch (error) {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  }
})();
