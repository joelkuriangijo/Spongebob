from flask import Flask, render_template, jsonify, request, session, redirect, url_for, g
from flask_socketio import SocketIO, join_room, leave_room
from flask_cors import CORS
from flask_session import Session
import mysql.connector
import firebase_admin
from firebase_admin import credentials, auth
import os
import logging as logger
from dotenv import load_dotenv
from functools import wraps
import uuid
import requests
import time

# -------------------------------------
# App Initialization
# -------------------------------------
load_dotenv()
app = Flask(__name__)
app.config['SECRET_KEY'] = 'codesphere-secret'
socketio = SocketIO(app, cors_allowed_origins="*")
CORS(app)
app.secret_key = os.getenv("SECRET_KEY", "your_secret_key_here")

app.config["SESSION_TYPE"] = "filesystem"
Session(app)

cred = credentials.Certificate("myserviceAccountKey.json")
firebase_admin.initialize_app(cred)

rooms = {}
room_hosts = {}

# -------------------------------------
# Database Setup
# -------------------------------------
DB_CONFIG = {
    'host': os.getenv("DB_HOST"), 'user': os.getenv("DB_USER"),
    'password': os.getenv("DB_PASSWORD"), 'database': os.getenv("DB_NAME"),
    'port': int(os.getenv("DB_PORT", 3306)), 'ssl_disabled': True, 'autocommit': False
}

def get_db_connection():
    if 'db_conn' not in g:
        g.db_conn = mysql.connector.connect(**DB_CONFIG)
        g.cursor = g.db_conn.cursor(dictionary=True, buffered=True)
    return g.db_conn, g.cursor

@app.teardown_appcontext
def close_db_connection(exception):
    db_conn = g.pop('db_conn', None)
    if db_conn is not None: db_conn.close()

# -------------------------------------
# Auth Decorator & Routes
# -------------------------------------
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"): return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return wrapper

@app.route("/")
def login_page(): return render_template("login.html")

@app.route("/firebase-config")
def firebase_config():
    return jsonify({
        "apiKey": os.getenv("FIREBASE_API_KEY"), "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"), "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"), "appId": os.getenv("FIREBASE_APP_ID"),
        "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID")
    })

@app.route("/firebase-login", methods=["POST"])
def firebase_login():
    try:
        id_token = request.json.get("idToken")
        decoded_token = auth.verify_id_token(id_token, clock_skew_seconds=10)
        email = decoded_token.get('email')
        if not email: return jsonify({"error": "Email not found"}), 400
        conn, cursor = get_db_connection()
        cursor.execute("SELECT * FROM users WHERE email = %s LIMIT 1", (email,))
        user = cursor.fetchone()
        if not user:
            cursor.execute("INSERT INTO users (email, name, role) VALUES (%s,%s,%s)", (email, email.split('@')[0], 'student'))
            conn.commit()
            cursor.execute("SELECT * FROM users WHERE email = %s LIMIT 1", (email,))
            user = cursor.fetchone()
        session["user_id"], session["user_email"], session["user_name"], session["role"] = user["id"], user["email"], user["name"], user.get("role", "student")
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Login failed: {e}")
        return jsonify({"error": str(e)}), 400

@app.route('/home')
@login_required
def home():
    conn, cursor = get_db_connection()
    cursor.execute("SELECT * FROM users WHERE id = %s", (session['user_id'],))
    user = cursor.fetchone()
    if not user:
        session.clear()
        return redirect(url_for('login_page'))
    return render_template('home.html', user=user)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

@app.route('/meeting/create')
@login_required
def create_meeting():
    return redirect(url_for('meeting', room_id=str(uuid.uuid4())))

# In app.py, replace the meeting function

@app.route("/meeting/<room_id>")
@login_required
def meeting(room_id):
    user_id = session.get("user_id")
    current_user_role = 'student' # Default to student

    # Check if a host for this room has been assigned yet
    if room_id not in room_hosts:
        # If not, this user is the first to join. They become the teacher.
        room_hosts[room_id] = user_id
        current_user_role = 'teacher'
        print(f"Room {room_id} created. Host is User ID {user_id}.") # For debugging
    elif room_hosts[room_id] == user_id:
        # If a host exists and it's this user, they are the teacher (e.g., on refresh)
        current_user_role = 'teacher'

    user_data = {
        "id": user_id,
        "name": session.get("user_name"),
        # The DB role is less important now, but we can keep it
        "db_role": session.get("role") 
    }

    
    # We pass the DYNAMIC role to the template, not the one from the database
    return render_template("meeting.html", room_id=room_id, user=user_data, user_role=current_user_role)

@app.route('/run-code', methods=['POST'])
@login_required
def run_code():
    code_to_run = request.json.get('code', '')
    api_url, headers = "https://judge0-ce.p.rapidapi.com/submissions", {
        "content-type": "application/json", "X-RapidAPI-Key": os.getenv("RAPIDAPI_KEY"),
        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com"}
    payload = {"language_id": 71, "source_code": code_to_run}
    try:
        response = requests.post(api_url, json=payload, headers=headers)
        response.raise_for_status()
        token = response.json().get('token')
        if not token: return jsonify({'error': 'Failed to submit code'}), 500
        result_url, output = f"{api_url}/{token}", None
        for _ in range(10):
            res = requests.get(result_url, headers=headers)
            res.raise_for_status()
            data = res.json()
            if data.get('status', {}).get('id', 0) > 2:
                stdout, stderr = data.get('stdout', ''), data.get('stderr', '')
                output = stderr or stdout or "Code executed with no output."
                break
            time.sleep(1)
        return jsonify({'output': output or "Execution timed out."})
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API Error: {str(e)}'}), 500

# -------------------------------------
# Socket.IO Events
# -------------------------------------
@socketio.on('join')
def on_join(data):
    room_id, user_name = data['room_id'], session.get("user_name", "Anonymous")
    join_room(room_id)
    if room_id not in rooms: rooms[room_id] = []
    rooms[room_id].append(request.sid)
    other_users = [sid for sid in rooms[room_id] if sid != request.sid]
    socketio.emit('existing_participants', {'sids': other_users}, to=request.sid)

# In app.py, replace the on_disconnect function

@socketio.on('disconnect')
def on_disconnect():
    for room, participants in list(rooms.items()):
        if request.sid in participants:
            participants.remove(request.sid)
            # If the room is now empty, clean it up
            if not participants:
                del rooms[room]
                # Also remove the host assignment for this room
                if room in room_hosts:
                    del room_hosts[room]
                    print(f"Room {room} is empty and has been closed.") # For debugging
            
            socketio.emit('user_left', {'sid': request.sid}, to=room)
            break

@socketio.on('signal')
def on_signal(data):
    signal_data = data['signal_data']
    signal_data['sender_sid'] = request.sid
    socketio.emit('signal', signal_data, to=data['target_sid'])

@socketio.on('code_changed')
def on_code_changed(data):
    socketio.emit('code_update', {'code': data['code']}, to=data['room_id'], skip_sid=request.sid)

@socketio.on('toggle_editor_visibility')
def on_toggle_editor(data):
    socketio.emit('editor_state_changed', {'visible': data.get('is_visible')}, to=data.get('room_id'))

# -------------------------------------
# Run App
# -------------------------------------
if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5055, debug=True)