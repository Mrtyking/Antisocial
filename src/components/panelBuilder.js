const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  MessageFlags
} = require('discord.js');
const config = require('../config');

function getButtonStyle(styleName) {
  switch (styleName?.toLowerCase()) {
    case 'danger':
    case 'red':
      return ButtonStyle.Danger;
    case 'success':
    case 'green':
      return ButtonStyle.Success;
    case 'primary':
    case 'blurple':
    case 'blue':
      return ButtonStyle.Primary;
    case 'secondary':
    case 'grey':
    case 'gray':
    default:
      return ButtonStyle.Secondary;
  }
}

function buildTicketPanelPayload() {
  const attachment = new AttachmentBuilder(config.bannerPath, { name: 'banner.jpg' });

  // 1. Banner superior
  const mediaGallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL('attachment://banner.jpg')
      .setDescription('AntiSocial Banner')
  );

  // 2. Encabezado explicativo e instrucciones
  const instructionContent = [
    `> ${config.panel.quote}`,
    '',
    '**¿Cómo funciona?**',
    ...config.panel.instructions.map((inst, index) => `${index + 1}. ${inst}`)
  ].join('\n');

  const textHeader = new TextDisplayBuilder().setContent(instructionContent);

  // 3. Separador horizontal
  const separator = new SeparatorBuilder().setDivider(true);

  // 4. Descripciones de categorías con barra de cita (blockquote) y sus iconos personalizados
  const categoryLines = Object.values(config.categories).map(cat => {
    const emojiStr = cat.emoji ? `${cat.emoji} ` : '';
    return `> ${emojiStr}**${cat.fullName || cat.label}:** ${cat.description}`;
  });

  const textCategories = new TextDisplayBuilder().setContent(categoryLines.join('\n'));

  // 5. Botones principales dentro del contenedor con sus iconos
  const mainButtonKeys = ['postular', 'partner', 'preguntas', 'wager', 'comprar'];
  const buttonsRow = new ActionRowBuilder();

  for (const key of mainButtonKeys) {
    const cat = config.categories[key];
    if (cat) {
      const btn = new ButtonBuilder()
        .setCustomId(`ticket_open_${cat.id}`)
        .setLabel(cat.label)
        .setStyle(getButtonStyle(cat.buttonStyle));

      if (cat.emojiId) {
        btn.setEmoji({ id: cat.emojiId, name: cat.emojiName || undefined });
      }

      buttonsRow.addComponents(btn);
    }
  }

  // 6. Menú desplegable completo dentro del contenedor con sus iconos
  const selectOptions = Object.values(config.categories).map(cat => {
    const opt = {
      label: cat.fullName || cat.label,
      value: cat.id,
      description: cat.description.length > 100 ? cat.description.substring(0, 97) + '...' : cat.description
    };
    if (cat.emojiId) {
      opt.emoji = { id: cat.emojiId, name: cat.emojiName || undefined };
    }
    return opt;
  });

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_select_category')
      .setPlaceholder('Elige una opción / Choose an option...')
      .addOptions(selectOptions)
  );

  // 7. Footer dentro del contenedor
  const footerText = new TextDisplayBuilder().setContent(`-# ${config.panel.footer}`);

  // Construir el contenedor Components V2
  const container = new ContainerBuilder()
    .setAccentColor(config.panel.accentColor || 15550277)
    .addMediaGalleryComponents(mediaGallery)
    .addTextDisplayComponents(textHeader)
    .addSeparatorComponents(separator)
    .addTextDisplayComponents(textCategories)
    .addActionRowComponents(buttonsRow, selectRow)
    .addTextDisplayComponents(footerText);

  return {
    flags: [MessageFlags.IsComponentsV2],
    components: [container],
    files: [attachment]
  };
}

module.exports = {
  buildTicketPanelPayload
};
