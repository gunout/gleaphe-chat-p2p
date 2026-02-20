const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuration du serveur PeerJS
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  allow_discovery: true
});

app.use('/peerjs', peerServer);
app.use(express.static('public'));

let onlineUsers = [];

io.on('connection', (socket) => {
  console.log('✅ Socket.IO connecté:', socket.id);

  socket.on('user-connect', (userData) => {
    console.log('👤 Utilisateur connecté:', userData.pseudo);
    
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
    console.log('❌ Déconnecté:', socket.id);
    onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
    io.emit('users-update', onlineUsers);
  });

  socket.on('get-users', () => {
    socket.emit('users-update', onlineUsers);
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/status', (req, res) => {
  res.json({
    server: 'Gleaphe Chat',
    online: onlineUsers.length,
    users: onlineUsers.map(u => ({ pseudo: u.pseudo }))
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     GLEAPHE CHAT SERVER v2.0           ║
  ║                                        ║
  ║   🚀 Port: ${PORT}                        ║
  ║   📡 Socket.IO: OK                      ║
  ║   🔗 PeerJS: /peerjs                    ║
  ║                                        ║
  ║   🌐 https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co
  ╚════════════════════════════════════════╝
  `);
});
