const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[ADVERTENCIA] El comando en ${filePath} no tiene "data" o "execute".`);
  }
}

const rest = new REST({ version: '10' }).setToken(config.token);

async function deploy() {
  try {
    console.log(`Iniciando registro de ${commands.length} comandos de barra (/)...`);

    // Servidor Principal AntiSocial
    if (config.guildId) {
      console.log(`Registrando en Servidor Principal (${config.guildId})...`);
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );
      console.log(`Comandos registrados en el Servidor Principal (${config.guildId}).`);
    }

    // Servidor Test
    if (config.testGuildId && config.testGuildId !== config.guildId) {
      try {
        console.log(`Registrando en Servidor Test (${config.testGuildId})...`);
        await rest.put(
          Routes.applicationGuildCommands(config.clientId, config.testGuildId),
          { body: commands }
        );
        console.log(`Comandos registrados en el Servidor Test (${config.testGuildId}).`);
      } catch (e) {
        console.warn(`Aviso: No se pudo registrar en Servidor Test (${config.testGuildId}): ${e.message}`);
      }
    }

    console.log('Registro de comandos completado con éxito.');
  } catch (error) {
    console.error('Error durante el registro de comandos:', error);
  }
}

if (require.main === module) {
  deploy();
}

module.exports = deploy;
