import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Load Korean font
FONT_PATH = "C:/Windows/Fonts/NGULIM.TTF"
FONT = ImageFont.truetype(FONT_PATH, 24)

# Draw Korean Text
def draw_text_kor(frame, text, pos, color=(0, 255, 0)):
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(frame_rgb)
    draw = ImageDraw.Draw(pil_img)
    draw.text(pos, text, font=FONT, fill=(color[2], color[1], color[0]))
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
