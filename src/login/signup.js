document.addEventListener('DOMContentLoaded', () => {
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

  // 회원가입 폼 처리
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }

  // 얼굴 인식 관련 초기화
  initializeFaceCapture();
});

// 기존의 회원가입 관련 함수들... 