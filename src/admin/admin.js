document.addEventListener('DOMContentLoaded', () => {
  // 로그인 체크
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser || currentUser.userType !== 'professor') {
    alert('교수 계정으로 로그인해주세요.');
    window.location.href = '../login/index.html';
    return;
  }

  // 교수 정보 표시
  document.getElementById('professorName').textContent = currentUser.name;
  document.getElementById('professorId').textContent = currentUser.id;
  document.getElementById('department').textContent = currentUser.department;
  document.getElementById('office').textContent = currentUser.office;

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
        <h4>교수 정보</h4>
      </div>
      <div class="profile-details">
        <p><strong>이름:</strong> ${currentUser.name}</p>
        <p><strong>교수번호:</strong> ${currentUser.id}</p>
        <p><strong>학과:</strong> ${currentUser.department}</p>
        <p><strong>연구실:</strong> ${currentUser.office}</p>
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
      type: 'bar',
      data: {
        labels: ['컴퓨터개론', '프로그래밍기초', '자료구조'],
        datasets: [{
          label: '수강 인원',
          data: [25, 15, 30],
          backgroundColor: '#e14eca',
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
            beginAtZero: true,
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
  const themeInputs = document.querySelectorAll('input[name="theme"]');
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

  // 수업 등록 폼 제출 처리
  const classRegisterForm = document.getElementById('class-register-form');
  if (classRegisterForm) {
    classRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const courseData = {
        courseCode: document.getElementById('courseCode').value,
        courseName: document.getElementById('courseName').value,
        timeSlot: `${document.getElementById('daySelect').value} ${document.getElementById('startTime').value}-${document.getElementById('endTime').value}`,
        capacity: document.getElementById('capacity').value,
        professorId: currentUser.id
      };

      try {
        await registerCourse(courseData);
        alert('수업이 성공적으로 등록되었습니다.');
        classRegisterForm.reset();
      } catch (error) {
        alert('수업 등록에 실패했습니다.');
        console.error(error);
      }
    });
  }

  // 모니터링 초기화
  initializeMonitoring();

  // 모달 관련 요소들
  const modal = document.getElementById('detailModal');
  const closeModalBtn = document.querySelector('.close-modal');
  const modalGroupTitle = document.getElementById('modalGroupTitle');

  // 상세정보 버튼 이벤트 리스너 추가
  document.querySelectorAll('.camera-feed').forEach(feed => {
    const detailBtn = feed.querySelector('.btn-primary');
    if (detailBtn) {  // null 체크 추가
      const groupName = feed.querySelector('.camera-header h3').textContent.split(' - ')[0];
      detailBtn.addEventListener('click', () => {
        openModal(feed, groupName);
      });
    }
  });

  // 모달 닫기 이벤트 리스너들
  if (closeModalBtn) {  // null 체크 추가
    closeModalBtn.addEventListener('click', () => {
      closeModal();
    });
  }

  // 모달 외부 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // 모달 관련 변수들
  let currentStream = null;
  let isRecognizing = false;

  // 모달 열기 함수 수정
  function openModal(feed, groupName) {
    modalGroupTitle.textContent = groupName;
    
    // 웹캠 시작
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        currentStream = stream;
        const video = document.getElementById('modalCamera');
        video.srcObject = stream;
      })
      .catch(console.error);

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // 모달 닫기 함수 수정
  function closeModal() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    modal.classList.remove('active');
    document.body.style.overflow = '';
    isRecognizing = false;
  }

  // 객체 캡처 버튼
  document.getElementById('captureBtn').addEventListener('click', () => {
    const video = document.getElementById('modalCamera');
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');

    // 현재 프레임 캡처
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  });

  // 객체 인식 버튼
  document.getElementById('recognizeBtn').addEventListener('click', () => {
    isRecognizing = !isRecognizing;
    const btn = document.getElementById('recognizeBtn');
    
    if (isRecognizing) {
      btn.classList.add('active');
      startRecognition();
    } else {
      btn.classList.remove('active');
      stopRecognition();
    }
  });

  // 객체 인식 시작
  function startRecognition() {
    const video = document.getElementById('modalCamera');
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');

    function processFrame() {
      if (!isRecognizing) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 프레임 데이터를 서버로 전송
      canvas.toBlob(blob => {
        const formData = new FormData();
        formData.append('frame', blob);
        
        fetch('http://localhost:5000/api/monitor', {
          method: 'POST',
          body: formData
        })
        .then(response => response.json())
        .then(data => {
          drawDetections(ctx, data.tracks);
        })
        .catch(console.error);
      }, 'image/jpeg');

      requestAnimationFrame(processFrame);
    }

    processFrame();
  }

  // 객체 인식 중지
  function stopRecognition() {
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // 검출 결과 그리기
  function drawDetections(ctx, tracks) {
    tracks.forEach(track => {
      const [x1, y1, x2, y2] = track.bbox;
      
      ctx.strokeStyle = track.id in tracker.current_matches ? '#00bf9a' : '#fd5d93';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(`ID: ${track.id}`, x1, y1 - 5);
    });
  }

  // 모달 내용 업데이트 함수
  function updateModalContent(data) {
    // 멤버 목록 업데이트
    const memberList = document.getElementById('modalMemberList');
    if (memberList) {
      memberList.innerHTML = data.members.map(member => `
        <div class="member-item ${member.status}">
          <div class="member-info">
            <span class="material-icons">account_circle</span>
            <div class="member-details">
              <h4>${member.name}</h4>
              <p>${member.duration} 동안 ${member.status === 'present' ? '자리에 있음' : '자리 이탈'}</p>
            </div>
          </div>
          <div class="status-indicator">●</div>
        </div>
      `).join('');
    }

    // 활동 로그 업데이트
    const activityLog = document.getElementById('modalActivityLog');
    if (activityLog) {
      activityLog.innerHTML = data.activities.map(activity => `
        <div class="activity-item">
          <span class="time">${activity.time}</span>
          <span class="event">${activity.event}</span>
        </div>
      `).join('');
    }
  }
});

