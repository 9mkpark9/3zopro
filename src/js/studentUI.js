const { ipcRenderer } = require('electron');

document.getElementById('select_class').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('open-selectclass-window');
  });

document.addEventListener('DOMContentLoaded', () => {
    // localStorage에서 학생 이름 가져오기
    const studentName = localStorage.getItem('loggedInUserName');

    if (studentName) {
        // 이름을 학생 UI에 표시
        const studentNameElement = document.getElementById('student-name');
        studentNameElement.textContent = studentName;
    } else {
        alert('로그인 정보가 없습니다. 다시 로그인하세요.');
        window.location.href = 'login.html'; // 로그인 페이지로 리디렉션
    }
});

document.querySelectorAll('.course-go').forEach(button => {
    button.addEventListener('click', (e) => {
        e.preventDefault();

        // 클릭된 버튼의 부모 요소에서 '강의명' 추출
        const courseItem = button.closest('.course-item');
        const courseName = courseItem.querySelector('.course-name').textContent.trim();
        // 세션에 강의명 저장
        localStorage.setItem('selectedCourseName', courseName);

        // 'course-view.html'로 이동
        ipcRenderer.send('open-courseview-window'); // 창 이동 요청
    });
});

document.getElementById('Logout').addEventListener('click', (e) => {
    window.close();  // 닫기 버튼 클릭 시 페이지 닫기
    e.preventDefault();
  });

document.addEventListener('DOMContentLoaded', () => {
    // localStorage에서 학생,교직원 정보 가져오기
    const istudent = localStorage.getItem('loggedInIsStudent');

    if (istudent) {
        // UI에 표시
        const istudentElement = document.getElementById('is_student');
        istudentElement.textContent = istudent === 'true' ? '(학생)' : '(관리자)';
    } else {
        alert('로그인 정보가 없습니다. 다시 로그인하세요.');
        window.location.href = 'login.html'; // 로그인 페이지로 리디렉션
    }
});

// UI에 자신이 저장한 강의 입장 가능 기능
document.addEventListener('DOMContentLoaded', function() {
    const loggedInUserId = localStorage.getItem('loggedInUserId');

    // 사용자의 수강 과목을 가져오기 위한 API 요청
    fetch(fetch(`http://192.168.0.117:9000/mem_sel_class?m_id=${loggedInUserId}`) // mem_sel_class에서 수강 과목 가져오기)
      .then(response => {
          if (!response.ok) {
              throw new Error('네트워크 응답이 좋지 않습니다.');
          }
          return response.json();
      })
      .then(selectedClasses => {
          const courseItems = document.querySelectorAll('.course-item'); // 모든 강의 항목 선택

          // 각 수강 과목에 대해 c_id로 class 테이블에서 강의 정보 조회
          selectedClasses.c_ids.forEach((c_id, index) => {
              if (index < courseItems.length) {
                  // 해당 c_id로 class 테이블에서 강의 정보 가져오기
                  fetch(`http://192.168.0.117:9000/courses_cid?c_id=${c_id}`)
                  .then(response => {
                      if (!response.ok) {
                          throw new Error('강의 정보를 가져오는 데 실패했습니다.');
                      }
                      return response.json();
                  })
                  .then(data => {
                      // 서버에서 반환된 데이터가 배열 형태임
                      const course = data.courses[0]; // 배열의 첫 번째 강의를 가져옴
                      if (!course) {
                          throw new Error('해당 c_id에 대한 강의 정보가 없습니다.');
                      }
              
                      const courseNameElement = courseItems[index].querySelector('.course-name');
                      const professorElement = courseItems[index].querySelector('.g-name');
              
                      // 강의 정보 업데이트
                      courseNameElement.textContent = course.c_name; // 강의 이름 업데이트
              
                      // 교수 정보를 가져오기 위한 API 요청
                      fetch(`http://192.168.0.117:9000/members?m_id=${course.m_id}`)
                          .then(response => {
                              if (!response.ok) {
                                  throw new Error('교수 정보를 가져오는 데 실패했습니다.');
                              }
                              return response.json();
                          })
                          .then(professorData => {
                              professorElement.textContent = professorData.m_name; // 교수명 업데이트
                          })
                          .catch(error => {
                              console.error('Error loading professor data:', error);
                          });
                  })
                  .catch(error => {
                      console.error('Error loading course data:', error);
                  });
              }
          });
      })
      .catch(error => {
          console.error('Error loading selected classes:', error);
      }))
});