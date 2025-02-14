from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from config.database import get_db
from models.member import Member
from models.department import Department
from pydantic import BaseModel
from typing import Optional
import json

router = APIRouter(prefix="/members", tags=["members"])

class User(BaseModel):
    m_id: str
    m_pw: str
    m_name: str
    d_id: int
    is_student: Optional[bool] = False
    m_face: Optional[str] = None

@router.post("/register")
async def register_user(user: User, db: Session = Depends(get_db)):
    # 중복 ID 확인
    existing_user = db.query(Member).filter(Member.m_id == user.m_id).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="이미 존재하는 사용자 ID입니다.")
    
    # 유효한 부서 ID 확인
    department = db.query(Department).filter(Department.d_id == user.d_id).first()
    if not department:
        raise HTTPException(status_code=400, detail="존재하지 않는 부서 ID입니다.")
    
    # 얼굴 임베딩 처리
    embedding_str = user.m_face
    if embedding_str:
        embedding_str = embedding_str.strip('"\'')
        try:
            embedding = embedding_str
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="임베딩 데이터가 유효한 JSON 형식이 아닙니다.")
    
    # 새로운 사용자 추가
    db_user = Member(
        m_id=user.m_id,
        m_pw=user.m_pw,
        m_name=user.m_name,
        d_id=user.d_id,
        is_student=user.is_student,
        m_face=json.dumps(embedding).encode('utf-8') if embedding_str else None
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return {"status": "success", "message": "회원가입 성공"}

@router.get("/{m_id}")
async def get_member(m_id: str, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.m_id == m_id).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="교수를 찾을 수 없습니다.")
    
    return {
        "m_id": member.m_id,
        "m_name": member.m_name,
        "d_id": member.d_id,
        "is_student": member.is_student
    }

@router.get("")
async def get_users(db: Session = Depends(get_db)):
    users = db.query(Member).all()
    return {"users": users} 