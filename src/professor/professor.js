// 강의 제어 버튼 동작
const lectureControlBtn = document.getElementById('lectureControlBtn');
const endLectureBtn = document.getElementById('endLectureBtn');

let isLectureStarted = false;

lectureControlBtn.addEventListener('click', () => {
  isLectureStarted = !isLectureStarted;
  
  if (isLectureStarted) {
    // 강의 시작 상태
    lectureControlBtn.innerHTML = `
      <span class="material-icons">pause_circle</span>
      강의 중단
    `;
    lectureControlBtn.classList.remove('btn-start');
    lectureControlBtn.classList.add('btn-pause');
    endLectureBtn.disabled = false;
  } else {
    // 강의 중단 상태
    lectureControlBtn.innerHTML = `
      <span class="material-icons">play_circle</span>
      강의 시작
    `;
    lectureControlBtn.classList.remove('btn-pause');
    lectureControlBtn.classList.add('btn-start');
  }
});

endLectureBtn.addEventListener('click', () => {
  // 강의 종료 처리
  isLectureStarted = false;
  lectureControlBtn.innerHTML = `
    <span class="material-icons">play_circle</span>
    강의 시작
  `;
  lectureControlBtn.classList.remove('btn-pause');
  lectureControlBtn.classList.add('btn-start');
  endLectureBtn.disabled = true;
}); 