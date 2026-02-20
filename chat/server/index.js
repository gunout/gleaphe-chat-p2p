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

app.use(express.static('public'));

// Stockage des utilisateurs connectés
let onlineUsers = [];

io.on('connection', (socket) => {
  console.log('✅ Socket.IO connecté:', socket.id);

  // Quand un utilisateur se connecte
  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur connecté:', userData.pseudo, 'avec PeerID:', userData.peerId);
    
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      lastSeen: Date.now()
    };
    
    // Vérifier si l'utilisateur existe déjà
    const existingIndex = onlineUsers.findIndex(u => u.peerId === userData.peerId);
    if (existingIndex !== -1) {
      onlineUsers[existingIndex] = user;
    } else {
      onlineUsers.push(user);
    }
    
    console.log('📊 Total utilisateurs en ligne:', onlineUsers.length);
    
    // Envoyer la liste mise à jour à TOUS les clients
    io.emit('users-update', onlineUsers);
  });

  // Demande manuelle de la liste
  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log('❌ Socket.IO déconnecté:', socket.id);
    
    // Retirer l'utilisateur de la liste
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    
    console.log('📊 Utilisateurs restants:', onlineUsers.length);
    
    // Mettre à jour tous les clients
    io.emit('users-update', onlineUsers);
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
    users: onlineUsers.map(u => ({ 
      pseudo: u.pseudo, 
      peerId: u.peerId,
      lastSeen: u.lastSeen 
    })),
    timestamp: new Date().toISOString()
  });
});

// Nettoyage des utilisateurs inactifs (plus de 30 secondes)
setInterval(() => {
  const now = Date.now();
  const beforeCount = onlineUsers.length;
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 30000);
  
  if (onlineUsers.length !== beforeCount) {
    console.log(`🧹 Nettoyage: ${beforeCount - onlineUsers.length} utilisateur(s) inactif(s) retiré(s)`);
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
  ║   🔗 PeerJS: Serveur public             ║
  ║                                        ║
  ║   🌐 https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co
  ╚════════════════════════════════════════╝
  `);
});
