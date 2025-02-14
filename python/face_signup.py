import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # TensorFlow 디버그 메시지 최소화
os.environ['GLOG_minloglevel'] = '2'  # mediapipe 디버그 메시지 비활성화
os.environ['KMP_WARNINGS'] = '0'  # OpenMP 경고 비활성화
import cv2
import mediapipe as mp
from keras_facenet import FaceNet
import numpy as np
import json
import sys
import tensorflow as tf
tf.get_logger().setLevel('ERROR')  # TensorFlow의 로그 레벨을 ERROR로 설정


facenet = FaceNet()
mp_face_detection = mp.solutions.face_detection
mp_drawing = mp.solutions.drawing_utils

def capture_face_embedding():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    embeddings = []
    num_images = 0
    total_images = 90
    

    print("Capturing face images. Press 'q' to stop.", file=sys.stderr)
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
        while num_images < total_images:
            ret, frame = cap.read()
            if not ret:
                print("Failed to capture frame from camera. Exiting...", file=sys.stderr)
                break

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


if __name__ == "__main__":
    try:
        embedding = capture_face_embedding()
        if embedding is not None:
            # 임베딩을 JSON으로 출력
            print(json.dumps(embedding.tolist()))
        else:
            print(json.dumps({"error": "No embedding generated"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
