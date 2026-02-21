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

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Stockage des utilisateurs connectés
let onlineUsers = [];

io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id);

  // ===== CONNEXION UTILISATEUR =====
  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur connecté:', userData.pseudo, userData.peerId);
    
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
    
    // Envoyer la liste mise à jour à tous
    io.emit('users-update', onlineUsers);
  });

  // ===== MESSAGE GLOBAL =====
  socket.on('global-message', (data) => {
    console.log(`💬 Message de ${data.pseudo}: ${data.message}`);
    
    // Diffuser à tous les utilisateurs
    io.emit('global-message', {
      peerId: data.peerId,
      pseudo: data.pseudo,
      message: data.message,
      timestamp: Date.now()
    });
  });

  // ===== POUR GARDER LA CONNEXION ACTIVE =====
  socket.on('ping', () => {
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) user.lastSeen = Date.now();
    socket.emit('pong');
  });

  // ===== DÉCONNEXION =====
  socket.on('disconnect', () => {
    console.log('❌ Déconnecté:', socket.id);
    
    const user = onlineUsers.find(u => u.socketId === socket.id);
    
    if (user) {
      console.log('👋 Utilisateur déconnecté:', user.pseudo);
      
      // Notifier tous les autres que cet utilisateur s'est déconnecté
      socket.broadcast.emit('user-disconnected', user.peerId);
    }
    
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    
    // Mettre à jour la liste pour tout le monde
    io.emit('users-update', onlineUsers);
  });
});

// ===== NETTOYAGE DES UTILISATEURS INACTIFS =====
setInterval(() => {
  const now = Date.now();
  const before = onlineUsers.length;
  
  // Supprimer les utilisateurs inactifs (plus de 30 secondes sans ping)
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 30000);
  
  if (onlineUsers.length !== before) {
    console.log(`🧹 Nettoyage: ${before - onlineUsers.length} inactifs retirés`);
    io.emit('users-update', onlineUsers);
  }
}, 10000);

// ===== ROUTE DE STATUT =====
app.get('/status', (req, res) => {
  res.json({
    status: 'OK',
    server: 'GLEAPHE GROUP CHAT',
    online: onlineUsers.length,
    users: onlineUsers.map(u => u.pseudo),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     GLEAPHE GROUP CHAT v4.0            ║
  ║                                        ║
  ║   🚀 Port: ${PORT}                        ║
  ║   📡 Socket.IO: OK                      ║
  ║   👥 Mode: Groupe (tous visibles)       ║
  ║   🔌 WebRTC Mesh Network                 ║
  ║   🌐 ${req.headers.host || 'https://gleaphe-chat.up.railway.app'} ║
  ╚════════════════════════════════════════╝
  `);
});
