'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import AuthModal from '@/components/AuthModal';
import UserListModal from '@/components/UserListModal';
import GroupModal from '@/components/GroupModal';
import CallModal from '@/components/CallModal';
import { socket } from '@/lib/socket';
import { registerPushNotifications } from '@/lib/push';
import { MessageSquare } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export default function Home() {
  const [currentUser, setCurrentUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingMap, setTypingMap] = useState({});
  const [showUserModal, setShowUserModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // WebRTC Call State
  const [callState, setCallState] = useState({
    status: 'idle', // 'idle' | 'calling' | 'incoming' | 'active'
    callType: 'audio', // 'audio' | 'video'
    peerUser: null,
    offer: null,
    isMuted: false,
    isCameraOff: false,
  });

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const pcRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Restore user session from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('msg_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (err) {
        console.error(err);
      }
    }
    setInitialized(true);
  }, []);

  const handleLoginSuccess = (user) => {
    localStorage.setItem('msg_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('msg_user');
    if (socket.connected) socket.disconnect();
    setCurrentUser(null);
    setActiveChat(null);
    setChats([]);
    setMessages([]);
  };

  // Fetch Chats
  const fetchChats = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/api/chats?userId=${userId}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      const ct = res.headers.get('content-type');
      if (res.ok && ct && ct.includes('application/json')) {
        const data = await res.json();
        if (data.chats) {
          setChats(data.chats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    }
  }, []);

  // Fetch Messages for active chat
  const fetchMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    try {
      const res = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      const ct = res.headers.get('content-type');
      if (res.ok && ct && ct.includes('application/json')) {
        const data = await res.json();
        if (data.messages) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newItems = data.messages.filter((m) => !existingIds.has(m.id));
            if (newItems.length === 0 && prev.length === data.messages.length) return prev;
            return data.messages;
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, []);

  // Periodic polling fallback
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      fetchChats(currentUser.id);
      if (activeChatRef.current?.id) {
        fetchMessages(activeChatRef.current.id);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [currentUser, fetchChats, fetchMessages]);

  // Enable Push Notifications
  const handleEnablePush = async () => {
    if (!currentUser) return;
    const res = await registerPushNotifications(currentUser.id, API_BASE);
    if (res.success) {
      setPushEnabled(true);
    }
  };

  // Check push permission on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushEnabled(true);
      }
    }
  }, []);

  // Clean up WebRTC peer connection & stream tracks
  const cleanupCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }

    pendingIceCandidatesRef.current = [];
    setRemoteStream(null);
    setCallState({
      status: 'idle',
      callType: 'audio',
      peerUser: null,
      offer: null,
      isMuted: false,
      isCameraOff: false,
    });
  }, [localStream]);

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', {
          targetUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  // Flush pending queued ICE candidates once remote description is ready
  const flushPendingIceCandidates = async () => {
    if (!pcRef.current || !pcRef.current.remoteDescription) return;
    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift();
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding queued ICE candidate:', err);
      }
    }
  };

  // Start Outgoing Call
  const handleStartCall = async (type) => {
    if (!activeChat || !currentUser) return;

    const recipientPart = activeChat.participants.find((p) => p.userId !== currentUser.id);
    const recipient = recipientPart?.user || { id: recipientPart?.userId, name: 'User' };
    if (!recipient || !recipient.id) {
      alert('Recipient not found');
      return;
    }

    setCallState({
      status: 'calling',
      callType: type,
      peerUser: recipient,
      offer: null,
      isMuted: false,
      isCameraOff: false,
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });

      setLocalStream(stream);

      const pc = createPeerConnection(recipient.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call_user', {
        chatId: activeChat.id,
        targetUserId: recipient.id,
        callerId: currentUser.id,
        callerName: currentUser.name,
        offer,
        callType: type,
      });
    } catch (err) {
      console.error('Failed to get media stream for call:', err);
      alert('Microphone or Camera access required for calling.');
      cleanupCall();
    }
  };

  // Accept Incoming Call
  const handleAcceptCall = async () => {
    const { offer, peerUser, callType } = callState;
    if (!offer || !peerUser) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });

      setLocalStream(stream);

      const pc = createPeerConnection(peerUser.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answer_call', {
        chatId: activeChatRef.current?.id,
        targetUserId: peerUser.id,
        answer,
      });

      setCallState((prev) => ({ ...prev, status: 'active' }));
    } catch (err) {
      console.error('Failed to accept call:', err);
      alert('Microphone or Camera access required.');
      cleanupCall();
    }
  };

  // Reject Incoming Call
  const handleRejectCall = () => {
    const { peerUser } = callState;
    if (peerUser) {
      socket.emit('reject_call', { chatId: activeChatRef.current?.id, targetUserId: peerUser.id });
    }
    cleanupCall();
  };

  // End Active / Outgoing Call
  const handleEndCall = () => {
    const { peerUser } = callState;
    if (peerUser) {
      socket.emit('end_call', { chatId: activeChatRef.current?.id, targetUserId: peerUser.id });
    }
    cleanupCall();
  };

  // Toggle Mute Microphone
  const handleToggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setCallState((prev) => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  };

  // Toggle Camera
  const handleToggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCallState((prev) => ({ ...prev, isCameraOff: !videoTrack.enabled }));
      }
    }
  };

  // Socket Connection and Event Listeners
  useEffect(() => {
    if (!currentUser) return;

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      socket.emit('user_connected', { userId: currentUser.id });
      if (activeChatRef.current) {
        socket.emit('join_room', { chatId: activeChatRef.current.id });
      }
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on('connect', onConnect);
    fetchChats(currentUser.id);

    const onOnlineUsersList = ({ onlineUserIds }) => {
      if (Array.isArray(onlineUserIds)) {
        setOnlineUsers(new Set(onlineUserIds));
      }
    };

    const onUserPresence = ({ userId, status }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (status === 'online') next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    const onGroupCreated = (groupChat) => {
      fetchChats(currentUser.id);
    };

    // Socket Event: New Message
    const onNewMessage = (newMsg) => {
      const currentActive = activeChatRef.current;

      // Sound chime + Notification for incoming messages
      if (newMsg.senderId !== currentUser.id) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
          console.error(e);
        }

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            if ('serviceWorker' in navigator && navigator.serviceWorker) {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(newMsg.sender?.name || 'New Message', {
                  body: newMsg.type === 'TEXT' ? newMsg.content : newMsg.type === 'AUDIO' ? '🎵 Voice Note' : '📷 Photo Attachment',
                  icon: '/icon-192.png',
                  badge: '/icon-192.png',
                  tag: newMsg.chatId,
                  vibrate: [200, 100, 200],
                });
              }).catch(() => {
                new Notification(newMsg.sender?.name || 'New Message', {
                  body: newMsg.content,
                  icon: '/icon-192.png',
                  tag: newMsg.chatId,
                });
              });
            } else {
              new Notification(newMsg.sender?.name || 'New Message', {
                body: newMsg.content,
                icon: '/icon-192.png',
                tag: newMsg.chatId,
              });
            }
          } catch (e) {
            console.error('Notification error:', e);
          }
        }
      }

      if (currentActive && newMsg.chatId === currentActive.id) {
        setMessages((prev) => {
          // Replace temp optimistic message if sender match, or append
          const tempIdx = prev.findIndex((m) => m.id.startsWith('temp-') && m.senderId === newMsg.senderId && m.content === newMsg.content);
          if (tempIdx !== -1) {
            const copy = [...prev];
            copy[tempIdx] = newMsg;
            return copy;
          }
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        if (newMsg.senderId !== currentUser.id) {
          socket.emit('mark_read', { chatId: currentActive.id, userId: currentUser.id });
        }
      }

      fetchChats(currentUser.id);
    };

    const onIncomingCall = ({ targetUserId, callerId, callerName, offer, callType }) => {
      if (targetUserId !== currentUser.id || callerId === currentUser.id) return;

      // Play Phone Call Ringtone Sound
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(440, ctx.currentTime);
        osc2.frequency.setValueAtTime(480, ctx.currentTime);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 1.5);
        osc2.stop(ctx.currentTime + 1.5);
      } catch (e) {
        console.error('Ringtone error:', e);
      }

      setCallState({
        status: 'incoming',
        callType,
        peerUser: { id: callerId, name: callerName },
        offer,
        isMuted: false,
        isCameraOff: false,
      });
    };

    const onCallAnswered = async ({ targetUserId, answer }) => {
      if (targetUserId !== currentUser.id) return;
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingIceCandidates();
          setCallState((prev) => ({ ...prev, status: 'active' }));
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      }
    };

    const onIceCandidate = async ({ targetUserId, candidate }) => {
      if (targetUserId !== currentUser.id) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      } else {
        // Queue ICE candidate until remote description is set
        pendingIceCandidatesRef.current.push(candidate);
      }
    };

    const onCallRejected = ({ targetUserId }) => {
      if (targetUserId !== currentUser.id) return;
      alert('Call declined');
      cleanupCall();
    };

    const onCallEnded = ({ targetUserId }) => {
      if (targetUserId !== currentUser.id) return;
      cleanupCall();
    };

    const onSessionTerminated = ({ reason }) => {
      alert(reason || 'Account logged in from another device. Session terminated.');
      handleLogout();
    };

    socket.on('online_users_list', onOnlineUsersList);
    socket.on('user_presence', onUserPresence);
    socket.on('group_created', onGroupCreated);
    socket.on('new_message', onNewMessage);
    socket.on('incoming_call', onIncomingCall);
    socket.on('call_answered', onCallAnswered);
    socket.on('ice_candidate', onIceCandidate);
    socket.on('call_rejected', onCallRejected);
    socket.on('call_ended', onCallEnded);
    socket.on('session_terminated', onSessionTerminated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('online_users_list', onOnlineUsersList);
      socket.off('user_presence', onUserPresence);
      socket.off('group_created', onGroupCreated);
      socket.off('new_message', onNewMessage);
      socket.off('incoming_call', onIncomingCall);
      socket.off('call_answered', onCallAnswered);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('call_rejected', onCallRejected);
      socket.off('call_ended', onCallEnded);
      socket.off('session_terminated', onSessionTerminated);
    };
  }, [currentUser, fetchChats, cleanupCall]);

  // Handle active chat selection
  const handleSelectChat = (chat) => {
    if (activeChat?.id) {
      socket.emit('leave_room', { chatId: activeChat.id });
    }

    setActiveChat(chat);
    socket.emit('join_room', { chatId: chat.id });
    fetchMessages(chat.id);

    socket.emit('mark_read', { chatId: chat.id, userId: currentUser.id });
  };

  // Handle Send Message (Streamlined single-path delivery)
  const handleSendMessage = async (msgData) => {
    if (!activeChat || !currentUser) return;

    const textContent = typeof msgData === 'string' ? msgData : msgData.content;
    const type = typeof msgData === 'object' ? msgData.type || 'TEXT' : 'TEXT';
    const mediaUrl = typeof msgData === 'object' ? msgData.mediaUrl : null;
    const duration = typeof msgData === 'object' ? msgData.duration : null;

    const tempMsg = {
      id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      chatId: activeChat.id,
      senderId: currentUser.id,
      content: textContent,
      type,
      mediaUrl,
      duration,
      status: 'SENT',
      createdAt: new Date().toISOString(),
      sender: { id: currentUser.id, name: currentUser.name, isGuest: currentUser.isGuest },
    };

    // Optimistic UI insert
    setMessages((prev) => [...prev, tempMsg]);

    if (socket.connected) {
      socket.emit('send_message', {
        chatId: activeChat.id,
        senderId: currentUser.id,
        content: textContent,
        type,
        mediaUrl,
        duration,
      });
    } else {
      // REST Fallback if socket is disconnected
      try {
        const res = await fetch(`${API_BASE}/api/chats/${activeChat.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify({
            senderId: currentUser.id,
            content: textContent,
            type,
            mediaUrl,
            duration,
          }),
        });
        const data = await res.json();
        if (data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempMsg.id ? data.message : m))
          );
          fetchChats(currentUser.id);
        }
      } catch (err) {
        console.error('REST message fallback error:', err);
      }
    }
  };

  // Handle Typing status
  const handleTyping = (isTypingState) => {
    if (!activeChat || !currentUser) return;
    if (isTypingState) {
      socket.emit('typing', { chatId: activeChat.id, userId: currentUser.id, name: currentUser.name });
    } else {
      socket.emit('stop_typing', { chatId: activeChat.id, userId: currentUser.id });
    }
  };

  // Auto-subscribe to Web Push notifications when user is logged in
  useEffect(() => {
    if (currentUser) {
      registerPushNotifications(currentUser.id, API_BASE).then((res) => {
        if (res.success) setPushEnabled(true);
      });
    }
  }, [currentUser]);

  if (!initialized) return null;

  return (
    <main className="flex h-screen w-screen bg-[#0b141a] text-gray-100 overflow-hidden select-none">
      
      {/* Auth Modal */}
      {!currentUser && <AuthModal onLoginSuccess={handleLoginSuccess} />}

      {/* Main Responsive Mobile/Desktop Layout */}
      {currentUser && (
        <div className="flex h-full w-full overflow-hidden relative">
          
          {/* Sidebar View */}
          <div className={`h-full w-full md:w-80 lg:w-96 flex-shrink-0 ${activeChat ? 'hidden md:flex' : 'flex'}`}>
            <Sidebar
              currentUser={currentUser}
              chats={chats}
              activeChat={activeChat}
              onSelectChat={handleSelectChat}
              onOpenNewChatModal={() => setShowUserModal(true)}
              onOpenGroupModal={() => setShowGroupModal(true)}
              onEnablePush={handleEnablePush}
              pushEnabled={pushEnabled}
              onLogout={handleLogout}
              onlineUsers={onlineUsers}
            />
          </div>

          {/* Chat Window / Placeholder View */}
          <div className={`flex-1 h-full flex ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
            {activeChat ? (
              <ChatWindow
                currentUser={currentUser}
                activeChat={activeChat}
                messages={messages}
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
                isTyping={typingMap[activeChat.id] !== undefined}
                onlineUsers={onlineUsers}
                onStartCall={handleStartCall}
                onBack={() => setActiveChat(null)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#111b21] border-l border-gray-800 text-center p-6 chat-wallpaper">
                <div className="w-20 h-20 bg-emerald-600/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 border border-emerald-500/30 shadow-lg">
                  <MessageSquare className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Self-Hosted PWA Messaging</h2>
                <p className="text-xs text-gray-400 max-w-sm leading-relaxed mb-6">
                  Select a conversation from the sidebar or start a new chat to send real-time text, voice notes, photos & 1-on-1 audio/video calls.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowUserModal(true)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-900/40"
                  >
                    Start New Chat
                  </button>
                  <button
                    onClick={() => setShowGroupModal(true)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-900/40"
                  >
                    Create Group
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WebRTC Call Modal Overlay */}
      <CallModal
        callState={callState}
        localStream={localStream}
        remoteStream={remoteStream}
        onAcceptCall={handleAcceptCall}
        onRejectCall={handleRejectCall}
        onEndCall={handleEndCall}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
      />

      {/* New 1-on-1 Chat Picker Modal */}
      {showUserModal && currentUser && (
        <UserListModal
          currentUser={currentUser}
          onClose={() => setShowUserModal(false)}
          onSelectChat={handleSelectChat}
        />
      )}

      {/* New Group Chat Picker Modal */}
      {showGroupModal && currentUser && (
        <GroupModal
          currentUser={currentUser}
          onClose={() => setShowGroupModal(false)}
          onGroupCreated={(groupChat) => {
            fetchChats(currentUser.id);
            handleSelectChat(groupChat);
          }}
        />
      )}

    </main>
  );
}
