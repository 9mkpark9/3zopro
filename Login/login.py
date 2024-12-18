import requests
from utils import hash_password
from live_verification import verify_face_live

SERVER_URL = "http://220.90.180.118:9000"

def login_user():
    user_id = input("Enter User ID: ")
    password = input("Enter Password: ")

    if not user_id or not password:
        print("Error: All fields are required!")
        return

    hashed_password = hash_password(password)
    try:
        response = requests.post(f"{SERVER_URL}/login", json={"id": user_id, "password": hashed_password})
        if response.status_code == 200:
            verify_face_live(user_id)
        else:
            print("Error:", response.json().get("message", "Login failed"))
    except Exception as e:
        print(f"An error occurred: {e}")