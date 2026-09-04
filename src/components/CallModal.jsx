'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';

export default function CallModal({
  callState,
  localStream,
  remoteStream,
  onAcceptCall,
  onRejectCall,
  onEndCall,
  onToggleMute,
  onToggleCamera,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const [callDuration, setCallDuration] = useState(0);

  const { status, callType, peerUser, isMuted, isCameraOff } = callState;

  // Active call duration timer
  useEffect(() => {
    let timer;
    if (status === 'active') {
      setCallDuration(0);
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [status]);

  // Bind local stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote stream to remote video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-[#111b21] border border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-between p-6 relative min-h-[480px]">
        
        {/* Header / Caller Info */}
        <div className="text-center z-10 w-full pt-4">
          <div className="relative inline-block mb-3">
            <div className="w-24 h-24 rounded-full bg-emerald-800/40 text-emerald-300 font-bold text-3xl flex items-center justify-center border-2 border-emerald-500/40 mx-auto shadow-xl ring-4 ring-emerald-500/20 animate-pulse">
              {peerUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight">{peerUser?.name || 'User'}</h3>
          <p className="text-sm text-emerald-400 font-medium mt-1">
            {status === 'calling' && `Outgoing ${callType === 'video' ? 'Video' : 'Voice'} Call...`}
            {status === 'incoming' && `Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`}
            {status === 'active' && `In Call (${formatTime(callDuration)})`}
          </p>
        </div>

        {/* Video Containers (for video calls) */}
        {callType === 'video' && (status === 'active' || status === 'calling') && (
          <div className="relative w-full flex-1 min-h-[260px] bg-black/60 rounded-2xl overflow-hidden my-4 border border-gray-800">
            {/* Remote Video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {!remoteStream && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                Connecting video stream...
              </div>
            )}

            {/* Local Video Picture-in-Picture */}
            <div className="absolute bottom-3 right-3 w-28 h-36 bg-gray-900 rounded-xl overflow-hidden border-2 border-emerald-500/50 shadow-2xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isCameraOff && (
                <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-gray-500">
                  <VideoOff className="w-6 h-6" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Element for Remote Stream (for voice call) */}
        {callType === 'audio' && (
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
          />
        )}

        {/* Action Controls */}
        <div className="w-full z-10 pb-2">
          {status === 'incoming' ? (
            <div className="flex items-center justify-around w-full max-w-xs mx-auto">
              {/* Decline Button */}
              <button
                onClick={onRejectCall}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                title="Decline"
              >
                <PhoneOff className="w-7 h-7" />
              </button>

              {/* Accept Button */}
              <button
                onClick={onAcceptCall}
                className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 animate-bounce"
                title="Accept"
              >
                <Phone className="w-7 h-7" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              {/* Mute Microphone */}
              <button
                onClick={onToggleMute}
                className={`p-4 rounded-full transition-colors shadow-md ${
                  isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {/* End Call */}
              <button
                onClick={onEndCall}
                className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
                title="End Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>

              {/* Toggle Camera (for video calls) */}
              {callType === 'video' && (
                <button
                  onClick={onToggleCamera}
                  className={`p-4 rounded-full transition-colors shadow-md ${
                    isCameraOff ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                  title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                  {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
