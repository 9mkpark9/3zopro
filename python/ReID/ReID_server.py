from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import queue
import json
from ReID import PersonTracker
import base64
import cv2
import numpy as np
import time
import sys

app = Flask(__name__)
CORS(app)

class ReIDServer:
    def __init__(self):
        self.tracker = None
        self.is_running = False
        self.frame_queue = queue.Queue(maxsize=10)
        self.clients = set()
        self.lock = threading.Lock()
        self.camera = None
        self.lecture_active = False
        print("ReID 서버 초기화 완료", file=sys.stderr)

    def start_tracking(self):
        try:
            with self.lock:
                if not self.is_running:
                    print("트래킹 시작 중...", file=sys.stderr)
                    self.tracker = PersonTracker()
                    self.tracker.initialize_models()
                    
                    # 카메라 초기화
                    self.camera = cv2.VideoCapture(0)
                    if not self.camera.isOpened():
                        raise Exception("카메라를 열 수 없습니다.")
                    
                    self.is_running = True
                    self.lecture_active = True
                    
                    # 트래킹 스레드 시작
                    threading.Thread(target=self._tracking_loop, daemon=True).start()
                    print("트래킹 시작 성공", file=sys.stderr)
                    return True
            return False
        except Exception as e:
            print(f"트래킹 시작 오류: {str(e)}", file=sys.stderr)
            self.is_running = False
            self.lecture_active = False
            if self.camera:
                self.camera.release()
            self.tracker = None
            return False

    def stop_tracking(self):
        try:
            with self.lock:
                print("트래킹 중지 중...", file=sys.stderr)
                self.is_running = False
                self.lecture_active = False
                if self.camera:
                    self.camera.release()
                self.tracker = None
                print("트래킹 중지 완료", file=sys.stderr)
                return True
        except Exception as e:
            print(f"트래킹 중지 오류: {str(e)}", file=sys.stderr)
            return False

    def _tracking_loop(self):
        print("트래킹 루프 시작", file=sys.stderr)
        try:
            while self.is_running:
                if not self.camera or not self.camera.isOpened():
                    print("카메라가 열려있지 않음", file=sys.stderr)
                    break

                ret, frame = self.camera.read()
                if not ret:
                    print("프레임을 읽을 수 없음", file=sys.stderr)
                    continue

                try:
                    if self.tracker is None:
                        print("트래커가 초기화되지 않음", file=sys.stderr)
                        continue

                    # 프레임 처리
                    self.tracker.process_frame(frame)
                    
                    # 프레임 데이터 가져오기
                    frame_data = self.tracker.get_frame_data()
                    
                    # frame_data가 None이거나 필수 데이터가 없는 경우 건너뛰기
                    if not frame_data or not isinstance(frame_data, dict):
                        print("유효하지 않은 프레임 데이터", file=sys.stderr)
                        continue
                    
                    # 데이터 유효성 검사
                    for key, value in frame_data.items():
                        if isinstance(value, (list, dict)):
                            if None in (value if isinstance(value, list) else value.values()):
                                print(f"유효하지 않은 데이터 발견: {key}", file=sys.stderr)
                                continue
                    
                    # 큐가 가득 차있으면 이전 데이터 제거
                    while self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            break
                    
                    # 새 데이터 추가
                    self.frame_queue.put(frame_data)
                    
                except Exception as e:
                    print(f"프레임 처리 중 오류: {str(e)}", file=sys.stderr)
                    continue
                    
                time.sleep(0.033)  # ~30 FPS
                
        except Exception as e:
            print(f"트래킹 루프 오류: {str(e)}", file=sys.stderr)
        finally:
            if self.camera:
                self.camera.release()
            print("트래킹 루프 종료", file=sys.stderr)

    def get_latest_data(self):
        try:
            if not self.is_running or not self.lecture_active or self.tracker is None:
                return {
                    'success': False,
                    'error': 'ReID is not running or tracker is not initialized',
                    'server_status': self.get_status()
                }
            
            try:
                data = self.frame_queue.get_nowait()
                if data and isinstance(data, dict):
                    # 상태 정보 추가
                    data['server_status'] = {
                        'is_running': self.is_running,
                        'lecture_active': self.lecture_active
                    }
                    data['success'] = True
                    return data
            except queue.Empty:
                pass
            
            return {
                'success': False,
                'error': 'No data available',
                'server_status': self.get_status()
            }
        except Exception as e:
            print(f"데이터 가져오기 오류: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'error': str(e),
                'server_status': self.get_status()
            }

    def get_status(self):
        """현재 서버 상태 반환"""
        return {
            'is_running': self.is_running,
            'lecture_active': self.lecture_active
        }

reid_server = ReIDServer()

