const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webPush = require('web-push');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}));
app.use(express.json());

// Setup VAPID Keys (persist to file if not provided via env)
const vapidFilePath = path.join(__dirname, 'vapid-keys.json');
let vapidKeys;

if (fs.existsSync(vapidFilePath)) {
  vapidKeys = JSON.parse(fs.readFileSync(vapidFilePath, 'utf8'));
} else {
  vapidKeys = webPush.generateVAPIDKeys();
  fs.writeFileSync(vapidFilePath, JSON.stringify(vapidKeys, null, 2));
}

webPush.setVapidDetails(
  'mailto:admin@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

console.log('VAPID Public Key:', vapidKeys.publicKey);

// Track online sockets: userId -> Set of socket IDs
const onlineUsers = new Map();

// Helper to push notification to offline/inactive user
async function sendPushToUser(userId, payload) {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    const pushPromises = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.keysAuth,
          p256dh: sub.keysP256dh,
        },
      };

      return webPush
        .sendNotification(pushSubscription, JSON.stringify(payload))
        .catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription expired or invalid; delete from DB
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            console.error('Error sending push notification:', err.message);
          }
        });
    });

    await Promise.all(pushPromises);
  } catch (err) {
    console.error('Failed in sendPushToUser:', err);
  }
}

// ---------------- REST APIs ----------------

// 1. Sender OTP Request
app.post('/api/auth/otp-request', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let user = await prisma.user.findUnique({ where: { phone } });

    if (user) {
      user = await prisma.user.update({
        where: { phone },
        data: { otp, otpExpiresAt, name: name || user.name },
      });
    } else {
      user = await prisma.user.create({
        data: {
          phone,
          name: name || `User ${phone.slice(-4)}`,
          otp,
          otpExpiresAt,
          isGuest: false,
        },
      });
    }

    // Return OTP directly in response for local self-hosted zero-cost usage
    res.json({
      success: true,
      message: 'OTP generated successfully',
      otp, // Exposed for local manual input
      phone: user.phone,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to request OTP' });
  }
});

// 2. Sender OTP Verify
app.post('/api/auth/otp-verify', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });

    if (!user || user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid PIN / OTP code' });
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP code has expired' });
    }

    // Clear OTP
    const updatedUser = await prisma.user.update({
      where: { phone },
      data: { otp: null, otpExpiresAt: null },
    });

    res.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        isGuest: updatedUser.isGuest,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// 3. Receiver Guest Quick Login
app.post('/api/auth/guest', async (req, res) => {
  try {
    const { name } = req.body;
    const guestName = name || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;

    const user = await prisma.user.create({
      data: {
        name: guestName,
        isGuest: true,
      },
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        phone: null,
        isGuest: true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create guest user' });
  }
});

// 4. Web Push Public VAPID Key
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// 5. Save Web Push Subscription
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { userId, subscription, userAgent } = req.body;
    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    const keysAuth = subscription.keys?.auth || '';
    const keysP256dh = subscription.keys?.p256dh || '';

    const pushSub = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        keysAuth,
        keysP256dh,
        userAgent: userAgent || '',
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        keysAuth,
        keysP256dh,
        userAgent: userAgent || '',
      },
    });

    res.json({ success: true, subscription: pushSub });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// 6. List Users (to start chats)
