from sqlalchemy import Column, String, Integer, Boolean, LargeBinary, ForeignKey
from sqlalchemy.orm import relationship
from config.database import Base

class Member(Base):
    __tablename__ = "members"

    m_id = Column(String(30), primary_key=True)
    m_pw = Column(String(30), nullable=False)
    m_name = Column(String(30), nullable=False)
    d_id = Column(Integer, ForeignKey("department.d_id"), nullable=False)
    is_student = Column(Boolean)
    m_face = Column(LargeBinary)  # BLOB 필드로 이미지 저장

    # 관계 설정 - 지연 로딩 사용
    department = relationship("Department", lazy="joined") 