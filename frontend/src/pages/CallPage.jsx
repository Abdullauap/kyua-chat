// frontend/src/pages/CallPage.jsx - 1-on-1 audio / video call
import { useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StreamVideo, StreamCall } from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import useAuthUser from "../hooks/useAuthUser";
import useStreamCall from "../hooks/useStreamCall";
import { useSocket } from "../hooks/useSocket";
import { getUserFriends } from "../lib/api";
import CallRoom, { CallStatusScreen } from "../components/call/CallRoom";

export default function CallPage() {
  const { id: callId } = useParams();
  const [searchParams] = useSearchParams();
  const audioOnly = searchParams.get("audioOnly") === "true";
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  const { socket } = useSocket();
  const { client, call, error } = useStreamCall({ callId, audioOnly });

  // 1-on-1 call ids are "<idA>-<idB>"; the one that is not us is the peer.
  const peerId = callId?.split("-").find((id) => id !== authUser?._id);
  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
    enabled: !!authUser,
  });
  const peer = friends.find((f) => f._id === peerId);

  const handleLeave = useCallback(
    async ({ peerJoined } = {}) => {
      // Stop the other side ringing if they never picked up.
      if (!peerJoined && peerId) socket?.emit("call_cancel", { targetUserId: peerId, callId });
      try {
        await call?.leave();
      } catch {
        /* already left */
      }
      navigate(peerId ? `/chat/${peerId}` : "/", { replace: true });
    },
    [call, callId, navigate, peerId, socket]
  );

  if (error) return <CallStatusScreen error onBack={() => navigate(-1)} />;
  if (!client || !call) {
    return <CallStatusScreen message={peer ? `Calling ${peer.fullName}…` : "Connecting…"} />;
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <CallRoom audioOnly={audioOnly} peer={peer} onLeave={handleLeave} />
      </StreamCall>
    </StreamVideo>
  );
}
