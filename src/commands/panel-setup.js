const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
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
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const payload = buildTicketPanelPayload();
      await targetChannel.send(payload);

      return interaction.editReply({
        content: `El panel de tickets Components V2 de **AntiSocial** ha sido enviado correctamente a <#${targetChannel.id}>.`
      });
    } catch (err) {
      console.error('Error al enviar panel-setup:', err);
      return interaction.editReply({
        content: `Error al enviar el panel de tickets: ${err.message || err}`
      });
    }
  }
};
