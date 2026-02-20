const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

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

// Socket.IO pour la communication en temps réel
io.on('connection', (socket) => {
  console.log('🔵 Nouvelle connexion:', socket.id);

  // Quand un utilisateur se connecte
  socket.on('user-connect', (userData) => {
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      status: 'online',
      lastSeen: Date.now()
    };

    // Vérifier si l'utilisateur existe déjà
    const existingUser = onlineUsers.find(u => u.peerId === userData.peerId);
    if (!existingUser) {
      onlineUsers.push(user);
    } else {
      existingUser.socketId = socket.id;
      existingUser.status = 'online';
      existingUser.lastSeen = Date.now();
    }

    console.log('👤 Utilisateurs en ligne:', onlineUsers.length);
    
    // Envoyer la liste mise à jour à tous
    io.emit('users-update', onlineUsers);
  });

  // Quand un utilisateur se déconnecte
  socket.on('disconnect', () => {
    console.log('🔴 Déconnexion:', socket.id);
    
    // Marquer comme hors ligne ou supprimer
    const userIndex = onlineUsers.findIndex(u => u.socketId === socket.id);
    if (userIndex !== -1) {
      onlineUsers[userIndex].status = 'offline';
      onlineUsers[userIndex].lastSeen = Date.now();
      
      // Garder l'utilisateur pendant 30 secondes au cas où il revienne
      setTimeout(() => {
        const user = onlineUsers.find(u => u.socketId === socket.id);
        if (user && user.status === 'offline') {
          onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
          io.emit('users-update', onlineUsers);
        }
      }, 30000);
    }
    
    io.emit('users-update', onlineUsers);
  });

  // Demande de la liste des utilisateurs
  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });

  // Envoi d'une notification
  socket.on('send-notification', (data) => {
    const targetUser = onlineUsers.find(u => u.peerId === data.targetId);
    if (targetUser) {
      io.to(targetUser.socketId).emit('notification', {
        from: data.from,
        type: data.type,
        message: data.message
      });
    }
  });

  // Ping pour garder la connexion active
  socket.on('ping', () => {
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) {
      user.lastSeen = Date.now();
    }
  });
});

// Nettoyage périodique des utilisateurs inactifs (plus de 2 minutes)
setInterval(() => {
  const now = Date.now();
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 120000);
  io.emit('users-update', onlineUsers);
}, 30000);

// API REST pour les contacts (optionnel)
app.get('/api/users', (req, res) => {
  res.json(onlineUsers);
});

app.get('/api/user/:peerId', (req, res) => {
  const user = onlineUsers.find(u => u.peerId === req.params.peerId);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Page de statut du serveur
app.get('/status', (req, res) => {
  res.json({
    server: 'NEXUS CHAT SERVER',
    online: onlineUsers.length,
    users: onlineUsers,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════╗
  ║   NEXUS CHAT SERVER            ║
  ║   🚀 Port: ${PORT}                 ║
  ║   📡 Socket.IO prêt            ║
  ╚════════════════════════════════╝
  `);
});