// 모니터링 관련 기능
function initializeMonitoring() {
  // 모든 조 데이터 초기화
  const groups = [
    {
      id: 1,
      name: "1조",
      location: "공학관 401호",
      members: [
        { id: "2024001", name: "홍길동", status: "active", duration: "2시간 30분", position: "자리 1" },
        { id: "2024002", name: "김철수", status: "active", duration: "2시간 15분", position: "자리 2" },
        { id: "2024003", name: "이영희", status: "inactive", duration: "1시간 전 퇴실", position: "자리 3" },
        { id: "2024004", name: "박지성", status: "active", duration: "1시간 45분", position: "자리 4" }
      ]
    },
    {
      id: 2,
      name: "2조",
      location: "공학관 402호",
      members: [
        { id: "2024005", name: "김영희", status: "active", duration: "1시간 20분", position: "자리 1" },
        { id: "2024006", name: "이철수", status: "active", duration: "1시간 15분", position: "자리 2" },
        { id: "2024007", name: "박미영", status: "active", duration: "50분", position: "자리 3" }
      ]
    },
    // 3~6조도 비슷한 형식으로 추가
  ];

  // 조 선택 이벤트 처리
  const groupSelect = document.getElementById('groupSelect');
  const detailsPanel = document.querySelector('.monitoring-details');
  const monitoringContainer = document.querySelector('.monitoring-container');

  groupSelect.addEventListener('change', (e) => {
    const selectedGroupId = e.target.value;
    if (selectedGroupId) {
      // 단일 조 보기 모드
      monitoringContainer.classList.add('single-group-mode');
      const selectedGroup = groups.find(g => g.id === parseInt(selectedGroupId));
      updateCameraGrid([selectedGroup], true);
      updateDetailsPanel(selectedGroup);
      detailsPanel.classList.add('active');
    } else {
      // 전체 조 보기 모드
      monitoringContainer.classList.remove('single-group-mode');
      updateCameraGrid(groups, false);
      detailsPanel.classList.remove('active');
    }
  });

  // 카메라 그리드 업데이트 함수
  function updateCameraGrid(groupsToShow, isSingleGroup) {
    const cameraGrid = document.querySelector('.camera-grid');
    cameraGrid.innerHTML = groupsToShow.map(group => `
      <div class="camera-feed ${isSingleGroup ? 'large' : ''}" data-group="${group.id}">
        <div class="camera-header">
          <h3>${group.name} - ${group.location}</h3>
          <span class="status active">● Live</span>
        </div>
        <div class="camera-view">
          <video id="camera${group.id}" autoplay muted></video>
          <div class="detection-overlay">
            ${group.members.map(member => `
              <div class="member-position ${member.status}" 
                   style="position: absolute; ${getPositionStyle(member.position)}">
                <span class="member-name">${member.name}</span>
                ${isSingleGroup ? `<span class="member-status">${member.status === 'active' ? '접속 중' : '퇴실'}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="camera-footer">
          <div class="footer-info">
            <span class="members-count">${group.members.filter(m => m.status === 'active').length}명 접속 중</span>
            ${!isSingleGroup ? `<span class="location">${group.location}</span>` : ''}
          </div>
          ${!isSingleGroup ? `<button class="btn btn-small btn-primary view-details">상세정보</button>` : ''}
        </div>
      </div>
    `).join('');

    simulateCameraFeed();
    if (!isSingleGroup) {
      attachDetailButtonListeners();
    }
  }

  // 멤버 위치 스타일 계산 함수
  function getPositionStyle(position) {
    // 예시 위치 계산 (실제로는 더 정교한 계산이 필요)
    const positions = {
      '자리 1': 'left: 20%; top: 20%;',
      '자리 2': 'left: 50%; top: 20%;',
      '자리 3': 'left: 20%; top: 60%;',
      '자리 4': 'left: 50%; top: 60%;'
    };
    return positions[position] || '';
  }

  // 상세정보 패널 업데이트 함수
  function updateDetailsPanel(group) {
    const activeMembers = group.members.filter(m => m.status === 'active');
    
    document.querySelector('.details-header h2').textContent = `${group.name} 상세정보`;
    document.querySelector('.group-stats').innerHTML = `
      <div class="stat-item">
        <h4>현재 인원</h4>
        <div class="value">${activeMembers.length}/${group.members.length}</div>
      </div>
      <div class="stat-item">
        <h4>위치</h4>
        <div class="value">${group.location}</div>
      </div>
    `;
    
    const memberList = document.querySelector('.member-list');
    memberList.innerHTML = `
      <h3>조원 현황</h3>
      ${group.members.map(member => `
        <div class="member-item ${member.status}">
          <div class="member-info">
            <span class="material-icons">account_circle</span>
            <div class="member-details">
              <h4>${member.name}</h4>
              <p>${member.status === 'active' ? 
                 `${member.duration} 째 ${member.position}에 있음` : 
                 member.duration}</p>
            </div>
          </div>
          <div class="status-indicator">●</div>
        </div>
      `).join('')}
    `;
  }

  // 상세정보 버튼 이벤트 리스너 연결 함수
  function attachDetailButtonListeners() {
    const viewDetailsButtons = document.querySelectorAll('.view-details');
    viewDetailsButtons.forEach(button => {
      button.addEventListener('click', function() {
        const groupId = this.closest('.camera-feed').dataset.group;
        const group = groups.find(g => g.id === parseInt(groupId));
        updateDetailsPanel(group);
        document.querySelector('.monitoring-details').classList.add('active');
      });
    });
  }

  // 가상의 카메라 피드 시뮬레이션 (테스트용)
  function simulateCameraFeed() {
    const cameras = document.querySelectorAll('.camera-view video');
    cameras.forEach(camera => {
      // 테스트용 캔버스로 가상 비디오 생성
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 640;
      canvas.height = 360;
      
      setInterval(() => {
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#666';
        ctx.font = '20px Arial';
        ctx.fillText('Camera Feed Simulation', 20, 180);
        
        // 캔버스를 비디오 소스로 사용
        camera.srcObject = canvas.captureStream();
      }, 1000/30); // 30fps
    });
  }

  simulateCameraFeed();
}

// ReID 모니터링 기능
function initializeReidMonitoring(groupId, classId) {
  const video = document.getElementById(`camera${groupId}`);
  const canvas = document.getElementById(`detectionCanvas${groupId}`);
  const ctx = canvas.getContext('2d');
  
  // 웹캠 스트림 설정
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
      
      // 프레임 처리
      setInterval(() => {
        // 캔버스에 현재 비디오 프레임 그리기
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 프레임 데이터를 서버로 전송
        const formData = new FormData();
        canvas.toBlob(blob => {
          formData.append('frame', blob);
          formData.append('groupId', groupId);
          formData.append('classId', classId);
          
          fetch('http://localhost:5000/api/monitor', {
            method: 'POST',
            body: formData
          })
          .then(response => response.json())
          .then(data => {
            updateDetectionDisplay(data, groupId);
          })
          .catch(console.error);
        }, 'image/jpeg');
      }, 1000/30); // 30fps
    })
    .catch(console.error);
}

// 검출 결과 표시 업데이트
function updateDetectionDisplay(data, groupId) {
  const trackedPersonsDiv = document.querySelector(`#camera${groupId} .tracked-persons`);
  const presentCount = document.querySelector(`#camera${groupId} #presentCount`);
  const absentCount = document.querySelector(`#camera${groupId} #absentCount`);
  
  // 추적된 사람들 표시
  trackedPersonsDiv.innerHTML = data.tracks.map(track => `
    <div class="tracked-person ${track.id in data.matched_ids ? 'matched' : ''}">
      <span class="material-icons">person</span>
      <span>ID: ${data.matched_ids[track.id] || track.id}</span>
    </div>
  `).join('');
  
  // 출석 카운트 업데이트
  presentCount.textContent = Object.keys(data.matched_ids).length;
  absentCount.textContent = data.tracks.length - Object.keys(data.matched_ids).length;
} 