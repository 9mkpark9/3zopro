let isLectureActive = false;

document.addEventListener('DOMContentLoaded', () => {
  // 로그인 체크
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));

  // 교수 정보 표시
  document.getElementById('professorName').textContent = currentUser.name;
  document.getElementById('professorId').textContent = currentUser.id;
  document.getElementById('department').textContent = currentUser.department;
  document.getElementById('office').textContent = currentUser.office;

  // profile-card 정보 업데이트 수정
  const profileCardName = document.querySelector('.profile-card .profile-info h3');
  const profileCardId = document.querySelector('.profile-card .profile-info .professor-id');
  const profileCardDepartment = document.querySelector('.profile-card .profile-info .department');
  const profileCardOffice = document.querySelector('.profile-card .profile-info .office');

  if (profileCardName) profileCardName.textContent = ` ${currentUser.name}`;
  if (profileCardId) profileCardId.textContent = ` ${currentUser.id}`;
  if (profileCardDepartment) profileCardDepartment.textContent = ` ${currentUser.department}`;
  if (profileCardOffice) profileCardOffice.textContent = ` ${currentUser.office}`;

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

  // 저장된 테마 불러오기
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('light-mode', savedTheme === 'light');
  document.querySelector(`input[value="${savedTheme}"]`).checked = true;

  // 테마 변경 이벤트
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const isLight = e.target.value === 'light';
      document.body.classList.toggle('light-mode', isLight);
      localStorage.setItem('theme', e.target.value);
    });
  });

  // 페이지 전환 기능
  const menuItems = document.querySelectorAll('.sidebar-nav li');
  const pages = document.querySelectorAll('.page');

  function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-nav li').forEach(item => {
        item.classList.remove('active');
    });

    const newPage = document.getElementById(`${pageId}-page`);
    const navItem = document.querySelector(`.sidebar-nav li[data-page="${pageId}"]`);

    if (newPage) newPage.classList.add('active');
    if (navItem) navItem.classList.add('active');

    // 성적 관리 페이지로 전환 시 데이터 로드
    if (pageId === 'grades') {
        const courseSelect = document.getElementById('courseSelect');
        if (courseSelect && window.gradeManager) {
            window.gradeManager.loadGradeData(courseSelect.value);
        }
    }
  }

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      switchPage(pageId);
    });
  });

  // 모니터링 초기화
  initializeMonitoring();

  // 모달 관련 요소들
  const modal = document.getElementById('detailModal');
  const closeModalBtn = modal.querySelector('.close-modal');  // 선택자 수정
  const modalGroupTitle = document.getElementById('modalGroupTitle');

  // 상세정보 버튼 이벤트 리스너 수정
  document.querySelectorAll('.camera-feed').forEach(feed => {
    const detailBtn = feed.querySelector('.btn-primary');
    if (detailBtn) {
      const groupName = feed.querySelector('.camera-header h3').textContent.split(' - ')[0];
      detailBtn.addEventListener('click', async () => {
        try {
          // 모달 열기
          openModal(feed, groupName);
          
          // ReID 프레임 업데이트 시작
          startReidDisplay();
          
        } catch (error) {
          console.error('모니터링 화면 전환 중 오류:', error);
          alert(error.message || '모니터링 화면을 불러오는데 실패했습니다.');
        }
      });
    }
  });

  // 모달 닫기 이벤트 리스너들
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.remove('active');  // style.display 대신 classList 사용
      
      // 웹캠 스트림 정리
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
      }

      // 업데이트 중지
      if (window.modalUpdateInterval) {
        clearInterval(window.modalUpdateInterval);
        window.modalUpdateInterval = null;
      }

      document.body.style.overflow = '';
    });
  }

  // 모달 외부 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
      modal.classList.remove('active');  // style.display 대신 classList 사용
      
      // 웹캠 스트림 정리
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
      }

      // 업데이트 중지
      if (window.modalUpdateInterval) {
        clearInterval(window.modalUpdateInterval);
        window.modalUpdateInterval = null;
      }

      document.body.style.overflow = '';
    }
  });

  // 모달 관련 변수들
  let currentStream = null;

  // 모달 열기 함수 수정
  function openModal(feed, groupName) {
    const modal = document.getElementById('detailModal');
    const modalGroupTitle = document.getElementById('modalGroupTitle');
    modalGroupTitle.textContent = groupName;
    
    // 모달 초기화
    const memberList = document.getElementById('modalMemberList');
    const activityLog = document.getElementById('modalActivityLog');
    if (memberList) memberList.innerHTML = '';
    if (activityLog) activityLog.innerHTML = '';
    
    // 웹캠 시작
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            currentStream = stream;
            const video = document.getElementById('modalCamera');
            video.srcObject = stream;
        })
        .catch(console.error);

    modal.classList.add('active');  // style.display 대신 classList 사용
    document.body.style.overflow = 'hidden';

    // 데이터 업데이트 시작
    startModalUpdates();
  }

  // 모달 데이터 업데이트 함수 수정
  function startModalUpdates() {
    if (window.modalUpdateInterval) {
        clearInterval(window.modalUpdateInterval);
    }

    window.modalUpdateInterval = setInterval(async () => {
        const modal = document.getElementById('detailModal');
        if (modal && modal.classList.contains('active')) {  // style.display 대신 classList 사용
            try {
                const result = await reidManager.getLatestData();
                if (result.success) {
                    // 이전 데이터와 비교하여 변경사항이 있을 때만 업데이트
                    const currentData = JSON.stringify({
                        members: result.members,
                        stats: result.stats,
                        activities: result.activities
                    });
                    
                    if (window.lastModalData !== currentData) {
                        updateModalContent(result);
                        window.lastModalData = currentData;
                    }
                }
            } catch (error) {
                console.error('모달 데이터 업데이트 오류:', error);
            }
        }
    }, 1000); // 통계 및 로그 업데이트는 더 긴 주기로
  }

  // 모달 닫기 함수 수정
  function closeModal() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    // 업데이트 중지
    if (window.modalUpdateInterval) {
        clearInterval(window.modalUpdateInterval);
        window.modalUpdateInterval = null;
    }

    const modal = document.getElementById('detailModal');
    modal.classList.remove('active');  // style.display 대신 classList 사용
    document.body.style.overflow = '';
  }

  // 객체 캡처 버튼
  document.getElementById('captureBtn').addEventListener('click', async () => {
    try {
      const result = await reidManager.captureObjects();
      if (result.success) {
        // 성공 알림 표시
        showNotification('객처 캡처 성공', 'success');
      } else {
        // 실패 알림 표시
        showNotification(result.error, 'error');
      }
    } catch (error) {
      console.error('Capture error:', error);
      showNotification('객처 캡처 중 오류가 발생했습니다.', 'error');
    }
  });

  // 객체 인식 버튼 이벤트 리스너 수정
  document.getElementById('recognizeBtn').addEventListener('click', async () => {
    try {
      const result = await reidManager.recognizeObjects();
      if (result.success) {
        showNotification('객체 인식 성공', 'success');
      } else {
        showNotification(result.error, 'error');
      }
    } catch (error) {
      console.error('Recognition error:', error);
      showNotification('객체 인식 중 오류가 발생했습니다.', 'error');
    }
  });

  // 모달 내용 업데이트 함수
  function updateModalContent(data) {
    if (!data) return;

    // 통계 정보 업데이트
    if (data.stats) {
        const statsMapping = {
            totalMembers: 'total_members',
            presentMembers: 'present_members',
            avgDuration: 'avg_duration'
        };

        const elements = {
            totalMembers: document.getElementById('modalTotalMembers'),
            presentMembers: document.getElementById('modalPresentMembers'),
            avgDuration: document.getElementById('modalAvgDuration')
        };

        Object.entries(elements).forEach(([key, element]) => {
            if (element) {
                const dataKey = statsMapping[key];
                const value = data.stats[dataKey];
                
                if (value !== undefined) {
                    const newValue = key === 'avgDuration' ? value : `${value}명`;
                    
                    if (element.textContent !== newValue) {
                        element.textContent = newValue;
                    }

                    // totalMembers에 클릭 이벤트 추가
                    if (key === 'totalMembers') {
                        element.style.cursor = 'pointer';
                        element.classList.add('clickable');
                        element.onclick = showMaxMembersModal; // 직접 onclick 이벤트 할당
                    }
                } else {
                    const defaultValue = key === 'avgDuration' ? '0분' : '0명';
                    element.textContent = defaultValue;
                }
            }
        });
    }

    // 멤버 목록 업데이트
    if (data.members) {
        const memberList = document.getElementById('modalMemberList');
        if (memberList) {
            // 기존 멤버 데이터와 새로운 데이터 비교
            const currentMembers = Array.from(memberList.children).map(item => ({
                id: item.querySelector('.edit-name-btn')?.dataset.id,
                student_id: item.querySelector('.edit-name-btn')?.dataset.studentId,
                status: item.querySelector('.status')?.textContent.trim(),
                duration: item.querySelector('.student-id')?.textContent.replace('체류시간: ', '').trim()
            }));

            const newMembers = data.members.map(member => ({
                id: member.id,
                student_id: member.student_id || '미지정',
                status: member.status || '미인식',
                duration: member.duration || '0분'
            }));

            // 데이터가 실제로 변경되었는지 확인
            const hasChanged = JSON.stringify(currentMembers) !== JSON.stringify(newMembers);

            if (hasChanged) {
                const newMemberList = data.members.map(member => `
                    <div class="member-item ${member.status === '출석' ? 'present' : 'absent'}">
                        <div class="member-info">
                            <span class="material-icons">account_circle</span>
                            <div class="info">
                                <div class="name-container">
                                    <span class="name">학번: ${member.student_id || '미지정'}</span>
                                    <button class="edit-name-btn" data-id="${member.id}" data-student-id="${member.student_id || ''}">
                                        <span class="material-icons">edit</span>
                                    </button>
                                </div>
                                <span class="student-id">체류시간: ${member.duration || '0분'}</span>
                            </div>
                        </div>
                        <span class="status ${member.status === '출석' ? 'present' : 'absent'}">
                            ${member.status || '미인식'}
                        </span>
                    </div>
                `).join('');

                memberList.innerHTML = newMemberList;

                // 수정 버튼에 이벤트 리스너 추가
                memberList.querySelectorAll('.edit-name-btn').forEach(button => {
                    button.addEventListener('click', () => {
                        const id = button.dataset.id;
                        const currentStudentId = button.dataset.studentId;
                        editMemberName(id, currentStudentId);
                    });
                });
            }
        }
    }

    // 활동 로그 업데이트
    const activityLog = document.getElementById('modalActivityLog');
    if (activityLog && data.activities?.length > 0) {
        const wasAtBottom = activityLog.scrollHeight - activityLog.clientHeight <= activityLog.scrollTop + 1;
        
        const newLogs = data.activities.map(activity => `
            <div class="activity-item">
                <span class="time">${activity.timestamp || activity.time || ''}</span>
                <span class="event">학번 ${activity.student_id || ''} ${activity.event || ''}</span>
            </div>
        `).join('');

        // 변경사항이 있을 때만 DOM 업데이트
        if (activityLog.innerHTML !== newLogs) {
            activityLog.innerHTML = newLogs;
            
            // 이전에 스크롤이 맨 아래였을 때만 자동 스크롤
            if (wasAtBottom) {
                activityLog.scrollTop = activityLog.scrollHeight;
            }
        }
    }
  }

  // 강의 시작/종료 버튼 이벤트 리스너 수정
  const startLectureBtn = document.getElementById('startLecture');
  const endLectureBtn = document.getElementById('endLecture');

  function updateStartButtonState(currentClass) {
    if (!currentClass) {
      startLectureBtn.disabled = true;
      startLectureBtn.title = "현재 진행 중인 수업이 없습니다";
      return;
    }

    // 수업이 이미 완료된 경우
    if (currentClass.status === '완료') {
      startLectureBtn.disabled = true;
      startLectureBtn.title = "이미 종료된 수업입니다";
      return;
    }

    const now = new Date().getTime();
    const [startTime] = getClassTimeRange(currentClass.class_time);
    const activationTime = startTime - (10 * 60 * 1000); // 수업 시작 10분 전

    // 디버깅을 위한 시간 정보 출력
    console.log('수업:', currentClass.c_name);
    console.log('수업 상태:', currentClass.status);
    console.log('현재 시간:', new Date(now).toLocaleTimeString());
    console.log('수업 시작 시간:', new Date(startTime).toLocaleTimeString());
    console.log('버튼 활성화 시간:', new Date(activationTime).toLocaleTimeString());
    console.log('버튼 활성화 조건:', now >= activationTime && now <= startTime);

    if (now >= activationTime && now <= startTime) {
      startLectureBtn.disabled = false;
      startLectureBtn.title = "강의를 시작하려면 클릭하세요";
    } else {
      startLectureBtn.disabled = true;
      startLectureBtn.title = now < activationTime ? 
        "아직 강의 시작 시간이 되지 않았습니다" : 
        "강의 시작 시간이 지났습니다";
    }
  }

  // 시간 범위 계산 함수 추가
  function getClassTimeRange(classTime) {
    const [, timeRange] = classTime.split(' ');
    const [startTimeStr, endTimeStr] = timeRange.split('-');
    
    const now = new Date();
    const [startHour, startMin] = startTimeStr.split(':').map(Number);
    const [endHour, endMin] = endTimeStr.split(':').map(Number);
    
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0).getTime();
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0, 0).getTime();
    
    return [startTime, endTime];
  }

  // 자동 업데이트를 위한 인터벌 설정
  let buttonStateInterval;

  function startButtonStateUpdate(currentClass) {
    // 기존 인터벌 제거
    if (buttonStateInterval) {
      clearInterval(buttonStateInterval);
    }

    // 초기 상태 업데이트
    updateStartButtonState(currentClass);

    // 30초마다 상태 업데이트
    buttonStateInterval = setInterval(() => {
      updateStartButtonState(currentClass);
    }, 30000);
  }

  startLectureBtn.addEventListener('click', async () => {
    try {
      const result = await reidManager.startRecognition();
      if (!result.success) {
        throw new Error(result.error || 'ReID 시스템 시작 실패');
      }

      isLectureActive = true;
      updateUIForActiveClass();
      
      // 1조만 활성화
      const group1Camera = document.querySelector('.camera-feed:first-child');
      if (group1Camera) {
        group1Camera.classList.add('active');
      }
      
      console.log('강의와 ReID 시스템이 성공적으로 시작되었습니다.');
      
    } catch (error) {
      console.error('강의 시작 중 오류:', error);
      alert('강의 시작 중 오류가 발생했습니다.');
      isLectureActive = false;
      updateUIForInactiveClass();
    }
  });

  endLectureBtn.addEventListener('click', async () => {
    try {
      const result = await reidManager.stopRecognition();
      if (!result.success) {
        throw new Error(result.error || 'ReID 시스템 종료 실패');
      }

      isLectureActive = false;
      updateUIForInactiveClass();
      
      // 모든 카메라 피드 비활성화
      document.querySelectorAll('.camera-feed').forEach(feed => {
        feed.classList.remove('active');
      });
      
      // 열려있는 모달 닫기
      const modal = document.getElementById('detailModal');
      if (modal.classList.contains('active')) {
        closeModal();
      }
      
      console.log('강의와 ReID 시스템이 성공적으로 종료되었습니다.');
      
    } catch (error) {
      console.error('강의 종료 중 오류:', error);
      alert('강의 종료 중 오류가 발생했습니다.');
    }
  });

  function updateUIForActiveClass() {
    startLectureBtn.disabled = true;
    endLectureBtn.disabled = false;
    
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.textContent = '진행중';
      statusBadge.classList.add('active');
    }
  }

  function updateUIForInactiveClass() {
    startLectureBtn.disabled = false;
    endLectureBtn.disabled = true;
    
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.textContent = '대기중';
      statusBadge.classList.remove('active');
    }
  }

  // 학번 수정 함수를 전역으로 이동
  window.editMemberName = async function(id, currentStudentId) {
    try {
        const existingModal = document.querySelector('.name-edit-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <div class="name-edit-modal">
                <div class="name-edit-content">
                    <h3>학번 수정</h3>
                    <input type="text" id="newNameInput" value="${currentStudentId}" class="name-edit-input" 
                           pattern="[0-9]{9}" maxlength="9" placeholder="9자리 학번 입력">
                    <div class="name-edit-buttons">
                        <button type="button" id="saveNameBtn" class="btn-save">저장</button>
                        <button type="button" id="cancelNameBtn" class="btn-cancel">취소</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.querySelector('.name-edit-modal');
        const input = document.getElementById('newNameInput');
        const saveBtn = document.getElementById('saveNameBtn');
        const cancelBtn = document.getElementById('cancelNameBtn');

        input.focus();
        input.select();

        const closeModal = () => {
            modal.remove();
        };

        // 저장 버튼 클릭 이벤트
        saveBtn.addEventListener('click', async function() {
            const newStudentId = input.value.trim();
            if (newStudentId && /^\d{9}$/.test(newStudentId)) {
                try {
                    console.log('Updating student ID:', { id, newStudentId }); // 디버깅용 로그
                    const result = await reidManager.updateName(id, newStudentId);
                    console.log('Update result:', result); // 디버깅용 로그
                    
                    if (result.success) {
                        showNotification('학번이 성공적으로 업데이트되었습니다.', 'success');
                        closeModal();
                        
                        // 데이터 즉시 업데이트
                        const latestData = await reidManager.getLatestData();
                        if (latestData.success) {
                            updateModalContent(latestData);
                        }
                    } else {
                        showNotification(result.error || '학번 업데이트에 실패했습니다.', 'error');
                    }
                } catch (error) {
                    console.error('학번 업데이트 중 오류:', error);
                    showNotification('학번 업데이트 중 오류가 발생했습니다.', 'error');
                }
            } else {
                showNotification('올바른 학번 형식이 아닙니다 (9자리 숫자)', 'error');
            }
        });

        // 취소 버튼 클릭 이벤트
        cancelBtn.addEventListener('click', closeModal);

        // 엔터키와 ESC키 이벤트
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        });

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

    } catch (error) {
        console.error('학번 편집 중 오류:', error);
        showNotification('학번 편집 중 오류가 발생했습니다.', 'error');
    }
};

  // 페이지 언로드 시 인터벌 정리
  window.addEventListener('unload', () => {
    if (buttonStateInterval) {
      clearInterval(buttonStateInterval);
    }
  });

  // home.js에서 currentClass가 업데이트될 때마다 버튼 상태도 업데이트
  window.addEventListener('currentClassChanged', (event) => {
    startButtonStateUpdate(event.detail.currentClass);
  });
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
        <div class="value clickable" id="maxMembersDisplay">
          <span id="currentMembers">${activeMembers.length}</span>/<span id="maxMembers">${group.members.length}</span>
        </div>
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
          
          fetch(`http://${window.config.ReIDserverUrl}:${window.config.ReIDserverPort}/api/monitor`, {
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

// ReID 통신 관리자 클래스 수정
class ReIDManager {
    constructor() {
        this.serverUrl = `http://${window.config.ReIDserverUrl}:${window.config.ReIDserverPort}`;
        this.isRunning = false;
        this.updateInterval = null;
        this.reconnectInterval = null;
        this.statusCheckInterval = null;
        this.processedLogs = new Map();  // Map으로 변경하여 타임스탬프 저장
        this.lastLogId = 0;  // 마지막으로 처리한 로그의 ID
        this.maxMembers = 3; // 기본값을 3으로 설정
        
        // 페이지 로드 시 즉시 상태 확인 및 필요한 경우 업데이트 시작
        this.checkAndInitialize();
    }

    async checkAndInitialize() {
        try {
            const response = await fetch(`${this.serverUrl}/status`);
            const data = await response.json();
            if (data.success) {
                this.isRunning = data.is_running;
                window.isLectureActive = data.lecture_active;
                this.updateUI();
                
                // 모니터링 버튼 상태 업데이트
                this.updateMonitoringButtons();
            }
        } catch (error) {
            console.error('서버 상태 확인 오류:', error);
        }
    }

    updateUI() {
        const startBtn = document.getElementById('startLecture');
        const endBtn = document.getElementById('endLecture');
        const statusBadge = document.querySelector('.status-badge');
        
        if (window.isLectureActive) {
            startBtn.disabled = true;
            endBtn.disabled = false;
            if (statusBadge) {
                statusBadge.textContent = '진행중';
                statusBadge.classList.add('active');
            }
        } else {
            startBtn.disabled = false;
            endBtn.disabled = true;
            if (statusBadge) {
                statusBadge.textContent = '대기중';
                statusBadge.classList.remove('active');
            }
        }
    }

    updateMonitoringButtons() {
        // 모든 모니터링 버튼 업데이트
        document.querySelectorAll('.camera-feed .btn-primary').forEach(btn => {
            if (window.isLectureActive) {
                btn.disabled = false;
                btn.style.opacity = '1';
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            }
        });
    }

    async startRecognition() {
        try {
            const response = await fetch(`${this.serverUrl}/start`, {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                this.isRunning = true;
                window.isLectureActive = true;
                this.startUpdates();
                
                // 서버 상태 즉시 확인
                await this.checkAndInitialize();
            }
            
            return result;
        } catch (error) {
            console.error('ReID 시작 오류:', error);
            return { success: false, error: error.message };
        }
    }

    async stopRecognition() {
        try {
            const response = await fetch(`${this.serverUrl}/stop`, {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                this.isRunning = false;
                this.stopUpdates();
                
                // 서버 상태 즉시 확인
                await this.checkAndInitialize();
            }
            
            return result;
        } catch (error) {
            console.error('ReID 종료 오류:', error);
            return { success: false, error: error.message };
        }
    }

    startUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(async () => {
            if (this.isRunning) {
                try {
                    const response = await fetch(`${this.serverUrl}/data`);
                    const data = await response.json();
                    
                    if (data.server_status) {
                        this.isRunning = data.server_status.is_running;
                        window.isLectureActive = data.server_status.lecture_active;
                        this.updateUI();
                    }
                    if (data.success) {
                      this.updateTrackingInfo(data);
                    // 프레임 업데이트만 여기서 처리
                      if (data.success && data.frame) {
                          const canvas = document.getElementById('detectionCanvas');
                          if (canvas) {
                              const ctx = canvas.getContext('2d');
                              const img = new Image();
                              img.onload = () => {
                                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                              };
                              img.src = 'data:image/jpeg;base64,' + data.frame;
                          }
                      }
                    }
                } catch (error) {
                    console.error('데이터 업데이트 오류:', error);
                }
            }
        }, 33); // 프레임 업데이트는 더 빠른 주기로
    }

    stopUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    async captureObjects() {
        try {
            // 현재 인식된 객체 수 확인
            const currentData = await this.getLatestData();
            if (currentData.success && currentData.members) {
                const currentCount = currentData.members.length;
                
                // 최대 인원 초과 확인
                if (currentCount > this.maxMembers) {
                    return {
                        success: false,
                        error: `최대 인원(${this.maxMembers}명)을 초과하여 캡처할 수 없습니다. 현재 ${currentCount}명이 인식되었습니다.`
                    };
                }
            }

            // 캡처 요청
            const response = await fetch(`${this.serverUrl}/capture`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    max_members: this.maxMembers // 최대 인원 정보 전달
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                console.log('Objects captured successfully');
                return { success: true };
            } else {
                console.error('Capture failed:', result.error);
                return { 
                    success: false, 
                    error: result.error || '객처 캡처에 실패했습니다.' 
                };
            }
        } catch (error) {
            console.error('Capture error:', error);
            return { 
                success: false, 
                error: '객처 캡처 중 오류가 발생했습니다.' 
            };
        }
    }

    async recognizeObjects() {
        try {
            const response = await fetch(`${this.serverUrl}/recognize`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                console.log('Objects recognized successfully');
                return { success: true };
            } else {
                console.error('Recognition failed:', result.error);
                return { 
                    success: false, 
                    error: '객체 인식에 실패했습니다.' 
                };
            }
        } catch (error) {
            console.error('Recognition error:', error);
            return { 
                success: false, 
                error: '객체 인식 중 오류가 발생했습니다.' 
            };
        }
    }

    async updateName(id, studentId) {
        try {
            // 학번 업데이트 요청
            const response = await fetch(`${this.serverUrl}/update_name`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    id: id,
                    student_id: studentId 
                })
            });
            
            if (!response.ok) {
                throw new Error('서버 응답 오류');
            }

            const result = await response.json();
            console.log('Update name result:', result); // 디버깅용 로그

            if (result.success) {
                return { success: true };
            } else {
                return { 
                    success: false, 
                    error: result.error || '학번 업데이트에 실패했습니다.' 
                };
            }
        } catch (error) {
            console.error('이름 업데이트 오류:', error);
            return { 
                success: false, 
                error: error.message || '학번 업데이트 중 오류가 발생했습니다.' 
            };
        }
    }

    async getLatestData() {
        try {
            const response = await fetch(`${this.serverUrl}/data`);
            const data = await response.json();
            
            if (data.server_status) {
                this.isRunning = data.server_status.is_running;
                window.isLectureActive = data.server_status.lecture_active;
                this.updateUI();
            }
            
            if (data.success) {
                // logs를 activities로 변환 (로그 형식 통일)
                const activities = data.activities || data.logs?.map(log => ({
                    timestamp: log.time,
                    student_id: log.student_id || log.id,
                    event: log.event
                })) || [];

                return {
                    success: true,
                    frame: data.frame,
                    stats: data.stats,
                    members: data.members,
                    activities: activities
                };
            } else {
                return {
                    success: false,
                    error: data.error || '데이터를 가져오는데 실패했습니다.'
                };
            }
        } catch (error) {
            console.error('데이터 가져오기 오류:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    updateTrackingInfo(data) {
        const modalContent = document.querySelector('.modal-content');
        if (!modalContent || !data) return;

        // 프레임 업데이트
        if (data.frame) {
            const canvas = document.getElementById('detectionCanvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                };
                img.src = 'data:image/jpeg;base64,' + data.frame;
            }
        }

        // 통계 업데이트
        if (data.stats) {
            const statsMapping = {
                totalMembers: 'total_members',
                presentMembers: 'present_members',
                avgDuration: 'avg_duration'
            };

            const elements = {
                totalMembers: document.getElementById('modalTotalMembers'),
                presentMembers: document.getElementById('modalPresentMembers'),
                avgDuration: document.getElementById('modalAvgDuration')
            };

            Object.entries(elements).forEach(([key, element]) => {
                if (element) {
                    const dataKey = statsMapping[key];
                    const value = data.stats[dataKey];
                    
                    if (value !== undefined) {
                        const newValue = key === 'avgDuration' ? value : `${value}명`;
                        
                        if (element.textContent !== newValue) {
                            element.textContent = newValue;
                        }

                        // totalMembers에 클릭 이벤트 추가
                        if (key === 'totalMembers') {
                            element.style.cursor = 'pointer';
                            element.classList.add('clickable');
                            element.onclick = showMaxMembersModal; // 직접 onclick 이벤트 할당
                        }
                    } else {
                        const defaultValue = key === 'avgDuration' ? '0분' : '0명';
                        element.textContent = defaultValue;
                    }
                }
            });
        }

        // 멤버 목록 업데이트
        if (data.members) {
            const memberList = document.getElementById('modalMemberList');
            if (memberList) {
                // 기존 멤버 데이터와 새로운 데이터 비교
                const currentMembers = Array.from(memberList.children).map(item => ({
                    id: item.querySelector('.edit-name-btn')?.dataset.id,
                    student_id: item.querySelector('.edit-name-btn')?.dataset.studentId,
                    status: item.querySelector('.status')?.textContent.trim(),
                    duration: item.querySelector('.student-id')?.textContent.replace('체류시간: ', '').trim()
                }));

                const newMembers = data.members.map(member => ({
                    id: member.id,
                    student_id: member.student_id || '미지정',
                    status: member.status || '미인식',
                    duration: member.duration || '0분'
                }));

                // 데이터가 실제로 변경되었는지 확인
                const hasChanged = JSON.stringify(currentMembers) !== JSON.stringify(newMembers);

                if (hasChanged) {
                    const newMemberList = data.members.map(member => `
                        <div class="member-item ${member.status === '출석' ? 'present' : 'absent'}">
                            <div class="member-info">
                                <span class="material-icons">account_circle</span>
                                <div class="info">
                                    <div class="name-container">
                                        <span class="name">학번: ${member.student_id || '미지정'}</span>
                                        <button class="edit-name-btn" data-id="${member.id}" data-student-id="${member.student_id || ''}">
                                            <span class="material-icons">edit</span>
                                        </button>
                                    </div>
                                    <span class="student-id">체류시간: ${member.duration || '0분'}</span>
                                </div>
                            </div>
                            <span class="status ${member.status === '출석' ? 'present' : 'absent'}">
                                ${member.status || '미인식'}
                            </span>
                        </div>
                    `).join('');

                    memberList.innerHTML = newMemberList;

                    // 수정 버튼에 이벤트 리스너 추가
                    memberList.querySelectorAll('.edit-name-btn').forEach(button => {
                        button.addEventListener('click', () => {
                            const id = button.dataset.id;
                            const currentStudentId = button.dataset.studentId;
                            editMemberName(id, currentStudentId);
                        });
                    });
                }
            }
        }

        // 활동 로그 업데이트
        const activityLog = document.getElementById('modalActivityLog');
        if (activityLog) {
            // 로그 데이터 확인 및 변환
            let activities = [];
            if (data.activities && Array.isArray(data.activities)) {
                activities = data.activities;
            } else if (data.logs && Array.isArray(data.logs)) {
                activities = data.logs.map(log => ({
                    timestamp: log.time,
                    student_id: log.student_id || log.id,
                    event: log.event
                }));
            }

            if (activities.length > 0) {
                // 로그 항목 생성
                const logItems = activities.map(activity => `
                    <div class="activity-item">
                        <span class="time">${activity.timestamp || activity.time || ''}</span>
                        <span class="event">학번 ${activity.student_id || ''} ${activity.event || ''}</span>
                    </div>
                `).join('');

                // 로그 업데이트
                activityLog.innerHTML = logItems;
                
                // 이전에 스크롤이 맨 아래였을 때만 자동 스크롤
                const wasAtBottom = activityLog.scrollHeight - activityLog.clientHeight <= activityLog.scrollTop + 1;
                if (wasAtBottom) {
                    activityLog.scrollTop = activityLog.scrollHeight;
                }
            }
        }
    }

    clearLogHistory() {
        this.lastLogId = 0;
        const activityLog = document.getElementById('modalActivityLog');
        if (activityLog) {
            activityLog.innerHTML = '';
        }
    }

    // 최대 인원 설정 메서드 추가
    async setMaxMembers(count) {
        try {
            const response = await fetch(`${this.serverUrl}/update_max_members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ max_members: count })
            });

            const result = await response.json();
            
            if (result.success) {
                this.maxMembers = count; // 로컬 상태 업데이트
                return { success: true };
            } else {
                return { 
                    success: false, 
                    error: result.error || '최대 인원 업데이트에 실패했습니다.' 
                };
            }
        } catch (error) {
            console.error('최대 인원 업데이트 오류:', error);
            return { 
                success: false, 
                error: '최대 인원 업데이트 중 오류가 발생했습니다.' 
            };
        }
    }

    // 체류 시간 관리 개선
    updateMemberStatus(track_id, is_matched, track) {
        const current_time = time.time();
        
        if (is_matched && track) {
            const matched_id = track.matched_id;
            if (matched_id in this.member_status) {
                const member = this.member_status[matched_id];
                
                // 이미 출석 중인 경우
                if (member.is_present) {
                    // 마지막 감지 시간만 업데이트
                    member.last_seen = current_time;
                } else {
                    // 새로 출석한 경우
                    member.is_present = true;
                    member.last_seen = current_time;
                    
                    // 첫 감지 시간이 없는 경우에만 설정
                    if (!member.first_seen) {
                        member.first_seen = current_time;
                        this.add_log(matched_id, '입실');
                    }
                }
            }
        }
    }
}

// ReID 매니저 인스턴스 생성
const reidManager = new ReIDManager();

// ReID 프레임 표시 함수 수정
function startReidDisplay() {
    const video = document.getElementById('modalCamera');
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    
    // 비디오 메타데이터 로드 시 캔버스 크기 설정
    video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // 비디오와 캔버스를 감싸는 컨테이너 크기 조정
        const container = document.querySelector('.main-camera');
        container.style.width = `895px`;
        container.style.height = `550px`;
        // container.style.width = `${video.videoWidth}px`;
        // container.style.height = `${video.videoHeight}px`;
    });

    let frameUpdateTimeout;
    let retryCount = 0;
    const maxRetries = 3;

    async function updateFrame() {
        try {
            const result = await reidManager.getLatestData();
            if (result.success && result.frame) {
                const img = new Image();
                
                img.onload = () => {
                    // 캔버스 크기를 이미지 크기에 맞게 조정
                    if (canvas.width !== img.width || canvas.height !== img.height) {
                        canvas.width = img.width;
                        canvas.height = img.height;
                    }
                    
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    
                    retryCount = 0;
                };
                
                img.onerror = () => {
                    console.error('Frame image loading failed');
                    retryCount++;
                    
                    if (retryCount > maxRetries) {
                        ctx.fillStyle = '#f0f0f0';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = '#666';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('비디오 스트림을 불러올 수 없습니다.', canvas.width/2, canvas.height/2);
                    }
                };
                
                img.src = 'data:image/jpeg;base64,' + result.frame;
            }
            
            frameUpdateTimeout = setTimeout(updateFrame, 33);
            
        } catch (error) {
            console.error('Frame update error:', error);
            retryCount++;
            
            if (retryCount > maxRetries) {
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#666';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('연결 오류가 발생했습니다.', canvas.width/2, canvas.height/2);
            }
            
            frameUpdateTimeout = setTimeout(updateFrame, 1000);
        }
    }

    updateFrame();

    return () => {
        if (frameUpdateTimeout) {
            clearTimeout(frameUpdateTimeout);
        }
    };
}

// 알림 표시 함수
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// GradeManager 인스턴스를 전역으로 저장
document.addEventListener('DOMContentLoaded', () => {
    window.gradeManager = new GradeManager();
});

// 최대 인원 설정 모달 표시 함수
function showMaxMembersModal(event) {
    event?.preventDefault();
    
    // 기존 모달이 있다면 제거
    const existingModal = document.querySelector('.name-edit-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // 현재 값 가져오기
    const currentMax = document.getElementById('modalTotalMembers')?.textContent.replace('명', '') || '4';

    // 새로운 모달 HTML 생성
    const modalHtml = `
        <div class="name-edit-modal">
            <div class="name-edit-content">
                <h3>최대 인원 설정</h3>
                <input type="number" id="newMaxMembersInput" value="${currentMax}" 
                       class="name-edit-input" min="1" max="10" placeholder="최대 인원 입력">
                <div class="name-edit-buttons">
                    <button type="button" id="saveMaxMembersBtn" class="btn-save">저장</button>
                    <button type="button" id="cancelMaxMembersBtn" class="btn-cancel">취소</button>
                </div>
            </div>
        </div>
    `;

    // 모달 추가
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.querySelector('.name-edit-modal');
    const input = document.getElementById('newMaxMembersInput');
    const saveBtn = document.getElementById('saveMaxMembersBtn');
    const cancelBtn = document.getElementById('cancelMaxMembersBtn');

    // 입력 필드 포커스
    input.focus();
    input.select();

    // 모달 닫기 함수
    const closeModal = () => {
        modal.remove();
    };

    // 저장 버튼 클릭 이벤트
    saveBtn.addEventListener('click', async () => {
        const newMaxMembers = parseInt(input.value);
        if (newMaxMembers > 0 && newMaxMembers <= 10) {
            try {
                const result = await reidManager.setMaxMembers(newMaxMembers);
                if (result.success) {
                    showNotification('최대 인원이 업데이트되었습니다.', 'success');
                    closeModal();
                    
                    // 데이터 즉시 업데이트
                    const latestData = await reidManager.getLatestData();
                    if (latestData.success) {
                        updateModalContent(latestData);
                    }
                } else {
                    showNotification('최대 인원 업데이트에 실패했습니다.', 'error');
                }
            } catch (error) {
                console.error('최대 인원 업데이트 오류:', error);
                showNotification('최대 인원 업데이트 중 오류가 발생했습니다.', 'error');
            }
        } else {
            showNotification('유효한 인원 수를 입력해주세요 (1-10명)', 'error');
        }
    });

    // 취소 버튼 클릭 이벤트
    cancelBtn.addEventListener('click', closeModal);

    // 엔터키와 ESC키 이벤트
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveBtn.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        }
    });

    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
} 