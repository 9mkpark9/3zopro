document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const openFaceCapture = document.getElementById('openFaceCapture');
    const closeFaceCapture = document.getElementById('closeFaceCapture');
    const signupCard = document.querySelector('.login-card');
    const signupFormContainer = document.querySelector('.signup-form-container');
    const faceCaptureSection = document.querySelector('.face-capture-section');
    const captureBtn = document.getElementById('capturePhoto');
    const retakeBtn = document.getElementById('retakePhoto');
    const confirmBtn = document.getElementById('confirmPhoto');
    const statusText = document.getElementById('faceStatusText');
    
    let stream = null;
    let isFaceCaptured = false;
    let isOpen = false;

    // 테마 토글 기능 추가
    const themeToggle = document.getElementById('themeToggle');
    
    // localStorage에서 테마 설정 가져오기
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.toggle('light-mode', currentTheme === 'light');

    // 테마 토글 버튼 클릭 이벤트
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const theme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', theme);
    });

    // 얼굴 등록 섹션 토글 함수
    function toggleFaceCapture() {
        isOpen = !isOpen;
        if (isOpen) {
            signupCard.classList.add('expanded');
            faceCaptureSection.classList.add('active');
            signupFormContainer.classList.add('shifted');
            startWebcam();
        } else {
            signupCard.classList.remove('expanded');
            faceCaptureSection.classList.remove('active');
            signupFormContainer.classList.remove('shifted');
            stopWebcam();
        }
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
            if (video) {
                video.srcObject = stream;
            }
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
    function capturePhoto() {
        const video = document.getElementById('signupWebcam');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        // 캡처 후 바로 완료 처리
        isFaceCaptured = true;
        statusText.textContent = '✓ 얼굴 등록 완료';
        statusText.classList.remove('required');
        statusText.classList.add('completed');
        openFaceCapture.classList.add('completed');
        openFaceCapture.innerHTML = '<span class="material-icons">check_circle</span>얼굴 등록 완료';
        
        // 얼굴 등록 섹션 닫기
        toggleFaceCapture();
        
        // 캡처된 이미지 저장 (숨겨진 이미지 태그에)
        const capturedImage = document.getElementById('capturedImage');
        capturedImage.src = canvas.toDataURL('image/png');
    }

    // 이벤트 리스너 등록
    openFaceCapture.addEventListener('click', toggleFaceCapture);
    closeFaceCapture.addEventListener('click', toggleFaceCapture);
    
    if (captureBtn) {
        captureBtn.addEventListener('click', capturePhoto);
    }

    if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
            document.querySelector('.webcam-container').style.display = 'block';
            document.querySelector('.capture-preview').style.display = 'none';
            captureBtn.style.display = 'block';
            document.querySelector('.preview-actions').style.display = 'none';
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            isFaceCaptured = true;
            statusText.textContent = '✓ 얼굴 등록 완료';
            statusText.classList.remove('required');
            statusText.classList.add('completed');
            openFaceCapture.classList.add('completed');
            openFaceCapture.innerHTML = '<span class="material-icons">check_circle</span>얼굴 등록 완료';
            toggleFaceCapture();
        });
    }

    // 회원가입 폼 제출
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!isFaceCaptured) {
                alert('얼굴 등록이 필요합니다.');
                return;
            }

            // 회원가입 처리 로직
            const formData = {
                name: document.getElementById('name').value,
                id: document.getElementById('id').value,
                password: document.getElementById('password').value,
                department: document.getElementById('department').value,
                userType: document.querySelector('input[name="userType"]:checked').value,
                faceImage: document.getElementById('capturedImage').src
            };

            // 비밀번호 확인
            const confirmPassword = document.getElementById('confirmPassword').value;
            if (formData.password !== confirmPassword) {
                alert('비밀번호가 일치하지 않습니다.');
                return;
            }

            try {
                // 여기에 실제 회원가입 API 호출 로직 추가
                console.log('회원가입 데이터:', formData);
                alert('회원가입이 완료되었습니다.');
                window.location.href = '../login/index.html';
            } catch (error) {
                console.error('회원가입 실패:', error);
                alert('회원가입 처리 중 오류가 발생했습니다.');
            }
        });
    }

    // 페이지 나갈 때 웹캠 정리
    window.addEventListener('beforeunload', () => {
        stopWebcam();
    });
}); 