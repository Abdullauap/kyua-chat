// frontend/src/hooks/useStreamCall.js
//
// Creates a Stream Video client, joins `callId`, and always leaves + disconnects
// on unmount. The join is deferred one tick so React StrictMode's
// mount -> unmount -> mount in development does not join twice.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StreamVideoClient, CallingState } from "@stream-io/video-react-sdk";
import { getStreamToken } from "../lib/api";
import useAuthUser from "./useAuthUser";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY || "xgqw23kv3tdt";

export default function useStreamCall({ callId, audioOnly = false }) {
  const { authUser } = useAuthUser();
  const [state, setState] = useState({ client: null, call: null, error: null });

  const { data: tokenData, error: tokenError } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    if (!authUser || !tokenData?.token || !callId) return;

    let cancelled = false;
    let client = null;
    let call = null;
    let joinPromise = null;

    const join = async () => {
      client = new StreamVideoClient({
        apiKey: STREAM_API_KEY,
        user: { id: authUser._id, name: authUser.fullName, image: authUser.profilePicture },
        token: tokenData.token,
      });
      call = client.call("default", callId);

      try {
        // Turn the camera off before joining so it never flashes on.
        if (audioOnly) await call.camera.disable();
        await call.join({ create: true });
        if (cancelled) return;

        if (audioOnly) {
          await call.camera.disable();
        } else {
          await call.camera.enable().catch(() => {});
        }
        await call.microphone.enable().catch(() => {});

        setState({ client, call, error: null });
      } catch (error) {
        console.error("Join call error:", error);
        if (!cancelled) setState({ client: null, call: null, error });
      }
    };

    const timer = setTimeout(() => {
      joinPromise = join();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!joinPromise) return;
      joinPromise.finally(async () => {
        try {
          if (call && call.state.callingState !== CallingState.LEFT) await call.leave();
        } catch {
          /* already left */
        }
        client?.disconnectUser().catch(() => {});
      });
    };
  }, [authUser, tokenData?.token, callId, audioOnly]);

  return { ...state, error: state.error || tokenError };
}
