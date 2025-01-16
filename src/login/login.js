document.addEventListener('DOMContentLoaded', () => {
  // 기존 로그인 폼 처리
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // 회원가입 얼굴 인식 관련 코드
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    initializeFaceCapture();
  }

  initializeFaceLogin();

  // 테마 토글 기능
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    // 저장된 테마 불러오기
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.toggle('light-mode', savedTheme === 'light');

    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
      localStorage.setItem('theme', currentTheme);
    });
  }
});

// 로그인 처리 함수
function handleLogin(e) {
  e.preventDefault();
  
  const userId = document.getElementById('userId').value;
  const password = document.getElementById('password').value;
  const userType = document.querySelector('input[name="user-type"]:checked').value;
  
  // 임시 로그인 처리
  const user = {
    id: userId,
    name: userType === 'student' ? '홍길동' : '김교수',
    userType: userType,
    department: '컴퓨터공학과',
    grade: '1학년',
    office: '공학관 401호'
  };

  try {
    localStorage.setItem('currentUser', JSON.stringify(user));
    window.location.href = userType === 'student' ? '../student/student.html' : '../admin/admin.html';
  } catch (error) {
    alert('로그인 처리 중 오류가 발생했습니다.');
    console.error(error);
  }
}

// 얼굴 인식 초기화 함수
function initializeFaceCapture() {
  const openBtn = document.getElementById('openFaceCapture');
  const loginContainer = document.querySelector('.login-container');
  const loginCard = document.querySelector('.login-card');
  let stream = null;
  let isFaceCaptured = false;
  let isOpen = false;

  // 얼굴 등록 섹션 토글
  openBtn.addEventListener('click', async () => {
    isOpen = !isOpen;
    if (isOpen) {
      loginContainer.classList.add('expanded');
      loginCard.classList.add('expanded');
      openBtn.classList.add('active');
      await startWebcam();
    } else {
      if (!isFaceCaptured && confirm('얼굴이 등록되지 않았습니다. 정말 닫으시겠습니까?')) {
        closeSection();
      } else if (isFaceCaptured) {
        closeSection();
      }
    }
  });

  function closeSection() {
    loginContainer.classList.remove('expanded');
    loginCard.classList.remove('expanded');
    openBtn.classList.remove('active');
    stopWebcam();
    isOpen = false;
  }

  // 웹캠 시작
  async function startWebcam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });
      const video = document.getElementById('signupWebcam');
      video.srcObject = stream;
    } catch (err) {
      console.error('웹캠 접근 실패:', err);
      alert('웹캠을 찾을 수 없거나 접근이 거부되었습니다.');
    }
  }

  // 웹캠 정지
  function stopWebcam() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  // 사진 촬영
  const captureBtn = document.getElementById('capturePhoto');
  captureBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = document.getElementById('signupWebcam').videoWidth;
    canvas.height = document.getElementById('signupWebcam').videoHeight;
    canvas.getContext('2d').drawImage(document.getElementById('signupWebcam'), 0, 0);
    
    // 캡처된 이미지 표시
    const capturedImage = document.getElementById('capturedImage');
    capturedImage.src = canvas.toDataURL('image/png');
    document.querySelector('.webcam-container').style.display = 'none';
    document.querySelector('.capture-preview').style.display = 'block';
    captureBtn.style.display = 'none';
  });

  // 다시 찍기
  const retakeBtn = document.getElementById('retakePhoto');
  retakeBtn.addEventListener('click', () => {
    document.querySelector('.webcam-container').style.display = 'block';
    document.querySelector('.capture-preview').style.display = 'none';
    captureBtn.style.display = 'block';
  });

  // 사진 확인
  const confirmBtn = document.getElementById('confirmPhoto');
  confirmBtn.addEventListener('click', () => {
    isFaceCaptured = true;
    openBtn.classList.remove('active');
    openBtn.classList.add('completed');
    openBtn.innerHTML = '<span class="material-icons">check_circle</span>얼굴 등록 완료';
    closeSection();
  });

  // 회원가입 폼 제출
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 얼굴 등록 확인
    if (!isFaceCaptured) {
      alert('얼굴 등록이 필요합니다.');
      openBtn.focus();
      return;
    }

    // 기본 정보 수집
    const userData = {
      userId: document.getElementById('userId').value,
      userName: document.getElementById('userName').value,
      password: document.getElementById('password').value,
      department: document.getElementById('department').value,
      userType: document.querySelector('input[name="user-type"]:checked').value,
      faceImage: document.getElementById('capturedImage').src
    };

    // 비밀번호 확인
    const passwordConfirm = document.getElementById('passwordConfirm').value;
    if (userData.password !== passwordConfirm) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    // 테스트용 회원가입 성공 처리
    alert('회원가입이 완료되었습니다!');
    window.location.href = 'index.html';
  });

  // 페이지 나갈 때 웹캠 정리
  window.addEventListener('beforeunload', () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });
}

function initializeFaceLogin() {
  const openBtn = document.getElementById('openFaceLogin');
  const loginContainer = document.querySelector('.login-container');
  const loginCard = document.querySelector('.login-card');
  let stream = null;
  let isOpen = false;

  // 얼굴 인식 섹션 토글
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

  // 웹캠 시작
  async function startWebcam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });
      const video = document.getElementById('loginWebcam');
      video.srcObject = stream;
    } catch (err) {
      console.error('웹캠 접근 실패:', err);
      alert('웹캠을 찾을 수 없거나 접근이 거부되었습니다.');
    }
  }

  // 웹캠 정지
  function stopWebcam() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  // 페이지 나갈 때 웹캠 정리
  window.addEventListener('beforeunload', () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });
} 