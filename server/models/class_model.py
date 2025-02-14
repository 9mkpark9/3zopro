from sqlalchemy import Column, Integer, String, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship
from config.database import Base

class Class(Base):
    __tablename__ = "class"

    c_id = Column(Integer, primary_key=True)
    c_name = Column(String(30), nullable=False)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)
    d_id = Column(Integer, ForeignKey("department.d_id"), nullable=False)
    st_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    class_day = Column(String(10), nullable=False)
    lecture_date = Column(JSON, nullable=False)
    st_time = Column(String(10), nullable=False)
    end_time = Column(String(10), nullable=False)
    fixed_num = Column(Integer, nullable=False)

    # 관계 설정
    professor = relationship("Member", backref="classes")
    department = relationship("Department", backref="classes")

class SelectedClass(Base):
    __tablename__ = "mem_sel_class"

    s_id = Column(Integer, primary_key=True, index=True)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)
    c_id = Column(Integer, ForeignKey("class.c_id"), nullable=False) 