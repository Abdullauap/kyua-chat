// frontend/src/components/RealtimeListener.jsx
//
// Mounted once for a signed-in user. It:
//  - rings on incoming 1-on-1 / group calls (full-screen accept/decline card)
//  - turns group messages, private messages and group changes into
//    notifications (the Navbar/Sidebar badges read the store)
//  - keeps the Stream Chat unread count for the Inbox badge
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";
import { Phone, PhoneOff, Video, Users } from "lucide-react";
import { useSocket } from "../hooks/useSocket";
import useAuthUser from "../hooks/useAuthUser";
import { getStreamToken } from "../lib/api";
import { useNotificationStore } from "../store/useNotificationStore";
import { isGroupMuted } from "../lib/mutedGroups";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY || "xgqw23kv3tdt";
const RING_TIMEOUT_MS = 35000;

const callPath = (c) =>
  c.isGroup
    ? `/group-call/${c.groupId}${c.audioOnly ? "?audioOnly=true" : ""}`
    : `/call/${c.callId}${c.audioOnly ? "?audioOnly=true" : ""}`;

// Simple two-tone ring made with WebAudio, so no audio file is needed.
const createRinger = () => {
  let ctx = null;
  let timer = null;

  const beep = () => {
    if (!ctx) return;
    [0, 0.45].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = offset ? 480 : 440;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.42);
    });
  };

  return {
    start() {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        beep();
        timer = setInterval(beep, 2000);
        navigator.vibrate?.([400, 200, 400]);
      } catch {
        /* audio blocked - the visual card still shows */
      }
    },
    stop() {
      clearInterval(timer);
      timer = null;
      try {
        ctx?.close();
      } catch {
        /* already closed */
      }
      ctx = null;
      navigator.vibrate?.(0);
    },
  };
};

