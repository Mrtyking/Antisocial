const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const config = require('../config');
const StorageService = require('./storageService');
const {
  buildTicketGreetingPayload,
  buildPostulacionTicketPayload
} = require('../components/ticketControls');

class TicketService {
  /**
   * Genera el modal según la categoría
   */
  static getCategoryModal(categoryId) {
    const category = config.categories[categoryId];
    if (!category || !category.questions || category.questions.length === 0) {
      return null;
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_ticket_${categoryId}`)
      .setTitle(category.modalTitle || `Ticket de ${category.fullName}`);

    const rows = [];
    for (const q of category.questions.slice(0, 5)) {
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.label)
        .setStyle(q.style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(Boolean(q.required))
        .setPlaceholder(q.placeholder || '');

      rows.push(new ActionRowBuilder().addComponents(input));
    }

    modal.addComponents(rows);
    return modal;
  }

  /**
   * Crea un canal de ticket para el usuario
   */
  static async createTicket(interaction, categoryId, modalAnswers = null) {
    const guild = interaction.guild;
    const user = interaction.user;
    const category = config.categories[categoryId] || {
      id: categoryId,
      fullName: categoryId,
      prefix: 'ticket'
    };

    // Verificar si ya tiene un ticket activo
    const activeTicket = StorageService.getActiveTicketByUser(user.id);
    if (activeTicket && config.ticketSettings.maxTicketsPerUser > 0) {
      const existingChannel = guild.channels.cache.get(activeTicket.channelId);
      if (existingChannel) {
        return interaction.reply({
          content: `Ya tienes un ticket abierto actualmente en <#${existingChannel.id}>. Por favor ciérralo antes de abrir uno nuevo.`,
          flags: [MessageFlags.Ephemeral]
        });
      }
    }

    // Buscar o crear la categoría en Discord
    let parentCategory = null;
    const targetParentId = category.parentCategoryId || config.ticketSettings.parentCategoryId;
    if (targetParentId) {
      parentCategory = guild.channels.cache.get(targetParentId) || await guild.channels.fetch(targetParentId).catch(() => null);
    }
    if (!parentCategory) {
      const categoryName = config.ticketSettings.categoryName || 'TICKETS ANTISOCIAL';
      parentCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (!parentCategory) {
        try {
          parentCategory = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
        } catch (err) {
          console.warn('No se pudo crear la categoría de tickets padre, se creará sin categoría:', err);
        }
      }
    }

    const ticketNumber = StorageService.getNextTicketNumber();
    const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
    const channelName = `${category.prefix || 'ticket'}-${cleanUsername}-${ticketNumber}`;

    // Configurar permisos del canal
    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ];

    if (config.ticketSettings.staffRoleId) {
      permissionOverwrites.push({
        id: config.ticketSettings.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      });
    }

    try {
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentCategory ? parentCategory.id : null,
        topic: `Ticket de ${category.fullName} | Creador: ${user.tag} (${user.id}) | ID: #${ticketNumber}`,
        permissionOverwrites
      });

      const ticketData = {
        channelId: ticketChannel.id,
        guildId: guild.id,
        userId: user.id,
        userTag: user.tag,
        categoryId: category.id,
        ticketNumber,
        createdAt: new Date().toISOString(),
        isPostulacion: false,
        claimedBy: null,
        bypassUsers: [],
        panelMessageId: null
      };

      // Guardar ticket en la base de datos local
      StorageService.saveTicket(ticketChannel.id, ticketData);

      // Enviar saludo y panel de controles en el canal
      const greetingPayload = buildTicketGreetingPayload(ticketData, modalAnswers);
      const controlMsg = await ticketChannel.send(greetingPayload);

      ticketData.panelMessageId = controlMsg.id;
      StorageService.saveTicket(ticketChannel.id, ticketData);

      // Notificar al creador del ticket y al staff
      const staffMention = config.ticketSettings.staffRoleId ? `<@&${config.ticketSettings.staffRoleId}> ` : '';
      await ticketChannel.send({
        content: `${staffMention}👋 ¡Hola <@${user.id}>! Tu ticket ha sido creado.`
      });

      // Responder al usuario
      const replyContent = `Tu ticket ha sido creado con éxito en <#${ticketChannel.id}>.`;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: replyContent, flags: [MessageFlags.Ephemeral] });
      } else {
        await interaction.reply({ content: replyContent, flags: [MessageFlags.Ephemeral] });
      }

      return ticketChannel;
    } catch (err) {
      console.error('Error al crear canal de ticket:', err);
      const errorMsg = 'Ocurrió un error al crear el canal de ticket. Verifica los permisos del bot.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] });
      } else {
        await interaction.reply({ content: errorMsg, flags: [MessageFlags.Ephemeral] });
      }
    }
  }

  /**
   * Crea el ticket a partir de una postulación respondida por DM
   */
  static async createPostulacionTicket(user, guild, answers) {
    let parentCategory = null;
    const targetParentId = config.categories.postular.parentCategoryId || config.ticketSettings.parentCategoryId;
    if (targetParentId) {
      parentCategory = guild.channels.cache.get(targetParentId) || await guild.channels.fetch(targetParentId).catch(() => null);
    }
    if (!parentCategory) {
      const categoryName = config.ticketSettings.categoryName || 'TICKETS ANTISOCIAL';
      parentCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (!parentCategory) {
        try {
          parentCategory = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
          });
        } catch (e) {
          console.error(e);
        }
      }
    }

    const ticketNumber = StorageService.getNextTicketNumber();
    const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
    const channelName = `postulacion-${cleanUsername}-${ticketNumber}`;

    // Permisos: Postulante solo puede VER, NO puede escribir hasta que el staff hable o apruebe
    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ];

    if (config.ticketSettings.staffRoleId) {
      permissionOverwrites.push({
        id: config.ticketSettings.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentCategory ? parentCategory.id : null,
      topic: `Postulación | Postulante: ${user.tag || user.username} (${user.id}) | Ticket #${ticketNumber}`,
      permissionOverwrites
    });

    const ticketData = {
      channelId: ticketChannel.id,
      guildId: guild.id,
      userId: user.id,
      userTag: user.tag || user.username,
      categoryId: 'postular',
      ticketNumber,
      createdAt: new Date().toISOString(),
      isPostulacion: true,
      postulacionStatus: 'pending_review',
      staffHasSpoken: false,
      claimedBy: null,
      bypassUsers: [],
      reminderCount: 0,
      lastReminderAt: Date.now(),
      panelMessageId: null,
      answers
    };

    // Mención al staff
    const staffMention = config.ticketSettings.staffRoleId ? `<@&${config.ticketSettings.staffRoleId}> ` : '';
    await ticketChannel.send({
      content: `${staffMention}📢 **Nueva postulación recibida de <@${user.id}>.**`
    });

    // Enviar el panel con las 12 preguntas
    const payload = buildPostulacionTicketPayload(ticketData, user, answers);
    const panelMsg = await ticketChannel.send(payload);

    ticketData.panelMessageId = panelMsg.id;
    StorageService.saveTicket(ticketChannel.id, ticketData);

    return ticketChannel;
  }

  /**
   * Reclamar un ticket por parte de un miembro del Staff
   */
  static async claimTicket(interaction) {
    const channel = interaction.channel;
    const ticket = StorageService.getTicketByChannel(channel.id);

    if (!ticket) {
      return interaction.reply({
        content: 'Este canal no está registrado como un ticket activo.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (ticket.claimedBy) {
      return interaction.reply({
        content: `Este ticket ya fue reclamado por <@${ticket.claimedBy}>.`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    ticket.claimedBy = interaction.user.id;
    StorageService.saveTicket(channel.id, ticket);

    // Actualizar mensaje de controles si es posible
    if (ticket.panelMessageId) {
      try {
        const msg = await channel.messages.fetch(ticket.panelMessageId);
        if (msg) {
          let updatedPayload;
          if (ticket.isPostulacion) {
            const applicantUser = await interaction.client.users.fetch(ticket.userId).catch(() => interaction.user);
            updatedPayload = buildPostulacionTicketPayload(ticket, applicantUser, ticket.answers);
          } else {
            updatedPayload = buildTicketGreetingPayload(ticket);
          }
          await msg.edit(updatedPayload);
        }
      } catch (err) {
        console.warn('No se pudo editar el mensaje del panel de controles:', err);
      }
    }

    return interaction.reply({
      content: `El ticket ha sido reclamado por <@${interaction.user.id}>. A partir de ahora, solo <@${interaction.user.id}> y el usuario pueden hablar aquí (otros miembros requerirán \`/bypass\`).`
    });
  }

  /**
   * Aprobar postulación
   */
  static async approvePostulacion(interaction) {
    const channel = interaction.channel;
    const ticket = StorageService.getTicketByChannel(channel.id);

    if (!ticket || !ticket.isPostulacion) {
      return interaction.reply({
        content: 'Este canal no es un ticket de postulación válido.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    ticket.postulacionStatus = 'approved';
    ticket.staffHasSpoken = true;
    StorageService.saveTicket(channel.id, ticket);

    // Desbloquear permisos de escritura para el postulante
    await channel.permissionOverwrites.edit(ticket.userId, {
      SendMessages: true,
      ViewChannel: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    }).catch(() => null);

    // Actualizar panel
    if (ticket.panelMessageId) {
      try {
        const msg = await channel.messages.fetch(ticket.panelMessageId);
        if (msg) {
          const applicantUser = await interaction.client.users.fetch(ticket.userId).catch(() => interaction.user);
          const updatedPayload = buildPostulacionTicketPayload(ticket, applicantUser, ticket.answers);
          await msg.edit(updatedPayload);
        }
      } catch (e) {
        console.warn(e);
      }
    }

    const approveEmbed = new EmbedBuilder()
      .setTitle('✅ Postulación Aprobada')
      .setColor(0x57F287)
      .setDescription(
        `¡La postulación de <@${ticket.userId}> ha sido **APROBADA** por <@${interaction.user.id}>!\n` +
        `El usuario ya tiene permisos para conversar en este canal.`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [approveEmbed] });

    // Enviar DM al usuario
    try {
      const user = await interaction.client.users.fetch(ticket.userId);
      if (user) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🎉 ¡Postulación Aprobada!')
          .setColor(0x57F287)
          .setDescription(
            `¡Felicidades <@${user.id}>! Tu postulación para **AntiSocial** ha sido **APROBADA** por <@${interaction.user.id}>.\n` +
            `Puedes acceder a tu ticket en el servidor aquí: <#${channel.id}>.`
          )
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      }
    } catch (e) {
      console.warn('No se pudo enviar DM de aprobación.');
    }
  }

  /**
   * Rechazar postulación
   */
  static async denyPostulacion(interaction, reason) {
    const channel = interaction.channel;
    const ticket = StorageService.getTicketByChannel(channel.id);

    if (!ticket || !ticket.isPostulacion) {
      return interaction.reply({
        content: 'Este canal no es un ticket de postulación válido.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    ticket.postulacionStatus = 'denied';
    StorageService.saveTicket(channel.id, ticket);

    // Actualizar panel
    if (ticket.panelMessageId) {
      try {
        const msg = await channel.messages.fetch(ticket.panelMessageId);
        if (msg) {
          const applicantUser = await interaction.client.users.fetch(ticket.userId).catch(() => interaction.user);
          const updatedPayload = buildPostulacionTicketPayload(ticket, applicantUser, ticket.answers);
          await msg.edit(updatedPayload);
        }
      } catch (e) {
        console.warn(e);
      }
    }

    const denyEmbed = new EmbedBuilder()
      .setTitle('❌ Postulación Rechazada')
      .setColor(0xED4245)
      .setDescription(
        `La postulación de <@${ticket.userId}> ha sido **RECHAZADA** por <@${interaction.user.id}>.\n` +
        `**Motivo:** ${reason || 'No especificado'}`
      )
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [denyEmbed] });
    } else {
      await interaction.reply({ embeds: [denyEmbed] });
    }

    // Enviar DM al usuario
    try {
      const user = await interaction.client.users.fetch(ticket.userId);
      if (user) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('Postulación No Aprobada')
          .setColor(0xED4245)
          .setDescription(
            `Hola <@${user.id}>, lamentamos informarte que tu postulación para **AntiSocial** no ha sido aprobada en esta ocasión.\n` +
            `**Motivo:** ${reason || 'No especificado'}\n\n` +
            `Agradecemos tu interés en la comunidad.`
          )
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      }
    } catch (e) {
      console.warn('No se pudo enviar DM de rechazo.');
    }
  }

  /**
   * Cierra el ticket, genera la transcripción y borra el canal
   */
  static async closeTicket(interaction, reason = 'Sin motivo especificado') {
    const channel = interaction.channel;
    const ticket = StorageService.getTicketByChannel(channel.id);

    await interaction.reply({
      content: 'Cerrando el ticket y generando transcripción... El canal se eliminará en 5 segundos.'
    });

    let transcriptAttachment = null;
    try {
      transcriptAttachment = await discordTranscripts.createTranscript(channel, {
        limit: -1,
        returnType: 'attachment',
        filename: `transcript-${channel.name}.html`,
        saveImages: true,
        footerText: 'AntiSocial Ticket System'
      });
    } catch (err) {
      console.error('Error al generar la transcripción HTML:', err);
    }

    // Enviar log al canal de logs si está configurado
    const logsChannelId = config.ticketSettings.logsChannelId || '1379662712841306243';
    if (logsChannelId) {
      try {
        const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
        if (logsChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle(`Ticket Cerrado - #${ticket?.ticketNumber || 'N/A'}`)
            .setColor(config.panel.accentColor || 15550277)
            .addFields(
              { name: 'Canal', value: channel.name, inline: true },
              { name: 'Categoría', value: ticket?.categoryId || 'N/A', inline: true },
              { name: 'Creador', value: ticket ? `<@${ticket.userId}>` : 'Desconocido', inline: true },
              { name: 'Cerrado por', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Reclamado por', value: ticket?.claimedBy ? `<@${ticket.claimedBy}>` : 'Nadie', inline: true },
              { name: 'Motivo', value: reason }
            )
            .setTimestamp();

          await logsChannel.send({
            embeds: [logEmbed],
            files: transcriptAttachment ? [transcriptAttachment] : []
          });
        }
      } catch (err) {
        console.error('Error al enviar log al canal de logs:', err);
      }
    }

    // Intentar enviar transcripción al usuario por DM
    if (ticket && transcriptAttachment) {
      try {
        const user = await interaction.client.users.fetch(ticket.userId);
        if (user) {
          const dmEmbed = new EmbedBuilder()
            .setTitle(`Tu ticket en AntiSocial ha sido cerrado`)
            .setDescription(`Tu ticket **#${ticket.ticketNumber}** (${channel.name}) fue cerrado por <@${interaction.user.id}>.\nAdjuntamos la transcripción de la conversación.`)
            .setColor(config.panel.accentColor || 15550277)
            .setTimestamp();

          await user.send({
            embeds: [dmEmbed],
            files: [transcriptAttachment]
          });
        }
      } catch (err) {
        console.log(`No se pudo enviar el DM a ${ticket.userId} (posiblemente DMs cerrados).`);
      }
    }

    // Borrar de storage
    StorageService.removeTicket(channel.id);

    // Esperar cuenta regresiva y borrar canal
    const countdown = config.ticketSettings.deleteCountdownSeconds || 5;
    setTimeout(async () => {
      try {
        await channel.delete(`Ticket cerrado por ${interaction.user.tag}`);
      } catch (err) {
        console.error('Error al eliminar el canal del ticket:', err);
      }
    }, countdown * 1000);
  }

  /**
   * Generar transcripción manual a petición
   */
  static async sendManualTranscript(interaction) {
    await interaction.deferReply();
    try {
      const transcriptAttachment = await discordTranscripts.createTranscript(interaction.channel, {
        limit: -1,
        returnType: 'attachment',
        filename: `transcript-${interaction.channel.name}.html`,
        saveImages: true,
        footerText: 'AntiSocial Ticket System'
      });

      return interaction.editReply({
        content: 'Aquí tienes la transcripción completa de este ticket:',
        files: [transcriptAttachment]
      });
    } catch (err) {
      console.error('Error al exportar transcripción manual:', err);
      return interaction.editReply({
        content: 'Ocurrió un error al generar la transcripción del canal.'
      });
    }
  }

  /**
   * Añadir un usuario al ticket
   */
  static async addUser(channel, member, executor) {
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });

    return channel.send(`El usuario <@${member.id}> ha sido añadido al ticket por <@${executor.id}>.`);
  }

  /**
   * Remover un usuario del ticket
   */
  static async removeUser(channel, member, executor) {
    await channel.permissionOverwrites.delete(member.id);
    return channel.send(`El usuario <@${member.id}> ha sido removido del ticket por <@${executor.id}>.`);
  }

  /**
   * Rutina periódica de recordatorios al Staff (cada 30 minutos, máximo 3 veces)
   */
  static startStaffReminderRoutine(client) {
    setInterval(async () => {
      try {
        const tickets = StorageService.getAllActiveTickets();
        const maxReminders = config.ticketSettings.staffMentionMax || 3;
        const intervalMs = (config.ticketSettings.staffMentionIntervalMinutes || 30) * 60 * 1000;

        for (const [channelId, t] of Object.entries(tickets)) {
          if (t.isPostulacion && t.postulacionStatus === 'pending_review' && !t.claimedBy) {
            const count = t.reminderCount || 0;
            if (count < maxReminders) {
              const lastTime = t.lastReminderAt || new Date(t.createdAt).getTime();
              if (Date.now() - lastTime >= intervalMs) {
                const channel = client.channels.cache.get(channelId);
                if (channel) {
                  t.reminderCount = count + 1;
                  t.lastReminderAt = Date.now();
                  StorageService.saveTicket(channelId, t);

                  const staffMention = config.ticketSettings.staffRoleId ? `<@&${config.ticketSettings.staffRoleId}> ` : '';
                  await channel.send({
                    content: `${staffMention}⏰ **Recordatorio de Staff (${t.reminderCount}/${maxReminders}):** La postulación de <@${t.userId}> (#${t.ticketNumber}) sigue esperando revisión o reclamo.`
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error en recordatorio de staff:', err);
      }
    }, 60 * 1000);
  }
}

module.exports = TicketService;
