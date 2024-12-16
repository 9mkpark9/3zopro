import cv2
import mediapipe as mp
import time
from eye_blink import detect_eye_blink
from head_turn import detect_head_turn
from PIL import Image, ImageDraw, ImageFont
import numpy as np

# Initialize Mediapipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False, max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5
)

# Draw Korean text using PIL
def draw_text_kor(image, text, position):
    # Convert OpenCV image (BGR) to Pillow image (RGB)
    pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_image)
    
    # Use a font that supports Korean (ensure you have a Korean font like NanumGothic)
    font = ImageFont.truetype("C:/Windows/Fonts/NGULIM.TTF", 32)  # You can replace with the font path on your system
    
    # Draw text on image
    draw.text(position, text, font=font, fill=(0, 0, 0))

    # Convert back to OpenCV image (BGR)
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

def main():
    SLEEP_TIME = 5.0
    CALIBRATION_TIME = 5.0
    calibration_start = time.time()
    calibration_ears = []
    EAR_THRESH = None
    blink_start = None

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("카메라를 열 수 없습니다.")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        frame = cv2.flip(frame, 1)

        display_texts = []

        if results.multi_face_landmarks:
            for facial_landmarks in results.multi_face_landmarks:
                h, w, _ = frame.shape

                # Eye Blink Detection
                EAR_THRESH, blink_start, current_state, calibration_message = detect_eye_blink(
                    facial_landmarks, w, h, EAR_THRESH, SLEEP_TIME,
                    CALIBRATION_TIME, calibration_start, calibration_ears, blink_start
                )

                # Head Turn Detection
                head_direction = detect_head_turn(facial_landmarks, w, h)

                # Prepare Display Text
                if calibration_message:
                    display_texts.append(calibration_message)
                display_texts.append(f"머리 방향: {head_direction}, 상태: {current_state}")

        # Display all text without overlapping
        for i, text in enumerate(display_texts):
            frame = draw_text_kor(frame, text, (10, 30 + i * 40))

        # Show the frame
        cv2.imshow("Test", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
