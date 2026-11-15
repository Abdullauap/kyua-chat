// frontend/src/components/call/CallRoom.jsx
//
// The in-call screen shared by 1-on-1 and group calls. Must be rendered inside
// <StreamVideo> + <StreamCall>.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCall,
  useCallStateHooks,
  CallingState,
  ParticipantView,
  ParticipantsAudio,
  SpeakerLayout,
  PaginatedGridLayout,
  hasAudio,
  hasScreenShare,
} from "@stream-io/video-react-sdk";
import toast from "react-hot-toast";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MonitorUp,
  SwitchCamera,
  Smile,
  Users,
  X,
  Circle,
  Square,
  WifiOff,
} from "lucide-react";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉", "🔥"];

const isTouchDevice = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

const formatDuration = (total) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const displayName = (p) => p?.name || p?.userId || "Guest";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function ControlButton({ onClick, label, active = true, danger = false, className = "", children }) {
  const tone = danger
    ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
    : active
      ? "bg-white/10 hover:bg-white/20 text-white"
      : "bg-white text-slate-900 hover:bg-white/90";

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <button
        onClick={onClick}
        aria-label={label}
        title={label}
        className={`grid place-items-center rounded-full transition active:scale-95 ${
          danger ? "h-12 w-16 sm:h-14 sm:w-20" : "size-12 sm:size-14"
        } ${tone}`}
      >
        {children}
      </button>
      <span className="hidden sm:block text-[11px] text-white/60">{label}</span>
    </div>
  );
}

function Avatar({ src, name, size = "size-24", speaking = false }) {
  return (
    <div className={`relative ${size}`}>
      {speaking && <span className="absolute -inset-2 rounded-full ring-4 ring-emerald-400/70 animate-pulse" />}
      {src ? (
        <img src={src} alt={name} className={`${size} rounded-full object-cover bg-slate-700 ring-4 ring-white/10`} />
      ) : (
        <div className={`${size} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 grid place-items-center text-3xl font-semibold ring-4 ring-white/10`}>
          {name?.charAt(0)?.toUpperCase() || "?"}
        </div>
      )}
    </div>
  );
}

function WaitingScreen({ peer, audioOnly, isGroup }) {
  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      <div className="text-center">
        <div className="relative mx-auto size-32 mb-6">
          <span className="absolute inset-0 rounded-full bg-indigo-400/20 animate-ping" />
          <Avatar src={peer?.profilePicture} name={peer?.fullName} size="size-32" />
        </div>
        <p className="text-xl font-semibold text-white">
          {isGroup ? "Waiting for others to join" : `Calling ${peer?.fullName || ""}`}
        </p>
        <p className="mt-2 text-sm text-white/50 flex items-center justify-center gap-1">
          {audioOnly ? "Audio call" : "Video call"}
          <span className="inline-flex gap-0.5 ml-1">
            <span className="size-1 rounded-full bg-white/50 animate-bounce [animation-delay:-0.3s]" />
            <span className="size-1 rounded-full bg-white/50 animate-bounce [animation-delay:-0.15s]" />
            <span className="size-1 rounded-full bg-white/50 animate-bounce" />
          </span>
        </p>
      </div>
    </div>
  );
}