@app.route('/start', methods=['POST'])
def start_reid():
    try:
        success = reid_server.start_tracking()
        return jsonify({'success': success})
    except Exception as e:
        print(f"시작 요청 처리 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/stop', methods=['POST'])
def stop_reid():
    try:
        success = reid_server.stop_tracking()
        return jsonify({'success': success})
    except Exception as e:
        print(f"중지 요청 처리 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/data', methods=['GET'])
def get_data():
    try:
        if not reid_server.is_running:
            return jsonify({
                'success': False, 
                'error': 'ReID is not running',
                'server_status': reid_server.get_status()
            })
        
        data = reid_server.get_latest_data()
        if data:
            return jsonify({**data, 'success': True})
        return jsonify({
            'success': False, 
            'error': 'No data available',
            'server_status': reid_server.get_status()
        })
    except Exception as e:
        print(f"데이터 요청 처리 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/capture', methods=['POST'])
def capture_objects():
    try:
        if not reid_server.is_running or not reid_server.tracker:
            return jsonify({'success': False, 'error': 'ReID is not running'})
        
        # 요청에서 최대 인원 정보 가져오기
        data = request.json
        max_members = data.get('max_members', 3)  # 기본값 3
        
        # 현재 인식된 객체 수 확인
        current_data = reid_server.tracker.get_frame_data()
        if current_data.get('success') and current_data.get('members'):
            current_count = len([m for m in current_data['members'] if m['status'] == '출석'])
            
            # 최대 인원 초과 확인
            if current_count > max_members:
                return jsonify({
                    'success': False,
                    'error': f'최대 인원({max_members}명)을 초과하여 캡처할 수 없습니다. 현재 {current_count}명이 인식되었습니다.'
                })
        
        # 캡처 실행
        success = reid_server.tracker.capture_objects()
        return jsonify({'success': success})
        
    except Exception as e:
        print(f"캡처 요청 처리 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/recognize', methods=['POST'])
def recognize_objects():
    try:
        if not reid_server.is_running or not reid_server.tracker:
            return jsonify({'success': False, 'error': 'ReID is not running'})
        
        # 현재 인식된 객체 수 확인
        current_data = reid_server.tracker.get_frame_data()
        if current_data.get('success') and current_data.get('members'):
            current_count = len([m for m in current_data['members'] if m['status'] == '출석'])
            max_members = reid_server.tracker.max_id
            
            # 최대 인원 초과 확인
            if current_count > max_members:
                return jsonify({
                    'success': False,
                    'error': f'최대 인원({max_members}명)을 초과하여 인식할 수 없습니다. 현재 {current_count}명이 인식되었습니다.'
                })
        
        success = reid_server.tracker.recognize_objects()
        return jsonify({'success': success})
        
    except Exception as e:
        print(f"인식 요청 처리 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/update_name', methods=['POST'])
def update_name():
    try:
        if not reid_server.is_running or not reid_server.tracker:
            return jsonify({'success': False, 'error': 'ReID is not running'})
        
        data = request.json
        track_id = data.get('id')
        student_id = data.get('student_id')
        
        if not track_id or not student_id:
            return jsonify({
                'success': False, 
                'error': '유효하지 않은 ID 또는 학번입니다.'
            })
        
        success = reid_server.tracker.update_name(track_id, student_id)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({
                'success': False, 
                'error': '학번 업데이트에 실패했습니다.'
            })
            
    except Exception as e:
        print(f"이름 업데이트 요청 처리 오류: {str(e)}", file=sys.stderr)
        return jsonify({
            'success': False, 
            'error': str(e)
        })

@app.route('/status', methods=['GET'])
def get_status():
    """서버 상태 확인 엔드포인트"""
    try:
        status = reid_server.get_status()
        return jsonify({'success': True, **status})
    except Exception as e:
        print(f"상태 확인 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/check_student_id', methods=['POST'])
def check_student_id():
    try:
        data = request.json
        student_id = data.get('student_id')
        
        if not student_id:
            return jsonify({'success': False, 'error': '학번이 제공되지 않았습니다.'})
        
        # 현재 등록된 모든 학번 확인
        exists = False
        if reid_server.tracker:
            for member in reid_server.tracker.members.values():
                if member.get('student_id') == student_id:
                    exists = True
                    break
        
        return jsonify({
            'success': True,
            'exists': exists
        })
    except Exception as e:
        print(f"학번 확인 오류: {str(e)}", file=sys.stderr)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/update_max_members', methods=['POST'])
def update_max_members():
    try:
        if not reid_server.is_running or not reid_server.tracker:
            return jsonify({'success': False, 'error': 'ReID is not running'})
        
        data = request.json
        max_members = data.get('max_members')
        
        if not max_members or not isinstance(max_members, int) or max_members < 1:
            return jsonify({
                'success': False, 
                'error': '유효하지 않은 최대 인원 수입니다.'
            })
        
        success = reid_server.tracker.update_max_members(max_members)
        return jsonify({'success': success})
        
    except Exception as e:
        print(f"최대 인원 업데이트 오류: {str(e)}", file=sys.stderr)
        return jsonify({
            'success': False, 
            'error': str(e)
        })

if __name__ == '__main__':
    print("ReID 서버 시작...", file=sys.stderr)
    app.run(host='192.168.0.114', port=5000, debug=True, threaded=True)
