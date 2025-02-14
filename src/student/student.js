document.addEventListener('DOMContentLoaded', () => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date();
  const todayDay = days[today.getDay()]; // 오늘 요일
  const todayDate = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  // 로그인 체크
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser || currentUser.userType !== 'student') {
    alert('학생 계정으로 로그인해주세요.');
    window.location.href = '../login/index.html';
    return;
  }

  // 날짜 표시 업데이트
  const dateSpan = document.querySelector('.schedule-card .date');
  if (dateSpan) {
    dateSpan.textContent = todayDate;
  }


  // 서버 URL 설정
  const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
  console.log('서버 URL:', SERVER_URL);

   // 학년 계산 함수
   function calculateGrade(studentId) {
    const currentYear = new Date().getFullYear(); // 현재 연도
    const enrollmentYear = parseInt(studentId.substring(0, 4), 10); // 학번의 앞 4자리
    const grade = currentYear - enrollmentYear + 1; // 학년 계산
    return grade > 5 ? '졸업생' : `${grade}학년`; // 5학년 초과 시 "졸업생" 반환
  }

  // 학년 계산
  const grade = calculateGrade(currentUser.id);

  // 모든 학생 정보 표시 요소 업데이트
  function updateStudentInfo() {
    // 드롭다운 메뉴의 정보 업데이트
    document.querySelectorAll('#studentName').forEach(el => {
      el.textContent = `이름 : ${currentUser.name}`;
    });
    document.querySelectorAll('#studentId').forEach(el => {
      el.textContent = `학번 : ${currentUser.id}`;
    });
    document.querySelectorAll('#department').forEach(el => {
      el.textContent = `학과 : ${currentUser.department}`;
    });
    document.querySelectorAll('#grade').forEach(el => {
      el.textContent = grade;
    });

    // 프로필 카드의 정보 업데이트
    const profileCard = document.querySelector('.profile-card');
    if (profileCard) {
      const profileName = profileCard.querySelector('.profile-info h3');
      const profileId = profileCard.querySelector('.profile-info .student-id');
      const profileDept = profileCard.querySelector('.profile-info .department');
      
      if (profileName) profileName.textContent = `${currentUser.name}`;
      if (profileId) profileId.textContent = `${currentUser.id}`;
      if (profileDept) profileDept.textContent = `${currentUser.department}`;
    }
  }

  // 학생 정보 업데이트 함수 호출
  updateStudentInfo();

  // 드롭다운 요소
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDropdown = document.querySelector('.settings-dropdown');
  const profileBtn = document.getElementById('profileBtn');
  const profileDropdown = document.querySelector('.profile-dropdown');

  // 프로필 드롭다운 내용 업데이트
  const profileContent = document.querySelector('.profile-dropdown .dropdown-content');
  profileContent.innerHTML = `
    <div class="profile-info">
      <div class="profile-header">
        <span class="material-icons">account_circle</span>
        <h4>학생 정보</h4>
      </div>
      <div class="profile-details">
        <p><strong>이름:</strong> ${currentUser.name}</p>
        <p><strong>학번:</strong> ${currentUser.id}</p>
        <p><strong>학과:</strong> ${currentUser.department}</p>
        <p><strong>학년:</strong> ${grade}</p>
      </div>
      <div class="profile-actions">
        <button id="logoutBtn" class="btn btn-danger">로그아웃</button>
      </div>
    </div>
  `;

  // 로그아웃 기능
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('currentUser');
    window.location.href = '../login/index.html';
  });

  // 드롭다운 토글 기능
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('active');
    settingsDropdown.classList.remove('active');
  });

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsDropdown.classList.toggle('active');
    profileDropdown.classList.remove('active');
  });

  // 드롭다운 외부 클릭시 닫기
  document.addEventListener('click', () => {
    profileDropdown.classList.remove('active');
    settingsDropdown.classList.remove('active');
  });

  // 드롭다운 내부 클릭시 이벤트 전파 중단
  profileDropdown.addEventListener('click', (e) => e.stopPropagation());
  settingsDropdown.addEventListener('click', (e) => e.stopPropagation());

  // Chart.js를 사용하기 위해 CDN을 추가
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  document.head.appendChild(script);

  script.onload = () => {
    // chart-area 요소가 존재하는지 먼저 확인
    const chartArea = document.querySelector('.chart-area');
    if (!chartArea) {
      console.log('차트 영역을 찾을 수 없습니다.');
      return;  // chart-area가 없으면 차트 생성을 건너뜁니다.
    }

    const ctx = document.createElement('canvas');
    chartArea.appendChild(ctx);

    // 차트 인스턴스를 전역 변수에 저장
    window.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['1학년 1학기', '1학년 2학기', '2학년 1학기', '2학년 2학기'],
        datasets: [{
          label: '학기별 평점',
          data: [4.3, 4.2, 4.0, 4.1],
          borderColor: '#e14eca',
          tension: 0.4,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            grid: {
              color: 'rgba(255,255,255,0.1)'
            },
            ticks: {
              color: '#ffffff'
            }
          },
          x: {
            grid: {
              color: 'rgba(255,255,255,0.1)'
            },
            ticks: {
              color: '#ffffff'
            }
          }
        }
      }
    });

    // 초기 테마에 따른 차트 색상 설정
    const isLight = document.body.classList.contains('light-mode');
    updateChartColors(isLight);

    // 출석 차트 초기화
    initializeAttendanceChart();
  };

  // 테마 전환 기능
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  
  // 저장된 테마 불러오기
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('light-mode', savedTheme === 'light');
  document.querySelector(`input[value="${savedTheme}"]`).checked = true;

  // 차트 색상 업데이트 함수
  function updateChartColors(isLight) {
    if (window.chart) {
      const textColor = isLight ? '#2c2c2c' : '#ffffff';
      const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

      window.chart.options.scales.x.ticks.color = textColor;
      window.chart.options.scales.y.ticks.color = textColor;
      window.chart.options.scales.x.grid.color = gridColor;
      window.chart.options.scales.y.grid.color = gridColor;
      window.chart.update();
    }
  }

  // 테마 변경 이벤트
  themeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const isLight = e.target.value === 'light';
      document.body.classList.toggle('light-mode', isLight);
      localStorage.setItem('theme', e.target.value);
      
      // 차트 색상 업데이트
      updateChartColors(isLight);
    });
  });

  // 페이지 전환 기능
  const menuItems = document.querySelectorAll('.sidebar-nav li');
  const pages = document.querySelectorAll('.page');

  function switchPage(pageId) {
    menuItems.forEach(item => item.classList.remove('active'));
    pages.forEach(page => page.classList.remove('active'));
    
    const selectedMenuItem = document.querySelector(`[data-page="${pageId}"]`);
    if (selectedMenuItem) {
      selectedMenuItem.classList.add('active');
    }
    
    const selectedPage = document.getElementById(`${pageId}-page`);
    if (selectedPage) {
      selectedPage.classList.add('active');
    }

    // 페이지 전환 시 필요한 초기화
    if (pageId === 'home') {
      try {
        loadRegisteredTodayCourses(); // studenthome.js의 함수
      } catch (error) {
        console.error('홈 화면 데이터 새로고침 중 오류:', error);
      }
    } else if (pageId === 'register') {
      // 수강신청 페이지로 이동할 때마다 이벤트 리스너 초기화
      window.eventListenersInitialized.classEvents = false;
      loadClasses(); // stu_class.js의 함수
      loadRegisteredCourses(); // stu_class.js의 함수
    } else if (pageId === 'attendance') {
      // 출석 현황 페이지로 이동할 때 과목 목록 가져오기
      const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
      
      fetch(`${SERVER_URL}/api/student/grades/courses/${currentUser.id}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('과목 목록을 불러오는데 실패했습니다.');
          }
          return response.json();
        })
        .then(data => {
          const courses = data.courses || [];
          const courseFilter = document.querySelector('.attendance-detail-card .card-header .filter-controls #courseFilter');
          
          if (courseFilter) {
            // 기존 옵션 제거
            courseFilter.innerHTML = '<option value="">과목 선택</option>';

            // 신청한 과목들을 콤보박스에 추가
            courses.forEach(course => {
              const option = document.createElement('option');
              option.value = course.c_id;
              option.textContent = course.c_name;
              courseFilter.appendChild(option);
            });
          }
        })
        .catch(error => {
          console.error('과목 목록 조회 오류:', error);
          alert('과목 목록을 불러오는데 실패했습니다.');
        });
    }
  }

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      switchPage(pageId);
    });
  });



  // 수강신청 관련 기능
  const courseList = [
    { id: 'CS101', name: '컴퓨터개론', professor: '김교수', credits: 3, time: '월,수 09:00-10:30', capacity: '30' },
    { id: 'CS102', name: '프로그래밍기초', professor: '이교수', credits: 3, time: '화,목 13:00-14:30', capacity: '30' }
  ];

  let registeredCourses = JSON.parse(localStorage.getItem('registeredCourses')) || [];
  
  // 수강 가능한 과목 목록 표시
  function displayAvailableCourses() {
    const tbody = document.querySelector('.courses-table tbody');
    tbody.innerHTML = '';

    courseList.filter(course => !registeredCourses.some(rc => rc.id === course.id))
      .forEach(course => {
        const row = document.createElement('tr');
        const registeredCount = registeredCourses.filter(c => c.id === course.id).length;
        const remainingSeats = parseInt(course.capacity) - registeredCount;
        const isFull = remainingSeats <= 0;

        row.innerHTML = `
          <td>${course.id}</td>
          <td>${course.name}</td>
          <td>${course.professor}</td>
          <td>${course.credits}</td>
          <td>${course.time}</td>
          <td class="${isFull ? 'full' : ''}">${remainingSeats}/${course.capacity}</td>
          <td>
            <button class="btn btn-small ${isFull ? 'btn-disabled' : ''}" 
              data-course-id="${course.id}" 
              ${isFull ? 'disabled' : ''}>
              ${isFull ? '만석' : '신청'}
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });

    // 신청 버튼 이벤트 리스너
    document.querySelectorAll('.courses-table .btn:not(.btn-disabled)').forEach(button => {
      button.addEventListener('click', function() {
        const courseId = this.dataset.courseId;
        const course = courseList.find(c => c.id === courseId);
        
        if (course) {
          registeredCourses.push(course);
          localStorage.setItem('registeredCourses', JSON.stringify(registeredCourses));
          displayAvailableCourses();
          displayRegisteredCourses();
        }
      });
    });
  }

  // 신청한 과목 목록 표시
  function displayRegisteredCourses() {
    const tbody = document.querySelector('.registered-courses-table tbody');
    tbody.innerHTML = '';

    registeredCourses.forEach(course => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${course.id}</td>
        <td>${course.name}</td>
        <td>${course.professor}</td>
        <td>${course.credits}</td>
        <td>${course.time}</td>
        <td>
          <button class="btn btn-danger btn-small" data-course-id="${course.id}">취소</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // 취소 버튼 이벤트 리스너
    document.querySelectorAll('.registered-courses-table .btn-danger').forEach(button => {
      button.addEventListener('click', function() {
        const courseId = this.dataset.courseId;
        registeredCourses = registeredCourses.filter(course => course.id !== courseId);
        localStorage.setItem('registeredCourses', JSON.stringify(registeredCourses));
        displayAvailableCourses();
        displayRegisteredCourses();
      });
    });
  }

  // 초기 화면 로드
  if (document.querySelector('.courses-table')) {
    displayAvailableCourses();
    displayRegisteredCourses();
  }

  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
      });
    }

    // 콘텐츠 영역 클릭시 사이드바 닫기
    const mainPanel = document.querySelector('.main-panel');
    if (mainPanel) {
      mainPanel.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('active');
        }
      });
    }
  }

  // 전역 변수로 todayCourses 선언
  let todayCourses = [];

  // 오늘의 수업 정보를 가져오는 함수
  async function loadTodayCourses() {
    try {
        console.log('서버 URL 확인:', SERVER_URL); // 디버깅용
        const response = await fetch(`${SERVER_URL}/registered_courses/${currentUser.id}`);
        console.log('서버 응답:', response);
        const data = await response.json();
        console.log('받아온 데이터:', data);

        if (!response.ok) {
            throw new Error(data.detail || '신청한 과목을 불러오는데 실패했습니다.');
        }

        // 테스트용 더미 데이터
        const testData = [{
            c_id: 1,
            c_name: '테스트 수업',
            professor_name: '테스트 교수',
            class_time: `${getCurrentDayInKorean()} ${getCurrentTimeRange()}`
        }];

        // 실제 데이터가 없으면 테스트 데이터 사용
        const coursesData = (data.courses && data.courses.length > 0) ? data.courses : testData;
        console.log('사용할 수업 데이터:', coursesData);

        // 오늘의 요일 구하기
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const today = days[new Date().getDay()];
        console.log('오늘 요일:', today);

        // 오늘의 수업만 필터링
        todayCourses = coursesData.filter(course => {
            const courseDay = course.class_time.split(' ')[0];
            console.log(`과목: ${course.c_name}, 수업일: ${courseDay}, 수업 시간: ${course.class_time}`);
            return courseDay === today;
        });

        console.log('필터링된 오늘의 수업 목록:', todayCourses);
        return todayCourses;
    } catch (error) {
        console.error('수업 정보를 불러오는 중 오류:', error);
        // 에러 발생 시 테스트 데이터 사용
        todayCourses = [{
            c_id: 1,
            c_name: '테스트 수업',
            professor_name: '테스트 교수',
            class_time: `${getCurrentDayInKorean()} ${getCurrentTimeRange()}`
        }];
        console.log('에러로 인해 테스트 데이터 사용:', todayCourses);
        return todayCourses;
    }
  }

  // 현재 요일을 한글로 반환하는 함수
  function getCurrentDayInKorean() {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[new Date().getDay()];
  }

  // 현재 시간을 기준으로 수업 시간 범위를 생성하는 함수
  function getCurrentTimeRange() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // 현재 시간부터 1시간 동안의 수업 시간 설정
    const endHour = currentHour + 1;
    return `${currentHour}:${currentMinute}-${endHour}:${currentMinute}`;
  }

  // 초를 HH:MM 형식으로 변환하는 함수 추가
  function formatTimeFromSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // 모니터링 기능 초기화 함수 수정
  async function initializeStudentMonitoring() {
    // 먼저 오늘의 수업 정보를 로드
    await loadTodayCourses();

    const video = document.getElementById('webcam');
    const webcamContainer = document.querySelector('.webcam-container');
    const monitoringCard = document.querySelector('.monitoring-card');
    const statusIndicator = document.querySelector('.monitoring-header .status');
    const monitoringBtn = document.getElementById('monitoringBtn');
    const finishLectureBtn = document.getElementById('finishLectureBtn');
    const totalScoreDisplay = document.getElementById('totalScoreDisplay');
    let isMonitoring = false;
    let isPaused = false;

    // 버튼 상태 업데이트 함수
    function updateButtonState(currentClass) {
      if (!currentClass) {
        // 현재 수업이 없는 경우 모든 버튼 비활성화
        monitoringBtn.disabled = true;
        monitoringBtn.classList.add('disabled');
        monitoringBtn.title = "현재 진행 중인 수업이 없습니다";
        
        finishLectureBtn.disabled = true;
        finishLectureBtn.classList.add('disabled');
        finishLectureBtn.title = "현재 진행 중인 수업이 없습니다";
        return;
      }

      const now = new Date().getTime();
      const [startTime, endTime] = getClassTimeRange(currentClass.class_time);
      const activationTime = startTime - (5 * 60 * 1000); // 수업 시작 5분 전
      const finishActivationTime = endTime - (5 * 60 * 1000); // 수업 종료 5분 전

      // 출석 체크 버튼 상태 업데이트
      if (now >= activationTime && now <= endTime) {
        monitoringBtn.disabled = false;
        monitoringBtn.classList.remove('disabled');
        monitoringBtn.title = "출석 체크를 시작하려면 클릭하세요";
      } else {
        monitoringBtn.disabled = true;
        monitoringBtn.classList.add('disabled');
        monitoringBtn.title = now < activationTime ? 
          "아직 수업 시작 시간이 되지 않았습니다" : 
          "수업 시간이 종료되었습니다";
      }

      // 최종 점수 확인 버튼 상태 업데이트
      if (isMonitoring && now >= finishActivationTime && now <= endTime) {
        finishLectureBtn.disabled = false;
        finishLectureBtn.classList.remove('disabled');
        finishLectureBtn.title = "최종 점수를 확인하려면 클릭하세요";
      } else {
        finishLectureBtn.disabled = true;
        finishLectureBtn.classList.add('disabled');
        finishLectureBtn.title = !isMonitoring ? 
          "출석 체크가 시작되지 않았습니다" : 
          "아직 수업 종료 시간이 되지 않았습니다";
      }

      // 디버깅을 위한 시간 정보 출력
      console.log('현재 시간:', new Date(now).toLocaleTimeString());
      console.log('수업 시작 시간:', new Date(startTime).toLocaleTimeString());
      console.log('수업 종료 시간:', new Date(endTime).toLocaleTimeString());
      console.log('출석 체크 활성화 시간:', new Date(activationTime).toLocaleTimeString());
      console.log('최종 점수 확인 활성화 시간:', new Date(finishActivationTime).toLocaleTimeString());
    }

    // 시간 범위 계산 함수
    function getClassTimeRange(classTime) {
      const [day, timeRange] = classTime.split(' ');
      const [startTimeStr, endTimeStr] = timeRange.split('-');
      
      const now = new Date();
      const [startHour, startMin] = startTimeStr.split(':').map(Number);
      const [endHour, endMin] = endTimeStr.split(':').map(Number);
      
      const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0).getTime();
      const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0, 0).getTime();
      
      return [startTime, endTime];
    }

    // stu_cs.js의 이벤트를 구독
    window.addEventListener('classStateChanged', (event) => {
      updateButtonState(event.detail.currentClass);
    });

    // 요소 존재 여부 확인
    if (!statusIndicator) {
      console.error('상태 표시 요소를 찾을 수 없습니다.');
      return;
    }

    if (!monitoringBtn) {
      console.error('모니터링 버튼을 찾을 수 없습니다.');
      return;
    }

    console.log('모니터링 초기화 시작');
    console.log('electronAPI 존재 여부:', !!window.electronAPI);

    // getCurrentAndNextCourse 함수 수정
    function getCurrentAndNextCourse(courses) {
        let currentClass = null;
        let nextClass = null;
        const now = new Date();
        console.log('현재 시간:', now.toLocaleTimeString());
        console.log('확인할 수업 목록:', courses);

        courses.forEach(course => {
            // 수업 시간 파싱
            const [day, time] = course.class_time.split(' ');
            const [startStr, endStr] = time.split('-');
            
            // 시작 시간과 종료 시간 설정
            const [startHour, startMin] = startStr.split(':').map(Number);
            const [endHour, endMin] = endStr.split(':').map(Number);
            
            const startTime = new Date(now);
            startTime.setHours(startHour, startMin, 0);
            
            const endTime = new Date(now);
            endTime.setHours(endHour, endMin, 0);
            
            // 수업 시작 5분 전부터 수업 종료 시간까지를 현재 수업으로 간주
            const activationTime = new Date(startTime);
            activationTime.setMinutes(activationTime.getMinutes() - 5);

            console.log(`수업: ${course.c_name}`);
            console.log('시작 시간:', startTime.toLocaleTimeString());
            console.log('종료 시간:', endTime.toLocaleTimeString());
            console.log('활성화 시간:', activationTime.toLocaleTimeString());

            if (now >= activationTime && now <= endTime) {
                currentClass = {
                    ...course,
                    startTime: startTime.getTime(),
                    endTime: endTime.getTime(),
                    activationTime: activationTime.getTime()
                };
                console.log('현재 수업으로 설정됨:', course.c_name);
            } else if (now < startTime) {
                if (!nextClass || startTime < new Date(nextClass.startTime)) {
                    nextClass = {
                        ...course,
                        startTime: startTime.getTime(),
                        endTime: endTime.getTime(),
                        activationTime: activationTime.getTime()
                    };
                    console.log('다음 수업으로 설정됨:', course.c_name);
                }
            }
        });

        console.log('최종 현재 수업:', currentClass);
        console.log('최종 다음 수업:', nextClass);
        return { currentClass, nextClass };
    }

    // 최종 점수 표시 함수 추가
    function updateFinalScoreDisplay(data) {
        const totalScoreDisplay = document.getElementById('totalScoreDisplay');
        if (!totalScoreDisplay) return;

        const totalScoreContent = totalScoreDisplay.querySelector('.total-score-content');
        if (totalScoreContent) {
            totalScoreContent.innerHTML = `
                <div class="final-score-grid">
                    <div class="final-score-item total">
                        <span class="score-label">총점</span>
                        <span class="score-value">${Math.round(data.total_score)}/100점</span>
                    </div>
                    <div class="final-score-item">
                        <span class="score-label">수업 시간</span>
                        <span class="score-value">${Math.round(data.total_time)}초</span>
                    </div>
                    <div class="final-score-item">
                        <span class="score-label">정면 응시</span>
                        <span class="score-value">${Math.round(data.front_time)}초</span>
                    </div>
                    <div class="final-score-item">
                        <span class="score-label">졸음</span>
                        <span class="score-value">${Math.round(data.sleep_point)}/50점</span>
                    </div>
                    <div class="final-score-item">
                        <span class="score-label">고개 돌림</span>
                        <span class="score-value">${Math.round(data.ht_point)}/30점</span>
                    </div>
                    <div class="final-score-item">
                        <span class="score-label">눈 깜빡임</span>
                        <span class="score-value">${Math.round(data.blink_points)}/20점</span>
                    </div>
                    <div class="final-score-item">
                        <span class="score-label">눈 깜빡임 횟수</span>
                        <span class="score-value">${data.blink_count}회</span>
                    </div>
                </div>
            `;
            totalScoreDisplay.style.display = 'block';
            totalScoreDisplay.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // updateMonitoringUI 함수 수정
    async function updateMonitoringUI(data) {
        if (data.type === 'final') {
            console.log('최종 결과 데이터:', data);
            
            try {
                await loadTodayCourses();
                const currentClass = getCurrentAndNextCourse(todayCourses).currentClass;
                if (!currentClass) {
                    throw new Error('현재 진행 중인 수업을 찾을 수 없습니다.');
                }

                // 시작 시간과 종료 시간 가져오기
                const startTime = localStorage.getItem('monitoringClickTime');
                const now = new Date();
                const endTime = now.toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });

                // 출석 데이터
                const attendanceData = {
                    student_id: currentUser.id,
                    class_id: currentClass.c_id,
                    in_time: startTime,
                    out_time: endTime,
                    t_total: formatTimeFromSeconds(data.total_time)  // HH:MM 형식으로 변환
                };

                // 집중도 데이터
                const concentrationData = {
                    m_id: currentUser.id,
                    c_id: currentClass.c_id,
                    blk_score: Math.round(data.blink_points),
                    ht_score: Math.round(data.ht_point),
                    slp_score: Math.round(data.sleep_point),
                    not_matched: Math.round(100 - (data.front_time / data.total_time * 100)),
                    total: Math.round(data.total_score)
                };

                console.log('전송할 데이터:', {
                    출석: attendanceData,
                    집중도: concentrationData
                });

                const [attendanceResponse, concentrationResponse] = await Promise.all([
                    fetch(`${SERVER_URL}/api/save_attendance`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(attendanceData)
                    }),
                    fetch(`${SERVER_URL}/save_concentration`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(concentrationData)
                    })
                ]);

                // 응답 확인
                const [attendanceText, concentrationText] = await Promise.all([
                    attendanceResponse.text(),
                    concentrationResponse.text()
                ]);

                console.log('서버 응답:', {
                    출석: {
                        status: attendanceResponse.status,
                        text: attendanceText
                    },
                    집중도: {
                        status: concentrationResponse.status,
                        text: concentrationText
                    }
                });

                if (!attendanceResponse.ok || !concentrationResponse.ok) {
                    const errorDetails = {
                        출석: attendanceText ? JSON.parse(attendanceText) : null,
                        집중도: concentrationText ? JSON.parse(concentrationText) : null
                    };
                    throw new Error(`서버 응답 오류: ${JSON.stringify(errorDetails)}`);
                }

                // UI 업데이트
                updateFinalScoreDisplay(data);

            } catch (error) {
                console.error('데이터 저장 중 오류:', error);
                throw new Error(`데이터 저장 실패: ${error.message}`);
            }
        }
    }

    // 웹캠 스트림 시작 함수
    async function startWebcamStream() {
        const webcamImg = document.getElementById('webcam');
        const webcamContainer = document.querySelector('.webcam-container');
        
        if (!webcamImg || !webcamContainer) {
            console.error('웹캠 요소를 찾을 수 없습니다');
            return;
        }

        // 웹캠 컨테이너 스타일 설정
        webcamContainer.style.display = 'flex';
        webcamContainer.style.justifyContent = 'center';
        webcamContainer.style.alignItems = 'center';
        webcamContainer.style.height = '700px'; // 높이를 700px로 증가
        webcamContainer.style.position = 'relative';
        webcamContainer.style.overflow = 'hidden';
        webcamContainer.style.backgroundColor = '#1a1a1a';
        webcamContainer.style.borderRadius = '12px';
        webcamContainer.style.padding = '15px'; // 패딩 약간 증가
        webcamContainer.style.margin = '0 auto'; // 가운데 정렬
        webcamContainer.style.maxWidth = '1200px'; // 최대 너비 설정

        // 웹캠 이미지 스타일 설정
        webcamImg.style.width = '100%';
        webcamImg.style.height = '100%';
        webcamImg.style.objectFit = 'cover';
        webcamImg.style.borderRadius = '8px';
        webcamImg.style.margin = 'auto';

        try {
            if (window.electronAPI) {
                window.electronAPI.onMonitoringData((data) => {
                    if (data && data.frame) {
                        webcamImg.src = `data:image/jpeg;base64,${data.frame}`;
                        webcamImg.style.display = 'block';
                    }
                    
                    updateMonitoringUI(data);
                });

                webcamImg.onerror = (e) => {
                    console.error('웹캠 프레임 표시 실패:', e);
                };

            } else {
                throw new Error('electronAPI를 찾을 수 없습니다');
            }
        } catch (error) {
            console.error('웹캠 스트림 시작 오류:', error);
            alert('웹캠 스트림을 시작할 수 없습니다: ' + error.message);
        }
    }

    // 모니터링 시작/중단 버튼 이벤트
    monitoringBtn.addEventListener('click', async () => {
        if (!isMonitoring && !isPaused) {
            try {
                if (window.electronAPI) {
                    // 현재 수업이 있는지 확인
                    const currentClass = getCurrentAndNextCourse(todayCourses).currentClass;
                    if (!currentClass) {
                        throw new Error('현재 진행 중인 수업이 없습니다.');
                    }

                    // 버튼 클릭 시각을 24시간 형식으로 저장
                    const now = new Date();
                    const clickTime = now.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    
                    // 버튼 클릭 시각 저장
                    localStorage.setItem('monitoringClickTime', clickTime);
                    console.log('출석 시작 시각 저장:', clickTime);

                    await window.electronAPI.startMonitoring();
                    await startWebcamStream();
                    
                    monitoringBtn.querySelector('.btn-text').textContent = '출석 체크 중단';
                    statusIndicator.innerHTML = '<span style="color: #00bf9a">● Live</span>';
                    monitoringCard.classList.add('is-live');
                    isMonitoring = true;
                }
            } catch (error) {
                console.error('모니터링 시작 오류:', error);
                alert('모니터링을 시작할 수 없습니다: ' + error.message);
            }
        } else if (isMonitoring && !isPaused) {
            // 중지
            if (window.electronAPI) {
                try {
                    const startTime = localStorage.getItem('monitoringClickTime');
                    const now = new Date();
                    const endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    console.log('=== 출석 종료 ===');
                    console.log('저장된 시작 시각:', startTime);
                    console.log('종료 시각:', endTime);

                    // 현재 수업의 ID만 가져오기
                    const currentClass = getCurrentAndNextCourse(todayCourses).currentClass;
                    if (!currentClass) {
                        throw new Error('현재 진행 중인 수업이 없습니다.');
                    }

                    // 출석 데이터 생성 (순수 클릭 시각만 사용)
                    const attendanceData = {
                        m_id: currentUser.id,
                        c_id: currentClass.c_id,
                        in_time: startTime,    // localStorage에 저장된 클릭 시각
                        out_time: endTime      // 현재 클릭 시각
                    };

                    console.log('=== 전송할 출석 데이터 ===');
                    console.log(JSON.stringify(attendanceData, null, 2));

                    try {
                        const formData = new URLSearchParams();
                        formData.append('m_id', attendanceData.m_id);
                        formData.append('c_id', attendanceData.c_id);
                        formData.append('in_time', attendanceData.in_time);
                        formData.append('out_time', attendanceData.out_time);
                        formData.append('t_total', attendanceData.t_total);

                        const response = await fetch(`${SERVER_URL}/api/save_attendance`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: formData
                        });

                        const responseData = await response.json();
                        console.log('서버 응답:', responseData);

                        if (!response.ok) {
                            throw new Error(responseData.message || '출석 정보 저장에 실패했습니다.');
                        }

                        const totalScoreContent = totalScoreDisplay.querySelector('.total-score-content');
                        if (totalScoreContent) {
                            totalScoreContent.innerHTML = `
                                <div class="final-score-grid">
                                    <div class="final-score-item total">
                                        <span class="score-label">총점</span>
                                        <span class="score-value">${Math.round(data.total_score)}/100점</span>
                                    </div>
                                    <div class="final-score-item">
                                        <span class="score-label">수업 시간</span>
                                        <span class="score-value">${Math.round(data.total_time)}초</span>
                                    </div>
                                    <div class="final-score-item">
                                        <span class="score-label">정면 응시</span>
                                        <span class="score-value">${Math.round(data.front_time)}초</span>
                                    </div>
                                    <div class="final-score-item">
                                        <span class="score-label">졸음</span>
                                        <span class="score-value">${Math.round(data.sleep_point)}/50점</span>
                                    </div>
                                    <div class="final-score-item">
                                        <span class="score-label">고개 돌림</span>
                                        <span class="score-value">${Math.round(data.ht_point)}/30점</span>
                                    </div>
                                    
                                    <div class="final-score-item">
                                        <span class="score-label">눈 깜빡임</span>
                                        <span class="score-value">${Math.round(data.blink_points)}/0점</span>
                                    </div>
                                    <div class="final-score-item">
                                        <span class="score-label">눈 깜빡임 횟수</span>
                                        <span class="score-value">${data.blink_count}회</span>
                                    </div>
                                </div>
                            `;
                            totalScoreDisplay.style.display = 'block';
                            totalScoreDisplay.scrollIntoView({ behavior: 'smooth' });
                        }
                        // 성공적으로 저장된 경우에만 모니터링 중지
                        window.electronAPI.stopMonitoring();
                        localStorage.removeItem('monitoringClickTime');
                        
                        // 웹캠 스트림 중지
                        const webcamImg = document.getElementById('webcam');
                        const webcamContainer = document.querySelector('.webcam-container');
                        
                        if (webcamImg) {
                            webcamImg.src = '';
                            webcamImg.style.display = 'none';
                        }
                        
                        // 컨테이너 스타일 초기화
                        if (webcamContainer) {
                            webcamContainer.style.display = 'block';
                        }
                        
                        monitoringBtn.querySelector('.btn-text').textContent = '출석 체크 시작';
                        statusIndicator.innerHTML = '<span style="color: #666">● Offline</span>';
                        monitoringCard.classList.remove('is-live');
                        isMonitoring = false;

                    } catch (error) {
                        console.error('서버 통신 오류:', error);
                        throw new Error('출석 정보 저장에 실패했습니다: ' + error.message);
                    }
                } catch (error) {
                    console.error('출석 정보 저장 중 오류:', error);
                    alert(error.message);
                }
            }
        }
    });

    // 강의 종료 (최종 결과 표시) 버튼 이벤트 수정
    finishLectureBtn.addEventListener('click', async () => {
        try {
            if (window.electronAPI) {
                // 파이썬 프로세스에 종료 신호 전송 (ESC 키 시뮬레이션)
                await window.electronAPI.sendEscapeSignal();
                
                // 최종 점수 요청
                await window.electronAPI.showFinalScore();
                
                // 모니터링 중이었다면 상태 초기화
                if (isMonitoring) {
                    isMonitoring = false;
                    isPaused = false;
                    monitoringBtn.querySelector('.btn-text').textContent = '출석 체크 시작';
                    
                    // 웹캠 스트림 중지
                    const webcamImg = document.getElementById('webcam');
                    if (webcamImg) {
                        webcamImg.src = '';
                        webcamImg.style.display = 'none';
                    }
                    
                    // 모니터링 상태 업데이트
                    statusIndicator.innerHTML = '<span style="color: #666">● Offline</span>';
                    monitoringCard.classList.remove('is-live');
                }
            }
        } catch (error) {
            console.error('강의 종료 처리 중 오류:', error);
            alert('강의 종료 처리 중 오류가 발생했습니다: ' + error.message);
        }
    });

    function stopMonitoring() {
        if (window.electronAPI) {
            window.electronAPI.stopMonitoring();
            
            const webcamImg = document.getElementById('webcam');
            const webcamContainer = document.querySelector('.webcam-container');
            
            if (webcamImg) {
                webcamImg.src = '';
                webcamImg.style.display = 'none';
            }
            
            // 컨테이너 스타일 초기화
            if (webcamContainer) {
                webcamContainer.style.display = 'block';
            }
            
            monitoringBtn.querySelector('.btn-text').textContent = '출석 체크 시작';
            statusIndicator.innerHTML = '<span style="color: #666">● Offline</span>';
            monitoringCard.classList.remove('is-live');
            isMonitoring = false;
        }
    }
  }

  // 출석 기록 초기화
  function initializeAttendanceRecords() {
    // const attendanceRecords = [
    //   {
    //     date: '2024-03-15',
    //     course: 'CS101',
    //     courseName: '컴퓨터개론',
    //     checkIn: '09:00',
    //     checkOut: '10:30',
    //     duration: '1시간 30분',
    //     status: 'present'
    //   },
    //   // 더 많은 기록 추가...
    // ];

    const tbody = document.querySelector('.attendance-table tbody');
    if (!tbody) return;

    function updateAttendanceTable(records) {
      tbody.innerHTML = records.map(record => `
        <tr>
          <td>${record.date}</td>
          <td>${record.courseName}</td>
          <td>${record.checkIn}</td>
          <td>${record.checkOut}</td>
          <td>${record.duration}</td>
          <td>
            <span class="status-badge ${record.status}">
              ${record.status === 'present' ? '출석' : 
                record.status === 'late' ? '지각' : '결석'}
            </span>
          </td>
        </tr>
      `).join('');
    }

    // 과목 필터링
    const courseFilter = document.getElementById('courseFilter');
    courseFilter.addEventListener('change', (e) => {
      const selectedCourse = e.target.value;
      const filteredRecords = selectedCourse ? 
        attendanceRecords.filter(record => record.course === selectedCourse) :
        attendanceRecords;
      updateAttendanceTable(filteredRecords);
    });

    // 초기 테이블 표시
    updateAttendanceTable(attendanceRecords);
  }

  // 출석 차트 초기화
  function initializeAttendanceChart() {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;

    const attendanceChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['3/11', '3/12', '3/13', '3/14', '3/15', '3/16', '3/17'],
        datasets: [
          {
            label: '출석',
            data: [1, 1, 1, 1, 1, 0, 0],
            backgroundColor: '#4CAF50',
            borderColor: '#4CAF50',
            borderWidth: 1
          },
          {
            label: '지각',
            data: [0, 0, 0, 0, 0, 0, 0],
            backgroundColor: '#FFC107',
            borderColor: '#FFC107',
            borderWidth: 1
          },
          {
            label: '결석',
            data: [0, 0, 0, 0, 0, 0, 0],
            backgroundColor: '#F44336',
            borderColor: '#F44336',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: {
              display: false
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: 1,
            ticks: {
              stepSize: 1
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });

    // 필터 이벤트 리스너
    document.getElementById('chartCourseFilter')?.addEventListener('change', (e) => {
      updateChartData(e.target.value, document.getElementById('chartPeriodFilter').value);
    });

    document.getElementById('chartPeriodFilter')?.addEventListener('change', (e) => {
      updateChartData(document.getElementById('chartCourseFilter').value, e.target.value);
    });

    function updateChartData(course, period) {
      // 여기에 실제 데이터를 가져오는 로직 구현
      console.log(`Updating chart for course: ${course}, period: ${period}`);
    }
  }   

  // 초기화 함수 호출
  initializeStudentMonitoring();
  initializeAttendanceRecords();
}); 