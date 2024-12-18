import cv2
import mediapipe as mp
import time

from calculate import cal_headturn
from eye_blink import detect_eye_blink
from head_turn import detect_head_turn
from draw_utils import draw_text_kor
from time_measurement import initialize_time_variables, update_sleep_time, update_turn_time  # ### CHANGED ###
from calculate import cal_headturn, cal_sleeptime, cal_blinks_per_minute, cal_blink_points, totalscore

# Initialize Mediapipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False, max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5
)

def main():
    SLEEP_TIME = 2.0
    CALIBRATION_TIME = 5.0
    calibration_start = time.time()
    calibration_ears = []
    EAR_THRESH = None
    blink_start = None
    blink_count = 0
    eyes_closed = False

    # Previously, time variables were defined directly here.
    # Now, we initialize them using a separate function.
    # ### CHANGED ###
    start_time, total_sleep_time, sleep_start, total_turn_time, turn_start = initialize_time_variables()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("카메라를 열 수 없습니다.")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        current_time = time.time()
        elapsed_time = current_time - start_time

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        frame = cv2.flip(frame, 1)

        display_texts = []

        if results.multi_face_landmarks:
            for facial_landmarks in results.multi_face_landmarks:
                h, w, _ = frame.shape

                EAR_THRESH, blink_start, blink_count, eyes_closed, current_state, calibration_message = detect_eye_blink(
                    facial_landmarks, w, h, EAR_THRESH, SLEEP_TIME, CALIBRATION_TIME,
                    calibration_start, calibration_ears, blink_start, blink_count, eyes_closed
                )

                head_direction = detect_head_turn(facial_landmarks, w, h)

                # Instead of updating sleep and turn times inline,
                # we now call separate functions from the time_measurement module.
                sleep_start, total_sleep_time = update_sleep_time(current_state, sleep_start, total_sleep_time, current_time)
                turn_start, total_turn_time = update_turn_time(head_direction, turn_start, total_turn_time, current_time)

                if calibration_message:
                    display_texts.append(calibration_message)
                display_texts.append(f"머리 방향: {head_direction}, 상태: {current_state}, blinks: {blink_count}")

                current_sleep = 0 if sleep_start is None else (current_time - sleep_start)
                current_turn = 0 if turn_start is None else (current_time - turn_start)

                display_texts.append(f"총 녹화 시간: {int(elapsed_time)}s")
                display_texts.append(f"총 수면 시간: {int(total_sleep_time + current_sleep)}s")
                display_texts.append(f"총 고개 돌린 시간: {int(total_turn_time + current_turn)}s")

        for i, text in enumerate(display_texts):
            frame = draw_text_kor(frame, text, (10, 30 + i * 40))

        cv2.imshow("personal cam", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # Final cleanup if sleeping or turning at the end
    if sleep_start is not None:
        total_sleep_time += (time.time() - sleep_start)
    if turn_start is not None:
        total_turn_time += (time.time() - turn_start)

    cap.release()
    cv2.destroyAllWindows()
    # 수면점수
    sleep_point = cal_sleeptime(total_sleep_time, elapsed_time)

    # 고개돌림
    ht_point = cal_headturn(int(elapsed_time-total_turn_time), int(elapsed_time))

    # 눈 깜박임
    blink_perm = cal_blinks_per_minute(blink_count, elapsed_time)
    blink_point = cal_blink_points(int(blink_perm))

    total = totalscore(sleep_point, ht_point, blink_point)
    print(int(elapsed_time))
    print(int(total_sleep_time))
    print(int(total_turn_time))
    print(f"집중 점수 : {total}")


if __name__ == "__main__":
    main()