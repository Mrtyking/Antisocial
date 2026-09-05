const { ActivityType } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
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

    // 1. Validar tickets activos existentes de forma segura (sin borrar canales que aún existen)
    try {
      const activeTickets = StorageService.getAllActiveTickets();
      for (const channelId of Object.keys(activeTickets)) {
        let channel = client.channels.cache.get(channelId);
        if (!channel) {
          channel = await client.channels.fetch(channelId).catch(() => null);
        }
        if (!channel) {
          StorageService.removeTicket(channelId);
          console.log(`[ready] Limpiado ticket huérfano para canal eliminado: ${channelId}`);
        }
      }
    } catch (e) {
      console.warn('[ready] Error al validar tickets existentes:', e.message);
    }

    // 2. Auto-recuperación: escanear canales de Discord para restaurar tickets si el bot se apagó o reinició
    try {
      for (const guild of client.guilds.cache.values()) {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) continue;

        for (const channel of channels.values()) {
          if (!channel || !channel.name) continue;
          const topic = channel.topic || '';
          const isTicketChannel = channel.name.startsWith('ticket-') ||
                                  channel.name.startsWith('postulacion-') ||
                                  Object.values(config.categories || {}).some(c => channel.name.startsWith(`${c.prefix || c.id}-`)) ||
                                  topic.includes('Ticket') ||
                                  topic.includes('Postulación');

          if (isTicketChannel) {
            const existing = StorageService.getTicketByChannel(channel.id);
            if (!existing) {
              await TicketService.recoverTicketFromChannel(channel);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ready] Error durante la auto-recuperación de canales de ticket:', e.message);
    }

    TicketService.startStaffReminderRoutine(client);
  }
};
