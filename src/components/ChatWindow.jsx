'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Check, CheckCheck, Phone, Video, MoreVertical, Smile, ArrowLeft } from 'lucide-react';

export default function ChatWindow({
  currentUser,
  activeChat,
  messages,
  onSendMessage,
  onTyping,
  isTyping,
  onlineUsers,
  onStartCall,
  onBack,
}) {
  const [content, setContent] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const recipient = activeChat.participants.find((p) => p.userId !== currentUser.id)?.user || {
    name: 'Unknown User',
  };

  const isRecipientOnline = onlineUsers.has(recipient.id);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleInputChange = (e) => {
    setContent(e.target.value);
    onTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 1500);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    onSendMessage(content.trim());
    setContent('');
    onTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] chat-wallpaper relative overflow-hidden">
      
      {/* Top Header */}
      <div className="p-3 bg-[#202c33] border-b border-gray-800 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              title="Back to Chats"
              className="p-1.5 rounded-full text-gray-300 hover:text-white hover:bg-[#2a3942] transition-colors md:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-emerald-800/40 text-emerald-300 font-bold flex items-center justify-center border border-emerald-500/30">
              {recipient.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            {isRecipientOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#202c33] rounded-full"></span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-white leading-tight">{recipient.name}</h3>
            <p className="text-xs text-gray-400">
              {isTyping ? (
                <span className="text-emerald-400 font-medium animate-pulse">typing...</span>
              ) : isRecipientOnline ? (
                <span className="text-emerald-400">online</span>
              ) : (
                <span>offline</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-gray-400">
          <button
            onClick={() => onStartCall && onStartCall('audio')}
            title="Voice Call"
            className="p-2 rounded-full hover:bg-[#2a3942] hover:text-emerald-400 transition-colors"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => onStartCall && onStartCall('video')}
            title="Video Call"
            className="p-2 rounded-full hover:bg-[#2a3942] hover:text-emerald-400 transition-colors"
          >
            <Video className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-full hover:bg-[#2a3942] hover:text-white transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-xl bg-[#182229] border border-gray-800 text-gray-400 max-w-sm text-xs">
              <p className="font-medium text-white mb-1">End-to-End Self-Hosted Chat</p>
              <p>Send a message to start live bidirectional real-time communication with read indicators.</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.id;
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] md:max-w-[65%] px-3 py-1.5 rounded-2xl shadow-md text-sm relative group ${
                    isMe
                      ? 'bg-[#005c4b] text-white rounded-tr-none'
                      : 'bg-[#202c33] text-gray-100 rounded-tl-none'
                  }`}
                >
                  <p className="break-words leading-relaxed pr-12">{msg.content}</p>
                  
                  <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[10px] text-gray-300 select-none">
                    <span>{timeStr}</span>
                    {isMe && (
                      <span className="inline-flex">
                        {msg.status === 'SENT' ? (
                          <Check className="w-3.5 h-3.5 text-gray-400" />
                        ) : msg.status === 'DELIVERED' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-gray-300" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator bubble */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[#202c33] px-4 py-2 rounded-2xl rounded-tl-none text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer Bottom Bar */}
      <form onSubmit={handleSubmit} className="p-3 bg-[#202c33] border-t border-gray-800 flex items-center gap-2 z-10">
        <button
          type="button"
          className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-[#2a3942] transition-colors"
        >
          <Smile className="w-5 h-5" />
        </button>

        <input
          type="text"
          placeholder="Type a message..."
          value={content}
          onChange={handleInputChange}
          className="flex-1 py-2 px-4 bg-[#2a3942] border border-transparent focus:border-emerald-500/50 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none transition-all"
        />

        <button
          type="submit"
          disabled={!content.trim()}
          className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-full transition-all shadow-md flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

    </div>
  );
}
