from sqlalchemy import Column, Integer, String
from config.database import Base

class Department(Base):
    __tablename__ = "department"
    
    d_id = Column(Integer, primary_key=True, autoincrement=True)
    d_name = Column(String(30), nullable=False) 