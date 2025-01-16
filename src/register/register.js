document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password-confirm').value;
    const department = document.getElementById('department').value;
    const studentId = document.getElementById('student-id').value;
    const userType = document.querySelector('input[name="user-type"]:checked').value;

    // 비밀번호 확인
    if (password !== passwordConfirm) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    // 학과 선택 확인
    if (!department) {
      alert('학과를 선택해주세요.');
      return;
    }

    // 기존 사용자 목록 가져오기
    const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers')) || [];

    // 아이디 중복 확인
    if (registeredUsers.some(user => user.username === username)) {
      alert('이미 사용 중인 아이디입니다.');
      return;
    }

    // 새 사용자 추가
    registeredUsers.push({
      username,
      password,
      department,
      studentId,
      userType
    });

    // 저장
    localStorage.setItem('registeredUsers', JSON.stringify(registeredUsers));

    alert('회원가입이 완료되었습니다.');
    window.location.href = 'index.html';
  });

  // 저장된 테마 적용
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
  }
}); 