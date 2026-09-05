const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { buildTicketPanelPayload } = require('../components/panelBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel-setup')
    .setDescription('Envía el panel de tickets Embed V2 de AntiSocial al canal seleccionado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal donde se enviará el panel de tickets (por defecto este canal)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetChannel = interaction.options.getChannel('canal') || interaction.channel;

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        content: 'El canal seleccionado debe ser un canal de texto.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Verificar permisos del bot en el canal de destino
    const me = targetChannel.guild.members.me;
    const permissions = targetChannel.permissionsFor(me);

    if (
      !permissions ||
      !permissions.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.SendMessages) ||
      !permissions.has(PermissionFlagsBits.AttachFiles) ||
      !permissions.has(PermissionFlagsBits.EmbedLinks)
    ) {
      const missing = [];
      if (!permissions?.has(PermissionFlagsBits.ViewChannel)) missing.push('Ver canal');
      if (!permissions?.has(PermissionFlagsBits.SendMessages)) missing.push('Enviar mensajes');
      if (!permissions?.has(PermissionFlagsBits.AttachFiles)) missing.push('Adjuntar archivos (para el banner)');
      if (!permissions?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Insertar enlaces');

      return interaction.editReply({
        content: `❌ **El bot no tiene permisos para publicar en <#${targetChannel.id}>.**\n\n` +
                 `**Permisos que le faltan al bot en ese canal:**\n` +
                 missing.map(p => `• ${p}`).join('\n') +
                 `\n\n**¿Cómo solucionarlo?**\n` +
                 `1. Ve a los **Ajustes del Servidor > Roles > Rol del bot** y dale **Administrador** (opción más rápida).\n` +
                 `2. O entra a los **Ajustes de <#${targetChannel.id}> > Permisos**, añade al bot **AntiSocial** y marca en verde (\`✅\`) los permisos de arriba.`
      });
    }

    try {
      const payload = buildTicketPanelPayload();
      await targetChannel.send(payload);

      return interaction.editReply({
        content: `✅ El panel de tickets Components V2 de **AntiSocial** ha sido enviado correctamente a <#${targetChannel.id}>.`
      });
    } catch (err) {
      console.error('Error al enviar panel-setup:', err);
      return interaction.editReply({
        content: `Ocurrió un error al enviar el panel: ${err.message || err}`
      });
    }
  }
};
