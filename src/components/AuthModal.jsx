'use client';

import { useState } from 'react';
import { Phone, User, Key, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AuthModal({ onLoginSuccess }) {
  const [tab, setTab] = useState('sender'); // 'sender' | 'guest'
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [step, setStep] = useState('request'); // 'request' | 'verify'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sender OTP Request
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!phone) return setError('Please enter a valid phone number');

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ phone, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      setGeneratedOtp(data.otp);
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sender OTP Verify
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!otp) return setError('Please enter the 6-digit PIN code');

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Guest Access (Receiver / Instant access without phone number)
  const handleGuestLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Guest login failed');

      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#1f2c34] border border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden text-gray-100">
        
        {/* Header */}
        <div className="bg-[#111b21] p-6 text-center border-b border-gray-800">
          <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Welcome to Self-Hosted Msg</h2>
          <p className="text-xs text-gray-400 mt-1">Real-time PWA messaging without external third-party APIs</p>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-800 bg-[#111b21]/50">
          <button
            onClick={() => { setTab('sender'); setError(''); }}
            className={`flex-1 py-3 text-sm font-medium transition-all ${
              tab === 'sender'
                ? 'text-emerald-400 border-b-2 border-emerald-500 bg-[#1f2c34]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Sender (Phone PIN Login)
          </button>
          <button
            onClick={() => { setTab('guest'); setError(''); }}
            className={`flex-1 py-3 text-sm font-medium transition-all ${
              tab === 'guest'
                ? 'text-emerald-400 border-b-2 border-emerald-500 bg-[#1f2c34]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Receiver (Guest Instant Access)
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          {tab === 'sender' ? (
            step === 'request' ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Your Name (Optional)</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="e.g. Alice"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#111b21] border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Phone Number Identifier *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      placeholder="+1234567890"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-[#111b21] border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
                >
                  {loading ? 'Generating PIN...' : 'Get Server OTP PIN'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {/* Local PIN Display Banner for easy testing */}
                {generatedOtp && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Server Generated PIN:</span>
                      <span className="text-lg font-mono tracking-widest text-emerald-300">{generatedOtp}</span>
                    </div>
                    <p className="text-[11px] text-emerald-500/80 mt-1">
                      Click below to auto-fill or enter the 6-digit PIN above.
                    </p>
                    <button
                      type="button"
                      onClick={() => setOtp(generatedOtp)}
                      className="mt-2 w-full py-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded font-medium transition-all"
                    >
                      Auto-fill PIN ({generatedOtp})
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Enter 6-Digit PIN Code</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-[#111b21] border border-gray-700 rounded-lg text-center tracking-widest font-mono text-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('request')}
                    className="w-1/3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition-all shadow-lg shadow-emerald-900/40"
                  >
                    {loading ? 'Verifying...' : 'Verify & Enter Chat'}
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={handleGuestLogin} className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-xs">
                <p className="font-semibold mb-0.5">Receiver Instant Access</p>
                <p className="text-gray-300">
                  No phone registration required! Enter as a browser guest to receive and reply to real-time messages instantly.
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Guest Display Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Guest User (or type your name)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#111b21] border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                {loading ? 'Creating Guest Session...' : 'Enter as Guest'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
