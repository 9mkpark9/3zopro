from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from config.database import get_db
from models.member import Member
from models.department import Department
from utils.face_signup import facenet, mp_face_detection
from scipy.spatial.distance import cosine
import cv2
import numpy as np
import json

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)

@router.post("/face-login")
async def face_login_endpoint(image: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        # 이미지 디코딩 및 얼굴 감지
        image_bytes = np.frombuffer(await image.read(), np.uint8)
        frame = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
        
        with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_detection.process(rgb_frame)

            if results.detections:
                bboxC = results.detections[0].location_data.relative_bounding_box
                h, w, _ = frame.shape
                x, y, width, height = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)

                if width > 0 and height > 0 and x >= 0 and y >= 0 and (x + width) <= w and (y + height) <= h:
                    face = frame[y:y+height, x:x+width]
                    
                    if face.size == 0:
                        raise HTTPException(status_code=400, detail="Detected face area is empty.")

                    face_resized = cv2.resize(face, (160, 160))
                    new_embedding = facenet.embeddings(np.expand_dims(face_resized, axis=0))[0]
                    new_embedding = np.squeeze(new_embedding)

                    # Member와 Department 테이블을 d_id로 JOIN
                    users = db.query(Member, Department)\
                             .join(Department, Member.d_id == Department.d_id)\
                             .all()

                    for user, department in users:
                        try:
                            decoded_m_face = user.m_face.decode('utf-8')
                            stripped_m_face = decoded_m_face.strip('"')
                            registered_embedding = json.loads(stripped_m_face)
                            registered_embedding = np.squeeze(np.array(registered_embedding, dtype=float))

                            similarity = 1 - cosine(new_embedding, registered_embedding)
                            print(f"User {user.m_id} similarity: {similarity}")

                            if similarity >= 0.80:
                                return {
                                    "match": True,
                                    "user": {
                                        "id": user.m_id,
                                        "name": user.m_name,
                                        "department_id": user.d_id,
                                        "department": department.d_name,
                                        "is_student": user.is_student,
                                    },
                                }
                        except json.JSONDecodeError:
                            print(f"JSON decoding error for user {user.m_id}")
                            continue
                        except Exception as e:
                            print(f"Error processing m_face for user {user.m_id}: {e}")
                            continue

        return {"match": False, "error": "No match found"}
    except Exception as e:
        print(f"Error in face-login: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 