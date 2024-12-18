import cv2
import numpy as np
import requests
import time
from keras_facenet import FaceNet
import mediapipe as mp
import threading

SERVER_URL = "http://220.90.180.118:9000"

facenet = FaceNet()
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh

class FaceProcessingThread(threading.Thread):
    def __init__(self, video_capture, user_id):
        super().__init__()
        self.video_capture = video_capture
        self.user_id = user_id
        self.running = True
        self.face_matched = False
        self.name = "Unknown"
        self.frame_to_display = None
        self.focus_score = 0.0

    def calculate_focus(self, landmarks):
        left_eye = [landmarks[i] for i in range(133, 144)]
        right_eye = [landmarks[i] for i in range(362, 373)]

        def eye_aspect_ratio(eye):
            eye_coords = np.array([(lm.x, lm.y) for lm in eye])
            vertical_1 = np.linalg.norm(eye_coords[1] - eye_coords[5])
            vertical_2 = np.linalg.norm(eye_coords[2] - eye_coords[4])
            horizontal = np.linalg.norm(eye_coords[0] - eye_coords[3])
            return (vertical_1 + vertical_2) / (2.0 * horizontal)

        left_ear = eye_aspect_ratio(left_eye)
        right_ear = eye_aspect_ratio(right_eye)
        ear = (left_ear + right_ear) / 2.0

        ear = min(ear, 0.3)
        ear_score = (ear / 0.3) * 50
        head_tilt_score = 50
        return ear_score + head_tilt_score

    def run(self):
        with mp_face_detection.FaceDetection(min_detection_confidence=0.5) as face_detection, \
             mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1) as face_mesh:
            while self.running:
                frame = self.video_capture.read()

                if frame is None or frame.size == 0:
                    time.sleep(0.1)
                    continue

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_detection.process(rgb_frame)

                if results.detections:
                    largest_face = max(
                        results.detections,
                        key=lambda det: det.location_data.relative_bounding_box.width *
                                        det.location_data.relative_bounding_box.height
                    )
                    bboxC = largest_face.location_data.relative_bounding_box
                    h, w, _ = frame.shape
                    x, y, width, height = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)

                    face = frame[max(0, y):max(0, y + height), max(0, x):max(0, x + width)]
                    face_resized = cv2.resize(face, (160, 160))
                    embedding = facenet.embeddings(np.expand_dims(face_resized, axis=0))[0]

                    try:
                        data = {"id": self.user_id, "embedding": embedding.tolist()}
                        response = requests.post(f"{SERVER_URL}/verify-face", json=data)
                        if response.status_code == 200:
                            self.name = response.json().get("name", "Unknown")
                            self.face_matched = True
                        else:
                            self.face_matched = False
                    except Exception:
                        self.face_matched = False

                if self.face_matched:
                    mesh_results = face_mesh.process(rgb_frame)
                    if mesh_results.multi_face_landmarks:
                        landmarks = mesh_results.multi_face_landmarks[0].landmark
                        self.focus_score = self.calculate_focus(landmarks)
                        cv2.putText(frame, f"Welcome, {self.name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                        cv2.putText(frame, f"Focus: {self.focus_score:.2f}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 255), 2)
                else:
                    cv2.putText(frame, "Face Not Matched", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

                self.frame_to_display = frame

    def stop(self):
        self.running = False
        self.join()
