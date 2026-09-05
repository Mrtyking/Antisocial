const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
const filePath = path.join(dataDir, 'tickets.json');

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ counter: 0, activeTickets: {} }, null, 2), 'utf8');
  }
}

function readData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading tickets.json:', err);
    return { counter: 0, activeTickets: {} };
  }
}

function writeData(data) {
  ensureDataFile();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing tickets.json:', err);
  }
}

class StorageService {
  static getNextTicketNumber() {
    const data = readData();
    data.counter = (data.counter || 0) + 1;
    writeData(data);
    return String(data.counter).padStart(4, '0');
  }

  static saveTicket(channelId, ticketData) {
    const data = readData();
    data.activeTickets[channelId] = ticketData;
    writeData(data);
  }

  static getTicketByChannel(channelId) {
    const data = readData();
    return data.activeTickets[channelId] || null;
  }

  static getActiveTicketByUser(userId, categoryId = null) {
    const data = readData();
    for (const [channelId, t] of Object.entries(data.activeTickets)) {
      if (t.userId === userId) {
        if (!categoryId || t.categoryId === categoryId) {
          return { channelId, ...t };
        }
      }
    }
    return null;
  }

  static getUserActiveTickets(userId) {
    const data = readData();
    const tickets = [];
    for (const [channelId, t] of Object.entries(data.activeTickets)) {
      if (t.userId === userId) {
        tickets.push({ channelId, ...t });
      }
    }
    return tickets;
  }

  static updateTicket(channelId, updates) {
    const data = readData();
    if (data.activeTickets[channelId]) {
      data.activeTickets[channelId] = { ...data.activeTickets[channelId], ...updates };
      writeData(data);
      return data.activeTickets[channelId];
    }
    return null;
  }

  static toggleBypassUser(channelId, userId) {
    const data = readData();
    const ticket = data.activeTickets[channelId];
    if (!ticket) return false;

    if (!ticket.bypassUsers) {
      ticket.bypassUsers = [];
    }

    const index = ticket.bypassUsers.indexOf(userId);
    let enabled = false;
    if (index === -1) {
      ticket.bypassUsers.push(userId);
      enabled = true;
    } else {
      ticket.bypassUsers.splice(index, 1);
      enabled = false;
    }

    writeData(data);
    return enabled;
  }

  static isUserBypassed(channelId, userId) {
    const data = readData();
    const ticket = data.activeTickets[channelId];
    if (!ticket || !ticket.bypassUsers) return false;
    return ticket.bypassUsers.includes(userId);
  }

  static getAllActiveTickets() {
    const data = readData();
    return data.activeTickets || {};
  }

  static removeTicket(channelId) {
    const data = readData();
    const removed = data.activeTickets[channelId];
    delete data.activeTickets[channelId];
    writeData(data);
    return removed;
  }
}

module.exports = StorageService;
