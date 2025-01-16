const { ipcRenderer } = require('electron');

document.getElementById('make-class').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('open-makeclass-window');
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


document.addEventListener('DOMContentLoaded', () => {
    // localStorage에서 학생 정보 가져오기
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

document.addEventListener('DOMContentLoaded', function() {
    const loggedInUserId = localStorage.getItem('loggedInUserId');
    const loggedInUserName = localStorage.getItem('loggedInUserName');

    fetch(`http://192.168.0.117:9000/courses?m_id=${loggedInUserId}`)
      .then(response => response.json())
      .then(data => {
        const courseItems = document.querySelectorAll('.course-item'); // 모든 강의 항목 선택

        // 강의 길이와 courseItems의 길이를 비교하여 적절히 업데이트
        data.courses.forEach((course, index) => {
            if (index < courseItems.length) {
                const courseNameElement = courseItems[index].querySelector('.course-name');
                courseNameElement.textContent = course.c_name; // 강의 이름 업데이트
                // 교수명과 수업 상태도 필요하다면 추가
                const professorElement = courseItems[index].querySelector('.g-name');
                professorElement.textContent = `(${loggedInUserName})`; // 교수명 업데이트
            }
        });
      })
      .catch(error => {
        console.error('Error loading courses:', error);
      });
});
