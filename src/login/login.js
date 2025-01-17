document.addEventListener('DOMContentLoaded', () => {
  // 초기 사용자 데이터 설정
  const initialUsers = [
      {
          id: "111",
          password: "111",
          name: "학생1",
          userType: "student",
          department: "컴퓨터공학과"
      },
      {
          id: "222",
          password: "222",
          name: "교수1",
          userType: "professor",
          department: "컴퓨터공학과"
      }
  ];

  // localStorage에 초기 사용자 데이터 저장
  if (!localStorage.getItem('users')) {
      localStorage.setItem('users', JSON.stringify(initialUsers));
  }

  // 현재 페이지가 로그인 페이지인지 확인
  const isLoginPage = document.getElementById('loginForm') !== null;
  
  if (isLoginPage) {
    initializeFaceLogin();
  }

  // 로그인 폼 이벤트 리스너
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // 얼굴 인식 로그인 초기화 함수
  function initializeFaceLogin() {
    const openBtn = document.getElementById('openFaceLogin');
    const faceLoginSection = document.querySelector('.face-login-section');
    const closeButton = document.querySelector('.face-login-close');
    const loginCard = document.querySelector('.login-card');
    const loginFormContainer = document.querySelector('.login-form-container');
    let stream = null;
    let isOpen = false;

    // 얼굴 인식 창 열기/닫기 함수
    function toggleFaceLogin() {
        isOpen = !isOpen;
        if (isOpen) {
            loginCard.classList.add('expanded');
            faceLoginSection.classList.add('active');
            loginFormContainer.classList.add('shifted');
            startWebcam();
        } else {
            loginCard.classList.remove('expanded');
            faceLoginSection.classList.remove('active');
            loginFormContainer.classList.remove('shifted');
            stopWebcam();
        }
    }

    // 버튼 클릭 이벤트
    openBtn.addEventListener('click', () => {
        toggleFaceLogin();
    });

    // 닫기 버튼 클릭 이벤트
    closeButton.addEventListener('click', () => {
        if (isOpen) {
            toggleFaceLogin();
        }
    });

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
            if (video) {
                video.srcObject = stream;
            }
        } catch (err) {
            console.error('웹캠 접근 실패:', err);
            alert('웹캠을 찾을 수 없거나 접근이 거부되었습니다.');
        }
    }

    function stopWebcam() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
  }

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
async function handleLogin(e) {
  e.preventDefault();
  
  const id = document.getElementById('id').value;
  const password = document.getElementById('password').value;
  const userType = document.querySelector('input[name="userType"]:checked').value;
  
  try {
    // 저장된 사용자 목록 가져오기
    const users = JSON.parse(localStorage.getItem('users')) || [];
    
    // 사용자 찾기
    const user = users.find(u => 
        u.id === id && 
        u.password === password && 
        u.userType === userType
    );

    if (user) {
        // 로그인 성공
        const loginUser = {
            id: user.id,
            name: user.name,
            userType: user.userType,
            department: user.department,
            office: user.office
        };

        // 현재 사용자 정보 저장
        localStorage.setItem('currentUser', JSON.stringify(loginUser));

        // 사용자 타입에 따라 리다이렉트
        if (userType === 'professor') {
            window.location.href = '../admin/admin.html';
        } else {
            window.location.href = '../student/student.html';
        }
    } else {
        alert('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
  } catch (error) {
    console.error('로그인 처리 중 오류 발생:', error);
    alert('로그인 처리 중 오류가 발생했습니다.');
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