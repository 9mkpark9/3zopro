import cv2
import mediapipe as mp
import numpy as np
from scipy.spatial import distance as dist
import time
import matplotlib.pyplot as plt

# Eye Aspect Ratio 계산 함수
def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])  # 수직 거리1
    B = dist.euclidean(eye[2], eye[4])  # 수직 거리2
    C = dist.euclidean(eye[0], eye[3])  # 수평 거리
    ear = (A + B) / (2.0 * C)  # EAR 계산
    return ear

# 가중치 계산 함수
def calculate_weight(time_in_minutes, total_time):
    # 초반에 높은 가중치를 주고, 시간이 지날수록 점진적으로 감소
    max_weight = 1.0  # 초기 가중치
    min_weight = 0.2  # 마지막 가중치
    weight = max_weight - (time_in_minutes / total_time) * (max_weight - min_weight)
    return weight

# 집중도에 따른 피드백 제공
def get_concentration_feedback(score):
    if score > 80:
        return "You're highly focused!"
    elif score > 60:
        return "You're doing well, but try to focus more."
    elif score > 40:
        return "You're losing focus, take a break!"
    else:
        return "You're distracted, take a rest and refocus!"

# Mediapipe FaceMesh 초기화
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True)

# 웹캠 연결
cap = cv2.VideoCapture(0)

# EAR 관련 초기화 변수
EAR_THRESHOLD = 0.25  # 눈 감김 판단 기준 EAR 값
CONSEC_FRAMES = 3  # 눈 감김 상태가 유지될 최소 연속 프레임 수
blink_count = 0  # 깜빡임 횟수
frame_counter = 0  # 연속적으로 눈 감김 상태인 프레임 수

# 집중 점수 관련 초기화 변수
start_time = time.time()  # 시작 시간
total_study_time = 0.6  # 총 공부 시간 (분 단위)
total_score = 0  # 총 집중 점수
score_history = []  # 집중 점수 기록
concentration_history = []  # 집중도 기록

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # 프레임 전처리
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    if results.multi_face_landmarks:
        for facial_landmarks in results.multi_face_landmarks:
            # 눈 좌표 가져오기 (왼쪽과 오른쪽)
            h, w, _ = frame.shape
            left_eye_idx = [33, 160, 158, 133, 153, 144]
            right_eye_idx = [362, 385, 387, 263, 373, 380]

            left_eye = np.array([[facial_landmarks.landmark[i].x * w,
                                  facial_landmarks.landmark[i].y * h] for i in left_eye_idx])
            right_eye = np.array([[facial_landmarks.landmark[i].x * w,
                                   facial_landmarks.landmark[i].y * h] for i in right_eye_idx])

            # EAR 계산
            left_ear = eye_aspect_ratio(left_eye)
            right_ear = eye_aspect_ratio(right_eye)
            ear = (left_ear + right_ear) / 2.0

            # 눈 주위에 윤곽선 그리기
            cv2.polylines(frame, [np.int32(left_eye)], True, (0, 255, 0), 1)
            cv2.polylines(frame, [np.int32(right_eye)], True, (0, 255, 0), 1)

            # 눈 깜빡임 감지
            if ear < EAR_THRESHOLD:
                frame_counter += 1  # 눈 감김 상태 유지
            else:
                if frame_counter >= CONSEC_FRAMES:
                    blink_count += 1  # 눈 깜빡임으로 판정
                frame_counter = 0  # 초기화

    # 집중 점수 계산
    elapsed_time = (time.time() - start_time) / 60  # 경과 시간 (분 단위)
    if elapsed_time > total_study_time:  # 총 공부 시간을 초과하면 종료
        break

    weight = calculate_weight(elapsed_time, total_study_time)  # 시간 경과에 따른 가중치 계산
    score = weight * (1 - (blink_count / max(1, elapsed_time)))  # 집중 점수 계산
    total_score += score  # 총 집중 점수 업데이트
    score_history.append(total_score)  # 집중 점수 기록
    concentration_history.append(score * 100)  # 집중도 기록 (0-100)

    # 집중도 피드백
    feedback = get_concentration_feedback(score * 100)

    # 결과 출력
    cv2.putText(frame, f"Blink Count: {blink_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    cv2.putText(frame, f"Elapsed Time: {elapsed_time:.2f} min", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, f"Current Score: {score:.2f}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
    cv2.putText(frame, f"Total Score: {total_score:.2f}", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, feedback, (10, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

    # 프레임 출력
    cv2.imshow("Concentration Scoring", frame)

    # 종료 조건 (q 키를 누르면 종료)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# 그래프 출력
fig, ax = plt.subplots(2, 1, figsize=(10, 8))

# 집중 점수 그래프
ax[0].plot(range(len(score_history)), score_history, label="Total Concentration Score", color='b')
ax[0].set_xlabel("Time (minutes)")
ax[0].set_ylabel("Concentration Score")
ax[0].set_title("Concentration Score Over Time")
ax[0].grid(True)
ax[0].legend()

# 집중도 그래프
ax[1].plot(range(len(concentration_history)), concentration_history, label="Concentration Level (%)", color='r')
ax[1].set_xlabel("Time (minutes)")
ax[1].set_ylabel("Concentration Level (%)")
ax[1].set_title("Concentration Level Over Time")
ax[1].grid(True)
ax[1].legend()

plt.tight_layout()
plt.show()

print(f"Final Concentration Score: {total_score:.2f}")
