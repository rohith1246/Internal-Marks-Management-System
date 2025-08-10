from flask import Flask, request, jsonify
import cv2
import numpy as np
import os
from datetime import datetime
import base64

app = Flask(__name__)
FACE_DATA_DIR = 'face_data'

# Ensure face_data directory exists
if not os.path.exists(FACE_DATA_DIR):
    os.makedirs(FACE_DATA_DIR)

def load_face_image(user_id, user_type):
    file_path = os.path.join(FACE_DATA_DIR, f'{user_type}_{user_id}.jpg')
    if not os.path.exists(file_path):
        return None
    return cv2.imread(file_path)

def detect_and_compare_faces(stored_image, new_image_data):
    # Decode new image from base64
    nparr = np.frombuffer(base64.b64decode(new_image_data.split(',')[1]), np.uint8)
    new_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Convert images to grayscale
    stored_gray = cv2.cvtColor(stored_image, cv2.COLOR_BGR2GRAY)
    new_gray = cv2.cvtColor(new_image, cv2.COLOR_BGR2GRAY)

    # Load face cascade
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    # Detect faces
    stored_faces = face_cascade.detectMultiScale(stored_gray, 1.3, 5)
    new_faces = face_cascade.detectMultiScale(new_gray, 1.3, 5)

    if len(stored_faces) == 0 or len(new_faces) == 0:
        return False

    # Simple comparison (using histogram comparison for demo purposes)
    stored_hist = cv2.calcHist([stored_gray], [0], None, [256], [0, 256])
    new_hist = cv2.calcHist([new_gray], [0], None, [256], [0, 256])
    similarity = cv2.compareHist(stored_hist, new_hist, cv2.HISTCMP_CORREL)
    
    return similarity > 0.8  # Threshold for similarity

@app.route('/verify-face', methods=['POST'])
def verify_face():
    data = request.get_json()
    user_id = data.get('userId')
    user_type = data.get('userType')
    image_data = data.get('imageData')

    if not all([user_id, user_type, image_data]):
        return jsonify({'error': 'Missing required fields'}), 400

    stored_image = load_face_image(user_id, user_type)
    if stored_image is None:
        return jsonify({'error': 'No face data found for user'}), 404

    is_verified = detect_and_compare_faces(stored_image, image_data)
    return jsonify({'verified': is_verified})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)