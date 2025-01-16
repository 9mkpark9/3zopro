function secondsToTimeFormat(seconds) { //초를 시간으로 변환하는 함수
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return formattedTime;
}

document.addEventListener('DOMContentLoaded', function() {
    // 학과 목록을 서버에서 가져와서 select 요소에 추가하는 함수
    fetch('http://192.168.0.117:9000/departments')
      .then(response => response.json())
      .then(data => {
        const departmentSelect = document.getElementById('department');
        data.departments.forEach(department => {
          const option = document.createElement('option');
          option.value = department.d_id;
          option.textContent = department.d_name;
          departmentSelect.appendChild(option);
        });
      })
      .catch(error => {
        console.error('Error loading departments:', error);
      });

       // 로그인한 사용자 ID 가져오기
    const loggedInUserId = localStorage.getItem('loggedInUserId');

    // 강의 목록을 서버에서 가져와서 리스트에 추가하는 함수
    fetch(`http://192.168.0.117:9000/courses?m_id=${loggedInUserId}`)
      .then(response => response.json())
      .then(data => {
        const courseList = document.getElementById('course-list');
        data.courses.forEach(course => {
          const stTimeFormatted = secondsToTimeFormat(course.st_time);
          const endTimeFormatted = secondsToTimeFormat(course.end_time);

          // 요일과 날짜 정보를 추출
          const days = course.schedule_dates.days.join(', '); // 요일 배열을 문자열로 변환
          const selectedRange = course.schedule_dates.selected_range; // 날짜 범위

          const courseItem = document.createElement('div');
          courseItem.textContent = `${course.c_name}/ 학과명: ${course.d_name}/ 요일: ${days}/ 날짜: ${selectedRange}/ 시간: ${stTimeFormatted} ~ ${endTimeFormatted}`;

          // 삭제 버튼 추가
          const removeButton = document.createElement('button');
          removeButton.textContent = '삭제';
          removeButton.onclick = () => {
              // 서버에 DELETE 요청 보내기
              fetch(`http://192.168.0.117:9000/courses/${course.c_id}`, {
                  method: 'DELETE',
              })
              .then(response => {
                  if (response.ok) {
                      alert('강의가 성공적으로 삭제되었습니다.');
                      courseList.removeChild(courseItem); // UI에서 삭제
                  } else {
                      throw new Error('강의 삭제 실패');
                  }
              })
              .catch(error => {
                  console.error('삭제 오류:', error);
                  alert('강의 삭제에 실패했습니다.');
              });
          };

          courseItem.appendChild(removeButton);
          courseList.appendChild(courseItem);
        });
      })
      .catch(error => {
        console.error('Error loading courses:', error);
      });
  });

  const selectedDays = [];

  function addCourse() {
    const courseName = document.getElementById('course-name').value;
    const department = document.getElementById('department').value;
    const stime = document.getElementById('start-time').value;
    const etime = document.getElementById('end-time').value;

    // 선택된 요일과 날짜를 가져오기
    const day = selectedDays; // 선택된 요일 배열
    const selectedRange = document.getElementById('selected-range').value; // 선택된 날짜 범위

    // 현재 로그인한 사용자 ID (예시로 하드코딩, 실제로는 로그인 정보를 가져와야 함)
    const loggedInUserId = localStorage.getItem('loggedInUserId')

    if (courseName && department && day.length > 0 && stime && etime) {
        // JSON 객체 생성
        const courseData = {
            c_name: courseName,
            m_id: loggedInUserId, // 로그인한 사용자 ID          
            d_id: department, // 선택한 학과 이름
            schedule_dates: {
                days: day,
                selected_range: selectedRange
            },
            st_time: stime,
            end_time: etime
        };

        // AJAX 요청을 통해 서버에 데이터 전송
        fetch('http://192.168.0.117:9000/inputclass', { // 실제 서버의 URL로 변경해야 합니다.
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(courseData), // JSON 형태로 변환
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('네트워크 응답이 실패했습니다.');
        })
        .then(data => {
            console.log('서버 응답:', data);
            alert('강의가 성공적으로 추가되었습니다.');

            // 강의 목록 갱신
            refreshCourseList(); // 강의 목록을 새로고침하는 함수 호출

            // 입력 필드 초기화
            document.getElementById('course-name').value = '';
            document.getElementById('department').value = '';
            document.getElementById('start-date').value = '';
            document.getElementById('end-date').value = '';
            document.getElementById('start-time').value = '';
            document.getElementById('end-time').value = '';

            // 선택된 요일 초기화
            selectedDays.length = 0; // 배열 초기화
            updateSelectedDays(); // UI 업데이트
        })
        .catch(error => {
            console.error('전송 오류:', error);
            alert('강의 추가에 실패했습니다.');
        });
    } else {
        alert('모든 필드를 입력하세요.');
    }
}

