import cv2
from keras_facenet import FaceNet
import mediapipe as mp
import numpy as np
import requests
import hashlib

# FaceNet 초기화
facenet = FaceNet()

# MediaPipe Face Detection 초기화
mp_face_detection = mp.solutions.face_detection

# 서버 URL
SERVER_URL = "http://220.90.180.118:9000"

# 비밀번호 암호화 함수
def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

# 아이디 중복 확인 함수
def check_user_id_exists(user_id):
    try:
        response = requests.get(f"{SERVER_URL}/get-face-vector/{user_id}")
        if response.status_code == 200:
            return True  # 아이디가 이미 존재하는 경우
        else:
            return False  # 아이디가 존재하지 않는 경우
    except Exception as e:
        print(f"Error checking user ID: {e}")
        return False

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

            # 얼굴 캡처를 실시간으로 보여주기
            cv2.imshow("Capturing Face", frame)

            # 'q'를 누르면 캡처 종료
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
    # 아이디 중복 체크를 반복하도록 수정
    while True:
        user_id = input("Enter User ID: ")

        # 아이디 중복 체크
        if check_user_id_exists(user_id):
            print("Error: User ID already exists! Please choose another one.")
        else:
            break  # 아이디가 중복되지 않으면 루프 종료

    password = input("Enter Password: ")
    name = input("Enter Name: ")

    if not user_id or not password or not name:
        print("Error: All fields are required!")
        return

    # 얼굴 캡처가 성공적으로 완료되면 그 다음에 비밀번호를 암호화하고 회원가입 요청
    embedding = capture_face_embedding()
    if embedding is None:
        print("Error: Failed to capture face images.")
        return

    # 비밀번호 암호화
    hashed_password = hash_password(password)

    # 서버에 회원가입 요청
    data = {
        "id": user_id,
        "password": hashed_password,  # 암호화된 비밀번호
        "name": name,
        "embedding": embedding.tolist()
    }

    try:
        response = requests.post(f"{SERVER_URL}/register", json=data)
        if response.status_code == 200:
            print("Registration completed successfully!")
        else:
            print("Error:", response.json().get("message", "Failed to register"))
    except Exception as e:
        print(f"An error occurred: {e}")

# 프로그램 시작
if __name__ == "__main__":
    register_user()
