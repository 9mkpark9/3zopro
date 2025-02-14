document.addEventListener('DOMContentLoaded', async () => {
  // getClassTimeRange 함수 추가
  function getClassTimeRange(classTime) {
    // "요일 HH:MM-HH:MM" 형식의 시간을 파싱
    const timeRange = classTime.split(' ')[1]; // "HH:MM-HH:MM" 부분 추출
    const [startTime, endTime] = timeRange.split('-');
    
    // 시작 시간을 분으로 변환
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    
    // 종료 시간을 분으로 변환
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;
    
    return [startMinutes, endMinutes];
  }

  const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;

  // 로그인한 교수 정보 가져오기
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  const professorId = currentUser.id;

  // 오늘 요일 가져오기
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date();
  const todayDay = days[today.getDay()]; // 오늘 요일

  // 오늘 날짜 가져오기
  const todayDate = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  console.log(`오늘 요일: ${todayDay}`); // 오늘 요일 로그
  console.log(`교수 ID: ${professorId}`); // 교수 ID 로그

  // 오늘 날짜 표시
  const dateElement = document.querySelector('.card-header .date');
  if (dateElement) {
    dateElement.textContent = `${todayDate}`;
  }

  let currentLecture = null;
  let timerInterval = null;
  let elapsedSeconds = 0; // 전역 변수로 설정하여 타이머가 정지된 후에도 유지

  // 이벤트 리스너 등록 여부를 확인하는 플래그 추가
  let isEventListenerRegistered = false;

  // 수업 정보를 불러오는 함수
  async function loadClasses() {
    try {
      const response = await fetch(`${SERVER_URL}/classes/today?day=${encodeURIComponent(todayDay)}&professor_id=${encodeURIComponent(professorId)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || '수업 정보를 가져오는데 실패했습니다.');
      }

      const lectureList = document.querySelector('.lecture-list');
      lectureList.innerHTML = ''; // 기존 수업 목록 제거
      currentLecture = null; // 현재 수업 초기화

      // 수업 목록을 시작 시간 기준으로 정렬
      data.classes.sort((a, b) => {
        const [aHour, aMinute] = a.st_time.split(':').map(Number);
        const [bHour, bMinute] = b.st_time.split(':').map(Number);
        return aHour * 60 + aMinute - (bHour * 60 + bMinute);
      });

      const currentTime = today.getHours() * 60 + today.getMinutes();
      let hasActiveOrUpcomingClass = false;

      data.classes.forEach(cls => {
        const lectureItem = document.createElement('div');
        lectureItem.classList.add('lecture-item');

        const [startHour, startMinute] = cls.st_time.split(':').map(Number);
        const [endHour, endMinute] = cls.end_time.split(':').map(Number);
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;

        // class_time 필드 추가
        cls.class_time = `${todayDay} ${cls.st_time}-${cls.end_time}`;

        // 수업 상태 결정 및 클래스 추가
        let statusBadge;
        if (currentTime > endTime) {
          statusBadge = '완료';
          cls.status = '완료';
          lectureItem.classList.add('completed');  // 완료된 강의 클래스 추가
        } else if (currentTime >= startTime && currentTime <= endTime) {
          statusBadge = '진행 중';
          cls.status = '진행 중';
          lectureItem.classList.add('active');  // 진행중인 강의 클래스 추가
          hasActiveOrUpcomingClass = true;
          if (!currentLecture) {
            currentLecture = cls;
          }
        } else if (currentTime < startTime) {
          statusBadge = '예정';
          cls.status = '예정';
          lectureItem.classList.add('upcoming');  // 예정된 강의 클래스 추가
          hasActiveOrUpcomingClass = true;
          if (!currentLecture || 
              (startTime < getClassTimeRange(currentLecture.class_time)[0])) {
            currentLecture = cls;
          }
        }

        // 현재 수업이 완료된 경우 다음 예정된 수업을 찾기
        if (currentLecture && currentLecture.status === '완료') {
          const nextClass = data.classes.find(c => c.status === '예정');
          if (nextClass) {
            currentLecture = nextClass;
          } else {
            currentLecture = null; // 예정된 수업이 없으면 현재 수업을 null로 설정
          }
        }

        lectureItem.innerHTML = `
          <div class="time-slot">${cls.st_time} - ${cls.end_time}</div>
          <div class="lecture-info">
            <h4>${cls.c_name}</h4>
            <p>수강 정원: ${cls.fixed_num}명</p>
          </div>
          <div class="lecture-status">
            <span class="status-badge">${statusBadge}</span>
          </div>
        `;
        lectureList.appendChild(lectureItem);
      });

      // 현재 수업 정보 업데이트
      if (currentLecture && hasActiveOrUpcomingClass) {
        const currentLectureNameElement = document.querySelector('.status-info .value');
        const currentLectureTimeElement = document.getElementById('currentLectureTime');
        const elapsedTimeElement = document.getElementById('elapsedTime');
        const attendanceElement = document.getElementById('attendance');

        if (currentLectureNameElement) {
          currentLectureNameElement.textContent = currentLecture.c_name;
        }
        if (currentLectureTimeElement) {
          currentLectureTimeElement.textContent = `${currentLecture.st_time} - ${currentLecture.end_time}`;
        }

        // 수강 신청 학생 수와 출석 학생 수 가져오기
        try {
          // 수강 신청 정보 가져오기
          const enrollmentResponse = await fetch(`${SERVER_URL}/classes/${currentLecture.c_id}/enrollment`);
          const enrollmentData = await enrollmentResponse.json();
          
          // ReID 시스템에서 현재 출석 정보 가져오기
          const reidData = await window.reidManager.getLatestData();
          
          if (enrollmentResponse.ok && reidData.success) {
            const enrolledCount = enrollmentData.enrolled_count || 0;
            const presentCount = reidData.stats?.present_members || 0;
            
            if (attendanceElement) {
              // 출석 인원 / 수강 신청 인원으로 업데이트
              attendanceElement.textContent = ` ${enrolledCount}명`;
            }
          } else {
            console.error('데이터를 가져오는데 실패했습니다');
            attendanceElement.textContent = `${currentLecture.fixed_num}명`;
          }
        } catch (error) {
          console.error('데이터를 가져오는 중 오류:', error);
          if (attendanceElement) {
            attendanceElement.textContent = `${currentLecture.fixed_num}명`;
          }
        }

        // 강의 시작 및 종료 버튼
        const startLectureButton = document.getElementById('startLecture');
        const endLectureButton = document.getElementById('endLecture');

        if (startLectureButton && endLectureButton && !isEventListenerRegistered) {
          // 강의 시작 버튼 이벤트 리스너
          startLectureButton.addEventListener('click', async () => {
            if (!currentLecture) {
              alert('시작할 수업이 없습니다.');
              return;
            }

            // 현재 시간이 종료 시간을 지났는지만 확인
            const [endHour, endMinute] = currentLecture.end_time.split(':').map(Number);
            const endTime = endHour * 60 + endMinute;
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();

            if (currentTime > endTime) {
              alert('이미 종료된 수업입니다.');
              return;
            }

            try {
              // ReID 시스템 시작
              const result = await window.reidManager.startRecognition();
              
              if (result.success) {
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                  elapsedSeconds++;
                  const minutes = Math.floor(elapsedSeconds / 60);
                  const seconds = elapsedSeconds % 60;
                  if (elapsedTimeElement) {
                    elapsedTimeElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                  }
                }, 1000);

                startLectureButton.style.display = 'none';
                endLectureButton.style.display = 'block';

                const statusBadge = document.querySelector('.status-badge');
                if (statusBadge) {
                  statusBadge.textContent = '진행중';
                  statusBadge.classList.add('active');
                }
              } else {
                alert('강의 시작에 실패했습니다.');
              }
            } catch (error) {
              console.error('강의 시작 중 오류:', error);
              alert('강의 시작 중 오류가 발생했습니다.');
            }
          });

          // 강의 종료 버튼 이벤트 리스너
          endLectureButton.addEventListener('click', async () => {
            if (!currentLecture) {
              alert('종료할 수업이 없습니다.');
              return;
            }

            try {
              // ReID 시스템 종료
              const stopResult = await window.reidManager.stopRecognition();

              if (stopResult.success) {
                if (timerInterval) {
                  clearInterval(timerInterval);
                  timerInterval = null;
                }

                startLectureButton.style.display = 'block';
                endLectureButton.style.display = 'none';

                const statusBadge = document.querySelector('.status-badge');
                if (statusBadge) {
                  statusBadge.textContent = '대기중';
                  statusBadge.classList.remove('active');
                }

                await loadClasses();
                alert('강의가 종료되었습니다.');
              } else {
                throw new Error('ReID 시스템 종료에 실패했습니다.');
              }
            } catch (error) {
              console.error('강의 종료 중 오류:', error);
              alert('강의 종료 중 오류가 발생했습니다.');
            }
          });

          // 이벤트 리스너가 등록되었음을 표시
          isEventListenerRegistered = true;
        }

        // 현재 수업 정보 변경 이벤트 발생
        window.dispatchEvent(new CustomEvent('currentClassChanged', {
          detail: { 
            currentClass: currentLecture ? {
              ...currentLecture,
              class_time: `${todayDay} ${currentLecture.st_time}-${currentLecture.end_time}`
            } : null
          }
        }));
      } else {
        // 활성화된 수업이나 예정된 수업이 없는 경우
        window.dispatchEvent(new CustomEvent('currentClassChanged', {
          detail: { currentClass: null }
        }));
      }

    } catch (error) {
      console.error('수업 정보를 불러오는 중 오류:', error);
      alert('수업 정보를 불러오는 중 오류가 발생했습니다.');
    }
  }

  // '홈' 버튼 클릭 시 수업 정보 불러오기
  const homeButton = document.querySelector('[data-page="home"]');
  if (homeButton) {
    homeButton.addEventListener('click', () => {
      loadClasses();
    });
  }

  // 페이지 로드 시 수업 정보 불러오기
  loadClasses();
});
