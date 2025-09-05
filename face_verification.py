from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import base64
import logging
import pickle
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Configure directories with absolute paths
BASE_DIR = r"D:\projec\Mini Project\Mini Project"
ENCODINGS_DIR = os.path.join(BASE_DIR, "encodings")
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(ENCODINGS_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Face recognition threshold (adjusted for LBPH; lower values indicate better matches)
RECOGNITION_THRESHOLD = 80.0

def download_models():
    """Download required models if they don't exist"""
    import urllib.request
    
    prototxt_path = os.path.join(MODEL_DIR, "deploy.prototxt")
    caffe_model_path = os.path.join(MODEL_DIR, "res10_300x300_ssd_iter_140000.caffemodel")
    
    if not os.path.exists(prototxt_path):
        logger.info("Downloading deploy.prototxt...")
        urllib.request.urlretrieve(
            "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt",
            prototxt_path
        )
    
    if not os.path.exists(caffe_model_path):
        logger.info("Downloading res10_300x300_ssd_iter_140000.caffemodel...")
        urllib.request.urlretrieve(
            "https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel",
            caffe_model_path
        )

# Download models on startup
download_models()

# Load OpenCV's deep learning face detector
prototxt_path = os.path.join(MODEL_DIR, "deploy.prototxt")
caffe_model_path = os.path.join(MODEL_DIR, "res10_300x300_ssd_iter_140000.caffemodel")
use_dnn = True
try:
    face_detector = cv2.dnn.readNetFromCaffe(prototxt_path, caffe_model_path)
    logger.info("DNN face detector loaded successfully")
except Exception as e:
    logger.warning(f"Failed to load DNN face detector: {e}. Using Haar cascade as fallback.")
    face_detector = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    use_dnn = False

# Load OpenCV's face recognizer (LBPH)
face_recognizer = cv2.face.LBPHFaceRecognizer_create()
recognizer_model_path = os.path.join(MODEL_DIR, "face_model.yml")
label_encoder_path = os.path.join(MODEL_DIR, "label_encoder.pkl")

def decode_base64_image(image_data):
    """Decode base64 string to OpenCV image"""
    try:
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image")
        logger.debug(f"Image decoded: shape={image.shape}, dtype={image.dtype}")
        return image
    except Exception as e:
        logger.error(f"Error decoding base64 image: {e}")
        raise

def detect_faces_dnn(image):
    """Detect faces using deep neural network"""
    h, w = image.shape[:2]
    blob = cv2.dnn.blobFromImage(image, 1.0, (300, 300), [104, 117, 123], False, False)
    face_detector.setInput(blob)
    detections = face_detector.forward()
    faces = []
    for i in range(detections.shape[2]):
        confidence = detections[0, 0, i, 2]
        if confidence > 0.5:
            x1 = int(detections[0, 0, i, 3] * w)
            y1 = int(detections[0, 0, i, 4] * h)
            x2 = int(detections[0, 0, i, 5] * w)
            y2 = int(detections[0, 0, i, 6] * h)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            if x2 > x1 and y2 > y1:
                faces.append((x1, y1, x2-x1, y2-y1))
    return faces

def detect_faces_haar(image):
    """Detect faces using Haar cascade (fallback)"""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_detector.detectMultiScale(gray, 1.3, 5, minSize=(30, 30))
    return faces

def detect_faces(image):
    """Detect faces using the best available method"""
    faces = detect_faces_dnn(image) if use_dnn else detect_faces_haar(image)
    logger.debug(f"Detected {len(faces)} faces")
    return faces

def preprocess_face(face_roi):
    """Preprocess face for recognition"""
    if len(face_roi.shape) == 3:
        gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    else:
        gray = face_roi
    gray = cv2.resize(gray, (100, 100))
    gray = cv2.equalizeHist(gray)
    return gray

def load_label_encoder():
    """Load or create label encoder"""
    if os.path.exists(label_encoder_path):
        with open(label_encoder_path, 'rb') as f:
            return pickle.load(f)
    return {"labels": [], "mapping": {}}

def save_label_encoder(encoder):
    """Save label encoder"""
    with open(label_encoder_path, 'wb') as f:
        pickle.dump(encoder, f)

def get_user_label(user_type, user_id):
    """Get or create a numeric label for a user"""
    encoder = load_label_encoder()
    user_key = f"{user_type}_{user_id}"
    if user_key not in encoder["mapping"]:
        label = len(encoder["labels"])
        encoder["mapping"][user_key] = label
        encoder["labels"].append(user_key)
        save_label_encoder(encoder)
    return encoder["mapping"][user_key]

def get_user_from_label(label):
    """Get user info from numeric label"""
    encoder = load_label_encoder()
    if 0 <= label < len(encoder["labels"]):
        user_key = encoder["labels"][label]
        parts = user_key.split('_', 1)
        return {"userType": parts[0], "userId": parts[1]}
    return None

def collect_training_data():
    """Collect all face images for training"""
    faces = []
    labels = []
    encoder = load_label_encoder()
    for user_key in encoder["labels"]:
        user_encodings_path = os.path.join(ENCODINGS_DIR, f"{user_key}.pkl")
        if os.path.exists(user_encodings_path):
            with open(user_encodings_path, 'rb') as f:
                user_data = pickle.load(f)
            for face_img in user_data["faces"]:
                faces.append(face_img)
                labels.append(encoder["mapping"][user_key])
    return faces, labels

def train_model():
    """Train the face recognition model"""
    try:
        faces, labels = collect_training_data()
        if len(faces) == 0:
            logger.warning("No training data available")
            return False, "No faces available for training"
        logger.info(f"Training model with {len(faces)} samples from {len(set(labels))} users")
        face_recognizer.train(faces, np.array(labels))
        face_recognizer.save(recognizer_model_path)
        logger.info(f"Model trained and saved with {len(faces)} samples")
        return True, f"Model trained with {len(faces)} samples from {len(set(labels))} users"
    except Exception as e:
        logger.error(f"Error training model: {e}")
        return False, f"Training error: {str(e)}"

@app.route("/api/face-register", methods=["POST"])
def face_register():
    """Register a user's face by saving multiple training samples"""
    try:
        data = request.get_json()
        user_id = data.get("userId")
        user_type = data.get("userType")
        images_data = data.get("images", [])  # Expect array of images
        
        if not user_id or not user_type or not images_data:
            return jsonify({
                "success": False,
                "error": "Missing required fields: userId, userType, images"
            }), 400
        
        user_label = get_user_label(user_type, user_id)
        user_key = f"{user_type}_{user_id}"
        user_encodings_path = os.path.join(ENCODINGS_DIR, f"{user_key}.pkl")
        
        # Load existing user data
        user_data = {"faces": [], "timestamps": []}
        if os.path.exists(user_encodings_path):
            with open(user_encodings_path, 'rb') as f:
                user_data = pickle.load(f)
        
        # Limit to 50 images
        remaining_slots = 50 - len(user_data["faces"])
        if remaining_slots <= 0:
            return jsonify({
                "success": False,
                "error": "Maximum 50 images reached for this user"
            }), 400
        
        added_count = 0
        for image_data in images_data[:remaining_slots]:
            try:
                image = decode_base64_image(image_data)
                faces = detect_faces(image)
                if len(faces) == 0:
                    logger.debug("No face detected in image, skipping")
                    continue
                if len(faces) > 1:
                    logger.warning(f"Multiple faces detected ({len(faces)}), using the largest one")
                    faces = [max(faces, key=lambda rect: rect[2] * rect[3])]
                
                x, y, w, h = faces[0]
                face_roi = image[y:y+h, x:x+w]
                processed_face = preprocess_face(face_roi)
                
                user_data["faces"].append(processed_face)
                user_data["timestamps"].append(datetime.now().isoformat())
                added_count += 1
            except Exception as e:
                logger.error(f"Error processing image: {e}")
                continue
        
        if added_count == 0:
            return jsonify({
                "success": False,
                "error": "No valid faces detected in provided images"
            }), 400
        
        # Save user data
        with open(user_encodings_path, 'wb') as f:
            pickle.dump(user_data, f)
        
        # Auto-train the model
        success, message = train_model()
        if not success:
            logger.warning(f"Auto-training failed: {message}")
        
        samples_count = len(user_data["faces"])
        logger.info(f"Added {added_count} face samples for {user_key}. Total samples: {samples_count}")
        
        return jsonify({
            "success": True,
            "message": f"Added {added_count} face(s) successfully for {user_type} {user_id}",
            "samples_count": samples_count,
            "training_status": message
        })
    
    except Exception as e:
        logger.error(f"Error in face_register: {e}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500

@app.route("/api/face-verify", methods=["POST"])
def face_verify():
    """Verify a user's face against the trained model"""
    try:
        data = request.get_json()
        user_id = data.get("userId")
        user_type = data.get("userType")
        image_data = data.get("imageData")
        
        if not user_id or not user_type or not image_data:
            return jsonify({
                "success": False,
                "error": "Missing required fields: userId, userType, imageData"
            }), 400
        
        if not os.path.exists(recognizer_model_path):
            return jsonify({
                "success": False,
                "error": "Face recognition model not trained yet"
            }), 404
        
        face_recognizer.read(recognizer_model_path)
        image = decode_base64_image(image_data)
        faces = detect_faces(image)
        
        if len(faces) == 0:
            return jsonify({
                "success": False,
                "error": "No face detected"
            }), 400
        
        if len(faces) > 1:
            logger.warning(f"Multiple faces detected ({len(faces)}), using the largest one")
            faces = [max(faces, key=lambda rect: rect[2] * rect[3])]
        
        x, y, w, h = faces[0]
        face_roi = image[y:y+h, x:x+w]
        processed_face = preprocess_face(face_roi)
        
        predicted_label, confidence = face_recognizer.predict(processed_face)
        expected_label = get_user_label(user_type, user_id)
        verified = (predicted_label == expected_label and confidence < RECOGNITION_THRESHOLD)
        predicted_user = get_user_from_label(predicted_label)
        
        logger.info(f"Face verification for {user_type}_{user_id}: "
                   f"predicted={predicted_user}, confidence={confidence:.3f}, "
                   f"verified={verified}")
        
        return jsonify({
            "success": True,
            "verified": verified,
            "confidence": float(confidence),
            "predicted_user": predicted_user,
            "threshold": RECOGNITION_THRESHOLD
        })
    
    except Exception as e:
        logger.error(f"Error in face_verify: {e}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500

@app.route("/api/recognize-face", methods=["POST"])
def recognize_face():
    """Recognize a face from the trained model"""
    try:
        data = request.get_json()
        image_data = data.get("imageData")
        
        if not image_data:
            return jsonify({
                "success": False,
                "error": "Missing required field: imageData"
            }), 400
        
        if not os.path.exists(recognizer_model_path):
            return jsonify({
                "success": False,
                "error": "Face recognition model not trained yet"
            }), 404
        
        face_recognizer.read(recognizer_model_path)
        image = decode_base64_image(image_data)
        faces = detect_faces(image)
        
        if len(faces) == 0:
            return jsonify({
                "success": False,
                "error": "No face detected"
            }), 400
        
        results = []
        for i, (x, y, w, h) in enumerate(faces):
            face_roi = image[y:y+h, x:x+w]
            processed_face = preprocess_face(face_roi)
            predicted_label, confidence = face_recognizer.predict(processed_face)
            predicted_user = get_user_from_label(predicted_label)
            recognized = confidence < RECOGNITION_THRESHOLD
            
            results.append({
                "face_id": i,
                "bounding_box": [int(x), int(y), int(w), int(h)],
                "recognized": recognized,
                "confidence": float(confidence),
                "user": predicted_user if recognized else None
            })
        
        logger.info(f"Face recognition completed: {len([r for r in results if r['recognized']])}/{len(results)} faces recognized")
        
        return jsonify({
            "success": True,
            "results": results
        })
    
    except Exception as e:
        logger.error(f"Error in recognize_face: {e}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    encoder = load_label_encoder()
    total_samples = sum(len(pickle.load(open(os.path.join(ENCODINGS_DIR, f"{user}.pkl"), 'rb'))["faces"])
                        for user in encoder["labels"]
                        if os.path.exists(os.path.join(ENCODINGS_DIR, f"{user}.pkl")))
    
    return jsonify({
        "status": "ok",
        "encodings_dir": ENCODINGS_DIR,
        "registered_users": len(encoder["labels"]),
        "total_samples": total_samples,
        "model_trained": os.path.exists(recognizer_model_path),
        "threshold": RECOGNITION_THRESHOLD,
        "detection_method": "dnn" if use_dnn else "haar",
        "recognition_method": "LBPH",
        "opencv_version": cv2.__version__
    })

@app.route("/api/users", methods=["GET"])
def get_registered_users():
    """Get list of all registered users"""
    encoder = load_label_encoder()
    users = []
    for user_key in encoder["labels"]:
        user_encodings_path = os.path.join(ENCODINGS_DIR, f"{user_key}.pkl")
        samples_count = 0
        if os.path.exists(user_encodings_path):
            with open(user_encodings_path, 'rb') as f:
                user_data = pickle.load(f)
            samples_count = len(user_data["faces"])
        parts = user_key.split('_', 1)
        users.append({
            "userType": parts[0],
            "userId": parts[1],
            "samples": samples_count
        })
    
    return jsonify({
        "success": True,
        "users": users
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)