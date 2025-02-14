import cv2
import dlib
import numpy as np
import time
import os
import json
import base64
import sys
from uc import (
    detect_head_turn,
    detect_eye_blink,
    calculate_total_score
)

# dlib 초기화
detector = dlib.get_frontal_face_detector()
current_dir = os.path.dirname(os.path.abspath(__file__))
predictor_path = os.path.join(current_dir, "shape_predictor_68_face_landmarks.dat")
predictor = dlib.shape_predictor(predictor_path)

def encode_frame(frame):
    _, buffer = cv2.imencode('.jpg', frame)
    return base64.b64encode(buffer).decode('utf-8')

def main():
    # 웹캠 초기화
    cap = cv2.VideoCapture(0)
    
    # 트래커 초기화
    focus_tracker = {"front": 0, "left": 0, "right": 0}
    blink_tracker = {
        "EAR_THRESH": 0.25,
        "blink_start": None,
        "blink_count": 0,
        "eyes_closed": False,
        "frames_closed": 0
    }
    
    # 시간 측정 초기화
    start_time = time.time()
    mis_matched_duration = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 그레이스케일 변환
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 얼굴 감지
        faces = detector(gray)
        
        # 현재까지 경과 시간
        elapsed_time = time.time() - start_time
        
        if len(faces) > 0:
            # 첫 번째 얼굴에 대해 처리
            face = faces[0]
            
            # 랜드마크 추출
            landmarks = predictor(gray, face)
            
            # 머리 방향 감지
            direction = detect_head_turn(
                landmarks,
                frame.shape[1],
                frame.shape[0],
                0.1,  # 프레임당 시간
                focus_tracker
            )
            
            # 눈 깜빡임 감지
            EAR_THRESH, blink_start, blink_count, eyes_closed, state, frames_closed = detect_eye_blink(
                landmarks,
                frame.shape[1],
                frame.shape[0],
                blink_tracker["EAR_THRESH"],
                2.0,  # SLEEP_TIME
                blink_tracker["blink_start"],
                blink_tracker["blink_count"],
                blink_tracker["eyes_closed"],
                blink_tracker["frames_closed"]
            )
            
            # 트래커 업데이트
            blink_tracker.update({
                "EAR_THRESH": EAR_THRESH,
                "blink_start": blink_start,
                "blink_count": blink_count,
                "eyes_closed": eyes_closed,
                "frames_closed": frames_closed
            })
            
            # 점수 계산
            scores = calculate_total_score(
                focus_tracker["front"],
                sum(focus_tracker.values()),
                blink_tracker["frames_closed"],
                elapsed_time,
                blink_tracker["blink_count"],
                mis_matched_duration
            )
            
            # 화면에 정보 표시
            cv2.putText(frame, f"Direction: {direction}", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Total Score: {scores['total_score']}", (10, 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Blinks: {blink_tracker['blink_count']}", (10, 90),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # 랜드마크 포인트 표시
            for n in range(68):
                x = landmarks.part(n).x
                y = landmarks.part(n).y
                cv2.circle(frame, (x, y), 2, (0, 255, 0), -1)
            
            # 실시간 모니터링 데이터 전송
            monitoring_data = {
                "type": "monitoring",
                "direction": direction,
                "total_score": scores['total_score'],
                "ht_point": scores['ht_point'],
                "sleep_point": scores['sleep_point'],
                "blink_points": scores['blink_points'],
                "blink_count": blink_tracker['blink_count'],
                "frame": encode_frame(frame)
            }
            print(json.dumps(monitoring_data))
            sys.stdout.flush()
        
        # 프레임 표시
        cv2.imshow("Student Focus Monitoring", frame)
        
        # ESC 키로 종료
        if cv2.waitKey(1) & 0xFF == 27:
            # 최종 결과 전송
            final_result = {
                "type": "final",
                "total_time": elapsed_time,
                "front_time": focus_tracker['front'],
                "blink_count": blink_tracker['blink_count'],
                "total_score": scores['total_score'],
                "ht_point": scores['ht_point'],
                "sleep_point": scores['sleep_point'],
                "blink_points": scores['blink_points']
            }
            print(json.dumps(final_result))
            sys.stdout.flush()
            break
    
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
