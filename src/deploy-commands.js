const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const ALLOWED_COMMANDS = [
  'add',
  'bypass',
  'close',
  'panel',
  'remove',
  'rename',
  'transcript'
];

function loadCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        if (ALLOWED_COMMANDS.includes(command.data.name)) {
          commands.push(command.data.toJSON());
        } else {
          console.log(`[deploy-commands] Omitiendo comando obsoleto del archivo: ${command.data.name}`);
        }
      }
    } catch (e) {
      console.warn(`[deploy-commands] Error cargando ${file}:`, e.message);
    }
  }
  return commands;
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

    // 1. Limpiar comandos globales para que no queden comandos obsoletos en caché global
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
    } catch (e) {
      // Silencioso
    }

    const commands = loadCommands();
    console.log(`Iniciando registro de ${commands.length} comandos de barra (/)...`);

    async function syncGuild(guildId, guildName) {
      try {
        console.log(`Sincronizando comandos en ${guildName} (${guildId})...`);

        // Obtener comandos existentes y eliminar los obsoletos explícitamente
        const existing = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        for (const cmd of existing) {
          if (!ALLOWED_COMMANDS.includes(cmd.name)) {
            console.log(`[deploy-commands] Purgando comando obsoleto en ${guildName}: ${cmd.name} (ID: ${cmd.id})`);
            await rest.delete(Routes.applicationGuildCommand(clientId, guildId, cmd.id)).catch(() => null);
          }
        }

        // Registrar lista limpia
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commands }
        );
        console.log(`Comandos limpios registrados en ${guildName} (${guildId}):`, commands.map(c => `/${c.name}`).join(', '));
      } catch (err) {
        console.warn(`Aviso en ${guildName} (${guildId}):`, err.message);
      }
    }

    // 2. Servidor Principal AntiSocial
    const mainGuildId = (config.guildId || '').trim();
    if (mainGuildId && /^\d{17,20}$/.test(mainGuildId)) {
      await syncGuild(mainGuildId, 'Servidor Principal');
    }

    // 3. Servidor Test (si aplica)
    const testGuildId = (config.testGuildId || '').trim();
    if (testGuildId && /^\d{17,20}$/.test(testGuildId) && testGuildId !== mainGuildId) {
      await syncGuild(testGuildId, 'Servidor Test');
    }

    console.log('Proceso de registro finalizado: únicamente comandos cortos y limpios activos.');
  } catch (error) {
    console.error('Error durante el registro de comandos:', error);
  }
}

if (require.main === module) {
  deploy();
}

module.exports = deploy;
