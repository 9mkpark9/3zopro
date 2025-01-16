document.addEventListener('DOMContentLoaded', () => {
  // 로그인 체크
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser || currentUser.userType !== 'student') {
    alert('학생 계정으로 로그인해주세요.');
    window.location.href = '../login/index.html';
    return;
  }

  // 학생 정보 표시
  document.getElementById('studentName').textContent = currentUser.name;
  document.getElementById('studentId').textContent = currentUser.id;
  document.getElementById('department').textContent = currentUser.department;
  document.getElementById('grade').textContent = currentUser.grade;

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
        <p><strong>학년:</strong> ${currentUser.grade}</p>
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
    const ctx = document.createElement('canvas');
    document.querySelector('.chart-area').appendChild(ctx);

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
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
  });

  // 콘텐츠 영역 클릭시 사이드바 닫기
  document.querySelector('.main-panel').addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('active');
    }
  });

  // 학생 모니터링 기능 수정
  function initializeStudentMonitoring() {
    // 현재 수업 시간 확인 함수
    function checkClassTime() {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDay = now.getDay(); // 0: 일요일, 1: 월요일, ...

      // 수업 시간표 (예시)
      const classSchedule = [
        { day: 1, start: '09:00', end: '10:30' }, // 월요일 수업
        { day: 3, start: '09:00', end: '10:30' }, // 수요일 수업
        { day: 2, start: '13:00', end: '14:30' }, // 화요일 수업
        { day: 4, start: '13:00', end: '14:30' }  // 목요일 수업
      ];

      // 현재 시간이 수업 시간인지 확인
      return classSchedule.some(schedule => {
        if (schedule.day !== currentDay) return false;

        const [startHour, startMinute] = schedule.start.split(':').map(Number);
        const [endHour, endMinute] = schedule.end.split(':').map(Number);
        
        const currentTime = currentHour * 60 + currentMinute;
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;

        return currentTime >= startTime && currentTime <= endTime;
      });
    }

    // 웹캠 및 라이브 상태 관리
    const video = document.getElementById('webcam');
    const webcamContainer = document.querySelector('.webcam-container');
    const monitoringCard = document.querySelector('.monitoring-card');
    const statusIndicator = monitoringCard.querySelector('.status');
    let stream = null;

    function updateLiveStatus() {
      const isClassTime = checkClassTime();
      statusIndicator.innerHTML = isClassTime ? 
        '● Live' : 
        '<span style="color: #666">● Offline</span>';
      
      if (isClassTime) {
        // 수업 시간일 때 웹캠 활성화
        if (!stream && navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia({ video: true })
            .then(videoStream => {
              stream = videoStream;
              video.srcObject = stream;
              webcamContainer.classList.add('face-detected');
              monitoringCard.classList.add('is-live');
            })
            .catch(err => {
              console.error('웹캠 접근 실패:', err);
              webcamContainer.classList.add('face-not-detected');
            });
        }
      } else {
        // 수업 시간이 아닐 때 웹캠 비활성화
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
          video.srcObject = null;
        }
        webcamContainer.classList.remove('face-detected', 'face-not-detected');
        monitoringCard.classList.remove('is-live');
        document.querySelector('.status-text').textContent = '수업 시간이 아닙니다';
      }
    }

    // 1분마다 수업 시간 체크
    updateLiveStatus();
    setInterval(updateLiveStatus, 60000);

    // 얼굴 감지 시뮬레이션 (수업 시간일 때만 작동)
    setInterval(() => {
      if (!checkClassTime() || !stream) return;

      const isDetected = Math.random() > 0.1;
      webcamContainer.classList.toggle('face-detected', isDetected);
      webcamContainer.classList.toggle('face-not-detected', !isDetected);
      
      document.querySelector('.status-text').textContent = 
        isDetected ? '얼굴 인식됨' : '얼굴을 찾을 수 없음';
      
      const attendanceStatus = document.getElementById('attendanceStatus');
      attendanceStatus.textContent = isDetected ? '정상 출석중' : '자리 이탈';
      attendanceStatus.style.color = isDetected ? '#00bf9a' : '#fd5d93';

      // 시간 카운터 업데이트
      document.getElementById('currentDuration').style.color = 
        isDetected ? '#00bf9a' : '#fd5d93';
      document.getElementById('totalDuration').style.color = 
        isDetected ? '#00bf9a' : '#666';
    }, 3000);
  }

  // 모니터링 초기화
  initializeStudentMonitoring();

  // 출석 기록 초기화
  function initializeAttendanceRecords() {
    const attendanceRecords = [
      {
        date: '2024-03-15',
        course: 'CS101',
        courseName: '컴퓨터개론',
        checkIn: '09:00',
        checkOut: '10:30',
        duration: '1시간 30분',
        status: 'present'
      },
      // 더 많은 기록 추가...
    ];

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

  // DOM 로드 시 초기화
  document.addEventListener('DOMContentLoaded', () => {
    // 기존 코드...
    initializeAttendanceRecords();
  });
}); 