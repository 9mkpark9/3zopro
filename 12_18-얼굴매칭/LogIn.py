import cv2
import threading
from keras_facenet import FaceNet
import mediapipe as mp
import numpy as np
import requests
import hashlib
import time

# 서버 URL
SERVER_URL = "http://220.90.180.118:9000"

# FaceNet 초기화
facenet = FaceNet()

# MediaPipe Face Detection 초기화
mp_face_detection = mp.solutions.face_detection

# 비밀번호 암호화 함수
def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

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
                # 미러 모드 적용 (수평 반전)
                self.frame = cv2.flip(frame, 1)
            else:
                print("Error: Failed to grab frame.")
        self.capture.release()

    def read(self):
        return self.frame

    def stop(self):
        self.running = False
        self.join()

class FaceProcessingThread(threading.Thread):
    def __init__(self, video_capture, user_id):
        super().__init__()
        self.video_capture = video_capture
        self.user_id = user_id
        self.running = True
        self.face_matched = False  # 얼굴 매칭 상태
        self.name = "Unknown"  # 기본 이름 설정
        self.frame_to_display = None  # 메인 루프에 전달할 프레임

    def run(self):
        with mp_face_detection.FaceDetection(min_detection_confidence=0.5) as face_detection:
            while self.running:
                frame = self.video_capture.read()

                # 유효하지 않은 프레임 처리
                if frame is None or frame.size == 0:
                    print("Warning: Received an invalid frame.")
                    time.sleep(0.1)
                    continue

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
                            self.name = json_response.get("name", "Unknown")  # 서버에서 이름 가져오기
                            self.face_matched = True
                        else:
                            self.face_matched = False
                    except Exception as e:
                        print(f"Error: {e}")
                        self.face_matched = False

                else:
                    self.face_matched = False

                # 텍스트 추가
                if self.face_matched:
                    cv2.putText(frame, f"Welcome, {self.name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                elif results.detections is None:
                    cv2.putText(frame, "No face detected", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
                else:
                    cv2.putText(frame, "Face Not Matched", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

                self.frame_to_display = frame

    def stop(self):
        self.running = False
        self.join()

def verify_face_live(user_id):
    try:
        video_capture = VideoCaptureThread()
        video_capture.start()

        if not video_capture.capture.isOpened():
            print("Error: Unable to access the camera.")
            video_capture.stop()
            return

        processing_thread = FaceProcessingThread(video_capture, user_id)
        processing_thread.start()

        while True:
            frame = processing_thread.frame_to_display

            if frame is not None:
                try:
                    cv2.imshow("Face Verification", frame)
                except cv2.error as e:
                    print(f"OpenCV Error during main loop: {e}")
                    break

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        video_capture.stop()
        processing_thread.stop()
        cv2.destroyAllWindows()

    except RuntimeError as e:
        print(f"Runtime Error: {e}")

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

# 프로그램 시작
if __name__ == "__main__":
    login_user()
