const { ipcRenderer } = require('electron'); // 일렉트론의 ipcRenderer 모듈 가져오기

// 회원가입 링크 클릭 이벤트 처리
document.getElementById('register-link').addEventListener('click', (e) => {
  e.preventDefault(); // 기본 동작(페이지 이동) 방지
  ipcRenderer.send('open-register-window'); // 회원가입 창 열기 요청을 메인 프로세스로 전송
});

// 로그인 버튼 클릭 이벤트 처리
document.getElementById('login').addEventListener('click', function (event) {
  event.preventDefault(); // 기본 폼 제출 동작 방지

  // 사용자 입력값 가져오기
  const userId = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // 입력값 유효성 검사
  if (!userId || !password) {
    showModal('모든 필드를 입력해 주세요.'); // 입력값이 없을 경우 경고 메시지 출력
    return;
  }

  // 서버에 로그인 요청 보내기
  fetch('http://192.168.0.117:9000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // JSON 형식으로 데이터 전송
    body: JSON.stringify({ m_id: userId, m_pw: password }), // 사용자 입력값을 JSON으로 변환하여 전송
  })
    .then((response) => response.json()) // 서버 응답을 JSON으로 변환
    .then((data) => {
      if (data.status === 'success') {
        // 로그인 성공 처리
        showModal(`로그인 성공! 환영합니다, ${data.name}님.`); // 성공 메시지 출력

        // 로그인 정보 로컬 스토리지에 저장
        localStorage.setItem('loggedInUserName', data.name);
        localStorage.setItem('loggedInIsStudent', data.istudent);
        localStorage.setItem('loggedInUserId', userId);

        // 성공 메시지 표시 후 특정 UI 창 열기
        setTimeout(() => {
          if (data.istudent === false) {
            ipcRenderer.send('open-managerUI-window'); // 관리자 UI 창 열기
          } else {
            ipcRenderer.send('open-studentUI-window'); // 학생 UI 창 열기
          }
          window.close(); // 현재 창 닫기
        }, 1000); // 2초 후 실행
      } else {
        // 로그인 실패 처리
        showModal('로그인 실패: ' + data.message); // 실패 메시지 출력
      }
    })
    .catch((error) => {
      // 네트워크 오류 등 예외 처리
      console.error('Error:', error); // 오류를 콘솔에 출력
      showModal('로그인 중 오류 발생'); // 오류 메시지 출력
    });
});

// 사용자 정의 모달을 표시하는 함수
function showModal(message) {
  const modal = document.getElementById('modal'); // 모달 요소 선택
  const modalMessage = document.getElementById('modal-message'); // 메시지 출력 영역 선택
  modalMessage.textContent = message; // 모달에 메시지 설정
  modal.classList.remove('hidden'); // 모달 표시
}

// 모달 닫기 버튼 클릭 이벤트 처리
document.getElementById('modal-close').addEventListener('click', function () {
  const modal = document.getElementById('modal'); // 모달 요소 선택
  modal.classList.add('hidden'); // 모달 숨기기
  document.getElementById('username').focus(); // 입력 필드에 포커스 설정
});