function IncomingCallCard({ call, onAccept, onDecline }) {
  const { caller, isGroup, groupName, audioOnly } = call;
  const kind = audioOnly ? "audio" : "video";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_.2s_ease-out]">
      <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-800 to-slate-950 text-white shadow-2xl ring-1 ring-white/10 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">
          Incoming {isGroup ? "group " : ""}{kind} call
        </p>

        <div className="relative mx-auto my-8 size-28">
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
          <span className="absolute -inset-3 rounded-full ring-2 ring-emerald-400/30" />
          <img
            src={caller?.profilePicture}
            alt={caller?.fullName}
            className="relative size-28 rounded-full object-cover ring-4 ring-white/10 bg-slate-700"
          />
          <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full bg-emerald-500 ring-4 ring-slate-900">
            {audioOnly ? <Phone className="size-4" /> : <Video className="size-4" />}
          </span>
        </div>

        <h2 className="text-2xl font-semibold">{caller?.fullName || "Someone"}</h2>
        {isGroup && (
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/60">
            <Users className="size-4" /> {groupName}
          </p>
        )}

        <div className="mt-10 flex items-center justify-center gap-16">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onDecline}
              className="grid size-16 place-items-center rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition shadow-lg shadow-red-500/30"
              aria-label="Decline"
            >
              <PhoneOff className="size-7" />
            </button>
            <span className="text-xs text-white/60">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onAccept}
              className="grid size-16 place-items-center rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition shadow-lg shadow-emerald-500/30 animate-bounce"
              aria-label="Accept"
            >
              {audioOnly ? <Phone className="size-7" /> : <Video className="size-7" />}
            </button>
            <span className="text-xs text-white/60">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RealtimeListener() {
  const { authUser } = useAuthUser();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const add = useNotificationStore((s) => s.add);
  const setPrivateUnread = useNotificationStore((s) => s.setPrivateUnread);

  const [incoming, setIncoming] = useState(null);
  const ringerRef = useRef(null);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  // ---- ringing ----
  useEffect(() => {
    if (!incoming) return;
    const ringer = createRinger();
    ringerRef.current = ringer;
    ringer.start();
    const timeout = setTimeout(() => {
      add({
        type: "missed_call",
        title: `Missed ${incoming.audioOnly ? "audio" : "video"} call`,
        body: incoming.isGroup
          ? `${incoming.caller?.fullName} in ${incoming.groupName}`
          : `from ${incoming.caller?.fullName}`,
        avatar: incoming.caller?.profilePicture,
        link: callPath(incoming),
      });
      setIncoming(null);
    }, RING_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      ringer.stop();
    };
  }, [incoming, add]);

  // ---- socket events ----
  useEffect(() => {
    if (!socket || !authUser) return;

    const onIncomingCall = (c) => {
      // Already on that call - nothing to ring.
      if (pathRef.current === callPath(c).split("?")[0]) return;
      setIncoming((current) => current || c);
    };

    const onCallCancelled = ({ callId }) => {
      setIncoming((current) => (current?.callId === callId ? null : current));
    };

    const onCallDeclined = ({ by }) => {
      toast(`${by?.fullName || "They"} declined the call`, { icon: "📵" });
    };

    const onGroupNotification = ({ groupId, groupName, message }) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      if (pathRef.current === `/groups/${groupId}`) return;
      if (isGroupMuted(groupId)) return;

      const isCall = message?.text?.includes("/group-call/");
      const preview = isCall ? "Started a call" : (message?.text || "").slice(0, 80);
      add({
        id: `gm-${message?._id}`,
        type: "group_message",
        title: groupName,
        body: `${message?.sender?.fullName}: ${preview}`,
        avatar: message?.sender?.profilePicture,
        link: `/groups/${groupId}`,
      });
      if (!isCall) {
        toast(`${message?.sender?.fullName} in ${groupName}: ${preview}`, { icon: "💬" });
      }
    };

    const onAddedToGroup = ({ groupId, groupName, addedBy }) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      add({
        type: "group_added",
        title: "Added to a group",
        body: `${addedBy?.fullName} added you to ${groupName}`,
        link: `/groups/${groupId}`,
      });
      toast.success(`You were added to ${groupName}`);
    };

    const onRemovedFromGroup = ({ groupId, groupName }) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      add({
        type: "group_removed",
        title: "Removed from a group",
        body: `You were removed from ${groupName}`,
      });
      if (pathRef.current.includes(groupId)) {
        toast.error(`You were removed from ${groupName}`);
        navigate("/groups");
      }
    };

    socket.on("incoming_call", onIncomingCall);
    socket.on("call_cancelled", onCallCancelled);
    socket.on("call_declined", onCallDeclined);
    socket.on("group_notification", onGroupNotification);
    socket.on("added_to_group", onAddedToGroup);
    socket.on("removed_from_group", onRemovedFromGroup);

    return () => {
      socket.off("incoming_call", onIncomingCall);
      socket.off("call_cancelled", onCallCancelled);
      socket.off("call_declined", onCallDeclined);
      socket.off("group_notification", onGroupNotification);
      socket.off("added_to_group", onAddedToGroup);
      socket.off("removed_from_group", onRemovedFromGroup);
    };
  }, [socket, authUser, add, queryClient, navigate]);

  // ---- private (Stream Chat) messages ----
  useEffect(() => {
    if (!authUser || !tokenData?.token) return;

    const client = StreamChat.getInstance(STREAM_API_KEY);
    const seen = new Set();
    let active = true;

    const handler = (event) => {
      if (event.total_unread_count !== undefined) {
        setPrivateUnread(event.total_unread_count);
      }

      if (event.type !== "message.new" && event.type !== "notification.message_new") return;
      const msg = event.message;
      if (!msg || msg.user?.id === authUser._id || seen.has(msg.id)) return;
      seen.add(msg.id);

      // Reading that conversation right now - no notification.
      if (pathRef.current === `/chat/${msg.user?.id}`) return;

      const isCall = /\/call\//.test(msg.text || "");
      add({
        id: `pm-${msg.id}`,
        type: "private_message",
        title: msg.user?.name || "New message",
        body: isCall ? "is calling you" : (msg.text || "Sent an attachment").slice(0, 80),
        avatar: msg.user?.image,
        link: `/chat/${msg.user?.id}`,
      });
      if (!isCall) toast(`${msg.user?.name}: ${(msg.text || "").slice(0, 60)}`, { icon: "✉️" });
    };

    const listener = client.on(handler);

    client
      .connectUser(
        { id: authUser._id, name: authUser.fullName, image: authUser.profilePicture },
        tokenData.token
      )
      .then((res) => {
        if (active && res?.me?.total_unread_count !== undefined) {
          setPrivateUnread(res.me.total_unread_count);
        }
      })
      .catch((err) => console.warn("Stream unread listener:", err?.message));

    return () => {
      active = false;
      listener.unsubscribe();
    };
  }, [authUser, tokenData, add, setPrivateUnread]);

  if (!incoming) return null;

  return (
    <IncomingCallCard
      call={incoming}
      onAccept={() => {
        const c = incoming;
        setIncoming(null);
        navigate(callPath(c));
      }}
      onDecline={() => {
        socket?.emit("call_decline", { callerId: incoming.caller?._id, callId: incoming.callId });
        setIncoming(null);
      }}
    />
  );
}
