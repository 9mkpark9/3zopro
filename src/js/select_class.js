//초를 시간으로 변환하는 함수
function secondsToTimeFormat(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return formattedTime;
}

// 학과 목록을 서버에서 가져와서 select 요소에 추가하는 함수
document.addEventListener('DOMContentLoaded', function() {
    
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
});

// 학과명으로 '조회' 버튼 클릭시 수강목록 조회 이벤트
document.getElementById('select_department').addEventListener('click', function() {
    const department = document.getElementById('department').value;

    if (!department) {
        alert('학과를 선택하세요.');
        return;
    }

    // AJAX 요청
    fetch(`http://192.168.0.117:9000/courses_sel?d_id=${department}`) // 실제 API URL로 변경

        .then(response => {
            if (!response.ok) {
                throw new Error('네트워크 응답이 좋지 않습니다.');
            }
            return response.json();
        })
        .then(data => {
            console.log('Fetched data:', data); // 가져온 데이터 로그
            const courseList = document.getElementById('course-list');
            courseList.innerHTML = ''; // 기존 목록 초기화
            // 수업 정보를 목록에 추가
            data.courses.forEach(course => {
                const stTimeFormatted = secondsToTimeFormat(course.st_time);
                const endTimeFormatted = secondsToTimeFormat(course.end_time);
      
                // 요일과 날짜 정보를 추출
                const days = course.schedule_dates.days.join(', '); // 요일 배열을 문자열로 변환
                const selectedRange = course.schedule_dates.selected_range; // 날짜 범위
                const listItem = document.createElement('li');
                listItem.textContent = `수업명: ${course.c_name}, 수강요일: ${days}, 수강날짜: ${selectedRange}, 시간: ${stTimeFormatted} ~ ${endTimeFormatted}`;
                listItem.dataset.courseData = JSON.stringify(course); // 과정 데이터를 저장
                listItem.style.cursor = 'pointer'; // 마우스 커서를 포인터로 변경
                listItem.addEventListener('click', function() {
                    // 선택된 항목 하이라이트
                    const selectedItems = document.querySelectorAll('#course-list li');
                    selectedItems.forEach(item => item.classList.remove('selected'));
                    this.classList.add('selected');
                });
                courseList.appendChild(listItem);
            });
        })
        .catch(error => {
            console.error('문제가 발생했습니다:', error);
            alert('수업 정보를 가져오는 데 문제가 발생했습니다.');
        });
});

// >> 버튼 클릭 시 '내 강의'로 이동
document.getElementById('right-button').addEventListener('click', function() {
  const courseList = document.getElementById('course-list');
  const selectedItem = Array.from(courseList.getElementsByClassName('selected'))[0]; // 선택된 항목

  if (selectedItem) {
      const courseData = JSON.parse(selectedItem.dataset.courseData); // 저장한 과정 데이터 가져오기
      const stTimeFormatted = secondsToTimeFormat(courseData.st_time);
      const endTimeFormatted = secondsToTimeFormat(courseData.end_time);

      // 요일과 날짜 정보를 추출
      const days = courseData.schedule_dates.days.join(', '); // 요일 배열을 문자열로 변환
      const selectedRange = courseData.schedule_dates.selected_range; // 날짜 범위

      // '내 강의' 목록에 추가
      const courseBox = document.querySelector('.course-box');
      const listItem = document.createElement('li');
      listItem.textContent = `수업명: ${courseData.c_name}, 수강요일: ${days}, 수강날짜: ${selectedRange}, 시간: ${stTimeFormatted} ~ ${endTimeFormatted}`; // 필요한 데이터로 변경
      listItem.style.cursor = 'pointer'; // 마우스 커서를 포인터로 변경
      listItem.dataset.courseData = selectedItem.dataset.courseData; // 데이터 저장

      listItem.addEventListener('click', function() {
          // 선택된 항목 하이라이트
          const selectedItems = document.querySelectorAll('#course-box li');
          selectedItems.forEach(item => item.classList.remove('selected'));
          this.classList.add('selected');
      });

      courseBox.appendChild(listItem);

      // 원래 목록에서 제거
      courseList.removeChild(selectedItem);
  } else {
      alert('이동할 강의를 선택하세요.');
  }
});

