// dwelio-backend/socket/chatSocket.js

function setupChatSocket(io) {
  console.log("🔌 Chat Socket initialized");

  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    // ========================
    // JOIN CONVERSATION
    // ========================
    socket.on("join_conversation", (conversationId) => {
      if (!conversationId) return;

      const room = `conversation_${conversationId}`;
      socket.join(room);

      console.log(`➡️  Socket ${socket.id} joined ${room}`);
    });

    // ========================
    // LEAVE CONVERSATION
    // ========================
    socket.on("leave_conversation", (conversationId) => {
      if (!conversationId) return;

      const room = `conversation_${conversationId}`;
      socket.leave(room);

      console.log(`⬅️  Socket ${socket.id} left ${room}`);
    });

    // ========================
    // SEND MESSAGE (Text + Media)
    // ========================
    socket.on("send_message", (data) => {
      if (!data || !data.conversation_id) return;

      // At least text or media must exist
      if (!data.text && !data.media_url) return;

      const room = `conversation_${data.conversation_id}`;

      const payload = {
        id: data.id || Date.now(),
        conversation_id: Number(data.conversation_id),
        sender_id: Number(data.sender_id),
        text: data.text || null,
        type: data.type || "text",          // text | image | video
        media_url: data.media_url || null,
        is_read: false,
        created_at: data.created_at || new Date().toISOString(),
      };

      // Broadcast to everyone in the room (including sender for confirmation)
      io.to(room).emit("new_message", payload);

      // Log nicely
      if (payload.type === "image") {
        console.log(`🖼️  Image → ${room}`);
      } else if (payload.type === "video") {
        console.log(`🎥 Video → ${room}`);
      } else {
        console.log(`💬 Text → ${room}:`, payload.text);
      }
    });

    // ========================
    // MARK MESSAGES AS READ
    // ========================
    socket.on("mark_as_read", (data) => {
      if (!data || !data.conversation_id) return;

      const room = `conversation_${data.conversation_id}`;
      io.to(room).emit("messages_read", {
        conversation_id: data.conversation_id,
        user_id: data.user_id || null,
      });

      console.log(`👁️  Messages read in ${room}`);
    });

    // ========================
    // TYPING INDICATORS (optional but useful)
    // ========================
    socket.on("typing_start", (data) => {
      if (!data?.conversation_id) return;
      const room = `conversation_${data.conversation_id}`;
      socket.to(room).emit("user_typing", {
        conversation_id: data.conversation_id,
        user_id: data.user_id,
        isTyping: true,
      });
    });

    socket.on("typing_stop", (data) => {
      if (!data?.conversation_id) return;
      const room = `conversation_${data.conversation_id}`;
      socket.to(room).emit("user_typing", {
        conversation_id: data.conversation_id,
        user_id: data.user_id,
        isTyping: false,
      });
    });

    // ========================
    // DISCONNECT
    // ========================
    socket.on("disconnect", (reason) => {
      console.log(`❌ User disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = setupChatSocket;