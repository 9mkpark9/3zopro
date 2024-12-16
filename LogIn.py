import tkinter as tk
from tkinter import messagebox
import cv2
import threading
from keras_facenet import FaceNet
import mediapipe as mp
import numpy as np
import requests
import time

# 서버 URL
SERVER_URL = "http://220.90.180.118:9000"

# FaceNet 초기화
facenet = FaceNet()

# MediaPipe Face Detection 초기화
mp_face_detection = mp.solutions.face_detection

def show_message(title, message):
    app.after(0, lambda: messagebox.showinfo(title, message))

class VideoCaptureThread(threading.Thread):
    def __init__(self, video_source=0):
        super().__init__()
        self.capture = cv2.VideoCapture(video_source)
        if not self.capture.isOpened():
            raise RuntimeError(f"Error: Unable to access the camera at index {video_source}.")
        self.frame = None
        self.running = True

    def run(self):
        while self.running:
            ret, frame = self.capture.read()
            if ret:
                self.frame = frame
            else:
                print("Error: Failed to grab frame.")
        self.capture.release()

    def read(self):
        return self.frame

    def stop(self):
        self.running = False
        self.join()

class FaceProcessingThread(threading.Thread):
    def __init__(self, video_capture, user_id, text_data):
        super().__init__()
        self.video_capture = video_capture
        self.user_id = user_id
        self.text_data = text_data  # 텍스트 상태 공유 변수
        self.running = True

    def run(self):
        with mp_face_detection.FaceDetection(min_detection_confidence=0.5) as face_detection:
            while self.running:
                frame = self.video_capture.read()
                if frame is not None:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = face_detection.process(rgb_frame)

                    if results.detections:
                        # 가장 큰 얼굴(가장 가까운 얼굴) 선택
                        largest_face = max(
                            results.detections,
                            key=lambda det: det.location_data.relative_bounding_box.width *
                                            det.location_data.relative_bounding_box.height
                        )

                        # 얼굴 영역 계산
                        bboxC = largest_face.location_data.relative_bounding_box
                        h, w, _ = frame.shape
                        x, y, width, height = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)

                        # 얼굴 영역 추출
                        face = frame[max(0, y):max(0, y + height), max(0, x):max(0, x + width)]
                        face_resized = cv2.resize(face, (160, 160))

                        # FaceNet으로 임베딩 생성
                        embedding = facenet.embeddings(np.expand_dims(face_resized, axis=0))[0]

                        try:
                            # 서버에 임베딩 전송
                            data = {"id": self.user_id, "embedding": embedding.tolist()}
                            response = requests.post(f"{SERVER_URL}/verify-face", json=data)
                            json_response = response.json()

                            if response.status_code == 200:
                                name = json_response.get("name", "Unknown")
                                self.text_data["message"] = f"Welcome, {name}"
                                self.text_data["color"] = (0, 255, 0)  # 초록색
                            else:
                                self.text_data["message"] = "Face mismatch"
                                self.text_data["color"] = (0, 0, 255)  # 빨간색
                        except Exception as e:
                            self.text_data["message"] = f"Error: {e}"
                            self.text_data["color"] = (255, 255, 0)  # 노란색
                    else:
                        self.text_data["message"] = "No face detected"
                        self.text_data["color"] = (255, 255, 255)  # 흰색
                time.sleep(0.1)  # 약간의 딜레이 추가

    def stop(self):
        self.running = False
        self.join()

def verify_face_live(user_id):
    try:
        video_capture = VideoCaptureThread()
        text_data = {"message": "Initializing...", "color": (255, 255, 255)}  # 텍스트 초기화
        video_capture.start()
        processing_thread = FaceProcessingThread(video_capture, user_id, text_data)
        processing_thread.start()

        while True:
            frame = video_capture.read()
            if frame is not None:
                # 텍스트 출력
                cv2.putText(frame, text_data["message"], (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, text_data["color"], 2)
                cv2.imshow("Face Verification", frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        video_capture.stop()
        processing_thread.stop()
        cv2.destroyAllWindows()

    except RuntimeError as e:
        print(e)
        show_message("Error", str(e))

def login_user():
    user_id = id_entry.get()
    password = password_entry.get()

    if not user_id or not password:
        show_message("Error", "All fields are required!")
        return

    try:
        response = requests.post(f"{SERVER_URL}/login", json={"id": user_id, "password": password})
        if response.status_code == 200:
            verify_face_live(user_id)
        else:
            show_message("Error", response.json().get("message", "Login failed"))
    except Exception as e:
        show_message("Error", f"An error occurred: {e}")

# 로그인 UI
app = tk.Tk()
app.title("Login")

tk.Label(app, text="User ID").grid(row=0, column=0)
id_entry = tk.Entry(app)
id_entry.grid(row=0, column=1)

tk.Label(app, text="Password").grid(row=1, column=0)
password_entry = tk.Entry(app, show="*")
password_entry.grid(row=1, column=1)

tk.Button(app, text="Login", command=login_user).grid(row=2, column=0, columnspan=2)
app.mainloop()
