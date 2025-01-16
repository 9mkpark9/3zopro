from flask import Flask, request, jsonify
from flask_cors import CORS
from ReID import PersonTracker
import mysql.connector
from datetime import datetime
import json

app = Flask(__name__)
CORS(app)

# DB 설정
db_config = json.load(open('../src/config/db.js'))

tracker = PersonTracker()

@app.route('/api/monitor', methods=['POST'])
def monitor_stream():
    try:
        frame_data = request.files['frame'].read()
        group_id = request.form.get('groupId')
        class_id = request.form.get('classId')
        
        # ReID 처리
        tracks = tracker.process_frame(frame_data)
        
        # DB에 출석 정보 저장
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        for track in tracks:
            if track.is_confirmed():
                cursor.execute("""
                    INSERT INTO attendance 
                    (class_id, student_id, timestamp, status) 
                    VALUES (%s, %s, %s, %s)
                """, (class_id, track.track_id, datetime.now(), 'present'))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            'tracks': [{'id': t.track_id, 'bbox': t.to_tlbr().tolist()} for t in tracks],
            'matched_ids': tracker.current_matches
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000) 