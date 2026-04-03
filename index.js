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
const reviewRoutes = require('./routes/reviewRoutes'); // NEW: Review routes
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
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

// Secure Socket Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    console.error('[SOCKET] Connection rejected: No token provided');
    return next(new Error('Authentication error: Token required'));
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error('[SOCKET] Server Error: Missing JWT_SECRET');
      return next(new Error('Internal server error'));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    console.error('[SOCKET] Connection rejected: Invalid token', err.message);
    next(new Error('Authentication error: Invalid token'));
  }
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

// ─── Global Middleware ────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:19000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.error(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// PRODUCTION-READY: Reflective origin or specific domain to support credentials
app.use(cors({
  origin: (origin, callback) => {
    // Allow all for now if FRONTEND_URL is *, or reflect the origin
    if (!origin || FRONTEND_URL === "*" || [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'].includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

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
app.use('/api/reviews', reviewRoutes); // NEW: Review routes
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);

// ─── ADMIN: Verify User ───────────────────────────────────────────────────────
// In dev mode, let's just make an easy endpoint to verify any user
const User = require('./models/User');
app.put('/api/users/:id/verify', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.isVerified = !user.isVerified;
    await user.save();
    res.json({ message: 'User verification status updated.', isVerified: user.isVerified });
  } catch (err) { next(err); }
});
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
