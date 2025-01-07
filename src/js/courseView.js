document.addEventListener('DOMContentLoaded', () => {
    // 세션에서 강의명 가져오기
    const courseName = localStorage.getItem('selectedCourseName');
    const courseTitleElement = document.getElementById('course-title');
    courseTitleElement.textContent = `강의명: ${courseName}`;

    // 서버에서 강의 날짜 정보 가져오기
    fetch(`http://192.168.0.117:9000/course-dates?c_name=${courseName}`)
        .then(response => response.json())
        .then(data => {
            const { startDate, endDate } = data; // 시작일과 종료일
            const activityList = document.getElementById('activity-list');

            // 주 단위로 날짜 분할
            const start = new Date(startDate);
            const end = new Date(endDate);
            let week = 1;

            while (start <= end) {
                const weekStart = new Date(start);
                const weekEnd = new Date(start);
                weekEnd.setDate(weekStart.getDate() + 6); // 7일 단위

                // 리스트 아이템 생성
                const li = document.createElement('li');
                li.textContent = `${week}주차 [${formatDate(weekStart)} - ${formatDate(weekEnd)}]`;

                // 강의명 및 입장 버튼 추가
                const button = document.createElement('button');
                button.textContent = '강의 입장';
                li.appendChild(button);
                
                // 강의 입장 버튼 클릭 이벤트 추가
                button.addEventListener('click', () => {
                    const loggedInUserId = localStorage.getItem('loggedInUserId');
                    const isStudent = localStorage.getItem('loggedInIsStudent') === 'true'; // 로그인한 사용자의 is_student 값 확인

                    if (isStudent) {
                        openFaceAnalysisModal(courseName, loggedInUserId); // 학생 모달 열기
                    } else {
                        openTeacherModal(courseName); // 교수 모달 열기
                    }
                });

                activityList.appendChild(li);

                week++;
                start.setDate(start.getDate() + 7); // 다음 주 시작
            }
        })
        .catch(error => console.error('날짜 가져오기 실패:', error));
});

// 학생 얼굴 분석 모달 열기 함수
function openFaceAnalysisModal(courseName, userId) {
    const modal = document.getElementById('face-analysis-modal');
    const modalCourseTitle = document.getElementById('modal-course-title');
    
    modalCourseTitle.textContent = `강의명: ${courseName} (유저 ID: ${userId})`;
    modal.style.display = 'block'; // 모달 보이기

    // 얼굴 분석을 위한 추가 코드 (예: 얼굴 인식 처리 등)
}

// 교수 모달 열기 함수
function openTeacherModal(courseName) {
    const teacherModal = document.getElementById('teacher-modal');
    const studentListElement = document.getElementById('student-list');                                                                                                                                                                                        

    // 교수 모달에 수강생 및 접속자 정보를 추가
    teacherModal.style.display = 'block'; // 모달 보이기

    // 예시로 수강생 리스트 추가 (서버에서 데이터 가져오는 코드 추가 필요)
    const students = [
        { name: "홍길동", id: "student1" },
        { name: "김철수", id: "student2" }
    ];

    studentListElement.innerHTML = ''; // 기존 리스트 초기화
    students.forEach(student => {
        const li = document.createElement('li');
        li.textContent = `${student.name} / ${student.id}`;
        // 추가 기능: 더블 클릭 시 해당 학생의 세부 점수 표시
        li.addEventListener('dblclick', () => {
            alert(`${student.name}의 세부 점수 표시`);
        });
        studentListElement.appendChild(li);
    });
}

// 모달 닫기 버튼 이벤트 추가
document.getElementById('close-modal').addEventListener('click', () => {
    const modal = document.getElementById('face-analysis-modal');
    modal.style.display = 'none'; // 모달 숨기기
});

document.getElementById('close-teacher-modal').addEventListener('click', () => {
    const teacherModal = document.getElementById('teacher-modal');
    teacherModal.style.display = 'none'; // 교수 모달 숨기기
});

// 날짜 포맷 함수
function formatDate(date) {
    return `${date.getMonth() + 1}월${date.getDate()}일`;
}
