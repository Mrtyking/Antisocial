const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const StorageService = require('./storageService');

// Almacén de sesiones en progreso por usuario: userId -> session
const sessions = new Map();

class DmPostulacionService {
  static getQuestions() {
    return config.categories.postular.questions;
  }

  /**
   * Construye el payload Embed V2 (Container) para una pregunta específica
   */
  static buildQuestionPayload(user, session) {
    const questions = this.getQuestions();
    const step = session.currentStep;
    const isFirst = step === 0;
    const stepNumber = step + 1;
    const currentQ = questions[step];
    const prevAnswer = session.answers[step] || null;

    const attachment = new AttachmentBuilder(config.questionsGifPath, { name: 'questions.gif' });
    const mediaGallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL('attachment://questions.gif')
        .setDescription('AntiSocial Postulacion')
    );

    let contentText = '';
    if (isFirst) {
      contentText = [
        `# Postulación a AntiSocial`,
        `¡Hola **${user.username}**! Bienvenido al proceso de postulación oficial para **AntiSocial**.`,
        '',
        `A continuación responderás **12 preguntas** para evaluar tu ingreso.`,
        `Simplemente escribe tu respuesta a cada pregunta en este chat privado.`,
        '',
        `**Pregunta 1 de 12:**`,
        `> **${currentQ}**`,
        prevAnswer ? `\n*Tu respuesta guardada:* \`${prevAnswer}\`` : ''
      ].filter(Boolean).join('\n');
    } else {
      contentText = [
        `# Postulación a AntiSocial`,
        `**Pregunta ${stepNumber} de ${questions.length}:**`,
        `> **${currentQ}**`,
        prevAnswer ? `\n*Tu respuesta guardada:* \`${prevAnswer}\`` : ''
      ].filter(Boolean).join('\n');
    }

    const textHeader = new TextDisplayBuilder().setContent(contentText);
    const separator = new SeparatorBuilder().setDivider(true);

    const buttonsRow = new ActionRowBuilder();

