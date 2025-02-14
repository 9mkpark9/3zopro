from sqlalchemy import Column, Integer, String, ForeignKey, Time
from .base import Base

class StudentAttendance(Base):
    __tablename__ = "stu_attendance"

    s_id = Column(Integer, primary_key=True, index=True)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)
    c_id = Column(Integer, ForeignKey("class.c_id"), nullable=False)
    cd_id = Column(Integer, ForeignKey("class_dates.cd_id"), nullable=False)
    in_time = Column(Time)
    out_time = Column(Time)
    t_total = Column(Time)

class StudentConcentration(Base):
    __tablename__ = "st_concentration"

    sc_id = Column(Integer, primary_key=True, index=True)
    m_id = Column(String(30), ForeignKey("members.m_id"), nullable=False)
    c_id = Column(Integer, ForeignKey("class.c_id"), nullable=False)
    cd_id = Column(Integer, ForeignKey("class_dates.cd_id"), nullable=False)
    blk_score = Column(Integer)
    ht_score = Column(Integer)
    slp_score = Column(Integer)
    not_matched = Column(Integer)
    total = Column(Integer) 