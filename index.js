const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir les fichiers statiques (si vous avez un dossier public)
app.use(express.static('public'));

// Servir index.html à la racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let onlineUsers = [];

io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id);

  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur:', userData.pseudo);
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      lastSeen: Date.now()
    };
    onlineUsers.push(user);
    io.emit('users-update', onlineUsers);
  });

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-update', onlineUsers);
  });

  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔════════════════════════════════╗
  ║  GLEAPHE SERVER                ║
  ║  🚀 Port: ${PORT}                  ║
  ║  📡 Prêt à servir index.html    ║
  ╚════════════════════════════════╝
  `);
});
