const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Cierra el ticket actual')
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo del cierre del ticket')
        .setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.channel;
    const ticket = await TicketService.getTicketOrRecover(channel);
    const isTicketCategory = channel.parentId && (
      channel.parentId === config.ticketSettings?.parentCategoryId ||
      Object.values(config.categories || {}).some(c => c.parentCategoryId === channel.parentId)
    );

    if (!ticket && !isTicketCategory) {
      return interaction.reply({
        content: 'Este comando solo se puede usar dentro de un canal de ticket activo.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const reason = interaction.options.getString('motivo') || 'Cerrado mediante comando /close';
    return TicketService.closeTicket(interaction, reason);
  }
};
