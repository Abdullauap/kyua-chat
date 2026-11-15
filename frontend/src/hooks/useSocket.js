// frontend/src/hooks/useSocket.js
//
// One socket for the whole app. Components subscribe to it; unmounting a
// component no longer tears the shared connection down (it used to, which
// silently killed realtime updates for every other component).
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getToken } from "../lib/authToken";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";

let socket = null;
let socketToken = null;

const ensureSocket = () => {
  const token = getToken();
  if (!token) return null;
  if (socket && socketToken === token) return socket;

  if (socket) socket.disconnect();

  socketToken = token;
  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on("connect_error", (error) => {
    console.error("❌ Socket connection error:", error.message);
  });

  return socket;
};

// Called on logout so the next user gets a fresh, correctly-authed socket.
export const disconnectSocket = () => {
  if (socket) socket.disconnect();
  socket = null;
  socketToken = null;
};

export const useSocket = () => {
  const [socketInstance, setSocketInstance] = useState(() => ensureSocket());
  const [isConnected, setIsConnected] = useState(() => Boolean(socket?.connected));

  useEffect(() => {
    const s = ensureSocket();
    setSocketInstance(s);
    if (!s) return;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    setIsConnected(s.connected);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: socketInstance, isConnected };
};
