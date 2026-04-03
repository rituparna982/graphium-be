const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const connectDB = require('./config/db');
const errorMiddleware = require('./middleware/errorMiddleware');
const Message = require('./models/Message');

// Routes
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const profileRoutes = require('./routes/profileRoutes');
const communityRoutes = require('./routes/communityRoutes');
const scholarRoutes = require('./routes/scholarRoutes');
const messageRoutes = require('./routes/messageRoutes');
const labRoutes = require('./routes/labRoutes');
const collaborationRoutes = require('./routes/collaborationRoutes');
const conferenceRoutes = require('./routes/conferenceRoutes');
const historyRoutes = require('./routes/historyRoutes'); // NEW: History routes
const flutterCollabRoutes = require('./routes/flutterCollabRoutes'); // NEW: Flutter routes
const uploadRoutes = require('./routes/uploadRoutes'); // NEW: Image upload routes

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

// Connect to MongoDB
connectDB();

// ─── Startup Log ──────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════');
console.log('  GRAPHIUM — DEV MODE');
console.log('  Auth bypass: ENABLED');
console.log('  Role restrictions: DISABLED');
console.log('  History logging: ENABLED');
console.log('══════════════════════════════════════════════════');

// ─── Socket.IO Setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL === "*" ? true : [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Track online users: userId -> socketId
const onlineUsers = new Map();

// DEV MODE: Relaxed socket authentication
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
    } catch (err) {
      console.log('[SOCKET] Token verification failed, using socket id as userId');
      socket.userId = socket.id;
    }
  } else {
    console.log('[SOCKET] No token provided, using socket id as userId');
    socket.userId = socket.id;
  }
  next(); // DEV MODE: Always allow connection
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  onlineUsers.set(userId, socket.id);
  console.log(`[SOCKET] User connected: ${userId}`);

  // Broadcast online status
  io.emit('user_online', { userId });

  // Handle sending a message
  socket.on('send_message', async (data) => {
    try {
      const { receiverId, content, messageType, imageUrl } = data;
      if (!receiverId || (!content?.trim() && !imageUrl)) return;

      const conversationId = Message.getConversationId(userId, receiverId);

      const message = new Message({
        conversationId,
        sender: userId,
        receiver: receiverId,
        content: content?.trim() || '',
        messageType: messageType || 'text',
        imageUrl: imageUrl || '',
      });

      await message.save();

      const msgData = {
        _id: message._id,
        conversationId,
        sender: userId,
        receiver: receiverId,
        content: message.content,
        messageType: message.messageType,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt,
        read: false,
      };

      // Send to receiver if online
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', msgData);
      }

      // Confirm to sender
      socket.emit('message_sent', msgData);
      console.log(`[SOCKET] Message sent from ${userId} to ${receiverId}`);
    } catch (err) {
      console.error('[SOCKET] Message send error:', err);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // Mark messages as read
  socket.on('mark_read', async (data) => {
    try {
      const { otherUserId } = data;
      const conversationId = Message.getConversationId(userId, otherUserId);
      await Message.updateMany(
        { conversationId, receiver: userId, read: false },
        { $set: { read: true } }
      );
      const senderSocketId = onlineUsers.get(otherUserId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('messages_read', { conversationId, readBy: userId });
      }
    } catch (err) {
      console.error('[SOCKET] Mark read error:', err);
    }
  });
  
  // Typing indicator
  socket.on('typing', (data) => {
    const { receiverId } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', { userId });
    }
  });

  socket.on('stop_typing', (data) => {
    const { receiverId } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_stop_typing', { userId });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('user_offline', { userId });
    console.log(`[SOCKET] User disconnected: ${userId}`);
  });
});

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = [
  FRONTEND_URL, 
  'https://graphium.space', 
  'http://localhost:5173', 
  'http://localhost:3000'
].filter(o => o && o !== "*");

const corsOptions = {
  origin: (origin, callback) => {
    // Allow if no origin (like mobile apps/postman) OR if FRONTEND_URL is *
    if (!origin || FRONTEND_URL === "*" || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// CORS logic handled by middleware (Standard for Express 5 compatibility)
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// DEV MODE: Relaxed rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // DEV: much higher limit
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Request Logging Middleware ───────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Root Route ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Graphium API is running');
});
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/scholar', scholarRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/collaborations', collaborationRoutes);
app.use('/api/conference-papers', conferenceRoutes);
app.use('/api/history', historyRoutes); // NEW: History routes
app.use('/api/flutter', flutterCollabRoutes); // NEW: Flutter routes
app.use('/api/upload', uploadRoutes); // NEW: Upload routes

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'development', uptime: process.uptime() });
});

// Error Handling Middleware (must be after routes)
app.use(errorMiddleware);

// Use server.listen instead of app.listen so Socket.IO works
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📡 Frontend expected at: ${FRONTEND_URL}`);
  console.log(`🔧 Dev mode: All auth bypassed, all permissions granted\n`);
});
