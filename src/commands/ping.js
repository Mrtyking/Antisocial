const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Comprueba la latencia del bot AntiSocial'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Calculando ping...', fetchReply: true, flags: [MessageFlags.Ephemeral] });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    await interaction.editReply({
      content: `Pong!\nLatencia de respuesta: \`${latency}ms\`\nLatencia de API Discord: \`${apiLatency}ms\``
    });
  }
};