function refreshCourseList() {
    const loggedInUserId = localStorage.getItem('loggedInUserId'); // 로그인한 사용자 ID 가져오기
    const courseList = document.getElementById('course-list');
    courseList.innerHTML = ''; // 기존 목록 초기화

    // 강의 목록을 서버에서 가져와서 리스트에 추가하는 함수
    fetch(`http://192.168.0.117:9000/courses?m_id=${loggedInUserId}`)
      .then(response => response.json())
      .then(data => {
        data.courses.forEach(course => {
          const stTimeFormatted = secondsToTimeFormat(course.st_time);
          const endTimeFormatted = secondsToTimeFormat(course.end_time);
  
            // 요일과 날짜 정보를 추출
          const days = course.schedule_dates.days.join(', '); // 요일 배열을 문자열로 변환
          const selectedRange = course.schedule_dates.selected_range; // 날짜 범위
  
          const courseItem = document.createElement('div');
          courseItem.textContent = `${course.c_name}/ 학과명: ${course.d_name}/ 요일: ${days}/ 날짜: ${selectedRange}/ 시간: ${stTimeFormatted} ~ ${endTimeFormatted}`;

          //localStorage.setItem('CourseName', course.c_name)

                      // 삭제 버튼 추가
          const removeButton = document.createElement('button');
          removeButton.textContent = '삭제';
          removeButton.onclick = () => {
              // 서버에 DELETE 요청 보내기
              fetch(`http://192.168.0.117:9000/courses/${course.c_id}`, {
                  method: 'DELETE',
              })
              .then(response => {
                  if (response.ok) {
                      alert('강의가 성공적으로 삭제되었습니다.');
                      courseList.removeChild(courseItem); // UI에서 삭제
                  } else {
                      throw new Error('강의 삭제 실패');
                  }
              })
              .catch(error => {
                  console.error('삭제 오류:', error);
                  alert('강의 삭제에 실패했습니다.');
              });
          };

          courseItem.appendChild(removeButton);

          courseList.appendChild(courseItem);
        });
      })
      .catch(error => {
        console.error('Error loading courses:', error);
      });
}

function submitDateRange() { //날짜 범위출력
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (startDate && endDate) {
        const selectedRange = document.getElementById('selected-range');
        selectedRange.value = `${startDate} ~ ${endDate}`;

    } else {
        alert('시작 날짜와 종료 날짜를 모두 선택해야 합니다.');
    }
}

function addDay() {
    const daySelect = document.getElementById('day');
    const selectedValue = daySelect.value;

    if (selectedValue && !selectedDays.includes(selectedValue)) {
        selectedDays.push(selectedValue);
        updateSelectedDays();
    }
    daySelect.value = ''; // 선택 후 초기화
}

function updateSelectedDays() {
    const selectedDaysDiv = document.getElementById('selected-days');
    selectedDaysDiv.innerHTML = ''; // 초기화

    selectedDays.forEach(day => {
        const dayItem = document.createElement('div');
        dayItem.className = 'day-item';
        dayItem.textContent = day;

        const removeButton = document.createElement('span');
        removeButton.className = 'remove-day';
        removeButton.textContent = 'x';
        removeButton.onclick = () => removeDay(day); // 클릭 시 removeDay 함수 호출

        dayItem.appendChild(removeButton);
        selectedDaysDiv.appendChild(dayItem);
    });
}

function removeDay(day) {
    const index = selectedDays.indexOf(day);
    if (index > -1) {
        selectedDays.splice(index, 1);
    }
    updateSelectedDays();
}