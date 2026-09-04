'use client';

import { useState, useEffect } from 'react';
import { X, Search, UserPlus, Phone, ArrowRight, UserCheck } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function UserListModal({ currentUser, onClose, onSelectChat }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/users?currentUserId=${currentUser.id}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [currentUser.id]);

  const handleStartChatWithUser = async (targetUser) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          currentUserId: currentUser.id,
          targetUserId: targetUser.id,
        }),
      });
      const data = await res.json();
      if (data.chat) {
        onSelectChat(data.chat);
        onClose();
      }
    } catch (err) {
      console.error('Failed to create chat:', err);
      setError('Failed to start chat.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartChatWithNewPhone = async (e) => {
    e.preventDefault();
    if (!newPhone.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          currentUserId: currentUser.id,
          targetPhone: newPhone.trim(),
        }),
      });
      const data = await res.json();
      if (data.chat) {
        onSelectChat(data.chat);
        onClose();
      } else {
        setError(data.error || 'Failed to start chat with this number');
      }
    } catch (err) {
      console.error(err);
      setError('Network error creating chat');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone && u.phone.includes(search))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md bg-[#1f2c34] border border-gray-700/60 rounded-3xl shadow-2xl overflow-hidden text-gray-100 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#111b21] p-4 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Start New Conversation</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Direct Phone Number Input Form */}
        <form onSubmit={handleStartChatWithNewPhone} className="p-3 bg-[#111b21] border-b border-gray-800 space-y-2">
          <label className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
            Message Any Phone Number Directly
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                placeholder="Enter phone number (e.g. +919876543210)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#1f2c34] border border-gray-700 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !newPhone.trim()}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl text-xs flex items-center gap-1 shadow"
            >
              <span>Chat</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Filter Search Input */}
        <div className="p-3 bg-[#111b21]/40 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search existing contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#1f2c34] border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs font-medium text-center">
            {error}
          </div>
        )}

        {/* Users List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Loading contacts...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">
              No matching registered users. Type a phone number above to start a message!
            </div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => handleStartChatWithUser(user)}
                disabled={submitting}
                className="w-full p-3 flex items-center gap-3 rounded-2xl hover:bg-[#2a3942] transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-700/40 text-emerald-300 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white group-hover:text-emerald-400 transition-colors">
                      {user.name}
                    </span>
                    {user.isGuest ? (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                        Guest
                      </span>
                    ) : (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Phone User
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                    {user.phone ? (
                      <>
                        <Phone className="w-3 h-3 text-gray-500" />
                        <span>{user.phone}</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3 h-3 text-gray-500" />
                        <span>Browser Session</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
