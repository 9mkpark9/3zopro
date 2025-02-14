from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from config.database import get_db
from models.member import Member
from models.department import Department
from models.class_model import Class, SelectedClass
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    m_id: str
    m_pw: str

@router.post("/login")
async def login_user(user: LoginRequest, db: Session = Depends(get_db)):
    try:
        # 디버그: 요청된 로그인 정보 출력
        print(f"Login attempt - ID: {user.m_id}")
        
        # 먼저 사용자 존재 여부 확인
        member = db.query(Member).filter(Member.m_id == user.m_id).first()
        if not member:
            print(f"User not found: {user.m_id}")
            raise HTTPException(status_code=400, detail="ID 또는 PW가 일치하지 않습니다.")
            
        # 비밀번호 확인
        if member.m_pw != user.m_pw:
            print(f"Password mismatch for user: {user.m_id}")
            raise HTTPException(status_code=400, detail="ID 또는 PW가 일치하지 않습니다.")

        # Department 정보 조회
        department = db.query(Department).filter(Department.d_id == member.d_id).first()
        if not department:
            print(f"Department not found for user: {user.m_id}")
            raise HTTPException(status_code=500, detail="학과 정보를 찾을 수 없습니다.")

        response_data = {
            "name": member.m_name,
            "id": member.m_id,
            "department": department.d_name,
            "is_student": member.is_student,
        }

        # 학생인 경우 수강 과목 정보 추가
        if member.is_student:
            enrolled_courses = (
                db.query(Class)
                .join(SelectedClass, Class.c_id == SelectedClass.c_id)
                .filter(SelectedClass.m_id == member.m_id)
                .all()
            )
            response_data["enrolled_courses"] = [
                {
                    "c_id": course.c_id,
                    "c_name": course.c_name,
                    "st_time": course.st_time,
                    "end_time": course.end_time,
                    "class_day": course.class_day
                }
                for course in enrolled_courses
            ]
        # 교수인 경우 담당 강의 정보 추가
        else:
            teaching_courses = (
                db.query(Class)
                .filter(Class.m_id == member.m_id)
                .all()
            )
            response_data["class_schedule"] = [
                {
                    "c_id": course.c_id,
                    "c_name": course.c_name,
                    "st_time": course.st_time,
                    "end_time": course.end_time,
                    "fixed_num": course.fixed_num,
                    "class_day": course.class_day
                }
                for course in teaching_courses
            ]

        print(f"Login successful for user: {user.m_id}")
        return response_data

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Login error for user {user.m_id}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}") 