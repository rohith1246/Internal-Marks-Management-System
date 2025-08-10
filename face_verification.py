from flask import Flask, request, jsonify
import cv2
import numpy as np
import os
import base64
import logging
from PIL import Image
import io
import pickle

try:
    from flask_cors import CORS
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False
    print("WARNING: flask-cors not installed. Install with: pip install flask-cors")

app = Flask(__name__)

if CORS_AVAILABLE:
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Accept"]
        }
    })
else:
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

POSSIBLE_FACE_DIRS = [
    'face_data',
    '../face_data',
    './face_data',
    os.path.join(os.path.dirname(__file__), 'face_data'),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'face_data')
]

FACE_DATA_DIR = None
for path in POSSIBLE_FACE_DIRS:
    abs_path = os.path.abspath(path)
    if os.path.exists(abs_path):
        FACE_DATA_DIR = abs_path
        break
if FACE_DATA_DIR is None:
    FACE_DATA_DIR = os.path.abspath('face_data')
    os.makedirs(FACE_DATA_DIR, exist_ok=True)

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
logger.info(f"Using FACE_DATA_DIR: {FACE_DATA_DIR}")

# Initialize OpenCV face detector
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def load_face_image(user_id, user_type):
    """Load stored face image for a user."""
    file_path = os.path.join(FACE_DATA_DIR, f'{user_type}_{user_id}.jpg')
    logger.debug(f"Looking for face data at: {file_path}")
    
    if not os.path.exists(file_path):
        alt_paths = [
            os.path.join(FACE_DATA_DIR, f'{user_id}.jpg'),
            os.path.join(FACE_DATA_DIR, f'{user_type}_{user_id}.png'),
            os.path.join(FACE_DATA_DIR, f'{user_id}.png')
        ]
        for alt in alt_paths:
            if os.path.exists(alt):
                file_path = alt
                break
        else:
            logger.warning(f"No face data found for {user_type}_{user_id}")
            return None

    try:
        # Load image with OpenCV
        image = cv2.imread(file_path)
        if image is None:
            # Try with PIL as fallback
            pil_img = Image.open(file_path).convert('RGB')
            image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        
        logger.debug(f"Successfully loaded image: {image.shape}")
        return image

    except Exception as e:
        logger.error(f"Error loading image from {file_path}: {str(e)}")
        return None

def decode_base64_image(image_data):
    """Decode base64 image data"""
    try:
        # Handle data URL format
        if ',' in image_data:
            header, data = image_data.split(',', 1)
            logger.debug(f"Image header: {header}")
        else:
            data = image_data
        
        # Decode base64
        image_bytes = base64.b64decode(data)
        
        # Load with PIL and convert to OpenCV format
        pil_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        opencv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        
        logger.debug(f"Successfully decoded base64 image: {opencv_image.shape}")
        return opencv_image
        
    except Exception as e:
        logger.error(f"Error decoding base64 image: {str(e)}")
        return None

def extract_face_features(image):
    """Extract face features using basic OpenCV operations"""
    try:
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(50, 50)
        )
        
        if len(faces) == 0:
            return None, "No face detected"
        
        # Get the largest face
        largest_face = max(faces, key=lambda x: x[2] * x[3])
        x, y, w, h = largest_face
        
        # Extract face region with some padding
        padding = 20
        y1 = max(0, y - padding)
        y2 = min(gray.shape[0], y + h + padding)
        x1 = max(0, x - padding)
        x2 = min(gray.shape[1], x + w + padding)
        
        face_roi = gray[y1:y2, x1:x2]
        
        # Resize to standard size
        face_roi = cv2.resize(face_roi, (200, 200))
        
        # Apply histogram equalization for better feature extraction
        face_roi = cv2.equalizeHist(face_roi)
        
        # Extract multiple types of features
        features = []
        
        # 1. Histogram features (global intensity distribution)
        hist = cv2.calcHist([face_roi], [0], None, [64], [0, 256])
        hist = cv2.normalize(hist, hist).flatten()
        features.extend(hist)
        
        # 2. Gradient features (edges and textures)
        # Sobel X
        sobelx = cv2.Sobel(face_roi, cv2.CV_64F, 1, 0, ksize=3)
        sobelx_hist = cv2.calcHist([np.uint8(np.absolute(sobelx))], [0], None, [32], [0, 256])
        sobelx_hist = cv2.normalize(sobelx_hist, sobelx_hist).flatten()
        features.extend(sobelx_hist)
        
        # Sobel Y  
        sobely = cv2.Sobel(face_roi, cv2.CV_64F, 0, 1, ksize=3)
        sobely_hist = cv2.calcHist([np.uint8(np.absolute(sobely))], [0], None, [32], [0, 256])
        sobely_hist = cv2.normalize(sobely_hist, sobely_hist).flatten()
        features.extend(sobely_hist)
        
        # 3. Grid-based features (spatial information)
        # Divide face into 4x4 grid and calculate mean intensity for each cell
        h, w = face_roi.shape
        grid_size = 4
        cell_h, cell_w = h // grid_size, w // grid_size
        
        for i in range(grid_size):
            for j in range(grid_size):
                y1_cell = i * cell_h
                y2_cell = (i + 1) * cell_h if i < grid_size - 1 else h
                x1_cell = j * cell_w
                x2_cell = (j + 1) * cell_w if j < grid_size - 1 else w
                
                cell = face_roi[y1_cell:y2_cell, x1_cell:x2_cell]
                mean_intensity = np.mean(cell)
                std_intensity = np.std(cell)
                features.extend([mean_intensity, std_intensity])
        
        # 4. Simple texture features using variance filters
        # Apply different sized variance filters
        for kernel_size in [3, 5, 7]:
            kernel = np.ones((kernel_size, kernel_size), np.float32) / (kernel_size * kernel_size)
            mean_filtered = cv2.filter2D(face_roi.astype(np.float32), -1, kernel)
            variance = (face_roi.astype(np.float32) - mean_filtered) ** 2
            texture_hist = cv2.calcHist([np.uint8(variance)], [0], None, [16], [0, 256])
            texture_hist = cv2.normalize(texture_hist, texture_hist).flatten()
            features.extend(texture_hist)
        
        # Convert to numpy array
        features = np.array(features, dtype=np.float32)
        
        logger.debug(f"Extracted {len(features)} features from face")
        return features, face_roi
        
    except Exception as e:
        logger.error(f"Error extracting face features: {str(e)}")
        return None, f"Feature extraction error: {str(e)}"

