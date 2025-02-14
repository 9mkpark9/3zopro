document.addEventListener('DOMContentLoaded', async () => {
  const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  
  console.log('현재 사용자 정보:', currentUser);

  // 학과 목록 가져오기
  let departments = [];
  try {
    const deptResponse = await fetch(`${SERVER_URL}/departments`);
    const deptData = await deptResponse.json();
    departments = deptData.departments;
  } catch (error) {
    console.error('학과 목록을 가져오는 중 오류:', error);
    alert('학과 목록을 가져오는 중 오류가 발생했습니다.');
  }

  // 기존 수업 목록 가져오기
  let existingClasses = [];
  try {
    const classResponse = await fetch(`${SERVER_URL}/classes`);
    if (!classResponse.ok) {
      throw new Error('기존 수업 목록을 가져오는 중 오류가 발생했습니다.');
    }
    const classData = await classResponse.json();
    existingClasses = classData.classes || [];
  } catch (error) {
    console.error('기존 수업 목록을 가져오는 중 오류:', error);
    alert('기존 수업 목록을 가져오는 중 오류가 발생했습니다.');
  }

  window.registerCourse = async function(event) {
    event.preventDefault();
    
    try {
      const courseCodeElement = document.getElementById('courseCode');
      const courseNameElement = document.getElementById('courseName');
      const startDateElement = document.getElementById('startDate');
      const endDateElement = document.getElementById('endDate');
      const daySelectElement = document.getElementById('daySelect');
      const startTimeElement = document.getElementById('startTime');
      const endTimeElement = document.getElementById('endTime');
      const capacityElement = document.getElementById('capacity');

      // 입력값 검증
      if (!courseCodeElement?.value || !courseNameElement?.value || !startDateElement?.value || 
          !endDateElement?.value || !daySelectElement?.value || !startTimeElement?.value || 
          !endTimeElement?.value || !capacityElement?.value) {
        throw new Error('모든 필드를 입력해주세요.');
      }

      const startDate = startDateElement.value;
      const endDate = endDateElement.value;
      if (startDate >= endDate) {
        throw new Error('종강일은 개강일보다 늦어야 합니다.');
      }

      const startTime = startTimeElement.value;
      const endTime = endTimeElement.value;
      if (startTime >= endTime) {
        throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
      }

      const fixedNum = parseInt(capacityElement.value);
      if (isNaN(fixedNum) || fixedNum <= 0) {
        throw new Error('수강 인원은 1명 이상이어야 합니다.');
      }

      // 교수 정보 확인
      if (!currentUser?.id) {
        throw new Error('교수 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
      }

      // 학과명에서 학과 ID 찾기
      const department = departments.find(dept => dept.d_name === currentUser.department);
      if (!department) {
        throw new Error('학과 정보를 찾을 수 없습니다.');
      }

      // 과목 코드 중복 확인
      if (existingClasses.some(cls => cls.c_id === parseInt(courseCodeElement.value))) {
        throw new Error('이미 존재하는 과목 코드입니다.');
      }

      // 시간 중복 확인
      const selectedDay = daySelectElement.value;
      const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
      const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);

      const isTimeConflict = existingClasses.some(cls => {
        if (cls.m_id !== currentUser.id || cls.class_day !== selectedDay) return false;
        
        const clsStartMinutes = parseInt(cls.st_time.split(':')[0]) * 60 + parseInt(cls.st_time.split(':')[1]);
        const clsEndMinutes = parseInt(cls.end_time.split(':')[0]) * 60 + parseInt(cls.end_time.split(':')[1]);
        return (startMinutes < clsEndMinutes && endMinutes > clsStartMinutes);
      });

      if (isTimeConflict) {
        throw new Error('해당 시간에 이미 등록된 강의가 있습니다.');
      }

      // 서버로 전송할 데이터 구성
      const courseData = {
        c_id: parseInt(courseCodeElement.value),  // 과목 코드를 숫자로 변환
        c_name: courseNameElement.value,
        m_id: currentUser.id,
        d_id: department.d_id,  // 학과 ID 사용
        st_date: startDate,
        end_date: endDate,
        class_day: selectedDay,
        st_time: startTime,
        end_time: endTime,
        fixed_num: fixedNum
      };

      console.log('전송할 데이터:', courseData);

      const response = await fetch(`${SERVER_URL}/classes/inputclass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(courseData)
      });

      console.log('서버 응답:', response);

      const result = await response.json();
      console.log('서버 응답 데이터:', result);

      if (!response.ok) {
        throw new Error(result.detail || '서버 오류가 발생했습니다.');
      }

      alert('수업이 성공적으로 등록되었습니다.');
      document.getElementById('class-register-form').reset();

    } catch (error) {
      console.error('수업 등록 중 오류:', error);
      alert(error.message || '수업 등록에 실패했습니다.');
    }

    return false;
  };

  async function submitClass() {
    const classData = {
        c_id: document.getElementById('c_id').value,
        c_name: document.getElementById('c_name').value,
        m_id: document.getElementById('m_id').value,
        d_id: document.getElementById('d_id').value,
        st_date: document.getElementById('st_date').value,
        end_date: document.getElementById('end_date').value,
        class_day: document.getElementById('class_day').value,
        st_time: document.getElementById('st_time').value,
        end_time: document.getElementById('end_time').value,
        fixed_num: document.getElementById('fixed_num').value
    };

    try {
        const response = await fetch('/inputclass', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(classData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || '강의 등록에 실패했습니다.');
        }

        alert('강의가 성공적으로 등록되었습니다.');
        // 성공 후 페이지 새로고침 또는 리디렉션
        window.location.reload();

    } catch (error) {
        alert(error.message);
        console.error('Error:', error);
    }
  }
});
