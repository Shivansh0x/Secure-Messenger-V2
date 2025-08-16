import React, { useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { SOCKET_URL, API_BASE_URL } from "../config";

const socket = io(SOCKET_URL);

function LoginForm({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);

  const requestNotifyPermission = () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const endpoint = isLoginMode ? "/login" : "/register";

    axios
      .post(`${API_BASE_URL}${endpoint}`, { username, password })
      .then(() => {
        localStorage.setItem("username", username);
        onLogin(username);
        socket.emit("user_connected", { username });
        requestNotifyPermission();
      })
      .catch((error) => {
        console.error(`${isLoginMode ? "Login" : "Registration"} failed:`, error);
        setError(
          isLoginMode
            ? "Login failed. Please check your credentials."
            : "Registration failed. Username may already exist."
        );
      });
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setError("");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 px-4">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-3xl font-bold text-center text-white mb-6">
          {isLoginMode ? "Welcome Back" : "Create an Account"}
        </h2>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full px-4 py-2 mb-4 rounded bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-2 mb-4 rounded bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition duration-300 font-medium">
          {isLoginMode ? "Login" : "Register"}
        </button>

        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
      </form>

      <div className="mt-4 text-center text-sm text-blue-400">
        <button onClick={toggleMode} className="hover:underline focus:outline-none">
          {isLoginMode ? "Don't have an account? Register" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
}

export default LoginForm;
