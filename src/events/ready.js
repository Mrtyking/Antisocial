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
    TicketService.startStaffReminderRoutine(client);
  }
};
