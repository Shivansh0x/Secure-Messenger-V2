import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { io } from "socket.io-client";
import { API_BASE_URL } from "../config";
import { encryptWithAES } from "../utils/encryption";

const decapBatch = async (decapUsername, encryptedKeys, API_BASE_URL) => {
  const { data } = await axios.post(
    `${API_BASE_URL}/decapsulate-batch`,
    { username: decapUsername, encrypted_keys: encryptedKeys },
    { timeout: 8000 }
  );
  return data?.results || {};
};

const axiosPostWithTimeout = (url, data, timeoutMs = 6000) =>
  axios.post(url, data, { timeout: timeoutMs });

const canNotify = () =>
  "Notification" in window && Notification.permission === "granted";

const showNativeNotification = (title, body) => {
  try {
    new Notification(title, {
      body,
      tag: `${title}-${Date.now()}`,
      renotify: false,
      silent: false,
    });
  } catch {}
};

function ChatWindow({ username, recipient }) {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const chatEndRef = useRef(null);
  const socketRef = useRef(null);

  const pendingRef = useRef(pending);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  const keyCacheRef = useRef(new Map());
  const decryptCacheRef = useRef(new Map());

  const inflightPayloadsRef = useRef(new Set());
  const lastSendTsRef = useRef(0);

  const [plainByKey, setPlainByKey] = useState(() => new Map());
  const plainByKeyRef = useRef(plainByKey);
  useEffect(() => { plainByKeyRef.current = plainByKey; }, [plainByKey]);

  const keyFor = (m) =>
    m.id != null ? `id:${m.id}` : (m.client_ts != null ? `local:${m.client_ts}` : `msg:${m.message}`);

  // --------- Decrypt helper (async) ---------
  const decrypt = async (text, encryptedKeyB64, decapUsername) => {
    const pCache = decryptCacheRef.current;
    if (pCache.has(text)) return pCache.get(text);

    let out;
    try {
      const payload = JSON.parse(atob(text));
      const { ciphertext, iv, key } = payload;

      let sharedKeyB64 = key; 

      if (!sharedKeyB64) {
        if (!encryptedKeyB64) throw new Error("Missing wrapped key for Kyber decapsulation");
        const kCache = keyCacheRef.current;
        if (kCache.has(encryptedKeyB64)) {
          sharedKeyB64 = kCache.get(encryptedKeyB64);
        } else {
          const res = await axiosPostWithTimeout(`${API_BASE_URL}/decapsulate`, {
            username: decapUsername,
            encrypted_key: encryptedKeyB64,
          }, 6000);
          sharedKeyB64 = res.data.shared_key;
          kCache.set(encryptedKeyB64, sharedKeyB64);
        }
      }

      const keyWA = CryptoJS.enc.Base64.parse(sharedKeyB64);
      const ivWA = CryptoJS.enc.Base64.parse(iv);
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(ciphertext),
      });
      const bytes = CryptoJS.AES.decrypt(cipherParams, keyWA, {
        iv: ivWA,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      out = bytes.toString(CryptoJS.enc.Utf8);
      if (!out) out = "(decryption failed)";
    } catch {
      out = "(decryption failed)";
    }

    pCache.set(text, out);
    return out;
  };

  // --------- Formatting ---------
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

  // --------- Fetch thread (initial hydrate only) ---------
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
  }, [fetchMessages]);

  // --------- Socket.IO wiring ---------
  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ["websocket"], withCredentials: false });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("user_connected", { username });
    });

    socket.on("new_message", async (m) => {
      const isThreadMsg =
        (m.sender === username && m.recipient === recipient) ||
        (m.sender === recipient && m.recipient === username);
      if (!isThreadMsg) return;

      if (!m.encrypted_key) {
        const match = pendingRef.current.find((p) => p.message === m.message);
        if (match?.encrypted_key) m = { ...m, encrypted_key: match.encrypted_key };
      }

      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id || x.message === m.message)) return prev;
        return [...prev, m];
      });

      setPending((old) => old.filter((p) => p.message !== m.message));
      inflightPayloadsRef.current.delete(m.message);

      if (m.sender !== username && document.visibilityState === "hidden" && canNotify()) {
        let preview = "New message";
        try {
          preview = await decrypt(m.message, m.encrypted_key || null, m.recipient);
          if (!preview || preview === "(decryption failed)") preview = "New message";
        } catch {}
        showNativeNotification(m.sender, preview);
      }
    });

    return () => {
      socket.off("new_message");
    };
  }, [username, recipient]);

  const getDisplayTime = (m) => {
    if (m?.timestamp) return new Date(m.timestamp).getTime();
    if (m?.client_ts) return m.client_ts;
    return 0;
  };

  const combined = useMemo(() => {
    const arr = [...messages, ...pending];
    arr.sort((a, b) => {
      const at = getDisplayTime(a);
      const bt = getDisplayTime(b);
      if (at !== bt) return at - bt;
      const aIsPending = a.id == null;
      const bIsPending = b.id == null;
      if (aIsPending !== bIsPending) return aIsPending ? 1 : -1;
      return 0;
    });
    return arr;
  }, [messages, pending]);

  // --------- Pre-decrypt messages (batched + concurrent) ---------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const toDo = [];
      for (const m of combined) {
        const k = keyFor(m);
        if (!plainByKeyRef.current.has(k)) toDo.push([k, m]);
      }
      if (!toDo.length) return;

      const kCache = keyCacheRef.current;
      const byUser = new Map();
      for (const [, m] of toDo) {
        const ek = m.encrypted_key || null;
        if (!ek) continue;
        if (kCache.has(ek)) continue;
        const u = m.recipient;
        if (!byUser.has(u)) byUser.set(u, new Set());
        byUser.get(u).add(ek);
      }

      for (const [u, setKeys] of byUser) {
        const list = Array.from(setKeys);
        try {
          const results = await decapBatch(u, list, API_BASE_URL);
          for (const ek of list) {
            const r = results[ek];
            if (r && r.shared_key) {
              kCache.set(ek, r.shared_key);
            }
          }
        } catch {}
      }

      const results = await Promise.all(
        toDo.map(async ([k, m]) => {
          const plain = await decrypt(m.message, m.encrypted_key || null, m.recipient);
          return [k, plain];
        })
      );

      if (!cancelled && results.length) {
        setPlainByKey((prev) => {
          const next = new Map(prev);
          for (const [k, v] of results) next.set(k, v);
          return next;
        });
      }
    })();

    return () => { cancelled = true; };
  }, [combined, username]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [combined.length]);

  const sendMessage = async () => {
    const now = Date.now();
    if (now - lastSendTsRef.current < 300) return;
    lastSendTsRef.current = now;

    const text = newMessage.trim();
    if (!text) return;

    setNewMessage("");

    let encodedPayload;

    try {
      await axios.post(`${API_BASE_URL}/ensure-keys`, { usernames: [username, recipient] });

      const encKeyRes = await axios.post(`${API_BASE_URL}/encrypt-key`, { username: recipient });
      const encryptedKeyB64 = encKeyRes.data.encrypted_key;
      const sharedKeyWords = CryptoJS.enc.Base64.parse(encKeyRes.data.shared_key);

      const { ciphertext, iv } = encryptWithAES(text, sharedKeyWords);
      const payload = { ciphertext, iv };
      encodedPayload = btoa(JSON.stringify(payload));

      if (inflightPayloadsRef.current.has(encodedPayload)) {
        return;
      }
      inflightPayloadsRef.current.add(encodedPayload);

      const localMsg = {
        sender: username,
        recipient,
        message: encodedPayload,
        timestamp: null,
        client_ts: Date.now(),
        encrypted_key: encryptedKeyB64,
      };
      decryptCacheRef.current.set(encodedPayload, text);
      setPending((prev) => [...prev, localMsg]);

      await axios.post(`${API_BASE_URL}/send`, {
        sender: username,
        recipient,
        message: encodedPayload,
        encrypted_key: encryptedKeyB64,
      });

      setTimeout(() => {
        inflightPayloadsRef.current.delete(encodedPayload);
      }, 5000);
    } catch (err) {
      console.error("Send failed:", err?.response?.data || err.message || err);
      if (encodedPayload) {
        setPending((prev) => prev.filter((p) => p.message !== encodedPayload));
        inflightPayloadsRef.current.delete(encodedPayload);
      }
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      if (e.repeat) return;
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full max-h-screen flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-black">
        {combined.map((msg) => {
          const k = keyFor(msg);
          const isMine = msg.sender === username;
          const plain = plainByKey.get(k) ?? "Decrypting…";

          const ts = msg.timestamp
            ? msg.timestamp
            : (msg.client_ts ? new Date(msg.client_ts).toISOString() : new Date().toISOString());

          return (
            <div key={k} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xs px-4 py-2 rounded-lg ${isMine ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"}`}>
                <div className="text-sm break-words">{plain}</div>
                <div className="text-xs text-gray-300 mt-1 text-right">
                  {formatTimestamp(ts)}
                </div>
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
            onKeyDown={onKeyDown}
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r-lg"
            disabled={!newMessage.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatWindow;
