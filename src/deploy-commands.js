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

const rest = new REST({ version: '10' });

async function deploy(client = null) {
  try {
    const token = config.token;
    if (!token) {
      console.warn('[deploy-commands] No se configuró DISCORD_TOKEN.');
      return;
    }

    rest.setToken(token);

    const clientId = (client?.user?.id || config.clientId || '').trim();
    if (!clientId || !/^\d{17,20}$/.test(clientId)) {
      console.warn(`[deploy-commands] CLIENT_ID inválido (${clientId}). Se omitió el registro de comandos.`);
      return;
    }

    console.log(`Iniciando registro de ${commands.length} comandos de barra (/)...`);

    // Servidor Principal AntiSocial
    const mainGuildId = (config.guildId || '').trim();
    if (mainGuildId && /^\d{17,20}$/.test(mainGuildId)) {
      try {
        console.log(`Registrando en Servidor Principal (${mainGuildId})...`);
        await rest.put(
          Routes.applicationGuildCommands(clientId, mainGuildId),
          { body: commands }
        );
        console.log(`Comandos registrados en el Servidor Principal (${mainGuildId}).`);
      } catch (err) {
        console.warn(`Aviso: No se pudieron registrar comandos en Servidor Principal (${mainGuildId}):`, err.message);
      }
    }

    // Servidor Test (solo si es una ID numérica válida y diferente a la principal)
    const testGuildId = (config.testGuildId || '').trim();
    if (testGuildId && /^\d{17,20}$/.test(testGuildId) && testGuildId !== mainGuildId) {
      try {
        console.log(`Registrando en Servidor Test (${testGuildId})...`);
        await rest.put(
          Routes.applicationGuildCommands(clientId, testGuildId),
          { body: commands }
        );
        console.log(`Comandos registrados en el Servidor Test (${testGuildId}).`);
      } catch (err) {
        console.warn(`Aviso: No se pudo registrar en Servidor Test (${testGuildId}):`, err.message);
      }
    }

    console.log('Proceso de registro de comandos finalizado.');
  } catch (error) {
    console.error('Error durante el registro de comandos:', error);
  }
}

if (require.main === module) {
  deploy();
}

module.exports = deploy;
