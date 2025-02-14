from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from config.database import get_db
from models.class_model import Class
from models.member import Member
import random
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse
import json
from models.department import Department  # Department 모델 import 추가

router = APIRouter(
    tags=["grades"]
)

@router.get("/course/{course_id}")
async def get_course_grades(course_id: int, db: Session = Depends(get_db)):
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
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weekly/{course_id}/{student_id}")
async def get_weekly_grades(student_id: str, course_id: int, db: Session = Depends(get_db)):
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
                'averageScore': round(avg_score, 1) if total_scores else None
            })
            
        return result
        
    except Exception as e:
        print('Error:', str(e))
        raise HTTPException(status_code=500, detail=f"성적 데이터를 불러오는데 실패했습니다. 오류: {str(e)}")

@router.get("/all/{student_id}")
async def get_all_grades(student_id: str, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT c.c_name, g.*
            FROM grades g
            JOIN class c ON g.c_id = c.c_id
            WHERE g.m_id = :student_id
        """)
        result = db.execute(query, {"student_id": student_id})
        grades = result.fetchall()
        return {"grades": [dict(row) for row in grades]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/weekly-grades/course/{course_id}")
async def get_weekly_grades_course(course_id: int, db: Session = Depends(get_db)):
    try:
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
        print(f"Error in get_weekly_grades_course: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/grades/courses/{student_id}")
async def get_student_grade_courses(student_id: str, db: Session = Depends(get_db)):
    try:
        # 학생이 수강 중인 과목 정보 조회
        query = text("""
            SELECT DISTINCT
                c.c_id,
                c.c_name,
                m.m_name as professor_name,
                d.d_name as department_name,
                CONCAT(c.class_day, ' ', c.st_time, '-', c.end_time) as class_time
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
            "success": True,
            "courses": [
                {
                    "c_id": course.c_id,
                    "c_name": course.c_name,
                    "professor_name": course.professor_name,
                    "department": course.department_name,
                    "class_time": course.class_time
                }
                for course in courses
            ]
        }
    except Exception as e:
        print(f"Error in get_student_grade_courses: {str(e)}")  # 디버깅용 로그
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/grades/student/{student_id}")
async def get_student_grades(student_id: str, db: Session = Depends(get_db)):
    try:
        # 학생의 모든 과목 성적 조회
        query = text("""
            SELECT 
                c.c_id,
                c.c_name,
                m.m_name as professor_name,
                d.d_name as department_name,
                CONCAT(c.class_day, ' ', c.st_time, '-', c.end_time) as class_time,
                COALESCE(AVG(sc.total), 0) as avg_score,
                COUNT(DISTINCT cd.cd_id) as total_classes,
                COUNT(DISTINCT CASE WHEN sa.in_time IS NOT NULL THEN cd.cd_id END) as attended_classes
            FROM mem_sel_class msc
            JOIN class c ON msc.c_id = c.c_id
            JOIN members m ON c.m_id = m.m_id
            JOIN department d ON c.d_id = d.d_id
            LEFT JOIN class_dates cd ON c.c_id = cd.c_id
            LEFT JOIN st_concentration sc ON cd.cd_id = sc.cd_id AND sc.m_id = :student_id
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id AND sa.m_id = :student_id
            WHERE msc.m_id = :student_id
            GROUP BY c.c_id, c.c_name, m.m_name, d.d_name, c.class_day, c.st_time, c.end_time
        """)
        
        result = db.execute(query, {"student_id": student_id})
        grades = result.fetchall()
        
        return {
            "success": True,
            "grades": [
                {
                    "c_id": grade.c_id,
                    "c_name": grade.c_name,
                    "professor_name": grade.professor_name,
                    "department": grade.department_name,
                    "class_time": grade.class_time,
                    "grade": calculate_grade(grade.avg_score),
                    "score": round(float(grade.avg_score), 1),
                    "attendance_rate": round(grade.attended_classes / grade.total_classes * 100 if grade.total_classes > 0 else 0, 1)
                }
                for grade in grades
            ]
        }
    except Exception as e:
        print(f"Error in get_student_grades: {str(e)}")  # 디버깅용 로그
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/grades/course/{course_id}")
async def get_course_grades(course_id: int, db: Session = Depends(get_db)):
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
    except Exception as e:
        print(f"Error in get_course_grades: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/grades/all/{student_id}")