// Audio calls: avatar cards with a speaking ring, plus the hidden audio sinks.
function AudioStage({ participants, remoteParticipants }) {
  const cols =
    participants.length <= 1 ? "grid-cols-1" : participants.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";

  return (
    <>
      <ParticipantsAudio participants={remoteParticipants} />
      <div className={`grid ${cols} gap-4 sm:gap-6 w-full max-w-3xl mx-auto content-center h-full p-4`}>
        {participants.map((p) => (
          <div
            key={p.sessionId}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/5 ring-1 p-6 sm:p-8 transition ${
              p.isSpeaking ? "ring-emerald-400/60 bg-emerald-400/5" : "ring-white/10"
            }`}
          >
            <Avatar src={p.image} name={displayName(p)} size="size-20 sm:size-24" speaking={p.isSpeaking} />
            <p className="text-white font-medium truncate max-w-full">
              {displayName(p)} {p.isLocalParticipant && <span className="text-white/40">(You)</span>}
            </p>
            {!hasAudio(p) && (
              <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-red-500/90">
                <MicOff className="size-4 text-white" />
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Tile({ participant, className = "" }) {
  return (
    <div className={`call-tile relative overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-white/10 ${
      participant.isSpeaking ? "ring-2 ring-emerald-400" : ""
    } ${className}`}>
      <ParticipantView participant={participant} className="h-full w-full" />
    </div>
  );
}

// Video calls: picks a layout that suits how many people are in the room.
function VideoStage({ participants, localParticipant, remoteParticipants }) {
  const someoneSharing = participants.some((p) => hasScreenShare(p));

  if (someoneSharing) {
    return (
      <div className="h-full w-full p-2 sm:p-4">
        <SpeakerLayout participantsBarPosition="bottom" />
      </div>
    );
  }

  if (remoteParticipants.length === 0 && localParticipant) {
    return (
      <div className="h-full w-full p-2 sm:p-4">
        <Tile participant={localParticipant} className="h-full w-full opacity-60" />
      </div>
    );
  }

  if (remoteParticipants.length === 1) {
    return (
      <div className="relative h-full w-full p-2 sm:p-4">
        <Tile participant={remoteParticipants[0]} className="h-full w-full" />
        {localParticipant && (
          <div className="absolute bottom-5 right-5 sm:bottom-8 sm:right-8 w-28 sm:w-56 aspect-[3/4] sm:aspect-video shadow-2xl z-10">
            <Tile participant={localParticipant} className="h-full w-full" />
          </div>
        )}
      </div>
    );
  }

  if (participants.length > 9) {
    return (
      <div className="h-full w-full p-2 sm:p-4">
        <PaginatedGridLayout groupSize={9} />
      </div>
    );
  }

  const cols = participants.length <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  return (
    <div className={`grid ${cols} auto-rows-fr gap-2 sm:gap-3 h-full w-full p-2 sm:p-4`}>
      {participants.map((p) => (
        <Tile key={p.sessionId} participant={p} className="min-h-0" />
      ))}
    </div>
  );
}

function ParticipantsPanel({ participants, onClose }) {
  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full sm:w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h3 className="font-semibold text-white">In this call ({participants.length})</h3>
        <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle text-white">
          <X className="size-5" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {participants.map((p) => (
          <li key={p.sessionId} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
            <Avatar src={p.image} name={displayName(p)} size="size-10" />
            <span className="flex-1 truncate text-white text-sm">
              {displayName(p)} {p.isLocalParticipant && <span className="text-white/40">(You)</span>}
            </span>
            {hasAudio(p) ? <Mic className="size-4 text-white/60" /> : <MicOff className="size-4 text-red-400" />}
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CallRoom({ title, audioOnly = false, isGroup = false, peer, onLeave }) {
  const call = useCall();
  const {
    useParticipants,
    useLocalParticipant,
    useRemoteParticipants,
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
    useCallCallingState,
  } = useCallStateHooks();

  const participants = useParticipants();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { microphone, isMute: micMuted } = useMicrophoneState();
  const { camera, isMute: camMuted } = useCameraState();
  const { isMute: notSharing } = useScreenShareState();
  const callingState = useCallCallingState();

  const [seconds, setSeconds] = useState(0);
  const [showPeople, setShowPeople] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [floating, setFloating] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const peakRef = useRef(1);
  const endedRef = useRef(false);
  const touch = useMemo(isTouchDevice, []);

  // Call timer
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Join / leave toasts, and end a 1-on-1 call when the other person hangs up.
  const prevRemoteRef = useRef(remoteParticipants);
  useEffect(() => {
    const prev = prevRemoteRef.current;
    const prevIds = new Set(prev.map((p) => p.sessionId));
    const nowIds = new Set(remoteParticipants.map((p) => p.sessionId));
    remoteParticipants
      .filter((p) => !prevIds.has(p.sessionId))
      .forEach((p) => toast(`${displayName(p)} joined`, { icon: "👋", id: `join-${p.sessionId}` }));
    prev
      .filter((p) => !nowIds.has(p.sessionId))
      .forEach((p) => toast(`${displayName(p)} left`, { icon: "🚪", id: `left-${p.sessionId}` }));
    prevRemoteRef.current = remoteParticipants;

    peakRef.current = Math.max(peakRef.current, participants.length);
    if (!isGroup && !endedRef.current && peakRef.current >= 2 && remoteParticipants.length === 0) {
      endedRef.current = true;
      toast("Call ended", { icon: "📞" });
      onLeave?.({ peerJoined: true });
    }
  }, [remoteParticipants, participants.length, isGroup, onLeave]);

  // Reactions from others
  const spawnReaction = (emoji, from) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFloating((list) => [...list, { id, emoji, from, left: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloating((list) => list.filter((r) => r.id !== id)), 3000);
  };

  useEffect(() => {
    if (!call) return;
    const unsubscribe = call.on("custom", (event) => {
      const data = event.custom;
      if (data?.type !== "reaction") return;
      if (event.user?.id === call.currentUserId) return;
      spawnReaction(data.emoji, event.user?.name);
    });
    return () => unsubscribe?.();
  }, [call]);

  const sendReaction = (emoji) => {
    spawnReaction(emoji, "You");
    setShowReactions(false);
    call?.sendCustomEvent({ type: "reaction", emoji }).catch(() => {});
  };

  // ---- controls ----
  const toggleMic = () => microphone.toggle().catch(() => toast.error("Microphone unavailable"));
  const toggleCam = () => camera.toggle().catch(() => toast.error("Camera unavailable"));
  const flipCam = () => camera.flip().catch(() => toast.error("Could not switch camera"));
  const toggleScreen = () =>
    call.screenShare.toggle().catch((e) => {
      if (e?.name !== "NotAllowedError") toast.error("Screen sharing failed");
    });

  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `call-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        toast.success("Recording saved");
      };
      stream.getVideoTracks()[0].onended = () => recorder.state !== "inactive" && recorder.stop();
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      toast.success("Recording started");
    } catch {
      toast.error("Recording cancelled");
    }
  };

  const leave = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    endedRef.current = true;
    onLeave?.({ peerJoined: peakRef.current >= 2 });
  };

  const alone = remoteParticipants.length === 0;
  const heading = title || (remoteParticipants[0] ? displayName(remoteParticipants[0]) : peer?.fullName) || "Call";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,_#1e1b4b_0%,_#0f172a_45%,_#020617_100%)] text-white flex flex-col">
      <style>{`
        .call-tile .str-video__participant-view { width: 100%; height: 100%; border-radius: 1rem; }
        .call-tile .str-video__video { width: 100%; height: 100%; object-fit: cover; }
        .call-tile .str-video__video--screen-share { object-fit: contain; }
        .str-video__participant-details { background: rgba(0,0,0,.55); backdrop-filter: blur(6px); border-radius: 9999px; padding: 2px 10px; }
        .str-video__speaker-layout { height: 100%; }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(.5); opacity: 0; }
          15% { transform: translateY(-30px) scale(1.15); opacity: 1; }
          100% { transform: translateY(-65vh) scale(1); opacity: 0; }
        }
      `}</style>

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="min-w-0">
          <h1 className="truncate text-base sm:text-lg font-semibold">{heading}</h1>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-0.5 text-red-300">
              <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
              {alone ? "Ringing" : "Live"}
            </span>
            <span className="tabular-nums">{formatDuration(seconds)}</span>
            <span>•</span>
            <span>{audioOnly ? "Audio" : "Video"}</span>
            {isRecording && (
              <span className="inline-flex items-center gap-1 text-red-300">
                <Circle className="size-2.5 fill-current" /> REC
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowPeople((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm transition"
        >
          <Users className="size-4" />
          <span className="tabular-nums">{participants.length}</span>
        </button>
      </header>

      {callingState === CallingState.RECONNECTING && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-amber-500/90 px-4 py-1.5 text-sm text-black">
          <WifiOff className="size-4" /> Reconnecting…
        </div>
      )}

      {/* Stage */}
      <main className="relative flex-1 min-h-0">
        {audioOnly ? (
          <AudioStage participants={participants} remoteParticipants={remoteParticipants} />
        ) : (
          <VideoStage
            participants={participants}
            localParticipant={localParticipant}
            remoteParticipants={remoteParticipants}
          />
        )}
        {alone && <WaitingScreen peer={peer} audioOnly={audioOnly} isGroup={isGroup} />}

        {floating.map((r) => (
          <div
            key={r.id}
            className="pointer-events-none absolute bottom-4 z-20 flex flex-col items-center"
            style={{ left: `${r.left}%`, animation: "floatUp 3s ease-out forwards" }}
          >
            <span className="text-5xl drop-shadow-lg">{r.emoji}</span>
            {r.from && <span className="mt-1 rounded-full bg-black/50 px-2 text-[10px]">{r.from}</span>}
          </div>
        ))}

        {showPeople && <ParticipantsPanel participants={participants} onClose={() => setShowPeople(false)} />}
      </main>

      {/* Controls */}
      <footer className="relative z-20 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-black/60 to-transparent">
        {showReactions && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex gap-1 rounded-full bg-slate-800/95 backdrop-blur px-3 py-2 ring-1 ring-white/10 shadow-2xl">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="text-2xl sm:text-3xl px-1 hover:scale-125 active:scale-95 transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="mx-auto flex w-fit items-start justify-center gap-2 sm:gap-4 rounded-full sm:rounded-3xl bg-slate-900/70 backdrop-blur-xl ring-1 ring-white/10 px-3 py-2.5 sm:px-6 sm:py-3">
          <ControlButton onClick={toggleMic} active={!micMuted} label={micMuted ? "Unmute" : "Mute"}>
            {micMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </ControlButton>

          {!audioOnly && (
            <ControlButton onClick={toggleCam} active={!camMuted} label={camMuted ? "Start video" : "Stop video"}>
              {camMuted ? <VideoOff className="size-5" /> : <Video className="size-5" />}
            </ControlButton>
          )}

          {!audioOnly && touch && !camMuted && (
            <ControlButton onClick={flipCam} label="Flip">
              <SwitchCamera className="size-5" />
            </ControlButton>
          )}

          {!audioOnly && !touch && (
            <ControlButton onClick={toggleScreen} active={notSharing} label={notSharing ? "Share" : "Stop share"}>
              <MonitorUp className="size-5" />
            </ControlButton>
          )}

          <ControlButton onClick={() => setShowReactions((v) => !v)} active={!showReactions} label="React">
            <Smile className="size-5" />
          </ControlButton>

          {!touch && (
            <ControlButton onClick={toggleRecording} active={!isRecording} label={isRecording ? "Stop rec" : "Record"}>
              {isRecording ? <Square className="size-4 fill-current" /> : <Circle className="size-5 text-red-400" />}
            </ControlButton>
          )}

          <ControlButton onClick={leave} danger label="End">
            <PhoneOff className="size-6" />
          </ControlButton>
        </div>
      </footer>
    </div>
  );
}

// Full-screen loading / error state in the same visual style as the call.
export function CallStatusScreen({ message, error, onBack }) {
  return (
    <div className="h-[100dvh] grid place-items-center bg-[radial-gradient(ellipse_at_top,_#1e1b4b_0%,_#0f172a_45%,_#020617_100%)] text-white p-6">
      <div className="text-center">
        {error ? (
          <>
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-red-500/20">
              <PhoneOff className="size-7 text-red-400" />
            </div>
            <p className="text-lg font-semibold">Could not join the call</p>
            <p className="mt-1 text-sm text-white/50">Check your connection and camera/mic permissions.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={onBack} className="btn btn-ghost text-white">Go back</button>
              <button onClick={() => window.location.reload()} className="btn btn-primary">Try again</button>
            </div>
          </>
        ) : (
          <>
            <div className="relative mx-auto mb-6 size-16">
              <span className="absolute inset-0 rounded-full bg-indigo-400/30 animate-ping" />
              <span className="relative grid size-16 place-items-center rounded-full bg-indigo-500/30">
                <span className="loading loading-spinner loading-md" />
              </span>
            </div>
            <p className="text-white/80">{message || "Joining call…"}</p>
          </>
        )}
      </div>
    </div>
  );
}
