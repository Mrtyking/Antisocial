const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { buildTicketPanelPayload } = require('../components/panelBuilder');
const DmPostulacionService = require('../services/dmPostulacionService');
const StorageService = require('../services/storageService');
const TicketService = require('../services/ticketService');
const config = require('../config');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    // 1. Manejo de mensajes en DM (Cuestionario de Postulación)
    if (!message.guild) {
      const handled = await DmPostulacionService.handleDmMessage(message, client);
      if (handled) return;
      return;
    }

    // 2. Comandos de prefijo (!) para Administradores
    const prefix = '!';
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      if (commandName === 'panel-setup' || commandName === 'setup-panel' || commandName === 'ticket-setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('Necesitas permisos de Administrador para usar este comando.');
        }

        try {
          const payload = buildTicketPanelPayload();
          await message.channel.send(payload);
          await message.delete().catch(() => null);
        } catch (err) {
          console.error('Error al enviar panel-setup mediante prefijo:', err);
          message.reply(`Error al enviar el panel: ${err.message || err}`);
        }
        return;
      }
    }

    // 3. Auto-moderación dentro de canales de tickets
    const ticket = await TicketService.getTicketOrRecover(message.channel);
    if (!ticket) return;

    // Caso A: El usuario postulante intenta escribir mientras su postulación está en revisión
    if (ticket.isPostulacion && message.author.id === ticket.userId) {
      if (!ticket.staffHasSpoken && ticket.postulacionStatus === 'pending_review') {
        await message.delete().catch(() => null);

        const pendingEmbed = new EmbedBuilder()
          .setColor(config.panel.accentColor || 15550277)
          .setTitle('Postulación en Revisión')
          .setDescription(
            `<@${message.author.id}>, tu postulación está actualmente **en revisión por el equipo de Staff**.\n` +
            `Por favor ten paciencia mientras revisamos tus respuestas. Podrás escribir en cuanto un miembro del Staff te responda o apruebe tu solicitud.`
          )
          .setFooter({ text: 'Este aviso se eliminará automáticamente en 5 segundos' });

        const tempMsg = await message.channel.send({ embeds: [pendingEmbed] }).catch(() => null);
        if (tempMsg) {
          setTimeout(() => tempMsg.delete().catch(() => null), 5000);
        }
        return;
      }
    }

    // Caso B: Un miembro del Staff habla por primera vez en la postulación
    if (ticket.isPostulacion && !ticket.staffHasSpoken && message.author.id !== ticket.userId) {
      ticket.staffHasSpoken = true;
      StorageService.updateTicket(message.channel.id, { staffHasSpoken: true });

      // Desbloquear permisos de escritura para el postulante
      await message.channel.permissionOverwrites.edit(ticket.userId, {
        SendMessages: true,
        ViewChannel: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true
      }).catch(() => null);

      const unlockEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`**El Staff ha iniciado la conversación.** <@${ticket.userId}> ya puede responder en este ticket.`);

      await message.channel.send({ embeds: [unlockEmbed] }).catch(() => null);
    }

    // Caso C: Ticket reclamado - Solo el creador y el staff que reclamó pueden hablar (a menos que usen /bypass)
    if (ticket.claimedBy && message.author.id !== ticket.userId && message.author.id !== ticket.claimedBy) {
      const hasBypass = StorageService.isUserBypassed(message.channel.id, message.author.id);
      if (!hasBypass) {
        await message.delete().catch(() => null);

        const warnEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setDescription(
            `Este ticket fue reclamado por <@${ticket.claimedBy}>.\n` +
            `Solo el staff asignado y el usuario pueden hablar aquí. Si necesitas intervenir como administrador, usa el comando \`/bypass\`.`
          )
          .setFooter({ text: 'Este aviso se eliminará automáticamente en 5 segundos' });

        const tempWarn = await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
        if (tempWarn) {
          setTimeout(() => tempWarn.delete().catch(() => null), 5000);
        }
        return;
      }
    }
  }
};
