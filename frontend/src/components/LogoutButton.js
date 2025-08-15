import React from "react";

function LogoutButton({ onLogout }) {
  const handleLogout = () => {
    localStorage.removeItem("username");
    onLogout();
  };

  return (
    <button
      onClick={handleLogout}
      className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded shadow-md transition"
    >
      Logout
    </button>
  );
}

export default LogoutButton;