    // 1. Botón de ir atrás (solo a partir de la pregunta 2 y máx 1 vez por pregunta)
    if (!isFirst) {
      const backUsedCount = session.backUsed[step] || 0;
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setCustomId('postulacion_dm_back')
          .setLabel('Ir atrás')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(backUsedCount >= 1)
      );
    }

    // 2. Botón de cancelar
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId('postulacion_btn_cancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Danger)
    );

    const footerText = new TextDisplayBuilder().setContent(
      `-# Progreso: ${stepNumber}/${questions.length} • AntiSocial • Solo se permite 1 repetición por pregunta`
    );

    const container = new ContainerBuilder()
      .setAccentColor(config.panel.accentColor || 15550277)
      .addMediaGalleryComponents(mediaGallery)
      .addTextDisplayComponents(textHeader)
      .addSeparatorComponents(separator)
      .addActionRowComponents(buttonsRow)
      .addTextDisplayComponents(footerText);

    return {
      flags: [MessageFlags.IsComponentsV2],
      components: [container],
      files: [attachment]
    };
  }

  /**
   * Construye el payload Embed V2 (Container) para el resumen de confirmación
   */
  static buildSummaryPayload(user, session) {
    const questions = this.getQuestions();
    const attachment = new AttachmentBuilder(config.questionsGifPath, { name: 'questions.gif' });
    const mediaGallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL('attachment://questions.gif')
        .setDescription('AntiSocial Postulacion')
    );

    let summaryText = [
      `# Resumen de tu Postulación a AntiSocial`,
      `Has completado las **12 preguntas**. Por favor revisa que todo esté en orden antes de enviar tu postulación:`,
      ''
    ].join('\n');

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const ans = session.answers[i] || 'Sin respuesta';
      summaryText += `**${i + 1}. ${q}**\n> ${ans}\n\n`;
    }

    const textComponent = new TextDisplayBuilder().setContent(
      summaryText.length > 3900 ? summaryText.substring(0, 3890) + '...' : summaryText
    );
    const separator = new SeparatorBuilder().setDivider(true);

    const buttonsRow = new ActionRowBuilder();

    // Confirmar
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId('postulacion_btn_confirm')
        .setLabel('Confirmar y Enviar')
        .setStyle(ButtonStyle.Success)
    );

    // Ir atrás a la última pregunta (si no se ha usado)
    const backUsedCount = session.backUsed[12] || 0;
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId('postulacion_dm_back')
        .setLabel('Ir atrás')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(backUsedCount >= 1)
    );

    // Cancelar
    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId('postulacion_btn_cancel')
        .setLabel('Cancelar / Reiniciar')
        .setStyle(ButtonStyle.Danger)
    );

    const footerText = new TextDisplayBuilder().setContent(
      '-# Al confirmar, se creará tu ticket para que el equipo de Staff evalúe tu ingreso.'
    );

    const container = new ContainerBuilder()
      .setAccentColor(config.panel.accentColor || 15550277)
      .addMediaGalleryComponents(mediaGallery)
      .addTextDisplayComponents(textComponent)
      .addSeparatorComponents(separator)
      .addActionRowComponents(buttonsRow)
      .addTextDisplayComponents(footerText);

    return {
      flags: [MessageFlags.IsComponentsV2],
      components: [container],
      files: [attachment]
    };
  }

  /**
   * Modal para responder la pregunta actual
   */
  static getQuestionModal(userId) {
    const session = sessions.get(userId);
    if (!session) return null;

    const questions = this.getQuestions();
    let step = session.currentStep;
    if (step >= questions.length) step = questions.length - 1;

    const currentQ = questions[step];
    const prevAnswer = session.answers[step] || '';

    const modal = new ModalBuilder()
      .setCustomId(`modal_dm_question_${step}`)
      .setTitle(`Pregunta ${step + 1} de ${questions.length}`.substring(0, 45));

    const textInput = new TextInputBuilder()
      .setCustomId('dm_question_answer')
      .setLabel(currentQ.length > 45 ? currentQ.substring(0, 42) + '...' : currentQ)
      .setPlaceholder('Escribe tu respuesta aquí...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    if (prevAnswer) {
      textInput.setValue(prevAnswer.substring(0, 4000));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return modal;
  }

  /**
   * Inicia el proceso de postulación por DM
   */
  static async start(user, guild) {
    const activeTicket = StorageService.getActiveTicketByUser(user.id);
    if (activeTicket) {
      return {
        success: false,
        error: 'already_has_ticket',
        channelId: activeTicket.channelId
      };
    }

    const session = {
      userId: user.id,
      guildId: guild.id,
      currentStep: 0,
      answers: [],
      repeatsUsed: {},
      backUsed: {},
      startedAt: Date.now()
    };

    sessions.set(user.id, session);

    try {
      const payload = this.buildQuestionPayload(user, session);
      await user.send(payload);
      return { success: true };
    } catch (err) {
      sessions.delete(user.id);
      console.warn(`No se pudo enviar DM a ${user.tag}:`, err.message);
      return { success: false, error: 'dms_closed' };
    }
  }

  /**
   * Maneja el envío de respuesta vía Modal
   */
  static async handleModalAnswer(interaction, answer) {
    const session = sessions.get(interaction.user.id);
    if (!session) {
      return interaction.reply({
        content: 'La sesión de postulación ha expirado o no existe.',
        ephemeral: true
      });
    }

    const questions = this.getQuestions();
    const currentStep = session.currentStep;

    if (session.answers[currentStep]) {
      session.repeatsUsed[currentStep] = (session.repeatsUsed[currentStep] || 0) + 1;
    }

    session.answers[currentStep] = answer.trim();
    session.currentStep++;

    await interaction.deferUpdate().catch(() => null);

    if (session.currentStep < questions.length) {
      const payload = this.buildQuestionPayload(interaction.user, session);
      await interaction.channel.send(payload);
    } else {
      const summaryPayload = this.buildSummaryPayload(interaction.user, session);
      await interaction.channel.send(summaryPayload);
    }
  }

  /**
   * Maneja el retroceso de pregunta ("Ir atrás")
   */
  static async handleGoBack(interaction) {
    const session = sessions.get(interaction.user.id);
    if (!session) {
      return interaction.reply({
        content: 'No tienes una sesión activa de postulación.',
        ephemeral: true
      });
    }

    if (session.currentStep <= 0) {
      return interaction.reply({
        content: 'Ya estás en la primera pregunta.',
        ephemeral: true
      });
    }

    const step = session.currentStep;
    const backUsedCount = session.backUsed[step] || 0;
    if (backUsedCount >= 1) {
      return interaction.reply({
        content: 'Solo se permite retroceder 1 vez por pregunta.',
        ephemeral: true
      });
    }

    session.backUsed[step] = 1;
    session.currentStep--;

    await interaction.deferUpdate().catch(() => null);

    const payload = this.buildQuestionPayload(interaction.user, session);
    await interaction.channel.send(payload);
  }

  /**
   * Procesa las respuestas que el usuario escribe directamente en el chat privado
   */
  static async handleDmMessage(message, client) {
    if (message.author.bot) return false;
    const session = sessions.get(message.author.id);
    if (!session) return false;

    const questions = this.getQuestions();
    const answer = message.content.trim();

    if (!answer) {
      await message.reply('Por favor ingresa una respuesta válida en texto.');
      return true;
    }

    const currentStep = session.currentStep;
    if (session.answers[currentStep]) {
      session.repeatsUsed[currentStep] = (session.repeatsUsed[currentStep] || 0) + 1;
    }

    session.answers[currentStep] = answer;
    session.currentStep++;

    if (session.currentStep < questions.length) {
      const payload = this.buildQuestionPayload(message.author, session);
      await message.channel.send(payload);
      return true;
    }

    const summaryPayload = this.buildSummaryPayload(message.author, session);
    await message.channel.send(summaryPayload);
    return true;
  }

  static getSession(userId) {
    return sessions.get(userId) || null;
  }

  static removeSession(userId) {
    sessions.delete(userId);
  }
}

module.exports = DmPostulacionService;
