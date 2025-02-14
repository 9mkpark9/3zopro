// 전역 변수로 이벤트 리스너 등록 상태 관리
window.eventListenersInitialized = window.eventListenersInitialized || {
    classEvents: false
};

document.addEventListener('DOMContentLoaded', async () => {
    const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));

    if (!currentUser) {
        alert('로그인 정보가 없습니다.');
        return;
    }

    // 함수들을 전역으로 노출
    window.loadClasses = loadClasses;
    window.loadRegisteredCourses = loadRegisteredCourses;

    // 초기 로드
    await loadClasses();
    await loadRegisteredCourses();

    // --------------------- [1] 초기 작업 ---------------------
    // 페이지 로드 시 수업 정보 및 신청한 과목 불러오기
    async function loadClasses() {
        try {
            const response = await fetch(`${SERVER_URL}/classes/all`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.detail || '수업 정보를 가져오는데 실패했습니다.');

            const registeredResponse = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
            const registeredData = await registeredResponse.json();
            const registeredCourseIds = registeredData.courses.map(course => course.c_id);

            const coursesTableBody = document.querySelector('.courses-table tbody');
            if (!coursesTableBody) return; // 테이블이 없으면 리턴
            
            // 테이블 초기화
            coursesTableBody.innerHTML = '';

            // 수업 목록 표시
            data.classes.forEach(cls => {
                if (registeredCourseIds.includes(cls.c_id)) return;

                const remainingSeats = parseInt(cls.current_count); // 신청 학생 수
                const isFull = remainingSeats >= parseInt(cls.fixed_num); // 수강 정원 수
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${cls.c_id}</td>
                    <td>${cls.c_name}</td>
                    <td>${cls.m_name}</td>
                    <td>${cls.class_day} ${cls.st_time} - ${cls.end_time}</td>
                    <td>${remainingSeats} / ${cls.fixed_num}</td>
                    <td>
                        <button class="btn btn-small ${isFull ? 'btn-disabled' : 'btn-register'}" 
                            data-course-id="${cls.c_id}" 
                            ${isFull ? 'disabled' : ''}>
                            ${isFull ? '만석' : '신청'}
                        </button>
                    </td>
                `;
                coursesTableBody.appendChild(row);
            });

            // 버튼 이벤트 리스너 다시 등록
            document.querySelectorAll('.btn-register:not(.btn-disabled)').forEach(button => {
                button.addEventListener('click', function() {
                    const courseId = this.dataset.courseId;
                    registerCourse(courseId);
                });
            });

            // 검색 기능 구현
            const searchInput = document.querySelector('#register-page .navbar-search input');
            if (searchInput) {
                searchInput.removeEventListener('input', handleSearch); // 기존 리스너 제거
                searchInput.addEventListener('input', handleSearch); // 새로운 리스너 등록
            }
        } catch (error) {
            console.error('수업 정보를 불러오는 중 오류:', error);
            alert('수업 정보를 불러오는 중 오류가 발생했습니다.');
        }
    }

    // 검색 기능 핸들러
    function handleSearch() {
        const searchTerm = this.value.toLowerCase().trim();
        const coursesTableBody = document.querySelector('.courses-table tbody');
        const rows = coursesTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const courseName = row.children[1].textContent.toLowerCase(); // 과목명
            const isMatch = courseName.includes(searchTerm);
            row.style.display = isMatch || searchTerm === '' ? '' : 'none';
        });
    }

    // 시간 중복 체크 함수 수정
    function checkTimeOverlap(newCourse, existingCourses) {
        console.log('New Course:', newCourse); // 디버깅용
        console.log('Existing Courses:', existingCourses); // 디버깅용
        
        // 요일과 시간을 비교하기 쉽게 숫자로 변환
        function timeToMinutes(time) {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        }

        for (const existing of existingCourses) {
            // 같은 요일인 경우에만 시간 체크
            if (existing.class_day === newCourse.class_day) {
                const newStart = timeToMinutes(newCourse.st_time);
                const newEnd = timeToMinutes(newCourse.end_time);
                const existingStart = timeToMinutes(existing.st_time);
                const existingEnd = timeToMinutes(existing.end_time);

                console.log('Comparing times:', { // 디버깅용
                    newStart,
                    newEnd,
                    existingStart,
                    existingEnd
                });

                // 시간이 겹치는지 확인
                if (!(newEnd <= existingStart || newStart >= existingEnd)) {
                    return {
                        overlap: true,
                        existingCourse: existing
                    };
                }
            }
        }
        return { overlap: false };
    }

    // [2-2] 수업 신청하기 
    async function registerCourse(courseId) {
        try {
            // 현재 신청한 과목들 확인
            const checkResponse = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
            const checkData = await checkResponse.json();

            // 이미 신청한 과목인지 확인
            if (checkData.courses.some(course => course.c_id === parseInt(courseId))) {
                alert('이미 신청된 과목입니다.');
                return;
            }

            // 신청하려는 과목 정보 가져오기
            const courseResponse = await fetch(`${SERVER_URL}/classes/all`);
            const courseData = await courseResponse.json();
            
            // 해당 과목 찾기
            const courseInfo = courseData.classes.find(course => course.c_id === parseInt(courseId));
            if (!courseInfo) {
                alert('과목 정보를 찾을 수 없습니다.');
                return;
            }

            // 시간 중복 체크
            const overlapCheck = checkTimeOverlap(courseInfo, checkData.courses);
            if (overlapCheck.overlap) {
                alert(`[${overlapCheck.existingCourse.c_name}] 과목과\n요일: ${overlapCheck.existingCourse.class_day}\n시간: ${overlapCheck.existingCourse.st_time} - ${overlapCheck.existingCourse.end_time}\n에 겹치는 시간이 있습니다.`);
                return;
            }

            // 수강신청 진행
            const response = await fetch(`${SERVER_URL}/register_course`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: parseInt(courseId), student_id: currentUser.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert(errorData.detail || '수강신청에 실패했습니다.');
                return;
            }

            const result = await response.json();
            alert(result.message);
            await loadClasses();
            await loadRegisteredCourses();
        } catch (error) {
            console.error('수강신청 중 오류:', error);
            alert('수강신청 중 오류가 발생했습니다.');
        }
    }

    // --------------------- [3] 수강 취소 ---------------------
    // [3-1] 신청한 수업 불러오기
    async function loadRegisteredCourses() {
      try {
          const response = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
          const data = await response.json();

          if (!response.ok) throw new Error(data.detail || '신청한 과목을 불러오는데 실패했습니다.');

          const registeredCoursesTableBody = document.querySelector('.registered-courses-table tbody');
          if (!registeredCoursesTableBody) return;

          registeredCoursesTableBody.innerHTML = '';

          data.courses.forEach(course => {
              const row = document.createElement('tr');
              row.innerHTML = `
                  <td>${course.c_id}</td>
                  <td>${course.c_name}</td>
                  <td>${course.professor_name}</td>
                  <td>${course.class_time}</td>
                  <td><button class="btn btn-small btn-cancel" data-course-id="${course.c_id}">취소</button></td>
              `;
              registeredCoursesTableBody.appendChild(row);
          });

          // 이전 이벤트 리스너 제거 및 새로운 이벤트 리스너 등록
          document.querySelectorAll('.btn-cancel').forEach(button => {
              // 이전 이벤트 리스너 제거
              button.replaceWith(button.cloneNode(true));
              
              // 새로운 이벤트 리스너 등록
              const newButton = registeredCoursesTableBody.querySelector(`[data-course-id="${button.dataset.courseId}"]`);
              if (newButton) {
                  newButton.addEventListener('click', function() {
                      const courseId = this.dataset.courseId;
                      cancelCourse(courseId);
                  });
              }
          });
      } catch (error) {
          console.error('신청한 과목을 불러오는 중 오류:', error);
          alert('신청한 과목을 불러오는 중 오류가 발생했습니다.');
      }
    }

    // [3-2] 수업 취소하기
    async function cancelCourse(courseId) {
        try {
            if (!confirm('수강신청을 취소하시겠습니까?')) {
                return;
            }

            const response = await fetch(`${SERVER_URL}/cancel_course/${currentUser.id}/${courseId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || '수강취소에 실패했습니다.');
            }

            // 성공 메시지 표시
            alert(data.message || '수강신청이 취소되었습니다.');
            
            // 취소 후 목록 새로고침
            await loadClasses();
            await loadRegisteredCourses();
        } catch (error) {
            console.error('수강 취소 중 오류:', error);
            alert(error.message);
        }
    }

    // 초기화 완료 표시
    window.eventListenersInitialized = window.eventListenersInitialized || {};
    window.eventListenersInitialized.classEvents = true;
});
  