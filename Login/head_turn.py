import math

# Detect Head Turn
def detect_head_turn(facial_landmarks, w, h):
    nose_tip = facial_landmarks.landmark[1]
    left_eye_outer = facial_landmarks.landmark[33]
    right_eye_outer = facial_landmarks.landmark[263]

    # Convert to pixel coordinates
    nose_x, nose_y = int(nose_tip.x * w), int(nose_tip.y * h)
    left_x, left_y = int(left_eye_outer.x * w), int(left_eye_outer.y * h)
    right_x, right_y = int(right_eye_outer.x * w), int(right_eye_outer.y * h)

    # Compute midpoint between the eyes
    eye_mid_x = (left_x + right_x) / 2
    eye_mid_y = (left_y + right_y) / 2

    # Calculate angle
    dx, dy = nose_x - eye_mid_x, nose_y - eye_mid_y
    angle = math.atan2(dy, dx) * 180 / math.pi
    if angle < 0:
        angle += 360

    # Determine head direction
    if 55 <= angle <= 125:
        return "center"
    elif angle < 55:
        return "right"
    else:
        return "left"
