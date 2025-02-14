from fastapi import FastAPI, HTTPException, Request, Depends, WebSocket, WebSocketDisconnect, File, UploadFile, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Integer, Boolean, LargeBinary, ForeignKey, Date, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from sqlalchemy import JSON  # JSON 타입 임포트
from datetime import datetime, timedelta
from face_signup import facenet, mp_face_detection
from scipy.spatial.distance import cosine
from sqlalchemy.exc import SQLAlchemyError
import cv2
import numpy as np
import tensorflow as tf
import urllib.parse
import json
import re
from sqlalchemy.sql import text
import random



# 접속자 목록을 저장할 전역 리스트
attendees = []

password = urllib.parse.quote_plus("1234")

tf.get_logger().setLevel('ERROR')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 도메인 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MySQL 연결 설정
DATABASE_URL = f"mysql+pymysql://root:{password}@127.0.0.1:3306/3zopro"  # 본인의 MySQL 비밀번호와 데이터베이스 이름을 입력하세요
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

async def notify_attendees():
    if attendees:  # 접속자가 있을 때만 알림
        message = {"attendees": [{"id": attendee["id"], "name": attendee["name"]} for attendee in attendees]}
        for attendee in attendees:
            await attendee["websocket"].send_json(message)

@app.websocket("/ws/{user_id}/{user_name}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, user_name: str):
    await websocket.accept()
    attendees.append({"id": user_id, "name": user_name, "websocket": websocket})

    try:
        await notify_attendees()  # 접속자 목록 알림
        while True:
            # 클라이언트로부터의 메시지 수신 대기
            data = await websocket.receive_text()
            print(f"Received data from {user_id}: {data}")  # 수신된 데이터 로그
    except WebSocketDisconnect:
        attendees.remove(next(attendee for attendee in attendees if attendee["id"] == user_id))
        await notify_attendees()  # 접속자 목록 업데이트 알림
    except Exception as e:
        print(f"WebSocket 오류 발생: {e}")
        await websocket.close()

# department 테이블 (부서 정보 테이블)
class Department(Base):
    __tablename__ = "department"
    
    d_id = Column(Integer, primary_key=True, index=True)
    d_name = Column(String(30), index=True)

# members 테이블 (사용자 정보 테이블)
class Member(Base):
    __tablename__ = "members"

    m_id = Column(String(30), primary_key=True, index=True)
    m_pw = Column(String(30), nullable=False)
    m_name = Column(String(30), nullable=False)
    d_id = Column(Integer, ForeignKey("department.d_id"), nullable=False)
    is_student = Column(Boolean, default=False)
    m_face = Column(LargeBinary)  # BLOB 필드로 이미지 저장

    # 관계 설정
    department = relationship("Department", backref="members")

# class 테이블 (강의 정보 테이블)
class Class(Base):
    __tablename__ = "class"

    c_id = Column(Integer, primary_key=True)
    c_name = Column(String(30), nullable=False)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)
    d_id = Column(Integer, ForeignKey("department.d_id"), nullable=False)
    st_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    class_day = Column(String(10), nullable=False)
    st_time = Column(String(10), nullable=False)
    end_time = Column(String(10), nullable=False)
    fixed_num = Column(Integer, nullable=False)

    # 관계 설정
    professor = relationship("Member", backref="classes")
    department = relationship("Department", backref="classes")
    
# mem_sel_class 테이블 모델 정의
class SelectedClass(Base):
    __tablename__ = "mem_sel_class"

    s_id = Column(Integer, primary_key=True, index=True)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)
    c_id = Column(Integer, ForeignKey("class.c_id"), nullable=False)

# 데이터베이스에 테이블 생성
Base.metadata.create_all(bind=engine)

# 강의 추가를 위한 Pydantic 모델
class CourseData(BaseModel):
    c_id: int          # 과목 코드 추가
    c_name: str        # 과목명
    m_id: str          # 담당 교수
    d_id: int          # 학과 ID
    st_date: str       # 개강일
    end_date: str      # 종강일
    class_day: str     # 수업 요일
    st_time: str       # 시작 시간
    end_time: str      # 종료 시간
    fixed_num: int     # 수강 정원

# 사용자 입력을 위한 Pydantic 모델
class User(BaseModel):
    m_id: str
    m_pw: str
    m_name: str
    d_id: int  # 부서 ID
    is_student: Optional[bool] = False
    m_face: Optional[str] = None  # 얼굴 이미지는 base64 인코딩된 문자열로 받을 수 있습니다.

class LoginRequest(BaseModel):
    m_id: str
    m_pw: str

# Pydantic 모델 정의
class SaveClass(BaseModel):
    m_id: str
    c_id: int

@app.get("/students_by_course_name/{course_name}")
async def get_students_by_course_name(course_name: str):
    db = SessionLocal()
    try:
        # 강의명으로 c_id 찾기
        course = db.query(Class).filter(Class.c_name == course_name).first()
        if not course:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")

        # c_id로 수강생 목록 찾기
        selected_classes = db.query(SelectedClass).filter(SelectedClass.c_id == course.c_id).all()
        
        if not selected_classes:
            return {"students": []}  # 수강생이 없으면 빈 리스트 반환
        
        # m_id로 수강생 정보 찾기
        student_ids = [sc.m_id for sc in selected_classes]
        students = db.query(Member).filter(Member.m_id.in_(student_ids)).all()

        return {
            "students": [{"name": student.m_name, "id": student.m_id} for student in students]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.post("/saveClass")  # 강의 저장
async def save_class(save_class: SaveClass):
    db = SessionLocal()
    try:
        # c_id에 해당하는 강의가 존재하는지 확인
        course = db.query(Class).filter(Class.c_id == save_class.c_id).first()
        
        if not course:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
        
        # mem_sel_class 테이블에 강의 저장
        selected_class = SelectedClass(m_id=save_class.m_id, c_id=save_class.c_id)
        
        db.add(selected_class)
        db.commit()
        db.refresh(selected_class)
        
        return {"status": "success", "message": "강의가 성공적으로 저장되었습니다.", "s_id": selected_class.s_id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="데이터베이스 오류")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="서버 오류")
    finally:
        db.close()

@app.delete("/deleteClass")  # 강의 삭제
async def delete_class(save_class: SaveClass):
    db = SessionLocal()
    try:
        # c_id에 해당하는 강의가 존재하는지 확인
        selected_class = db.query(SelectedClass).filter(
            SelectedClass.c_id == save_class.c_id,
            SelectedClass.m_id == save_class.m_id
        ).first()
        
        if not selected_class:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
        
        # mem_sel_class 테이블에서 강의 삭제
        db.delete(selected_class)
        db.commit()
        
        return {"status": "success", "message": "강의가 성공적으로 삭제되었습니다."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="서버 오류")
    finally:
        db.close()

