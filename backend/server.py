from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from pymongo import ReplaceOne
from bson.objectid import ObjectId
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import os
import json
from datetime import datetime, timezone

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

# Configure CORS for global access
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Accept"],
        "supports_credentials": False
    }
})

# Initialize variables
client = None
db = None
rooms_collection = None
fallback_rooms = []

# Detect Vercel environment (read-only filesystem)
IS_VERCEL = os.environ.get('VERCEL', False) or os.environ.get('VERCEL_ENV', False)

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
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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
        'created_at': str(room.get('created_at', '')) if room.get('created_at') else None,
        'updated_at': str(room.get('updated_at', '')) if room.get('updated_at') else None
    }
    # Include legacy single imageUrl if present
    if room.get('imageUrl'):
        api_room['imageUrl'] = room.get('imageUrl')
    # Include multi-image structure
    if room.get('images'):
        api_room['images'] = room.get('images')
    return api_room

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
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400

        filename = secure_filename(file.filename)
        # Make filename unique
        base, ext = os.path.splitext(filename)
        unique_name = f"{base}_{int(datetime.now(timezone.utc).timestamp())}{ext}"
        save_path = os.path.join(UPLOAD_FOLDER, unique_name)
        file.save(save_path)

        # Build public URL path (matches static_url_path='/backend/static')
        image_url = f"/backend/static/uploads/{unique_name}"

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
    """Upload an image for a room with category (cover/room)"""
    try:
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400

        category = request.form.get('category', 'room')  # 'cover' or 'room'
        order = int(request.form.get('order', 0))

        filename = secure_filename(file.filename)
        # Make filename unique with category
        base, ext = os.path.splitext(filename)
        unique_name = f"{category}_{base}_{int(datetime.now(timezone.utc).timestamp())}_{order}{ext}"
        save_path = os.path.join(UPLOAD_FOLDER, unique_name)
        file.save(save_path)

        # Build public URL path
        image_url = f"/backend/static/uploads/{unique_name}"

        # Update room document - add to images array
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            
            if 'images' not in room:
                room['images'] = {'cover': [], 'room': []}
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
                    '$set': {'images': {'cover': [], 'room': []}}
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
        category = data.get('category', 'room')  # 'cover' or 'room'
        new_order = data.get('images', [])  # Array of image URLs in new order
        
        print(f"🔄 Reordering {category} images for room {room_id}: {len(new_order)} images")
        
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            
            if 'images' not in room:
                room['images'] = {'cover': [], 'room': []}
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
        images = target_room.get('images', {'cover': [], 'room': []})
        image_found = False
        image_url_to_delete = None
        
        # image_id could be a filename like "room_xxx.jpg"
        for category in ['cover', 'room']:
            if category in images:
                for url in images[category]:
                    # Match if URL ends with the filename
                    if url.endswith(image_id) or image_id in url or url == image_id:
                        image_url_to_delete = url
                        images[category].remove(url)
                        image_found = True
                        print(f"✓ Found and removed image: {url}")
                        break
            if image_found:
                break

        if not image_found:
            return jsonify({'success': False, 'error': 'Image not found'}), 404

        # Delete actual file if local
        if image_url_to_delete and '/static/uploads/' in image_url_to_delete:
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
        images = data.get('images', {'cover': [], 'room': []})
        
        if rooms_collection is None:
            room = next((r for r in fallback_rooms if r.get('_id') == room_id), None)
            if not room:
                return jsonify({'success': False, 'error': 'Room not found'}), 404
            
            room['images'] = images
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

            result = rooms_collection.update_one(filter_id, {
                '$set': {'images': images, 'updated_at': datetime.now(timezone.utc)}
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
