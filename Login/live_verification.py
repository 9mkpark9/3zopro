import cv2
from face_processing import FaceProcessingThread
from video_capture import VideoCaptureThread

def verify_face_live(user_id):
    try:
        video_capture = VideoCaptureThread()
        video_capture.start()

        if not video_capture.capture.isOpened():
            print("Error: Unable to access the camera.")
            video_capture.stop()
            return

        processing_thread = FaceProcessingThread(video_capture, user_id)
        processing_thread.start()

        while True:
            frame = processing_thread.frame_to_display
            if frame is not None:
                cv2.imshow("Face Verification", frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        video_capture.stop()
        processing_thread.stop()
        cv2.destroyAllWindows()

    except RuntimeError as e:
        print(f"Runtime Error: {e}")