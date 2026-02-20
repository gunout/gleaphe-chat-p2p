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

app.use(express.static('public'));

// Stockage des utilisateurs connectés
let onlineUsers = [];

io.on('connection', (socket) => {
  console.log('✅ Nouvelle connexion:', socket.id);

  // Quand un utilisateur se connecte
  socket.on('user-connect', (userData) => {
    console.log('👤 Connexion de:', userData.pseudo, 'avec PeerID:', userData.peerId);
    
    // Ajouter l'utilisateur
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      lastSeen: Date.now()
    };
    
    // Vérifier si l'utilisateur existe déjà (mise à jour)
    const existingIndex = onlineUsers.findIndex(u => u.peerId === userData.peerId);
    if (existingIndex !== -1) {
      onlineUsers[existingIndex] = user;
    } else {
      onlineUsers.push(user);
    }
    
    // IMPORTANT: Envoyer la liste à TOUS les clients connectés
    console.log('📊 Utilisateurs en ligne:', onlineUsers.length);
    io.emit('users-update', onlineUsers);
    
    // Envoyer une notification de bienvenue
    socket.emit('notification', {
      type: 'success',
      message: 'Bienvenue sur Gleaphe Chat !'
    });
  });

  // Quand un utilisateur se déconnecte
  socket.on('disconnect', () => {
    console.log('❌ Déconnexion:', socket.id);
    
    // Retirer l'utilisateur
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    
    // IMPORTANT: Mettre à jour TOUS les clients
    console.log('📊 Utilisateurs restants:', onlineUsers.length);
    io.emit('users-update', onlineUsers);
  });

  // Demande manuelle de la liste
  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });

  // Envoyer un message
  socket.on('send-message', (data) => {
    console.log('💬 Message de', data.from, ':', data.text);
    
    // Trouver le destinataire
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

  // Envoyer un cadeau
  socket.on('send-gift', (data) => {
    const targetUser = onlineUsers.find(u => u.peerId === data.to);
    if (targetUser) {
      io.to(targetUser.socketId).emit('gift-received', {
        from: data.from,
        fromPseudo: data.fromPseudo
      });
    }
  });

  // Ping pour garder la connexion active
  socket.on('ping', () => {
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) {
      user.lastSeen = Date.now();
    }
    socket.emit('pong');
  });
});

// Route principale
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Route de statut
app.get('/status', (req, res) => {
  res.json({
    server: 'Gleaphe Chat',
    online: onlineUsers.length,
    users: onlineUsers.map(u => ({ pseudo: u.pseudo, peerId: u.peerId }))
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════╗
  ║   GLEAPHE CHAT SERVER          ║
  ║   🚀 Port: ${PORT}                 ║
  ║   📡 En attente de clients...   ║
  ╚════════════════════════════════╝
  `);
});
