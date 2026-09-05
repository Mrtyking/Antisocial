const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Genera y descarga la transcripción HTML de este ticket'),

  async execute(interaction) {
    const ticket = await TicketService.getTicketOrRecover(interaction.channel);
    if (!ticket) {
      return interaction.reply({
        content: 'Este canal no parece ser un ticket activo de AntiSocial.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    return TicketService.sendManualTranscript(interaction);
  }
};
