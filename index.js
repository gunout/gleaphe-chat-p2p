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
app.use(express.static('public'));

// Servir index.html à la racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Stockage des utilisateurs connectés
let onlineUsers = [];
let waitingUsers = []; // File d'attente pour la recherche
let callPairs = {}; // Paires d'appels en cours

io.on('connection', (socket) => {
  console.log('✅ Client connecté:', socket.id);

  // ===== CONNEXION UTILISATEUR =====
  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur connecté:', userData.pseudo);
    
    const user = {
      socketId: socket.id,
      peerId: userData.peerId,
      pseudo: userData.pseudo,
      lastSeen: Date.now(),
      searching: false
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

  // ===== RECHERCHE DE PARTENAIRE (bouton START) =====
  socket.on('start-search', (userData) => {
    console.log('🔍 Recherche de partenaire pour:', userData.pseudo);
    
    // Trouver l'utilisateur
    const user = onlineUsers.find(u => u.peerId === userData.peerId);
    if (!user) return;
    
    user.searching = true;
    
    // Vérifier s'il y a quelqu'un en attente
    if (waitingUsers.length > 0) {
      // Prendre le premier en attente
      const partnerData = waitingUsers.shift();
      const partner = onlineUsers.find(u => u.peerId === partnerData.peerId);
      
      if (partner) {
        console.log('✅ Partenaire trouvé:', partner.pseudo);
        
        // Créer une paire
        callPairs[user.peerId] = partner.peerId;
        callPairs[partner.peerId] = user.peerId;
        
        // Notifier les deux utilisateurs
        io.to(user.socketId).emit('partner-found', {
          peerId: partner.peerId,
          pseudo: partner.pseudo
        });
        
        io.to(partner.socketId).emit('partner-found', {
          peerId: user.peerId,
          pseudo: user.pseudo
        });
        
        // Enlever les flags de recherche
        user.searching = false;
        partner.searching = false;
      } else {
        // Si le partenaire n'existe plus, remettre l'utilisateur en attente
        waitingUsers.push({ peerId: user.peerId, socketId: user.socketId, pseudo: user.pseudo });
      }
    } else {
      // Personne en attente, on ajoute à la file
      waitingUsers.push({ peerId: user.peerId, socketId: user.socketId, pseudo: user.pseudo });
      console.log('⏳ Ajout à la file d\'attente, position:', waitingUsers.length);
      
      // Notifier que la recherche a commencé
      socket.emit('search-started', { message: 'Recherche en cours...' });
    }
  });

  // ===== ARRÊT DE LA RECHERCHE =====
  socket.on('stop-search', (userData) => {
    console.log('⏹️ Arrêt de recherche pour:', userData.pseudo);
    
    // Retirer de la file d'attente
    waitingUsers = waitingUsers.filter(u => u.peerId !== userData.peerId);
    
    const user = onlineUsers.find(u => u.peerId === userData.peerId);
    if (user) {
      user.searching = false;
    }
  });

  // ===== FIN D'APPEL =====
  socket.on('end-call', (userData) => {
    console.log('📞 Fin d\'appel pour:', userData.pseudo);
    
    // Nettoyer les paires
    const partnerId = callPairs[userData.peerId];
    if (partnerId) {
      // Notifier le partenaire
      const partner = onlineUsers.find(u => u.peerId === partnerId);
      if (partner) {
        io.to(partner.socketId).emit('call-ended', { message: 'Appel terminé' });
      }
      
      delete callPairs[userData.peerId];
      delete callPairs[partnerId];
    }
  });

  // ===== DEMANDE DE LISTE =====
  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });

  // ===== DÉCONNEXION =====
  socket.on('disconnect', () => {
    console.log('❌ Déconnecté:', socket.id);
    
    // Retrouver l'utilisateur
    const user = onlineUsers.find(u => u.socketId === socket.id);
    
    if (user) {
      // Retirer de la file d'attente
      waitingUsers = waitingUsers.filter(u => u.peerId !== user.peerId);
      
      // Nettoyer les paires
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

  // ===== PING POUR GARDER LA CONNEXION =====
  socket.on('ping', () => {
    const user = onlineUsers.find(u => u.socketId === socket.id);
    if (user) user.lastSeen = Date.now();
    socket.emit('pong');
  });
});

// ===== NETTOYAGE DES UTILISATEURS INACTIFS =====
setInterval(() => {
  const now = Date.now();
  const before = onlineUsers.length;
  
  // Nettoyer les utilisateurs inactifs (30 secondes d'inactivité)
  onlineUsers = onlineUsers.filter(u => (now - u.lastSeen) < 30000);
  
  // Nettoyer la file d'attente
  waitingUsers = waitingUsers.filter(u => {
    const user = onlineUsers.find(ou => ou.peerId === u.peerId);
    return user !== undefined;
  });
  
  // Nettoyer les paires orphelines
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

// ===== ROUTE DE STATUT =====
app.get('/status', (req, res) => {
  res.json({
    server: 'GLEAPHE CHAT SERVER',
    online: onlineUsers.length,
    waiting: waitingUsers.length,
    calls: Object.keys(callPairs).length / 2,
    users: onlineUsers.map(u => ({ pseudo: u.pseudo, searching: u.searching })),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     GLEAPHE CHAT SERVER v3.0           ║
  ║                                        ║
  ║   🚀 Port: ${PORT}                        ║
  ║   📡 Socket.IO: OK                      ║
  ║   👥 File d'attente active              ║
  ║   🔌 WebRTC via PeerJS                  ║
  ║   🌐 https://gleaphe-chat.up.railway.app ║
  ╚════════════════════════════════════════╝
  `);
});
