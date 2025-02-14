document.addEventListener('DOMContentLoaded', () => {
  const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`; // config에서 URL 가져오기

  // 페이지 로드 시 학과 데이터 가져오기
  fetchDepartments(SERVER_URL);

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

  // 회원가입 폼 처리
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', (event) => handleSignup(event, SERVER_URL));
  }

  // 얼굴 인식 초기화
  initializeFaceCapture(SERVER_URL);

  // 학번 입력 필드 검증
  const studentIdInput = document.getElementById('userId');
  const studentIdError = document.getElementById('studentIdError');

  studentIdInput.addEventListener('input', () => {
    const studentId = studentIdInput.value;
    if (!validateStudentId(studentId)) {
      studentIdError.textContent = '학번은 연도(4자리)로 시작하고 최대 10글자여야 합니다.';
      studentIdError.style.color = 'red';
    } else {
      studentIdError.textContent = '';
    }
  });
  
});

// 학과 목록을 가져와 <select> 태그에 추가
async function fetchDepartments(SERVER_URL) {
  try {
    const response = await fetch(`${SERVER_URL}/departments`);
    if (!response.ok) {
      throw new Error('학과 목록을 가져오는 데 실패했습니다.');
    }

    const data = await response.json();
    const departmentSelect = document.getElementById('department');

    // 기존 옵션 제거
    departmentSelect.innerHTML = '<option value="">학과를 선택하세요</option>';

    // 학과 옵션 추가
    data.departments.forEach((dept) => {
      const option = document.createElement('option');
      option.value = dept.d_id;
      option.textContent = dept.d_name;
      departmentSelect.appendChild(option);
    });
  } catch (error) {
    console.error('학과 데이터 로드 중 오류:', error);
    alert('학과 데이터를 불러오는 중 문제가 발생했습니다.');
  }
}



// 회원가입 처리 함수
async function handleSignup(event, SERVER_URL) {
  event.preventDefault(); // 기본 폼 제출 동작 방지

  function validateStudentId(studentId) {
    const regex = /^\d{4}.{0,6}$/; // 4자리 숫자로 시작하고 뒤에 최대 6글자
    return regex.test(studentId) && studentId.length <= 10;
  }

  // 입력 데이터 수집
  const userId = document.getElementById('userId').value;
  const userName = document.getElementById('userName').value;
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;
  const department = document.getElementById('department').value;
  const userType = document.querySelector('input[name="user-type"]:checked').value;

  // 입력 검증
  if (!validateStudentId(userId)) {
    alert('학번 형식이 올바르지 않습니다. (예: 20251111)');
    return;
  }

  if (password !== passwordConfirm) {
    alert('비밀번호가 일치하지 않습니다.');
    return;
  }

  if (!userId || !userName || !password || !department || !userType) {
    alert('모든 필드를 입력해주세요.');
    return;
  }

  if (capturePhoto.textContent !== '얼굴 등록을 완료하였습니다.') {
    alert('얼굴 등록이 필요합니다.');
    return;
  }

  // 데이터 구성
  const userData = {
    m_id: userId,
    m_pw: password,
    m_name: userName,
    d_id: parseInt(department, 10),
    is_student: userType === 'student',
    m_face: JSON.stringify(JSON.parse(localStorage.getItem('embedding'))), // JSON 문자열로 변환
  };

  try {
    // 서버로 회원가입 데이터 전송
    const response = await fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Unknown error occurred');
    }

    const result = await response.json();
    alert('회원가입이 완료되었습니다!');
    console.log('서버 응답:', result);

    // 성공 후 페이지 이동 또는 초기화
    window.location.href = '../login/index.html'; // 로그인 페이지로 이동
  } catch (error) {
    console.error('회원가입 중 오류 발생:', error);
    alert(`회원가입 실패: ${error.message}`);
  }
}

// 얼굴 인식 모듈 초기화 함수
function initializeFaceCapture(SERVER_URL) {
  const openBtn = document.getElementById('openFaceCapture');
  const signupContainer = document.querySelector('.login-container');
  const signupCard = document.querySelector('.login-card');
  let stream = null;
  let isFaceCaptured = false;
  let isOpen = false;

  openBtn.addEventListener('click', async () => {
    isOpen = !isOpen;
    if (isOpen) {
      signupContainer.classList.add('expanded');
      signupCard.classList.add('expanded');
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
    signupContainer.classList.remove('expanded');
    signupCard.classList.remove('expanded');
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
      const video = document.getElementById('signupWebcam');
      video.srcObject = stream;
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

  // 얼굴등록 함수
  document.getElementById('capturePhoto').addEventListener('click', async () => {
    const capturePhoto = document.getElementById('capturePhoto'); // capturePhoto 요소 가져오기

    const video = document.getElementById('signupWebcam');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const progressBar = document.getElementById('progressBar'); // 프로그레스바 요소

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const images = [];
    const totalImages = 99;
    const phaseImages = totalImages / 3;
    const phases = ["정면", "왼쪽", "오른쪽"];
    let phaseIndex = 0;

    // 상태 텍스트 초기화
    capturePhoto.textContent = `${phases[phaseIndex]}을 바라봐 주세요...`;
    capturePhoto.style.color = 'white';
    progressBar.style.width = '0%';

    for (let i = 0; i < totalImages; i++) {
        if (i % phaseImages === 0 && i !== 0) {
            // 다음 단계로 이동
            phaseIndex++;
            capturePhoto.textContent = `${phases[phaseIndex]}을 바라봐 주세요...`;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg')
        );
        images.push(blob);

        // 프로그레스바 업데이트
        const progress = ((i + 1) / totalImages) * 100;
        progressBar.style.width = `${progress}%`;

        // 약간의 대기 시간 추가
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 캡처 완료 후 서버에 업로드 메시지 표시
    capturePhoto.textContent = "얼굴 등록중... 잠시만 기다려주세요...";
    capturePhoto.style.color = 'white'; // 강조 색상으로 변경

    const formData = new FormData();
    images.forEach((blob) => formData.append('images', blob)); // "images" 키에 파일 추가

    try {
        const response = await fetch(`${SERVER_URL}/capture-face`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Unknown error occurred');
        }

        const data = await response.json();
        if (data.embedding) {
            // 얼굴 등록 성공
            alert("얼굴 등록이 완료되었습니다.");
            capturePhoto.textContent = '얼굴 등록을 완료하였습니다.';
            capturePhoto.style.color = 'white';
            isFaceCaptured = true
            console.log('생성된 임베딩 데이터:', data.embedding);

            // 생성된 임베딩 데이터를 localStorage에 저장
            localStorage.setItem('embedding', JSON.stringify(data.embedding));
        }
    } catch (error) {
        // 얼굴 등록 실패
        capturePhoto.textContent =
            '얼굴 등록 중 에러가 발생하였습니다. 다시 찍어주세요.';
        alert("얼굴 등록 중 에러가 발생하였습니다. 다시 찍어주세요.");
        capturePhoto.style.color = 'white';
        console.error('서버와의 통신 중 에러 발생:', error);
    }
  });

  const confirmBtn = document.getElementById('confirmPhoto');
  confirmBtn.addEventListener('click', () => {
    isFaceCaptured = true;
    openBtn.classList.remove('active');
    openBtn.classList.add('completed');
    openBtn.innerHTML =
      '<span class="material-icons">check_circle</span>얼굴 등록 완료';
    closeSection();
  });

  window.addEventListener('beforeunload', () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  });
}