app.get('/api/users', async (req, res) => {
  try {
    const { currentUserId } = req.query;
    const users = await prisma.user.findMany({
      where: currentUserId ? { NOT: { id: currentUserId } } : {},
      select: { id: true, name: true, phone: true, isGuest: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 7. List Chats for User
app.get('/api/chats', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, phone: true, isGuest: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ chats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// 8. Create or Get Chat
app.post('/api/chats', async (req, res) => {
  try {
    const { currentUserId, targetUserId } = req.body;
    if (!currentUserId || !targetUserId) {
      return res.status(400).json({ error: 'currentUserId and targetUserId required' });
    }

    // Check if chat already exists
    const existingChat = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, phone: true, isGuest: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existingChat) {
      return res.json({ chat: existingChat });
    }

    // Create new Chat
    const chat = await prisma.chat.create({
      data: {
        isGroup: false,
        participants: {
          create: [{ userId: currentUserId }, { userId: targetUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, phone: true, isGuest: true },
            },
          },
        },
        messages: true,
      },
    });

    res.json({ chat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Shared Helper to Save & Broadcast Message
async function createAndBroadcastMessage({ chatId, senderId, content }) {
  if (!chatId || !senderId || !content) return null;

  // 1. Save to DB
  const message = await prisma.message.create({
    data: {
      chatId,
      senderId,
      content,
      status: 'SENT',
    },
    include: {
      sender: {
        select: { id: true, name: true, isGuest: true },
      },
    },
  });

  // Update chat updatedAt timestamp
  await prisma.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });

  // 2. Broadcast message to chat room
  io.to(chatId).emit('new_message', message);

  // 3. Find recipients & send Push Notification if inactive / offline
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: true,
    },
  });

  if (chat) {
    for (const p of chat.participants) {
      // Emit to individual participant room so sidebar updates live
      io.to(`user:${p.userId}`).emit('new_message', message);

      if (p.userId !== senderId) {
        // Mark as DELIVERED in DB
        await prisma.message.update({
          where: { id: message.id },
          data: { status: 'DELIVERED' },
        });
        io.to(chatId).emit('message_status_update', { messageId: message.id, status: 'DELIVERED' });

        // Trigger Web Push Notification
        const pushPayload = {
          title: message.sender.name || 'New Message',
          body: content,
          icon: '/icon-192.png',
          chatId,
          senderId,
        };
        sendPushToUser(p.userId, pushPayload);
      }
    }
  }

  return message;
}

// 9. Get Messages in Chat
app.get('/api/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await prisma.message.findMany({
      where: { chatId },
      include: {
        sender: {
          select: { id: true, name: true, isGuest: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// 10. Post Message in Chat (REST fallback)
app.post('/api/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, content } = req.body;

    const message = await createAndBroadcastMessage({ chatId, senderId, content });
    if (!message) {
      return res.status(400).json({ error: 'senderId and content are required' });
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error('Failed to post message via REST:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});


// ---------------- SOCKET.IO REAL-TIME ----------------

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Authenticate socket user
  socket.on('user_connected', ({ userId }) => {
    if (!userId) return;
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);
    socket.userId = userId;
    socket.join(`user:${userId}`);

    // Send full current online users list to this newly connected user!
    const onlineUserIds = Array.from(onlineUsers.keys());
    socket.emit('online_users_list', { onlineUserIds });

    // Broadcast to everyone else that this user is online
    io.emit('user_presence', { userId, status: 'online' });
  });

  socket.on('join_room', ({ chatId }) => {
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined room ${chatId}`);
  });

  socket.on('leave_room', ({ chatId }) => {
    socket.leave(chatId);
  });

  // Typing status
  socket.on('typing', ({ chatId, userId, name }) => {
    socket.to(chatId).emit('user_typing', { chatId, userId, name });
  });

  socket.on('stop_typing', ({ chatId, userId }) => {
    socket.to(chatId).emit('user_stop_typing', { chatId, userId });
  });

  // Send message
  socket.on('send_message', async ({ chatId, senderId, content }) => {
    try {
      await createAndBroadcastMessage({ chatId, senderId, content });
    } catch (err) {
      console.error('Error handling send_message:', err);
    }
  });

  // Mark messages as READ
  socket.on('mark_read', async ({ chatId, userId }) => {
    try {
      if (!chatId || !userId) return;

      await prisma.message.updateMany({
        where: {
          chatId,
          senderId: { not: userId },
          status: { not: 'READ' },
        },
        data: {
          status: 'READ',
        },
      });

      io.to(chatId).emit('messages_read', { chatId, readByUserId: userId });
    } catch (err) {
      console.error('Error in mark_read:', err);
    }
  });

  // ---------------- WebRTC Signaling Handlers ----------------

  socket.on('call_user', ({ chatId, targetUserId, callerId, callerName, offer, callType }) => {
    console.log(`[WebRTC] Call from ${callerName} (${callerId}) to ${targetUserId}`);
    io.emit('incoming_call', { targetUserId, callerId, callerName, offer, callType, chatId });
  });

  socket.on('answer_call', ({ chatId, targetUserId, answer }) => {
    console.log(`[WebRTC] Call answered for ${targetUserId}`);
    io.emit('call_answered', { targetUserId, answer });
  });

  socket.on('ice_candidate', ({ chatId, targetUserId, candidate }) => {
    io.emit('ice_candidate', { targetUserId, candidate });
  });

  socket.on('reject_call', ({ chatId, targetUserId }) => {
    console.log(`[WebRTC] Call rejected for ${targetUserId}`);
    io.emit('call_rejected', { targetUserId });
  });

  socket.on('end_call', ({ chatId, targetUserId }) => {
    console.log(`[WebRTC] Call ended for ${targetUserId}`);
    io.emit('call_ended', { targetUserId });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    if (socket.userId && onlineUsers.has(socket.userId)) {
      const userSockets = onlineUsers.get(socket.userId);
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(socket.userId);
        io.emit('user_presence', { userId: socket.userId, status: 'offline' });
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, () => {
  console.log(`🚀 Express + Socket.io Server running on http://localhost:${PORT}`);
});
