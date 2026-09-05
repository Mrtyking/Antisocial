const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const TicketService = require('../services/ticketService');
const DmPostulacionService = require('../services/dmPostulacionService');
const config = require('../config');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // 1. Manejo de Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      // 2. Manejo de Botones
      if (interaction.isButton()) {
        const { customId } = interaction;

        // A. Abrir ticket desde botón rápido
        if (customId.startsWith('ticket_open_')) {
          const categoryId = customId.replace('ticket_open_', '');
          const category = config.categories[categoryId];

          // Flujo por DM si es postulación
          if (categoryId === 'postular' && category?.useDmFlow) {
            const result = await DmPostulacionService.start(interaction.user, interaction.guild);
            if (!result.success) {
              if (result.error === 'already_has_ticket') {
                return interaction.reply({
                  content: `Ya tienes un ticket activo en <#${result.channelId}>. Por favor ciérralo antes de iniciar una nueva postulación.`,
                  ephemeral: true
                });
              }
              if (result.error === 'dms_closed') {
                return interaction.reply({
                  content: `**No pudimos enviarte un mensaje directo (DM).**\nPor favor activa la opción **"Permitir mensajes directos de miembros del servidor"** en tus Ajustes de Privacidad de Discord y vuelve a presionar el botón.`,
                  ephemeral: true
                });
              }
            }
            return interaction.reply({
              content: `**¡Te hemos enviado las 12 preguntas por mensaje directo (DM)!**\nRevisa tus mensajes privados con el bot para responderlas paso a paso.`,
              ephemeral: true
            });
          }

          // Otras categorías con modal
          if (category && category.requireModal && category.questions && category.questions.length > 0) {
            const modal = TicketService.getCategoryModal(categoryId);
            if (modal) {
              return await interaction.showModal(modal);
            }
          }
          return await TicketService.createTicket(interaction, categoryId);
        }

        // B. Botones de confirmación de postulación en DM
        if (customId === 'postulacion_btn_confirm') {
          const session = DmPostulacionService.getSession(interaction.user.id);
          if (!session) {
            return interaction.reply({
              content: 'La sesión de postulación ha expirado o no existe. Por favor pulsa de nuevo el botón en el servidor.',
              ephemeral: true
            });
          }

          const targetGuild = client.guilds.cache.get(session.guildId) || client.guilds.cache.get(config.guildId);
          if (!targetGuild) {
            return interaction.reply({
              content: 'Error: No se pudo localizar el servidor de Discord.',
              ephemeral: true
            });
          }

          await interaction.deferUpdate();

          const ticketChannel = await TicketService.createPostulacionTicket(interaction.user, targetGuild, session.answers);
          DmPostulacionService.removeSession(interaction.user.id);

          if (ticketChannel) {
            return interaction.editReply({
              content: `**¡Tu postulación ha sido enviada con éxito!**\nSe ha creado tu canal de ticket en el servidor: <#${ticketChannel.id}>.\nUn miembro del equipo de Staff revisará tus respuestas. Recuerda que podrás escribir en cuanto un Staff te responda o apruebe tu postulación.`,
              components: [],
              embeds: []
            });
          } else {
            return interaction.editReply({
              content: 'Ocurrió un error al crear tu ticket en el servidor. Por favor contacta a un administrador.',
              components: []
            });
          }
        }

        if (customId === 'postulacion_btn_cancel') {
          DmPostulacionService.removeSession(interaction.user.id);
          const cancelContainer = new ContainerBuilder()
            .setAccentColor(config.panel.accentColor || 15550277)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# Postulación Cancelada\nHas cancelado tu postulación. Si deseas intentarlo de nuevo, puedes pulsar el botón en el servidor.'
              )
            );

          return interaction.update({
            flags: [MessageFlags.IsComponentsV2],
            components: [cancelContainer]
          });
        }

        // Manejo de botones dentro de la postulación por DM
        if (customId === 'postulacion_dm_answer') {
          const modal = DmPostulacionService.getQuestionModal(interaction.user.id);
          if (!modal) {
            return interaction.reply({
              content: 'No tienes una postulación activa en curso.',
              ephemeral: true
            });
          }
          return await interaction.showModal(modal);
        }

        if (customId === 'postulacion_dm_back') {
          return await DmPostulacionService.handleGoBack(interaction);
        }

        // C. Botones de gestión de postulación por parte de Staff
        if (customId === 'postulacion_control_approve') {
          return await TicketService.approvePostulacion(interaction);
        }

        if (customId === 'postulacion_control_deny') {
          const modal = new ModalBuilder()
            .setCustomId('modal_deny_postulacion')
            .setTitle('Rechazar Postulación');

          const reasonInput = new TextInputBuilder()
            .setCustomId('motivo_rechazo')
            .setLabel('Motivo del rechazo:')
            .setPlaceholder('Explica el motivo del rechazo...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          return await interaction.showModal(modal);
        }

        // D. Botón: Cerrar Ticket
        if (customId === 'ticket_control_close') {
          return await TicketService.closeTicket(interaction, 'Cerrado desde el botón de controles');
        }

        // E. Botón: Reclamar Ticket
        if (customId === 'ticket_control_claim') {
          return await TicketService.claimTicket(interaction);
        }

        // F. Botón: Transcripción
        if (customId === 'ticket_control_transcript') {
          return await TicketService.sendManualTranscript(interaction);
        }

        // G. Botón: Añadir Miembro
        if (customId === 'ticket_control_add_user') {
          const modal = new ModalBuilder()
            .setCustomId('modal_add_user_ticket')
            .setTitle('Añadir Usuario al Ticket');

          const userInput = new TextInputBuilder()
            .setCustomId('user_id_or_tag')
            .setLabel('ID o mención del usuario a añadir:')
            .setPlaceholder('Ej: 123456789012345678')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(userInput));
          return await interaction.showModal(modal);
        }
      }

      // 3. Manejo del Menú Desplegable (Select Menu)
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_select_category') {
          const categoryId = interaction.values[0];
          const category = config.categories[categoryId];

          if (categoryId === 'postular' && category?.useDmFlow) {
            const result = await DmPostulacionService.start(interaction.user, interaction.guild);
            if (!result.success) {
              if (result.error === 'already_has_ticket') {
                return interaction.reply({
                  content: `Ya tienes un ticket activo en <#${result.channelId}>. Por favor ciérralo antes de iniciar una nueva postulación.`,
                  ephemeral: true
                });
              }
              if (result.error === 'dms_closed') {
                return interaction.reply({
                  content: `**No pudimos enviarte un mensaje directo (DM).**\nPor favor activa la opción **"Permitir mensajes directos de miembros del servidor"** en tus Ajustes de Privacidad de Discord y vuelve a intentarlo.`,
                  ephemeral: true
                });
              }
            }
            return interaction.reply({
              content: `**¡Te hemos enviado las 12 preguntas por mensaje directo (DM)!**\nRevisa tus mensajes privados con el bot para responderlas paso a paso.`,
              ephemeral: true
            });
          }

          if (category && category.requireModal && category.questions && category.questions.length > 0) {
            const modal = TicketService.getCategoryModal(categoryId);
            if (modal) {
              return await interaction.showModal(modal);
            }
          }
          return await TicketService.createTicket(interaction, categoryId);
        }
      }

      // 4. Manejo de Formularios Emergentes (Modales)
      if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        // Modal para responder preguntas de postulación en DM
        if (customId.startsWith('modal_dm_question_')) {
          const answer = interaction.fields.getTextInputValue('dm_question_answer');
          return await DmPostulacionService.handleModalAnswer(interaction, answer);
        }

        // Modal para rechazar postulación
        if (customId === 'modal_deny_postulacion') {
          const reason = interaction.fields.getTextInputValue('motivo_rechazo');
          return await TicketService.denyPostulacion(interaction, reason);
        }

        // Modal de apertura de ticket genérico
        if (customId.startsWith('modal_ticket_')) {
          const categoryId = customId.replace('modal_ticket_', '');
          const answers = {};

          const category = config.categories[categoryId];
          if (category && category.questions) {
            for (const q of category.questions) {
              try {
                const val = interaction.fields.getTextInputValue(q.id);
                if (val) answers[q.id] = val;
              } catch (e) {
                // Campo no encontrado o vacío
              }
            }
          }

          return await TicketService.createTicket(interaction, categoryId, answers);
        }

        // Modal para añadir usuario
        if (customId === 'modal_add_user_ticket') {
          const rawInput = interaction.fields.getTextInputValue('user_id_or_tag').trim();
          const cleanId = rawInput.replace(/[^0-9]/g, '');

          if (!cleanId) {
            return interaction.reply({
              content: 'ID de usuario inválida.',
              ephemeral: true
            });
          }

          const member = await interaction.guild.members.fetch(cleanId).catch(() => null);
          if (!member) {
            return interaction.reply({
              content: `No se pudo encontrar a ningún miembro con ID \`${cleanId}\` en este servidor.`,
              ephemeral: true
            });
          }

          await TicketService.addUser(interaction.channel, member, interaction.user);
          return interaction.reply({
            content: `Usuario <@${member.id}> añadido exitosamente.`,
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error('Error al manejar la interacción:', error);
      const errReply = {
        content: 'Hubo un error inesperado al procesar tu solicitud.',
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errReply).catch(() => null);
      } else {
        await interaction.reply(errReply).catch(() => null);
      }
    }
  }
};
