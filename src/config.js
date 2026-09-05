require('dotenv').config();
const path = require('path');
const fs = require('fs');

const rawConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  guildId: process.env.GUILD_ID || '1369767579505397911',
  testGuildId: process.env.TEST_GUILD_ID || '1413967480078205031',
  bannerPath: path.join(__dirname, '../assets/banner.jpg'),
  questionsGifPath: path.join(__dirname, '../assets/questions.gif'),
  panel: rawConfig.panel,
  categories: rawConfig.categories,
  ticketSettings: rawConfig.ticketSettings,
  botPresence: rawConfig.botPresence
};
