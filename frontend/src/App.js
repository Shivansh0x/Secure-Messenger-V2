import React, { useState, useEffect } from "react";
import LoginForm from "./components/LoginForm";
import ChatSidebar from "./components/ChatSidebar";
import ChatWindow from "./components/ChatWindow";
import { io } from "socket.io-client";
import { SOCKET_URL } from "./config";

const socket = io(SOCKET_URL);

const loadStoredContacts = (username) => {
  const data = localStorage.getItem(`contacts-${username}`);
  return data ? JSON.parse(data) : [];
};

const saveStoredContacts = (username, contacts) => {
  localStorage.setItem(`contacts-${username}`, JSON.stringify(contacts));
};

function App() {
  const [username, setUsername] = useState(localStorage.getItem("username"));
  const [selectedUser, setSelectedUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [contacts, setContacts] = useState(() =>
    username ? loadStoredContacts(username) : []
  );

  useEffect(() => {
    const handleOnlineUsersUpdate = (data) => {
      setOnlineUsers(data);
    };

    socket.on("update_online_users", handleOnlineUsersUpdate);

    socket.on("connect", () => {
      if (username) {
        socket.emit("user_connected", { username });
      }
    });

    if (username) {
      socket.emit("user_connected", { username });
    }

    return () => {
      socket.off("update_online_users", handleOnlineUsersUpdate);
      socket.off("connect");
    };
  }, [username]);

  useEffect(() => {
    if (username) {
      saveStoredContacts(username, contacts);
    }
  }, [contacts, username]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white font-sans">
      {username ? (
        <div style={{ display: "flex", height: "100vh" }}>
          <ChatSidebar
            username={username}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            onlineUsers={onlineUsers}
            contacts={contacts}
            setContacts={setContacts}
          />

          <div className="flex-1 flex flex-col">
            {selectedUser ? (
              <>
                <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    Chat with {selectedUser}
                  </h2>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      onlineUsers.includes(selectedUser)
                        ? "bg-green-400"
                        : "bg-gray-500"
                    }`}
                  />
                </div>
                <ChatWindow username={username} recipient={selectedUser} />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                Select a user from the sidebar to start chatting.
              </div>
            )}
          </div>
        </div>
      ) : (
        <LoginForm
          onLogin={(u) => {
            setUsername(u);
            setContacts(loadStoredContacts(u));
          }}
        />
      )}
    </div>
  );
}

export default App;
