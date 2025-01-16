from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi_socketio import SocketManager
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Integer, Boolean, LargeBinary, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from face import capture_face_embedding
from sqlalchemy import JSON  # JSON 타입 임포트
from datetime import datetime, timedelta
import tensorflow as tf
import urllib.parse

password = urllib.parse.quote_plus("2dong34ho@")


tf.get_logger().setLevel('ERROR')

app = FastAPI()
socket_manager = SocketManager(app)


# MySQL 연결 설정
DATABASE_URL = f"mysql+pymysql://root:{password}@localhost:3306/3zopro"  # 본인의 MySQL 비밀번호와 데이터베이스 이름을 입력하세요
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

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

    c_id = Column(Integer, primary_key=True, index=True)
    c_name = Column(String(30), nullable=False)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)  # 교수 외래 키
    d_id = Column(Integer, ForeignKey("department.d_id"), nullable=False)  # 학과 외래 키
    schedule_dates = Column(JSON, nullable=False)
    st_time = Column(String, nullable=False)  # 시작 시간
    end_time = Column(String, nullable=False)  # 종료 시간

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
    c_name: str
    m_id: str  # 로그인한 사용자 ID
    d_id: int  # 학과 ID
    schedule_dates: dict  # 강의 일정 (JSON)
    st_time: str  # 시작 시간
    end_time: str  # 종료 시간

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

@app.post("/inputclass") # 강의 추가
async def input_class(course: CourseData):
    db = SessionLocal()
    try:
        # 새로운 강의 추가
        new_class = Class(
            c_name=course.c_name,
            m_id=course.m_id,
            d_id=course.d_id,
            schedule_dates=course.schedule_dates,  # JSON 형태로 저장
            st_time=course.st_time,
            end_time=course.end_time
        )
        db.add(new_class)
        db.commit()
        db.refresh(new_class)
        
        return {"status": "success", "message": "강의가 성공적으로 추가되었습니다.", "class_id": new_class.c_id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="데이터베이스 오류")
    except Exception as e:
        db.rollback()
        print("General Error:", e)
        raise HTTPException(status_code=500, detail="서버 오류")
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
        
        # 얼굴 캡처 및 임베딩 생성
        embedding = capture_face_embedding()  # 얼굴 캡처 및 임베딩 생성 함수 호출
        
        if embedding is None:
            raise HTTPException(status_code=400, detail="얼굴 캡처에 실패했습니다.")
        
        # 새로운 사용자 추가
        db_user = Member(
            m_id=user.m_id,
            m_pw=user.m_pw,
            m_name=user.m_name,
            d_id=user.d_id,
            is_student=user.is_student,
            m_face=embedding  # 얼굴 임베딩 저장
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

@app.post("/login") # 로그인
async def login_user(user: LoginRequest):
    db = SessionLocal()
    try:
        # ID와 PW 확인
        user_record = db.query(Member).filter(
            Member.m_id == user.m_id, Member.m_pw == user.m_pw
        ).first()

        if not user_record:
            raise HTTPException(status_code=400, detail="ID 또는 PW가 일치하지 않습니다.")
          
        return {"status": "success", "message": "로그인 성공", "name": user_record.m_name, "istudent": user_record.is_student}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="데이터베이스 오류")
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
    return {"status": "fail", "message": f"서버 오류: {str(exc)}"}

# 서버 실행 (uvicorn 실행 명령어 필요)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="192.168.0.117", port=9000)
