'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Check,
  CheckCheck,
  Phone,
  Video,
  MoreVertical,
  Smile,
  ArrowLeft,
  Mic,
  Square,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Search,
  X,
  Play,
  Pause,
  Download,
  Users
} from 'lucide-react';

const COMMON_EMOJIS = ['😊', '😂', '😍', '👍', '❤️', '🔥', '🎉', '🙏', '😎', '🙌', '💯', '✨', '👋', '💬', '🚀', '⭐'];

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const recordTimerRef = useRef(null);

  // File / Image Attachment State
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Lightbox Image Viewer State
  const [activeImageModal, setActiveImageModal] = useState(null);

  // Playing Voice Note State
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const audioRefMap = useRef({});

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const isGroup = activeChat?.isGroup;

  const recipient = isGroup
    ? { name: activeChat.name || 'Group Chat' }
    : activeChat.participants.find((p) => p.userId !== currentUser.id)?.user || {
        name: 'Unknown User',
      };

  const isRecipientOnline = !isGroup && onlineUsers.has(recipient.id);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, filePreview, isRecording]);

  const handleInputChange = (e) => {
    setContent(e.target.value);
    onTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 1500);
  };

  const addEmoji = (emoji) => {
    setContent((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Handle File / Image Selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFilePreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(file.name);
    }
  };

  // Start Voice Note Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        // Convert blob to base64 and send
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          setUploading(true);
          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileData: base64Audio,
                fileName: `voice_${Date.now()}.webm`,
                fileType: 'audio/webm',
              }),
            });
            const data = await res.json();
            if (data.url) {
              onSendMessage({
                content: '🎵 Voice Note',
                type: 'AUDIO',
                mediaUrl: data.url,
                duration: recordTime,
              });
            }
          } catch (err) {
            console.error('Failed to upload voice note:', err);
          } finally {
            setUploading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordTime(0);

      recordTimerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone permission denied for voice note:', err);
      alert('Microphone access required to record voice notes.');
    }
  };

  // Stop Voice Note Recording
  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploading) return;

    if (selectedFile) {
      setUploading(true);
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result;
          const isImage = selectedFile.type.startsWith('image/');
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: base64,
              fileName: selectedFile.name,
              fileType: selectedFile.type,
            }),
          });
          const data = await res.json();
          if (data.url) {
            onSendMessage({
              content: content.trim() || (isImage ? '📷 Photo' : `📁 ${selectedFile.name}`),
              type: isImage ? 'IMAGE' : 'FILE',
              mediaUrl: data.url,
            });
            setSelectedFile(null);
            setFilePreview(null);
            setContent('');
          }
        };
        reader.readAsDataURL(selectedFile);
      } catch (err) {
        console.error('Upload error:', err);
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!content.trim()) return;

    onSendMessage({
      content: content.trim(),
      type: 'TEXT',
    });
    setContent('');
    onTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  // Toggle Audio Voice Note Playback
  const toggleAudioPlay = (msgId, url) => {
    const currentAudio = audioRefMap.current[msgId];
    if (playingAudioId === msgId && currentAudio) {
      currentAudio.pause();
      setPlayingAudioId(null);
    } else {
      if (playingAudioId && audioRefMap.current[playingAudioId]) {
        audioRefMap.current[playingAudioId].pause();
      }
      if (!currentAudio) {
        const audio = new Audio(url);
        audioRefMap.current[msgId] = audio;
        audio.onended = () => setPlayingAudioId(null);
        audio.play();
      } else {
        currentAudio.play();
      }
      setPlayingAudioId(msgId);
    }
  };

  // Filter messages if search is active
  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

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
            <div className={`w-10 h-10 rounded-full font-bold flex items-center justify-center border text-base ${
              isGroup ? 'bg-indigo-800/40 text-indigo-300 border-indigo-500/30' : 'bg-emerald-800/40 text-emerald-300 border-emerald-500/30'
            }`}>
              {isGroup ? <Users className="w-5 h-5" /> : (recipient.name?.charAt(0).toUpperCase() || 'U')}
            </div>
            {isRecipientOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#202c33] rounded-full"></span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-white leading-tight flex items-center gap-1.5">
              <span>{recipient.name}</span>
              {isGroup && (
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-500/30 font-medium">
                  {activeChat.participants?.length || 0} members
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400">
              {isTyping ? (
                <span className="text-emerald-400 font-medium animate-pulse">typing...</span>
              ) : isRecipientOnline ? (
                <span className="text-emerald-400">online</span>
              ) : isGroup ? (
                <span>Group Conversation</span>
              ) : (
                <span>offline</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-gray-400">
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Search Messages"
            className="p-2 rounded-full hover:bg-[#2a3942] hover:text-white transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>

          {!isGroup && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Message Search Bar */}
      {showSearch && (
        <div className="p-2.5 bg-[#182229] border-b border-gray-800 flex items-center gap-2 z-10 animate-fade-in">
          <Search className="w-4 h-4 text-gray-400 ml-2" />
          <input
            type="text"
            placeholder="Search messages in this chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-white placeholder-gray-400 focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Messages List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-xl bg-[#182229] border border-gray-800 text-gray-400 max-w-sm text-xs shadow-lg">
              <p className="font-medium text-white mb-1">
                {searchQuery ? 'No matching messages found' : 'Self-Hosted PWA Messaging'}
              </p>
              <p>Send text, voice notes, photos & attachments with instant live status updates.</p>
            </div>
          </div>
        ) : (
          filteredMessages.map((msg) => {
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
                  className={`max-w-[80%] md:max-w-[65%] px-3.5 py-2 rounded-2xl shadow-md text-sm relative group ${
                    isMe
                      ? 'bg-[#005c4b] text-white rounded-tr-none'
                      : 'bg-[#202c33] text-gray-100 rounded-tl-none'
                  }`}
                >
                  {/* Sender Name for Group Chats */}
                  {isGroup && !isMe && msg.sender && (
                    <p className="text-[11px] font-semibold text-emerald-400 mb-1">
                      {msg.sender.name}
                    </p>
                  )}

                  {/* Render Message by Type */}
                  {msg.type === 'IMAGE' && msg.mediaUrl ? (
                    <div className="mb-1 rounded-xl overflow-hidden cursor-pointer" onClick={() => setActiveImageModal(msg.mediaUrl)}>
                      <img
                        src={msg.mediaUrl}
                        alt="Photo attachment"
                        className="max-h-60 w-full object-cover rounded-xl hover:scale-102 transition-transform"
                      />
                    </div>
                  ) : msg.type === 'AUDIO' && msg.mediaUrl ? (
                    <div className="flex items-center gap-3 py-1 pr-12 min-w-[200px]">
                      <button
                        type="button"
                        onClick={() => toggleAudioPlay(msg.id, msg.mediaUrl)}
                        className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow"
                      >
                        {playingAudioId === msg.id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      </button>
                      <div className="flex-1">
                        <div className="h-2 bg-emerald-950/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-emerald-400 transition-all ${
                              playingAudioId === msg.id ? 'w-full animate-pulse' : 'w-1/3'
                            }`}
                          ></div>
                        </div>
                        <span className="text-[10px] text-gray-300 mt-1 block">
                          🎵 Voice Note ({msg.duration ? `${msg.duration}s` : ''})
                        </span>
                      </div>
                    </div>
                  ) : msg.type === 'FILE' && msg.mediaUrl ? (
                    <a
                      href={msg.mediaUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 py-1 pr-10 text-emerald-300 hover:underline"
                    >
                      <FileText className="w-5 h-5 flex-shrink-0" />
                      <span className="text-xs truncate">{msg.content || 'Download File'}</span>
                      <Download className="w-4 h-4 flex-shrink-0" />
                    </a>
                  ) : (
                    <p className="break-words leading-relaxed pr-12">{msg.content}</p>
                  )}

                  {/* Message Timestamp & Status Indicator */}
                  <div className="absolute bottom-1 right-2.5 flex items-center gap-1 text-[10px] text-gray-300 select-none">
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
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="p-3 bg-[#182229] border-t border-gray-800 flex items-center gap-2 overflow-x-auto z-10 animate-fade-in">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="text-xl p-1.5 hover:bg-[#2a3942] rounded-lg transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Selected File Preview Banner */}
      {filePreview && (
        <div className="p-2.5 bg-[#182229] border-t border-gray-800 flex items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {selectedFile?.type.startsWith('image/') ? (
              <img src={filePreview} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-gray-700" />
            ) : (
              <div className="w-10 h-10 bg-emerald-900/40 text-emerald-400 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <span className="text-xs text-white truncate font-medium">{selectedFile?.name}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              setFilePreview(null);
            }}
            className="p-1 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audio Voice Recording Banner */}
      {isRecording && (
        <div className="p-3 bg-red-950/40 border-t border-red-500/30 flex items-center justify-between gap-3 z-10 animate-pulse">
          <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
            <span>Recording Voice Note ({recordTime}s)...</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="px-3 py-1 text-xs bg-gray-800 text-gray-300 hover:text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="px-3 py-1 text-xs bg-red-600 text-white font-semibold rounded-lg shadow"
            >
              Send Voice Note
            </button>
          </div>
        </div>
      )}

      {/* Message Composer Bottom Bar */}
      <form onSubmit={handleSubmit} className="p-3 bg-[#202c33] border-t border-gray-800 flex items-center gap-2 z-10">
        
        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-2 rounded-full hover:bg-[#2a3942] transition-colors ${showEmojiPicker ? 'text-emerald-400' : 'text-gray-400 hover:text-white'}`}
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Media Attachment Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-[#2a3942] transition-colors"
          title="Attach Image or File"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Text Input */}
        <input
          type="text"
          placeholder={selectedFile ? 'Add a caption...' : 'Type a message...'}
          value={content}
          onChange={handleInputChange}
          className="flex-1 py-2 px-4 bg-[#2a3942] border border-transparent focus:border-emerald-500/50 rounded-xl text-sm text-white placeholder-gray-400 focus:outline-none transition-all"
        />

        {/* Mic / Send Button */}
        {content.trim() || selectedFile ? (
          <button
            type="submit"
            disabled={uploading}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-full transition-all shadow-md flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="p-2.5 bg-emerald-800/40 hover:bg-emerald-700/60 text-emerald-300 rounded-full transition-all shadow-md flex-shrink-0 border border-emerald-500/30"
            title="Hold/Tap to Record Voice Note"
          >
            <Mic className="w-4 h-4" />
          </button>
        )}

      </form>

      {/* Lightbox Image Modal */}
      {activeImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setActiveImageModal(null)}>
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={activeImageModal} alt="Full view" className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" />
            <button
              onClick={() => setActiveImageModal(null)}
              className="absolute -top-4 -right-4 p-2 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
