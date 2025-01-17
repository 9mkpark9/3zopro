const mysql = require('mysql');
const dbConfig = require('../config/db');

const connection = mysql.createConnection(dbConfig);

// 수강 가능한 강의 목록 조회
const getAvailableCourses = (departmentId) => {
  const query = `
    SELECT c.*, m.m_name as professor_name, d.d_name as department_name
    FROM class c
    JOIN members m ON c.m_id = m.m_id
    JOIN department d ON c.d_id = d.d_id
    WHERE c.d_id = ?
  `;
  
  return new Promise((resolve, reject) => {
    connection.query(query, [departmentId], (error, results) => {
      if (error) reject(error);
      resolve(results);
    });
  });
};

// 수강 신청
const registerForCourse = (studentId, courseId) => {
  const query = `
    INSERT INTO mem_sel_class (m_id, c_id)
    VALUES (?, ?)
  `;
  
  return new Promise((resolve, reject) => {
    connection.query(query, [studentId, courseId], (error, results) => {
      if (error) reject(error);
      resolve(results);
    });
  });
};

// 수강 취소
const cancelRegistration = (studentId, courseId) => {
  const query = `
    DELETE FROM mem_sel_class 
    WHERE m_id = ? AND c_id = ?
  `;
  
  return new Promise((resolve, reject) => {
    connection.query(query, [studentId, courseId], (error, results) => {
      if (error) reject(error);
      resolve(results);
    });
  });
};

// 학생의 수강 과목 및 집중도 조회
const getStudentCourses = (studentId) => {
  const query = `
    SELECT c.*, m.m_name as professor_name, 
           sc.lecture_date, sc.total as concentration_score
    FROM mem_sel_class msc
    JOIN class c ON msc.c_id = c.c_id
    JOIN members m ON c.m_id = m.m_id
    LEFT JOIN st_concentration sc ON msc.m_id = sc.m_id AND msc.c_id = sc.c_id
    WHERE msc.m_id = ?
    ORDER BY sc.lecture_date DESC
  `;
  
  return new Promise((resolve, reject) => {
    connection.query(query, [studentId], (error, results) => {
      if (error) reject(error);
      resolve(results);
    });
  });
};

module.exports = {
  getAvailableCourses,
  registerForCourse,
  cancelRegistration,
  getStudentCourses
}; 