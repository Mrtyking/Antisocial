const { ActivityType } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`========================================`);
    console.log(` AntiSocial Bot conectado exitosamente `);
    console.log(` Tag: ${client.user.tag} (ID: ${client.user.id})`);
    console.log(` Servidores: ${client.guilds.cache.size}`);
    console.log(`========================================`);

    const presenceConfig = config.botPresence || {
      activityText: 'https://discord.gg/antisociall',
      status: 'online'
    };

    client.user.setPresence({
      activities: [
        {
          name: presenceConfig.activityText,
          type: ActivityType.Custom,
          state: presenceConfig.activityText
        }
      ],
      status: presenceConfig.status || 'online'
    });

    const TicketService = require('../services/ticketService');
    const StorageService = require('../services/storageService');

    // Limpieza automática de tickets huérfanos cuyos canales ya fueron eliminados de Discord
    try {
      const activeTickets = StorageService.getAllActiveTickets();
      for (const channelId of Object.keys(activeTickets)) {
        if (!client.channels.cache.has(channelId)) {
          StorageService.removeTicket(channelId);
          console.log(`[ready] Limpiado ticket huérfano para el canal ${channelId}`);
        }
      }
    } catch (e) {
      console.warn('[ready] Error al limpiar tickets huérfanos:', e.message);
    }

    TicketService.startStaffReminderRoutine(client);
  }
};
