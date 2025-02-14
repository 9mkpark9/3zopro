from fastapi import APIRouter, WebSocket, UploadFile, File, Form
from fastapi.responses import JSONResponse
from services.reid_service import ReIDService
import asyncio
import sys

router = APIRouter(prefix="/reid", tags=["reid"])
reid_service = ReIDService()

@router.get("/data")
async def get_reid_data():
    """현재 프레임 데이터 요청"""
    try:
        data = await reid_service.get_latest_data()
        return data
    except Exception as e:
        print(f"데이터 요청 처리 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/start")
async def start_reid():
    """ReID 트래킹 시작"""
    try:
        result = await reid_service.start_tracking()
        return JSONResponse(content=result)
    except Exception as e:
        print(f"시작 요청 처리 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/stop")
async def stop_reid():
    """ReID 트래킹 중지"""
    try:
        result = await reid_service.stop_tracking()
        return JSONResponse(content=result)
    except Exception as e:
        print(f"정지 요청 처리 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/capture")
async def capture_objects():
    """객체 캡처"""
    try:
        result = await reid_service.capture_objects()
        return JSONResponse(content=result)
    except Exception as e:
        print(f"캡처 요청 처리 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/recognize")
async def recognize_objects():
    """객체 인식"""
    try:
        result = await reid_service.recognize_objects()
        return JSONResponse(content=result)
    except Exception as e:
        print(f"인식 요청 처리 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.get("/status")
async def get_status():
    return reid_service.get_status()

@router.post("/monitor")
async def monitor_frame(frame: UploadFile = File(...), groupId: str = Form(...), classId: str = Form(...)):
    try:
        contents = await frame.read()
        result = await reid_service.monitor_frame(contents, groupId, classId)
        return JSONResponse(content=result)
    except Exception as e:
        print(f"모니터링 요청 처리 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/update_name")
async def update_name(track_id: int, student_id: str):
    """학번 업데이트"""
    try:
        result = await reid_service.update_name(track_id, student_id)
        return JSONResponse(content=result)
    except Exception as e:
        print(f"학번 업데이트 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/update_max_members")
async def update_max_members(max_members: int):
    try:
        result = await reid_service.update_max_members(max_members)
        return JSONResponse(content=result)
    except Exception as e:
        print(f"최대 인원 업데이트 오류: {str(e)}", file=sys.stderr)
        return JSONResponse(content={
            "success": False,
            "error": str(e)
        })

@router.post("/check_student_id")
async def check_student_id(student_id: str):
    return await reid_service.check_student_id(student_id)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 연결"""
    await websocket.accept()
    reid_service.clients.add(websocket)
    try:
        while True:
            data = await reid_service.get_latest_data()
            if data["success"]:
                await websocket.send_json(data)
            await asyncio.sleep(0.033)  # ~30 FPS
    except Exception as e:
        print(f"WebSocket 오류: {str(e)}", file=sys.stderr)
    finally:
        reid_service.clients.remove(websocket) 