from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from pymongo import ReplaceOne
from bson.objectid import ObjectId
from dotenv import load_dotenv
import os
import json
from datetime import datetime

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
app = Flask(__name__)
CORS(app)

# Initialize variables
client = None
db = None
rooms_collection = None
fallback_rooms = []

# MongoDB Connection - Try Primary Source First
print("🔄 Attempting MongoDB connection...")
json_file_path = os.path.join(os.path.dirname(__file__), 'rooms_data.json')

try:
    uri = os.getenv('MONGODB_URI')
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
    
    # Sync MongoDB data to local JSON file for backup/fallback
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
        'status': room.get('bookingStatus', 'available'),
        'bookingStatus': room.get('bookingStatus', 'available'),
        'bookedIntervals': room.get('bookedIntervals', []),  # Include booking intervals for calendar
        'created_at': str(room.get('created_at', '')) if room.get('created_at') else None,
        'updated_at': str(room.get('updated_at', '')) if room.get('updated_at') else None
    }
    return api_room

# ===== Room API Endpoints =====

@app.route('/backend/api/admin/rooms/stats', methods=['GET'])
def get_room_stats():
    """Get room statistics"""
    try:
        if rooms_collection is None:
            # Use fallback data
            rooms = fallback_rooms
        else:
            rooms = list(rooms_collection.find())
        
        stats = {
            'total': len(rooms),
            'available': len([r for r in rooms if r.get('bookingStatus') == 'available']),
            'booked': len([r for r in rooms if r.get('bookingStatus') == 'booked']),
            'maintenance': len([r for r in rooms if r.get('bookingStatus') == 'maintenance'])
        }
        
        return jsonify({
            'success': True,
            'data': stats
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

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
        required_fields = ['name', 'price', 'capacity', 'description', 'amenities', 'status']
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
            'bookingStatus': data.get('status', 'available'),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
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
            if 'status' in data:
                room['bookingStatus'] = data['status']
            room['updated_at'] = datetime.utcnow().isoformat()
            
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
            if 'status' in data:
                updated_room['bookingStatus'] = data['status']
            if 'bookingStatus' in data:
                updated_room['bookingStatus'] = data['bookingStatus']
            
            updated_room['updated_at'] = datetime.utcnow()
            
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
        
        # Create booking interval
        new_interval = {
            'checkIn': data['checkIn'],
            'checkOut': data['checkOut'],
            'guestName': data['guestName'],
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
            
            # Add to bookedIntervals
            if 'bookedIntervals' not in room:
                room['bookedIntervals'] = []
            room['bookedIntervals'].append(new_interval)
            
            # Update booking status
            room['bookingStatus'] = 'booked'
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
            
            # Add booking interval
            result = rooms_collection.update_one(
                room_id_filter,
                {
                    '$push': {'bookedIntervals': new_interval},
                    '$set': {
                        'bookingStatus': 'booked',
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
                
                # Update booking status if no more bookings
                if len(room['bookedIntervals']) == 0:
                    room['bookingStatus'] = 'available'
                
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
            
            # Check if there are any remaining bookings
            updated_room = rooms_collection.find_one(room_id_filter)
            if not updated_room.get('bookedIntervals') or len(updated_room.get('bookedIntervals', [])) == 0:
                # No more bookings, set status to available
                rooms_collection.update_one(
                    room_id_filter,
                    {'$set': {'bookingStatus': 'available'}}
                )
        
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

if __name__ == '__main__':
    app.run(debug=True, host='localhost', port=5000)