@app.get("/getCourseId")  # 수업명으로 c_id를 찾기 위한 엔드포인트
async def get_course_id(c_name: str):
    db = SessionLocal()
    try:
        # c_name에 해당하는 강의 정보 가져오기
        course = db.query(Class).filter(Class.c_name == c_name).first()

        if not course:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")

        return {"c_id": course.c_id}  # c_id를 반환
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.get("/course-dates")  # 강의 시작일과 종료일 가져오기
async def get_course_dates(c_name: str):
    db = SessionLocal()
    try:
        # 강의명에 해당하는 강의 정보 가져오기
        course = db.query(Class).filter(Class.c_name == c_name).first()

        if not course:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")

        # JSON 데이터에서 시작일과 종료일 가져오기
        schedule = course.schedule_dates  # 예: {"days": ["월요일"], "selected_range": "2025-01-01 ~ 2025-01-31"}
        selected_range = schedule.get("selected_range")

        if not selected_range:
            raise HTTPException(status_code=400, detail="선택된 날짜 범위가 없습니다.")

        # '2025-01-01 ~ 2025-01-31' 형식 파싱
        try:
            start_date_str, end_date_str = selected_range.split(" ~ ")
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="날짜 형식이 잘못되었습니다. (올바른 형식: YYYY-MM-DD ~ YYYY-MM-DD)")

        # 날짜 정보를 반환
        return {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.get("/courses") # 로그인 아이디에 해당하는 강의목록 가져오기
async def get_courses(m_id: str):
    db = SessionLocal()
    try:
        # m_id에 해당하는 강의 목록을 가져오고, 학과명도 포함
        courses = (
            db.query(Class, Department.d_name)
            .join(Department, Class.d_id == Department.d_id)
            .filter(Class.m_id == m_id)
            .all()
        )
        
        return {
            "courses": [
                {
                    "c_id": course[0].c_id,
                    "c_name": course[0].c_name,
                    "m_id": course[0].m_id,
                    "d_id": course[0].d_id,
                    "d_name": course[1],  # 학과명 추가
                    "schedule_dates": course[0].schedule_dates,
                    "st_time": course[0].st_time,
                    "end_time": course[0].end_time
                }
                for course in courses   
            ]
        }
    finally:
        db.close()

@app.get("/courses_cid") # 수업 아이디에 해당하는 강의목록 가져오기
async def get_courses_cid(c_id: str):
    db = SessionLocal()
    try:
        # c_id에 해당하는 강의 목록을 가져오고, 학과명도 포함
        courses = (
            db.query(Class, Department.d_name)
            .join(Department, Class.d_id == Department.d_id)
            .filter(Class.c_id == c_id)
            .all()
        )
        
        return {
            "courses": [
                {
                    "c_id": course[0].c_id,
                    "c_name": course[0].c_name,
                    "m_id": course[0].m_id,
                    "d_id": course[0].d_id,
                    "d_name": course[1],  # 학과명 추가
                    "schedule_dates": course[0].schedule_dates,
                    "st_time": course[0].st_time,
                    "end_time": course[0].end_time
                }
                for course in courses   
            ]
        }
    finally:
        db.close()

@app.get("/members")  # 특정 교수의 정보 가져오기
async def get_member(m_id: str):
    db = SessionLocal()
    try:
        member = db.query(Member).filter(Member.m_id == m_id).first()
        
        if not member:
            raise HTTPException(status_code=404, detail="교수를 찾을 수 없습니다.")
        
        return {
            "m_id": member.m_id,
            "m_name": member.m_name,
            "d_id": member.d_id,
            "is_student": member.is_student
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.get("/mem_sel_class") # 학생 아이디에 해당하는 수강목록 가져오기
async def get_mem_sel_class(m_id: str):
    db = SessionLocal()
    try:
        # m_id에 해당하는 수강 과목을 가져오기
        selected_classes = db.query(SelectedClass).filter(SelectedClass.m_id == m_id).all()
        
        if not selected_classes:
            raise HTTPException(status_code=404, detail="수강 과목이 없습니다.")
        
        # c_id 목록 생성
        c_ids = [selected_class.c_id for selected_class in selected_classes]
        
        return {"c_ids": c_ids}  # c_id 목록 반환
    except Exception as e:
        db.rollback()
        print(f"Error: {str(e)}")  # 에러 메시지 로그
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.delete("/courses/{course_id}") # 강의 삭제
async def delete_course(course_id: int):
    db = SessionLocal()
    try:
        course = db.query(Class).filter(Class.c_id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")

        db.delete(course)
        db.commit()
        return {"status": "success", "message": "강의가 성공적으로 삭제되었습니다."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="서버 오류")
    finally:
        db.close()

@app.post("/inputclass")
async def input_class(class_data: dict):
    db = SessionLocal()
    try:
        # 과목 코드 중복 확인
        existing_course = db.query(Class).filter(Class.c_id == class_data["c_id"]).first()
        if existing_course:
            raise HTTPException(status_code=400, detail="이미 존재하는 과목 코드입니다.")
        
        professor = db.query(Member).filter(Member.m_id == class_data["m_id"]).first()
        if not professor:
            raise HTTPException(status_code=400, detail="존재하지 않는 교수입니다.")
        
        department = db.query(Department).filter(Department.d_id == class_data["d_id"]).first()
        if not department:
            raise HTTPException(status_code=400, detail="존재하지 않는 학과입니다.")

        # 날짜 변환
        try:
            st_date = datetime.strptime(class_data["st_date"], "%Y-%m-%d").date()
            end_date = datetime.strptime(class_data["end_date"], "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)")

        # 요일 매핑 정의
        day_mapping = {
            '월': 'Monday',
            '화': 'Tuesday',
            '수': 'Wednesday',
            '목': 'Thursday',
            '금': 'Friday',
            '토': 'Saturday',
            '일': 'Sunday'
        }

        # 강의 요일에 해당하는 모든 날짜 계산
        lecture_dates = []
        current_date = st_date
        target_day = day_mapping.get(class_data["class_day"])
        
        if not target_day:
            raise HTTPException(status_code=400, detail="잘못된 요일 형식입니다.")

        while current_date <= end_date:
            if current_date.strftime('%A') == target_day:
                lecture_dates.append(current_date.strftime("%Y-%m-%d"))
            current_date += timedelta(days=1)

        if not lecture_dates:
            raise HTTPException(status_code=400, detail="선택한 기간 내에 해당 요일의 강의 날짜가 없습니다.")

        # lecture_dates를 JSON 형식으로 변환
        lecture_dates_json = json.dumps(lecture_dates)

        print(f"계산된 강의 날짜: {lecture_dates}")  # 디버깅용 로그

        # 1. class 테이블에 강의 정보 입력
        class_query = text("""
            INSERT INTO class (
                c_id, c_name, m_id, d_id, 
                st_date, end_date, class_day, 
                lecture_date,
                st_time, end_time, fixed_num
            ) VALUES (
                :c_id, :c_name, :m_id, :d_id,
                :st_date, :end_date, :class_day,
                :lecture_date,
                :st_time, :end_time, :fixed_num
            )
        """)
        
        db.execute(class_query, {
            "c_id": class_data["c_id"],
            "c_name": class_data["c_name"],
            "m_id": class_data["m_id"],
            "d_id": class_data["d_id"],
            "st_date": st_date,
            "end_date": end_date,
            "class_day": class_data["class_day"],
            "lecture_date": lecture_dates_json,  # 계산된 강의 날짜
            "st_time": class_data["st_time"],
            "end_time": class_data["end_time"],
            "fixed_num": class_data["fixed_num"]
        })

        # 2. class_dates 테이블에 주차별 날짜 입력
        for week, date in enumerate(lecture_dates, 1):
            dates_query = text("""
                INSERT INTO class_dates (c_id, lecture_week, lecture_date)
                VALUES (:c_id, :lecture_week, :lecture_date)
            """)
            
            db.execute(dates_query, {
                "c_id": class_data["c_id"],
                "lecture_week": week,
                "lecture_date": date
            })

        db.commit()
        
        return {
            "status": "success", 
            "message": "강의와 강의 일정이 성공적으로 추가되었습니다.", 
            "class_id": class_data["c_id"]
        }
    except HTTPException as e:
        db.rollback()
        raise e
    except Exception as e:
        db.rollback()
        print(f"Error in input_class: {str(e)}")
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.get("/departments") # DB에서 학과목록 가져오기
async def get_departments():
    db = SessionLocal()
    departments = db.query(Department).all()  # 학과 목록을 가져옵니다.
    db.close()
    return {"departments": [{"d_id": dept.d_id, "d_name": dept.d_name} for dept in departments]}

@app.get("/courses_sel") # DB에서 수업목록 가져오기
async def get_departments(d_id : str):
    db = SessionLocal()
    try:
        # d_id에 해당하는 강의 목록을 가져오고, 학과명도 포함
        courses = (
            db.query(Class, Department.d_name)
            .join(Department, Class.d_id == Department.d_id)
            .filter(Class.d_id == d_id)
            .all()
        )
        
        return {
            "courses": [
                {
                    "c_id": course[0].c_id,
                    "c_name": course[0].c_name,
                    "m_id": course[0].m_id,
                    "d_id": course[0].d_id,
                    "d_name": course[1],  # 학과명 추가
                    "schedule_dates": course[0].schedule_dates,
                    "st_time": course[0].st_time,
                    "end_time": course[0].end_time
                }
                for course in courses   
            ]
        }
    finally:
        db.close()

@app.post("/register") # 회원가입
async def register_user(user: User):
    db = SessionLocal()
    try:
        # 중복 ID 확인
        existing_user = db.query(Member).filter(Member.m_id == user.m_id).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="이미 존재하는 사용자 ID입니다.")
        
        # 유효한 부서 ID 확인
        department = db.query(Department).filter(Department.d_id == user.d_id).first()
        if not department:
            raise HTTPException(status_code=400, detail="존재하지 않는 부서 ID입니다.")
        
        # 얼굴 캡처 및 임베딩 처리
        embedding_str = user.m_face
        
        # 작은따옴표 및 이중 따옴표 제거
        embedding_strs = embedding_str.strip('"\'')  # 양쪽의 " 및 ' 제거
        print("Processed m_face:", embedding_strs)  # 확인용 로그
        
        try:
            embedding = embedding_strs  # JSON 배열로 디코딩
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="임베딩 데이터가 유효한 JSON 형식이 아닙니다.")
        
        
        # 새로운 사용자 추가
        db_user = Member(
            m_id=user.m_id,
            m_pw=user.m_pw,
            m_name=user.m_name,
            d_id=user.d_id,
            is_student=user.is_student,
            m_face=json.dumps(embedding).encode('utf-8')  # JSON 문자열로 저장
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return {"status": "success", "message": "회원가입 성공"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="데이터베이스 오류")
    finally:
        db.close()
@app.post("/login")
async def login_user(user: LoginRequest):
    db = SessionLocal()
    try:
        # ID와 PW 확인
        # Department 정보를 JOIN하여 가져오기
        user_record = db.query(
            Member, Department.d_name.label('department_name')
        ).join(
            Department, Member.d_id == Department.d_id
        ).filter(
            Member.m_id == user.m_id, 
            Member.m_pw == user.m_pw
        ).first()

        if not user_record:
            raise HTTPException(status_code=400, detail="ID 또는 PW가 일치하지 않습니다.")

        # Member와 Department가 JOIN된 결과에서 각각의 정보 추출
        member = user_record[0]  # Member 객체
        department_name = user_record[1]  # department_name

        # 교수의 수업 시간표 가져오기
        classes = db.query(Class).filter(Class.m_id == member.m_id).all()
        class_schedule = [
            {
                "c_id": cls.c_id,
                "c_name": cls.c_name,
                "st_time": cls.st_time,
                "end_time": cls.end_time,
                "fixed_num": cls.fixed_num
            }
            for cls in classes
        ]

        # 반환 데이터 구성
        return {
            "name": member.m_name,
            "id": member.m_id,
            "department": department_name,  # d_id 대신 학과명 반환
            "is_student": member.is_student,
            "class_schedule": class_schedule
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

#얼굴로 로그인
@app.post("/face-login")
async def face_login_endpoint(image: UploadFile = File(...)):
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
                        raise ValueError("Detected face area is empty.")

                    face_resized = cv2.resize(face, (160, 160))
                    new_embedding = facenet.embeddings(np.expand_dims(face_resized, axis=0))[0]
                    new_embedding = np.squeeze(new_embedding)

                    db = SessionLocal()
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
                                        "id": user.m_id,           # 학번
                                        "name": user.m_name,       # 이름
                                        "department_id": user.d_id, # 학과 ID
                                        "department": department.d_name,  # 학과명
                                        "is_student": user.is_student,
                                    },
                                }
                        except json.JSONDecodeError:
                            print(f"JSON decoding error for user {user.m_id}")
                        except Exception as e:
                            print(f"Error processing m_face for user {user.m_id}: {e}")

        return {"match": False, "error": "No match found"}
    except ValueError as ve:
        print(f"Validation error: {ve}")
        return {"error": str(ve)}, 400
    except Exception as e:
        print(f"Error in face-login: {str(e)}")
        return {"error": str(e)}, 500
    finally:
        if 'db' in locals():
            db.close()

@app.post("/capture-face")
async def capture_face(images: List[UploadFile] = File(...)):
    try:
        embeddings = []
        detected_faces = 0  # 얼굴 감지된 이미지 개수
        total_images = len(images)  # 업로드된 총 이미지 개수

        for image in images:
            image_bytes = np.frombuffer(await image.read(), np.uint8)
            frame = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)

            # Mediapipe 얼굴 감지
            with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_detection.process(rgb_frame)

                if results.detections:  # 얼굴이 감지된 경우
                    detected_faces += 1  # 얼굴 감지 수 증가
                    bboxC = results.detections[0].location_data.relative_bounding_box
                    h, w, _ = frame.shape
                    x, y, width, height = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)
                    face = frame[y:y + height, x:x + width]
                    face_resized = cv2.resize(face, (160, 160))

                    # 얼굴 임베딩 생성
                    embedding = facenet.embeddings(np.expand_dims(face_resized, axis=0))[0]
                    embeddings.append(embedding)

        # 얼굴 감지 실패 확인
        if not embeddings:
            raise HTTPException(status_code=400, detail="얼굴이 감지되지 않았습니다.")

        # 얼굴 감지 비율 계산
        detection_rate = detected_faces / total_images

        # 얼굴 감지 비율 기준 확인
        if detection_rate < 0.67:  # 예: 얼굴 감지 비율이 67% 미만인 경우
            raise HTTPException(
                status_code=400,
                detail=f"얼굴 감지 비율이 너무 낮습니다. 감지된 비율: {detection_rate:.2%}"
            )

        # 임베딩 평균 계산 후 반환
        average_embedding = np.mean(embeddings, axis=0)
        return {"embedding": average_embedding.tolist()}
    except HTTPException as e:
        raise e  # 명확한 HTTPException 전달
    except Exception as e:
        # 일반 오류 처리
        return {"error": str(e)}, 500



