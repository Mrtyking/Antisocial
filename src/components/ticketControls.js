const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const config = require('../config');

function buildTicketGreetingPayload(ticket, modalAnswers = null) {
  const category = config.categories[ticket.categoryId] || { fullName: ticket.categoryId };

  let detailsText = [
    `# Ticket de ${category.fullName}`,
    `Hola <@${ticket.userId}>, gracias por comunicarte con el equipo de **AntiSocial**.`,
    'Un miembro de nuestro equipo te atenderá lo más pronto posible.',
    '',
    `**Creador:** <@${ticket.userId}>`,
    `**Categoría:** ${category.fullName}`,
    `**Ticket ID:** #${ticket.ticketNumber}`,
    `**Estado:** ${ticket.claimedBy ? `Reclamado por <@${ticket.claimedBy}>` : 'Pendiente de atención'}`
  ].join('\n');

  if (modalAnswers && Object.keys(modalAnswers).length > 0) {
    detailsText += '\n\n**Información suministrada:**\n';
    for (const [key, val] of Object.entries(modalAnswers)) {
      const q = category.questions?.find(q => q.id === key);
      const label = q ? q.label : key;
      detailsText += `> **${label}**\n> ${val}\n`;
    }
  }

  const textComponent = new TextDisplayBuilder().setContent(detailsText);
  const separator = new SeparatorBuilder().setDivider(true);

  const controlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_control_close')
      .setLabel('Cerrar Ticket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_control_claim')
      .setLabel(ticket.claimedBy ? 'Reclamado' : 'Reclamar')
      .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(Boolean(ticket.claimedBy)),
    new ButtonBuilder()
      .setCustomId('ticket_control_transcript')
      .setLabel('Transcripción')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_control_add_user')
      .setLabel('Añadir Miembro')
      .setStyle(ButtonStyle.Secondary)
  );

  const footerText = new TextDisplayBuilder().setContent(
    '-# Usa los botones para gestionar este ticket. Los miembros de staff tienen control administrativo.'
  );

  const container = new ContainerBuilder()
    .setAccentColor(config.panel.accentColor || 15550277)
    .addTextDisplayComponents(textComponent)
    .addSeparatorComponents(separator)
    .addActionRowComponents(controlsRow)
    .addTextDisplayComponents(footerText);

  return {
    content: `<@${ticket.userId}>`,
    flags: [MessageFlags.IsComponentsV2],
    components: [container]
  };
}

function buildPostulacionTicketPayload(ticket, user, answers) {
  const questions = config.categories.postular.questions;

  let statusText = '⏳ **En Revisión** (El usuario no puede escribir hasta que el staff responda o apruebe)';
  if (ticket.postulacionStatus === 'approved') {
    statusText = `✅ **Aprobada**`;
  } else if (ticket.postulacionStatus === 'denied') {
    statusText = `❌ **Rechazada**`;
  } else if (ticket.claimedBy) {
    statusText = `⏳ **En Revisión** (Reclamado por <@${ticket.claimedBy}>)`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Postulación a AntiSocial - #${ticket.ticketNumber}`)
    .setColor(config.panel.accentColor || 15550277)
    .setThumbnail(user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : null)
    .setDescription(
      `**Postulante:** <@${user.id}> (${user.tag || user.username})\n` +
      `**ID:** \`${user.id}\`\n` +
      `**Estado:** ${statusText}\n\n` +
      `**Respuestas de la Postulación (12 preguntas):**`
    )
    .setFooter({ text: 'AntiSocial - Sistema de Postulaciones' })
    .setTimestamp();

  for (let i = 0; i < questions.length; i++) {
    const val = answers && answers[i] ? answers[i] : 'Sin respuesta';
    embed.addFields({
      name: `${i + 1}. ${questions[i]}`,
      value: val.length > 1020 ? val.substring(0, 1017) + '...' : val,
      inline: false
    });
  }

  const controlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_control_claim')
      .setLabel(ticket.claimedBy ? 'Reclamado' : 'Reclamar')
      .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(Boolean(ticket.claimedBy)),
    new ButtonBuilder()
      .setCustomId('postulacion_control_approve')
      .setLabel('Aprobar')
      .setStyle(ButtonStyle.Success)
      .setDisabled(ticket.postulacionStatus === 'approved'),
    new ButtonBuilder()
      .setCustomId('postulacion_control_deny')
      .setLabel('Rechazar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(ticket.postulacionStatus === 'denied'),
    new ButtonBuilder()
      .setCustomId('ticket_control_close')
      .setLabel('Cerrar Ticket')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_control_add_user')
      .setLabel('Añadir Miembro')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [controlsRow]
  };
}

module.exports = {
  buildTicketGreetingPayload,
  buildPostulacionTicketPayload
};
