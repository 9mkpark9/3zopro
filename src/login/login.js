document.addEventListener('DOMContentLoaded', () => {
  // config 객체 확인 및 대기
  if (!window.config) {
    console.error('Config is not loaded');
    return;
  }
  
  console.log('window.config:', window.config);
  const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
  console.log('SERVER_URL:', SERVER_URL);

  // 기존 로그인 폼 처리
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => handleLogin(e, SERVER_URL));
  }

  // 테마 토글 기능
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.toggle('light-mode', savedTheme === 'light');

    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
      localStorage.setItem('theme', currentTheme);
    });
  }

  // 얼굴 로그인 초기화
  initializeFaceLogin(SERVER_URL);
});

// 서버로 로그인 요청
async function handleLogin(e, SERVER_URL) {
  e.preventDefault();

  const userId = document.getElementById('userId').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(`${SERVER_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ m_id: userId, m_pw: password })
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert(`로그인 실패: ${errorData.detail}`);
      return;
    }

    const data = await response.json();
    console.log('로그인 성공:', data);

    // 사용자 정보 구성 - 얼굴 로그인과 동일한 방식으로 수정
    const currentUser = {
      name: data.name,
      userType: data.is_student ? 'student' : 'admin',
      id: data.id,
      department: data.department, // 서버 응답의 department 필드 직접 사용
      office: data.office || '정보 없음'
    };

    console.log('저장될 사용자 정보:', currentUser); // 디버깅용 로그 추가

    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    // 사용자 타입에 따라 리다이렉트
    if (currentUser.userType === 'student') {
      window.location.href = '../student/student.html';
    } else {
      window.location.href = '../admin/admin.html';
    }
  } catch (error) {
    console.error('로그인 요청 중 오류:', error);
    alert('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
}

// 얼굴 인식 로그인 초기화 함수
function initializeFaceLogin(SERVER_URL) {
  const openBtn = document.getElementById('openFaceLogin');
  const loginContainer = document.querySelector('.login-container');
  const loginCard = document.querySelector('.login-card');
  let stream = null;
  let isOpen = false;

  openBtn.addEventListener('click', async () => {
    isOpen = !isOpen;
    if (isOpen) {
      loginContainer.classList.add('expanded');
      loginCard.classList.add('expanded');
      openBtn.classList.add('active');
      await startWebcam();
    } else {
      closeSection();
    }
  });

  function closeSection() {
    loginContainer.classList.remove('expanded');
    loginCard.classList.remove('expanded');
    openBtn.classList.remove('active');
    stopWebcam();
    isOpen = false;
  }

  async function startWebcam() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      let selectedDeviceId;
      // 3. 두 번째 카메라(인덱스 1)가 있으면 그 deviceId 사용
      if (videoDevices.length > 1) {
        selectedDeviceId = videoDevices[1].deviceId; 
      } else {
        // 만약 카메라가 하나밖에 없으면 디폴트(첫 번째) 카메라 사용
        // 또는 facingMode: 'user' 같은 속성을 쓸 수도 있음.
        selectedDeviceId = videoDevices[0]?.deviceId;
      }
  
      // 4. 해당 deviceId로 스트림 요청
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });  
      const video = document.getElementById('loginWebcam');
      video.srcObject = stream;
      document.getElementById('faceLogin').disabled = false;
    } catch (err) {
      console.error('웹캠 접근 실패:', err);
      alert('웹캠을 찾을 수 없거나 접근이 거부되었습니다.');
    }
  }

  function stopWebcam() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  window.addEventListener('beforeunload', () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  });

  // 얼굴 로그인
  let faceLoginTimeout = null;

  async function startFaceLogin(SERVER_URL) {
      const video = document.getElementById('loginWebcam');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const startTime = Date.now();
      let matched = false;

      // 얼굴 데이터를 서버로 전송
      async function sendFaceForLogin() {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
          const formData = new FormData();
          formData.append('image', blob);

          try {
              const response = await fetch(`${SERVER_URL}/face/face-login`, {
                  method: 'POST',
                  body: formData,
              });

              const result = await response.json();
              if (result.match) {
                  matched = true;
                  
                  const currentUser = {
                      name: result.user.name,
                      id: result.user.id,
                      userType: result.user.is_student ? 'student' : 'admin',
                      department: result.user.department || '학과 정보 없음', // 서버에서 직접 받은 학과명 사용
                      office: result.user.office || '정보 없음'
                  };

                  localStorage.setItem('currentUser', JSON.stringify(currentUser));
                  alert(`환영합니다, ${result.user.name}님!`);

                  window.location.href = result.user.is_student
                      ? '../student/student.html'
                      : '../admin/admin.html';
              }
          } catch (error) {
              console.error('얼굴 로그인 오류:', error);
              alert('얼굴 인식 처리 중 오류가 발생했습니다.');
          }
      }

      // 10초 타이머 또는 성공 여부 확인
      const interval = setInterval(async () => {
          if (Date.now() - startTime > 10000 || matched) {
              clearInterval(interval);
              if (!matched) {
                  stopFaceLogin();
              }
          } else {
              await sendFaceForLogin();
          }
      }, 1000);

      // 로그인 실패 시 호출
      function stopFaceLogin() {
          clearTimeout(faceLoginTimeout);
          console.log('얼굴 로그인 중단됨');
          alert('얼굴 매칭 실패: ID와 비밀번호로 로그인해주세요.');
      }

      // 10초 타이머 시작
      const faceLoginTimeout = setTimeout(() => {
          clearInterval(interval);
          if (!matched) {
              stopFaceLogin();
          }
      }, 10000);
  }

  // Face Login 버튼 클릭 시 실행
  document.getElementById('faceLogin').addEventListener('click', () => {
      console.log('Face Login 버튼 클릭됨');

      const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`; // config에서 URL 가져오기
      startFaceLogin(SERVER_URL);
  });
}