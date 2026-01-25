from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from pymongo import ReplaceOne
from bson.objectid import ObjectId
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import os
import json
import io
from datetime import datetime, timezone, timedelta
from functools import wraps

# Authentication libraries
import bcrypt
import jwt

# Cloudinary for cloud image storage (works on Vercel)
try:
    import cloudinary
    import cloudinary.uploader
    import cloudinary.api
    CLOUDINARY_AVAILABLE = True
except ImportError:
    CLOUDINARY_AVAILABLE = False
    print("⚠️ Cloudinary not installed. Image uploads will use local storage.")

# iCalendar for parsing Airbnb calendar feeds
try:
    from icalendar import Calendar
    import requests
    ICAL_AVAILABLE = True
except ImportError:
    ICAL_AVAILABLE = False
    print("⚠️ icalendar not installed. iCal sync will be unavailable.")

# Custom JSON encoder to handle datetime and ObjectId
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, ObjectId):
            return str(obj)
        return super().default(obj)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__, static_folder='static', static_url_path='/backend/static')

# Configure CORS for global access - explicitly allow all origins and methods
CORS(app, resources={
    r"/*": {
        "origins": ["*", "https://www.khietanportal.site", "https://khietanportal.site", "https://khietanportal.vercel.app", "http://localhost:5500", "http://127.0.0.1:5500"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        "allow_headers": ["Content-Type", "Authorization", "Accept", "X-Requested-With", "Origin"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 86400
    }
})

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin', '*')
    response.headers.add('Access-Control-Allow-Origin', origin)
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    response.headers.add('Access-Control-Max-Age', '86400')
    return response

# Handle OPTIONS preflight requests globally
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    response = app.make_default_options_response()
    return response

# Initialize variables
client = None
db = None
rooms_collection = None
fallback_rooms = []

# Detect Vercel environment (read-only filesystem)
IS_VERCEL = os.environ.get('VERCEL', False) or os.environ.get('VERCEL_ENV', False)

# Configure Cloudinary if credentials are available
USE_CLOUDINARY = False
if CLOUDINARY_AVAILABLE:
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    api_key = os.getenv('CLOUDINARY_API_KEY')
    api_secret = os.getenv('CLOUDINARY_API_SECRET')
    
    if cloud_name and api_key and api_secret:
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        USE_CLOUDINARY = True
        print(f"✓ Cloudinary configured (cloud: {cloud_name})")
    else:
        print("⚠️ Cloudinary credentials not found in environment variables")

# Use /tmp for uploads on Vercel (only writable directory), local path otherwise
if IS_VERCEL:
    UPLOAD_FOLDER = '/tmp/uploads'
else:
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')

# Create upload folder only if not on Vercel's read-only filesystem, or use /tmp
try:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
except OSError as e:
    print(f"⚠️  Could not create upload folder: {e}")
    # Fallback to /tmp on any filesystem error
    UPLOAD_FOLDER = '/tmp/uploads'
    try:
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    except:
        pass  # On Vercel, this might also fail but Cloudinary will handle uploads

# MongoDB Connection - Try Primary Source First
print("🔄 Attempting MongoDB connection...")
json_file_path = os.path.join(os.path.dirname(__file__), 'rooms_data.json')

try:
    uri = os.getenv('MONGODB_URI')
    if not uri:
        raise Exception("MONGODB_URI environment variable not set")
    
    client = MongoClient(
        uri, 
        server_api=ServerApi('1'),
        tls=True,
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=5000
    )
    # Verify connection
    client.admin.command('ping')
    db = client[os.getenv('MONGODB_DB')]
    rooms_collection = db[os.getenv('MONGODB_COLLECTION')]
    print("✓ MongoDB connection successful - using live database")
    
    # Sync MongoDB data to local JSON file for backup/fallback (skip on Vercel - read-only)
    if not IS_VERCEL:
        try:
            rooms_from_db = list(rooms_collection.find())
            
            with open(json_file_path, 'w', encoding='utf-8') as file:
                json.dump(rooms_from_db, file, indent=4, ensure_ascii=False, cls=MongoJSONEncoder)
            print(f"✓ Synced {len(rooms_from_db)} rooms to rooms_data.json")
        except Exception as sync_error:
            print(f"⚠️  Could not sync to JSON: {sync_error}")
        
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    print("⚠️  MongoDB unavailable. Loading fallback data from JSON...")
    client = None
    db = None
    rooms_collection = None
    
    # Load fallback data from JSON as backup
    try:
        with open(json_file_path, 'r', encoding='utf-8') as file:
            fallback_rooms = json.load(file)
        print(f"✓ Loaded {len(fallback_rooms)} rooms from fallback JSON")
    except Exception as e:
        print(f"❌ Could not load fallback data: {e}")
        print("⚠️  System running without data")

# ===== Authentication Configuration =====
# JWT Secret Key - MUST be set in environment variables for production
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'khietan-homestay-super-secret-key-change-in-production-2024')
JWT_EXPIRATION_HOURS = 24  # Token expires after 24 hours

# Users collection for authentication
users_collection = None
if db is not None:
    users_collection = db['admin_users']
    print("✓ Users collection initialized")
    
    # Initialize default admin users if collection is empty (first run only)
    try:
        if users_collection.count_documents({}) == 0:
            # Hash passwords securely
            default_users = [
                {
                    'username': os.getenv('ADMIN_USERNAME_1', 'admin'),
                    'password_hash': bcrypt.hashpw(
                        os.getenv('ADMIN_PASSWORD_1', 'changeme123').encode('utf-8'), 
                        bcrypt.gensalt()
                    ).decode('utf-8'),
                    'role': 'admin',
                    'displayName': os.getenv('ADMIN_DISPLAY_1', 'Administrator'),
                    'created_at': datetime.now(timezone.utc)
                }
            ]
            users_collection.insert_many(default_users)
            print("✓ Default admin user created. CHANGE PASSWORD IMMEDIATELY!")
    except Exception as e:
        print(f"⚠️ Could not initialize default users: {e}")

def hash_password(password):
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, password_hash):
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

def generate_token(user_data):
    """Generate a JWT token for authenticated user"""
    payload = {
        'user_id': str(user_data.get('_id')),
        'username': user_data.get('username'),
        'role': user_data.get('role'),
        'displayName': user_data.get('displayName'),
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm='HS256')