def compare_face_features(features1, features2):
    """Compare two sets of face features using multiple metrics"""
    try:
        # Ensure features are the same length
        if len(features1) != len(features2):
            logger.warning(f"Feature length mismatch: {len(features1)} vs {len(features2)}")
            min_len = min(len(features1), len(features2))
            features1 = features1[:min_len]
            features2 = features2[:min_len]
        
        # Normalize features to unit vectors
        norm1 = np.linalg.norm(features1)
        norm2 = np.linalg.norm(features2)
        
        if norm1 == 0 or norm2 == 0:
            return 0, 0, float('inf')
        
        features1_norm = features1 / norm1
        features2_norm = features2 / norm2
        
        # 1. Cosine similarity
        cosine_sim = np.dot(features1_norm, features2_norm)
        
        # 2. Euclidean distance (normalized)
        euclidean_dist = np.linalg.norm(features1_norm - features2_norm)
        euclidean_sim = 1.0 / (1.0 + euclidean_dist)  # Convert to similarity
        
        # 3. Correlation coefficient
        correlation = np.corrcoef(features1, features2)[0, 1]
        if np.isnan(correlation):
            correlation = 0
        
        logger.debug(f"Similarity metrics - Cosine: {cosine_sim:.3f}, Euclidean: {euclidean_sim:.3f}, Correlation: {correlation:.3f}")
        
        return cosine_sim, euclidean_sim, correlation
        
    except Exception as e:
        logger.error(f"Error comparing features: {str(e)}")
        return 0, 0, 0

def detect_and_compare_faces(stored_image, new_image_data, user_id, user_type):
    """Compare faces using OpenCV-based approach"""
    try:
        # Decode the new image
        new_image = decode_base64_image(new_image_data)
        if new_image is None:
            return False, "Failed to decode captured image"

        logger.debug(f"Stored image shape: {stored_image.shape}")
        logger.debug(f"New image shape: {new_image.shape}")

        # Extract features from stored image
        logger.debug("Extracting features from stored image...")
        stored_features, stored_face = extract_face_features(stored_image)
        if stored_features is None:
            return False, f"No face detected in registered image: {stored_face}"

        # Extract features from new image
        logger.debug("Extracting features from new image...")
        new_features, new_face = extract_face_features(new_image)
        if new_features is None:
            return False, f"No face detected in captured image: {new_face}"

        logger.debug(f"Stored features shape: {stored_features.shape}")
        logger.debug(f"New features shape: {new_features.shape}")

        # Compare features
        cosine_sim, euclidean_sim, correlation = compare_face_features(stored_features, new_features)
        
        logger.debug(f"Cosine similarity: {cosine_sim:.3f}")
        logger.debug(f"Euclidean similarity: {euclidean_sim:.3f}")
        logger.debug(f"Correlation: {correlation:.3f}")

        # Determine if faces match based on multiple metrics
        # Thresholds (adjust these based on testing)
        cosine_threshold = 0.75
        euclidean_threshold = 0.4
        correlation_threshold = 0.3
        
        matches = 0
        total_tests = 3
        
        if cosine_sim >= cosine_threshold:
            matches += 1
        if euclidean_sim >= euclidean_threshold:
            matches += 1
        if correlation >= correlation_threshold:
            matches += 1
        
        # Require at least 2 out of 3 tests to pass
        is_match = matches >= 2
        
        confidence = matches / total_tests * 100
        
        if is_match:
            logger.info(f"Face match found: {matches}/{total_tests} tests passed, confidence={confidence:.1f}%")
            return True, f"Face verified successfully (confidence={confidence:.1f}%, cosine={cosine_sim:.3f}, euclidean={euclidean_sim:.3f}, corr={correlation:.3f})"
        else:
            logger.info(f"No face match: {matches}/{total_tests} tests passed, confidence={confidence:.1f}%")
            return False, f"Face verification failed (confidence={confidence:.1f}%, cosine={cosine_sim:.3f}, euclidean={euclidean_sim:.3f}, corr={correlation:.3f})"
        
    except Exception as e:
        logger.error(f"Error in face comparison: {str(e)}", exc_info=True)
        return False, f"Error during comparison: {str(e)}"

