import math
import cv2
import numpy as np
import time
from scipy.spatial import distance as dist
from scipy.spatial.distance import cosine
import mediapipe as mp 
import dlib
import os

# dlib의 얼굴 탐지기 및 랜드마크 예측기 초기화
detector = dlib.get_frontal_face_detector()

# 현재 파일의 디렉토리 기준으로 상대 경로 설정
current_dir = os.path.dirname(os.path.abspath(__file__))
predictor_path = os.path.join(current_dir, "shape_predictor_68_face_landmarks.dat")

# Mediapipe 초기화
mp_face_detection = mp.solutions.face_detection

# 랜드마크 예측기 로드
try:
    predictor = dlib.shape_predictor(predictor_path)
except RuntimeError as e:
    print(f"랜더마크 예측기를 로드할 수 없습니다: {e}")
    print(f"확인한 경로: {predictor_path}")
    raise

# Eye Aspect Ratio Calculation
def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    return (A + B) / (2.0 * C)


# Blink and Drowsiness Detection
def detect_eye_blink(
    landmarks, frame_width, frame_height, EAR_THRESH, SLEEP_TIME,
    blink_start, blink_count, eyes_closed, frames_closed
):
    try:
        # 왼쪽 눈과 오른쪽 눈 랜드마크 인덱스
        LEFT_EYE = [36, 37, 38, 39, 40, 41]
        RIGHT_EYE = [42, 43, 44, 45, 46, 47]

        # 왼쪽 눈과 오른쪽 눈 랜드마크 좌표 추출
        left_eye = [(landmarks.part(idx).x, landmarks.part(idx).y) for idx in LEFT_EYE]
        right_eye = [(landmarks.part(idx).x, landmarks.part(idx).y) for idx in RIGHT_EYE]

        print(f"Left Eye Landmarks: {left_eye}")
        print(f"Right Eye Landmarks: {right_eye}")

        # EAR 계산
        left_EAR = eye_aspect_ratio(left_eye)
        right_EAR = eye_aspect_ratio(right_eye)
        avg_EAR = (left_EAR + right_EAR) / 2.0

        # EAR_THRESH 기본값 설정
        if EAR_THRESH is None:
            EAR_THRESH = 0.25  # 적절한 초기값 설정

        current_state = "집중"  # 초기 상태 설정

        # 눈 깜박임 감지
        if avg_EAR < EAR_THRESH:
            if not eyes_closed:
                blink_start = time.time()
                eyes_closed = True
            # 눈 감은 상태가 일정 시간 지속되면 수면 상태로 변경
            if eyes_closed and (time.time() - blink_start) >= SLEEP_TIME:
                current_state = "수면"
            else:
                current_state = "눈 감음"
            frames_closed += 1
        else:
            # EAR이 다시 임계값 위로 올라온 경우
            if eyes_closed:
                closed_duration = time.time() - blink_start
                if closed_duration >= 0.1:  # 최소 블링크 시간
                    blink_count += 1
            eyes_closed = False
            blink_start = None
            frames_closed = 0

        # 결과 반환
        return EAR_THRESH, blink_start, blink_count, eyes_closed, current_state, frames_closed

    except IndexError as e:
        print(f"IndexError in detect_eye_blink: {e}")
        raise

    except Exception as e:
        print(f"Unexpected error in detect_eye_blink: {e}")
        raise

# Head Turn Detection
def detect_head_turn(facial_landmarks, w, h, elapsed_time, focus_tracker):
    nose_tip = facial_landmarks.part(30)  # 코 끝
    left_eye_outer = facial_landmarks.part(36)  # 왼쪽 눈 외곽
    right_eye_outer = facial_landmarks.part(45)  # 오른쪽 눈 외곽

    # 픽셀 좌표 변환
    nose_x, nose_y = nose_tip.x, nose_tip.y
    left_x, left_y = left_eye_outer.x, left_eye_outer.y
    right_x, right_y = right_eye_outer.x, right_eye_outer.y

    # 두 눈의 중간점 계산
    eye_mid_x = (left_x + right_x) / 2
    eye_mid_y = (left_y + right_y) / 2

    # 코와 눈 중간점 간의 각도 계산
    dx, dy = nose_x - eye_mid_x, nose_y - eye_mid_y
    angle = math.atan2(dy, dx) * 180 / math.pi
    if angle < 0:
        angle += 360

    # 방향에 따른 시간 누적
    if 55 <= angle <= 125:
        focus_tracker["front"] += elapsed_time
        return "front"
    elif angle < 55:
        focus_tracker["left"] += elapsed_time
        return "left"

    else:
        focus_tracker["right"] += elapsed_time
        return "right"
    
# Head Turn Score Calculation
def cal_headturn(front_view_time, total_class_time):
    if total_class_time == 0:
        return 0  # 기본 점수 반환
    R = front_view_time / total_class_time
    if R > 0.9:
        points = 30
    elif 0.5 <= R <= 0.8:
        points = 15 + 14 * (R - 0.5) / 0.4
    else:
        points = 14 * R
    return round(points, 2)

