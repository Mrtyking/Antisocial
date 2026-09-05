const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const TicketService = require('../services/ticketService');
const StorageService = require('../services/storageService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Modifica el nombre del canal del ticket actual')
    .addStringOption(option =>
      option
        .setName('nombre')
        .setDescription('Nuevo nombre para el canal del ticket')
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.channel;
    const ticket = await TicketService.getTicketOrRecover(channel);

    if (!ticket) {
      return interaction.reply({
        content: 'Este comando solo se puede usar dentro de un canal de ticket activo.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Verificar si es staff o tiene permiso de gestionar canales
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
      const oldName = channel.name;
      await channel.setName(cleanName, `Ticket renombrado por ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(config.panel.accentColor || 0xED4245)
        .setDescription(`El nombre del ticket ha sido cambiado de \`${oldName}\` a \`${cleanName}\` por <@${interaction.user.id}>.`)
        .setFooter({ text: 'Este mensaje se eliminará en 6 segundos' });

      const msg = await channel.send({ embeds: [embed] });
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
};
