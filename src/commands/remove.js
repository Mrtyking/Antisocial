const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remueve a un miembro del ticket actual')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario que deseas remover')
        .setRequired(true)
    ),

  async execute(interaction) {
    const ticket = StorageService.getTicketByChannel(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({
        content: 'Este canal no parece ser un ticket activo de AntiSocial.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const targetUser = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.reply({
        content: 'No se pudo encontrar al miembro en este servidor.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    await TicketService.removeUser(interaction.channel, member, interaction.user);
    return interaction.reply({
      content: `Usuario <@${member.id}> removido del ticket.`,
      flags: [MessageFlags.Ephemeral]
    });
  }
};
