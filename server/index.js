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
  maxHttpBufferSize: 1e8, // 100 MB buffer size for audio/images
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}));
app.options('*', cors());

// Increase JSON limit for base64 image/audio uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files static directory
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Setup VAPID Keys (check env vars first, then fallback to file/generation)
const vapidFilePath = path.join(__dirname, 'vapid-keys.json');
let vapidKeys;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };
} else if (fs.existsSync(vapidFilePath)) {
  vapidKeys = JSON.parse(fs.readFileSync(vapidFilePath, 'utf8'));
} else {
  vapidKeys = webPush.generateVAPIDKeys();
  try {
    fs.writeFileSync(vapidFilePath, JSON.stringify(vapidKeys, null, 2));
  } catch (e) {
    console.warn('Could not write vapid-keys.json locally:', e.message);
  }
}

webPush.setVapidDetails(
  'mailto:admin@chatflow.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

console.log('VAPID Public Key:', vapidKeys.publicKey);

// Track online sockets: userId -> Set of socket IDs
const onlineUsers = new Map();

// Helper to push notification to user
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
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

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

    res.json({
      success: true,
      message: 'OTP generated successfully',
      otp,
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

// 6. Test Push Notification
app.post('/api/push/test', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    await sendPushToUser(userId, {
      title: 'ChatFlow Test Notification',
      body: '🎉 Web Push Notifications are working perfectly on Chrome!',
      icon: '/icon-192.png',
      chatId: 'test',
    });

    res.json({ success: true, message: 'Test notification triggered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to test push' });
  }
});

// 7. Media Upload API (Base64 or File Upload for Audio/Images)
app.post('/api/upload', (req, res) => {
  try {
    const { fileData, fileName, fileType } = req.body;
    if (!fileData) return res.status(400).json({ error: 'fileData required' });

    const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 string' });
    }

    const ext = fileName ? path.extname(fileName) : fileType?.includes('audio') ? '.webm' : '.png';
    const safeName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const buffer = Buffer.from(matches[2], 'base64');
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/${safeName}`;
    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// 8. List Users
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

// 9. List Chats for User
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

// 10. Create or Get 1-on-1 Chat (by targetUserId or targetPhone)
app.post('/api/chats', async (req, res) => {
  try {
    const { currentUserId, targetUserId, targetPhone, targetName } = req.body;
    if (!currentUserId) {
      return res.status(400).json({ error: 'currentUserId required' });
    }

    let targetId = targetUserId;

    // Auto-create target user if phone number was entered directly
    if (!targetId && targetPhone) {
      const cleanPhone = targetPhone.trim();
      let targetUser = await prisma.user.findUnique({ where: { phone: cleanPhone } });
      if (!targetUser) {
        targetUser = await prisma.user.create({
          data: {
            phone: cleanPhone,
            name: targetName || `User ${cleanPhone.slice(-4)}`,
            isGuest: false,
          },
        });
      }
      targetId = targetUser.id;
    }

    if (!targetId) {
      return res.status(400).json({ error: 'targetUserId or targetPhone is required' });
    }

    const existingChat = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetId } } },
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

    const chat = await prisma.chat.create({
      data: {
        isGroup: false,
        participants: {
          create: [{ userId: currentUserId }, { userId: targetId }],
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

// 11. Create Group Chat
app.post('/api/chats/group', async (req, res) => {
  try {
    const { name, creatorId, participantIds } = req.body;
    if (!name || !creatorId || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'Group name, creatorId, and participantIds required' });
    }

    const uniqueUserIds = Array.from(new Set([creatorId, ...participantIds]));

    const groupChat = await prisma.chat.create({
      data: {
        name,
        isGroup: true,
        creatorId,
        participants: {
          create: uniqueUserIds.map((id) => ({ userId: id })),
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

    // Notify all participants about new group creation via socket
    uniqueUserIds.forEach((uid) => {
      io.to(`user:${uid}`).emit('group_created', groupChat);
    });

    res.json({ chat: groupChat });
  } catch (err) {
    console.error('Failed to create group chat:', err);
    res.status(500).json({ error: 'Failed to create group chat' });
  }
});

// Shared Helper to Save & Broadcast Message
async function createAndBroadcastMessage({ chatId, senderId, content, type = 'TEXT', mediaUrl = null, duration = null }) {
  if (!chatId || !senderId || (type === 'TEXT' && !content)) return null;

  const message = await prisma.message.create({
    data: {
      chatId,
      senderId,
      content: content || (type === 'AUDIO' ? '🎵 Voice Note' : type === 'IMAGE' ? '📷 Photo' : '📁 File'),
      type,
      mediaUrl,
      duration: duration ? parseInt(duration) : null,
      status: 'SENT',
    },
    include: {
      sender: {
        select: { id: true, name: true, isGuest: true },
      },
    },
  });

  await prisma.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });

  // Broadcast message to chat room
  io.to(chatId).emit('new_message', message);

  // Broadcast & push notify participants
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: true,
    },
  });

  if (chat) {
    for (const p of chat.participants) {
      io.to(`user:${p.userId}`).emit('new_message', message);

      if (p.userId !== senderId) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: 'DELIVERED' },
        });
        io.to(chatId).emit('message_status_update', { messageId: message.id, status: 'DELIVERED' });

        const pushPayload = {
          title: chat.isGroup ? `${chat.name} (${message.sender.name})` : message.sender.name || 'New Message',
          body: type === 'TEXT' ? message.content : type === 'AUDIO' ? '🎵 Voice Note' : '📷 Photo Attachment',
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

// 12. Get Messages in Chat
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

// 13. Post Message in Chat (REST API)
app.post('/api/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, content, type, mediaUrl, duration } = req.body;

    const message = await createAndBroadcastMessage({ chatId, senderId, content, type, mediaUrl, duration });
    if (!message) {
      return res.status(400).json({ error: 'Invalid message details' });
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

  socket.on('user_connected', ({ userId }) => {
    if (!userId) return;

    // Single-User / One-Device Lock per Phone Number:
    // Terminate existing session if active on another device
    if (onlineUsers.has(userId)) {
      const existingSockets = onlineUsers.get(userId);
      existingSockets.forEach((oldSocketId) => {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket && oldSocket.id !== socket.id) {
          console.log(`[Single Device Lock] Terminating session ${oldSocketId} for userId ${userId}`);
          oldSocket.emit('session_terminated', {
            reason: 'Account accessed from another device or session.',
          });
          oldSocket.disconnect(true);
        }
      });
      existingSockets.clear();
    } else {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socket.id);
    socket.userId = userId;
    socket.join(`user:${userId}`);

    const onlineUserIds = Array.from(onlineUsers.keys());
    socket.emit('online_users_list', { onlineUserIds });
    io.emit('user_presence', { userId, status: 'online' });
  });

  socket.on('join_room', ({ chatId }) => {
    if (chatId) {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined room ${chatId}`);
    }
  });

  socket.on('leave_room', ({ chatId }) => {
    if (chatId) socket.leave(chatId);
  });

  socket.on('typing', ({ chatId, userId, name }) => {
    socket.to(chatId).emit('user_typing', { chatId, userId, name });
  });

  socket.on('stop_typing', ({ chatId, userId }) => {
    socket.to(chatId).emit('user_stop_typing', { chatId, userId });
  });

  socket.on('send_message', async ({ chatId, senderId, content, type, mediaUrl, duration }, callback) => {
    try {
      const msg = await createAndBroadcastMessage({ chatId, senderId, content, type, mediaUrl, duration });
      if (typeof callback === 'function') {
        callback({ success: true, message: msg });
      }
    } catch (err) {
      console.error('Error handling send_message:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

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

  // ---------------- Targeted WebRTC Signaling Handlers ----------------

  socket.on('call_user', ({ chatId, targetUserId, callerId, callerName, offer, callType }) => {
    console.log(`[WebRTC] Targeted Call from ${callerName} (${callerId}) to user:${targetUserId}`);
    io.to(`user:${targetUserId}`).emit('incoming_call', { targetUserId, callerId, callerName, offer, callType, chatId });
  });

  socket.on('answer_call', ({ chatId, targetUserId, answer }) => {
    console.log(`[WebRTC] Targeted Call Answered for user:${targetUserId}`);
    io.to(`user:${targetUserId}`).emit('call_answered', { targetUserId, answer });
  });

  socket.on('ice_candidate', ({ chatId, targetUserId, candidate }) => {
    io.to(`user:${targetUserId}`).emit('ice_candidate', { targetUserId, candidate });
  });

  socket.on('reject_call', ({ chatId, targetUserId }) => {
    console.log(`[WebRTC] Targeted Call Rejected for user:${targetUserId}`);
    io.to(`user:${targetUserId}`).emit('call_rejected', { targetUserId });
  });

  socket.on('end_call', ({ chatId, targetUserId }) => {
    console.log(`[WebRTC] Targeted Call Ended for user:${targetUserId}`);
    io.to(`user:${targetUserId}`).emit('call_ended', { targetUserId });
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
