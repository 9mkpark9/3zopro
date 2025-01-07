// 창 닫기 버튼 이벤트
document.getElementById('close-btn').addEventListener('click', () => {
  window.close(); // 현재 창 닫기
});

document.addEventListener('DOMContentLoaded', function() {
  // 학과 목록을 서버에서 가져와서 select 요소에 추가하는 함수
  fetch('http://192.168.0.117:9000/departments')
    .then(response => response.json())
    .then(data => {
      const departmentSelect = document.getElementById('department');
      data.departments.forEach(department => {
        const option = document.createElement('option');
        option.value = department.d_id;
        option.textContent = department.d_name;
        departmentSelect.appendChild(option);
      });
    })
    .catch(error => {
      console.error('Error loading departments:', error);
    });
});

document.getElementById('register-form').addEventListener('click', function(event) {
  event.preventDefault();  // 폼 제출 기본 동작 방지

  const userId = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value;
  const student = document.getElementById('student').value;
  const department = document.getElementById('department').value;

  if (!userId || !password || !name || !student || !department) {
    alert('모든 필드를 입력해 주세요.');
    return;
  }

  // 캡처 진행 상태 표시
  showCaptureStatus("얼굴 캡처 중...");

  // 서버에 회원가입 요청 보내기
  fetch('http://192.168.0.117:9000/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      m_id: userId,
      m_pw: password,
      m_name: name,      
      d_id: department,
      is_student: student
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.status === 'success') {
      alert('회원가입 성공');
      window.close();
    } else {
      alert('회원가입 실패: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('회원가입 중 오류 발생');
  });
});

function showCaptureStatus(message) {
  const statusElement = document.getElementById('capture-status');
  statusElement.textContent = message;  // 상태 텍스트 표시
}

document.getElementById('close-btn').addEventListener('click', function() {
  window.close();  // 닫기 버튼 클릭 시 페이지 닫기
});
