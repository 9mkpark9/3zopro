document.addEventListener('DOMContentLoaded', async () => {
  const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));

  if (!currentUser) {
    alert('로그인 정보가 없습니다.');
    return;
  }

  // todayCourses를 전역 변수로 선언
  let todayCourses = [];
  let updateInterval;  // 인터벌 ID를 저장할 변수

  // 오늘 날짜 가져오기
  const today = new Date();
  const todayDate = today.toLocaleDateString('ko-KR', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // 오늘 날짜 표시
  const dateElement = document.querySelector('.schedule-card .date');
  if (dateElement) {
    dateElement.textContent = todayDate;
  }

  // '홈' 버튼 클릭 시 데이터 새로고침
  const homeButton = document.querySelector('[data-page="home"] a');
  if (homeButton) {
    homeButton.addEventListener('click', async (e) => {
      e.preventDefault(); // 기본 동작 방지
      console.log('홈 버튼 클릭 - 데이터 새로고침 시작');
      try {
        await loadClasses();
        await loadRegisteredCourses();
        await loadRegisteredTodayCourses();
        console.log('데이터 새로고침 완료');
      } catch (error) {
        console.error('데이터 새로고침 중 오류:', error);
      }
    });
  }

  // ----------------- [1] 초기 작업 -----------------
  // [1-1] 페이지 언로드 시 인터벌 정리
  window.addEventListener('unload', () => {
    console.log('페이지 언로드 - 인터벌 정리'); // 디버깅용 로그
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });

  // [1-2] 초기 로드
  try {
    await loadClasses();
    await loadRegisteredCourses();
    await loadRegisteredTodayCourses();
  } catch (error) {
    console.error('초기 데이터 로드 중 오류:', error);
  }

  // ----------------- [2] 실시간 출석 현황 -----------------
  // [2-1] 출석 정보 업데이트 함수
  function updateAttendanceInfo({ currentClass, nextClass }) {
    const attendanceInfo = document.querySelector('.attendance-info'); // 클래스 이름 수정
    if (!attendanceInfo) {
      console.error('.attendance-info 요소를 찾을 수 없습니다.');
      return;
    }
    
    const currentClassElement = document.getElementById('current_class'); // 현재 수업 ID 요소
    const statusEl = attendanceInfo.querySelector('.monitoring-item.attendance .info-text p');
    const subjectEl = attendanceInfo.querySelector('.monitoring-item:nth-child(2) .info-text p');
    const timeEl = attendanceInfo.querySelector('.monitoring-item:nth-child(3) .info-text p');
    const elapsedTimeEl = attendanceInfo.querySelector('.monitoring-item:nth-child(4) .info-text p');

    if (currentClass) {
      // 현재 수업 정보
      statusEl.textContent = '출석대기중'
      currentClassElement.textContent = "현재 수업"
      subjectEl.textContent = currentClass.c_name;
      subjectEl.classList.add('active'); // subjectEl에 active 클래스 추가
      timeEl.textContent = currentClass.class_time;
      timeEl.classList.add('active'); // timeEl에 active 클래스 추가
      elapsedTimeEl.textContent = calculateElapsedMinutes(currentClass.class_time) + '분 경과';
      elapsedTimeEl.classList.add('active'); // timeEl에 active 클래스 추가
    } else if (nextClass) {
      // 다음 수업 정보
      statusEl.textContent = '출석대기중';
      currentClassElement.textContent = "다음 수업"
      subjectEl.textContent = nextClass.c_name;
      subjectEl.classList.remove('active'); // subjectEl에 active 클래스 제거
      timeEl.textContent = nextClass.class_time;
      timeEl.classList.remove('active'); // timeEl에 active 클래스 제거
      elapsedTimeEl.textContent = '-';
      elapsedTimeEl.classList.remove('active'); // timeEl에 active 클래스 제거
    } else {
      // 오늘 수업 없음
      statusEl.textContent = '출석대기중';
      currentClassElement.textContent = "수업 없음"
      subjectEl.textContent = '-';
      subjectEl.classList.remove('active'); // subjectEl에 active 클래스 제거
      timeEl.textContent = '-';
      timeEl.classList.remove('active'); // timeEl에 active 클래스 제거
      elapsedTimeEl.textContent = '-';
      elapsedTimeEl.classList.remove('active'); // timeEl에 active 클래스 제거
    }
  }  

  // [2-2] 현재 수업 및 다음 수업 확인 함수
  function getCurrentAndNextCourse(courses) {
    let currentClass = null;
    let nextClass = null;
    const now = new Date().getTime();

    courses.forEach(course => {
      const [startTime, endTime] = getClassTimeRange(course.class_time);
      const activationTime = startTime - (4 * 60 * 1000); // 수업 시작 4분 전
      const finishActivationTime = endTime - (5 * 60 * 1000); // 수업 종료 5분 전

      // 디버깅을 위한 시간 정보 출력
      console.log('수업:', course.c_name);
      console.log('현재 시간:', new Date(now).toLocaleTimeString());
      console.log('수업 시작 시간:', new Date(startTime).toLocaleTimeString());
      console.log('수업 종료 시간:', new Date(endTime).toLocaleTimeString());
      console.log('종료 버튼 활성화 시간:', new Date(finishActivationTime).toLocaleTimeString());

      if (now >= activationTime && now <= endTime) {
        currentClass = {
          ...course,
          startTime,
          endTime,
          isNearEnd: now >= finishActivationTime // 종료 5분 전 여부
        };
        console.log('현재 수업으로 설정됨:', course.c_name);
        console.log('종료 임박 여부:', now >= finishActivationTime);
      } else if (now < startTime && (!nextClass || startTime < getClassTimeRange(nextClass.class_time)[0])) {
        nextClass = course;
        console.log('다음 수업으로 설정됨:', course.c_name);
      }
    });

    // 상태 변경 이벤트 발생
    window.dispatchEvent(new CustomEvent('classStateChanged', {
      detail: { currentClass, nextClass }
    }));

    return { currentClass, nextClass };
  }

  // [2-3] 경과 시간 계산 (분 단위)
  function calculateElapsedMinutes(classTime) {
    const now = new Date();
    const [startTime] = getClassTimeRange(classTime);
    const elapsedMs = now.getTime() - startTime;
    return Math.floor(elapsedMs / (1000 * 60)); // 분 단위로 변환
  }

  // [2-4] 자동 업데이트 함수
  function startAutoUpdate() {
    console.log('자동 업데이트 시작'); // 디버깅용 로그

    // 기존 인터벌이 있다면 제거
    if (updateInterval) {
      clearInterval(updateInterval);
    }

    // 즉시 첫 업데이트 실행
    updateData();

    // 새로운 인터벌 설정
    updateInterval = setInterval(updateData, 30000); // 30초마다 실행
  }

  // ----------------- [3] 오늘의 수업 -----------------
  // [3-1] 데이터 업데이트 함수
  async function updateData() {
    console.log('데이터 업데이트 중...', new Date().toLocaleTimeString()); // 디버깅용 로그
    try {
      // 데이터 새로 불러오기
      const response = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || '신청한 과목을 불러오는데 실패했습니다.');
      }

      todayCourses = filterTodayCourses(data.courses);
      const updatedCurrentAndNext = getCurrentAndNextCourse(todayCourses);
      
      // UI 업데이트
      updateAttendanceInfo(updatedCurrentAndNext);
      updateScheduleList(todayCourses);
      
      // 이벤트 발생
      window.dispatchEvent(new CustomEvent('classStateChanged', {
        detail: { 
          currentClass: updatedCurrentAndNext.currentClass, 
          nextClass: updatedCurrentAndNext.nextClass 
        }
      }));

      console.log('데이터 업데이트 완료'); // 디버깅용 로그
    } catch (error) {
      console.error('자동 업데이트 중 오류:', error);
    }
  }

  // [3-2] 전체 수업 목록 로드
  async function loadClasses() {
    try {
        const response = await fetch(`${SERVER_URL}/classes/all`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || '수업 정보를 가져오는데 실패했습니다.');
        }

        // 현재 페이지가 홈인 경우에만 테이블을 업데이트
        const currentPage = document.querySelector('.content-area.active');
        if (currentPage && currentPage.id === 'home-page') {
            const coursesTableBody = document.querySelector('.courses-table tbody');
            if (coursesTableBody) {
                coursesTableBody.innerHTML = '';

                data.classes.forEach(cls => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${cls.c_id}</td>
                        <td>${cls.c_name}</td>
                        <td>${cls.m_name}</td>
                        <td>${cls.class_day}, ${cls.st_time} - ${cls.end_time}</td>
                        <td>${cls.fixed_num}</td>
                        <td><button class="register-btn">신청</button></td>
                    `;
                    coursesTableBody.appendChild(row);
                });

                document.querySelectorAll('.register-btn').forEach(button => {
                    button.addEventListener('click', function() {
                        const courseId = this.closest('tr').querySelector('td').textContent;
                        registerCourse(courseId);
                    });
                });
            }
        }
    } catch (error) {
        console.error('수업 정보를 불러오는 중 오류:', error);
        alert('수업 정보를 불러오는 중 오류가 발생했습니다.');
    }
  }   

  // [3-3] 내가 신청한 수업 확인 
  async function loadRegisteredCourses() {
    try {
        const response = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.detail || '신청한 과목을 불러오는데 실패했습니다.');

        const registeredCoursesTableBody = document.querySelector('.registered-courses-table tbody');
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

        document.querySelectorAll('.btn-cancel').forEach(button => {
            button.addEventListener('click', function () {
                const courseId = this.dataset.courseId;
                cancelCourse(courseId);
            });
        });
    } catch (error) {
        console.error('신청한 과목을 불러오는 중 오류:', error);
        alert('신청한 과목을 불러오는 중 오류가 발생했습니다.');
    }
  }

  // [3-4] 신청한 수업중 오늘 수업 로드
  async function loadRegisteredTodayCourses() {
    try {
      console.log('초기 데이터 로드 시작'); // 디버깅용 로그
      const response = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.detail || '신청한 과목을 불러오는데 실패했습니다.');
      }
  
      todayCourses = filterTodayCourses(data.courses);
      const currentAndNextCourse = getCurrentAndNextCourse(todayCourses);
      
      updateAttendanceInfo(currentAndNextCourse);
      updateScheduleList(todayCourses);

      // 자동 업데이트 시작
      startAutoUpdate();
      console.log('초기 데이터 로드 완료'); // 디버깅용 로그
    } catch (error) {
      console.error('신청한 과목을 불러오는 중 오류:', error.message);
      alert('신청한 과목을 불러오는 중 오류가 발생했습니다.');
    }
  }
  
  // [3-5] 오늘의 과목 필터링 함수
  function filterTodayCourses(courses) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const todayDay = days[new Date().getDay()]; // 오늘의 요일
    return courses.filter(course => {
      const [courseDay] = course.class_time.split(' '); // 요일 추출
      return courseDay === todayDay;
    });
  }

  // [3-6] 시간표 업데이트 함수
  function updateScheduleList(courses) {
    const scheduleList = document.querySelector('.schedule-list');
    scheduleList.innerHTML = ''; // 기존 내용을 초기화

    if (courses.length === 0) {
      const noCourseMessage = document.createElement('div');
      noCourseMessage.className = 'no-courses';
      noCourseMessage.textContent = '오늘은 수업이 없습니다.';
      scheduleList.appendChild(noCourseMessage);
      return;
    }

    // 수업 목록을 시작 시간 기준으로 정렬
    courses.sort((a, b) => {
      const [aStartTime] = getClassTimeRange(a.class_time);
      const [bStartTime] = getClassTimeRange(b.class_time);
      return aStartTime - bStartTime;
    });

    courses.forEach(course => {
      const scheduleItem = document.createElement('div');
      scheduleItem.className = 'schedule-item';

      const isOngoing = checkIfOngoing(course.class_time); // 현재 진행 중인지 확인

      scheduleItem.innerHTML = `
        <div class="time-slot">
          <span class="time">${course.class_time}</span>
          <span class="status">${isOngoing}</span> <!-- 상태 표시 -->
        </div>
        <div class="class-info">
          <h4>${course.c_name}</h4>
          <p>${course.professor_name}</p>
        </div>
      `;

      if (isOngoing === "진행중") {
        scheduleItem.classList.add('active'); // 진행 중인 수업에 active 클래스 추가
      } else if (isOngoing === "종료") {
        scheduleItem.classList.add('finished'); // 이미 끝난 수업 스타일 추가
      }

      scheduleList.appendChild(scheduleItem);
    });
  }

  // [3-7] 수업 시간 범위 가져오기
  function getClassTimeRange(classTime) {
    const [, timeRange] = classTime.split(' ');
    const [startTimeStr, endTimeStr] = timeRange.split('-');
    
    const now = new Date();
    const [startHour, startMin] = startTimeStr.split(':').map(Number);
    const [endHour, endMin] = endTimeStr.split(':').map(Number);
    
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0).getTime();
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0, 0).getTime();
    
    // 디버깅을 위한 시간 정보 출력
    console.log('시간 변환 결과:');
    console.log('입력된 시간:', classTime);
    console.log('시작 시간:', new Date(startTime).toLocaleTimeString());
    console.log('종료 시간:', new Date(endTime).toLocaleTimeString());
    
    return [startTime, endTime];
  }
  
  // [3-8] 현재 진행 중인지 확인하는 함수
  function checkIfOngoing(classTime) {
    try {
      const now = new Date().getTime();
      const [, timeRange] = classTime.split(' '); // 시간 범위만 추출 (예: '09:00-10:00')
      if (!timeRange) throw new Error('시간 범위가 잘못되었습니다.');

      const [startTime, endTime] = timeRange.split('-').map(time => {
        const [hours, minutes] = time.split(':');
        return new Date().setHours(parseInt(hours), parseInt(minutes), 0, 0);
      });

      if (now >= startTime && now <= endTime) {
        return "진행중"; // 수업이 현재 진행 중
      } else if (now > endTime) {
        return "종료"; // 수업이 이미 종료됨
      } else {
        return "예정"; // 수업이 아직 시작되지 않음
      }
    } catch (error) {
      console.error('시간 비교 오류:', error);
      return "오류";
    }
  } 
});