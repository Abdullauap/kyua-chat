// frontend/src/pages/GroupChatPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Info,
  UserPlus,
  Bell,
  BellOff,
  Palette,
  LogOut,
  X,
  Crown,
  UserMinus,
  Paperclip,
  SendHorizontal,
  FileText,
  Download,
  PhoneCall,
} from "lucide-react";
import {
  getGroupMessages,
  sendGroupMessage,
  getMyGroups,
  leaveGroup,
  removeGroupMember,
  uploadFile,
} from "../lib/api";
import { useSocket } from "../hooks/useSocket";
import useAuthUser from "../hooks/useAuthUser";
import AddMembersModal from "../components/AddMembersModal";
import { isGroupMuted, setGroupMuted } from "../lib/mutedGroups";

const THEME_COLORS = [
  { name: "Indigo", color: "#4F46E5" },
  { name: "Red", color: "#EF4444" },
  { name: "Green", color: "#22C55E" },
  { name: "Blue", color: "#3B82F6" },
  { name: "Purple", color: "#8B5CF6" },
  { name: "Pink", color: "#EC4899" },
  { name: "Orange", color: "#F59E0B" },
  { name: "Teal", color: "#14B8A6" },
];

const readColor = (groupId) => {
  try {
    return localStorage.getItem(`group-color-${groupId}`) || THEME_COLORS[0].color;
  } catch {
    return THEME_COLORS[0].color;
  }
};

const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

const URL_RE = /(https?:\/\/[^\s]+)/g;

// Renders text with clickable links.
function RichText({ text }) {
  const parts = text.split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part.replace(/\*\*/g, "")}</span>
        )
      )}
    </span>
  );
}

function CallCard({ msg, onJoin, mine }) {
  const link = msg.text.match(URL_RE)?.[0] || "";
  const audioOnly = link.includes("audioOnly=true");
  let path = "";
  try {
    const u = new URL(link);
    path = u.pathname + u.search;
  } catch {
    /* malformed link */
  }

  return (
    <div className={`w-64 rounded-2xl p-4 shadow-sm ring-1 ${mine ? "bg-primary/10 ring-primary/30" : "bg-base-200 ring-base-300"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-11 place-items-center rounded-full text-white ${audioOnly ? "bg-emerald-500" : "bg-indigo-500"}`}>
          {audioOnly ? <Phone className="size-5" /> : <Video className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{audioOnly ? "Group audio call" : "Group video call"}</p>
          <p className="text-xs opacity-60 truncate">
            {mine ? "You started a call" : `${msg.sender?.fullName} started a call`}
          </p>
        </div>
      </div>
      {path && (
        <button
          onClick={() => onJoin(path)}
          className={`btn btn-sm w-full mt-3 gap-2 text-white border-0 ${audioOnly ? "bg-emerald-500 hover:bg-emerald-600" : "bg-indigo-500 hover:bg-indigo-600"}`}
        >
          <PhoneCall className="size-4" /> Join call
        </button>
      )}
    </div>
  );
}

function FileCard({ text, mine }) {
  const name = text.match(/\*\*(.+?)\*\*/)?.[1] || "File";
  const url = text.match(URL_RE)?.[0];
  const isImage = url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={name} className="max-w-[16rem] max-h-72 rounded-2xl object-cover ring-1 ring-base-300" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`flex w-64 items-center gap-3 rounded-2xl p-3 ring-1 transition hover:opacity-90 ${
        mine ? "bg-primary text-primary-content ring-primary" : "bg-base-200 ring-base-300"
      }`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/10">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <Download className="size-4 shrink-0 opacity-70" />
    </a>
  );
}

