from flask import Flask, request, jsonify
import os
import pickle
from scipy.spatial.distance import cosine

app = Flask(__name__)

# 데이터 저장 디렉토리
DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

# 사용자 데이터 저장 함수
def save_user_data(user_id, user_data):
    with open(os.path.join(DATA_DIR, f"{user_id}.pkl"), "wb") as f:
        pickle.dump(user_data, f)

# 사용자 데이터 로드 함수
def load_user_data(user_id):
    try:
        with open(os.path.join(DATA_DIR, f"{user_id}.pkl"), "rb") as f:
            return pickle.load(f)
    except FileNotFoundError:
        return None

# 회원가입 API
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    user_id = data.get("id")
    password = data.get("password")
    name = data.get("name")
    embedding = data.get("embedding")

    if not user_id or not password or not name or embedding is None:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    if os.path.exists(os.path.join(DATA_DIR, f"{user_id}.pkl")):
        return jsonify({"status": "error", "message": "User ID already exists"}), 409

    user_data = {
        "id": user_id,
        "password": password,
        "name": name,
        "embedding": embedding
    }
    save_user_data(user_id, user_data)
    return jsonify({"status": "success", "message": f"User {name} registered successfully"})

# 로그인 API
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    user_id = data.get("id")
    password = data.get("password")

    if not user_id or not password:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    user_data = load_user_data(user_id)
    if not user_data:
        return jsonify({"status": "error", "message": "User not found"}), 404

    if user_data["password"] != password:
        return jsonify({"status": "error", "message": "Incorrect password"}), 401

    return jsonify({"status": "success", "message": "Password verified"})

# 얼굴 매칭 API
@app.route('/verify-face', methods=['POST'])
def verify_face():
    data = request.json
    user_id = data.get("id")
    embedding = data.get("embedding")

    if not user_id or embedding is None:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    user_data = load_user_data(user_id)
    if not user_data:
        return jsonify({"status": "error", "message": "User not found"}), 404

    stored_embedding = user_data["embedding"]
    similarity = 1 - cosine(stored_embedding, embedding)

    if similarity >= 0.7 :  # 유사도 기준
        return jsonify({
            "status": "success",
            "message": "Face matched",
            "name": user_data["name"]  # 사용자 이름 반환
        })
    else:
        return jsonify({
            "status": "error",
            "message": "Face mismatch"
        }), 401


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000)