@app.get("/users") # DB에서 User정보 가져오기
async def get_users():
    db = SessionLocal()
    users = db.query(Member).all()
    db.close()
    return {"users": users}


@app.exception_handler(Exception)
async def exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"status": "fail", "message": f"서버 오류: {str(exc)}"}
    )

@app.get("/classes")
async def get_classes():
    db = SessionLocal()
    try:
        classes = db.query(Class).all()
        return {
            "classes": [
                {
                    "c_id": cls.c_id,
                    "c_name": cls.c_name,
                    "st_time": cls.st_time,
                    "end_time": cls.end_time,
                    "class_day": cls.class_day
                }
                for cls in classes
            ]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()

@app.get("/classes/today")
async def get_classes_today(day: str = Query(...), professor_id: str = Query(...)):
    db = SessionLocal()
    try:
        print(f"요청된 요일: {day}, 교수 ID: {professor_id}")  # 요청된 파라미터 로그

        # 오늘 요일에 해당하는 수업을 가져오기
        classes_today = db.query(Class).filter(Class.class_day == day, Class.m_id == professor_id).all()
        
        print(f"조회된 수업 수: {len(classes_today)}")  # 조회된 수업 수 로그

        # 현재 시간 계산
        now = datetime.now()
        current_time = now.hour * 60 + now.minute

        return {
            "classes": [
                {
                    "c_id": cls.c_id,
                    "c_name": cls.c_name,
                    "st_time": cls.st_time,
                    "end_time": cls.end_time,
                    "fixed_num": cls.fixed_num,
                    "status": (
                        "진행 중" if current_time >= int(cls.st_time.split(':')[0]) * 60 + int(cls.st_time.split(':')[1]) and 
                        current_time <= int(cls.end_time.split(':')[0]) * 60 + int(cls.end_time.split(':')[1]) else
                        "완료" if current_time > int(cls.end_time.split(':')[0]) * 60 + int(cls.end_time.split(':')[1]) else
                        "예정"
                    ),
                    "schedule": f"{cls.st_time} - {cls.end_time}"  # 수업 시간표 추가
                }
                for cls in classes_today
            ]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
    finally:
        db.close()
###################################################
@app.get("/available-courses")
async def get_available_courses():
    db = SessionLocal()
    try:
        # 모든 강의 정보를 가져옵니다.
        courses = (
            db.query(
                Class.c_id,
                Class.c_name,
                Member.m_name.label('professor'),
                Department.d_name.label('department'),
                Class.class_day,
                Class.st_time,
                Class.end_time,
                Class.fixed_num,
                Class.st_date,
                Class.end_date
            )
            .join(Member, Class.m_id == Member.m_id)
            .join(Department, Class.d_id == Department.d_id)
            .all()
        )
        return {
            "courses": [
                {
                    "id": course.c_id,
                    "name": course.c_name,
                    "professor": course.professor,
                    "department": course.department,
                    "class_day": course.class_day,
                    "start_time": course.st_time,
                    "end_time": course.end_time,
                    "capacity": course.fixed_num,
                    "start_date": course.st_date.strftime("%Y-%m-%d"),
                    "end_date": course.end_date.strftime("%Y-%m-%d")
                }
                for course in courses
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/register_course")
async def register_course(course_data: dict):
    course_id = course_data.get('course_id')
    student_id = course_data.get('student_id')
    db = SessionLocal()
    try:
        new_registration = SelectedClass(c_id=course_id, m_id=student_id)
        db.add(new_registration)
        db.commit()
        return {"status": "success", "message": "수강신청이 완료되었습니다."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

#수강신청 조회

@app.get("/registered_courses/{student_id}")
async def get_registered_courses(student_id: str):
   db = SessionLocal()
   try:
       query = text("""
           SELECT 
               c.c_id,
               c.c_name, 
               m.m_name AS professor_name,
               CONCAT(c.class_day, ' ', c.st_time, '-', c.end_time) AS class_time
           FROM mem_sel_class msc
           JOIN class c ON msc.c_id = c.c_id
           JOIN members m ON c.m_id = m.m_id AND m.is_student = 0
           WHERE msc.m_id = :student_id
       """)
       result = db.execute(query, {"student_id": student_id})
       courses = result.fetchall()
       return {
           "courses": [{
               "c_id": row.c_id,
               "c_name": row.c_name, 
               "professor_name": row.professor_name,
               "class_time": row.class_time
           } for row in courses]
       }
   finally:
       db.close()

#수강 철회
@app.delete("/cancel_course/{course_id}/{student_id}")
async def cancel_course(course_id: int, student_id: str):
    db = SessionLocal()
    try:
        query = text("""
            DELETE FROM mem_sel_class 
            WHERE c_id = :course_id AND m_id = :student_id
        """)
        db.execute(query, {"course_id": course_id, "student_id": student_id})
        db.commit()
        return {"status": "success", "message": "수강신청이 취소되었습니다."}
    finally:
        db.close()

#학생의 오늘의 수업 server
@app.get("/student/classes/today")
async def get_classes_today(day: str = Query(...), student_id: str = Query(...)):
    db = SessionLocal()
    try:
        print(f"[디버그] 요청된 요일: {day}, 학생 ID: {student_id}")

        # 파라미터 검증
        if not day or not student_id:
            raise HTTPException(status_code=400, detail="요일과 학생 ID는 필수입니다")

        # 학생 존재 여부 확인
        student_check_query = "SELECT COUNT(*) FROM members WHERE m_id = :student_id"
        student_exists = db.execute(text(student_check_query), {"student_id": student_id}).scalar()
        if not student_exists:
            raise HTTPException(status_code=404, detail="존재하지 않는 학생입니다")

        # 수강신청 데이터 확인
        enrollment_query = "SELECT COUNT(*) FROM mem_sel_class WHERE m_id = :student_id"
        enrollment_count = db.execute(text(enrollment_query), {"student_id": student_id}).scalar()
        if enrollment_count == 0:
            return {"classes": []}  # 수강신청 데이터가 없는 경우 빈 리스트 반환

        # 오늘의 수업 조회
        query = """
            SELECT 
                c.c_id,
                c.c_name,
                c.st_time,
                c.end_time,
                c.m_id AS professor_id,
                c.schedule_dates
            FROM class c
            INNER JOIN mem_sel_class msc ON c.c_id = msc.c_id
            WHERE msc.m_id = :student_id
            ORDER BY c.st_time
        """
        result = db.execute(text(query), {"student_id": student_id}).fetchall()

        # 현재 시간 계산 및 요일 필터링
        classes = []
        for row in result:
            try:
                schedule_dates = row.schedule_dates  # JSON 데이터
                if day not in schedule_dates:  # 오늘 요일이 수업 일정에 포함되지 않으면 건너뜀
                    continue

                classes.append({
                    "c_name": row.c_name,  # 과목명
                    "professor": row.professor_id,  # 교수
                    "st_time": row.st_time,  # 수업 시작
                    "end_time": row.end_time  # 수업 끝
                })
            except Exception as e:
                print(f"[오류] 데이터 처리 중 오류: {e}")
                continue

        print(f"[디버그] 반환 데이터: {classes}")
        return {"classes": classes}

    except SQLAlchemyError as e:
        print(f"[데이터베이스 오류]: {e}")
        raise HTTPException(status_code=500, detail="데이터베이스 처리 중 오류가 발생했습니다")
    except Exception as e:
        print(f"[서버 오류]: {e}")
        raise HTTPException(status_code=500, detail="서버 내부 오류가 발생했습니다")
    finally:
        db.close()



@app.get("/classes/all")
async def get_all_classes():
    db = SessionLocal()
    try:
        classes = (
            db.query(
                Class,
                Member.m_name,
                func.coalesce(func.count(SelectedClass.c_id), 0).label('current_count')
            )
            .join(Member, Class.m_id == Member.m_id)
            .outerjoin(SelectedClass, SelectedClass.c_id == Class.c_id)
            .group_by(
                Class.c_id, Member.m_name, Class.c_name, 
                Class.class_day, Class.st_time, Class.end_time, 
                Class.fixed_num
            )
            .all()
        )
        return {
            "classes": [
                {
                    "c_id": cls.c_id,
                    "c_name": cls.c_name,
                    "m_name": m_name,
                    "class_day": cls.class_day,
                    "st_time": cls.st_time,
                    "end_time": cls.end_time,
                    "fixed_num": int(cls.fixed_num),
                    "current_count": int(current_count),
                    "remaining_seats": int(cls.fixed_num) - int(current_count)
                }
                for cls, m_name, current_count in classes
            ]
        }
    finally:
        db.close()


@app.get("/users") # DB에서 User정보 가져오기
async def get_users():
    db = SessionLocal()
    users = db.query(Member).all()
    db.close()
    return {"users": users}


@app.exception_handler(Exception)
async def exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"status": "fail", "message": f"서버 오류: {str(exc)}"}
    )

@app.get("/admin")
async def get_admin_page():
    return FileResponse("src/admin/admin.html")

# 강의 상태를 저장할 전역 변수
lecture_status = {
    'isActive': False,
    'professorId': None,
    'startTime': None,
    'endTime': None
}

# 강의 상태 확인 엔드포인트
@app.get("/lecture-status")
async def get_lecture_status():
    return {
        "success": True,
        "isLectureActive": lecture_status['isActive'],
        "professorId": lecture_status['professorId'],
        "startTime": lecture_status['startTime'],
        "endTime": lecture_status['endTime']
    }

# 강의 시작 엔드포인트
@app.post("/start-lecture")
async def start_lecture(request: Request):
    try:
        data = await request.json()
        lecture_status['isActive'] = True
        lecture_status['professorId'] = data.get('professorId')
        lecture_status['startTime'] = data.get('startTime')
        lecture_status['endTime'] = None
        
        return {
            "success": True,
            "message": "강의가 시작되었습니다."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 강의 종료 엔드포인트
@app.post("/end-lecture")
async def end_lecture(request: Request):
    try:
        data = await request.json()
        lecture_status['isActive'] = False
        lecture_status['endTime'] = data.get('endTime')
        
        return {
            "success": True,
            "message": "강의가 종료되었습니다."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save_attendance")
async def save_attendance(
    m_id: str = Form(...),
    c_id: int = Form(...),
    in_time: str = Form(...),
    out_time: str = Form(...),
    t_total: str = Form(...)
):
    db = SessionLocal()
    try:
        # 시간 형식 변환 함수
        def convert_time_format(time_str):
            try:
                # "오전/오후 HH:MM" 형식을 "HH:MM" 형식으로 변환
                time_parts = time_str.split()
                if len(time_parts) != 2:
                    return time_str  # 이미 24시간 형식이면 그대로 반환
                
                ampm, time = time_parts
                hours, minutes = map(int, time.split(':'))
                
                if ampm == '오후' and hours < 12:
                    hours += 12
                elif ampm == '오전' and hours == 12:
                    hours = 0
                
                return f"{hours:02d}:{minutes:02d}"
            except Exception as e:
                print(f"시간 변환 중 오류: {str(e)}")
                return time_str

        def convert_total_time(time_str):
            try:
                # "XX분" 형식을 "HH:MM" 형식으로 변환
                minutes = int(time_str.replace('분', ''))
                hours = minutes // 60
                remaining_minutes = minutes % 60
                return f"{hours:02d}:{remaining_minutes:02d}"  # :00 제거
            except Exception as e:
                print(f"총 시간 변환 중 오류: {str(e)}")
                return time_str

        # 입실/퇴실 시간 변환
        formatted_in_time = convert_time_format(in_time)
        formatted_out_time = convert_time_format(out_time)
        formatted_total_time = convert_total_time(t_total)
        
        # 현재 날짜에 해당하는 cd_id 조회
        cd_query = text("""
            SELECT cd_id 
            FROM class_dates 
            WHERE c_id = :c_id 
            AND DATE(lecture_date) = CURRENT_DATE()
        """)
        
        cd_result = db.execute(cd_query, {
            "c_id": c_id
        }).fetchone()
        
        if not cd_result:
            raise HTTPException(status_code=404, detail="오늘 날짜의 수업을 찾을 수 없습니다.")
        
        cd_id = cd_result.cd_id
        
        # 출석 정보 저장 또는 업데이트
        upsert_query = text("""
            INSERT INTO stu_attendance (m_id, c_id, cd_id, in_time, out_time, t_total)
            VALUES (
                :m_id, 
                :c_id, 
                :cd_id, 
                TIME_FORMAT(:in_time, '%H:%i'),  -- 시:분 형식으로 저장
                TIME_FORMAT(:out_time, '%H:%i'), -- 시:분 형식으로 저장
                TIME_FORMAT(:t_total, '%H:%i')   -- 시:분 형식으로 저장
            )
            ON DUPLICATE KEY UPDATE
                in_time = TIME_FORMAT(:in_time, '%H:%i'),
                out_time = TIME_FORMAT(:out_time, '%H:%i'),
                t_total = TIME_FORMAT(:t_total, '%H:%i')
        """)
        
        db.execute(upsert_query, {
            "m_id": m_id,
            "c_id": c_id,
            "cd_id": cd_id,
            "in_time": formatted_in_time,
            "out_time": formatted_out_time,
            "t_total": formatted_total_time
        })
        
        db.commit()
        return {"message": "출석 정보가 저장되었습니다."}
        
    except Exception as e:
        db.rollback()
        print(f"Error in save_attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/save_concentration")  # 기존 경로 유지
async def save_concentration(request: Request):
    db = SessionLocal()
    try:
        data = await request.json()
        
        # 현재 날짜에 해당하는 cd_id 조회
        cd_query = text("""
            SELECT cd_id 
            FROM class_dates 
            WHERE c_id = :c_id 
            AND DATE(lecture_date) = CURRENT_DATE()
        """)
        
        cd_result = db.execute(cd_query, {
            "c_id": data['c_id']
        }).fetchone()
        
        if not cd_result:
            return JSONResponse(content={
                'success': False,
                'message': "오늘 날짜의 수업을 찾을 수 없습니다."
            }, status_code=404)
        
        cd_id = cd_result.cd_id
        
        # 집중도 점수 저장 또는 업데이트
        upsert_query = text("""
            INSERT INTO st_concentration 
                (m_id, c_id, cd_id, blk_score, ht_score, slp_score, not_matched, total)
            VALUES 
                (:m_id, :c_id, :cd_id, :blk_score, :ht_score, :slp_score, :not_matched, :total)
            ON DUPLICATE KEY UPDATE
                blk_score = :blk_score,
                ht_score = :ht_score,
                slp_score = :slp_score,
                not_matched = :not_matched,
                total = :total
        """)
        
        db.execute(upsert_query, {
            "m_id": data['m_id'],
            "c_id": data['c_id'],
            "cd_id": cd_id,
            "blk_score": data['blk_score'],
            "ht_score": data['ht_score'],
            "slp_score": data['slp_score'],
            "not_matched": data['not_matched'],
            "total": data['total']
        })
        
        db.commit()
        return JSONResponse(content={
            'success': True,
            'message': "집중도 점수가 저장되었습니다."
        })
        
    except Exception as e:
        db.rollback()
        print(f"Error in save_concentration: {str(e)}")
        return JSONResponse(content={
            'success': False,
            'message': f"집중도 점수 저장 중 오류가 발생했습니다: {str(e)}"
        }, status_code=500)
    finally:
        db.close()

@app.get("/api/professor/courses/{professor_id}")
async def get_professor_courses(professor_id: str):
    db = SessionLocal()
    try:
        courses = (
            db.query(Class.c_id, Class.c_name)
            .filter(Class.m_id == professor_id)
            .all()
        )
        
        return {
            "courses": [
                {"c_id": course.c_id, "c_name": course.c_name}
                for course in courses
            ]
        }
    finally:
        db.close()

@app.get("/api/grades/course/{course_id}")
async def get_course_grades(course_id: int):
    db = SessionLocal()
    try:
        # 수강생 정보와 집중도 점수 가져오기
        students_query = text("""
            SELECT 
                m.m_id as s_id,
                m.m_name as name,
                AVG(sc.total) as attendance_score
            FROM members m
            JOIN mem_sel_class msc ON m.m_id = msc.m_id
            LEFT JOIN st_concentration sc ON m.m_id = sc.m_id AND msc.c_id = sc.c_id
            WHERE msc.c_id = :course_id
            GROUP BY m.m_id, m.m_name
        """)
        
        students = db.execute(students_query, {"course_id": course_id}).fetchall()
        
        grade_data = []
        grade_distribution = {
            'A+': 0, 'A0': 0, 'B+': 0, 'B0': 0,
            'C+': 0, 'C0': 0, 'D+': 0, 'D0': 0, 'F': 0
        }
        
        for student in students:
            # 임시로 랜덤 점수 생성 (실제로는 DB에서 가져와야 함)
            midterm = random.randint(60, 100)
            final = random.randint(60, 100)
            assignment = random.randint(60, 100)
            attendance = float(student.attendance_score or 0)
            
            # 총점 계산 (가중치 적용)
            total = (midterm * 0.3) + (final * 0.3) + (assignment * 0.2) + (attendance * 0.2)
            
            # 학점 부여
            grade = 'F'
            if total >= 95: grade = 'A+'
            elif total >= 90: grade = 'A0'
            elif total >= 85: grade = 'B+'
            elif total >= 80: grade = 'B0'
            elif total >= 75: grade = 'C+'
            elif total >= 70: grade = 'C0'
            elif total >= 65: grade = 'D+'
            elif total >= 60: grade = 'D0'
            
            grade_distribution[grade] += 1
            
            grade_data.append({
                's_id': student.s_id,
                'name': student.name,
                'midterm_score': midterm,
                'final_score': final,
                'assignment_score': assignment,
                'attendance_score': round(attendance, 2),
                'total_score': round(total, 2),
                'grade': grade
            })
        
        return {
            "gradeData": grade_data,
            "gradeDistribution": grade_distribution
        }
    finally:
        db.close()

@app.get("/api/enrolled-students/{professor_id}")
async def get_enrolled_students(professor_id: str):
    db = SessionLocal()
    try:
        # 교수의 강의를 수강하는 학생들의 정보를 가져오는 쿼리
        query = text("""
            SELECT DISTINCT 
                m.m_id as s_id,
                m.m_name as name
            FROM members m
            JOIN mem_sel_class msc ON m.m_id = msc.m_id
            JOIN class c ON msc.c_id = c.c_id
            WHERE c.m_id = :professor_id
            AND m.is_student = TRUE
        """)
        
        students = db.execute(query, {"professor_id": professor_id}).fetchall()
        
        return {
            "students": [
                {
                    "s_id": student.s_id,
                    "name": student.name
                }
                for student in students
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/attendance-scores")
async def get_attendance_scores():
    db = SessionLocal()
    try:
        # 각 학생의 평균 출석 점수를 가져오는 쿼리
        query = text("""
            SELECT 
                m_id,
                AVG(total) as average_score
            FROM st_concentration
            GROUP BY m_id
        """)
        
        scores = db.execute(query).fetchall()
        
        # 학생 ID를 키로 하고 평균 점수를 값으로 하는 딕셔너리 생성
        attendance_scores = {
            score.m_id: round(float(score.average_score), 2) if score.average_score else 0
            for score in scores
        }
        
        return {
            "scores": attendance_scores
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/grades/all/{professor_id}")
async def get_all_grades(professor_id: str):
    db = SessionLocal()
    try:
        # 교수의 모든 강의와 수강생 정보 가져오기
        courses_query = text("""
            SELECT DISTINCT
                c.c_id,
                c.c_name,
                m.m_id as s_id,
                m.m_name as student_name,
                AVG(sc.total) as attendance_score
            FROM class c
            JOIN mem_sel_class msc ON c.c_id = msc.c_id
            JOIN members m ON msc.m_id = m.m_id
            LEFT JOIN st_concentration sc ON m.m_id = sc.m_id AND c.c_id = sc.c_id
            WHERE c.m_id = :professor_id
            GROUP BY c.c_id, c.c_name, m.m_id, m.m_name
        """)
        
        results = db.execute(courses_query, {"professor_id": professor_id}).fetchall()
        
        # 전체 성적 데이터와 분포 초기화
        grade_data = []
        grade_distribution = {
            'A+': 0, 'A0': 0, 'B+': 0, 'B0': 0,
            'C+': 0, 'C0': 0, 'D+': 0, 'D0': 0, 'F': 0
        }
        
        for result in results:
            # 임시 점수 생성 (실제로는 student_grades 테이블에서 가져와야 함)
            midterm = random.randint(60, 100)
            final = random.randint(60, 100)
            assignment = random.randint(60, 100)
            attendance = float(result.attendance_score or 0)
            
            # 총점 계산
            total = (midterm * 0.3) + (final * 0.3) + (assignment * 0.2) + (attendance * 0.2)
            
            # 학점 부여
            grade = 'F'
            if total >= 95: grade = 'A+'
            elif total >= 90: grade = 'A0'
            elif total >= 85: grade = 'B+'
            elif total >= 80: grade = 'B0'
            elif total >= 75: grade = 'C+'
            elif total >= 70: grade = 'C0'
            elif total >= 65: grade = 'D+'
            elif total >= 60: grade = 'D0'
            
            # 학점 분포 업데이트
            grade_distribution[grade] += 1
            
            # 학생 성적 정보 추가
            student_data = {
                's_id': result.s_id,
                'name': result.student_name,
                'course_name': result.c_name,  # 과목명 추가
                'midterm_score': midterm,
                'final_score': final,
                'assignment_score': assignment,
                'attendance_score': round(attendance, 2),
                'total_score': round(total, 2),
                'grade': grade
            }
            grade_data.append(student_data)
        
        return {
            "gradeData": grade_data,
            "gradeDistribution": grade_distribution
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/weekly-grades/course/{course_id}")
async def get_weekly_grades_course(course_id: int):
    db = SessionLocal()
    try:
        # 과목의 전체 학생 주차별 데이터 조회 (class_dates 활용)
        query = text("""
            SELECT 
                m.m_id as s_id,
                m.m_name as name,
                c.c_name as course_name,
                AVG(sc.total) as avg_concentration,
                COUNT(DISTINCT sc.cd_id) * 100.0 / 
                    (SELECT COUNT(*) 
                     FROM class_dates cd 
                     WHERE cd.c_id = :course_id) as attendance_rate
            FROM members m
            JOIN mem_sel_class msc ON m.m_id = msc.m_id
            JOIN class c ON msc.c_id = c.c_id
            LEFT JOIN class_dates cd ON c.c_id = cd.c_id
            LEFT JOIN st_concentration sc ON cd.cd_id = sc.cd_id AND m.m_id = sc.m_id
            WHERE c.c_id = :course_id
            GROUP BY m.m_id, m.m_name, c.c_name
        """)
        
        results = db.execute(query, {"course_id": course_id}).fetchall()
        
        return [
            {
                "s_id": result.s_id,
                "name": result.name,
                "course_name": result.course_name,
                "avg_concentration": float(result.avg_concentration or 0),
                "attendance_rate": float(result.attendance_rate or 0)
            }
            for result in results
        ]
    except Exception as e:
        print(f"Error in get_weekly_grades_course: {str(e)}")  # 디버깅용 로그
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/weekly-grades/detail/{course_id}/{student_id}")
async def get_weekly_grades_detail(course_id: int, student_id: str):
    db = SessionLocal()
    try:
        # 모든 강의 날짜를 가져오고, 성적 데이터와 LEFT JOIN
        query = text("""
            SELECT 
                cd.lecture_week as week,
                cd.lecture_date as date,
                COALESCE(sc.total, 0) as concentration,
                CASE 
                    WHEN sc.m_id IS NULL THEN '결석'
                    WHEN sc.total >= 80 THEN '출석'
                    WHEN sc.total >= 60 THEN '지각'
                    ELSE '결석'
                END as attendance_status
            FROM class_dates cd
            LEFT JOIN st_concentration sc ON cd.cd_id = sc.cd_id 
                AND sc.m_id = :student_id
            WHERE cd.c_id = :course_id
            ORDER BY cd.lecture_week
        """)
        
        results = db.execute(query, {
            "course_id": course_id,
            "student_id": student_id
        }).fetchall()
        
        weekly_data = [
            {
                "week": result.week,
                "date": result.date.strftime("%Y-%m-%d"),
                "concentration": float(result.concentration),
                "attendance_status": result.attendance_status
            }
            for result in results
        ]
        
        return {
            "weeklyData": weekly_data
        }
    except Exception as e:
        print(f"Error in get_weekly_grades_detail: {str(e)}")  # 디버깅용 로그
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# [학생 대시보드] - 성적 - 신청 과목 불러오기
@app.get("/api/student/grades/courses/{student_id}")
async def get_student_grade_courses(student_id: str):
    db = SessionLocal()
    try:
        # 학생이 수강 중인 과목 정보를 가져오는 쿼리
        query = text("""
            SELECT DISTINCT
                c.c_id,
                c.c_name,
                m.m_name as professor_name,
                c.class_day,
                c.st_time,
                c.end_time
            FROM mem_sel_class msc
            JOIN class c ON msc.c_id = c.c_id
            JOIN members m ON c.m_id = m.m_id AND m.is_student = 0
            WHERE msc.m_id = :student_id
            ORDER BY c.c_name
        """)
        
        result = db.execute(query, {"student_id": student_id})
        courses = result.fetchall()
        
        if not courses:
            return {"courses": []}
            
        return {
            "courses": [
                {
                    "c_id": course.c_id,
                    "c_name": course.c_name,
                    "professor_name": course.professor_name,
                    "schedule": f"{course.class_day} {course.st_time}-{course.end_time}"
                }
                for course in courses
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"과목 목록 조회 오류: {str(e)}")
    finally:
        db.close()
############################################
def calculate_attendance_status(score_data, class_date):
    # 문자열을 datetime 객체로 변환
    today = datetime.now().date()
    lecture_date = datetime.strptime(class_date, '%Y-%m-%d').date()
    
    # 1. 먼저 날짜 체크
    if lecture_date > today:
        return 'pending'  # 미래 날짜는 무조건 미출결
    
    # 2. 과거 날짜인 경우 집중도 점수로 출석 여부 판단
    if not any(score is not None for score in score_data.values()):
        return 'absent'  # 데이터가 없으면 결석
        
    # total이 None이면 0으로 처리 (SQL 쿼리의 total_score 필드명과 일치)
    total_score = score_data.get('total', 0) or 0
    
    if total_score >= 80:
        return 'present'  # 80점 이상이면 출석
    elif total_score >= 60:
        return 'late'     # 60점 이상이면 지각
    else:
        return 'absent'   # 그 외는 결석
# [학생 대시보드] - 성적 - 주차별 성적 불러오기
@app.get("/api/student/grades/weekly/{student_id}/{course_id}")
async def get_weekly_grades(student_id: str, course_id: int):
    db = SessionLocal()
    try:
        query = text("""
            SELECT 
                cd.lecture_week as week,
                cd.lecture_date as date,
                sc.blk_score as blink_score,
                sc.ht_score as concentration_score,
                sc.slp_score as head_position_score,
                sc.total as total_score,
                c.c_name as course_name,
                m.m_name as professor_name,
                sa.in_time,
                c.st_time
            FROM class_dates cd
            LEFT JOIN st_concentration sc ON cd.c_id = sc.c_id 
                AND cd.cd_id = sc.cd_id 
                AND sc.m_id = :student_id
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id 
                AND sa.m_id = :student_id
            JOIN class c ON cd.c_id = c.c_id
            JOIN members m ON c.m_id = m.m_id AND m.is_student = 0
            WHERE cd.c_id = :course_id
            ORDER BY cd.lecture_week
        """)
        
        result = db.execute(query, {"student_id": student_id, "course_id": course_id})
        grades = result.fetchall()
        
        result = []
        total_scores = []  # 현재까지의 점수를 저장할 리스트
        
        for grade in grades:
            # 출석 상태 판단
            if grade.date > datetime.now().date():
                attendance_status = 'pending'
            elif grade.in_time is None:
                attendance_status = 'absent'
            elif grade.in_time > grade.st_time:
                attendance_status = 'late'
            else:
                attendance_status = 'present'
            
            # 현재 날짜까지의 점수만 합산
            if grade.date <= datetime.now().date():
                if grade.total_score is not None:
                    total_scores.append(grade.total_score)
            
            # 평균 계산 (현재까지의 데이터만 사용)
            avg_score = sum(total_scores) / len(total_scores) if total_scores else 0
            
            result.append({
                'week': grade.week,
                'date': grade.date.strftime('%Y-%m-%d'),
                'blinkScore': grade.blink_score,
                'concentrationScore': grade.concentration_score,
                'headPositionScore': grade.head_position_score,
                'total': grade.total_score,
                'attendance': attendance_status,
                'courseName': grade.course_name,
                'professorName': grade.professor_name,
                'averageScore': round(avg_score, 1) if total_scores else None  # 평균 점수 추가
            })
            
        return result
        
    except Exception as e:
        print('Error:', str(e))
        raise HTTPException(status_code=500, detail=f"성적 데이터를 불러오는데 실패했습니다. 오류: {str(e)}")
    finally:
        db.close()
        
@app.get("/api/student/attendance/summary/{student_id}/{course_id}")
async def get_student_attendance_summary(student_id: str, course_id: int):
    db = SessionLocal()
    try:
        # 학생의 출석 통계 조회 (미래 날짜 제외)
        summary_query = text("""
            SELECT 
                COUNT(*) as total_classes,
                COUNT(CASE WHEN lecture_date <= CURRENT_DATE() THEN 1 END) as past_classes,
                COUNT(CASE WHEN attendance_status = '출석' THEN 1 END) as present_count,
                COUNT(CASE WHEN attendance_status = '지각' THEN 1 END) as late_count,
                COUNT(CASE WHEN attendance_status = '결석' AND lecture_date <= CURRENT_DATE() THEN 1 END) as absent_count,
                ROUND(AVG(CASE WHEN t_total IS NOT NULL THEN TIME_TO_SEC(t_total) ELSE 0 END / 60), 1) as avg_attendance_minutes
            FROM (
                SELECT 
                    cd.lecture_date,
                    CASE 
                        WHEN cd.lecture_date > CURRENT_DATE() THEN '미출결'
                        WHEN sa.in_time IS NULL THEN '결석'
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                             TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 THEN '출석'
                        WHEN sa.in_time > c.st_time THEN '지각'
                        ELSE '결석'
                    END as attendance_status,
                    sa.t_total
                FROM class_dates cd
                LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id 
                    AND sa.m_id = :student_id 
                    AND sa.c_id = :course_id
                JOIN class c ON cd.c_id = c.c_id
                WHERE cd.c_id = :course_id
            ) as attendance_data
        """)
        
        # 주차별 출석 상세 정보 조회
        detail_query = text("""
            SELECT 
                cd.lecture_week,
                cd.lecture_date,
                TIME_FORMAT(sa.in_time, '%H:%i') as in_time,    -- TIME_FORMAT으로 변경
                TIME_FORMAT(sa.out_time, '%H:%i') as out_time,  -- TIME_FORMAT으로 변경
                TIME_FORMAT(sa.t_total, '%H시간 %i분') as total_time,
                CASE 
                    WHEN cd.lecture_date > CURRENT_DATE() THEN '미출결'
                    WHEN sa.in_time IS NULL THEN '결석'
                    WHEN TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                         TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 THEN '출석'
                    WHEN sa.in_time > c.st_time THEN '지각'
                    ELSE '결석'
                END as status
            FROM class_dates cd
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id 
                AND sa.m_id = :student_id 
                AND sa.c_id = :course_id
            JOIN class c ON cd.c_id = c.c_id
            WHERE cd.c_id = :course_id
            ORDER BY cd.lecture_week
        """)
        
        # 쿼리 실행 및 응답 데이터 구성
        summary_result = db.execute(summary_query, {
            "student_id": student_id,
            "course_id": course_id
        }).fetchone()
        
        detail_results = db.execute(detail_query, {
            "student_id": student_id,
            "course_id": course_id
        }).fetchall()
        
        return {
            "summary": {
                "total_classes": summary_result.total_classes,
                "past_classes": summary_result.past_classes,
                "present_count": summary_result.present_count,
                "late_count": summary_result.late_count,
                "absent_count": summary_result.absent_count,
                "attendance_rate": round((summary_result.present_count + summary_result.late_count) / summary_result.past_classes * 100, 1) if summary_result.past_classes > 0 else 0,
                "avg_attendance_minutes": summary_result.avg_attendance_minutes or 0
            },
            "details": [{
                "week": result.lecture_week,
                "date": result.lecture_date.strftime("%Y-%m-%d"),
                "in_time": result.in_time,  # 이미 HH:MM 형식으로 변환됨
                "out_time": result.out_time,  # 이미 HH:MM 형식으로 변환됨
                "total_time": result.total_time,  # 이미 "HH시간 MM분" 형식으로 변환됨
                "status": result.status
            } for result in detail_results]
        }
        
    except Exception as e:
        print(f"Error in get_student_attendance_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# 서버 실행 (uvicorn 실행 명령어 필요)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="220.90.180.95", port=9000)
