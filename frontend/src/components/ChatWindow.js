import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { API_BASE_URL } from "../config";
import { encryptWithAES, decryptWithAES } from "../utils/encryption";

function ChatWindow({ username, recipient }) {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const chatEndRef = useRef(null);
  const decryptCacheRef = useRef(new Map());

  const decrypt = (text) => {
    const cache = decryptCacheRef.current;
    if (cache.has(text)) return cache.get(text);
    let out;
    try {
      const parsed = JSON.parse(atob(text));
      const sharedKey = CryptoJS.enc.Base64.parse(parsed.key);
      const decrypted = decryptWithAES(parsed.ciphertext, sharedKey, parsed.iv);
      out = decrypted || "(decryption failed)";
    } catch {
      out = "(decryption failed)";
    }
    cache.set(text, out);
    return out;
  };

  const formatTimestamp = (isoString) => {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === y.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    if (isToday) return `Today at ${time}`;
    if (isYesterday) return `Yesterday at ${time}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
  };

  const fetchMessages = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/chat/${username}/${recipient}`);
      const serverMessages = res.data;
      setPending((old) => old.filter((p) => !serverMessages.some((s) => s.message === p.message)));
      setMessages(serverMessages);
    } catch (err) {
      console.error("Failed to fetch messages", err);
    }
  }, [username, recipient]);

  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, 3000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  const combined = [...messages, ...pending];
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [combined.length]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      await axios.post(`${API_BASE_URL}/ensure-keys`, {
        usernames: [username, recipient],
      });

      const encKeyRes = await axios.post(`${API_BASE_URL}/encrypt-key`, {
        username: recipient,
      });

      const encryptedKeyB64 = encKeyRes.data.encrypted_key;                
      const sharedKeyWords = CryptoJS.enc.Base64.parse(encKeyRes.data.shared_key); 

      const { ciphertext, iv } = encryptWithAES(newMessage, sharedKeyWords);

      const payload = { ciphertext, iv, key: encKeyRes.data.shared_key };
      const encodedPayload = btoa(JSON.stringify(payload));

      const localMsg = {
        sender: username,
        recipient,
        message: encodedPayload,
        timestamp: new Date().toISOString(),
      };
      decryptCacheRef.current.set(encodedPayload, newMessage);
      setPending((prev) => [...prev, localMsg]);
      setNewMessage("");

      console.log("encrypted_key b64 length:", encryptedKeyB64.length);
      console.log("shared_key  b64 length:", encKeyRes.data.shared_key.length);

      await axios.post(`${API_BASE_URL}/send`, {
        sender: username,
        recipient,
        message: encodedPayload,
        encrypted_key: encryptedKeyB64, 
      });
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  return (
    <div className="h-full max-h-screen flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-black">
        {combined.map((msg, idx) => {
          const isMine = msg.sender === username;
          return (
            <div key={`${msg.message}-${idx}`} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xs px-4 py-2 rounded-lg ${isMine ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"}`}>
                <div className="text-sm">{decrypt(msg.message)}</div>
                <div className="text-xs text-gray-300 mt-1 text-right">{formatTimestamp(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="shrink-0 border-t border-gray-700 p-3 bg-gray-950">
        <div className="flex">
          <input
            type="text"
            className="flex-1 bg-gray-800 text-white p-2 rounded-l-lg border border-gray-600 focus:outline-none"
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r-lg">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatWindow;
