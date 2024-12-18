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
def detect_eye_blink(
    facial_landmarks, w, h, EAR_THRESH, SLEEP_TIME, calibration_time,
    calibration_start, calibration_ears, blink_start, blink_count, eyes_closed, total_sleep_time, sleep_start, low_ear_count
):
    left_eye_idx = [33, 160, 158, 133, 153, 144]
    right_eye_idx = [362, 385, 387, 263, 373, 380]

    # 눈 랜드마크 추출
    left_eye = np.array([[facial_landmarks.landmark[i].x * w, facial_landmarks.landmark[i].y * h] for i in left_eye_idx])
    right_eye = np.array([[facial_landmarks.landmark[i].x * w, facial_landmarks.landmark[i].y * h] for i in right_eye_idx])

    # EAR 계산
    left_ear = eye_aspect_ratio(left_eye)
    right_ear = eye_aspect_ratio(right_eye)
    ear = (left_ear + right_ear) / 2.0

    # 상태 초기화
    current_state = "awake"
    calibration_message = ""

    # 캘리브레이션 중
    if EAR_THRESH is None:
        elapsed = time.time() - calibration_start
        if elapsed < calibration_time:
            calibration_ears.append(ear)
            remaining_time = int(calibration_time - elapsed)
            calibration_message = f"Calibrating... {remaining_time}s remaining"
        else:
            if len(calibration_ears) > 10:
                EAR_THRESH = np.mean(calibration_ears) - 0.5 * np.std(calibration_ears)
                print(f"Calibration Complete: EAR Threshold = {EAR_THRESH:.3f}")
            else:
                EAR_THRESH = 0.25
                print("Calibration Failed: Using Default Threshold = 0.25")
    else:
        # 눈 감김 상태 판별
        if ear < EAR_THRESH:
            if not eyes_closed:
                eyes_closed = True
                blink_start = time.time()  # 눈 감기 시작 시간 기록
                sleep_start = time.time()  # 수면 시작 시간 기록

            # 수면 시간 누적
            if sleep_start is not None and (time.time() - sleep_start) >= SLEEP_TIME:
                current_state = "sleeping"
                total_sleep_time += time.time() - sleep_start
                sleep_start = time.time()  # 수면 시간 갱신
        else:
            # 눈이 다시 뜬 경우 깜빡임으로 간주
            if eyes_closed:
                if blink_start is not None:  # blink_start가 None이 아닌 경우에만 계산
                    closed_duration = time.time() - blink_start
                    if closed_duration >= 0.15:  # 최소 깜빡임 지속 시간
                        blink_count += 1  # 깜빡임 카운트 증가
                eyes_closed = False
                blink_start = None  # blink_start 초기화
                sleep_start = None  # sleep_start 초기화
            low_ear_count = 0  # 낮은 EAR 카운트 초기화

    return EAR_THRESH, blink_start, blink_count, eyes_closed, total_sleep_time, sleep_start, current_state, calibration_message, low_ear_count





