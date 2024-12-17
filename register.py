import tkinter as tk
from tkinter import messagebox
import cv2
from keras_facenet import FaceNet
import mediapipe as mp
import numpy as np
import requests

# FaceNet 초기화
facenet = FaceNet()

# MediaPipe Face Detection 초기화
mp_face_detection = mp.solutions.face_detection
mp_drawing = mp.solutions.drawing_utils

# 서버 URL
SERVER_URL = "http://220.90.180.118:9000"

# 얼굴 임베딩 생성 함수 (MediaPipe 사용)
def capture_face_embedding():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)  # 해상도 설정
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    embeddings = []
    num_images = 0
    total_images = 50  # 캡처할 이미지 수

    print("Capturing face images. Press 'q' to stop.")
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
        while num_images < total_images:
            ret, frame = cap.read()
            if not ret:
                break

            # MediaPipe로 얼굴 탐지
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_detection.process(rgb_frame)

            if results.detections:
                for detection in results.detections:
                    bboxC = detection.location_data.relative_bounding_box
                    h, w, _ = frame.shape
                    x, y, width, height = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)

                    # 얼굴 영역 추출
                    face = frame[y:y + height, x:x + width]
                    face_resized = cv2.resize(face, (160, 160))

                    # FaceNet으로 임베딩 생성
                    embedding = facenet.embeddings(np.expand_dims(face_resized, axis=0))[0]
                    embeddings.append(embedding)
                    num_images += 1

                    # 진행 상태 표시
                    cv2.putText(frame, f"Captured: {num_images}/{total_images}", (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            cv2.imshow("Face Registration", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

    if embeddings:
        return np.mean(embeddings, axis=0)
    else:
        return None

# 회원가입 처리 함수
def register_user():
    user_id = id_entry.get()
    password = password_entry.get()
    name = name_entry.get()

    if not user_id or not password or not name:
        messagebox.showerror("Error", "All fields are required!")
        return

    embedding = capture_face_embedding()
    if embedding is None:
        messagebox.showerror("Error", "Failed to capture face images.")
        return

    data = {"id": user_id, "password": password, "name": name, "embedding": embedding.tolist()}
    try:
        response = requests.post(f"{SERVER_URL}/register", json=data)
        if response.status_code == 200:
            messagebox.showinfo("Success", "Registration completed!")
        else:
            messagebox.showerror("Error", response.json().get("message", "Failed to register"))
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred: {e}")

# 회원가입 UI
app = tk.Tk()
app.title("Register")

tk.Label(app, text="User ID").grid(row=0, column=0)
id_entry = tk.Entry(app)
id_entry.grid(row=0, column=1)

tk.Label(app, text="Password").grid(row=1, column=0)
password_entry = tk.Entry(app, show="*")
password_entry.grid(row=1, column=1)

tk.Label(app, text="Name").grid(row=2, column=0)
name_entry = tk.Entry(app)
name_entry.grid(row=2, column=1)

tk.Button(app, text="Register", command=register_user).grid(row=3, column=0, columnspan=2)
app.mainloop()
