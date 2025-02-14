from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from config.database import get_db
from models.department import Department
from models.class_model import Class
from models.member import Member

router = APIRouter(prefix="/departments", tags=["departments"])

@router.get("")
async def get_departments(db: Session = Depends(get_db)):
    """학과 목록 가져오기"""
    departments = db.query(Department).all()
    return {
        "departments": [
            {"d_id": dept.d_id, "d_name": dept.d_name} 
            for dept in departments
        ]
    }

@router.get("/{d_id}/courses")
async def get_department_courses(d_id: str, db: Session = Depends(get_db)):
    """특정 학과의 강의 목록 가져오기"""
    try:
        courses = (
            db.query(Class, Department.d_name, Member.m_name)
            .join(Department, Class.d_id == Department.d_id)
            .join(Member, Class.m_id == Member.m_id)
            .filter(Class.d_id == d_id)
            .all()
        )
        
        return {
            "courses": [
                {
                    "c_id": course[0].c_id,
                    "c_name": course[0].c_name,
                    "d_name": course[1],
                    "professor": course[2],
                    "schedule": f"{course[0].class_day} {course[0].st_time}-{course[0].end_time}",
                    "fixed_num": course[0].fixed_num
                }
                for course in courses
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{d_id}/members")
async def get_department_members(d_id: str, db: Session = Depends(get_db)):
    """특정 학과의 구성원 목록 가져오기"""
    try:
        members = db.query(Member).filter(Member.d_id == d_id).all()
        return {
            "members": [
                {
                    "m_id": member.m_id,
                    "m_name": member.m_name,
                    "is_student": member.is_student
                }
                for member in members
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 