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
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder
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
   * Valida si el usuario puede abrir un nuevo ticket en la categoría especificada.
   * Reglas:
   * 1. Máximo 1 ticket por categoría (no puede repetir la misma categoría).
   * 2. Máximo 2 tickets abiertos en total entre todas las categorías.
   * Si detecta canales de tickets que ya fueron eliminados en Discord, los auto-limpia.
   */
  static async validateUserTicketLimit(guild, user, categoryId) {
    const maxTotal = config.ticketSettings?.maxTotalTicketsPerUser || config.ticketSettings?.maxTicketsPerUser || 2;
    const maxPerCategory = config.ticketSettings?.maxTicketsPerCategory || 1;

    const userTickets = StorageService.getUserActiveTickets(user.id);
    const validTickets = [];

    // Validar existencia de canales en Discord y limpiar huérfanos
    for (const t of userTickets) {
      let channel = guild.channels.cache.get(t.channelId);
      if (!channel) {
        channel = await guild.channels.fetch(t.channelId).catch(() => null);
      }
      if (channel) {
        validTickets.push({ ...t, channel });
      } else {
        StorageService.removeTicket(t.channelId);
      }
    }

    // Regla 1: Máximo 1 ticket de la misma categoría
    const categoryTickets = validTickets.filter(t => t.categoryId === categoryId);
    if (categoryTickets.length >= maxPerCategory) {
      const existing = categoryTickets[0];
      return {
        allowed: false,
        reason: `Ya tienes un ticket abierto de esta categoría en <#${existing.channelId}>. Solo puedes tener 1 ticket por categoría.`
      };
    }

    // Regla 2: Máximo 2 tickets en total en el servidor
    if (validTickets.length >= maxTotal) {
      const channelsList = validTickets.map(t => `<#${t.channelId}>`).join(' y ');
      return {
        allowed: false,
        reason: `Has alcanzado el límite máximo de ${maxTotal} tickets abiertos simultáneamente (${channelsList}). Debes cerrar al menos uno antes de abrir otro.`
      };
    }

    return { allowed: true };
  }

  /**
   * Crea un canal de ticket para el usuario
   */
  static async createTicket(interaction, categoryId, modalAnswers = null) {
    // 1. Diferir la respuesta de inmediato para evitar el timeout de 3 segundos de Discord
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }

    const guild = interaction.guild;
    const user = interaction.user;
    const category = config.categories[categoryId] || {
      id: categoryId,
      fullName: categoryId,
      prefix: 'ticket'
    };

    // 2. Validar límite de tickets por usuario (máximo 2 en total, máximo 1 por categoría)
    const limitCheck = await this.validateUserTicketLimit(guild, user, categoryId);
    if (!limitCheck.allowed) {
      if (interaction.deferred) {
        return await interaction.editReply({ content: limitCheck.reason });
      } else {
        return await interaction.reply({ content: limitCheck.reason, flags: [MessageFlags.Ephemeral] });
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

      // Responder al usuario
      const replyContent = `Tu ticket ha sido creado con éxito en <#${ticketChannel.id}>.`;
      if (interaction.deferred) {
        await interaction.editReply({ content: replyContent }).catch(() => null);
      } else if (interaction.replied) {
        await interaction.followUp({ content: replyContent, flags: [MessageFlags.Ephemeral] }).catch(() => null);
      } else {
        await interaction.reply({ content: replyContent, flags: [MessageFlags.Ephemeral] }).catch(() => null);
      }

      return ticketChannel;
    } catch (err) {
      console.error('Error al crear canal de ticket:', err);
      const errorMsg = 'Ocurrió un error al crear el canal de ticket. Verifica los permisos del bot.';
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMsg }).catch(() => null);
      } else if (interaction.replied) {
        await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] }).catch(() => null);
      } else {
        await interaction.reply({ content: errorMsg, flags: [MessageFlags.Ephemeral] }).catch(() => null);
      }
    }
  }

  /**
   * Crea el ticket a partir de una postulación respondida por DM
   */
  static async createPostulacionTicket(user, guild, answers) {
    const limitCheck = await this.validateUserTicketLimit(guild, user, 'postular');
    if (!limitCheck.allowed) {
      return { error: limitCheck.reason };
    }

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
      content: `${staffMention}**Nueva postulación recibida de <@${user.id}>.**`
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
      .setTitle('Postulación Aprobada')
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
          .setTitle('¡Postulación Aprobada!')
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
      .setTitle('Postulación Rechazada')
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

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Cerrando ticket...',
        flags: [MessageFlags.Ephemeral]
      });
    } else {
      await interaction.reply({
        content: 'Cerrando ticket...',
        flags: [MessageFlags.Ephemeral]
      });
    }

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

    // Intentar enviar transcripción y notificación al usuario por DM con Components V2
    if (ticket) {
      try {
        const user = await interaction.client.users.fetch(ticket.userId);
        if (user) {
          const category = config.categories[ticket.categoryId] || { fullName: ticket.categoryId };

          const textHeader = new TextDisplayBuilder().setContent(
            `# Ticket Cerrado - AntiSocial\n` +
            `Hola <@${user.id}>, tu ticket ha finalizado y ha sido cerrado por el equipo de Staff.`
          );

          const separator1 = new SeparatorBuilder().setDivider(true);

          const textDetails = new TextDisplayBuilder().setContent(
            `**Detalles del Ticket:**\n` +
            `• **Ticket ID:** #${ticket.ticketNumber}\n` +
            `• **Categoría:** ${category.fullName || ticket.categoryId}\n` +
            `• **Canal:** \`${channel.name}\`\n` +
            `• **Atendido por:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Staff de AntiSocial'}\n` +
            `• **Cerrado por:** <@${interaction.user.id}>\n` +
            `• **Motivo:** ${reason || 'Sin motivo especificado'}`
          );

          const separator2 = new SeparatorBuilder().setDivider(true);

          const textFooter = new TextDisplayBuilder().setContent(
            (transcriptAttachment
              ? `Adjuntamos la transcripción HTML completa de la conversación para tu registro personal.\n\n`
              : '') +
            `-# Si necesitas asistencia adicional o tienes otra consulta, puedes abrir un nuevo ticket en el servidor cuando desees.`
          );

          const container = new ContainerBuilder()
            .setAccentColor(config.panel.accentColor || 15550277)
            .addTextDisplayComponents(textHeader)
            .addSeparatorComponents(separator1)
            .addTextDisplayComponents(textDetails)
            .addSeparatorComponents(separator2)
            .addTextDisplayComponents(textFooter);

          const payload = {
            flags: [MessageFlags.IsComponentsV2],
            components: [container]
          };

          if (transcriptAttachment) {
            payload.files = [transcriptAttachment];
          }

          await user.send(payload);
        }
      } catch (err) {
        console.log(`No se pudo enviar el DM a ${ticket.userId} (posiblemente DMs cerrados):`, err.message);
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

    const embed = new EmbedBuilder()
      .setColor(config.panel.accentColor || 0xED4245)
      .setDescription(`<@${member.id}> ha sido añadido al ticket por <@${executor.id}>.`)
      .setFooter({ text: 'Este mensaje se eliminará en 6 segundos' });

    const msg = await channel.send({ embeds: [embed] });
    setTimeout(() => {
      msg.delete().catch(() => null);
    }, 6000);

    return msg;
  }

  /**
   * Remover un usuario del ticket
   */
  static async removeUser(channel, member, executor) {
    await channel.permissionOverwrites.delete(member.id);

    const embed = new EmbedBuilder()
      .setColor(config.panel.accentColor || 0xED4245)
      .setDescription(`<@${member.id}> ha sido removido del ticket por <@${executor.id}>.`)
      .setFooter({ text: 'Este mensaje se eliminará en 6 segundos' });

    const msg = await channel.send({ embeds: [embed] });
    setTimeout(() => {
      msg.delete().catch(() => null);
    }, 6000);

    return msg;
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
                    content: `${staffMention}**Recordatorio de Staff (${t.reminderCount}/${maxReminders}):** La postulación de <@${t.userId}> (#${t.ticketNumber}) sigue esperando revisión o reclamo.`
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
