# Secure Messenger V2 — Quantum Encryption

## Overview
This is the upgraded version of my secure chat app.  
V1 used AES-256-GCM for messages and RSA for key exchange.  
**V2 replaces RSA with Kyber512 (post-quantum secure)** to protect against future quantum attacks.

---

## Features
- End-to-end encryption (AES-256-GCM)
- Post-quantum key exchange (Kyber512)
- Forward secrecy with rotating keys
- Real-time messaging (Socket.IO)
- Secure login system
- Contact list shows only past conversations
- Browser notifications for new messages

---

## How It Works
1. On login, each user gets a Kyber512 keypair.
2. Messages are encrypted with AES-256-GCM.
3. The AES key is encrypted with the recipient’s Kyber512 public key.
4. Keys rotate periodically for extra security.

---

## Tech Stack
**Frontend:** React, Axios, CryptoJS, Socket.IO Client  
**Backend:** Flask, Flask-SocketIO, SQLAlchemy, pqcrypto  
**Database:** MySQL

---

## Setup
### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```

Check it out at 