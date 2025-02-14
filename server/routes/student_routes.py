from fastapi import APIRouter, HTTPException, Depends, Form, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from config.database import get_db
from typing import List
import json
from pydantic import BaseModel
from datetime import datetime

# prefix 없이 기본 라우터 설정
router = APIRouter(tags=["student"])

class CourseRegistration(BaseModel):
    student_id: str
    course_id: int

class AttendanceData(BaseModel):
    student_id: str
    class_id: int
    in_time: str
    out_time: str
    t_total: str

class ConcentrationData(BaseModel):
    student_id: str
    class_id: int
    score: float

@router.get("/registered_courses/{student_id}")
async def get_registered_courses(student_id: str, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                c.c_id,
                c.c_name,
                m.m_name,
                d.d_name,
                c.class_day,
                c.st_time,
                c.end_time
            FROM mem_sel_class msc
            JOIN class c ON msc.c_id = c.c_id
            JOIN members m ON c.m_id = m.m_id
            JOIN department d ON c.d_id = d.d_id
            WHERE msc.m_id = :student_id
            ORDER BY c.c_name
        """)
        
        result = db.execute(query, {"student_id": student_id})
        courses = result.fetchall()
        
        return {
            "courses": [{
                "c_id": course.c_id,
                "c_name": course.c_name,
                "professor_name": course.m_name,
                "class_time": f"{course.class_day} {course.st_time}-{course.end_time}"
            } for course in courses]
        }
    except Exception as e:
        print(f"Error in get_registered_courses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/classes/all")
async def get_all_classes(db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                c.c_id,
                c.c_name,
                m.m_name,
                c.class_day,
                c.st_time,
                c.end_time,
                c.fixed_num,
                COUNT(DISTINCT msc.m_id) as current_count
            FROM class c
            JOIN members m ON c.m_id = m.m_id
            LEFT JOIN mem_sel_class msc ON c.c_id = msc.c_id
            GROUP BY 
                c.c_id, c.c_name, m.m_name,
                c.class_day, c.st_time, c.end_time, c.fixed_num
            ORDER BY c.c_name
        """)
        
        result = db.execute(query)
        classes = result.fetchall()
        
        return {
            "classes": [{
                "c_id": cls.c_id,
                "c_name": cls.c_name,
                "m_name": cls.m_name,
                "class_day": cls.class_day,
                "st_time": str(cls.st_time),
                "end_time": str(cls.end_time),
                "fixed_num": cls.fixed_num,
                "current_count": cls.current_count
            } for cls in classes]
        }
    except Exception as e:
        print(f"Error in get_all_classes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/attendance/{student_id}")  # 경로 수정