def cal_sleeptime(total_sleep_time, elapsed_time):
    if elapsed_time > 0:
        ratio = min(total_sleep_time / elapsed_time, 2.0)  # 비율 제한
        drowsiness = 50 - (50 * ratio)
    else:
        drowsiness = 50  # 기본 점수

    return max(0, round(drowsiness, 2))  # 음수 방지

# Blinks Per Minute and Blink Points Calculation
def cal_blinks_per_minute(total_blinks, total_time_seconds):
    if total_time_seconds == 0:
        return 0  # 나눗셈 방지
    total_time_minutes = total_time_seconds / 60
    return total_blinks / total_time_minutes

def cal_blink_points(blinks_per_minute):
    if blinks_per_minute <= 20:
        points = 0
    else:
        points = blinks_per_minute - 20
    score = 20 - points

    return max(0, score)

# Face Not Matched Penalty
def cal_face_not_matched(mis_matched_duration, elapsed_time):
    if elapsed_time == 0:
        return 10  # 기본 페널티 반환
    if mis_matched_duration / elapsed_time <= 0.1:
        return 0
    else:
        return 10

# Total Score Calculation
def totalscore(sleep_point, ht_point, blink_points, match_points):
    return max(0, int(sleep_point) + int(ht_point) + int(blink_points) - int(match_points))

# Matching and Frame Processing
def calculate_total_score(
    front_view_time,
    total_class_time,
    total_sleep_time,
    elapsed_time,
    total_blinks,
    mis_matched_duration
):
    # Head turn score
    ht_point = cal_headturn(front_view_time, total_class_time)

    # Sleepiness score
    sleep_point = cal_sleeptime(total_sleep_time, elapsed_time)

    # Blink points
    blinks_per_minute = cal_blinks_per_minute(total_blinks, elapsed_time)
    blink_points = cal_blink_points(blinks_per_minute)

    # Mismatch penalty
    match_points = cal_face_not_matched(mis_matched_duration, elapsed_time)

    # Total score
    total = totalscore(sleep_point, ht_point, blink_points, match_points)
    return {
        "total_score": total,
        "ht_point": ht_point,
        "sleep_point": sleep_point,
        "blink_points": blink_points,
        "match_points": match_points,
        "blinks_per_minute": blinks_per_minute,
    }

def process_frame_with_matching(
    frame, user_embedding, registered_embedding, focus_tracker, blink_tracker, elapsed_time, mis_matched_duration
):
    try:
        # 기존 프레임 처리 결과
        frame_result = process_frame(frame, elapsed_time, focus_tracker, blink_tracker)

        # 임베딩 크기 확인
        if user_embedding.shape != registered_embedding.shape:
            raise ValueError(
                f"Embedding shape mismatch: user={user_embedding.shape}, registered={registered_embedding.shape}"
            )

        # 매칭 로직
        similarity = 1 - cosine(user_embedding.flatten(), registered_embedding.flatten())
        is_match = bool(similarity >= 0.70)  # 70% 이상 유사하면 매칭으로 간주

        # 점수 계산에 필요한 데이터
        front_view_time = focus_tracker["front"]
        total_class_time = sum(focus_tracker.values())
        total_sleep_time = blink_tracker["frames_closed"]
        total_blinks = blink_tracker["blink_count"]

        # 총 점수 계산
        score_details = calculate_total_score(
            front_view_time,
            total_class_time,
            total_sleep_time,
            elapsed_time,
            total_blinks,
            mis_matched_duration,
        )

        # 필요한 데이터만 반환
        return {
            "total_score": score_details["total_score"],
            "match": is_match,
            "front_view_time": front_view_time,
            "total_class_time": total_class_time,
            "total_sleep_time": total_sleep_time,
            "elapsed_time": elapsed_time,
            "total_blinks": total_blinks,
            "mis_matched_duration": mis_matched_duration,
        }

    except ValueError as e:
        print(f"ValueError in process_frame_with_matching: {e}")
        return {"error": f"ValueError: {str(e)}"}

    except Exception as e:
        print(f"Unexpected error in process_frame_with_matching: {e}")
        return {"error": f"Unexpected error: {str(e)}"}


