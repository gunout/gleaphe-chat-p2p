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

// Middleware pour logger les requêtes (optionnel)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Route principale - sert index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Stockage des utilisateurs connectés
let onlineUsers = [];
let waitingUsers = [];
let callPairs = {};

io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id, 'IP:', socket.handshake.address);

  // ===== CONNEXION UTILISATEUR =====
  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur connecté:', userData.pseudo, 'PeerID:', userData.peerId);
    
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      lastSeen: Date.now(),
      searching: false
    };
    
    const existingIndex = onlineUsers.findIndex(u => u.peerId === userData.peerId);
    if (existingIndex !== -1) {
      onlineUsers[existingIndex] = user;
    } else {
      onlineUsers.push(user);
    }
    
    console.log('📊 Total en ligne:', onlineUsers.length);
    io.emit('users-update', onlineUsers);
  });

  // ===== RECHERCHE DE PARTENAIRE =====
  socket.on('start-search', (userData) => {
    console.log('🔍 Recherche de partenaire pour:', userData.pseudo);
    
    const user = onlineUsers.find(u => u.peerId === userData.peerId);
    if (!user) return;
    
    user.searching = true;
    
    if (waitingUsers.length > 0) {
      const partnerData = waitingUsers.shift();
      const partner = onlineUsers.find(u => u.peerId === partnerData.peerId);
      
      if (partner) {
        console.log('✅ Partenaire trouvé:', partner.pseudo, 'pour', user.pseudo);
        
        callPairs[user.peerId] = partner.peerId;
        callPairs[partner.peerId] = user.peerId;
        
        io.to(user.socketId).emit('partner-found', {
          peerId: partner.peerId,
          pseudo: partner.pseudo
        });
        
        io.to(partner.socketId).emit('partner-found', {
          peerId: user.peerId,
          pseudo: user.pseudo
        });
        
        user.searching = false;
        partner.searching = false;
      } else {
        waitingUsers.push({ peerId: user.peerId, socketId: user.socketId, pseudo: user.pseudo });
      }
    } else {
      waitingUsers.push({ peerId: user.peerId, socketId: user.socketId, pseudo: user.pseudo });
      console.log('⏳ Ajout à la file d\'attente, position:', waitingUsers.length);
      socket.emit('search-started', { message: 'Recherche en cours...' });
    }
  });

  // ===== ARRÊT DE LA RECHERCHE =====
  socket.on('stop-search', (userData) => {
    console.log('⏹️ Arrêt de recherche pour:', userData.pseudo);
    waitingUsers = waitingUsers.filter(u => u.peerId !== userData.peerId);
    const user = onlineUsers.find(u => u.peerId === userData.peerId);
    if (user) user.searching = false;
  });

  // ===== FIN D'APPEL =====
  socket.on('end-call', (userData) => {
    console.log('📞 Fin d\'appel pour:', userData.pseudo);
    
    const partnerId = callPairs[userData.peerId];
    if (partnerId) {
      const partner = onlineUsers.find(u => u.peerId === partnerId);
      if (partner) {
        io.to(partner.socketId).emit('call-ended', { message: 'Appel terminé' });
      }
      
      delete callPairs[userData.peerId];
      delete callPairs[partnerId];
    }
  });

  // ===== DÉCONNEXION =====
  socket.on('disconnect', () => {
    console.log('❌ Déconnecté:', socket.id);
    
    const user = onlineUsers.find(u => u.socketId === socket.id);
    
    if (user) {
      console.log('👋 Utilisateur déconnecté:', user.pseudo);
      
      waitingUsers = waitingUsers.filter(u => u.peerId !== user.peerId);
      
      const partnerId = callPairs[user.peerId];
      if (partnerId) {
        const partner = onlineUsers.find(u => u.peerId === partnerId);
        if (partner) {
          io.to(partner.socketId).emit('partner-disconnected', { message: 'Votre partenaire s\'est déconnecté' });
        }
        delete callPairs[user.peerId];
        delete callPairs[partnerId];
      }
    }
    
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-update', onlineUsers);
  });
});

// ===== NETTOYAGE =====
setInterval(() => {
  const now = Date.now();
  const before = onlineUsers.length;
  
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 30000);
  
  waitingUsers = waitingUsers.filter(u => {
    const user = onlineUsers.find(ou => ou.peerId === u.peerId);
    return user !== undefined;
  });
  
  const activePeerIds = new Set(onlineUsers.map(u => u.peerId));
  Object.keys(callPairs).forEach(peerId => {
    if (!activePeerIds.has(peerId)) {
      delete callPairs[peerId];
    }
  });
  
  if (onlineUsers.length !== before) {
    console.log(`🧹 Nettoyage: ${before - onlineUsers.length} inactifs retirés`);
    io.emit('users-update', onlineUsers);
  }
}, 10000);

// ===== ROUTE DE STATUT POUR HEALTHCHECK =====
app.get('/status', (req, res) => {
  res.json({
    status: 'OK',
    server: 'GLEAPHE CHAT SERVER',
    online: onlineUsers.length,
    waiting: waitingUsers.length,
    calls: Object.keys(callPairs).length / 2,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ===== GESTION DES ERREURS =====
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err.stack);
  res.status(500).send('Quelque chose s\'est mal passé!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║     GLEAPHE CHAT SERVER v3.0                  ║
  ║                                               ║
  ║   🚀 Port: ${PORT}                               ║
  ║   📡 Socket.IO: OK                             ║
  ║   👥 File d'attente active                     ║
  ║   🔌 WebRTC via PeerJS                         ║
  ║   🌐 https://gleaphe-chat.up.railway.app       ║
  ║   ⏰ ${new Date().toISOString()}                   ║
  ╚═══════════════════════════════════════════════╝
  `);
});
