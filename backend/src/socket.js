// backend/socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Group from "./models/Group.js";
import GroupMessage from "./models/GroupMessage.js";
import { isValidObjectId, containsId } from "./lib/validate.js";

const userSocketMap = new Map(); // userId -> socketId
let ioInstance = null;

// Lets REST controllers push realtime events. Returns null on serverless
// deployments where no socket server is running.
export const getIO = () => ioInstance;

// Pushes a new group message to everyone viewing the group, and a
// notification to every other member wherever they are in the app.
export const broadcastGroupMessage = (group, message) => {
  if (!ioInstance) return;
  const groupId = String(group._id);
  const senderId = String(message.sender?._id ?? message.sender);

  ioInstance.to(`group:${groupId}`).emit("new_group_message", message);

  (group.members || [])
    .map((m) => String(m?._id ?? m))
    .filter((id) => id !== senderId)
    .forEach((memberId) =>
      ioInstance.to(`user:${memberId}`).emit("group_notification", {
        groupId,
        groupName: group.name,
        message,
      })
    );
};

// Every socket joins a personal room, so this reaches all of a user's tabs.
export const emitToUser = (userId, event, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${String(userId)}`).emit(event, payload);
};

export const initializeSocket = (server) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:4173",
    process.env.CLIENT_URL,
    "https://finalprojectfrontend-flax.vercel.app",
    "https://kyauchatbox.vercel.app",
    /https:\/\/.*\.vercel\.app/,
  ].filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.some((pattern) =>
          typeof pattern === "string" ? pattern === origin : pattern.test(origin)
        );
        if (isAllowed) {
          callback(null, true);
        } else {
          console.log("❌ Socket CORS blocked origin:", origin);
          callback(null, true);
        }
      },
      credentials: true,
    },
  });

  // Reads the handshake token from every place a client might supply it.
  const readToken = (socket) => {
    const { auth = {}, headers = {}, query = {} } = socket.handshake;
    if (auth.token) return auth.token;
    if (query.token) return query.token;

    const authHeader = headers.authorization;
    if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

    const cookieHeader = headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)jwt=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  };

  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token = readToken(socket);
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      const userId = decoded.id || decoded._id || decoded.userId;
      
      const user = await User.findById(userId).select("-password");
      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      console.error("Socket Auth Error:", err.message);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    const userName = socket.user.fullName;
    userSocketMap.set(userId, socket.id);
    socket.join(`user:${userId}`);
    console.log(`✅ User connected: ${userName} (${userId})`);
    
    socket.broadcast.emit("user_online", userId);

    // ============ GROUP CHAT ============
    // Membership is verified here so a client cannot subscribe to - or post
    // into - a group room it does not belong to.
    const assertMember = async (groupId) => {
      if (!isValidObjectId(groupId)) return null;
      const group = await Group.findById(groupId).select("members name");
      if (!group || !containsId(group.members, socket.user._id)) return null;
      return group;
    };

    socket.on("join_group", async (groupId) => {
      const group = await assertMember(groupId);
      if (!group) {
        console.log(`⛔ ${userName} denied join for group: ${groupId}`);
        socket.emit("group_error", { groupId, message: "Not a member of this group" });
        return;
      }
      socket.join(`group:${groupId}`);
      socket.currentGroupId = groupId;
      console.log(`📌 ${userName} joined group: ${groupId}`);
    });

    socket.on("leave_group", (groupId) => {
      socket.leave(`group:${groupId}`);
      console.log(`🚪 ${userName} left group: ${groupId}`);
    });

    socket.on("group_message", async (data, callback) => {
      try {
        const { groupId, text } = data || {};

        if (!text || !text.trim()) {
          if (callback) callback({ status: "error", message: "Message text required" });
          return;
        }

        const group = await assertMember(groupId);
        if (!group) {
          console.log(`⛔ ${userName} denied post to group: ${groupId}`);
          if (callback) callback({ status: "error", message: "Not a member of this group" });
          return;
        }

        const message = await GroupMessage.create({
          group: groupId,
          sender: socket.user._id,
          text,
        });

        const populatedMsg = await message.populate("sender", "fullName profilePicture");
        broadcastGroupMessage(group, populatedMsg);
        
        if (callback) callback({ status: "sent" });
      } catch (err) {
        console.error("Msg Error:", err);
        if (callback) callback({ status: "error", message: "Failed to send message" });
      }
    });

    // ============ CALL INVITES (ringing) ============
    // The media itself goes through Stream Video; these events only ring the
    // other side and report declines back to the caller.
    const caller = {
      _id: userId,
      fullName: socket.user.fullName,
      profilePicture: socket.user.profilePicture,
    };

    socket.on("call_invite", async (data = {}) => {
      try {
        const { groupId, targetUserId, callId, audioOnly = false } = data;
        if (!callId || typeof callId !== "string") return;

        if (groupId) {
          if (!isValidObjectId(groupId)) return;
          const group = await Group.findById(groupId).select("members name");
          if (!group || !containsId(group.members, userId)) return;

          group.members
            .map(String)
            .filter((id) => id !== userId)
            .forEach((memberId) =>
              emitToUser(memberId, "incoming_call", {
                callId,
                groupId,
                groupName: group.name,
                audioOnly: Boolean(audioOnly),
                isGroup: true,
                caller,
              })
            );
          return;
        }

        if (targetUserId && isValidObjectId(targetUserId) && targetUserId !== userId) {
          emitToUser(targetUserId, "incoming_call", {
            callId,
            audioOnly: Boolean(audioOnly),
            isGroup: false,
            caller,
          });
        }
      } catch (err) {
        console.error("call_invite error:", err.message);
      }
    });

    socket.on("call_decline", ({ callerId, callId } = {}) => {
      if (!callerId || !isValidObjectId(callerId)) return;
      emitToUser(callerId, "call_declined", { callId, by: caller });
    });

    socket.on("call_cancel", ({ targetUserId, callId } = {}) => {
      if (!targetUserId || !isValidObjectId(targetUserId)) return;
      emitToUser(targetUserId, "call_cancelled", { callId, by: caller });
    });

    // ============ GROUP CALL (8-PERSON SUPPORT) ============
    
    socket.on("join_group_call", async ({ groupId, userId, name }) => {
      if (!(await assertMember(groupId))) {
        console.log(`⛔ ${userName} denied call join for group: ${groupId}`);
        socket.emit("group_error", { groupId, message: "Not a member of this group" });
        return;
      }

      console.log(`🎥 ${name} JOINED call: ${groupId}`);
      socket.join(`call:${groupId}`);
      socket.callData = { groupId, userId, name };
      
      // Get ALL existing participants
      const room = io.sockets.adapter.rooms.get(`call:${groupId}`);
      const existingParticipants = [];
      
      if (room) {
        for (const socketId of room) {
          const participantSocket = io.sockets.sockets.get(socketId);
          if (participantSocket && participantSocket.callData && participantSocket.callData.userId !== userId) {
            existingParticipants.push({
              userId: participantSocket.callData.userId,
              name: participantSocket.callData.name
            });
          }
        }
      }
      
      // Send existing participants to new user
      if (existingParticipants.length > 0) {
        socket.emit("existing_participants", existingParticipants);
        console.log(`📋 Sent ${existingParticipants.length} existing participants to ${name}`);
      }
      
      // Notify others about new user
      socket.to(`call:${groupId}`).emit("user_joined", { userId, name });
      
      // Update participant count
      const updatedRoom = io.sockets.adapter.rooms.get(`call:${groupId}`);
      const participantCount = updatedRoom ? updatedRoom.size : 1;
      io.to(`call:${groupId}`).emit("participant_count", participantCount);
      
      console.log(`📊 Call ${groupId} now has ${participantCount} participants`);
    });

    socket.on("leave_group_call", ({ groupId, userId }) => {
      console.log(`🎥 User ${userId} LEFT call: ${groupId}`);
      socket.leave(`call:${groupId}`);
      socket.to(`call:${groupId}`).emit("user_left", userId);
      
      const room = io.sockets.adapter.rooms.get(`call:${groupId}`);
      const participantCount = room ? room.size : 0;
      io.to(`call:${groupId}`).emit("participant_count", participantCount);
      
      delete socket.callData;
    });

    // WebRTC Signaling
    socket.on("offer", ({ to, offer }) => {
      const targetSocketId = userSocketMap.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("offer", { 
          from: socket.callData?.userId || socket.user._id,
          fromName: socket.callData?.name || socket.user.fullName,
          offer 
        });
      }
    });

    socket.on("answer", ({ to, answer }) => {
      const targetSocketId = userSocketMap.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("answer", { 
          from: socket.callData?.userId || socket.user._id,
          answer 
        });
      }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      const targetSocketId = userSocketMap.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("ice-candidate", { 
          from: socket.callData?.userId || socket.user._id,
          candidate 
        });
      }
    });

    socket.on("disconnect", () => {
      if (socket.callData) {
        socket.to(`call:${socket.callData.groupId}`).emit("user_left", socket.callData.userId);
      }
      userSocketMap.delete(userId);
      socket.broadcast.emit("user_offline", userId);
      console.log(`🔴 User disconnected: ${userName} (${userId})`);
    });
  });

  return io;
};