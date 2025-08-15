import axios from "axios";
import LogoutButton from "./LogoutButton";
import { API_BASE_URL } from "../config";

function ChatSidebar({ username, onSelectUser, selectedUser, onlineUsers, contacts, setContacts }) {

  const handleStartNewChat = async () => {
    const input = prompt("Enter username to start a chat with:");
    if (!input || input.trim() === "") return;

    const cleaned = input.trim();
    const cleanedLower = cleaned.toLowerCase();
    const usernameLower = username.toLowerCase();

    if (cleanedLower === usernameLower) return;

    const existingContact = contacts.find(
      (u) => u.toLowerCase() === cleanedLower
    );

    if (existingContact) {
      onSelectUser(existingContact); 
      return;
    }

    try {
      const res = await axios.get(
        `${API_BASE_URL}/users/${cleaned}`
      );

      if (res.status === 200 && res.data.exists) {
        const trueCasedUsername = res.data.username || cleaned; 

        setContacts((prev) => [...prev, trueCasedUsername]);
        onSelectUser(trueCasedUsername);
      }
    } catch (err) {
      alert("User does not exist.");
    }
  };

  return (
    <div
      style={{
        width: "250px",
        display: "flex",
        flexDirection: "column",
        height: "100vh", 
        borderRight: "1px solid #ccc",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* 🔝 Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-xl font-bold">Chats</h2>
        <button
          onClick={handleStartNewChat}
          title="Start new chat"
          className="bg-gray-700 hover:bg-gray-600 text-white text-lg w-8 h-8 rounded-full flex items-center justify-center"
        >
          +
        </button>
      </div>

      {/* 📜 Contact List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 text-white text-sm">
        {contacts.map((user) => (
          <li
            key={user}
            onClick={() => onSelectUser(user)}
            className={`group list-none flex items-center justify-between px-3 py-2 rounded-md cursor-pointer
        ${user === selectedUser ? "bg-gray-700" : "hover:bg-gray-800"}`}
          >
            {/* Left side: name + online dot */}
            <div className="flex items-center space-x-2 overflow-hidden">
              <span className="truncate">{user}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${onlineUsers.includes(user) ? "bg-green-400" : "bg-gray-500"
                  }`}
              ></span>
            </div>

            {/* Right side: 'X' button only on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setContacts((prev) => prev.filter((u) => u !== user));
                if (user === selectedUser) {
                  onSelectUser(null);
                }
              }}
              className="text-gray-400 hover:text-red-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove from sidebar"
            >
              ×
            </button>
          </li>
        ))}
      </div>



      {/* ⬇️ Logout */}
      <div className="p-4 border-t border-gray-700">
        <LogoutButton
          onLogout={() => {
            localStorage.removeItem("username");
            window.location.reload();
          }}
        />
      </div>
    </div>
  );
}

export default ChatSidebar;
