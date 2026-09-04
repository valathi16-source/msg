'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquarePlus,
  Bell,
  LogOut,
  Search,
  CheckCheck,
  Download,
  Smartphone,
  Users,
  Send,
  Sparkles
} from 'lucide-react';
import { sendTestPushNotification } from '@/lib/push';

export default function Sidebar({
  currentUser,
  chats,
  activeChat,
  onSelectChat,
  onOpenNewChatModal,
  onOpenGroupModal,
  onEnablePush,
  pushEnabled,
  onLogout,
  onlineUsers,
}) {
  const [search, setSearch] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      alert("To install on Android/Chrome: Tap Chrome menu (3 dots) -> 'Install App' or 'Add to Home Screen'. On iOS Safari: Tap Share -> 'Add to Home Screen'.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    try {
      const res = await sendTestPushNotification(currentUser.id);
      if (res.success) {
        alert('Test notification sent! Check your Chrome notifications pop-up.');
      } else {
        alert('Failed to send test push: ' + (res.error || 'Enable notifications first'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTestingPush(false);
    }
  };

  const getChatTitle = (chat) => {
    if (chat.isGroup) return chat.name || 'Group Chat';
    const other = chat.participants.find((p) => p.userId !== currentUser.id)?.user;
    return other?.name || 'Unknown User';
  };

  const filteredChats = chats.filter((chat) => {
    const title = getChatTitle(chat);
    return title.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <aside className="w-full md:w-80 lg:w-96 bg-[#111b21] border-r border-gray-800 flex flex-col h-full flex-shrink-0 select-none">
      
      {/* User Header */}
      <div className="p-3 bg-[#202c33] flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-emerald-600/30 text-emerald-300 font-bold flex items-center justify-center border border-emerald-500/40 text-base">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#202c33] rounded-full"></span>
          </div>
          <div>
            <div className="font-semibold text-sm text-white leading-tight flex items-center gap-1.5">
              <span>{currentUser.name}</span>
              {currentUser.isGuest && (
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30 font-medium">
                  Guest
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {currentUser.phone || 'Browser Guest Session'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenGroupModal}
            title="Create Group Chat"
            className="p-2 rounded-full text-indigo-400 hover:text-indigo-300 hover:bg-[#2a3942] transition-colors"
          >
            <Users className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenNewChatModal}
            title="Start New Chat"
            className="p-2 rounded-full text-gray-300 hover:text-emerald-400 hover:bg-[#2a3942] transition-colors"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>
          <button
            onClick={handleInstallApp}
            title="Install Mobile PWA App"
            className="p-2 rounded-full text-emerald-400 hover:text-emerald-300 hover:bg-[#2a3942] transition-colors"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            title="Logout / Switch User"
            className="p-2 rounded-full text-gray-400 hover:text-red-400 hover:bg-[#2a3942] transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PWA Install Banner */}
      {isInstallable && (
        <div className="p-3 bg-emerald-600/15 border-b border-emerald-500/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-emerald-300">
            <Smartphone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Install ChatFlow Mobile App</span>
          </div>
          <button
            onClick={handleInstallApp}
            className="px-2.5 py-1 text-xs bg-emerald-600 text-white font-semibold rounded hover:bg-emerald-500 transition-colors shadow flex-shrink-0"
          >
            Install
          </button>
        </div>
      )}

      {/* Push Notification Controls Banner */}
      <div className="p-2.5 bg-[#182229] border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <Bell className={`w-4 h-4 flex-shrink-0 ${pushEnabled ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
          <span>{pushEnabled ? 'Chrome Push Active' : 'Push Alerts Disabled'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!pushEnabled && (
            <button
              onClick={onEnablePush}
              className="px-2 py-1 text-[11px] bg-amber-500 text-gray-950 font-semibold rounded hover:bg-amber-400 transition-colors shadow"
            >
              Enable
            </button>
          )}
          <button
            onClick={handleTestPush}
            disabled={testingPush}
            className="px-2 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-colors shadow flex items-center gap-1"
            title="Send test Chrome notification"
          >
            <Sparkles className="w-3 h-3" />
            <span>Test Push</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2.5 bg-[#111b21] border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#202c33] border border-transparent focus:border-emerald-500 rounded-lg text-xs text-white focus:outline-none placeholder-gray-400"
          />
        </div>
      </div>

      {/* Chat Threads List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-800/40">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            <p className="mb-3">No active chats yet.</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={onOpenNewChatModal}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all shadow"
              >
                1-on-1 Chat
              </button>
              <button
                onClick={onOpenGroupModal}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow"
              >
                New Group
              </button>
            </div>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isSelected = activeChat?.id === chat.id;
            const lastMsg = chat.messages?.[0];
            const title = getChatTitle(chat);
            const isGroup = chat.isGroup;

            const otherUser = !isGroup
              ? chat.participants.find((p) => p.userId !== currentUser.id)?.user
              : null;
            const isOnline = otherUser ? onlineUsers.has(otherUser.id) : false;

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={`w-full p-3 flex items-center gap-3 transition-all text-left ${
                  isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className={`w-12 h-12 rounded-full font-bold flex items-center justify-center border text-base ${
                    isGroup ? 'bg-indigo-800/40 text-indigo-300 border-indigo-500/30' : 'bg-emerald-800/40 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {isGroup ? <Users className="w-5 h-5" /> : (title.charAt(0).toUpperCase() || 'U')}
                  </div>
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#111b21] rounded-full"></span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
                      <span>{title}</span>
                      {isGroup && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1 rounded border border-indigo-500/30">
                          Group
                        </span>
                      )}
                    </span>
                    {lastMsg && (
                      <span className="text-[11px] text-gray-400">
                        {new Date(lastMsg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                      {lastMsg?.senderId === currentUser.id && (
                        <CheckCheck className={`w-3.5 h-3.5 ${lastMsg.status === 'READ' ? 'text-sky-400' : 'text-gray-400'}`} />
                      )}
                      <span>
                        {lastMsg
                          ? lastMsg.type === 'AUDIO'
                            ? '🎵 Voice Note'
                            : lastMsg.type === 'IMAGE'
                            ? '📷 Photo'
                            : lastMsg.content
                          : 'Started a conversation'}
                      </span>
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

    </aside>
  );
}
