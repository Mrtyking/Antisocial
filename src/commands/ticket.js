const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');
const config = require('../config');

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
        .setName('rename')
        .setDescription('Modifica el nombre del canal del ticket actual')
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nuevo nombre para el canal del ticket')
            .setRequired(true)
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

    if (subcommand === 'rename') {
      const member = interaction.member;
      const staffRoleId = config.ticketSettings?.staffRoleId;
      const bypassRoles = config.ticketSettings?.bypassRoleIds || [];
      const hasRole = (staffRoleId && member?.roles?.cache?.has(staffRoleId)) ||
                      bypassRoles.some(rId => member?.roles?.cache?.has(rId)) ||
                      member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
                      member?.permissions?.has(PermissionFlagsBits.Administrator);

      if (!hasRole) {
        return interaction.reply({
          content: 'No tienes permiso para renombrar este ticket.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      const rawName = interaction.options.getString('nombre').trim();
      const cleanName = rawName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 95);

      if (!cleanName) {
        return interaction.reply({
          content: 'El nombre proporcionado no es válido. Usa letras, números o guiones.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      try {
        const oldName = interaction.channel.name;
        await interaction.channel.setName(cleanName, `Ticket renombrado por ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
          .setColor(config.panel.accentColor || 0xED4245)
          .setDescription(`El nombre del ticket ha sido cambiado de \`${oldName}\` a \`${cleanName}\` por <@${interaction.user.id}>.`)
          .setFooter({ text: 'Este mensaje se eliminará en 6 segundos' });

        const msg = await interaction.channel.send({ embeds: [embed] });
        setTimeout(() => {
          msg.delete().catch(() => null);
        }, 6000);

        return interaction.editReply({
          content: `Nombre del ticket actualizado exitosamente a \`${cleanName}\`.`
        });
      } catch (err) {
        console.error('Error al renombrar canal de ticket:', err);
        return interaction.editReply({
          content: `No se pudo cambiar el nombre del canal: ${err.message || err}`
        });
      }
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
