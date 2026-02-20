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
  },
  transports: ['websocket', 'polling']
});

// Servir les fichiers statiques depuis le dossier public (si nécessaire)
app.use(express.static('public'));

// Servir index.html à la racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Stockage des utilisateurs connectés
let onlineUsers = [];

io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id);

  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur connecté:', userData.pseudo);
    
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      lastSeen: Date.now()
    };
    
    // Éviter les doublons
    const existingIndex = onlineUsers.findIndex(u => u.peerId === userData.peerId);
    if (existingIndex !== -1) {
      onlineUsers[existingIndex] = user;
    } else {
      onlineUsers.push(user);
    }
    
    console.log('📊 Total en ligne:', onlineUsers.length);
    io.emit('users-update', onlineUsers);
  });

  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });

  socket.on('disconnect', () => {
    console.log('❌ Déconnecté:', socket.id);
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-update', onlineUsers);
  });

  // Ping pour garder la connexion active
  socket.on('ping', () => {
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) user.lastSeen = Date.now();
    socket.emit('pong');
  });
});

// Route de statut
app.get('/status', (req, res) => {
  res.json({
    server: 'GLEAPHE CHAT',
    online: onlineUsers.length,
    users: onlineUsers,
    timestamp: new Date().toISOString()
  });
});

// Nettoyage des utilisateurs inactifs
setInterval(() => {
  const now = Date.now();
  const before = onlineUsers.length;
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 30000);
  if (onlineUsers.length !== before) {
    console.log(`🧹 Nettoyage: ${before - onlineUsers.length} inactifs`);
    io.emit('users-update', onlineUsers);
  }
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     GLEAPHE CHAT SERVER v2.0           ║
  ║                                        ║
  ║   🚀 Port: ${PORT}                        ║
  ║   📡 Socket.IO: OK                      ║
  ║   🌐 https://gleaphe-chat.up.railway.app ║
  ╚════════════════════════════════════════╝
  `);
});
