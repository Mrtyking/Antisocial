const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Comandos de gestión para los tickets de AntiSocial')
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Cierra el ticket actual')
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo del cierre del ticket')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Añade a un miembro al ticket actual')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario que deseas añadir')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remueve a un miembro del ticket actual')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario que deseas remover')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('transcript')
        .setDescription('Genera y descarga la transcripción HTML de este ticket')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const ticket = StorageService.getTicketByChannel(interaction.channel.id);

    if (!ticket && subcommand !== 'close') {
      return interaction.reply({
        content: 'Este canal no parece ser un ticket activo de AntiSocial.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (subcommand === 'close') {
      const reason = interaction.options.getString('motivo') || 'Cerrado mediante comando /ticket close';
      return TicketService.closeTicket(interaction, reason);
    }

    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('usuario');
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        return interaction.reply({
          content: 'No se pudo encontrar al miembro en este servidor.',
          flags: [MessageFlags.Ephemeral]
        });
      }
      await TicketService.addUser(interaction.channel, member, interaction.user);
      return interaction.reply({
        content: `Usuario <@${member.id}> añadido al ticket.`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (subcommand === 'remove') {
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

    if (subcommand === 'transcript') {
      return TicketService.sendManualTranscript(interaction);
    }
  }
};
