// frontend/src/pages/GroupCallPage.jsx - group audio / video call
import { useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StreamVideo, StreamCall } from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import useStreamCall from "../hooks/useStreamCall";
import { getMyGroups } from "../lib/api";
import CallRoom, { CallStatusScreen } from "../components/call/CallRoom";

export default function GroupCallPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const audioOnly = searchParams.get("audioOnly") === "true";
  const { client, call, error } = useStreamCall({ callId: groupId, audioOnly });

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: getMyGroups });
  const group = groups.find((g) => g._id === groupId);

  const handleLeave = useCallback(async () => {
    try {
      await call?.leave();
    } catch {
      /* already left */
    }
    navigate(`/groups/${groupId}`, { replace: true });
  }, [call, groupId, navigate]);

  if (error) return <CallStatusScreen error onBack={() => navigate(`/groups/${groupId}`)} />;
  if (!client || !call) {
    return <CallStatusScreen message={`Joining ${group?.name ? `${group.name} ` : ""}call…`} />;
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <CallRoom
          title={group?.name || "Group call"}
          audioOnly={audioOnly}
          isGroup
          peer={group ? { fullName: group.name } : undefined}
          onLeave={handleLeave}
        />
      </StreamCall>
    </StreamVideo>
  );
}
