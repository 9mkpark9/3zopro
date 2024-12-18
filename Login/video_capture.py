import cv2
import threading

class VideoCaptureThread(threading.Thread):
    def __init__(self, video_source=0):
        super().__init__()
        self.capture = cv2.VideoCapture(video_source)
        if not self.capture.isOpened():
            raise RuntimeError(f"Error: Unable to access the camera at index {video_source}.")
        self.frame = None
        self.running = True

    def run(self):
        while self.running:
            ret, frame = self.capture.read()
            if ret:
                self.frame = cv2.flip(frame, 1)  # 미러 모드 적용
            else:
                print("Error: Failed to grab frame.")
        self.capture.release()

    def read(self):
        return self.frame

    def stop(self):
        self.running = False
        self.join()