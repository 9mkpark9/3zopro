import time
import numpy as np
from scipy.spatial import distance as dist

# Eye Aspect Ratio Calculation
def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    return (A + B) / (2.0 * C)

# Detect Eye Blink and State
def detect_eye_blink(facial_landmarks, w, h, EAR_THRESH, SLEEP_TIME, calibration_time, calibration_start, calibration_ears, blink_start):
    left_eye_idx = [33, 160, 158, 133, 153, 144]
    right_eye_idx = [362, 385, 387, 263, 373, 380]

    # Extract eye landmarks
    left_eye = np.array([[facial_landmarks.landmark[i].x * w, facial_landmarks.landmark[i].y * h] for i in left_eye_idx])
    right_eye = np.array([[facial_landmarks.landmark[i].x * w, facial_landmarks.landmark[i].y * h] for i in right_eye_idx])

    # Calculate EAR
    left_ear = eye_aspect_ratio(left_eye)
    right_ear = eye_aspect_ratio(right_eye)
    ear = (left_ear + right_ear) / 2.0

    current_state = "집중"
    calibration_message = ""

    # Calibration or State Detection
    if EAR_THRESH is None:
        elapsed = time.time() - calibration_start
        if elapsed < calibration_time:
            calibration_ears.append(ear)
            remaining_time = int(calibration_time - elapsed)
            calibration_message = f"캘리브레이션 중... 자연스럽게 눈을 떠주세요! 남은 시간: {remaining_time}s"
        else:
            if len(calibration_ears) > 10:
                EAR_THRESH = np.mean(calibration_ears) - 0.5 * np.std(calibration_ears)
                print(f"Calibration Complete: EAR Threshold = {EAR_THRESH:.3f}")
            else:
                EAR_THRESH = 0.25
                print("Calibration Failed: Using Default Threshold = 0.25")
    else:
        if ear < EAR_THRESH:
            if blink_start is None:
                blink_start = time.time()
            elif time.time() - blink_start >= SLEEP_TIME:
                current_state = "졸음"
            else:
                current_state = "눈 감음"
        else:
            blink_start = None

    return EAR_THRESH, blink_start, current_state, calibration_message