@app.route('/api/face-verify', methods=['POST', 'OPTIONS'])
def face_verify():
    """Face verification endpoint using OpenCV"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data received'}), 400
            
        user_id = data.get('userId')
        user_type = data.get('userType')
        image_data = data.get('imageData')

        logger.info(f"=== Face verification request (OpenCV) ===")
        logger.info(f"User: {user_type}_{user_id}")
        logger.info(f"Image data length: {len(image_data) if image_data else 0}")

        # Validate input
        if not user_id or not user_type or not image_data:
            return jsonify({'success': False, 'error': 'Missing required fields: userId, userType, or imageData'}), 400

        # Load stored image
        stored_image = load_face_image(user_id, user_type)
        if stored_image is None:
            return jsonify({'success': False, 'error': f'No registered face data found for {user_type}_{user_id}'}), 404

        # Perform face comparison
        verified, debug_info = detect_and_compare_faces(stored_image, image_data, user_id, user_type)
        
        logger.info(f"Verification result: {verified}, {debug_info}")
        
        return jsonify({
            'success': True,
            'verified': verified, 
            'debug': debug_info,
            'userId': user_id,
            'userType': user_type,
            'method': 'OpenCV'
        }), 200
        
    except Exception as e:
        logger.error(f"Unexpected error in face verification: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500

@app.route('/debug/test-opencv/<user_type>/<user_id>', methods=['GET'])
def test_opencv_face_detection(user_type, user_id):
    """Debug endpoint to test OpenCV face detection"""
    try:
        logger.info(f"Testing OpenCV face detection for {user_type}_{user_id}")
        
        # Load the stored image
        stored_image = load_face_image(user_id, user_type)
        if stored_image is None:
            return jsonify({'error': f'No image found for {user_type}_{user_id}'}), 404
        
        # Test face detection
        features, face_roi = extract_face_features(stored_image)
        
        if features is None:
            return jsonify({
                'user_id': user_id,
                'user_type': user_type,
                'opencv_test_success': False,
                'error': face_roi,
                'image_shape': stored_image.shape
            })
        
        return jsonify({
            'user_id': user_id,
            'user_type': user_type,
            'opencv_test_success': True,
            'features_extracted': len(features),
            'face_roi_shape': face_roi.shape,
            'image_shape': stored_image.shape
        })
        
    except Exception as e:
        logger.error(f"Error in OpenCV test: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/debug/face-data', methods=['GET'])
def debug_face_data():
    """Debug endpoint to list available face data"""
    try:
        files = []
        if os.path.exists(FACE_DATA_DIR):
            for filename in os.listdir(FACE_DATA_DIR):
                if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                    file_path = os.path.join(FACE_DATA_DIR, filename)
                    stat = os.stat(file_path)
                    files.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'modified': stat.st_mtime
                    })
        
        return jsonify({
            'face_data_dir': FACE_DATA_DIR,
            'files': files,
            'total_files': len(files),
            'method': 'OpenCV',
            'opencv_version': cv2.__version__
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'face_data_dir': FACE_DATA_DIR,
        'face_data_exists': os.path.exists(FACE_DATA_DIR),
        'method': 'OpenCV',
        'opencv_version': cv2.__version__
    })

if __name__ == '__main__':
    print(f"Starting OpenCV-based face verification service")
    print(f"Face data directory: {FACE_DATA_DIR}")
    print(f"OpenCV version: {cv2.__version__}")
    print(f"Debug endpoint: http://localhost:5001/debug/test-opencv/<user_type>/<user_id>")
    print(f"Health check: http://localhost:5001/health")
    app.run(host='0.0.0.0', port=5001, debug=True)