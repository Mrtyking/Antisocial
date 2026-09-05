const StorageService = require('../services/storageService');

module.exports = {
  name: 'channelDelete',
  execute(channel) {
    try {
      const ticket = StorageService.getTicketByChannel(channel.id);
      if (ticket) {
        StorageService.removeTicket(channel.id);
        console.log(`[channelDelete] Canal de ticket #${ticket.ticketNumber} (${channel.id}) eliminado, registro limpiado.`);
      }
    } catch (err) {
      console.error('[channelDelete] Error al procesar eliminación de canal:', err);
    }
  }
};
