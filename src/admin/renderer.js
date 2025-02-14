document.addEventListener('DOMContentLoaded', () => {
  // Chart.js를 사용하기 위해 CDN을 추가해야 합니다
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  document.head.appendChild(script);

  // 테마 전환 기능
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDropdown = document.querySelector('.settings-dropdown');
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  
  // 저장된 테마 불러오기
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('light-mode', savedTheme === 'light');
  document.querySelector(`input[value="${savedTheme}"]`).checked = true;

  // 설정 버튼 클릭 이벤트
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsDropdown.classList.toggle('active');
  });

  // 드롭다운 외부 클릭시 닫기
  document.addEventListener('click', () => {
    settingsDropdown.classList.remove('active');
  });

  // 드롭다운 내부 클릭시 이벤트 전파 중단
  settingsDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 테마 변경 이벤트
  themeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const isLight = e.target.value === 'light';
      document.body.classList.toggle('light-mode', isLight);
      localStorage.setItem('theme', e.target.value);
      
      // 차트 색상 업데이트
      updateChartColors(isLight);
    });
  });

  const menuItems = document.querySelectorAll('.sidebar-nav li');
  const pages = document.querySelectorAll('.page');

  // 페이지 전환 함수
  function switchPage(pageId) {
    // 모든 메뉴 항목에서 active 클래스 제거
    menuItems.forEach(item => item.classList.remove('active'));
    // 모든 페이지에서 active 클래스 제거
    pages.forEach(page => page.classList.remove('active'));
    
    // 선택된 메뉴 항목에 active 클래스 추가
    const selectedMenuItem = document.querySelector(`[data-page="${pageId}"]`);
    if (selectedMenuItem) {
      selectedMenuItem.classList.add('active');
    }
    
    // 선택된 페이지에 active 클래스 추가
    const selectedPage = document.getElementById(`${pageId}-page`);
    if (selectedPage) {
      selectedPage.classList.add('active');
    }
  }

  // 메뉴 클릭 이벤트 처리
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      switchPage(pageId);
    });
  });
});
  