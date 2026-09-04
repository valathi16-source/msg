'use client';

import { useState, useEffect } from 'react';
import { X, Users, Check, UserPlus } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function GroupModal({ currentUser, onClose, onGroupCreated }) {
  const [groupName, setGroupName] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch(`${API_BASE}/api/users?currentUserId=${currentUser.id}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
        const data = await res.json();
        if (data.users) {
          setUsers(data.users);
        }
      } catch (err) {
        console.error('Failed to load users for group:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [currentUser.id]);

  const toggleSelectUser = (id) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Please enter a group name.');
      return;
    }
    if (selectedUserIds.length === 0) {
      setError('Please select at least 1 participant.');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/chats/group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          name: groupName.trim(),
          creatorId: currentUser.id,
          participantIds: selectedUserIds,
        }),
      });

      const data = await res.json();
      if (data.chat) {
        onGroupCreated(data.chat);
        onClose();
      } else {
        setError(data.error || 'Failed to create group');
      }
    } catch (err) {
      console.error(err);
      setError('Network error while creating group.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md bg-[#111b21] border border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="p-4 bg-[#202c33] border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <div className="w-8 h-8 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <span>Create New Group</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-[#2a3942] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleCreateGroup} className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs">
              {error}
            </div>
          )}

          {/* Group Name Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Group Name</label>
            <input
              type="text"
              placeholder="e.g. Friends & Family, Dev Team"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full py-2 px-3.5 bg-[#202c33] border border-gray-700 focus:border-emerald-500 rounded-xl text-sm text-white focus:outline-none"
              required
            />
          </div>

          {/* Select Participants Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300">Select Participants</span>
            <span className="text-xs text-emerald-400 font-medium">
              {selectedUserIds.length} selected
            </span>
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60 border border-gray-800 rounded-2xl bg-[#0b141a]">
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400 animate-pulse">Loading contacts...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">No other users found.</div>
            ) : (
              users.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => toggleSelectUser(u.id)}
                    className={`w-full p-3 flex items-center justify-between text-left transition-colors ${
                      isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#111b21]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-800/40 text-emerald-300 font-bold flex items-center justify-center border border-emerald-500/30 text-sm">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-white leading-tight">{u.name}</h4>
                        <span className="text-xs text-gray-400">{u.phone || 'Guest'}</span>
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-gray-600 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={creating || selectedUserIds.length === 0 || !groupName.trim()}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-2xl text-sm transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>{creating ? 'Creating Group...' : 'Create Group Chat'}</span>
          </button>

        </form>

      </div>
    </div>
  );
}
