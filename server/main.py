from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.database import engine, Base
from routes import (
    auth, 
    class_routes, 
    member_routes, 
    attendance, 
    face_routes,
    grade_routes,
    department_routes,
    professor_routes,
    status,
    reid_routes,
    student_routes,
    auth_routes
)
from routes.grade_routes import router as grade_router

# 데이터베이스 테이블 생성
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(status.router)
app.include_router(auth.router)
app.include_router(class_routes.router)
app.include_router(member_routes.router)
app.include_router(attendance.router)
app.include_router(face_routes.router)
app.include_router(grade_router)
app.include_router(department_routes.router)
app.include_router(professor_routes.router)
app.include_router(reid_routes.router)
app.include_router(student_routes.router)
app.include_router(auth_routes.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="10.101.160.18", port=9001) 