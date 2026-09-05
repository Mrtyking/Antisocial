const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const deployCommands = require('./deploy-commands');

if (!config.token) {
  console.error('[FATAL] Token de Discord no configurado en .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User
  ]
});

client.commands = new Collection();

// Cargar comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// Cargar eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Manejo de errores no capturados para asegurar estabilidad 24/7
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

// Conectar el bot inmediatamente para que aparezca online sin bloqueos
(async () => {
  try {
    console.log('Iniciando sesión en Discord Gateway...');
    await client.login(config.token);

    // Una vez conectado con éxito, registrar comandos de barra en segundo plano
    deployCommands(client).catch(err => {
      console.warn('Aviso en registro de comandos:', err.message);
    });
  } catch (error) {
    console.error('Error al iniciar el bot AntiSocial:', error);
  }
})();
