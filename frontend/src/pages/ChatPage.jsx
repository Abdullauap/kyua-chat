// frontend/src/pages/ChatPage.jsx
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";
import {
  Channel,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";
import ChatLoader from "../components/ChatLoader";
import { FaPaperclip, FaImage } from "react-icons/fa";
import { ArrowLeft, Phone, Video } from "lucide-react";
import { useSocket } from "../hooks/useSocket";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY || "xgqw23kv3tdt";

let globalClient = null;

// Replaces Stream's ChannelHeader so the call buttons sit inside the header
// instead of floating over it (where they ended up hidden).
function ChatHeader({ channel, authUser, onAudioCall, onVideoCall, onBack }) {
  const [, force] = useState(0);

  useEffect(() => {
    const sub = channel.on("user.presence.changed", () => force((n) => n + 1));
    const sub2 = channel.on("member.updated", () => force((n) => n + 1));
    return () => {
      sub.unsubscribe();
      sub2.unsubscribe();
    };
  }, [channel]);

  const other = Object.values(channel.state.members || {}).find(
    (m) => m.user_id !== authUser?._id
  )?.user;
  const online = Boolean(other?.online);
  const lastSeen = other?.last_active
    ? new Date(other.last_active).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="flex items-center gap-2 px-2 sm:px-4 py-2.5 border-b border-base-300 bg-base-100">
      <button onClick={onBack} className="btn btn-ghost btn-sm btn-circle" aria-label="Back">
        <ArrowLeft className="size-5" />
      </button>
      <div className="relative shrink-0">
        <img
          src={other?.image}
          alt={other?.name}
          className="size-10 rounded-full object-cover bg-base-300"
        />
        {online && (
          <span className="absolute bottom-0 right-0 size-3 rounded-full bg-success ring-2 ring-base-100" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{other?.name || "Chat"}</p>
        <p className={`text-xs truncate ${online ? "text-success" : "opacity-60"}`}>
          {online ? "Online" : lastSeen ? `Last seen ${lastSeen}` : "Offline"}
        </p>
      </div>
      <button
        onClick={onAudioCall}
        className="btn btn-ghost btn-circle text-emerald-500 hover:bg-emerald-500/10"
        title="Audio call"
        aria-label="Audio call"
      >
        <Phone className="size-5" />
      </button>
      <button
        onClick={onVideoCall}
        className="btn btn-ghost btn-circle text-indigo-500 hover:bg-indigo-500/10"
        title="Video call"
        aria-label="Video call"
      >
        <Video className="size-5" />
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { id: targetUserId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  const { socket } = useSocket();
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const fileInputRef = useRef(null);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    const initChat = async () => {
      if (!tokenData?.token || !authUser || !targetUserId) {
        console.log("⏳ Waiting for auth/token...");
        return;
      }

      try {
        console.log("🚀 Initializing 1-on-1 chat...");
        
        if (!globalClient) {
          globalClient = StreamChat.getInstance(STREAM_API_KEY);
          console.log("✅ StreamChat instance created");
        }

        await globalClient.connectUser(
          {
            id: authUser._id,
            name: authUser.fullName,
            image: authUser.profilePicture,
          },
          tokenData.token
        );
        console.log("✅ User connected to Stream");

        const channelId = [authUser._id, targetUserId].sort().join("-");
        console.log("📌 Channel ID:", channelId);

        const currChannel = globalClient.channel("messaging", channelId, {
          members: [authUser._id, targetUserId],
        });

        await currChannel.watch();
        console.log("✅ Channel watched");

        await currChannel.markRead();
        console.log("✅ Channel marked as read");

        // Get messages
        const state = currChannel.state;
        const channelMessages = state.messages || [];
        setMessages(channelMessages);
        console.log("📨 Messages loaded:", channelMessages.length);

        // Listen for new messages
        currChannel.on("message.new", (event) => {
          console.log("📨 New message received:", event.message);
          setMessages((prev) => [...prev, event.message]);
        });

        setChatClient(globalClient);
        setChannel(currChannel);
      } catch (error) {
        console.error("❌ Chat initialization error:", error);
        toast.error("Chat connection failed");
      } finally {
        setLoading(false);
      }
    };

    initChat();
  }, [tokenData, authUser, targetUserId]);

  // Starts a 1-on-1 call: drops a link in the chat (fallback / history),
  // rings the other person, and opens the call screen.
  const startCall = (audioOnly) => {
    if (!channel) {
      toast.error("Chat is not ready yet");
      return;
    }
    const callId = channel.id;
    const path = `/call/${callId}${audioOnly ? "?audioOnly=true" : ""}`;
    const callUrl = `${window.location.origin}${path}`;

    channel
      .sendMessage({
        text: audioOnly ? `🎙️ Join audio call: ${callUrl}` : `📞 Join video call: ${callUrl}`,
      })
      .catch(() => {});
    socket?.emit("call_invite", { targetUserId, callId, audioOnly });
    navigate(path);
  };

  // File upload handler
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large! Max 10MB");
      return;
    }

    try {
      const { uploadFile } = await import("../lib/api");
      const result = await uploadFile(file);
      
      const fileMessage = `📎 **${result.file.filename}**\n\n📥 Download: ${result.file.url}`;
      await channel.sendMessage({ text: fileMessage });
      
      toast.success("File shared!");
    } catch (error) {
      console.error("File upload error:", error);
      toast.error("Failed to upload file");
    }
    e.target.value = null;
  };

  if (loading) {
    return <ChatLoader />;
  }

  if (!chatClient || !channel) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-error">Failed to load chat</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-4rem)] relative">
      <Chat client={chatClient}>
        <Channel channel={channel}>
          <Window>
            <ChatHeader
              channel={channel}
              authUser={authUser}
              onAudioCall={() => startCall(true)}
              onVideoCall={() => startCall(false)}
              onBack={() => navigate(-1)}
            />
            <MessageList />
            <div className="p-2 border-t flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-ghost btn-sm btn-circle"
                title="Upload file"
              >
                <FaPaperclip className="size-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-ghost btn-sm btn-circle"
                title="Upload image"
              >
                <FaImage className="size-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.txt,.mp4,.mp3,.zip"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <MessageInput />
          </Window>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
}