export default function GroupChatPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [muted, setMuted] = useState(() => isGroupMuted(groupId));
  const [groupColor, setGroupColor] = useState(() => readColor(groupId));
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setMuted(isGroupMuted(groupId));
    setGroupColor(readColor(groupId));
  }, [groupId]);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: getMyGroups,
  });
  const group = groups.find((g) => g._id === groupId);
  const members = useMemo(() => group?.members || [], [group]);
  const isAdmin = group && String(group.createdBy) === String(authUser?._id);
  const memberIds = useMemo(() => members.map((m) => m._id), [members]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["groupMessages", groupId],
    queryFn: () => getGroupMessages(groupId),
    enabled: !!groupId && !!group,
  });

  const { mutate: sendMsg, isPending } = useMutation({
    mutationFn: sendGroupMessage,
    onSuccess: (newMessage) => {
      queryClient.setQueryData(["groupMessages", groupId], (old = []) =>
        old.some((m) => m._id === newMessage._id) ? old : [...old, newMessage]
      );
    },
    onError: () => toast.error("Failed to send message"),
  });

  // Realtime: join the room (again after every reconnect) and listen.
  useEffect(() => {
    if (!socket || !groupId) return;

    const join = () => socket.emit("join_group", groupId);
    const onMessage = (msg) => {
      if (String(msg.group) !== String(groupId)) return;
      queryClient.setQueryData(["groupMessages", groupId], (old = []) =>
        old.some((m) => m._id === msg._id) ? old : [...old, msg]
      );
    };
    const onUpdated = ({ groupId: id }) => {
      if (String(id) === String(groupId)) queryClient.invalidateQueries({ queryKey: ["groups"] });
    };

    join();
    socket.on("connect", join);
    socket.on("new_group_message", onMessage);
    socket.on("group_updated", onUpdated);

    return () => {
      socket.emit("leave_group", groupId);
      socket.off("connect", join);
      socket.off("new_group_message", onMessage);
      socket.off("group_updated", onUpdated);
    };
  }, [socket, groupId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ---- actions ----
  const handleSend = (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || isPending) return;
    sendMsg({ groupId, text });
    setMessage("");
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    e.target.value = null;
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large! Max 10MB");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadFile(file);
      sendMsg({ groupId, text: `📎 **${result.file.filename}**\n\n📥 Download: ${result.file.url}` });
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const startCall = (audioOnly) => {
    const path = `/group-call/${groupId}${audioOnly ? "?audioOnly=true" : ""}`;
    const link = `${window.location.origin}${path}`;
    const text = audioOnly
      ? `🎙️ **${authUser?.fullName} started an Audio Call!** 🎙️\n\n📞 Click here to join: ${link}`
      : `🔴 **${authUser?.fullName} started a Video Call!** 🔴\n\n📞 Click here to join: ${link}`;

    sendMsg({ groupId, text });
    socket?.emit("call_invite", { groupId, callId: groupId, audioOnly });
    navigate(path);
  };

  const { mutate: doLeave, isPending: leaving } = useMutation({
    mutationFn: () => leaveGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.removeQueries({ queryKey: ["groupMessages", groupId] });
      toast.success(`You left ${group?.name || "the group"}`);
      navigate("/groups", { replace: true });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to leave group"),
  });

  const handleLeave = () => {
    const extra = isAdmin && members.length > 1 ? "\n\nAdmin rights will pass to another member." : "";
    const last = members.length === 1 ? "\n\nYou're the last member - the group will be deleted." : "";
    if (window.confirm(`Leave "${group?.name}"?${extra}${last}`)) doLeave();
  };

  const { mutate: doRemove } = useMutation({
    mutationFn: (memberId) => removeGroupMember(groupId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Member removed");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to remove member"),
  });

  const handleRemove = (member) => {
    if (window.confirm(`Remove ${member.fullName} from the group?`)) doRemove(member._id);
  };

  const toggleMute = () => {
    const next = !muted;
    setGroupMuted(groupId, next);
    setMuted(next);
    toast.success(next ? "Notifications muted" : "Notifications on");
  };

  const pickColor = (c) => {
    setGroupColor(c.color);
    try {
      localStorage.setItem(`group-color-${groupId}`, c.color);
    } catch {
      /* storage unavailable */
    }
    setShowColors(false);
    setShowMenu(false);
  };

  // ---- render ----
  if (groupsLoading || (group && isLoading)) {
    return (
      <div className="flex justify-center items-center h-[calc(100dvh-4rem)]">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[calc(100dvh-4rem)] p-6 text-center">
        <p className="text-lg font-semibold">You're not a member of this group</p>
        <button className="btn btn-primary" onClick={() => navigate("/groups")}>Back to groups</button>
      </div>
    );
  }

  const GroupAvatar = ({ size = "size-10", text = "text-base" }) => (
    <div className={`${size} ${text} shrink-0 rounded-full grid place-items-center font-bold text-white`} style={{ backgroundColor: groupColor }}>
      {group.name?.charAt(0)?.toUpperCase() || "G"}
    </div>
  );

  return (
    <div className="relative flex flex-col h-[calc(100dvh-4rem)] bg-base-100">
      {/* Header */}
      <header className="flex items-center gap-2 px-2 sm:px-4 py-2.5 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <button onClick={() => navigate("/groups")} className="btn btn-ghost btn-sm btn-circle" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>

        <button onClick={() => setShowInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-xl px-1 py-1 hover:bg-base-200 transition">
          <GroupAvatar />
          <div className="min-w-0">
            <h1 className="font-semibold truncate flex items-center gap-1.5">
              {group.name}
              {muted && <BellOff className="size-3.5 opacity-50" />}
            </h1>
            <p className="text-xs opacity-60 truncate">
              {members.map((m) => (m._id === authUser?._id ? "You" : m.fullName?.split(" ")[0])).join(", ")}
            </p>
          </div>
        </button>

        <button
          onClick={() => startCall(true)}
          className="btn btn-ghost btn-circle text-emerald-500 hover:bg-emerald-500/10"
          title="Start audio call"
          aria-label="Start audio call"
        >
          <Phone className="size-5" />
        </button>
        <button
          onClick={() => startCall(false)}
          className="btn btn-ghost btn-circle text-indigo-500 hover:bg-indigo-500/10"
          title="Start video call"
          aria-label="Start video call"
        >
          <Video className="size-5" />
        </button>

        <div className="relative">
          <button onClick={() => setShowMenu((v) => !v)} className="btn btn-ghost btn-circle" aria-label="More">
            <MoreVertical className="size-5" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => { setShowMenu(false); setShowColors(false); }} />
              <ul className="absolute right-0 top-full mt-1 z-40 menu w-56 rounded-2xl bg-base-100 p-2 shadow-2xl ring-1 ring-base-300">
                <li><button onClick={() => { setShowInfo(true); setShowMenu(false); }}><Info className="size-4" /> Group info</button></li>
                <li><button onClick={() => { setShowAddMembers(true); setShowMenu(false); }}><UserPlus className="size-4" /> Add members</button></li>
                <li>
                  <button onClick={() => { toggleMute(); setShowMenu(false); }}>
                    {muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                    {muted ? "Unmute notifications" : "Mute notifications"}
                  </button>
                </li>
                <li><button onClick={() => setShowColors((v) => !v)}><Palette className="size-4" /> Theme color</button></li>
                {showColors && (
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {THEME_COLORS.map((c) => (
                      <button
                        key={c.name}
                        title={c.name}
                        onClick={() => pickColor(c)}
                        className={`size-9 rounded-full ring-2 ring-offset-2 ring-offset-base-100 transition ${groupColor === c.color ? "ring-base-content" : "ring-transparent"}`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                )}
                <div className="divider my-1" />
                <li><button className="text-error" onClick={() => { setShowMenu(false); handleLeave(); }}><LogOut className="size-4" /> Leave group</button></li>
              </ul>
            </>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60 gap-2">
            <GroupAvatar size="size-16" text="text-2xl" />
            <p className="font-medium">No messages yet</p>
            <p className="text-sm">Say hello or start a call 👋</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const mine = msg.sender?._id === authUser?._id;
            const prev = messages[i - 1];
            const firstOfRun = !prev || prev.sender?._id !== msg.sender?._id;
            const isCall = msg.text?.includes("/group-call/");
            const isFile = msg.text?.startsWith("📎");

            return (
              <div key={msg._id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${firstOfRun ? "pt-3" : ""}`}>
                {!mine && (
                  <div className="w-8 shrink-0">
                    {firstOfRun && (
                      <img src={msg.sender?.profilePicture} alt="" className="size-8 rounded-full object-cover bg-base-300" />
                    )}
                  </div>
                )}
                <div className={`flex max-w-[78%] sm:max-w-[65%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && firstOfRun && (
                    <span className="mb-1 ml-1 text-xs font-medium" style={{ color: groupColor }}>
                      {msg.sender?.fullName}
                    </span>
                  )}
                  {isCall ? (
                    <CallCard msg={msg} mine={mine} onJoin={(path) => navigate(path)} />
                  ) : isFile ? (
                    <FileCard text={msg.text} mine={mine} />
                  ) : (
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-[15px] leading-snug ${
                        mine ? "text-white rounded-br-md" : "bg-base-200 rounded-bl-md"
                      }`}
                      style={mine ? { backgroundColor: groupColor } : undefined}
                    >
                      <RichText text={msg.text} />
                    </div>
                  )}
                  <span className="mt-0.5 px-1 text-[10px] opacity-40">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-base-300 bg-base-100">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-ghost btn-circle"
          title="Attach file"
          disabled={uploading}
        >
          {uploading ? <span className="loading loading-spinner loading-sm" /> : <Paperclip className="size-5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.txt,.mp4,.mp3,.zip"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          type="text"
          className="input input-bordered flex-1 rounded-full"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message…"
        />
        <button
          type="submit"
          className="btn btn-circle text-white border-0"
          style={{ backgroundColor: groupColor }}
          disabled={!message.trim() || isPending}
          aria-label="Send"
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>

      {/* Group info drawer */}
      {showInfo && (
        <>
          <div className="absolute inset-0 z-40 bg-black/40" onClick={() => setShowInfo(false)} />
          <aside className="absolute inset-y-0 right-0 z-50 w-full sm:w-96 bg-base-100 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-base-300">
              <h2 className="font-semibold">Group info</h2>
              <button onClick={() => setShowInfo(false)} className="btn btn-ghost btn-sm btn-circle" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <GroupAvatar size="size-24" text="text-4xl" />
                <h3 className="text-xl font-bold mt-2">{group.name}</h3>
                <p className="text-sm opacity-60">Group · {members.length} member{members.length !== 1 ? "s" : ""}</p>
                <div className="mt-4 grid grid-cols-3 gap-3 w-full">
                  {[
                    { label: "Audio", icon: <Phone className="size-5" />, onClick: () => startCall(true), tone: "text-emerald-500" },
                    { label: "Video", icon: <Video className="size-5" />, onClick: () => startCall(false), tone: "text-indigo-500" },
                    { label: "Add", icon: <UserPlus className="size-5" />, onClick: () => setShowAddMembers(true), tone: "text-primary" },
                  ].map((a) => (
                    <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-1.5 rounded-2xl bg-base-200 hover:bg-base-300 py-3 transition">
                      <span className={a.tone}>{a.icon}</span>
                      <span className="text-xs font-medium">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 pb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-50">{members.length} members</p>
              </div>
              <ul className="px-2">
                <li>
                  <button onClick={() => setShowAddMembers(true)} className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-base-200 transition">
                    <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <UserPlus className="size-5" />
                    </span>
                    <span className="font-medium text-primary">Add members</span>
                  </button>
                </li>
                {[...members]
                  .sort((a, b) => (String(b._id) === String(group.createdBy)) - (String(a._id) === String(group.createdBy)))
                  .map((m) => {
                    const me = m._id === authUser?._id;
                    const admin = String(m._id) === String(group.createdBy);
                    return (
                      <li key={m._id} className="group flex items-center gap-3 rounded-xl p-2.5 hover:bg-base-200 transition">
                        <img src={m.profilePicture} alt="" className="size-10 rounded-full object-cover bg-base-300" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{me ? "You" : m.fullName}</p>
                        </div>
                        {admin && (
                          <span className="badge badge-sm gap-1 badge-warning badge-outline">
                            <Crown className="size-3" /> Admin
                          </span>
                        )}
                        {isAdmin && !me && (
                          <button
                            onClick={() => handleRemove(m)}
                            className="btn btn-ghost btn-xs btn-circle text-error sm:opacity-0 sm:group-hover:opacity-100 transition"
                            title={`Remove ${m.fullName}`}
                            aria-label={`Remove ${m.fullName}`}
                          >
                            <UserMinus className="size-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>

              <div className="p-4 space-y-2 border-t border-base-300 mt-4">
                <button onClick={toggleMute} className="btn btn-ghost w-full justify-start gap-3">
                  {muted ? <Bell className="size-5" /> : <BellOff className="size-5" />}
                  {muted ? "Unmute notifications" : "Mute notifications"}
                </button>
                <button onClick={handleLeave} disabled={leaving} className="btn btn-ghost w-full justify-start gap-3 text-error">
                  {leaving ? <span className="loading loading-spinner loading-sm" /> : <LogOut className="size-5" />}
                  Leave group
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {showAddMembers && (
        <AddMembersModal
          groupId={groupId}
          groupName={group.name}
          existingMemberIds={memberIds}
          onClose={() => setShowAddMembers(false)}
        />
      )}
    </div>
  );
}
