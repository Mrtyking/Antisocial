const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const StorageService = require('../services/storageService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bypass')
    .setDescription('Permite intervenir y enviar mensajes en un ticket reclamado por otro staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.channel;
    const ticket = StorageService.getTicketByChannel(channel.id);

    if (!ticket) {
      return interaction.reply({
        content: 'Este comando solo se puede usar dentro de un canal de ticket activo.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const enabled = StorageService.toggleBypassUser(channel.id, interaction.user.id);

    if (enabled) {
      return interaction.reply({
        content: `✅ **Modo Bypass Activado:** <@${interaction.user.id}> ahora tiene permiso para intervenir y hablar en este ticket.`
      });
    } else {
      return interaction.reply({
        content: `❌ **Modo Bypass Desactivado:** <@${interaction.user.id}> ya no tiene permiso de bypass en este ticket.`,
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};
