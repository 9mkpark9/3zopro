import aiohttp
import json
from typing import Dict, Any
from utils.reid import PersonTracker
import cv2
import base64
import queue
import threading
import time
import sys
import numpy as np
from fastapi import WebSocket
from fastapi import WebSocketDisconnect

class ReIDService:
    def __init__(self):
        self.tracker = None
        self.is_running = False
        self.frame_queue = queue.Queue(maxsize=30)  # 버퍼 크기 증가
        self.clients = set()
        self.lock = threading.Lock()
        self.camera = None
        self.lecture_active = False
        self.tracking_thread = None
        self.frame_interval = 1.0 / 30  # 30 FPS
        self.last_frame_time = 0
        print("ReID 서비스 초기화 완료", file=sys.stderr)

    async def start_tracking(self):
        """트래킹 시작"""
        try:
            if self.is_running:
                return {
                    "success": True,
                    "message": "ReID 시스템이 이미 실행 중입니다.",
                    "server_status": self.get_status()
                }

            print("트래킹 시작 중...", file=sys.stderr)
            
            try:
                # 트래커 초기화
                self.tracker = PersonTracker()
                
                # 모델 초기화 먼저 수행
                print("모델 초기화 시작...", file=sys.stderr)
                if not self.tracker.initialize_models():
                    raise Exception("모델 초기화에 실패했습니다.")
                print("모델 초기화 완료", file=sys.stderr)
                
                # 카메라 초기화
                self.camera = cv2.VideoCapture(1)  # 기본 웹캠 우선
                if not self.camera.isOpened():
                    self.camera = cv2.VideoCapture(0)  # 외부 카메라 시도
                    if not self.camera.isOpened():
                        raise Exception("카메라를 열 수 없습니다.")
                
                # 카메라 설정
                self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                self.camera.set(cv2.CAP_PROP_FPS, 30)
                
                # 상태 업데이트
                self.is_running = True
                self.lecture_active = True
                
                # 트래킹 스레드 시작
                self.tracking_thread = threading.Thread(target=self._tracking_loop, daemon=True)
                self.tracking_thread.start()
                
                return {
                    "success": True,
                    "message": "ReID 시스템이 시작되었습니다.",
                    "server_status": self.get_status()
                }
                
            except Exception as e:
                print(f"초기화 오류: {str(e)}", file=sys.stderr)
                if self.camera:
                    self.camera.release()
                if self.tracker:
                    self.tracker = None
                raise e
            
        except Exception as e:
            print(f"트래킹 시작 오류: {str(e)}", file=sys.stderr)
            self.is_running = False
            self.lecture_active = False
            return {
                "success": False,
                "error": f"ReID 시스템 시작 실패: {str(e)}",
                "server_status": self.get_status()
            }

    def _tracking_loop(self):
        print("트래킹 루프 시작", file=sys.stderr)
        try:
            last_log_time = 0
            last_frame_time = 0
            frame_interval = 1.0 / 30  # 30 FPS
            
            while self.is_running:
                if not self.camera or not self.camera.isOpened():
                    print("카메라가 열려있지 않음", file=sys.stderr)
                    break

                current_time = time.time()
                
                # 프레임 처리 간격 제어
                if current_time - last_frame_time < frame_interval:
                    time.sleep(0.001)  # CPU 사용률 감소
                    continue
                    
                last_frame_time = current_time

                ret, frame = self.camera.read()
                if not ret:
                    continue

                try:
                    if self.tracker:
                        # 프레임을 정사각형으로 리사이즈 (패딩 추가)
                        h, w = frame.shape[:2]
                        size = 640
                        
                        # 가로세로 비율 유지하면서 리사이즈
                        ratio = size / max(h, w)
                        new_h, new_w = int(h * ratio), int(w * ratio)
                        frame = cv2.resize(frame, (new_w, new_h))
                        
                        # 검은색 정사각형 이미지 생성
                        square = np.zeros((size, size, 3), dtype=np.uint8)
                        
                        # 중앙에 리사이즈된 이미지 배치
                        y_offset = (size - new_h) // 2
                        x_offset = (size - new_w) // 2
                        square[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = frame
                        
                        # 처리를 위해 복사본 저장
                        self.tracker.current_frame = square.copy()
                        self.tracker.process_frame(square)
                        
                except Exception as e:
                    print(f"프레임 처리 중 오류: {str(e)}", file=sys.stderr)
                    continue
                    
        except Exception as e:
            print(f"트래킹 루프 오류: {str(e)}", file=sys.stderr)
        finally:
            if self.camera:
                self.camera.release()
            print("트래킹 루프 종료", file=sys.stderr)

    async def stop_tracking(self):
        try:
            if self.is_running:
                self.is_running = False
                self.lecture_active = False
                
                # 트래킹 스레드 정리
                if self.tracking_thread and self.tracking_thread.is_alive():
                    self.tracking_thread.join(timeout=1.0)
                
                # 카메라 정리
                if self.camera:
                    self.camera.release()
                
                self.tracker = None
                return {
                    "success": True,
                    "message": "ReID 시스템이 중지되었습니다.",
                    "server_status": self.get_status()
                }
            return {
                "success": False,
                "error": "ReID 시스템이 실행중이지 않습니다.",
                "server_status": self.get_status()
            }
        except Exception as e:
            print(f"정지 오류: {str(e)}", file=sys.stderr)
            return {
                "success": False,
                "error": str(e),
                "server_status": self.get_status()
            }

    async def get_latest_data(self):
        try:
            if not self.is_running or not self.tracker:
                return {
                    'success': False,
                    'error': 'ReID is not running',
                    'server_status': self.get_status()
                }

            try:
                # 트래커에서 현재 프레임 데이터 가져오기
                data = self.tracker.get_frame_data()
                if data and isinstance(data, dict):
                    # 프레임을 base64로 인코딩
                    frame = data.get('frame')
                    if isinstance(frame, np.ndarray):
                        _, buffer = cv2.imencode('.jpg', frame)
                        frame_base64 = base64.b64encode(buffer).decode('utf-8')
                    else:
                        frame_base64 = None

                    # 멤버 정보 구성
                    members = []
                    for member in data.get('members', []):
                        members.append({
                            'id': member.get('id'),
                            'student_id': member.get('student_id', '미지정'),
                            'status': member.get('status', '미인식'),
                            'duration': member.get('duration', '0분'),
                            'is_present': member.get('status') == '출석'
                        })

                    return {
                        'success': True,
                        'frame': frame_base64,
                        'members': members,
                        'stats': {
                            'total_members': len(members),
                            'present_members': len([m for m in members if m['is_present']]),
                            'avg_duration': data.get('stats', {}).get('avg_duration', '0분')
                        },
                        'activities': data.get('logs', []),
                        'server_status': self.get_status()
                    }

                return {
                    'success': False,
                    'error': 'Invalid frame data',
                    'server_status': self.get_status()
                }

            except Exception as e:
                print(f"데이터 처리 오류: {str(e)}", file=sys.stderr)
                return {
                    'success': False,
                    'error': str(e),
                    'server_status': self.get_status()
                }

        except Exception as e:
            print(f"데이터 가져오기 오류: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'error': str(e),
                'server_status': self.get_status()
            }

    async def capture_objects(self):
        try:
            if not self.is_running or not self.tracker:
                return {"success": False, "error": "ReID is not running"}
            
            # 현재 인식된 객체 수 확인
            current_data = self.tracker.get_frame_data()
            if current_data.get('success') and current_data.get('members'):
                current_count = len([m for m in current_data['members'] if m['status'] == '출석'])
                
                # 최대 인원 초과 확인
                if current_count > self.tracker.max_id:
                    return {
                        "success": False,
                        "error": f"최대 인원({self.tracker.max_id}명)을 초과하여 캡처할 수 없습니다."
                    }
            
            # 캡처 실행
            success = self.tracker.capture_objects()
            
            if success:
                # 캡처 후 최신 데이터 가져오기
                updated_data = await self.get_latest_data()
                
                # WebSocket 클라이언트들에게 업데이트된 데이터 브로드캐스트
                if self.clients:
                    await self.broadcast_data()
                
                return {
                    "success": True,
                    "message": "캡처 성공",
                    "data": updated_data
                }
            else:
                return {
                    "success": False,
                    "error": "캡처 실패"
                }
            
        except Exception as e:
            print(f"캡처 오류: {str(e)}", file=sys.stderr)
            return {"success": False, "error": str(e)}

    async def recognize_objects(self):
        try:
            if not self.is_running or not self.tracker:
                return {"success": False, "error": "ReID is not running"}
            
            # 현재 인식된 객체 수 확인
            current_data = self.tracker.get_frame_data()
            if current_data.get('success') and current_data.get('members'):
                current_count = len([m for m in current_data['members'] if m['status'] == '출석'])
                
                # 최대 인원 초과 확인
                if current_count > self.tracker.max_id:
                    return {
                        "success": False,
                        "error": f"최대 인원({self.tracker.max_id}명)을 초과하여 인식할 수 없습니다."
                    }
            
            success = self.tracker.recognize_objects()
            return {"success": success}
            
        except Exception as e:
            print(f"인식 오류: {str(e)}")
            return {"success": False, "error": str(e)}

    async def update_name(self, track_id: int, student_id: str):
        try:
            if not self.is_running or not self.tracker:
                return {"success": False, "error": "Not running"}
            success = self.tracker.update_name(track_id, student_id)
            return {"success": success}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def update_max_members(self, max_members: int):
        try:
            if not self.is_running or not self.tracker:
                return {"success": False, "error": "Not running"}
            success = self.tracker.update_max_members(max_members)
            return {"success": success}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def check_student_id(self, student_id: str):
        """학번 중복 확인"""
        try:
            if not student_id:
                return {
                    "success": False,
                    "error": "학번이 제공되지 않았습니다."
                }
            
            if not student_id.isdigit() or len(student_id) != 9:
                return {
                    "success": False,
                    "error": "올바른 학번 형식이 아닙니다 (9자리 숫자)"
                }
            
            # 현재 등록된 모든 학번 확인
            exists = False
            if self.tracker:
                # members 딕셔너리에서 확인
                for member in self.tracker.members.values():
                    if member.get('student_id') == student_id:
                        exists = True
                        break
                    
                # member_names에서도 확인
                if not exists:
                    for stored_id in self.tracker.member_names.values():
                        if stored_id == student_id:
                            exists = True
                            break
            
            return {
                "success": True,
                "exists": exists,
                "message": "이미 등록된 학번입니다." if exists else "사용 가능한 학번입니다."
            }
            
        except Exception as e:
            print(f"학번 확인 오류: {str(e)}", file=sys.stderr)
            return {
                "success": False,
                "error": str(e)
            }

    def get_status(self):
        """현재 서버 상태 반환"""
        return {
            "is_running": self.is_running,
            "lecture_active": self.lecture_active
        }

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()

    async def monitor_frame(self, frame_bytes: bytes, group_id: str, class_id: str):
        """프레임 모니터링"""
        try:
            if not self.is_running or not self.tracker:
                return {
                    "success": False,
                    "error": "ReID is not running"
                }
            
            # 바이트 데이터를 numpy 배열로 변환
            nparr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                return {
                    "success": False,
                    "error": "Invalid frame data"
                }
            
            # 프레임 처리
            self.tracker.process_frame(frame)
            
            # 현재 프레임 데이터 가져오기
            data = await self.get_latest_data()
            if not data["success"]:
                return data
            
            # 프레임 인코딩
            _, buffer = cv2.imencode('.jpg', frame)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            
            # 응답 데이터 구성
            response = {
                "success": True,
                "frame": frame_base64,  # base64로 인코딩된 이미지
                "members": data.get("members", []),
                "stats": data.get("stats", {}),
                "activities": data.get("activities", []),
                "group_id": group_id,
                "class_id": class_id
            }
            
            return response
            
        except Exception as e:
            print(f"모니터링 오류: {str(e)}", file=sys.stderr)
            return {
                "success": False,
                "error": str(e)
            }

    async def broadcast_data(self):
        """WebSocket 클라이언트들에게 최신 데이터 브로드캐스트"""
        if not self.clients:
            return
            
        try:
            data = await self.get_latest_data()
            if data["success"]:
                dead_clients = set()
                for client in self.clients:
                    try:
                        print(f"WebSocket 클라이언트 {id(client)}에게 데이터 전송", file=sys.stderr)
                        await client.send_json(data)
                    except Exception as e:
                        print(f"클라이언트 전송 오류: {str(e)}", file=sys.stderr)
                        dead_clients.add(client)
                
                # 끊어진 클라이언트 제거
                self.clients -= dead_clients
                if dead_clients:
                    print(f"{len(dead_clients)}개의 끊어진 클라이언트 제거됨", file=sys.stderr)
                
        except Exception as e:
            print(f"브로드캐스트 오류: {str(e)}", file=sys.stderr)

    def cleanup(self):
        """리소스 정리"""
        try:
            self.is_running = False
            self.lecture_active = False
            
            if self.tracking_thread and self.tracking_thread.is_alive():
                self.tracking_thread.join(timeout=1.0)
            
            if self.camera:
                self.camera.release()
            
            self.tracker = None
            self.clients.clear()
            
        except Exception as e:
            print(f"정리 중 오류: {str(e)}", file=sys.stderr)

    async def handle_websocket(self, websocket: WebSocket):
        """WebSocket 연결 처리"""
        try:
            await websocket.accept()
            self.clients.add(websocket)
            print(f"새로운 WebSocket 클라이언트 연결됨: {id(websocket)}", file=sys.stderr)
            
            try:
                while True:
                    # 클라이언트로부터 메시지 수신
                    data = await websocket.receive_json()
                    
                    # 메시지 처리
                    if data.get('type') == 'get_data':
                        response = await self.get_latest_data()
                        await websocket.send_json(response)
                    
            except WebSocketDisconnect:
                print(f"WebSocket 클라이언트 연결 종료: {id(websocket)}", file=sys.stderr)
            finally:
                self.clients.remove(websocket)
            
        except Exception as e:
            print(f"WebSocket 처리 오류: {str(e)}", file=sys.stderr)
            if websocket in self.clients:
                self.clients.remove(websocket) 