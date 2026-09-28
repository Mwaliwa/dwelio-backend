// dwelio-backend/socket/chatSocket.js

function setupChatSocket(io) {
  console.log("🔌 Chat Socket initialized");

  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    // Join a conversation room
    socket.on("join_conversation", (conversationId) => {
      if (!conversationId) return;
      const room = `conversation_${conversationId}`;
      socket.join(room);
      console.log(`➡️  Socket ${socket.id} joined ${room}`);
    });

    // Leave a conversation room
    socket.on("leave_conversation", (conversationId) => {
      if (!conversationId) return;
      const room = `conversation_${conversationId}`;
      socket.leave(room);
      console.log(`⬅️  Socket ${socket.id} left ${room}`);
    });

    // Send a new message (realtime)
    socket.on("send_message", (data) => {
      if (!data || !data.conversation_id || !data.text) return;

      const room = `conversation_${data.conversation_id}`;

      // Broadcast to everyone in the room
      io.to(room).emit("new_message", {
        id: data.id || Date.now(),
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        text: data.text,
        created_at: data.created_at || new Date().toISOString(),
        is_read: false,
      });

      console.log(`💬 Message → ${room}:`, data.text);
    });

    // Mark messages as read
    socket.on("mark_as_read", (data) => {
      if (!data || !data.conversation_id) return;

      const room = `conversation_${data.conversation_id}`;
      io.to(room).emit("messages_read", data);
      console.log(`👁️  Messages read in ${room}`);
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
    });
  });
}

module.exports = setupChatSocket;