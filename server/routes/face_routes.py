from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
from services.face_service import FaceService
from services.reid_service import ReIDService
import json
import base64

router = APIRouter(prefix="/face", tags=["face"])

face_service = FaceService()
reid_service = ReIDService()

@router.post("/face-login")
async def face_login_endpoint(image: UploadFile = File(...)):
    try:
        # 이미지 디코딩 및 얼굴 감지
        image_bytes = np.frombuffer(await image.read(), np.uint8)
        frame = cv2.imdecode(image_bytes, cv2.COLOR_BGR2RGB)
        
        result = await face_service.process_face_login(frame)
        if not result["match"]:
            return JSONResponse(
                content={"match": False, "error": "No match found"},
                status_code=400
            )
            
        return result
        
    except ValueError as ve:
        return JSONResponse(
            content={"error": str(ve)},
            status_code=400
        )
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )

@router.post("/capture-face")
async def capture_face(images: list[UploadFile] = File(...)):
    try:
        embeddings = []
        detected_faces = 0
        total_images = len(images)

        for image in images:
            image_bytes = np.frombuffer(await image.read(), np.uint8)
            frame = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
            
            embedding = await face_service.process_face_capture(frame)
            if embedding is not None:
                detected_faces += 1
                embeddings.append(embedding)

        # 얼굴 감지 실패 확인
        if not embeddings:
            raise HTTPException(status_code=400, detail="얼굴이 감지되지 않았습니다.")

        # 얼굴 감지 비율 계산
        detection_rate = detected_faces / total_images
        if detection_rate < 0.67:
            raise HTTPException(
                status_code=400,
                detail=f"얼굴 감지 비율이 너무 낮습니다. 감지된 비율: {detection_rate:.2%}"
            )

        # 임베딩 평균 계산
        average_embedding = np.mean(embeddings, axis=0)
        return {"embedding": average_embedding.tolist()}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ReID 관련 엔드포인트
@router.post("/reid/start")
async def start_reid():
    try:
        success = await reid_service.start_tracking()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reid/stop")
async def stop_reid():
    try:
        success = await reid_service.stop_tracking()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reid/data")
async def get_reid_data():
    try:
        data = await reid_service.get_latest_data()
        if not data.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=data.get("error", "ReID 데이터를 가져올 수 없습니다.")
            )
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reid/capture")
async def capture_reid_objects():
    try:
        success = await reid_service.capture_objects()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reid/recognize")
async def recognize_reid_objects():
    try:
        success = await reid_service.recognize_objects()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reid/update-name")
async def update_reid_name(track_id: int, student_id: str):
    try:
        success = await reid_service.update_name(track_id, student_id)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 