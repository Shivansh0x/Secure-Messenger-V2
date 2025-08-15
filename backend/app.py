import os
import base64
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from kyber_py.kyber import Kyber512

# ────── App Init ──────
app = Flask(__name__)
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://secure-messenger-v2.vercel.app")
CORS(app, resources={r"/*": {"origins": [FRONTEND_URL]}})
socketio = SocketIO(app, cors_allowed_origins=[FRONTEND_URL])

# ────── Database: Postgres (Render) ──────
db_url = os.getenv('DATABASE_URL')
if not db_url:
    # Local fallback (adjust if needed)
    db_url = 'postgresql://secure_messenger_user:11pPiMKd8uxISY174RHZ6dsd7BAwqCGo@dpg-d2fq0p8dl3ps73ehl020-a.singapore-postgres.render.com/secure_messenger'

parsed = urlparse(db_url)
scheme = (parsed.scheme or "").lower()
if scheme.startswith("postgres") and "sslmode=" not in db_url:
    db_url += ("&" if "?" in db_url else "?") + "sslmode=require"

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

online_users = {}
user_keys = {}

# ────── Helpers ──────
def ensure_keypair(username: str):
    """Create and cache a Kyber keypair for username if missing."""
    if not username:
        return
    if username not in user_keys or not user_keys[username].get("public_key") or not user_keys[username].get("private_key"):
        pk, sk = Kyber512.keygen()
        user_keys[username] = {"public_key": pk, "private_key": sk}

def encaps_detect(pubkey: bytes):
    """Some builds return (ss, ct) or (ct, ss). Return (ciphertext, shared_secret)."""
    a, b = Kyber512.encaps(pubkey)
    if len(a) >= len(b):
        return a, b
    return b, a

def expected_ct_len_for(pubkey: bytes) -> int:
    ct, _ = encaps_detect(pubkey)
    return len(ct)

# ────── Models ──────
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender = db.Column(db.String(64), nullable=False)
    recipient = db.Column(db.String(64), nullable=False)
    message = db.Column(db.Text, nullable=False)        
    encrypted_key = db.Column(db.Text, nullable=False)  
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# ────── Routes ──────
@app.route("/register", methods=["POST"])
def register():
    data = request.json or {}
    username, password = data.get("username"), data.get("password")
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 409
    db.session.add(User(username=username, password=password))
    db.session.commit()
    return jsonify({"message": "User registered"}), 200

@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    username, password = data.get("username"), data.get("password")
    user = User.query.filter_by(username=username).first()
    if not user or user.password != password:
        return jsonify({"error": "Invalid credentials"}), 401
    ensure_keypair(username)
    return jsonify({"message": "Login successful", "username": username}), 200

@app.route("/ensure-keys", methods=["POST"])
def ensure_keys():
    """Frontend can call this before sending to guarantee both users have keypairs."""
    body = request.json or {}
    usernames = body.get("usernames", [])
    for u in usernames:
        ensure_keypair(u)
    return jsonify({"status": "ok", "ensured": usernames})

@app.route("/key/<recipient>", methods=["GET"])
def get_public_key(recipient):
    ensure_keypair(recipient)
    key = user_keys.get(recipient, {}).get("public_key")
    return jsonify({"public_key": base64.b64encode(key).decode()})

@app.route("/encrypt-key", methods=["POST"])
def encrypt_key():
    try:
        data = request.json or {}
        username = data.get("username")
        if not username:
            return jsonify({"error": "Missing username"}), 400
        ensure_keypair(username)
        public_key = user_keys[username]["public_key"]
        ciphertext, shared_secret = encaps_detect(public_key)
        enc_b64 = base64.b64encode(ciphertext).decode()
        ss_b64  = base64.b64encode(shared_secret).decode()
        print(f"/encrypt-key -> ct_raw={len(ciphertext)} ct_b64={len(enc_b64)} ss_raw={len(shared_secret)} ss_b64={len(ss_b64)}")
        return jsonify({"encrypted_key": enc_b64, "shared_key": ss_b64})
    except Exception as e:
        print("Exception in /encrypt-key:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/send", methods=["POST"])
def send_message():
    try:
        data = request.get_json(force=True)
        sender = data["sender"]
        recipient = data["recipient"]
        aes_payload_b64 = data["message"]         
        encrypted_key_b64 = data["encrypted_key"]  

        try:
            encrypted_key_bytes = base64.b64decode(encrypted_key_b64)
        except Exception:
            return jsonify({"error": "encrypted_key is not valid base64"}), 400

        ensure_keypair(recipient)
        pubkey = user_keys[recipient]["public_key"]

        expected_len = expected_ct_len_for(pubkey)
        actual_len = len(encrypted_key_bytes)
        print(f"/send -> ct_raw={actual_len} expected_raw={expected_len} b64_len={len(encrypted_key_b64)}")

        if actual_len != expected_len:
            return jsonify({"error": f"Invalid ciphertext length: expected {expected_len} bytes, got {actual_len}"}), 400

        new_msg = Message(
            sender=sender,
            recipient=recipient,
            message=aes_payload_b64,
            encrypted_key=encrypted_key_b64
        )
        db.session.add(new_msg)
        db.session.commit()
        return jsonify({"status": "Message sent"}), 200
    except Exception as e:
        print("Exception in /send:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/chat/<user1>/<user2>", methods=["GET"])
def chat_between_users(user1, user2):
    messages = Message.query.filter(
        ((Message.sender == user1) & (Message.recipient == user2)) |
        ((Message.sender == user2) & (Message.recipient == user1))
    ).order_by(Message.timestamp).all()
    return jsonify([
        {
            "sender": m.sender,
            "recipient": m.recipient,
            "message": m.message,
            "timestamp": m.timestamp.isoformat() + "Z"
        } for m in messages
    ])

@app.route("/users/<username>", methods=["GET"])
def check_user_exists(username):
    user = User.query.filter(db.func.lower(User.username) == username.lower()).first()
    return jsonify({"exists": True, "username": user.username}) if user else \
        (jsonify({"error": "User not found"}), 404)

@app.route("/contacts/<username>", methods=["GET"])
def get_contacts(username):
    messages = Message.query.filter(
        (Message.sender == username) | (Message.recipient == username)
    ).all()
    contacts = set()
    for msg in messages:
        if msg.sender != username:
            contacts.add(msg.sender)
        if msg.recipient != username:
            contacts.add(msg.recipient)
    return jsonify(list(contacts))

@app.route("/")
def home():
    return "Quantum-Resistant Messaging Server Running"

# ────── Socket.IO Events ──────
@socketio.on("connect")
def handle_connect():
    pass

@socketio.on("user_connected")
def handle_user_connected(data):
    username = data.get("username")
    if username:
        online_users[username] = request.sid
        emit("update_online_users", list(online_users.keys()), broadcast=True)

@socketio.on("disconnect")
def handle_disconnect():
    for user, sid in list(online_users.items()):
        if sid == request.sid:
            del online_users[user]
            break
    emit("update_online_users", list(online_users.keys()), broadcast=True)

# ────── Start ──────
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