async def get_student_attendance(student_id: str, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                c.c_name,
                cd.lecture_date,
                CASE 
                    WHEN sa.in_time IS NULL THEN '결석'
                    WHEN sa.in_time > c.st_time THEN '지각'
                    ELSE '출석'
                END as status
            FROM class_dates cd
            JOIN class c ON cd.c_id = c.c_id
            JOIN mem_sel_class msc ON c.c_id = msc.c_id
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id AND sa.m_id = :student_id
            WHERE msc.m_id = :student_id
            ORDER BY cd.lecture_date DESC
        """)
        
        result = db.execute(query, {"student_id": student_id})
        attendance = result.fetchall()
        
        total_classes = len(attendance)
        attended = sum(1 for a in attendance if a.status == '출석')
        
        return {
            "attendance": {
                "total_classes": total_classes,
                "attended": attended,
                "attendance_rate": round(attended/total_classes * 100, 1) if total_classes > 0 else 0,
                "details": [{
                    "date": a.lecture_date.strftime("%Y-%m-%d"),
                    "course_name": a.c_name,
                    "status": a.status
                } for a in attendance]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/save_attendance")
async def save_attendance(data: AttendanceData, db: Session = Depends(get_db)):
    try:
        print("받은 데이터:", {
            "student_id": data.student_id,
            "class_id": data.class_id,
            "in_time": data.in_time,
            "out_time": data.out_time,
            "t_total": data.t_total
        })
        
        # 현재 날짜에 해당하는 cd_id 조회
        class_date_query = text("""
            SELECT cd_id 
            FROM class_dates 
            WHERE c_id = :class_id 
            AND DATE(lecture_date) = CURRENT_DATE()
        """)
        
        print("class_date 쿼리:", class_date_query)
        print("class_id:", data.class_id)
        
        class_date = db.execute(class_date_query, {
            "class_id": data.class_id
        }).scalar()
        
        print("조회된 class_date:", class_date)
        
        if not class_date:
            raise HTTPException(status_code=404, detail="해당 날짜의 수업을 찾을 수 없습니다.")

        # 출석 정보 저장
        insert_query = text("""
            INSERT INTO stu_attendance (m_id, c_id, cd_id, in_time, out_time, t_total)
            VALUES (:student_id, :class_id, :class_date, :in_time, :out_time, :t_total)
            ON DUPLICATE KEY UPDATE 
            in_time = :in_time,
            out_time = :out_time,
            t_total = :t_total
        """)
        
        print("실행할 쿼리:", insert_query)
        print("쿼리 파라미터:", {
            "student_id": data.student_id,
            "class_id": data.class_id,
            "class_date": class_date,
            "in_time": data.in_time,
            "out_time": data.out_time,
            "t_total": data.t_total
        })
        
        db.execute(insert_query, {
            "student_id": data.student_id,
            "class_id": data.class_id,
            "class_date": class_date,
            "in_time": data.in_time,
            "out_time": data.out_time,
            "t_total": data.t_total
        })
        
        db.commit()
        return {"success": True, "message": "출석이 저장되었습니다."}
        
    except Exception as e:
        db.rollback()
        print(f"Error in save_attendance: {str(e)}")
        print(f"Error type: {type(e)}")
        print(f"Error details: {e.__dict__}")
        raise HTTPException(
            status_code=500, 
            detail=f"출석 저장 중 오류가 발생했습니다: {str(e)}"
        )

@router.post("/save_concentration")
async def save_concentration(request: Request, db: Session = Depends(get_db)):
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

@router.post("/register_course")
async def register_course(data: CourseRegistration, db: Session = Depends(get_db)):
    try:
        # 이미 수강신청한 과목인지 확인
        check_query = text("""
            SELECT COUNT(*) as count 
            FROM mem_sel_class 
            WHERE m_id = :student_id AND c_id = :course_id
        """)
        result = db.execute(check_query, {
            "student_id": data.student_id,
            "course_id": data.course_id
        }).scalar()
        
        if result > 0:
            raise HTTPException(status_code=400, detail="이미 수강신청한 과목입니다.")
            
        # 수강신청 처리
        insert_query = text("""
            INSERT INTO mem_sel_class (m_id, c_id)
            VALUES (:student_id, :course_id)
        """)
        
        db.execute(insert_query, {
            "student_id": data.student_id,
            "course_id": data.course_id
        })
        db.commit()
        
        return {"message": "수강신청이 완료되었습니다."}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cancel_course/{student_id}/{course_id}")
async def cancel_course(student_id: str, course_id: int, db: Session = Depends(get_db)):
    try:
        print(f"Attempting to cancel course: student_id={student_id}, course_id={course_id}")
        
        # 수강신청 내역 확인
        check_query = text("""
            SELECT COUNT(*) 
            FROM mem_sel_class 
            WHERE m_id = :student_id AND c_id = :course_id
        """)
        
        params = {
            "student_id": student_id,
            "course_id": course_id
        }
        
        result = db.execute(check_query, params).scalar()
        
        if result == 0:
            raise HTTPException(
                status_code=404, 
                detail="수강신청 내역을 찾을 수 없습니다."
            )
        
        # 수강신청 취소 처리
        delete_query = text("""
            DELETE FROM mem_sel_class 
            WHERE m_id = :student_id AND c_id = :course_id
        """)
        
        db.execute(delete_query, params)
        db.commit()
        
        return {"message": "수강신청이 취소되었습니다."}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        print(f"Error in cancel_course: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="수강취소 처리 중 오류가 발생했습니다."
        )