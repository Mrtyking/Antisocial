const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bypass')
    .setDescription('Permite intervenir y enviar mensajes en un ticket reclamado por otro staff'),

  async execute(interaction) {
    const member = interaction.member;
    const allowedRoles = config.ticketSettings?.bypassRoleIds || [
      '1386921860360437831',
      '1378868586633891882',
      '1434233296908189776',
      '1378867917487345785'
    ];

    const hasAllowedRole = member && member.roles && allowedRoles.some(roleId => {
      if (Array.isArray(member.roles)) {
        return member.roles.includes(roleId);
      }
      return member.roles.cache ? member.roles.cache.has(roleId) : false;
    });

    if (!hasAllowedRole) {
      return interaction.reply({
        content: 'No tienes permiso para usar este comando. Se requiere tener un rol autorizado obligatoriamente.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const channel = interaction.channel;
    const ticket = await TicketService.getTicketOrRecover(channel);

    if (!ticket) {
      return interaction.reply({
        content: 'Este comando solo se puede usar dentro de un canal de ticket activo.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const enabled = StorageService.toggleBypassUser(channel.id, interaction.user.id);

    if (enabled) {
      return interaction.reply({
        content: `**Modo Bypass Activado:** <@${interaction.user.id}> ahora tiene permiso para intervenir y hablar en este ticket.`,
        flags: [MessageFlags.Ephemeral]
      });
    } else {
      return interaction.reply({
        content: `**Modo Bypass Desactivado:** <@${interaction.user.id}> ya no tiene permiso de bypass en este ticket.`,
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};
