import cv2
import numpy as np
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort
import torch
import torchreid
from torchreid.utils import FeatureExtractor
import time
import json
import sys
import os
import base64
from threading import Lock
import urllib.request
import locale
import codecs

# Run without GUI
os.environ['OPENCV_VIDEOIO_PRIORITY_MSMF'] = '0'

class PersonTracker:
    def __init__(self):
        self.model = None
        self.tracker = None
        self.extractor = None
        self.current_frame = None
        self.current_detections = []
        self.frame_lock = Lock()
        self.embeddings_db = {}  # ID: embedding 매핑
        self.matched_tracks = set()  # 매칭된 track_id 저장
        self.max_id = 6  # 최대 ID 수 설정
        self.registered_ids = set(range(1, self.max_id + 1))  # 등록된 ID (1~6)
        self.attendance_stats = {
            'total_members': self.max_id,
            'present_members': 0,
            'avg_duration': 0
        }
        self.member_status = {
            id_: {
                'is_present': False,
                'last_seen': 0,
                'total_duration': 0,
                'matched_id': id_,
                'first_seen': None,  # 첫 감지 시간
                'session_start': None,  # 현재 세션 시작 시간
                'accumulated_duration': 0  # 누적 체류 시간
            } for id_ in self.registered_ids
        }
        self.attendance_log = []
        self.member_names = {}  # 이제 학번을 저장할 dictionary
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.feature_buffer = {}  # 특징 벡터 버퍼
        self.buffer_size = 5  # 버퍼 크기
        self.reid_threshold = 0.7  # ReID 매칭 임계값
        self.confirmed_ids = set()  # 확정된 ID 저장
        self.current_matches = {}  # 현재 매칭된 ID 정보
        self.log_messages = []  # 로그 메시지 저장용 리스트
        print(f"Using device: {self.device}")
        
        # 한글 인코딩 설정
        if sys.platform == 'win32':
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleCP(65001)
            kernel32.SetConsoleOutputCP(65001)
        
        # 이름 로드
        self.load_names()

    def load_embeddings(self):
        """저장된 임베딩 로드"""
        embedding_path = os.path.join(os.path.dirname(__file__), 'embeddings.json')
        if os.path.exists(embedding_path):
            with open(embedding_path, 'r') as f:
                data = json.load(f)
                self.embeddings_db = {int(k): np.array(v) for k, v in data.items()}

    def save_embeddings(self):
        """임베딩 저장"""
        embedding_path = os.path.join(os.path.dirname(__file__), 'embeddings.json')
        data = {str(k): v.tolist() for k, v in self.embeddings_db.items()}
        with open(embedding_path, 'w') as f:
            json.dump(data, f)

    def load_names(self):
        """저장된 학번 로드"""
        names_path = os.path.join(os.path.dirname(__file__), 'member_names.json')
        if os.path.exists(names_path):
            try:
                with open(names_path, 'r', encoding='utf-8') as f:
                    self.member_names = json.load(f)
                    # 문자열 키를 정수로 변환
                    self.member_names = {int(k): str(v) for k, v in self.member_names.items()}
                    # 학번 형식 검증
                    for k, v in self.member_names.items():
                        if not v.isdigit() or len(v) != 9:  # 9자리 학번
                            self.member_names[k] = f"202300{k:03d}"  # 기본 학번 형식으로 변경
            except Exception as e:
                print(f"학번 로드 중 오류: {str(e)}", file=sys.stderr)
                self.member_names = {}

    def save_names(self):
        """이름 저장"""
        names_path = os.path.join(os.path.dirname(__file__), 'member_names.json')
        try:
            with open(names_path, 'w', encoding='utf-8') as f:
                json.dump(self.member_names, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"이름 저장 중 오류: {str(e)}", file=sys.stderr)

    def get_name(self, id_):
        """ID에 대한 학번 반환"""
        try:
            id_ = int(id_) if id_ is not None else None
            return self.member_names.get(id_, f"202300{id_:03d}" if id_ is not None else "Unknown")
        except (ValueError, TypeError):
            return f"Unknown {id_}"

    def update_name(self, id_, student_id):
        """ID에 대한 학번 업데이트"""
        try:
            id_ = int(id_)
            # 학번 형식 검증 (9자리 숫자)
            if not student_id.isdigit() or len(student_id) != 9:
                raise ValueError("올바른 학번 형식이 아닙니다 (9자리 숫자)")
                
            if id_ in self.registered_ids:
                # 현재 상태 보존
                current_status = self.member_status[id_]
                
                # 학번 업데이트
                self.member_names[id_] = student_id
                self.save_names()
                
                # 상태는 그대로 유지
                self.member_status[id_] = current_status
                
                print(f"Debug - 학번 업데이트: ID {id_} -> {student_id}", file=sys.stderr)
                return True
            return False
        except Exception as e:
            print(f"학번 업데이트 중 오류: {str(e)}", file=sys.stderr)
            return False

    def extract_features(self, frame, bbox):
        """OSNet으로 특징 추출"""
        x1, y1, x2, y2 = map(int, bbox)
        person_img = frame[y1:y2, x1:x2]
        if person_img.size == 0:
            return None
        
        # BGR을 RGB로 변환
        person_img = cv2.cvtColor(person_img, cv2.COLOR_BGR2RGB)
        
        # GPU로 이미지 전송
        if torch.cuda.is_available():
            if isinstance(person_img, np.ndarray):
                # (H, W, C) -> (C, H, W) -> (1, C, H, W)
                person_tensor = torch.from_numpy(person_img).float()
                person_tensor = person_tensor.permute(2, 0, 1).unsqueeze(0)
                person_tensor = person_tensor / 255.0  # 정규화
                person_tensor = person_tensor.to('cuda')
                features = self.extractor(person_tensor)
        else:
            features = self.extractor(person_img)
            
        return features.cpu().numpy().flatten()

    def calculate_enhanced_similarity(self, feat1, feat2):
        """향상된 유사도 계산 (코사인 + 유클리디안)"""
        if feat1 is None or feat2 is None:
            return 0.0
        
        # 코사인 유사도
        cosine_sim = np.dot(feat1, feat2) / (np.linalg.norm(feat1) * np.linalg.norm(feat2))
        
        # 유클리디안 거리 기반 유사도
        euclidean_dist = np.linalg.norm(feat1 - feat2)
        euclidean_sim = 1 / (1 + euclidean_dist)
        
        # 가중 평균 (코사인 유사도에 더 높은 가중치)
        return 0.7 * cosine_sim + 0.3 * euclidean_sim

    def update_feature_buffer(self, track_id, features):
        """특징 벡터 버퍼 업데이트"""
        if track_id not in self.feature_buffer:
            self.feature_buffer[track_id] = []
        
        self.feature_buffer[track_id].append(features)
        if len(self.feature_buffer[track_id]) > self.buffer_size:
            self.feature_buffer[track_id].pop(0)

    def get_averaged_features(self, track_id):
        """버퍼에 있는 특징 벡터들의 평균 계산"""
        if track_id not in self.feature_buffer:
            return None
        
        features = self.feature_buffer[track_id]
        if not features:
            return None
            
        return np.mean(features, axis=0)

    def find_best_match(self, features):
        """가장 유사한 ID 찾기"""
        if not self.embeddings_db:
            return None, 0
            
        best_match = None
        best_similarity = -1
        
        for id_, stored_features in self.embeddings_db.items():
            if id_ in self.registered_ids:  # 등록된 ID만 매칭
                similarity = self.calculate_enhanced_similarity(features, stored_features)
                if similarity > best_similarity and similarity > self.reid_threshold:
                    best_similarity = similarity
                    best_match = id_
                
        return best_match, best_similarity

    def capture_objects(self):
        if self.current_frame is None:
            return False
        
        # 현재 출석 중인 인원 수 확인
        present_count = sum(1 for member in self.member_status.values() if member['is_present'])
        
        # 최대 인원 초과 확인
        if present_count >= self.max_id:
            print(f"최대 인원({self.max_id}명)을 초과하여 캡처할 수 없습니다.", file=sys.stderr)
            return False
        
        captured = False
        next_id = 1
        current_state = {
            'member_status': self.member_status.copy(),
            'confirmed_ids': self.confirmed_ids.copy(),
            'current_matches': self.current_matches.copy()
        }
        
        try:
            for track in self.current_detections:
                if track is None or not track.is_confirmed():
                    continue
                
                if track.track_id not in self.matched_tracks:  # 미매칭 객체만 처리
                    bbox = track.to_tlbr()
                    if bbox is None or len(bbox) != 4:
                        continue
                    
                    features = self.extract_features(self.current_frame, bbox)
                    if features is None:
                        continue
                    
                    # 특징 벡터 버퍼 업데이트
                    self.update_feature_buffer(track.track_id, features)
                    
                    # 평균 특징 벡터 사용
                    avg_features = self.get_averaged_features(track.track_id)
                    if avg_features is not None:
                        # 사용 가능한 다음 ID 찾기
                        while next_id <= self.max_id and next_id in self.embeddings_db:
                            next_id += 1
                        
                        if next_id <= self.max_id:
                            self.embeddings_db[next_id] = avg_features
                            track.matched_id = next_id
                            self.matched_tracks.add(track.track_id)
                            self.confirmed_ids.add(next_id)
                            
                            # 새로운 ID 등록 시 상태 초기화
                            self.member_status[next_id] = {
                                'is_present': True,
                                'last_seen': time.time(),
                                'total_duration': 0,
                                'matched_id': next_id,
                                'first_seen': time.time(),
                                'session_start': time.time(),
                                'accumulated_duration': 0
                            }
                            self.add_log(next_id, '등록')
                            captured = True
            
            if captured:
                self.save_embeddings()
                return True
            
            return False
            
        except Exception as e:
            print(f"캡처 중 오류: {str(e)}", file=sys.stderr)
            # 오류 발생 시 이전 상태로 복원
            self.member_status = current_state['member_status']
            self.confirmed_ids = current_state['confirmed_ids']
            self.current_matches = current_state['current_matches']
            return False

    def recognize_objects(self):
        try:
            if self.current_frame is None:
                return False
            
            # 현재 출석 중인 인원 수 확인
            present_count = sum(1 for member in self.member_status.values() if member['is_present'])
            
            # 최대 인원 초과 확인
            if present_count >= self.max_id:
                print(f"최대 인원({self.max_id}명)을 초과하여 인식할 수 없습니다.", file=sys.stderr)
                return False
            
            recognized = False
            current_time = time.time()
            
            for track in self.current_detections:
                if track is None or not track.is_confirmed():
                    continue
                
                bbox = track.to_tlbr()
                if bbox is None or len(bbox) != 4:
                    continue
                
                features = self.extract_features(self.current_frame, bbox)
                if features is not None:
                    self.update_feature_buffer(track.track_id, features)
                    
                    avg_features = self.get_averaged_features(track.track_id)
                    if avg_features is not None:
                        match_id, similarity = self.find_best_match(avg_features)
                        if match_id is not None:
                            # 이미 출석 중인 다른 ID가 있는지 확인
                            if any(m['is_present'] and m['matched_id'] == match_id 
                                  for m in self.member_status.values()):
                                continue
                            
                            track.matched_id = match_id
                            self.matched_tracks.add(track.track_id)
                            self.current_matches[track.track_id] = match_id
                            
                            # 기존 상태 보존하면서 시간 정보 업데이트
                            member = self.member_status.get(match_id)
                            if member is not None:
                                if not member['is_present']:
                                    # 새로운 세션 시작
                                    member['is_present'] = True
                                    member['last_seen'] = current_time
                                    member['session_start'] = current_time
                                    if member['first_seen'] is None:
                                        member['first_seen'] = current_time
                                    self.add_log(match_id, '입실')
                                else:
                                    # 기존 세션 유지, 마지막 감지 시간만 업데이트
                                    member['last_seen'] = current_time
                            recognized = True
            
            return recognized
        except Exception as e:
            print(f"객체 인식 중 오류: {str(e)}", file=sys.stderr)
            return False

    def process_frame(self, frame):
        with self.frame_lock:
            try:
                # OpenCV BGR을 RGB로 변환
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # 이미지 크기를 YOLO 모델에 맞게 조정 (640x640)
                frame_resized = cv2.resize(frame_rgb, (640, 640))
                
                # NumPy 배열을 PyTorch 텐서로 변환하고 형식 변경
                frame_tensor = torch.from_numpy(frame_resized).float()
                frame_tensor = frame_tensor.permute(2, 0, 1).unsqueeze(0)
                frame_tensor = frame_tensor / 255.0
                
                if torch.cuda.is_available():
                    frame_tensor = frame_tensor.to('cuda')
                
                results = self.model(frame_tensor, verbose=False)
                
                detections = []
                
                for result in results:
                    boxes = result.boxes.cpu().numpy()
                    for box in boxes:
                        try:
                            xyxy = box.xyxy[0]
                            conf = box.conf[0] if box.conf is not None else None
                            cls = box.cls[0] if box.cls is not None else None
                            
                            # None 값 체크
                            if xyxy is None or conf is None or cls is None:
                                continue
                            
                            # 값 타입 체크 및 변환
                            try:
                                x1, y1, x2, y2 = map(float, xyxy)
                                conf = float(conf)
                                cls = int(cls)
                            except (TypeError, ValueError):
                                continue
                            
                            if cls == 0 and conf > 0.6:  # person class
                                # 좌표를 원본 이미지 크기에 맞게 조정
                                x1 = int(x1 * frame.shape[1] / 640)
                                y1 = int(y1 * frame.shape[0] / 640)
                                x2 = int(x2 * frame.shape[1] / 640)
                                y2 = int(y2 * frame.shape[0] / 640)
                                w = x2 - x1
                                h = y2 - y1
                                if w > 0 and h > 0:  # 유효한 박스 크기 확인
                                    detections.append(([x1, y1, w, h], conf, cls))
                        except (IndexError, TypeError, ValueError) as e:
                            print(f"박스 처리 중 오류: {str(e)}", file=sys.stderr)
                            continue

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                # None 체크 추가
                if self.tracker is None:
                    print("트래커가 초기화되지 않음", file=sys.stderr)
                    return []
                
                tracks = self.tracker.update_tracks(detections, frame=frame)
                
                self.current_frame = frame.copy()
                self.current_detections = tracks
                return tracks
                
            except Exception as e:
                print(f"프레임 처리 중 오류: {str(e)}", file=sys.stderr)
                return []

    def _calculate_iou(self, bbox1, bbox2):
        """Calculate IoU between two bounding boxes"""
        x1 = max(bbox1[0], bbox2[0])
        y1 = max(bbox1[1], bbox2[1])
        x2 = min(bbox1[2], bbox2[2])
        y2 = min(bbox1[3], bbox2[3])

        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        area2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0

    def update_member_status(self, track_id, is_matched, track=None):
        current_time = time.time()
        
        if is_matched and track is not None:
            matched_id = getattr(track, 'matched_id', None)
            if matched_id in self.registered_ids:
                member = self.member_status[matched_id]
                
                if not member['is_present']:
                    # 새로운 세션 시작
                    member['is_present'] = True
                    member['last_seen'] = current_time
                    member['session_start'] = current_time
                    if member['first_seen'] is None:
                        member['first_seen'] = current_time
                    self.add_log(matched_id, '입실')
                else:
                    # 기존 세션 유지, 마지막 감지 시간만 업데이트
                    member['last_seen'] = current_time

    def add_log(self, track_id, event):
        """활동 로그 추가"""
        current_time = time.strftime('%H:%M:%S')
        name = self.get_name(track_id)
        self.attendance_log.append({
            'time': current_time,
            'id': track_id,
            'name': name,
            'event': event
        })
        if len(self.attendance_log) > 100:  # 최대 100개 로그 유지
            self.attendance_log.pop(0)

    def calculate_stats(self):
        current_time = time.time()
        present_count = 0
        total_duration = 0
        
        for id_, member in self.member_status.items():
            # 기본 누적 시간
            duration = member['accumulated_duration']
            
            if member['is_present'] and member['session_start']:
                present_count += 1
                # 현재 세션의 지속 시간을 더함
                current_session_duration = current_time - member['session_start']
                duration += current_session_duration
            
            total_duration += duration

        # 평균 체류 시간 계산 (분 단위)
        avg_duration = total_duration / len(self.member_status) / 60 if self.member_status else 0

        return {
            'total_members': self.max_id,
            'present_members': present_count,
            'avg_duration': f"{int(avg_duration)}분"
        }

    def get_frame_data(self):
        try:
            with self.frame_lock:
                if self.current_frame is None:
                    return {
                        'success': False,
                        'error': '현재 프레임이 없습니다.'
                    }

            # 프레임 복사 및 크기 조정
            frame = self.current_frame.copy()
            # 프레임 크기가 너무 크면 조정 (예: 최대 너비 1280px)
            max_width = 1280
            if frame.shape[1] > max_width:
                ratio = max_width / frame.shape[1]
                frame = cv2.resize(frame, (max_width, int(frame.shape[0] * ratio)))

            detections_info = []
            current_time = time.time()

            # 검출된 객체들에 대해 처리
            if self.current_detections:
                for track in self.current_detections:
                    try:
                        if not track.is_confirmed():
                            continue

                        bbox = track.to_tlbr()
                        if bbox is None or len(bbox) != 4:
                            continue

                        # 좌표값이 유효한지 확인
                        x1, y1, x2, y2 = map(int, bbox)
                        if x1 < 0 or y1 < 0 or x2 >= frame.shape[1] or y2 >= frame.shape[0]:
                            continue
                        
                        track_id = track.track_id
                        matched_id = getattr(track, 'matched_id', None)
                        is_matched = (matched_id is not None and 
                                    matched_id in self.registered_ids)

                        # 매칭된 경우 상태 업데이트
                        if is_matched and matched_id in self.member_status:
                            member = self.member_status[matched_id]
                            if not member['is_present']:
                                member['is_present'] = True
                                member['last_seen'] = current_time
                                if not member.get('first_seen'):
                                    member['first_seen'] = current_time
                                    self.add_log(matched_id, '입실')
                            else:
                                member['last_seen'] = current_time

                        # 바운딩 박스 그리기
                        color = (0, 255, 0) if is_matched else (0, 0, 255)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                        # ID 텍스트 표시 (학번으로 변경)
                        display_id = self.get_name(matched_id) if is_matched else f"Unknown {track_id}"
                        # 텍스트가 프레임을 벗어나지 않도록 위치 조정
                        text_y = max(y1 - 10, 20)
                        cv2.putText(frame, f"ID: {display_id}", (x1, text_y),
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                        # 검출 정보 추가
                        detections_info.append({
                            'id': matched_id if is_matched else track_id,
                            'student_id': self.get_name(matched_id) if is_matched else f"Unknown {track_id}",
                            'bbox': [x1, y1, x2-x1, y2-y1],
                            'confidence': float(getattr(track, 'det_conf', 1.0)),
                            'matched': is_matched
                        })
                    except Exception as e:
                        print(f"트랙 처리 중 오류: {str(e)}", file=sys.stderr)
                        continue

            # 프레임 인코딩 전 품질 확인
            try:
                # JPEG 품질 설정 (0-100)
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
                _, buffer = cv2.imencode('.jpg', frame, encode_param)
                if buffer is None:
                    raise Exception("프레임 인코딩 실패")
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
            except Exception as e:
                print(f"프레임 인코딩 오류: {str(e)}", file=sys.stderr)
                return {
                    'success': False,
                    'error': '프레임 인코딩 실패'
                }

            # 오래된 멤버 상태 업데이트 (5초 이상 미감지시 퇴실 처리)
            for id_, member in self.member_status.items():
                try:
                    if member['is_present'] and current_time - member['last_seen'] > 5:
                        # 현재 세션의 체류 시간을 누적
                        if member['session_start']:
                            session_duration = current_time - member['session_start']
                            member['accumulated_duration'] += session_duration
                        
                        member['is_present'] = False
                        member['session_start'] = None
                        self.add_log(id_, f'퇴실 (체류시간: {int(member["accumulated_duration"]/60)}분)')
                except Exception as e:
                    self.log_message(f"멤버 상태 업데이트 오류 (ID {id_}): {str(e)}", True)

            # 현재 출석 중인 멤버들의 체류 시간 실시간 업데이트
            for id_, member in self.member_status.items():
                if member['is_present'] and member['session_start']:
                    # 현재 세션의 지속 시간을 계산
                    current_session_duration = current_time - member['session_start']
                    # 누적 시간과 현재 세션 시간을 합산
                    total_duration = member['accumulated_duration'] + current_session_duration
                    member['total_duration'] = total_duration

            # 통계 정보 계산
            try:
                stats = self.calculate_stats()
            except Exception as e:
                print(f"통계 계산 오류: {str(e)}", file=sys.stderr)
                stats = {
                    'total_members': self.max_id,
                    'present_members': 0,
                    'avg_duration': '0분'
                }

            # 멤버 상태 정보
            try:
                members = [
                    {
                        'id': id_,
                        'student_id': f"{self.get_name(id_)}",
                        'status': '출석' if status['is_present'] else '미감지',
                        'duration': (
                            f"{int((status['accumulated_duration'] + (current_time - status['session_start']))/60)}분" 
                            if status['is_present'] and status['session_start']
                            else f"{int(status['accumulated_duration']/60)}분"
                        )
                    }
                    for id_, status in sorted(self.member_status.items())
                ]
            except Exception as e:
                print(f"멤버 정보 생성 오류: {str(e)}", file=sys.stderr)
                members = []

            # GPU 메모리 정리
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            return {
                'success': True,
                'frame': frame_base64,
                'detections': detections_info,
                'stats': stats,
                'members': members,
                'logs': self.attendance_log[-10:]  # 최근 10개 로그만 전송
            }

        except Exception as e:
            print(f"get_frame_data 오류: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'error': str(e)
            }

    def initialize_models(self):
        """모델 초기화 및 다운로드"""
        try:
            print("Initializing models...")
            self.model = YOLO("yolo11x.pt")
            if torch.cuda.is_available():
                self.model.to('cuda')
            self.tracker = DeepSort(max_age=30)
            
            # OSNet 모델 파일 경로
            model_path = os.path.join(os.path.dirname(__file__), 'osnet_x1_0_market1501.pth')
            
            # 모델 파일이 없으면 다운로드
            if not os.path.exists(model_path):
                print("Downloading OSNet model...")
                url = "https://drive.google.com/uc?id=1vduhq5DpN2q1g4fYEZfPI17MJeh9qyrA"
                
                try:
                    import gdown
                    gdown.download(url, model_path, quiet=False)
                    print("OSNet model downloaded successfully")
                except Exception as e:
                    print(f"Failed to download model: {str(e)}")
                    backup_url = "https://github.com/KaiyangZhou/deep-person-reid/releases/download/v1.0.9/osnet_x1_0_market1501.pth"
                    urllib.request.urlretrieve(backup_url, model_path)
            
            if not os.path.exists(model_path):
                raise Exception("Failed to download OSNet model")
            
            self.extractor = FeatureExtractor(
                model_name='osnet_x1_0',
                model_path=model_path,
                device='cuda' if torch.cuda.is_available() else 'cpu'
            )
            
            print("All models initialized successfully")
            
        except Exception as e:
            print(f"Error initializing models: {str(e)}", file=sys.stderr)
            raise

    def log_message(self, message, is_error=False):
        """로그 메시지 저장"""
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] {'ERROR: ' if is_error else ''}{message}"
        self.log_messages.append(log_entry)
        if is_error:
            print(log_entry, file=sys.stderr)
        else:
            print(log_entry)

    def save_logs(self):
        """로그 파일 저장"""
        try:
            log_path = os.path.join(os.path.dirname(__file__), 'reid_log.txt')
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(self.log_messages))
            print(f"로그가 저장되었습니다: {log_path}")
        except Exception as e:
            print(f"로그 저장 중 오류: {str(e)}", file=sys.stderr)

    def run(self):
        try:
            self.initialize_models()
            
            # 한글 출력을 위한 인코딩 설정
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
            locale.setlocale(locale.LC_ALL, 'ko_KR.UTF-8')
            
            self.log_message("INIT_COMPLETE")
            sys.stdout.flush()

            # 웹캠 초기화 (0은 기본 웹캠)
            cap = cv2.VideoCapture(0)
            
            if not cap.isOpened():
                raise Exception("웹캠을 열 수 없습니다.")

            # 웹캠 설정
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)

            while True:
                ret, frame = cap.read()
                if not ret:
                    self.log_message("웹캠에서 프레임을 읽을 수 없습니다.", True)
                    continue

                self.process_frame(frame)

                if sys.stdin.readable():
                    cmd = sys.stdin.readline().strip()
                    if cmd == 'GET_FRAME':
                        frame_data = self.get_frame_data()
                        if frame_data:
                            print(json.dumps(frame_data))
                            sys.stdout.flush()
                    elif cmd == 'CAPTURE':
                        success = self.capture_objects()
                        print(json.dumps({'success': success}))
                        sys.stdout.flush()
                    elif cmd == 'RECOGNIZE':
                        success = self.recognize_objects()
                        print(json.dumps({'success': success}))
                        sys.stdout.flush()
                    elif cmd.startswith('UPDATE_NAME:'):
                        try:
                            _, data = cmd.split(':', 1)
                            id_, student_id = data.split(',')
                            success = self.update_name(int(id_), student_id)
                            print(json.dumps({'success': success}))
                            sys.stdout.flush()
                        except Exception as e:
                            print(json.dumps({'success': False, 'error': str(e)}))
                            sys.stdout.flush()
                    elif cmd == 'STOP':
                        break

                time.sleep(0.033)  # ~30 FPS

        except Exception as e:
            self.log_message(f"Error in run: {str(e)}", True)
        finally:
            if 'cap' in locals():
                cap.release()
            # 프로그램 종료 시 로그 저장
            self.save_logs()

    def update_max_members(self, max_members):
        """최대 인원 수 업데이트"""
        try:
            if max_members < 1:
                raise ValueError("최대 인원은 1명 이상이어야 합니다")
            
            # 현재 상태 백업
            current_state = {
                'member_status': self.member_status.copy(),
                'confirmed_ids': self.confirmed_ids.copy(),
                'current_matches': self.current_matches.copy()
            }
            
            try:
                # 모든 데이터 초기화
                self.max_id = max_members
                self.registered_ids = set(range(1, self.max_id + 1))
                self.matched_tracks.clear()
                self.confirmed_ids.clear()
                self.current_matches.clear()
                self.embeddings_db.clear()  # 임베딩 데이터베이스 초기화
                self.feature_buffer.clear()  # 특징 벡터 버퍼 초기화
                
                # member_status 완전 초기화
                self.member_status = {
                    id_: {
                        'is_present': False,
                        'last_seen': 0,
                        'total_duration': 0,
                        'matched_id': id_,
                        'first_seen': None,
                        'session_start': None,
                        'accumulated_duration': 0
                    } for id_ in range(1, max_members + 1)
                }
                
                # 로그 추가
                self.add_log('system', f'최대 인원이 {max_members}명으로 변경되었습니다')
                
                # 임베딩 파일 저장
                self.save_embeddings()
                # 이름 파일 저장
                self.save_names()
                
                return True
                
            except Exception as e:
                print(f"최대 인원 업데이트 중 오류: {str(e)}", file=sys.stderr)
                # 오류 발생 시 이전 상태로 복원
                self.member_status = current_state['member_status']
                self.confirmed_ids = current_state['confirmed_ids']
                self.current_matches = current_state['current_matches']
                return False
            
        except Exception as e:
            print(f"최대 인원 업데이트 중 오류: {str(e)}", file=sys.stderr)
            return False

if __name__ == "__main__":
    tracker = PersonTracker()
    tracker.run()
