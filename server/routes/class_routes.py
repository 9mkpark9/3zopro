from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from config.database import get_db
from models.class_model import Class, SelectedClass
from models.member import Member
from models.department import Department
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional
import json

router = APIRouter(prefix="/classes", tags=["classes"])

class CourseData(BaseModel):
    c_id: int
    c_name: str
    m_id: str
    d_id: int
    st_date: str
    end_date: str
    class_day: str
    st_time: str
    end_time: str
    fixed_num: int

class SaveClass(BaseModel):
    m_id: str
    c_id: int

@router.post("/inputclass")
async def input_class(class_data: dict, db: Session = Depends(get_db)):
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

        # 1. class 테이블에 강의 정보 입력
        class_query = text("""
            INSERT INTO class (
                c_id, c_name, m_id, d_id, 
                st_date, end_date, class_day, 
                st_time, end_time, fixed_num,
                lecture_date
            ) VALUES (
                :c_id, :c_name, :m_id, :d_id,
                :st_date, :end_date, :class_day,
                :st_time, :end_time, :fixed_num,
                :lecture_date
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
            "st_time": class_data["st_time"],
            "end_time": class_data["end_time"],
            "fixed_num": class_data["fixed_num"],
            "lecture_date": lecture_dates_json
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
        return {"status": "success", "message": "강의가 성공적으로 추가되었습니다."}
    except HTTPException as e:
        db.rollback()
        raise e
    except Exception as e:
        db.rollback()
        print(f"Error in input_class: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/courses/{m_id}")
async def get_courses(m_id: str, db: Session = Depends(get_db)):
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
                "d_name": course[1],
                "st_time": course[0].st_time,
                "end_time": course[0].end_time
            }
            for course in courses   
        ]
    }

@router.post("/saveClass")
async def save_class(save_class: SaveClass, db: Session = Depends(get_db)):
    try:
        course = db.query(Class).filter(Class.c_id == save_class.c_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
        
        selected_class = SelectedClass(m_id=save_class.m_id, c_id=save_class.c_id)
        db.add(selected_class)
        db.commit()
        
        return {"status": "success", "message": "강의가 성공적으로 저장되었습니다."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/deleteClass")
async def delete_class(save_class: SaveClass, db: Session = Depends(get_db)):
    try:
        selected_class = db.query(SelectedClass).filter(
            SelectedClass.c_id == save_class.c_id,
            SelectedClass.m_id == save_class.m_id
        ).first()
        
        if not selected_class:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
        
        db.delete(selected_class)
        db.commit()
        
        return {"status": "success", "message": "강의가 성공적으로 삭제되었습니다."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/today")
async def get_today_classes(day: str, professor_id: str, db: Session = Depends(get_db)):
    try:
        classes = (
            db.query(Class)
            .filter(
                Class.m_id == professor_id,
                Class.class_day == day
            )
            .all()
        )
        
        return {
            "classes": [
                {
                    "c_id": cls.c_id,
                    "c_name": cls.c_name,
                    "st_time": cls.st_time,
                    "end_time": cls.end_time,
                    "class_day": cls.class_day,
                    "fixed_num": cls.fixed_num
                }
                for cls in classes
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def get_all_classes(db: Session = Depends(get_db)):
    try:
        classes = db.query(Class).all()
        return {
            "classes": [
                {
                    "c_id": cls.c_id,
                    "c_name": cls.c_name,
                    "m_id": cls.m_id,
                    "st_time": cls.st_time,
                    "end_time": cls.end_time,
                    "class_day": cls.class_day,
                    "fixed_num": cls.fixed_num
                }
                for cls in classes
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{class_id}/enrollment")
async def get_class_enrollment(class_id: int, db: Session = Depends(get_db)):
    try:
        # 수강 신청한 학생 수 조회
        enrolled_count = db.query(SelectedClass).filter(
            SelectedClass.c_id == class_id
        ).count()
        
        return {
            "enrolled_count": enrolled_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 