def verify_token(token):
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """Decorator to require valid JWT token for protected routes"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'success': False, 'error': 'Authentication token required'}), 401
        
        payload = verify_token(token)
        if not payload:
            return jsonify({'success': False, 'error': 'Invalid or expired token'}), 401
        
        # Add user info to request context
        request.current_user = payload
        return f(*args, **kwargs)
    
    return decorated

def admin_required(f):
    """Decorator to require admin role for protected routes"""
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if request.current_user.get('role') != 'admin':
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    
    return decorated

# ===== Helper Functions =====
def convert_room_for_api(room):
    """Convert MongoDB room document to API response format"""
    if room is None:
        return None
    
    # Convert _id to string for JSON serialization
    id_value = room.get('_id', '')
    if isinstance(id_value, ObjectId):
        id_str = str(id_value)  # Convert ObjectId to hex string
    else:
        id_str = str(id_value)
    
    # Map MongoDB field names to API field names
    api_room = {
        'room_id': id_str,
        'id': id_str,
        'name': room.get('name', ''),
        'price': room.get('price', 0),
        'capacity': room.get('persons', 0),  # MongoDB uses 'persons', API uses 'capacity'
        'persons': room.get('persons', 0),
        'description': room.get('description', ''),
        'amenities': room.get('amenities', []),
        'bookedIntervals': room.get('bookedIntervals', []),  # Include booking intervals for calendar
        'icalUrl': room.get('icalUrl', ''),  # Airbnb iCal URL for sync
        'lastIcalSync': str(room.get('lastIcalSync', '')) if room.get('lastIcalSync') else None,
        'created_at': str(room.get('created_at', '')) if room.get('created_at') else None,
        'updated_at': str(room.get('updated_at', '')) if room.get('updated_at') else None
    }
    # Include legacy single imageUrl if present
    if room.get('imageUrl'):
        api_room['imageUrl'] = room.get('imageUrl')
    # Include multi-image structure
    if room.get('images'):
        api_room['images'] = room.get('images')
    # Include promotion data if present
    if room.get('promotion'):
        api_room['promotion'] = room.get('promotion')
    return api_room

# ===== Authentication API Endpoints =====

@app.route('/backend/api/auth/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'success': False, 'error': 'Username and password required'}), 400
        
        if users_collection is None:
            return jsonify({'success': False, 'error': 'Authentication service unavailable'}), 503
        
        # Find user by username
        user = users_collection.find_one({'username': username})
        
        if not user:
            # Use generic error to prevent username enumeration
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
        
        # Verify password
        if not verify_password(password, user.get('password_hash', '')):
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
        
        # Generate JWT token
        token = generate_token(user)
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'token': token,
            'user': {
                'username': user.get('username'),
                'role': user.get('role'),
                'displayName': user.get('displayName')
            }
        }), 200
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'success': False, 'error': 'Authentication failed'}), 500

@app.route('/backend/api/auth/verify', methods=['GET'])
@token_required
def verify_auth():
    """Verify if current token is valid"""
    return jsonify({
        'success': True,
        'user': {
            'username': request.current_user.get('username'),
            'role': request.current_user.get('role'),
            'displayName': request.current_user.get('displayName')
        }
    }), 200

@app.route('/backend/api/auth/change-password', methods=['POST'])
@token_required
def change_password():
    """Change password for authenticated user"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        
        current_password = data.get('currentPassword', '')
        new_password = data.get('newPassword', '')
        
        if not current_password or not new_password:
            return jsonify({'success': False, 'error': 'Current and new password required'}), 400
        
        if len(new_password) < 8:
            return jsonify({'success': False, 'error': 'New password must be at least 8 characters'}), 400
        
        if users_collection is None:
            return jsonify({'success': False, 'error': 'Service unavailable'}), 503
        
        # Get current user from database
        username = request.current_user.get('username')
        user = users_collection.find_one({'username': username})
        
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        # Verify current password
        if not verify_password(current_password, user.get('password_hash', '')):
            return jsonify({'success': False, 'error': 'Current password is incorrect'}), 401
        
        # Update password
        new_hash = hash_password(new_password)
        users_collection.update_one(
            {'username': username},
            {'$set': {'password_hash': new_hash, 'updated_at': datetime.now(timezone.utc)}}
        )
        
        return jsonify({
            'success': True,
            'message': 'Password changed successfully'
        }), 200
        
    except Exception as e:
        print(f"Change password error: {e}")
        return jsonify({'success': False, 'error': 'Failed to change password'}), 500

