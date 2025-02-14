from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from config.database import get_db
from datetime import datetime

router = APIRouter(prefix="/api/professor", tags=["professor"])

@router.get("/courses/{professor_id}")
async def get_professor_classes(professor_id: str, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                c.c_id,
                c.c_name,
                c.class_day,
                c.st_time,
                c.end_time,
                d.d_name as department,
                c.fixed_num as max_students,
                (
                    SELECT COUNT(DISTINCT m_id) 
                    FROM mem_sel_class 
                    WHERE c_id = c.c_id
                ) as enrolled_count,
                (
                    SELECT COUNT(DISTINCT sa.m_id)
                    FROM class_dates cd2
                    LEFT JOIN stu_attendance sa ON cd2.cd_id = sa.cd_id
                    WHERE cd2.c_id = c.c_id
                    AND DATE(cd2.lecture_date) = CURRENT_DATE()
                    AND sa.in_time IS NOT NULL
                ) as attended_count
            FROM class c
            JOIN department d ON c.d_id = d.d_id
            JOIN class_dates cd ON c.c_id = cd.c_id
            WHERE c.m_id = :professor_id
            AND DATE(cd.lecture_date) = CURRENT_DATE()
            AND c.class_day = :current_day
            GROUP BY 
                c.c_id, c.c_name, c.class_day,
                c.st_time, c.end_time, d.d_name, c.fixed_num
            ORDER BY c.st_time
        """)
        
        # 현재 요일 가져오기 (0: 월요일, 6: 일요일)
        current_day = ['월', '화', '수', '목', '금', '토', '일'][datetime.now().weekday()]
        
        result = db.execute(query, {
            "professor_id": professor_id,
            "current_day": current_day
        })
        classes = result.fetchall()
        
        return {
            "classes": [{
                "c_id": cls.c_id,
                "c_name": cls.c_name,
                "class_day": cls.class_day,
                "st_time": str(cls.st_time),
                "end_time": str(cls.end_time),
                "department": cls.department,
                "max_students": cls.max_students,
                "enrolled_count": cls.enrolled_count,
                "attended_count": cls.attended_count or 0,
                "attendance_rate": round((cls.attended_count or 0) / cls.enrolled_count * 100, 1) if cls.enrolled_count > 0 else 0
            } for cls in classes]
        }
        
    except Exception as e:
        print(f"Error in get_professor_classes: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"교수의 수업 목록을 가져오는 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/courses/{class_id}/students")
async def get_class_students(class_id: int, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                m.m_id,
                m.m_name,
                d.d_name as department,
                sa.in_time,
                sa.out_time,
                sa.t_total,
                sc.total as concentration_score,
                CASE 
                    WHEN sa.in_time IS NULL THEN '결석'
                    WHEN sa.in_time > c.st_time THEN '지각'
                    ELSE '출석'
                END as attendance_status
            FROM mem_sel_class msc
            JOIN members m ON msc.m_id = m.m_id
            JOIN department d ON m.d_id = d.d_id
            JOIN class c ON msc.c_id = c.c_id
            LEFT JOIN class_dates cd ON c.c_id = cd.c_id 
                AND DATE(cd.lecture_date) = CURRENT_DATE()
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id 
                AND sa.m_id = m.m_id
            LEFT JOIN st_concentration sc ON cd.cd_id = sc.cd_id 
                AND sc.m_id = m.m_id
            WHERE msc.c_id = :class_id
            ORDER BY m.m_name
        """)
        
        result = db.execute(query, {"class_id": class_id})
        students = result.fetchall()
        
        return {
            "students": [{
                "student_id": student.m_id,
                "name": student.m_name,
                "department": student.department,
                "attendance": {
                    "status": student.attendance_status,
                    "in_time": str(student.in_time) if student.in_time else None,
                    "out_time": str(student.out_time) if student.out_time else None,
                    "duration": student.t_total if student.t_total else None
                },
                "concentration": student.concentration_score
            } for student in students]
        }
        
    except Exception as e:
        print(f"Error in get_class_students: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"수업의 학생 목록을 가져오는 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/courses/{class_id}/status")
async def get_lecture_status(class_id: int, db: Session = Depends(get_db)):
    try:
        # 현재 날짜의 강의 정보 조회
        query = text("""
            SELECT 
                cd.cd_id,
                COUNT(DISTINCT msc.m_id) as total_students,
                COUNT(DISTINCT sa.m_id) as attended_students,
                AVG(sc.total) as avg_concentration
            FROM class_dates cd
            JOIN class c ON cd.c_id = c.c_id
            LEFT JOIN mem_sel_class msc ON c.c_id = msc.c_id
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id
            LEFT JOIN st_concentration sc ON cd.cd_id = sc.cd_id
            WHERE c.c_id = :class_id
            AND DATE(cd.lecture_date) = CURRENT_DATE()
            GROUP BY cd.cd_id
        """)
        
        result = db.execute(query, {"class_id": class_id}).fetchone()
        
        if not result:
            return {
                "is_active": False,
                "start_time": None,
                "student_count": 0,
                "attended_count": 0,
                "average_concentration": 0
            }
            
        return {
            "is_active": result.attended_students > 0,
            "start_time": None,  # 시작 시간은 필요한 경우 추가
            "student_count": result.total_students,
            "attended_count": result.attended_students,
            "average_concentration": round(result.avg_concentration, 1) if result.avg_concentration else 0
        }
        
    except Exception as e:
        print(f"Error in get_lecture_status: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"강의 상태 조회 중 오류가 발생했습니다: {str(e)}"
        ) 