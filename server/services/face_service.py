import cv2
import mediapipe as mp
from keras_facenet import FaceNet
import numpy as np
from sqlalchemy.orm import Session
from config.database import SessionLocal
from models.member import Member
import os
import tensorflow as tf
from utils.face_signup import facenet, mp_face_detection

class FaceService:
    def __init__(self):
        # TensorFlow 로그 레벨 설정
        os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
        tf.get_logger().setLevel('ERROR')
        
        # FaceNet 및 MediaPipe 초기화
        self.facenet = FaceNet()
        self.mp_face_detection = mp.solutions.face_detection
        self.mp_drawing = mp.solutions.drawing_utils

    async def process_face_login(self, frame):
        db = SessionLocal()
        try:
            with self.mp_face_detection.FaceDetection(
                model_selection=1, min_detection_confidence=0.5
            ) as face_detection:
                
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_detection.process(rgb_frame)

                if not results.detections:
                    return {"match": False, "error": "얼굴이 감지되지 않았습니다."}

                # 첫 번째 감지된 얼굴 사용
                detection = results.detections[0]
                bboxC = detection.location_data.relative_bounding_box
                h, w, _ = frame.shape
                x = int(bboxC.xmin * w)
                y = int(bboxC.ymin * h)
                width = int(bboxC.width * w)
                height = int(bboxC.height * h)

                # 얼굴 영역 추출 및 크기 조정
                face = frame[y:y+height, x:x+width]
                face_resized = cv2.resize(face, (160, 160))
                
                # 임베딩 생성
                new_embedding = self.facenet.embeddings(
                    np.expand_dims(face_resized, axis=0)
                )[0]

                # DB에서 모든 사용자 조회
                users = db.query(Member).filter(Member.m_face.isnot(None)).all()
                best_match = None
                best_similarity = -1

                for user in users:
                    try:
                        # 저장된 임베딩 디코딩
                        stored_embedding = np.array(
                            eval(user.m_face.decode('utf-8')), 
                            dtype=float
                        )
                        
                        # 코사인 유사도 계산
                        similarity = np.dot(new_embedding, stored_embedding) / (
                            np.linalg.norm(new_embedding) * 
                            np.linalg.norm(stored_embedding)
                        )

                        if similarity > best_similarity:
                            best_similarity = similarity
                            best_match = user

                    except Exception as e:
                        print(f"임베딩 비교 중 오류: {str(e)}")
                        continue

                # 매칭 결과 반환
                if best_match and best_similarity > 0.80:
                    return {
                        "match": True,
                        "user": {
                            "id": best_match.m_id,
                            "name": best_match.m_name,
                            "department_id": best_match.d_id,
                            "is_student": best_match.is_student,
                        }
                    }
                return {"match": False, "error": "일치하는 사용자를 찾을 수 없습니다."}

        except Exception as e:
            print(f"얼굴 로그인 처리 중 오류: {str(e)}")
            return {"match": False, "error": str(e)}
        finally:
            db.close()

    async def process_face_capture(self, frame):
        try:
            with self.mp_face_detection.FaceDetection(
                model_selection=1, min_detection_confidence=0.5
            ) as face_detection:
                
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_detection.process(rgb_frame)

                if not results.detections:
                    return None

                detection = results.detections[0]
                bboxC = detection.location_data.relative_bounding_box
                h, w, _ = frame.shape
                x = int(bboxC.xmin * w)
                y = int(bboxC.ymin * h)
                width = int(bboxC.width * w)
                height = int(bboxC.height * h)

                face = frame[y:y+height, x:x+width]
                face_resized = cv2.resize(face, (160, 160))
                
                embedding = self.facenet.embeddings(
                    np.expand_dims(face_resized, axis=0)
                )[0]
                
                return embedding

        except Exception as e:
            print(f"얼굴 캡처 처리 중 오류: {str(e)}")
            return None 