@app.route('/backend/api/auth/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users (admin only)"""
    try:
        if users_collection is None:
            return jsonify({'success': False, 'error': 'Service unavailable'}), 503
        
        users = list(users_collection.find({}, {'password_hash': 0}))  # Exclude password hash
        
        # Convert ObjectId to string
        for user in users:
            user['_id'] = str(user['_id'])
        
        return jsonify({
            'success': True,
            'data': users,
            'count': len(users)
        }), 200
        
    except Exception as e:
        print(f"Get users error: {e}")
        return jsonify({'success': False, 'error': 'Failed to get users'}), 500

@app.route('/backend/api/auth/users', methods=['POST'])
@admin_required
def create_user():
    """Create a new user (admin only)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        role = data.get('role', 'manager')
        displayName = data.get('displayName', username)
        
        if not username or not password:
            return jsonify({'success': False, 'error': 'Username and password required'}), 400
        
        if len(password) < 8:
            return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400
        
        if role not in ['admin', 'manager']:
            return jsonify({'success': False, 'error': 'Role must be admin or manager'}), 400
        
        if users_collection is None:
            return jsonify({'success': False, 'error': 'Service unavailable'}), 503
        
        # Check if username already exists
        if users_collection.find_one({'username': username}):
            return jsonify({'success': False, 'error': 'Username already exists'}), 409
        
        # Create new user
        new_user = {
            'username': username,
            'password_hash': hash_password(password),
            'role': role,
            'displayName': displayName,
            'created_at': datetime.now(timezone.utc)
        }
        
        result = users_collection.insert_one(new_user)
        
        return jsonify({
            'success': True,
            'message': 'User created successfully',
            'user': {
                '_id': str(result.inserted_id),
                'username': username,
                'role': role,
                'displayName': displayName
            }
        }), 201
        
    except Exception as e:
        print(f"Create user error: {e}")
        return jsonify({'success': False, 'error': 'Failed to create user'}), 500

@app.route('/backend/api/auth/users/<user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete a user (admin only)"""
    try:
        if users_collection is None:
            return jsonify({'success': False, 'error': 'Service unavailable'}), 503
        
        # Prevent deleting yourself
        if request.current_user.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 400
        
        # Find and delete user
        try:
            result = users_collection.delete_one({'_id': ObjectId(user_id)})
        except:
            result = users_collection.delete_one({'_id': user_id})
        
        if result.deleted_count == 0:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'User deleted successfully'
        }), 200
        
    except Exception as e:
        print(f"Delete user error: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete user'}), 500

@app.route('/backend/api/auth/users/<user_id>/password', methods=['PUT'])
@admin_required
def admin_change_user_password(user_id):
    """Change password for any user (admin only)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        
        new_password = data.get('newPassword', '')
        
        if not new_password:
            return jsonify({'success': False, 'error': 'New password required'}), 400
        
        if len(new_password) < 8:
            return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400
        
        if users_collection is None:
            return jsonify({'success': False, 'error': 'Service unavailable'}), 503
        
        # Find user by ID
        try:
            user = users_collection.find_one({'_id': ObjectId(user_id)})
        except:
            user = users_collection.find_one({'_id': user_id})
        
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        # Update password
        new_hash = hash_password(new_password)
        try:
            users_collection.update_one(
                {'_id': ObjectId(user_id)},
                {'$set': {'password_hash': new_hash, 'updated_at': datetime.now(timezone.utc)}}
            )
        except:
            users_collection.update_one(
                {'_id': user_id},
                {'$set': {'password_hash': new_hash, 'updated_at': datetime.now(timezone.utc)}}
            )
        
        return jsonify({
            'success': True,
            'message': 'Password changed successfully'
        }), 200
        
    except Exception as e:
        print(f"Admin change password error: {e}")
        return jsonify({'success': False, 'error': 'Failed to change password'}), 500

# ===== Root & Info Endpoints =====

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - API info"""
    return jsonify({
        'success': True,
        'message': 'KhietAn Homestay API is running',
        'version': '1.0.0',
        'endpoints': {
            'health': '/backend/health',
            'rooms': '/backend/api/admin/rooms'
        }
    }), 200

# ===== Room API Endpoints =====

@app.route('/backend/api/admin/rooms', methods=['GET'])
def get_all_rooms():
    """Fetch all rooms from MongoDB or fallback JSON"""
    try:
        if rooms_collection is None:
            # Use fallback JSON data
            api_rooms = [convert_room_for_api(room) for room in fallback_rooms]
            return jsonify({
                'success': True,
                'data': api_rooms,
                'count': len(api_rooms),
                'source': 'fallback'
            }), 200
        
        rooms = list(rooms_collection.find())
        api_rooms = [convert_room_for_api(room) for room in rooms]
        
        return jsonify({
            'success': True,
            'data': api_rooms,
            'count': len(api_rooms),
            'source': 'mongodb'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms/<room_id>', methods=['GET'])
def get_room(room_id):
    """Fetch a specific room by ID"""
    try:
        room = None
        
        if rooms_collection is None:
            # Search in fallback data
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
        else:
            # Try to find by _id as string first
            room = rooms_collection.find_one({'_id': room_id})
            
            # If not found, try as ObjectId
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                except:
                    pass
        
        if not room:
            return jsonify({
                'success': False,
                'error': 'Room not found'
            }), 404
        
        api_room = convert_room_for_api(room)
        return jsonify({
            'success': True,
            'data': api_room
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms', methods=['POST'])
def add_room():
    """Add a new room to MongoDB using upsert with custom ID"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'price', 'capacity', 'description', 'amenities']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Get custom ID (4 digit room ID like 0101, 0201)
        custom_id = data.get('custom_id')
        if custom_id:
            # Validate format (4 digits)
            if not custom_id.isdigit() or len(custom_id) != 4:
                return jsonify({
                    'success': False,
                    'error': 'Room ID must be exactly 4 digits (e.g., 0101, 0201)'
                }), 400
        
        # Prepare room document
        new_room = {
            'name': data.get('name'),
            'price': float(data.get('price')),
            'persons': int(data.get('capacity')),
            'description': data.get('description'),
            'amenities': data.get('amenities', []),
            'bookedIntervals': [],
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc)
        }
        
        if rooms_collection is None:
            # Add to fallback list with custom ID or generate new ID
            if custom_id:
                new_room['_id'] = custom_id
            else:
                numeric_ids = [int(r.get('_id', 0)) for r in fallback_rooms if str(r.get('_id', '0')).isdigit()]
                new_id = str(max(numeric_ids + [0]) + 1).zfill(4)
                new_room['_id'] = new_id
            fallback_rooms.append(new_room)
            api_room = convert_room_for_api(new_room.copy())
        else:
            # Use custom ID if provided, otherwise generate ObjectId
            if custom_id:
                new_room['_id'] = custom_id
                # Check if room with this ID already exists
                existing = rooms_collection.find_one({'_id': custom_id})
                if existing:
                    return jsonify({
                        'success': False,
                        'error': f'Room with ID {custom_id} already exists'
                    }), 400
            else:
                new_room['_id'] = ObjectId()
            
            # Use ReplaceOne with upsert=True for MongoDB
            operations = [ReplaceOne({'_id': new_room['_id']}, new_room, upsert=True)]
            result = rooms_collection.bulk_write(operations)
            
            print(f"✅ MongoDB upsert (add): Room {new_room['_id']} - {result.modified_count} modified, {result.upserted_count} inserted")
            
            api_room = convert_room_for_api(new_room.copy())
        
        return jsonify({
            'success': True,
            'message': 'Room added successfully',
            'data': api_room
        }), 201
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms/<room_id>', methods=['PUT'])
def update_room(room_id):
    """Update a room in MongoDB using upsert"""
    try:
        data = request.get_json()
        
        if rooms_collection is None:
            # Update in fallback data
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            # Update fields in fallback room
            if 'name' in data:
                room['name'] = data['name']
            if 'price' in data:
                room['price'] = float(data['price'])
            if 'capacity' in data:
                room['persons'] = int(data['capacity'])
            if 'images' in data:
                room['images'] = data['images']
            room['updated_at'] = datetime.now(timezone.utc).isoformat()
            
            api_room = convert_room_for_api(room.copy())
        else:
            # Find existing room first (try string _id, then ObjectId)
            existing_room = rooms_collection.find_one({'_id': room_id})
            if not existing_room:
                try:
                    obj_id = ObjectId(room_id)
                    existing_room = rooms_collection.find_one({'_id': obj_id})
                    if existing_room:
                        room_id = obj_id  # Use ObjectId for upsert
                except:
                    pass
            
            if not existing_room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            # Prepare full document for upsert
            updated_room = existing_room.copy()
            updated_room['_id'] = room_id
            
            if 'name' in data:
                updated_room['name'] = data['name']
            if 'price' in data:
                updated_room['price'] = float(data['price'])
            if 'capacity' in data:
                updated_room['persons'] = int(data['capacity'])
            if 'persons' in data:
                updated_room['persons'] = int(data['persons'])
            if 'description' in data:
                updated_room['description'] = data['description']
            if 'amenities' in data:
                updated_room['amenities'] = data['amenities']
            if 'images' in data:
                updated_room['images'] = data['images']
            updated_room['updated_at'] = datetime.now(timezone.utc)
            
            # Use ReplaceOne with upsert=True for MongoDB
            operations = [ReplaceOne({'_id': room_id}, updated_room, upsert=True)]
            result = rooms_collection.bulk_write(operations)
            
            print(f"✅ MongoDB upsert: {result.modified_count} modified, {result.upserted_count} inserted")
            
            api_room = convert_room_for_api(updated_room.copy())
        
        return jsonify({
            'success': True,
            'message': 'Room updated successfully',
            'data': api_room
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/backend/api/admin/rooms/<room_id>/image', methods=['POST'])
def upload_room_image(room_id):
    """Upload an image for a room and save imageUrl to room document"""
    try:
        print(f"📤 Starting legacy image upload for room: {room_id}")
        
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400

        filename = secure_filename(file.filename)
        base, ext = os.path.splitext(filename)
        ext = ext.lower()
        unique_name = f"{room_id}_{base}_{int(datetime.now(timezone.utc).timestamp())}"

        # Read file content into memory ONCE for both Cloudinary and local storage
        file_content = file.read()
        file_size = len(file_content)
        print(f"   File size: {file_size} bytes")
        
        if file_size == 0:
            print("❌ Empty file content")
            return jsonify({'success': False, 'error': 'Empty file - no content received'}), 400

        # Use Cloudinary if available (required for Vercel), otherwise local storage
        if USE_CLOUDINARY:
            try:
                print(f"   Uploading to Cloudinary...")
                # Upload to Cloudinary using file bytes
                result = cloudinary.uploader.upload(
                    file_content,
                    public_id=unique_name,
                    folder="khietan_homestay/rooms",
                    resource_type="image",
                    overwrite=True
                )
                image_url = result['secure_url']
                print(f"✓ Image uploaded to Cloudinary: {image_url}")
            except Exception as cloud_err:
                print(f"❌ Cloudinary upload failed: {cloud_err}")
                # Fallback to local storage if Cloudinary fails
                save_path = os.path.join(UPLOAD_FOLDER, f"{unique_name}{ext}")
                with open(save_path, 'wb') as f:
                    f.write(file_content)
                image_url = f"/backend/static/uploads/{unique_name}{ext}"
                print(f"✓ Image saved locally (fallback): {image_url}")
        else:
            # Local storage (for development)
            save_path = os.path.join(UPLOAD_FOLDER, f"{unique_name}{ext}")
            print(f"   Saving to local path: {save_path}")
            with open(save_path, 'wb') as f:
                f.write(file_content)
            image_url = f"/backend/static/uploads/{unique_name}{ext}"
            print(f"✓ Image saved locally: {image_url}")

        # Update room document
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            room['imageUrl'] = image_url
            room['updated_at'] = datetime.now().isoformat()
            with open(json_file_path, 'w') as f:
                json.dump(fallback_rooms, f, indent=2)
        else:
            # Try to update by string id or ObjectId
            filter_id = {'_id': room_id}
            room = rooms_collection.find_one(filter_id)
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    filter_id = {'_id': obj_id}
                except:
                    pass

            result = rooms_collection.update_one(filter_id, {
                '$set': {'imageUrl': image_url, 'updated_at': datetime.now(timezone.utc)}
            })

            if result.matched_count == 0:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

        return jsonify({'success': True, 'message': 'Image uploaded', 'imageUrl': image_url}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/backend/api/admin/rooms/<room_id>/image', methods=['DELETE'])
def delete_room_image(room_id):
    """Delete an image for a room and remove imageUrl from room document"""
    try:
        # Find room
        target_room = None
        if rooms_collection is None:
            target_room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not target_room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
        else:
            target_room = rooms_collection.find_one({'_id': room_id})
            if not target_room:
                try:
                    obj_id = ObjectId(room_id)
                    target_room = rooms_collection.find_one({'_id': obj_id})
                    room_id_filter = {'_id': obj_id}
                except:
                    return jsonify({'success': False, 'error': 'Room not found'}), 404
            else:
                room_id_filter = {'_id': room_id}

        # Determine image path
        image_url = target_room.get('imageUrl') if target_room else None
        if not image_url:
            return jsonify({'success': False, 'error': 'No image to delete'}), 404

        # Only handle local uploads under /backend/static/uploads/ or /static/uploads/
        if '/static/uploads/' in image_url:
            filename = image_url.split('/static/uploads/')[-1]
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception as e:
                # Log but continue to remove DB reference
                print(f"⚠️ Failed removing file {file_path}: {e}")

        # Remove imageUrl from room
        if rooms_collection is None:
            target_room.pop('imageUrl', None)
            target_room['updated_at'] = datetime.now().isoformat()
            with open(json_file_path, 'w') as f:
                json.dump(fallback_rooms, f, indent=2)
        else:
            result = rooms_collection.update_one(room_id_filter, {'$unset': {'imageUrl': ''}, '$set': {'updated_at': datetime.now(timezone.utc)}})
            if result.matched_count == 0:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

        return jsonify({'success': True, 'message': 'Image deleted'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== Multi-Image Endpoints =====

@app.route('/backend/api/admin/rooms/<room_id>/images', methods=['POST'])
def upload_room_image_multi(room_id):
    """Upload an image for a room with category (cover/bedroom/bathroom/exterior)"""
    try:
        print(f"📤 Starting image upload for room: {room_id}")
        print(f"   USE_CLOUDINARY: {USE_CLOUDINARY}")
        print(f"   CLOUDINARY_AVAILABLE: {CLOUDINARY_AVAILABLE}")
        
        if 'image' not in request.files:
            print("❌ No image file in request")
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            print("❌ Empty filename")
            return jsonify({'success': False, 'error': 'Empty filename'}), 400

        # Valid categories: cover, bedroom, bathroom, exterior
        category = request.form.get('category', 'bedroom')  # default to bedroom
        valid_categories = ['cover', 'bedroom', 'bathroom', 'exterior']
        if category not in valid_categories:
            category = 'bedroom'  # fallback
        order = int(request.form.get('order', 0))
        
        print(f"   Filename: {file.filename}, Category: {category}, Order: {order}")

        filename = secure_filename(file.filename)
        base, ext = os.path.splitext(filename)
        # Ensure extension is lowercase
        ext = ext.lower()
        unique_name = f"{category}_{room_id}_{base}_{int(datetime.now(timezone.utc).timestamp())}_{order}"

        # Read file content into memory ONCE for both Cloudinary and local storage
        file_content = file.read()
        file_size = len(file_content)
        print(f"   File size: {file_size} bytes")
        
        if file_size == 0:
            print("❌ Empty file content")
            return jsonify({'success': False, 'error': 'Empty file - no content received'}), 400

        # Use Cloudinary if available (required for Vercel), otherwise local storage
        if USE_CLOUDINARY:
            try:
                print(f"   Uploading to Cloudinary...")
                # Upload to Cloudinary using file bytes
                upload_result = cloudinary.uploader.upload(
                    file_content,
                    public_id=unique_name,
                    folder=f"khietan_homestay/rooms/{room_id}/{category}",
                    resource_type="image",
                    overwrite=True
                )
                image_url = upload_result['secure_url']
                print(f"✓ Image uploaded to Cloudinary: {image_url}")
            except Exception as cloud_err:
                print(f"❌ Cloudinary upload failed: {cloud_err}")
                # Fallback to local storage if Cloudinary fails
                print("   Falling back to local storage...")
                save_path = os.path.join(UPLOAD_FOLDER, f"{unique_name}{ext}")
                with open(save_path, 'wb') as f:
                    f.write(file_content)
                image_url = f"/backend/static/uploads/{unique_name}{ext}"
                print(f"✓ Image saved locally: {image_url}")
        else:
            # Local storage (for development)
            save_path = os.path.join(UPLOAD_FOLDER, f"{unique_name}{ext}")
            print(f"   Saving to local path: {save_path}")
            with open(save_path, 'wb') as f:
                f.write(file_content)
            image_url = f"/backend/static/uploads/{unique_name}{ext}"
            print(f"✓ Image saved locally: {image_url}")

        # Update room document - add to images array
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            
            if 'images' not in room:
                room['images'] = {'cover': [], 'bedroom': [], 'bathroom': [], 'exterior': []}
            if category not in room['images']:
                room['images'][category] = []
            room['images'][category].append(image_url)
            room['updated_at'] = datetime.now().isoformat()
            
            with open(json_file_path, 'w', encoding='utf-8') as f:
                json.dump(fallback_rooms, f, indent=2, ensure_ascii=False)
        else:
            # Try to find room
            filter_id = {'_id': room_id}
            room = rooms_collection.find_one(filter_id)
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    filter_id = {'_id': obj_id}
                    room = rooms_collection.find_one(filter_id)
                except:
                    pass
            
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

            # Use $push to atomically add to array (avoids race conditions)
            push_field = f'images.{category}'
            
            # Ensure the images structure exists first
            if not room.get('images'):
                rooms_collection.update_one(filter_id, {
                    '$set': {'images': {'cover': [], 'bedroom': [], 'bathroom': [], 'exterior': []}}
                })
            elif category not in room.get('images', {}):
                rooms_collection.update_one(filter_id, {
                    '$set': {f'images.{category}': []}
                })
            
            # Now push the new image URL atomically
            result = rooms_collection.update_one(filter_id, {
                '$push': {push_field: image_url},
                '$set': {'updated_at': datetime.now(timezone.utc)}
            })

            if result.matched_count == 0:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

        return jsonify({
            'success': True, 
            'message': 'Image uploaded', 
            'imageUrl': image_url,
            'category': category
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# IMPORTANT: This route must come BEFORE the delete route with <path:image_id>
@app.route('/backend/api/admin/rooms/<room_id>/images/reorder', methods=['PUT', 'OPTIONS'])
def reorder_room_images(room_id):
    """Reorder images within a specific category"""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'PUT, OPTIONS')
        return response, 200
    
    try:
        data = request.get_json()
        # Valid categories: cover, bedroom, bathroom, exterior
        category = data.get('category', 'bedroom')
        new_order = data.get('images', [])  # Array of image URLs in new order
        
        print(f"🔄 Reordering {category} images for room {room_id}: {len(new_order)} images")
        
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            
            if 'images' not in room:
                room['images'] = {'cover': [], 'bedroom': [], 'bathroom': [], 'exterior': []}
            room['images'][category] = new_order
            room['updated_at'] = datetime.now().isoformat()
            
            with open(json_file_path, 'w', encoding='utf-8') as f:
                json.dump(fallback_rooms, f, indent=2, ensure_ascii=False)
        else:
            filter_id = {'_id': room_id}
            room = rooms_collection.find_one(filter_id)
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    filter_id = {'_id': obj_id}
                    room = rooms_collection.find_one(filter_id)
                except:
                    pass
            
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

            result = rooms_collection.update_one(filter_id, {
                '$set': {f'images.{category}': new_order, 'updated_at': datetime.now(timezone.utc)}
            })

            if result.matched_count == 0:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

        print(f"✓ Images reordered successfully")
        return jsonify({'success': True, 'message': 'Images reordered'}), 200
    except Exception as e:
        print(f"❌ Reorder error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/backend/api/admin/rooms/<room_id>/images/<path:image_id>', methods=['DELETE'])
def delete_room_image_multi(room_id, image_id):
    """Delete a specific image from a room's images array"""
    try:
        # URL decode the image_id in case it's encoded
        from urllib.parse import unquote
        image_id = unquote(image_id)
        print(f"🗑️ Deleting image: {image_id} from room {room_id}")
        
        # Find room
        target_room = None
        filter_id = {'_id': room_id}
        
        if rooms_collection is None:
            target_room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not target_room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
        else:
            target_room = rooms_collection.find_one(filter_id)
            if not target_room:
                try:
                    obj_id = ObjectId(room_id)
                    filter_id = {'_id': obj_id}
                    target_room = rooms_collection.find_one(filter_id)
                except:
                    return jsonify({'success': False, 'error': 'Room not found'}), 404

        if not target_room:
            return jsonify({'success': False, 'error': 'Room not found'}), 404

        # Find and remove the image from arrays
        images = target_room.get('images', {'cover': [], 'bedroom': [], 'bathroom': [], 'exterior': []})
        image_found = False
        image_url_to_delete = None
        
        # image_id could be a filename like "bedroom_xxx.jpg" or a full Cloudinary URL
        for category in ['cover', 'bedroom', 'bathroom', 'exterior']:
            if category in images:
                for url in images[category]:
                    # Match if URL ends with the filename, contains it, or exact match
                    if url.endswith(image_id) or image_id in url or url == image_id:
                        image_url_to_delete = url
                        images[category].remove(url)
                        image_found = True
                        print(f"✓ Found and removed image from {category}: {url}")
                        break
            if image_found:
                break

        if not image_found:
            return jsonify({'success': False, 'error': 'Image not found'}), 404

        # Delete actual file - handle both Cloudinary and local storage
        if image_url_to_delete:
            if 'cloudinary.com' in image_url_to_delete and USE_CLOUDINARY:
                # Extract public_id from Cloudinary URL and delete
                try:
                    # URL format: https://res.cloudinary.com/cloud_name/image/upload/v123/folder/public_id.ext
                    parts = image_url_to_delete.split('/upload/')
                    if len(parts) > 1:
                        public_id_with_ext = parts[1].split('?')[0]  # Remove query params
                        # Remove version prefix (v123456/)
                        if '/' in public_id_with_ext:
                            path_parts = public_id_with_ext.split('/')
                            if path_parts[0].startswith('v') and path_parts[0][1:].isdigit():
                                public_id_with_ext = '/'.join(path_parts[1:])
                        # Remove extension
                        public_id = os.path.splitext(public_id_with_ext)[0]
                        cloudinary.uploader.destroy(public_id)
                        print(f"✓ Deleted from Cloudinary: {public_id}")
                except Exception as e:
                    print(f"⚠️ Failed removing from Cloudinary: {e}")
            elif '/static/uploads/' in image_url_to_delete:
                # Local file deletion
                filename = image_url_to_delete.split('/static/uploads/')[-1]
                file_path = os.path.join(UPLOAD_FOLDER, filename)
                try:
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception as e:
                    print(f"⚠️ Failed removing file {file_path}: {e}")

        # Update room document
        if rooms_collection is None:
            target_room['images'] = images
            target_room['updated_at'] = datetime.now().isoformat()
            with open(json_file_path, 'w', encoding='utf-8') as f:
                json.dump(fallback_rooms, f, indent=2, ensure_ascii=False)
        else:
            rooms_collection.update_one(filter_id, {
                '$set': {'images': images, 'updated_at': datetime.now(timezone.utc)}
            })

        return jsonify({'success': True, 'message': 'Image deleted'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/backend/api/admin/rooms/<room_id>/images', methods=['PUT'])
def update_room_images_order(room_id):
    """Update room images order/structure"""
    try:
        data = request.get_json()
        images = data.get('images', {'cover': [], 'bedroom': [], 'bathroom': [], 'exterior': []})
        
        # Ensure all categories exist
        for cat in ['cover', 'bedroom', 'bathroom', 'exterior']:
            if cat not in images:
                images[cat] = []
        
        # Sync legacy imageUrl field with first cover image (for backward compatibility)
        new_image_url = images.get('cover', [None])[0] if images.get('cover') else None
        
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            
            room['images'] = images
            # Sync imageUrl with first cover image
            if new_image_url:
                room['imageUrl'] = new_image_url
            else:
                room.pop('imageUrl', None)  # Remove legacy field if no cover
            room['updated_at'] = datetime.now().isoformat()
            
            with open(json_file_path, 'w', encoding='utf-8') as f:
                json.dump(fallback_rooms, f, indent=2, ensure_ascii=False)
        else:
            filter_id = {'_id': room_id}
            room = rooms_collection.find_one(filter_id)
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    filter_id = {'_id': obj_id}
                except:
                    return jsonify({'success': False, 'error': 'Room not found'}), 404

            # Build update operation - sync imageUrl with first cover
            update_fields = {
                'images': images, 
                'updated_at': datetime.now(timezone.utc)
            }
            if new_image_url:
                update_fields['imageUrl'] = new_image_url
                result = rooms_collection.update_one(filter_id, {'$set': update_fields})
            else:
                # Remove legacy imageUrl if no cover images
                result = rooms_collection.update_one(filter_id, {
                    '$set': update_fields,
                    '$unset': {'imageUrl': ''}
                })

            if result.matched_count == 0:
                return jsonify({'success': False, 'error': 'Room not found'}), 404

        return jsonify({'success': True, 'message': 'Images order updated'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/backend/api/admin/rooms/<room_id>', methods=['DELETE'])
def delete_room(room_id):
    """Delete a room from MongoDB or fallback list"""
    try:
        if rooms_collection is None:
            # Delete from fallback data
            global fallback_rooms
            original_count = len(fallback_rooms)
            fallback_rooms = [r for r in fallback_rooms if r.get('_id') != room_id]
            
            if len(fallback_rooms) == original_count:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
        else:
            # Try to delete by _id as string first
            result = rooms_collection.delete_one({'_id': room_id})
            
            # If not found, try as ObjectId
            if result.deleted_count == 0:
                try:
                    obj_id = ObjectId(room_id)
                    result = rooms_collection.delete_one({'_id': obj_id})
                except:
                    pass
            
            if result.deleted_count == 0:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
        
        return jsonify({
            'success': True,
            'message': 'Room deleted successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ===== Booking API Endpoints =====

@app.route('/backend/api/admin/rooms/<room_id>/book', methods=['POST'])
def book_room(room_id):
    """Create a booking for a room"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('checkIn') or not data.get('checkOut') or not data.get('guestName'):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: checkIn, checkOut, guestName'
            }), 400
        
        check_in = data['checkIn']
        check_out = data['checkOut']
        guest_name = data['guestName']
        
        # Helper function to check for duplicate/overlapping bookings
        def has_duplicate_booking(existing_intervals):
            if not existing_intervals:
                return False
            for interval in existing_intervals:
                # Check for exact duplicate (same dates and guest)
                if (interval.get('checkIn') == check_in and 
                    interval.get('checkOut') == check_out and
                    interval.get('guestName') == guest_name):
                    return True
                # Check for overlapping dates
                existing_start = interval.get('checkIn', '')
                existing_end = interval.get('checkOut', '')
                if existing_start and existing_end:
                    # Dates overlap if: new_start < existing_end AND new_end > existing_start
                    if check_in < existing_end and check_out > existing_start:
                        return True
            return False
        
        # Create booking interval
        new_interval = {
            'checkIn': check_in,
            'checkOut': check_out,
            'guestName': guest_name,
            'guestPhone': data.get('guestPhone', ''),
            'guestEmail': data.get('guestEmail', ''),
            'notes': data.get('notes', ''),
            'createdAt': datetime.now().isoformat()
        }
        
        if rooms_collection is None:
            # Fallback mode
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            # Check for duplicate/overlapping bookings
            if has_duplicate_booking(room.get('bookedIntervals', [])):
                return jsonify({
                    'success': False,
                    'error': 'Booking already exists or dates overlap with existing booking'
                }), 409
            
            # Add to bookedIntervals
            if 'bookedIntervals' not in room:
                room['bookedIntervals'] = []
            room['bookedIntervals'].append(new_interval)
            room['updated_at'] = datetime.now().isoformat()
            
            # Save to JSON
            with open(json_file_path, 'w') as f:
                json.dump(fallback_rooms, f, indent=2)
        else:
            # MongoDB mode
            # Find room
            room = rooms_collection.find_one({'_id': room_id})
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                    room_id_filter = {'_id': obj_id}
                except:
                    return jsonify({
                        'success': False,
                        'error': 'Room not found'
                    }), 404
            else:
                room_id_filter = {'_id': room_id}
            
            # Check for duplicate/overlapping bookings
            if has_duplicate_booking(room.get('bookedIntervals', [])):
                return jsonify({
                    'success': False,
                    'error': 'Booking already exists or dates overlap with existing booking'
                }), 409
            
            # Add booking interval
            result = rooms_collection.update_one(
                room_id_filter,
                {
                    '$push': {'bookedIntervals': new_interval},
                    '$set': {
                        'updated_at': datetime.now()
                    }
                }
            )
            
            if result.modified_count == 0:
                return jsonify({
                    'success': False,
                    'error': 'Failed to update room'
                }), 500
        
        return jsonify({
            'success': True,
            'message': 'Booking created successfully',
            'data': new_interval
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms/<room_id>/unbook', methods=['POST'])
def unbook_room(room_id):
    """Cancel a booking for a room"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('checkIn') or not data.get('checkOut'):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: checkIn, checkOut'
            }), 400
        
        check_in = data['checkIn']
        check_out = data['checkOut']
        
        if rooms_collection is None:
            # Fallback mode
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            # Remove booking interval
            if 'bookedIntervals' in room:
                original_length = len(room['bookedIntervals'])
                room['bookedIntervals'] = [
                    interval for interval in room['bookedIntervals']
                    if not (interval['checkIn'] == check_in and interval['checkOut'] == check_out)
                ]
                
                if len(room['bookedIntervals']) == original_length:
                    return jsonify({
                        'success': False,
                        'error': 'Booking not found'
                    }), 404
                
                room['updated_at'] = datetime.now().isoformat()
                
                # Save to JSON
                with open(json_file_path, 'w') as f:
                    json.dump(fallback_rooms, f, indent=2)
        else:
            # MongoDB mode
            # Find room
            room = rooms_collection.find_one({'_id': room_id})
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                    room_id_filter = {'_id': obj_id}
                except:
                    return jsonify({
                        'success': False,
                        'error': 'Room not found'
                    }), 404
            else:
                room_id_filter = {'_id': room_id}
            
            # Remove booking interval
            result = rooms_collection.update_one(
                room_id_filter,
                {
                    '$pull': {
                        'bookedIntervals': {
                            'checkIn': check_in,
                            'checkOut': check_out
                        }
                    },
                    '$set': {
                        'updated_at': datetime.now()
                    }
                }
            )
            
            if result.modified_count == 0:
                return jsonify({
                    'success': False,
                    'error': 'Booking not found or failed to update'
                }), 404
        
        return jsonify({
            'success': True,
            'message': 'Booking cancelled successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms/<room_id>/update-booking', methods=['PUT'])
def update_booking(room_id):
    """Update booking information for a room"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('checkIn') or not data.get('checkOut') or not data.get('guestName'):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: checkIn, checkOut, guestName'
            }), 400
        
        check_in = data['checkIn']
        check_out = data['checkOut']
        guest_name = data['guestName']
        guest_phone = data.get('guestPhone', '')
        guest_email = data.get('guestEmail', '')
        notes = data.get('notes', '')
        
        if rooms_collection is None:
            # Fallback mode
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            # Find and update booking interval
            if 'bookedIntervals' in room:
                for interval in room['bookedIntervals']:
                    if interval['checkIn'] == check_in and interval['checkOut'] == check_out:
                        interval['guestName'] = guest_name
                        interval['guestPhone'] = guest_phone
                        interval['guestEmail'] = guest_email
                        interval['notes'] = notes
                        interval['updatedAt'] = datetime.now().isoformat()
                        break
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Booking not found'
                    }), 404
                
                room['updated_at'] = datetime.now().isoformat()
                
                # Save to JSON
                with open(json_file_path, 'w') as f:
                    json.dump(fallback_rooms, f, indent=2)
        else:
            # MongoDB mode
            room = rooms_collection.find_one({'_id': room_id})
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                    room_id_filter = {'_id': obj_id}
                except:
                    return jsonify({
                        'success': False,
                        'error': 'Room not found'
                    }), 404
            else:
                room_id_filter = {'_id': room_id}
            
            # Update the specific booking interval
            result = rooms_collection.update_one(
                {
                    **room_id_filter,
                    'bookedIntervals.checkIn': check_in,
                    'bookedIntervals.checkOut': check_out
                },
                {
                    '$set': {
                        'bookedIntervals.$.guestName': guest_name,
                        'bookedIntervals.$.guestPhone': guest_phone,
                        'bookedIntervals.$.guestEmail': guest_email,
                        'bookedIntervals.$.notes': notes,
                        'bookedIntervals.$.updatedAt': datetime.now(),
                        'updated_at': datetime.now()
                    }
                }
            )
            
            # Check matched_count instead of modified_count
            # modified_count can be 0 if data is the same, but matched_count shows if booking was found
            if result.matched_count == 0:
                return jsonify({
                    'success': False,
                    'error': 'Booking not found'
                }), 404
        
        return jsonify({
            'success': True,
            'message': 'Booking updated successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ===== iCal Sync API Endpoints =====

@app.route('/backend/api/admin/rooms/<room_id>/ical-url', methods=['PUT'])
@token_required
def update_ical_url(room_id):
    """Update the iCal URL for a room"""
    try:
        data = request.json
        ical_url = data.get('icalUrl', '').strip()
        
        # Validate URL format if provided
        if ical_url and not ical_url.startswith(('http://', 'https://')):
            return jsonify({
                'success': False,
                'error': 'Invalid URL format. Must start with http:// or https://'
            }), 400
        
        if rooms_collection is None:
            # Fallback mode
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            room['icalUrl'] = ical_url
            room['updated_at'] = datetime.now().isoformat()
            
            # Save to JSON
            with open(json_file_path, 'w') as f:
                json.dump(fallback_rooms, f, indent=2)
        else:
            # MongoDB mode
            room = rooms_collection.find_one({'_id': room_id})
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                    room_id_filter = {'_id': obj_id}
                except:
                    return jsonify({
                        'success': False,
                        'error': 'Room not found'
                    }), 404
            else:
                room_id_filter = {'_id': room_id}
            
            result = rooms_collection.update_one(
                room_id_filter,
                {
                    '$set': {
                        'icalUrl': ical_url,
                        'updated_at': datetime.now()
                    }
                }
            )
            
            if result.matched_count == 0:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
        
        return jsonify({
            'success': True,
            'message': 'iCal URL updated successfully',
            'icalUrl': ical_url
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms/<room_id>/promotion', methods=['PUT'])
@admin_required
def update_room_promotion(room_id):
    """Update the promotion (discount price) for a room - Admin only"""
    try:
        data = request.json
        is_active = data.get('active', False)
        discount_price = data.get('discountPrice')
        
        # Validate discount price if promotion is active
        if is_active:
            if discount_price is None or discount_price <= 0:
                return jsonify({
                    'success': False,
                    'error': 'Discount price must be a positive number'
                }), 400
            discount_price = float(discount_price)
        
        if rooms_collection is None:
            # Fallback mode
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
            
            if is_active:
                room['promotion'] = {
                    'active': True,
                    'discountPrice': discount_price
                }
            else:
                room.pop('promotion', None)
            
            room['updated_at'] = datetime.now().isoformat()
            
            # Save to JSON
            try:
                with open(json_file_path, 'w') as f:
                    json.dump(fallback_rooms, f, indent=2)
            except Exception as save_error:
                print(f"Warning: Could not save to JSON: {save_error}")
        else:
            # MongoDB mode
            room = rooms_collection.find_one({'_id': room_id})
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                    room_id_filter = {'_id': obj_id}
                except:
                    return jsonify({
                        'success': False,
                        'error': 'Room not found'
                    }), 404
            else:
                room_id_filter = {'_id': room_id}
            
            if is_active:
                update_doc = {
                    '$set': {
                        'promotion': {
                            'active': True,
                            'discountPrice': discount_price
                        },
                        'updated_at': datetime.now(timezone.utc)
                    }
                }
            else:
                update_doc = {
                    '$unset': {'promotion': ''},
                    '$set': {'updated_at': datetime.now(timezone.utc)}
                }
            
            result = rooms_collection.update_one(room_id_filter, update_doc)
            
            if result.matched_count == 0:
                return jsonify({
                    'success': False,
                    'error': 'Room not found'
                }), 404
        
        return jsonify({
            'success': True,
            'message': f'Promotion {"activated" if is_active else "deactivated"} successfully',
            'promotion': {'active': is_active, 'discountPrice': discount_price} if is_active else None
        }), 200
    except Exception as e:
        print(f"Update promotion error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/rooms/<room_id>/sync-ical', methods=['POST'])
@token_required
def sync_ical(room_id):
    """Sync bookings from iCal URL for a room"""
    try:
        if not ICAL_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'iCal sync is not available. Please install icalendar package.'
            }), 503
        
        # Get the room
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
        else:
            room = rooms_collection.find_one({'_id': room_id})
            if not room:
                try:
                    obj_id = ObjectId(room_id)
                    room = rooms_collection.find_one({'_id': obj_id})
                except:
                    pass
        
        if not room:
            return jsonify({
                'success': False,
                'error': 'Room not found'
            }), 404
        
        ical_url = room.get('icalUrl', '')
        if not ical_url:
            return jsonify({
                'success': False,
                'error': 'No iCal URL configured for this room'
            }), 400
        
        # Fetch iCal data from URL
        try:
            response = requests.get(ical_url, timeout=30, headers={
                'User-Agent': 'KhietAnHomestay-Calendar-Sync/1.0'
            })
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            return jsonify({
                'success': False,
                'error': f'Failed to fetch iCal data: {str(e)}'
            }), 502
        
        # Parse iCal data
        try:
            cal = Calendar.from_ical(response.content)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Failed to parse iCal data: {str(e)}'
            }), 400
        
        # Extract booking events
        new_bookings = []
        existing_intervals = room.get('bookedIntervals', [])
        synced_count = 0
        skipped_count = 0
        
        for component in cal.walk():
            if component.name == 'VEVENT':
                try:
                    # Get event details
                    dtstart = component.get('DTSTART')
                    dtend = component.get('DTEND')
                    summary = str(component.get('SUMMARY', 'Airbnb Booking'))
                    uid = str(component.get('UID', ''))
                    
                    if not dtstart or not dtend:
                        continue
                    
                    # Convert to date strings (YYYY-MM-DD)
                    start_date = dtstart.dt
                    end_date = dtend.dt
                    
                    # Handle datetime vs date objects
                    if hasattr(start_date, 'date'):
                        start_date = start_date.date()
                    if hasattr(end_date, 'date'):
                        end_date = end_date.date()
                    
                    check_in = start_date.strftime('%Y-%m-%d')
                    check_out = end_date.strftime('%Y-%m-%d')
                    
                    # Skip past bookings
                    today = datetime.now().date()
                    if end_date < today:
                        skipped_count += 1
                        continue
                    
                    # Check if booking already exists (avoid duplicates)
                    is_duplicate = False
                    for interval in existing_intervals:
                        if interval.get('checkIn') == check_in and interval.get('checkOut') == check_out:
                            is_duplicate = True
                            break
                        # Also check by UID if available
                        if uid and interval.get('icalUid') == uid:
                            is_duplicate = True
                            break
                    
                    if is_duplicate:
                        skipped_count += 1
                        continue
                    
                    # Create booking interval
                    new_interval = {
                        'checkIn': check_in,
                        'checkOut': check_out,
                        'guestName': summary if summary != 'Reserved' else 'Airbnb Guest',
                        'guestPhone': '',
                        'guestEmail': '',
                        'notes': f'Synced from Airbnb iCal',
                        'source': 'airbnb_ical',
                        'icalUid': uid,
                        'createdAt': datetime.now().isoformat()
                    }
                    
                    new_bookings.append(new_interval)
                    synced_count += 1
                    
                except Exception as e:
                    print(f"Error processing iCal event: {e}")
                    continue
        
        # Update room with new bookings
        if new_bookings:
            if rooms_collection is None:
                # Fallback mode
                if 'bookedIntervals' not in room:
                    room['bookedIntervals'] = []
                room['bookedIntervals'].extend(new_bookings)
                room['lastIcalSync'] = datetime.now().isoformat()
                room['updated_at'] = datetime.now().isoformat()
                
                with open(json_file_path, 'w') as f:
                    json.dump(fallback_rooms, f, indent=2)
            else:
                # MongoDB mode
                room_id_filter = {'_id': room_id} if not isinstance(room.get('_id'), ObjectId) else {'_id': room.get('_id')}
                
                rooms_collection.update_one(
                    room_id_filter,
                    {
                        '$push': {'bookedIntervals': {'$each': new_bookings}},
                        '$set': {
                            'lastIcalSync': datetime.now(),
                            'updated_at': datetime.now()
                        }
                    }
                )
        else:
            # Update last sync time even if no new bookings
            if rooms_collection is not None:
                room_id_filter = {'_id': room_id} if not isinstance(room.get('_id'), ObjectId) else {'_id': room.get('_id')}
                rooms_collection.update_one(
                    room_id_filter,
                    {'$set': {'lastIcalSync': datetime.now(), 'updated_at': datetime.now()}}
                )
        
        return jsonify({
            'success': True,
            'message': f'iCal sync completed. {synced_count} new bookings added, {skipped_count} skipped.',
            'syncedCount': synced_count,
            'skippedCount': skipped_count,
            'lastSync': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/backend/api/admin/sync-all-ical', methods=['POST'])
@token_required
def sync_all_ical():
    """Sync iCal for all rooms that have an iCal URL configured"""
    try:
        if not ICAL_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'iCal sync is not available. Please install icalendar package.'
            }), 503
        
        results = []
        
        if rooms_collection is None:
            rooms = fallback_rooms
        else:
            rooms = list(rooms_collection.find())
        
        for room in rooms:
            ical_url = room.get('icalUrl', '')
            room_id = str(room.get('_id', ''))
            room_name = room.get('name', 'Unknown')
            
            if not ical_url:
                continue
            
            try:
                # Fetch and parse iCal
                response = requests.get(ical_url, timeout=30, headers={
                    'User-Agent': 'KhietAnHomestay-Calendar-Sync/1.0'
                })
                response.raise_for_status()
                cal = Calendar.from_ical(response.content)
                
                existing_intervals = room.get('bookedIntervals', [])
                new_bookings = []
                synced_count = 0
                
                for component in cal.walk():
                    if component.name == 'VEVENT':
                        try:
                            dtstart = component.get('DTSTART')
                            dtend = component.get('DTEND')
                            summary = str(component.get('SUMMARY', 'Airbnb Booking'))
                            uid = str(component.get('UID', ''))
                            
                            if not dtstart or not dtend:
                                continue
                            
                            start_date = dtstart.dt
                            end_date = dtend.dt
                            
                            if hasattr(start_date, 'date'):
                                start_date = start_date.date()
                            if hasattr(end_date, 'date'):
                                end_date = end_date.date()
                            
                            check_in = start_date.strftime('%Y-%m-%d')
                            check_out = end_date.strftime('%Y-%m-%d')
                            
                            today = datetime.now().date()
                            if end_date < today:
                                continue
                            
                            is_duplicate = False
                            for interval in existing_intervals:
                                if (interval.get('checkIn') == check_in and interval.get('checkOut') == check_out) or \
                                   (uid and interval.get('icalUid') == uid):
                                    is_duplicate = True
                                    break
                            
                            if is_duplicate:
                                continue
                            
                            new_interval = {
                                'checkIn': check_in,
                                'checkOut': check_out,
                                'guestName': summary if summary != 'Reserved' else 'Airbnb Guest',
                                'guestPhone': '',
                                'guestEmail': '',
                                'notes': f'Synced from Airbnb iCal',
                                'source': 'airbnb_ical',
                                'icalUid': uid,
                                'createdAt': datetime.now().isoformat()
                            }
                            
                            new_bookings.append(new_interval)
                            synced_count += 1
                            
                        except Exception:
                            continue
                
                # Update room
                if new_bookings:
                    if rooms_collection is not None:
                        room_id_filter = {'_id': room.get('_id')}
                        rooms_collection.update_one(
                            room_id_filter,
                            {
                                '$push': {'bookedIntervals': {'$each': new_bookings}},
                                '$set': {'lastIcalSync': datetime.now(), 'updated_at': datetime.now()}
                            }
                        )
                    else:
                        room['bookedIntervals'] = existing_intervals + new_bookings
                        room['lastIcalSync'] = datetime.now().isoformat()
                
                results.append({
                    'roomId': room_id,
                    'roomName': room_name,
                    'success': True,
                    'syncedCount': synced_count
                })
                
            except Exception as e:
                results.append({
                    'roomId': room_id,
                    'roomName': room_name,
                    'success': False,
                    'error': str(e)
                })
        
        # Save fallback data if using JSON
        if rooms_collection is None:
            with open(json_file_path, 'w') as f:
                json.dump(fallback_rooms, f, indent=2)
        
        total_synced = sum(r.get('syncedCount', 0) for r in results if r.get('success'))
        successful_rooms = sum(1 for r in results if r.get('success'))
        
        return jsonify({
            'success': True,
            'message': f'Synced {successful_rooms} rooms, {total_synced} total new bookings',
            'results': results
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ===== Health Check =====
@app.route('/backend/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        if client is not None:
            client.admin.command('ping')
            return jsonify({
                'status': 'healthy',
                'database': 'connected',
                'source': 'mongodb'
            }), 200
        else:
            # Running in fallback mode with JSON data
            return jsonify({
                'status': 'healthy',
                'database': 'disconnected',
                'source': 'fallback_json',
                'rooms_loaded': len(fallback_rooms)
            }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

# ===== Error Handlers =====
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# For Vercel deployment - expose the app
app = app

if __name__ == '__main__':
    # Use threaded=True to handle multiple concurrent requests properly
    # Disable use_reloader to prevent server restart when uploading files to static folder
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True, use_reloader=False)
