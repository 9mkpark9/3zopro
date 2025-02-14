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
from scipy.spatial.distance import cosine

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
        self.reid_threshold = 0.6  # ReID 매칭 임계값
        self.confirmed_ids = set()  # 확정된 ID 저장
        self.current_matches = {}  # 현재 매칭된 ID 정보
        self.log_messages = []  # 로그 메시지 저장용 리스트
        self.frame_interval = 1.0 / 30  # 30 FPS
        self.last_frame_time = 0
        print(f"Using device: {self.device}")
        
        # 한글 인코딩 설정
        if sys.platform == 'win32':
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleCP(65001)
            kernel32.SetConsoleOutputCP(65001)
        
        # 이름 로드
        self.load_names()
        self.members = {}  # 멤버 정보를 저장할 딕셔너리
        self.stats = {     # 통계 정보
            "avg_duration": "0분"
        }
        self.logs = []     # 활동 로그
        self._smooth_bbox = {}  # 바운딩 박스 스무딩을 위한 딕셔너리 추가
        self.temp_id_counter = 1000  # 임시 ID는 1000부터 시작
        self.temp_tracks = {}  # 임시 ID 트래킹을 위한 딕셔너리
        self.frame_skip = 2  # 프레임 스킵 추가
        self.frame_count = 0
        self.process_size = (640, 640)  # YOLO 요구사항에 맞춤
        self.display_size = (640, 640)  # 표시 크기는 유지
        
        # CUDA 메모리 최적화
        if torch.cuda.is_available():
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.deterministic = False

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
            # members 딕셔너리에서 먼저 확인
            if id_ in self.members:
                return self.members[id_]['student_id']
            # member_names에서 확인
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
                
                # members 딕셔너리 업데이트
                if id_ in self.members:
                    self.members[id_]['student_id'] = student_id
                else:
                    self.members[id_] = {
                        'student_id': student_id,
                        'status': '미감지',
                        'duration': '0분',
                        'bbox': None
                    }
                
                # 현재 매칭 정보 업데이트
                for track_id, match_info in self.current_matches.items():
                    if match_info['member_id'] == id_:
                        match_info['student_id'] = student_id
                
                # 상태는 그대로 유지
                self.member_status[id_] = current_status
                
                # 변경사항 저장
                self.save_names()
                
                # 로그 추가
                self.add_log(student_id, f'학번 변경: {student_id}')
                print(f"Debug - 학번 업데이트: ID {id_} -> {student_id}", file=sys.stderr)
                
                return True
                
            return False
            
        except Exception as e:
            print(f"학번 업데이트 중 오류: {str(e)}", file=sys.stderr)
            return False

    def extract_features(self, frame, bbox):
        """이미지에서 특징 벡터 추출"""
        try:
            # bbox 좌표 정수로 변환
            x1, y1, x2, y2 = map(int, bbox)
            
            # 이미지 자르기
            person_img = frame[y1:y2, x1:x2]
            if person_img.size == 0:
                return None
            
            # 이미지 크기 조정
            person_img = cv2.resize(person_img, (128, 256))
            
            # BGR을 RGB로 변환
            person_img = cv2.cvtColor(person_img, cv2.COLOR_BGR2RGB)
            
            # YOLO 모델로 특징 추출
            results = self.model(person_img)
            if not results:
                return None
            
            # 특징 벡터 추출
            for r in results:
                if r.boxes and len(r.boxes) > 0:
                    # conf와 class 정보를 포함한 특징 벡터 생성
                    box_data = r.boxes[0]
                    
                    # 텐서를 numpy 배열로 변환하고 스칼라 값으로 추출
                    conf = box_data.conf[0].cpu().numpy().item()
                    cls = box_data.cls[0].cpu().numpy().item()
                    coords = box_data.xyxy[0].cpu().numpy()
                    
                    # 특징 벡터 생성 (좌표 + 신뢰도 + 클래스)
                    features = np.concatenate([coords, [conf, cls]])
                    
                    # 정규화
                    features = features / np.linalg.norm(features)
                    return features
                
            return None
            
        except Exception as e:
            print(f"특징 추출 오류: {str(e)}", file=sys.stderr)
            return None

    def calculate_similarity(self, features1, features2):
        """두 특징 벡터 간의 유사도 계산"""
        try:
            # 코사인 유사도 계산
            similarity = 1 - cosine(features1, features2)
            return float(similarity)
        except Exception as e:
            print(f"유사도 계산 오류: {str(e)}", file=sys.stderr)
            return 0

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
        """특징 벡터와 가장 잘 매칭되는 ID 찾기"""
        try:
            best_match = None
            best_similarity = -1
            
            for id_ in self.registered_ids:
                if id_ in self.embeddings_db:
                    stored_features = self.embeddings_db[id_]
                    similarity = self.calculate_similarity(features, stored_features)
                    
                    if similarity > self.reid_threshold and similarity > best_similarity:
                        best_similarity = similarity
                        best_match = id_
            
            return best_match, best_similarity
            
        except Exception as e:
            print(f"매칭 오류: {str(e)}", file=sys.stderr)
            return None, 0

    def capture_objects(self):
        """현재 프레임에서 객체 캡처"""
        try:
            if self.current_frame is None:
                print("캡처할 프레임이 없습니다.", file=sys.stderr)
                return False

            if not self.current_detections:
                print("캡처할 객체가 없습니다.", file=sys.stderr)
                return False

            # 각 감지된 트랙에 대해 임베딩 추출 및 저장
            for track in self.current_detections:
                if not track.is_confirmed():
                    continue

                bbox = track.to_tlbr()
                if bbox is None or len(bbox) != 4:
                    continue

                try:
                    # 특징 벡터 추출
                    feature = self.extract_features(self.current_frame, bbox)
                    if feature is not None:
                        # 새로운 ID 할당
                        new_id = self._get_next_available_id()
                        if new_id is not None:
                            self.embeddings_db[new_id] = feature
                            self.member_status[new_id] = {
                                'is_present': True,
                                'last_seen': time.time(),
                                'total_duration': 0,
                                'matched_id': new_id,
                                'first_seen': time.time(),
                                'session_start': time.time(),
                                'accumulated_duration': 0
                            }
                            # 트랙 정보 업데이트
                            track.matched_id = new_id
                            track.color = (0, 255, 0)  # 초록색으로 설정
                            # 매칭된 트랙 기록
                            self.matched_tracks.add(track.track_id)
                            # 로그 추가
                            self.add_log(new_id, '등록')
                            print(f"ID {new_id} 캡처 성공", file=sys.stderr)
                except Exception as e:
                    print(f"특징 추출 오류: {str(e)}", file=sys.stderr)
                    continue

            # 임베딩 저장
            self.save_embeddings()
            return True

        except Exception as e:
            print(f"캡처 중 오류: {str(e)}", file=sys.stderr)
            return False

    def _get_next_available_id(self):
        """사용 가능한 다음 ID 반환"""
        used_ids = set(self.embeddings_db.keys())
        for id_ in range(1, self.max_id + 1):
            if id_ not in used_ids:
                return id_
        return None

    def update_member_status(self, member_id, track):
        """멤버 상태 업데이트"""
        try:
            if member_id not in self.member_status:
                return
            
            current_time = time.time()
            status = self.member_status[member_id]
            
            # 트랙에 매칭된 ID 할당
            track.matched_id = member_id
            
            # 처음 매칭된 경우에만 로그 추가
            if track.track_id not in self.matched_tracks:
                student_id = self.get_name(member_id)
                self.add_log(student_id, '출석')
            
            # 상태 업데이트
            if not status['is_present']:
                status['is_present'] = True
                status['first_seen'] = current_time
                status['session_start'] = current_time
            
            status['last_seen'] = current_time
            
            # 매칭 정보 업데이트
            self.current_matches[track.track_id] = {
                'member_id': member_id,
                'student_id': self.get_name(member_id),
                'bbox': track.to_tlbr().tolist()
            }
            
            # 학번으로 표시 업데이트
            student_id = self.get_name(member_id)
            track.display_id = student_id
            track.color = (0, 255, 0)  # 매칭된 ID는 초록색
            
            # 임시 ID 제거
            if track.track_id in self.temp_tracks:
                del self.temp_tracks[track.track_id]
            
        except Exception as e:
            print(f"상태 업데이트 오류: {str(e)}", file=sys.stderr)

    def recognize_objects(self):
        """현재 프레임의 객체들 인식"""
        try:
            if self.current_frame is None:
                return False
            
            if not self.current_detections:
                print("인식할 객체가 없습니다.", file=sys.stderr)
                return False
            
            recognized_count = 0
            for track in self.current_detections:
                if not track.is_confirmed():
                    continue
                
                # 이미 매칭된 트랙은 건너뛰기
                if track.track_id in self.matched_tracks:
                    continue
                
                # 특징 추출
                bbox = track.to_tlbr()
                features = self.extract_features(self.current_frame, bbox)
                
                if features is not None:
                    # 매칭된 ID 찾기
                    matched_id, similarity = self.find_best_match(features)
                    if matched_id is not None:
                        # 매칭된 트랙 기록
                        self.matched_tracks.add(track.track_id)
                        
                        # 상태 업데이트
                        self.update_member_status(matched_id, track)
                        
                        # 바운딩 박스 색상을 초록색으로 변경
                        track.color = (0, 255, 0)
                        
                        recognized_count += 1
                        
            if recognized_count > 0:
                print(f"{recognized_count}개 객체 인식 성공", file=sys.stderr)
                return True
            
            print("매칭된 객체가 없습니다.", file=sys.stderr)
            return False
            
        except Exception as e:
            print(f"객체 인식 오류: {str(e)}", file=sys.stderr)
            return False

    def process_frame(self, frame):
        """프레임 처리 및 객체 추적"""
        with self.frame_lock:
            try:
                if frame is None:
                    return
                
                # 프레임 스킵
                self.frame_count += 1
                if self.frame_count % self.frame_skip != 0:
                    return
                
                # 처리를 위한 크기 조정 (원본 비율 유지)
                h, w = frame.shape[:2]
                scale = min(640/w, 640/h)
                new_w = int(w * scale)
                new_h = int(h * scale)
                
                # 패딩 계산
                pad_x = (640 - new_w) // 2
                pad_y = (640 - new_h) // 2
                
                # 리사이즈 및 패딩
                frame_resized = cv2.resize(frame, (new_w, new_h))
                frame_padded = np.zeros((640, 640, 3), dtype=np.uint8)
                frame_padded[pad_y:pad_y+new_h, pad_x:pad_x+new_w] = frame_resized
                
                # BGR to RGB
                frame_rgb = cv2.cvtColor(frame_padded, cv2.COLOR_BGR2RGB)
                
                # YOLO 처리
                frame_tensor = torch.from_numpy(frame_rgb).float()
                frame_tensor = frame_tensor.permute(2, 0, 1).unsqueeze(0) / 255.0
                
                if torch.cuda.is_available():
                    frame_tensor = frame_tensor.cuda()
                
                with torch.no_grad():  # 추론 시 그래디언트 계산 비활성화
                    results = self.model(frame_tensor, verbose=False)
                
                # 좌표 스케일 조정 계수
                scale_x = frame.shape[1] / self.process_size[0]
                scale_y = frame.shape[0] / self.process_size[1]
                
                detections = []
                # 객체 감지 결과 처리 (벡터화된 연산 사용)
                for result in results:
                    boxes = result.boxes.cpu().numpy()
                    if len(boxes) > 0:
                        # 한 번에 모든 박스 처리
                        valid_boxes = boxes[
                            (boxes.cls == 0) & (boxes.conf > 0.6)
                        ]
                        
                        if len(valid_boxes) > 0:
                            for box in valid_boxes:
                                x1, y1, x2, y2 = box.xyxy[0]
                                # 좌표 스케일 조정
                                x1, x2 = x1 * scale_x, x2 * scale_x
                                y1, y2 = y1 * scale_y, y2 * scale_y
                                w = x2 - x1
                                h = y2 - y1
                                if w > 0 and h > 0:
                                    detections.append(([x1, y1, w, h], box.conf[0], 0))
                
                # DeepSORT 트래커로 추적
                if detections:
                    previous_tracks = self.current_detections
                    self.current_detections = self.tracker.update_tracks(detections, frame=frame)
                    
                    # 각 트랙 처리
                    for track in self.current_detections:
                        if not track.is_confirmed():
                            continue
                            
                        track_id = track.track_id
                        
                        # 매칭된 트랙인 경우
                        if track_id in self.matched_tracks:
                            track.color = (0, 255, 0)  # 초록색
                        else:
                            track.color = (0, 0, 255)  # 빨간색
                        
                        # ID 스위칭 감지
                        if track_id in self.matched_tracks:
                            for prev_track in previous_tracks:
                                if prev_track.track_id == track_id:
                                    if self.detect_id_switching(track, prev_track):
                                        print(f"ID 스위칭 감지: track {track_id}", file=sys.stderr)
                                        self.matched_tracks.remove(track_id)
                                        self.temp_tracks[track_id] = self.get_temp_id()
                                        track.matched_id = None
                                        track.color = (0, 0, 255)
                                    break
                        
                        # 새로운 트랙이거나 스위칭된 트랙
                        if track_id not in self.matched_tracks:
                            if track_id not in self.temp_tracks:
                                self.temp_tracks[track_id] = self.get_temp_id()
                            temp_id = self.temp_tracks[track_id]
                            track.display_id = f"Unknown {temp_id}"
                            track.color = (0, 0, 255)
                
                # 현재 프레임 저장
                self.current_frame = frame
                
            except Exception as e:
                print(f"프레임 처리 오류: {str(e)}", file=sys.stderr)

    def _merge_tracks(self, previous_tracks, current_tracks):
        """이전 트랙과 현재 트랙을 병합하여 깜빡임 방지"""
        if not previous_tracks:
            return current_tracks
        
        merged_tracks = []
        for curr_track in current_tracks:
            # 이전 트랙에서 매칭되는 ID 찾기
            matched = False
            for prev_track in previous_tracks:
                if curr_track.track_id == prev_track.track_id:
                    # ID가 매칭되면 이전 정보 유지
                    curr_track.matched_id = getattr(prev_track, 'matched_id', None)
                    matched = True
                    break
            merged_tracks.append(curr_track)
        
        return merged_tracks

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
        """현재 프레임 데이터 반환"""
        try:
            if self.current_frame is None:
                return {'success': False, 'error': 'No frame available'}

            # 현재 프레임 복사 및 처리
            frame = self.current_frame.copy()
            
            # 바운딩 박스 및 ID 그리기
            for track in self.current_detections:
                if not track.is_confirmed():
                    continue
                    
                bbox = track.to_tlbr()  # [x1,y1,x2,y2]
                
                # 박스 그리기 (두께 2로 변경)
                color = track.color if hasattr(track, 'color') else (0, 255, 0)
                cv2.rectangle(frame, 
                            (int(bbox[0]), int(bbox[1])), 
                            (int(bbox[2]), int(bbox[3])), 
                            color, 2)  # 두께를 1에서 2로 변경
                
                # ID 텍스트 표시
                student_id = self.get_name(track.matched_id) if hasattr(track, 'matched_id') else f"{track.track_id}"
                cv2.putText(frame, 
                           student_id,
                           (int(bbox[0]), int(bbox[1]-5)),
                           cv2.FONT_HERSHEY_SIMPLEX, 
                           0.5,
                           color, 
                           2)  # 텍스트 두께도 2로 변경

            # 멤버 정보 구성
            members_data = []
            current_time = time.time()
            
            for id_ in self.registered_ids:
                status = self.member_status.get(id_, {
                    'is_present': False,
                    'last_seen': 0,
                    'accumulated_duration': 0,
                    'session_start': None
                })
                
                # 지속 시간 계산
                duration = status['accumulated_duration']
                if status['is_present'] and status['session_start']:
                    duration += (current_time - status['session_start'])
                
                members_data.append({
                    'id': id_,
                    'student_id': self.get_name(id_),
                    'status': '출석' if status['is_present'] else '미감지',
                    'duration': f"{int(duration/60)}분",
                    'is_present': status['is_present']
                })

            # 통계 계산
            present_count = sum(1 for m in members_data if m['is_present'])
            total_duration = sum(float(m['duration'].replace('분', '')) for m in members_data)
            avg_duration = total_duration / len(members_data) if members_data else 0

            return {
                'success': True,
                'frame': frame,  # numpy 배열 형태의 이미지
                'members': members_data,
                'stats': {
                    'total_members': len(members_data),
                    'present_members': present_count,
                    'avg_duration': f"{int(avg_duration)}분"
                },
                'logs': self.attendance_log[-10:]  # 최근 10개 로그만 전송
            }

        except Exception as e:
            print(f"프레임 데이터 생성 오류: {str(e)}", file=sys.stderr)
            return {'success': False, 'error': str(e)}

    def initialize_models(self):
        """모델 초기화 및 다운로드"""
        try:
            print("모델 초기화 시작...", file=sys.stderr)
            
            # YOLO 모델 초기화
            model_path = os.path.join(os.path.dirname(__file__), 'yolo11x.pt')
            if not os.path.exists(model_path):
                raise Exception("YOLO 모델 파일을 찾을 수 없습니다")
            
            self.model = YOLO(model_path)
            if torch.cuda.is_available():
                self.model.to('cuda')
            print("YOLO 모델 로드 완료", file=sys.stderr)
            
            # DeepSort 트래커 파라미터 조정 - 빠른 이동 대응
            self.tracker = DeepSort(
                max_age=30,              # 트랙 수명 증가 (15 -> 30)
                n_init=1,                # 트랙 초기화 즉시 (2 -> 1)
                max_iou_distance=0.7,    # IOU 거리 임계값 증가 (0.5 -> 0.7)
                max_cosine_distance=0.3,  # 코사인 거리 임계값 증가 (0.2 -> 0.3)
                nn_budget=100,           # 트랙당 최대 특징 수 증가 (50 -> 100)
                override_track_class=None,
                embedder="mobilenet",
                half=True,
                bgr=True,
                embedder_gpu=True
            )
            print("DeepSort 트래커 초기화 완료", file=sys.stderr)
            
            # 테스트용 멤버 데이터 초기화
            self.members = {}
            for i in range(1, 7):
                self.members[i] = {
                    "student_id": f"20230000{i}",
                    "status": "미감지",
                    "duration": "0분",
                    "bbox": None  # bbox는 실제 감지 시 업데이트됨
                }
            
            self.stats = {
                "avg_duration": "0분"
            }
            self.logs = []
            
            print("모든 모델 초기화 완료", file=sys.stderr)
            return True
            
        except Exception as e:
            print(f"모델 초기화 오류: {str(e)}", file=sys.stderr)
            return False

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
            cap = cv2.VideoCapture(1)
            
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

    def get_temp_id(self):
        """새로운 임시 ID 생성"""
        try:
            # 사용 가능한 임시 ID 찾기
            used_temp_ids = set(self.temp_tracks.values())
            for temp_id in range(1000, self.temp_id_counter + 1):
                if temp_id not in used_temp_ids:
                    return temp_id
            
            # 새로운 임시 ID 생성
            self.temp_id_counter += 1
            return self.temp_id_counter
        except Exception as e:
            print(f"임시 ID 생성 오류: {str(e)}", file=sys.stderr)
            return self.temp_id_counter + 1

    def detect_id_switching(self, track, prev_track):
        """ID 스위칭 감지"""
        try:
            # IOU 계산
            current_bbox = track.to_tlbr()
            prev_bbox = prev_track.to_tlbr()
            iou = self._calculate_iou(current_bbox, prev_bbox)
            
            # 특징 벡터 추출 및 유사도 계산
            current_features = self.extract_features(self.current_frame, current_bbox)
            prev_features = self.extract_features(self.current_frame, prev_bbox)
            
            if current_features is not None and prev_features is not None:
                similarity = self.calculate_similarity(current_features, prev_features)
                
                # IOU와 특징 유사도를 모두 고려
                if iou < 0.5 or similarity < 0.6:  # 임계값 조정 가능
                    return True
            
            return False
        except Exception as e:
            print(f"ID 스위칭 감지 오류: {str(e)}", file=sys.stderr)
            return False

if __name__ == "__main__":
    tracker = PersonTracker()
    tracker.run()