def process_frame(frame, elapsed_time, focus_tracker, blink_tracker):
    try:
        # Mediapipe로 얼굴 감지
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
            results = face_detection.process(rgb_frame)

        if not results.detections:
            print("No faces detected.")
            return {"error": "얼굴이 감지되지 않았습니다."}

        # Mediapipe로 감지된 첫 번째 얼굴의 바운딩 박스 추출
        detection = results.detections[0]
        bboxC = detection.location_data.relative_bounding_box
        h, w, _ = frame.shape

        # 바운딩 박스 좌표 계산
        x, y, width, height = (
            max(0, int(bboxC.xmin * w)),
            max(0, int(bboxC.ymin * h)),
            max(0, int(bboxC.width * w)),
            max(0, int(bboxC.height * h)),
        )

        print(f"Bounding Box: x={x}, y={y}, width={width}, height={height}")

        # dlib 바운딩 박스로 변환
        dlib_rect = dlib.rectangle(x, y, x + width, y + height)

        # 바운딩 박스 유효성 검사
        if dlib_rect.width() <= 0 or dlib_rect.height() <= 0:
            print("Invalid bounding box.")
            return {"error": "유효하지 않은 바운딩 박스입니다."}

        # dlib 랜드마크 추출
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        try:
            landmarks = predictor(gray, dlib_rect)
        except Exception as e:
            print(f"Error extracting landmarks: {e}")
            return {"error": f"랜드마크 추출 실패: {str(e)}"}

        # 랜드마크 유효성 검사
        if landmarks.num_parts != 68:
            print(f"Unexpected number of landmarks: {landmarks.num_parts}")
            return {"error": "랜드마크의 점 개수가 잘못되었습니다."}

        print(f"Landmarks detected: {landmarks.num_parts} points")

        # Head Turn Detection
        try:
            direction = detect_head_turn(landmarks, frame.shape[1], frame.shape[0], elapsed_time, focus_tracker)
        except Exception as e:
            print(f"Error in head turn detection: {e}")
            return {"error": f"Head Turn Detection 오류: {str(e)}"}

        # Blink Detection
        try:
            EAR_THRESH = blink_tracker.get("EAR_THRESH", 0.25)  # 기본값 설정
            blink_start = blink_tracker.get("blink_start")
            blink_count = blink_tracker.get("blink_count", 0)
            eyes_closed = blink_tracker.get("eyes_closed", False)
            frames_closed = blink_tracker.get("frames_closed", 0)

            EAR_THRESH, blink_start, blink_count, eyes_closed, current_state, frames_closed = detect_eye_blink(
                landmarks, frame.shape[1], frame.shape[0], EAR_THRESH, SLEEP_TIME=2.0,
                blink_start=blink_start, blink_count=blink_count,
                eyes_closed=eyes_closed, frames_closed=frames_closed
            )

            # Blink Tracker 업데이트
            blink_tracker.update({
                "EAR_THRESH": EAR_THRESH,
                "blink_start": blink_start,
                "blink_count": blink_count,
                "eyes_closed": eyes_closed,
                "frames_closed": frames_closed,
            })
            print("Updated Blink Tracker:", blink_tracker)

        except Exception as e:
            print(f"Error in blink detection: {e}")
            return {"error": f"Blink Detection 오류: {str(e)}"}

        # 총 점수 계산
        try:
            total_time = sum(focus_tracker.values())
            front_view_time = focus_tracker["front"]
            ht_point = cal_headturn(front_view_time, total_time)
        except Exception as e:
            print(f"Error calculating head turn points: {e}")
            return {"error": f"Head Turn 점수 계산 오류: {str(e)}"}

        return {
            "direction": direction,
            "focus_tracker": focus_tracker,
            "blink_tracker": blink_tracker,
            "head_turn_score": ht_point,
            "blink_count": blink_count,
            "current_state": current_state,
        }

    except Exception as e:
        print(f"Unexpected error in process_frame: {e}")
        return {"error": f"처리 중 예상치 못한 오류 발생: {str(e)}"}

# Example Usage
if __name__ == "__main__":
    cap = cv2.VideoCapture(0)
    focus_tracker = {"front": 0, "left": 0, "right": 0}
    blink_tracker = {
        "EAR_THRESH": None,
        "calibration_start": time.time(),
        "calibration_ears": [],
        "blink_count": 0,
        "frames_closed": 0
    }

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        elapsed_time = 0.1  # Simulate 0.1 seconds per frame
        mis_matched_duration = 0  # Replace with actual mismatch duration logic
        registered_embedding = np.random.rand(128)  # Example embedding (replace with actual database embedding)

        # Simulate user embedding (e.g., extracted from frame)
        user_embedding = np.random.rand(128)

        result = process_frame_with_matching(
            frame,
            user_embedding,
            registered_embedding,
            focus_tracker,
            blink_tracker,
            elapsed_time,
            mis_matched_duration,
        )

        if "error" in result:
            print(result["error"])
        else:
            print(f"Direction: {result['direction']}")
            print(f"Focus Tracker: {result['focus_tracker']}")
            print(f"Head Turn Score: {result['head_turn_score']}")
            print(f"Blink Count: {result['blink_count']}")
            print(f"Current State: {result['current_state']}")
            print(f"Total Score: {result['total_score']}")
            print(f"Match: {result['match']}")
            print(f"Similarity: {result['similarity']}")

        cv2.imshow("Frame", frame)
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()

