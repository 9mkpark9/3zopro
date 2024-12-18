import cv2
import numpy as np
import requests
import time
from keras_facenet import FaceNet
import mediapipe as mp
import threading
from eye_blink import detect_eye_blink
from head_turn import detect_head_turn
from calculate import cal_sleeptime, cal_headturn, cal_blinks_per_minute, cal_blink_points, totalscore

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

        # 집중도 관련 변수
        self.start_time = time.time()
        self.blink_count = 0
        self.total_sleep_time = 0
        self.sleep_start = None
        self.low_ear_count = 0  # EAR 낮은 상태 카운트 초기화
        self.eyes_closed = False
        self.ear_thresh = None
        self.blink_start = None  # 눈 감김 시작 시간 초기화

        # 캘리브레이션 관련 변수
        self.calibration_ears = []  # EAR 캘리브레이션 데이터를 저장
        self.calibration_time = 5.0  # 캘리브레이션 지속 시간

        # 고개 방향 관련 변수 초기화
        self.turn_start = None  # 고개 돌리기 시작한 시간
        self.total_turn_time = 0  # 고개 돌린 총 시간


    def run(self):
        with mp_face_detection.FaceDetection(min_detection_confidence=0.5) as face_detection, \
             mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True) as face_mesh:
            while self.running:
                frame = self.video_capture.read()
                if frame is None or frame.size == 0:
                    time.sleep(0.1)
                    continue

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                detection_results = face_detection.process(rgb_frame)
                mesh_results = face_mesh.process(rgb_frame)

                if detection_results.detections:
                    largest_face = max(
                        detection_results.detections,
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

                    # 얼굴 매칭 성공 시 집중도 점수 계산 및 데이터 표시
                    if self.face_matched and mesh_results.multi_face_landmarks:
                        facial_landmarks = mesh_results.multi_face_landmarks[0]
                        head_direction = detect_head_turn(facial_landmarks, frame.shape[1], frame.shape[0])
                        self.turn_start, self.total_turn_time = self.update_turn_time(
                            head_direction, self.turn_start, self.total_turn_time
                        )

                        self.ear_thresh, self.blink_start, self.blink_count, self.eyes_closed, self.total_sleep_time, self.sleep_start, state, calibration_message, self.low_ear_count = detect_eye_blink(
                            facial_landmarks, frame.shape[1], frame.shape[0], self.ear_thresh, 2.0, 5.0,
                            self.start_time, self.calibration_ears, self.blink_start, self.blink_count, self.eyes_closed, self.total_sleep_time, self.sleep_start, self.low_ear_count
                        )

                        elapsed_time = time.time() - self.start_time
                        blink_per_minute = cal_blinks_per_minute(self.blink_count, elapsed_time)
                        blink_points = cal_blink_points(blink_per_minute)

                        sleep_points = cal_sleeptime(self.total_sleep_time, elapsed_time)
                        head_turn_points = cal_headturn(
                            elapsed_time - self.total_turn_time, elapsed_time
                        )

                        focus_score = totalscore(sleep_points, head_turn_points, blink_points)
                        self.final_focus_score = focus_score

                        # UI 업데이트: 실시간 데이터 표시
                        cv2.putText(frame, f"User: {self.name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)  # White
                        cv2.putText(frame, f"Focus Score: {focus_score:.2f}", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)  # Green
                        cv2.putText(frame, f"Blinks: {self.blink_count}", (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)  # Red
                        cv2.putText(frame, f"Head: {head_direction} (Time: {int(self.total_turn_time)}s)", (10, 150), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)  # Yellow
                        cv2.putText(frame, f"Sleep Time: {int(self.total_sleep_time)}s", (10, 190), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)  # Cyan
                    else:
                        cv2.putText(frame, "Face Not Matched", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)  # Red

                self.frame_to_display = frame

    def update_turn_time(self, direction, turn_start, total_turn_time):
        current_time = time.time()
        if direction != "center" and turn_start is None:
            turn_start = current_time
        elif direction == "center" and turn_start is not None:
            total_turn_time += current_time - turn_start
            turn_start = None
        return turn_start, total_turn_time

    def stop(self):
        self.running = False
        self.join()
        print(f"Final Focus Score: {self.final_focus_score}")