// << 버튼 클릭 시 '전체 강의'로 이동
document.getElementById('left-button').addEventListener('click', function() {
  const courseBox = document.querySelector('.course-box');
  const rselectedItem = Array.from(courseBox.getElementsByClassName('selected'))[0]; // 선택된 항목

  if (rselectedItem) {
      const courseData = JSON.parse(rselectedItem.dataset.courseData); // 저장한 과정 데이터 가져오기
      const stTimeFormatted = secondsToTimeFormat(courseData.st_time);
      const endTimeFormatted = secondsToTimeFormat(courseData.end_time);

      // 요일과 날짜 정보를 추출
      const days = courseData.schedule_dates.days.join(', '); // 요일 배열을 문자열로 변환
      const selectedRange = courseData.schedule_dates.selected_range; // 날짜 범위

      // '전체 강의' 목록에 추가
      const courseList = document.getElementById('course-list');
      const listItem = document.createElement('li');
      listItem.textContent = `수업명: ${courseData.c_name}, 수강요일: ${days}, 수강날짜: ${selectedRange}, 시간: ${stTimeFormatted} ~ ${endTimeFormatted}`; // 필요한 데이터로 변경

      courseList.appendChild(listItem);

      // '내 강의'에서 제거
      courseBox.removeChild(rselectedItem);
  } else {
      alert('이동할 강의를 선택하세요.');
  }
});

//강의 저장 버튼 클릭시 이벤트
document.getElementById('insert_m_class').addEventListener('click', function() {
  const member_id = localStorage.getItem('loggedInUserId')
  const courseBox = document.querySelector('.course-box');
  const selectedItems = Array.from(courseBox.getElementsByClassName('selected')); // 선택된 항목들

  if (selectedItems.length === 0) {
      alert('저장할 강의를 선택하세요.');
      return;
  }

  selectedItems.forEach(selectedItem => {
      const courseData = JSON.parse(selectedItem.dataset.courseData); // 선택한 과정 데이터 가져오기
      const c_name = courseData.c_name; // 수업명

      // c_id를 서버에서 찾기 위한 요청
      fetch(`http://192.168.0.117:9000/getCourseId?c_name=${encodeURIComponent(c_name)}`) // c_name을 통해 c_id를 요청
          .then(response => {
              if (!response.ok) {
                  throw new Error('네트워크 응답이 좋지 않습니다.');
              }
              return response.json();
          })
          .then(data => {
              if (data.c_id) {
                  // c_id를 통해 강의 저장 요청
                  return fetch('http://192.168.0.117:9000/saveClass', {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                          m_id: member_id, // 로그인한 유저의 ID
                          c_id: data.c_id // 서버에서 받은 c_id
                      }),
                  });
              } else {
                  throw new Error('c_id를 찾을 수 없습니다.');
              }
          })
          .then(response => {
              if (!response.ok) {
                  throw new Error('강의 저장에 실패했습니다.');
              }
              return response.json();
          })
          .then(data => {
              alert('강의가 저장되었습니다.');
              // 저장 후 필요한 추가 작업 (예: UI 업데이트 등)
          })
          .catch(error => {
              console.error('문제가 발생했습니다:', error);
              alert('강의 저장 중 문제가 발생했습니다.');
          });
  });

})

//강의 삭제 클릭시 이벤트
document.querySelectorAll('.delete-button').forEach(button => {
    button.addEventListener('click', function() {
        const member_id = localStorage.getItem('loggedInUserId')
        const courseBox = document.querySelector('.course-box');
        const selectedItems = Array.from(courseBox.getElementsByClassName('selected')); // 선택된 항목들
      
        if (selectedItems.length === 0) {
            alert('삭제할 강의를 선택하세요.');
            return;
        }
      
        selectedItems.forEach(selectedItem => {
            const courseData = JSON.parse(selectedItem.dataset.courseData); // 선택한 과정 데이터 가져오기
            const c_name = courseData.c_name; // 수업명
      
            // c_id를 서버에서 찾기 위한 요청
            fetch(`http://192.168.0.117:9000/getCourseId?c_name=${encodeURIComponent(c_name)}`) // c_name을 통해 c_id를 요청
                .then(response => {
                    if (!response.ok) {
                        throw new Error('네트워크 응답이 좋지 않습니다.');
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.c_id) {
                        // c_id를 통해 강의 삭제 요청
                        return fetch('http://192.168.0.117:9000/deleteClass', {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                m_id: member_id, // 로그인한 유저의 ID
                                c_id: data.c_id // 서버에서 받은 c_id
                            }),
                        });
                    } else {
                        throw new Error('c_id를 찾을 수 없습니다.');
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('강의 삭제에 실패했습니다.');
                    }
                    return response.json();
                })
                .then(data => {
                    alert('강의가 삭제되었습니다.');
                    // 저장 후 필요한 추가 작업 (예: UI 업데이트 등)
                })
                .catch(error => {
                    console.error('문제가 발생했습니다:', error);
                    alert('강의 삭제 중 문제가 발생했습니다.');
                });
        });
      
});
})


