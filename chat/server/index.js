const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Stockage des utilisateurs connectés
let onlineUsers = [];

// Statistiques
let totalConnections = 0;
let messagesSent = 0;

io.on('connection', (socket) => {
  totalConnections++;
  console.log(`🔵 Gleaphe Chat - Nouvelle connexion: ${socket.id} (Total: ${totalConnections})`);

  // Quand un utilisateur se connecte
  socket.on('user-connect', (userData) => {
    console.log(`👤 ${userData.pseudo} a rejoint Gleaphe Chat`);
    
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      status: 'online',
      lastSeen: Date.now()
    };

    // Mettre à jour ou ajouter l'utilisateur
    const existingIndex = onlineUsers.findIndex(u => u.peerId === userData.peerId);
    if (existingIndex !== -1) {
      onlineUsers[existingIndex] = user;
    } else {
      onlineUsers.push(user);
    }

    // Notifier tous les clients
    io.emit('users-update', onlineUsers);
    
    // Notification de bienvenue
    socket.emit('notification', {
      type: 'welcome',
      message: `Bienvenue sur Gleaphe Chat ${userData.pseudo} !`
    });
  });

  // Message texte
  socket.on('send-message', (data) => {
    messagesSent++;
    console.log(`💬 Message de ${data.from}: ${data.text}`);
    
    // Envoyer au destinataire spécifique
    const targetUser = onlineUsers.find(u => u.peerId === data.to);
    if (targetUser) {
      io.to(targetUser.socketId).emit('new-message', {
        from: data.from,
        fromPseudo: data.fromPseudo,
        text: data.text,
        timestamp: Date.now()
      });
    }
  });

  // Cadeau/effet
  socket.on('send-gift', (data) => {
    const targetUser = onlineUsers.find(u => u.peerId === data.to);
    if (targetUser) {
      io.to(targetUser.socketId).emit('gift-received', {
        from: data.from,
        fromPseudo: data.fromPseudo,
        type: data.type
      });
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`🔴 Déconnexion: ${socket.id}`);
    
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) {
      console.log(`👋 ${user.pseudo} a quitté Gleaphe Chat`);
      
      // Notifier les autres
      io.emit('user-left', {
        pseudo: user.pseudo,
        peerId: user.peerId
      });
    }
    
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-update', onlineUsers);
  });

  // Ping pour maintenir la connexion
  socket.on('ping', () => {
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) {
      user.lastSeen = Date.now();
    }
    socket.emit('pong');
  });
});

// Nettoyage des utilisateurs inactifs (plus de 30 secondes)
setInterval(() => {
  const now = Date.now();
  const before = onlineUsers.length;
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 30000);
  if (onlineUsers.length !== before) {
    console.log(`🧹 Nettoyage: ${before - onlineUsers.length} utilisateurs inactifs supprimés`);
    io.emit('users-update', onlineUsers);
  }
}, 10000);

// Routes API
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/status', (req, res) => {
  res.json({
    name: 'Gleaphe Chat Server',
    version: '1.0.0',
    online: onlineUsers.length,
    users: onlineUsers.map(u => ({ pseudo: u.pseudo, status: u.status })),
    totalConnections: totalConnections,
    messagesSent: messagesSent,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/users', (req, res) => {
  res.json(onlineUsers);
});

app.get('/api/user/:peerId', (req, res) => {
  const user = onlineUsers.find(u => u.peerId === req.params.peerId);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'Utilisateur non trouvé' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     GLEAPHE CHAT SERVER v1.0           ║
  ║                                        ║
  ║   🚀 Port: ${PORT}                        ║
  ║   📡 Socket.IO prêt                     ║
  ║   👥 Prêt à accueillir vos amis         ║
  ║                                        ║
  ║   http://localhost:${PORT}                ║
  ╚════════════════════════════════════════╝
  `);
});
