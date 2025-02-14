from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from config.database import get_db
from models.attendance import StudentAttendance, StudentConcentration
from datetime import datetime

router = APIRouter(prefix="/attendance", tags=["attendance"])

@router.post("/save_attendance")
async def save_attendance(
    m_id: str = Form(...),
    c_id: int = Form(...),
    in_time: str = Form(...),
    out_time: str = Form(...),
    t_total: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        def convert_time_format(time_str):
            try:
                time_parts = time_str.split()
                if len(time_parts) != 2:
                    return time_str
                
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
                minutes = int(time_str.replace('분', ''))
                hours = minutes // 60
                remaining_minutes = minutes % 60
                return f"{hours:02d}:{remaining_minutes:02d}"
            except Exception as e:
                print(f"총 시간 변환 중 오류: {str(e)}")
                return time_str

        formatted_in_time = convert_time_format(in_time)
        formatted_out_time = convert_time_format(out_time)
        formatted_total_time = convert_total_time(t_total)
        
        cd_query = text("""
            SELECT cd_id 
            FROM class_dates 
            WHERE c_id = :c_id 
            AND DATE(lecture_date) = CURRENT_DATE()
        """)
        
        cd_result = db.execute(cd_query, {"c_id": c_id}).fetchone()
        
        if not cd_result:
            raise HTTPException(status_code=404, detail="오늘 날짜의 수업을 찾을 수 없습니다.")
        
        cd_id = cd_result.cd_id
        
        upsert_query = text("""
            INSERT INTO stu_attendance (m_id, c_id, cd_id, in_time, out_time, t_total)
            VALUES (
                :m_id, 
                :c_id, 
                :cd_id, 
                TIME_FORMAT(:in_time, '%H:%i'),
                TIME_FORMAT(:out_time, '%H:%i'),
                TIME_FORMAT(:t_total, '%H:%i')
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
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save_concentration")
async def save_concentration(
    m_id: str,
    c_id: int,
    blk_score: int,
    ht_score: int,
    slp_score: int,
    not_matched: int,
    total: int,
    db: Session = Depends(get_db)
):
    try:
        cd_query = text("""
            SELECT cd_id 
            FROM class_dates 
            WHERE c_id = :c_id 
            AND DATE(lecture_date) = CURRENT_DATE()
        """)
        
        cd_result = db.execute(cd_query, {"c_id": c_id}).fetchone()
        
        if not cd_result:
            raise HTTPException(status_code=404, detail="오늘 날짜의 수업을 찾을 수 없습니다.")
        
        cd_id = cd_result.cd_id
        
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
            "m_id": m_id,
            "c_id": c_id,
            "cd_id": cd_id,
            "blk_score": blk_score,
            "ht_score": ht_score,
            "slp_score": slp_score,
            "not_matched": not_matched,
            "total": total
        })
        
        db.commit()
        return {"message": "집중도 정보가 저장되었습니다."}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) 