async def get_all_student_grades(student_id: str, db: Session = Depends(get_db)):
    try:
        # 학생의 전체 성적 정보 조회
        query = text("""
            SELECT 
                c.c_id,
                c.c_name,
                m.m_name as professor_name,
                d.d_name as department_name,
                CONCAT(c.class_day, ' ', c.st_time, '-', c.end_time) as class_time,
                COALESCE(AVG(sc.total), 0) as avg_score,
                COUNT(DISTINCT cd.cd_id) as total_classes,
                COUNT(DISTINCT CASE WHEN sa.in_time IS NOT NULL THEN cd.cd_id END) as attended_classes
            FROM mem_sel_class msc
            JOIN class c ON msc.c_id = c.c_id
            JOIN members m ON c.m_id = m.m_id
            JOIN department d ON c.d_id = d.d_id
            LEFT JOIN class_dates cd ON c.c_id = cd.c_id
            LEFT JOIN st_concentration sc ON cd.cd_id = sc.cd_id AND sc.m_id = :student_id
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id AND sa.m_id = :student_id
            WHERE msc.m_id = :student_id
            GROUP BY c.c_id, c.c_name, m.m_name, d.d_name, c.class_day, c.st_time, c.end_time
        """)
        
        result = db.execute(query, {"student_id": student_id})
        grades = result.fetchall()
        
        total_gpa = 0
        total_credits = 0
        
        grade_list = []
        for grade in grades:
            score = float(grade.avg_score)
            letter_grade = calculate_grade(score)
            grade_points = get_grade_points(letter_grade)
            
            total_gpa += grade_points
            total_credits += 1
            
            grade_list.append({
                "c_id": grade.c_id,
                "c_name": grade.c_name,
                "professor_name": grade.professor_name,
                "department": grade.department_name,
                "class_time": grade.class_time,
                "grade": letter_grade,
                "score": round(score, 1),
                "attendance_rate": round(grade.attended_classes / grade.total_classes * 100 if grade.total_classes > 0 else 0, 1)
            })
        
        gpa = round(total_gpa / len(grades) if grades else 0, 2)
        
        return {
            "success": True,
            "gpa": gpa,
            "total_credits": total_credits,
            "grades": grade_list
        }
    except Exception as e:
        print(f"Error in get_all_student_grades: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def calculate_grade(score):
    if score is None:
        return 'F'
    score = float(score)
    if score >= 95: return 'A+'
    elif score >= 90: return 'A0'
    elif score >= 85: return 'B+'
    elif score >= 80: return 'B0'
    elif score >= 75: return 'C+'
    elif score >= 70: return 'C0'
    elif score >= 65: return 'D+'
    elif score >= 60: return 'D0'
    else: return 'F'

def get_grade_points(grade):
    grade_points = {
        'A+': 4.5, 'A0': 4.0,
        'B+': 3.5, 'B0': 3.0,
        'C+': 2.5, 'C0': 2.0,
        'D+': 1.5, 'D0': 1.0,
        'F': 0.0
    }
    return grade_points.get(grade, 0.0)

@router.get("/api/weekly-grades/detail/{course_id}/{student_id}")
async def get_weekly_grades_detail(course_id: int, student_id: str, db: Session = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                cd.lecture_week as week,
                cd.lecture_date as date,
                COALESCE(sc.total, 0) as concentration,
                CASE 
                    WHEN cd.lecture_date > CURRENT_DATE() THEN 'pending'
                    WHEN sa.in_time IS NULL THEN 'absent'
                    WHEN TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                         TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 THEN 'present'
                    WHEN sa.in_time > c.st_time THEN 'late'
                    ELSE 'absent'
                END as attendance_status
            FROM class_dates cd
            LEFT JOIN stu_attendance sa ON cd.cd_id = sa.cd_id 
                AND sa.m_id = :student_id
            JOIN class c ON cd.c_id = c.c_id
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
        print(f"Error in get_weekly_grades_detail: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/student/attendance/summary/{student_id}/{course_id}")
async def get_student_attendance_summary(student_id: str, course_id: int, db: Session = Depends(get_db)):
    try:
        # 출석 요약 정보 조회
        summary_query = text("""
            SELECT 
                COUNT(*) as total_classes,
                COUNT(CASE WHEN lecture_date <= CURRENT_DATE() THEN 1 END) as past_classes,
                COUNT(CASE 
                    WHEN attendance_status = '출석' THEN 1 
                END) as present_count,
                COUNT(CASE 
                    WHEN attendance_status = '지각' THEN 1 
                END) as late_count,
                COUNT(CASE 
                    WHEN attendance_status = '결석' AND lecture_date <= CURRENT_DATE() THEN 1 
                END) as absent_count,
                ROUND(AVG(CASE WHEN t_total IS NOT NULL THEN TIME_TO_SEC(t_total) ELSE 0 END / 60), 1) as avg_attendance_minutes
            FROM (
                SELECT 
                    cd.lecture_date,
                    CASE 
                        WHEN cd.lecture_date > CURRENT_DATE() THEN '미출결'
                        WHEN sa.in_time IS NULL THEN '결석'
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.in_time, c.st_time)) <= 1800 AND
                             TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                             TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 
                        THEN '출석'
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.in_time, c.st_time)) > 1800 AND
                             TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                             TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 
                        THEN '지각'
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
                TIME_FORMAT(sa.in_time, '%H:%i') as in_time,
                TIME_FORMAT(sa.out_time, '%H:%i') as out_time,
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
                "in_time": result.in_time,
                "out_time": result.out_time,
                "total_time": result.total_time,
                "status": result.status
            } for result in detail_results]
        }
        
    except Exception as e:
        print(f"Error in get_student_attendance_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/student/grades/courses/{student_id}")
async def get_student_grade_courses(student_id: str, db: Session = Depends(get_db)):
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

@router.get("/api/student/grades/weekly/{student_id}/{course_id}")
async def get_weekly_grades(student_id: str, course_id: int, db: Session = Depends(get_db)):
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
                'averageScore': round(avg_score, 1) if total_scores else None
            })
            
        return result
        
    except Exception as e:
        print('Error:', str(e))
        raise HTTPException(status_code=500, detail=f"성적 데이터를 불러오는데 실패했습니다. 오류: {str(e)}")

@router.get("/attendance/student/{student_id}/{course_id}")
async def get_student_attendance(student_id: str, course_id: int, db: Session = Depends(get_db)):
    try:
        # 요약 정보 쿼리
        summary_query = text("""
            SELECT 
                COUNT(*) as total_classes,
                COUNT(CASE WHEN lecture_date <= CURRENT_DATE() THEN 1 END) as past_classes,
                COUNT(CASE 
                    WHEN attendance_status = '출석' THEN 1 
                END) as present_count,
                COUNT(CASE 
                    WHEN attendance_status = '지각' THEN 1 
                END) as late_count,
                COUNT(CASE 
                    WHEN attendance_status = '결석' AND lecture_date <= CURRENT_DATE() THEN 1 
                END) as absent_count,
                ROUND(AVG(CASE WHEN t_total IS NOT NULL THEN TIME_TO_SEC(t_total) ELSE 0 END / 60), 1) as avg_attendance_minutes
            FROM (
                SELECT 
                    cd.lecture_date,
                    CASE 
                        WHEN cd.lecture_date > CURRENT_DATE() THEN '미출결'
                        WHEN sa.in_time IS NULL THEN '결석'
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.in_time, c.st_time)) <= 1800 AND
                             TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                             TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 
                        THEN '출석'
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.in_time, c.st_time)) > 1800 AND
                             TIME_TO_SEC(TIMEDIFF(sa.out_time, sa.in_time)) >= 
                             TIME_TO_SEC(TIMEDIFF(c.end_time, c.st_time)) * 0.7 
                        THEN '지각'
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
        
        # 상세 정보 쿼리
        detail_query = text("""
            SELECT 
                cd.lecture_week,
                cd.lecture_date,
                TIME_FORMAT(sa.in_time, '%H:%i') as in_time,
                TIME_FORMAT(sa.out_time, '%H:%i') as out_time,
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
        
        # 쿼리 실행
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
                "in_time": result.in_time,
                "out_time": result.out_time,
                "total_time": result.total_time,
                "status": result.status
            } for result in detail_results]
        }
        
    except Exception as e:
        print(f"Error in get_student_attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/student/grades/course_scores/{student_id}/{course_id}")
async def get_course_scores(student_id: str, course_id: int, db: Session = Depends(get_db)):
    try:
        query = text("""
            WITH AttendanceScores AS (
                SELECT 
                    sa.m_id,
                    sa.c_id,
                    CASE 
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.in_time, c.st_time)) <= 1800 THEN 100  -- 30분 이내 출석
                        WHEN TIME_TO_SEC(TIMEDIFF(sa.in_time, c.st_time)) <= 3600 THEN 70   -- 1시간 이내 지각
                        ELSE 0  -- 결석
                    END as daily_score
                FROM stu_attendance sa
                JOIN class c ON sa.c_id = c.c_id
                WHERE sa.m_id = :student_id AND sa.c_id = :course_id
            )
            SELECT 
                COALESCE(AVG(sc.total), 0) as attitude_score,
                COALESCE(AVG(a.daily_score), 0) as attendance_score
            FROM mem_sel_class msc
            LEFT JOIN st_concentration sc ON msc.m_id = sc.m_id 
                AND msc.c_id = sc.c_id
            LEFT JOIN AttendanceScores a ON msc.m_id = a.m_id 
                AND msc.c_id = a.c_id
            WHERE msc.m_id = :student_id 
            AND msc.c_id = :course_id
        """)
        
        result = db.execute(query, {
            "student_id": student_id,
            "course_id": course_id
        }).fetchone()
        
        return {
            "attitude_score": float(result.attitude_score),
            "attendance_score": float(result.attendance_score)
        }
        
    except Exception as e:
        print(f"Error in get_course_scores: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

