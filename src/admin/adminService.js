class AdminService {
  async startLecture(lectureId) {
    try {
      // 백그라운드 프로세스 시작
      const iframe = document.getElementById('backgroundProcess');
      iframe.src = `/python/ReID/ReID.py?lectureId=${lectureId}`;
      
      // 강의 상태 업데이트
      await this.updateLectureStatus(lectureId, 'active');
      
      // 실시간 데이터 처리 시작
      this.startRealtimeProcessing(lectureId);
      
      return true;
    } catch (error) {
      console.error('강의 시작 중 오류 발생:', error);
      return false;
    }
  }
  
  async startRealtimeProcessing(lectureId) {
    this.processingInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/lecture/data/${lectureId}`);
        const data = await response.json();
        this.processedData = data;
      } catch (error) {
        console.error('실시간 데이터 처리 중 오류:', error);
      }
    }, 1000); // 1초마다 데이터 업데이트
  }
  
  async getMonitoringData(lectureId) {
    if (!this.processedData) {
      await this.startRealtimeProcessing(lectureId);
    }
    return this.processedData;
  }
  
  stopRealtimeProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

module.exports = {
  registerCourse,
  getProfessorCourses,
  getStudentPerformance
}; 