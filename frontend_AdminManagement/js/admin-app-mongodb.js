// ===== Configuration =====
const API_BASE_URL = 'http://localhost:5000/backend/api/admin';

// ===== Authentication =====
const VALID_CREDENTIALS = {
    username: 'trungkien',
    password: '123456'
};

// Check if user is logged in on page load
document.addEventListener('DOMContentLoaded', function() {
    const isLoggedIn = sessionStorage.getItem('adminLoggedIn');
    if (isLoggedIn === 'true') {
        showDashboard();
    } else {
        showLoginPage();
    }
});

// Login handler
function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');
    
    console.log('Login attempt:', { username, password }); // Debug log
    console.log('Expected:', VALID_CREDENTIALS); // Debug log
    
    // Validate credentials
    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
        console.log('Login successful!'); // Debug log
        sessionStorage.setItem('adminLoggedIn', 'true');
        sessionStorage.setItem('adminUsername', username);
        showDashboard();
        errorElement.textContent = '';
    } else {
        console.log('Login failed - credentials mismatch'); // Debug log
        errorElement.textContent = 'Invalid username or password';
        document.getElementById('password').value = '';
    }
}

// Show login page
function showLoginPage() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('admin-dashboard').style.display = 'none';
}

// Show dashboard
function showDashboard() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';
    const username = sessionStorage.getItem('adminUsername') || 'Administrator';
    document.getElementById('logged-user').textContent = username;
    
    // Initialize dashboard
    roomManager.loadRooms();
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('adminLoggedIn');
        sessionStorage.removeItem('adminUsername');
        document.getElementById('login-form').reset();
        document.getElementById('login-error').textContent = '';
        showLoginPage();
    }
}

// ===== Room Management System =====
class RoomManager {
    constructor() {
        this.rooms = [];
        this.apiUrl = API_BASE_URL + '/rooms';
    }

    // Load rooms from MongoDB
    async loadRooms() {
        try {
            const response = await fetch(this.apiUrl);
            const result = await response.json();
            
            if (result.success) {
                this.rooms = result.data || [];
                console.log(`✓ Loaded ${this.rooms.length} rooms from database`);
                updateDashboard();
                displayRooms();
            } else {
                console.error('Failed to load rooms:', result.error);
                alert('Failed to load rooms from database');
            }
        } catch (error) {
            console.error('Error loading rooms:', error);
            alert('Error connecting to database');
        }
    }

    // Get all rooms
    getAllRooms() {
        return this.rooms;
    }

    // Get all taken room IDs
    getTakenRoomIds() {
        return this.rooms.map(r => r.room_id || r.id).filter(id => id);
    }

    // Check if room ID exists
    isRoomIdTaken(roomId) {
        return this.rooms.some(r => r.room_id === roomId || r.id === roomId);
    }

    // Get room by ID
    getRoomById(id) {
        return this.rooms.find(r => r.room_id === String(id) || r.id === String(id));
    }

    // Add new room
    async addRoom(roomData) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roomData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✓ Room added successfully');
                await this.loadRooms();
                return result.data;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error adding room:', error);
            throw error;
        }
    }

    // Update room
    async updateRoom(id, roomData) {
        try {
            const response = await fetch(`${this.apiUrl}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roomData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✓ Room updated successfully');
                await this.loadRooms();
                return result.data;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error updating room:', error);
            throw error;
        }
    }

    // Delete room
    async deleteRoom(id) {
        try {
            const response = await fetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✓ Room deleted successfully');
                await this.loadRooms();
                return true;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error deleting room:', error);
            throw error;
        }
    }

    // Get statistics
    async getStats() {
        try {
            const response = await fetch(`${this.apiUrl}/stats`);
            const result = await response.json();
            
            if (result.success) {
                return result.data;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
            return { total: 0, available: 0, booked: 0 };
        }
    }
}

// Initialize Room Manager
const roomManager = new RoomManager();

// ===== UI Functions =====

// Switch tabs
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Mark menu item as active
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Update content based on tab
    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'rooms') {
        displayRooms();
    } else if (tabName === 'add-room') {
        resetForm();
    }
}

// Update dashboard
async function updateDashboard() {
    const stats = await roomManager.getStats();
    
    document.getElementById('total-rooms').textContent = stats.total || 0;
    document.getElementById('available-count').textContent = stats.available || 0;
    document.getElementById('booked-count').textContent = stats.booked || 0;
    
    // Display quick preview
    const gridContainer = document.getElementById('quick-rooms-grid');
    gridContainer.innerHTML = '';
    
    roomManager.getAllRooms().forEach(room => {
        const card = document.createElement('div');
        card.className = `quick-room-card ${room.status}`;
        card.innerHTML = `
            <span class="quick-room-status ${room.status}">${room.status.toUpperCase()}</span>
            <h4>${room.name}</h4>
            <p>$${room.price}/night</p>
            <p>${room.capacity} guests</p>
        `;
        card.onclick = () => openQuickEditModal(room.room_id);
        card.style.cursor = 'pointer';
        gridContainer.appendChild(card);
    });
}

// Display rooms in table
function displayRooms() {
    const tableBody = document.getElementById('rooms-list');
    tableBody.innerHTML = '';
    
    roomManager.getAllRooms().forEach(room => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${room.name}</strong></td>
            <td>$${room.price}</td>
            <td>${room.capacity} guests</td>
            <td><span class="status-badge ${room.status}">${room.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon" onclick="editRoom('${room.room_id}')">Edit</button>
                    <button class="btn-icon btn-delete" onclick="deleteRoomConfirm('${room.room_id}')">Delete</button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Filter rooms
function filterRooms() {
    const searchTerm = document.getElementById('search-rooms').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    
    const tableBody = document.getElementById('rooms-list');
    tableBody.innerHTML = '';
    
    roomManager.getAllRooms()
        .filter(room => {
            const matchesSearch = room.name.toLowerCase().includes(searchTerm);
            const matchesStatus = !statusFilter || room.status === statusFilter;
            return matchesSearch && matchesStatus;
        })
        .forEach(room => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${room.name}</strong></td>
                <td>$${room.price}</td>
                <td>${room.capacity} guests</td>
                <td><span class="status-badge ${room.status}">${room.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="editRoom('${room.room_id}')">Edit</button>
                        <button class="btn-icon btn-delete" onclick="deleteRoomConfirm('${room.room_id}')">Delete</button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
}

// Save room (add or update)
async function saveRoom(event) {
    event.preventDefault();
    
    const roomId = document.getElementById('room-id').value;
    const customId = document.getElementById('room-custom-id')?.value;
    
    // Validate custom ID format (4 digits)
    if (!roomId && customId && !/^[0-9]{4}$/.test(customId)) {
        alert('Room ID must be exactly 4 digits (e.g., 0101, 0201)');
        return;
    }
    
    // Check if room ID is already taken (only for new rooms)
    if (!roomId && customId && roomManager.isRoomIdTaken(customId)) {
        alert(`Room ID "${customId}" is already taken. Please choose a different ID.`);
        document.getElementById('room-custom-id').focus();
        return;
    }
    
    const roomData = {
        name: document.getElementById('room-name').value,
        price: parseFloat(document.getElementById('room-price').value),
        capacity: parseInt(document.getElementById('room-capacity').value),
        description: document.getElementById('room-description').value,
        amenities: document.getElementById('room-amenities').value.split(',').map(a => a.trim()),
        status: document.getElementById('room-status').value,
        booked_until: document.getElementById('room-status').value === 'booked' 
            ? document.getElementById('booked-until').value 
            : null
    };
    
    // Add custom ID for new rooms
    if (!roomId && customId) {
        roomData.custom_id = customId;
    }
    
    try {
        if (roomId) {
            await roomManager.updateRoom(roomId, roomData);
            alert('Room updated successfully!');
        } else {
            await roomManager.addRoom(roomData);
            alert('Room added successfully!');
        }
        
        resetForm();
        displayRooms();
        updateDashboard();
    } catch (error) {
        alert('Error saving room: ' + error.message);
    }
}

// Edit room
function editRoom(id) {
    const room = roomManager.getRoomById(id);
    if (!room) return;
    
    document.getElementById('edit-room-id').value = room.room_id;
    document.getElementById('edit-room-display-id').value = room.room_id;
    document.getElementById('edit-room-name').value = room.name;
    document.getElementById('edit-room-price').value = room.price;
    document.getElementById('edit-room-capacity').value = room.capacity;
    document.getElementById('edit-room-description').value = room.description;
    document.getElementById('edit-room-amenities').value = room.amenities.join(', ');
    document.getElementById('edit-room-status').value = room.status;
    
    if (room.status === 'booked') {
        document.getElementById('edit-booked-until-group').style.display = 'block';
        document.getElementById('edit-booked-until').value = room.booked_until || '';
    }
    
    document.getElementById('edit-form').onsubmit = async function(e) {
        e.preventDefault();
        const updatedData = {
            name: document.getElementById('edit-room-name').value,
            price: parseFloat(document.getElementById('edit-room-price').value),
            capacity: parseInt(document.getElementById('edit-room-capacity').value),
            description: document.getElementById('edit-room-description').value,
            amenities: document.getElementById('edit-room-amenities').value.split(',').map(a => a.trim()),
            status: document.getElementById('edit-room-status').value,
            booked_until: document.getElementById('edit-room-status').value === 'booked' 
                ? document.getElementById('edit-booked-until').value 
                : null
        };
        
        try {
            await roomManager.updateRoom(id, updatedData);
            alert('Room updated successfully!');
            closeModal();
            displayRooms();
            updateDashboard();
        } catch (error) {
            alert('Error updating room: ' + error.message);
        }
    };
    
    document.getElementById('edit-modal').style.display = 'flex';
}

// Delete room with confirmation
async function deleteRoomConfirm(id) {
    if (confirm('Are you sure you want to delete this room?')) {
        try {
            await roomManager.deleteRoom(id);
            alert('Room deleted successfully!');
            displayRooms();
            updateDashboard();
        } catch (error) {
            alert('Error deleting room: ' + error.message);
        }
    }
}

// Close modal
function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

// Reset form
function resetForm() {
    document.getElementById('room-form').reset();
    document.getElementById('room-id').value = '';
    const customIdField = document.getElementById('room-custom-id');
    if (customIdField) {
        customIdField.value = '';
        customIdField.disabled = false;  // Re-enable for new rooms
    }
    document.getElementById('form-title').textContent = 'Add New Room';
    document.getElementById('booked-until-group').style.display = 'none';
}

// Update availability fields on status change
function updateAvailabilityFields() {
    const status = document.getElementById('room-status').value;
    const bookedUntilGroup = document.getElementById('booked-until-group');
    
    if (status === 'booked') {
        bookedUntilGroup.style.display = 'block';
        document.getElementById('booked-until').required = true;
    } else {
        bookedUntilGroup.style.display = 'none';
        document.getElementById('booked-until').required = false;
    }
}

function updateEditAvailabilityFields() {
    const status = document.getElementById('edit-room-status').value;
    const bookedUntilGroup = document.getElementById('edit-booked-until-group');
    
    if (status === 'booked') {
        bookedUntilGroup.style.display = 'block';
        document.getElementById('edit-booked-until').required = true;
    } else {
        bookedUntilGroup.style.display = 'none';
        document.getElementById('edit-booked-until').required = false;
    }
}

// Quick edit modal for status update from dashboard
function openQuickEditModal(id) {
    const room = roomManager.getRoomById(id);
    if (!room) return;
    
    const modal = document.getElementById('quick-edit-modal');
    const modalContent = modal.querySelector('.quick-edit-content');
    
    modalContent.innerHTML = `
        <span class="modal-close" onclick="closeQuickEditModal()">&times;</span>
        <h2>Quick Edit: ${room.name}</h2>
        <form id="quick-edit-form" onsubmit="saveQuickEdit(event, '${id}')">
            <div class="form-group">
                <label for="quick-status">Room Status *</label>
                <select id="quick-status" required onchange="updateQuickAvailabilityFields()">
                    <option value="available" ${room.status === 'available' ? 'selected' : ''}>Available</option>
                    <option value="booked" ${room.status === 'booked' ? 'selected' : ''}>Booked</option>
                    <option value="maintenance" ${room.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                </select>
            </div>
            <div class="form-group" id="quick-booked-until-group" style="display:${room.status === 'booked' ? 'block' : 'none'}">
                <label for="quick-booked-until">Booked Until *</label>
                <input type="date" id="quick-booked-until" value="${room.booked_until || ''}">
            </div>
            <div class="form-group">
                <label for="quick-price">Price per Night (USD)</label>
                <input type="number" id="quick-price" value="${room.price}" step="0.01">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn-primary">Update Room</button>
                <button type="button" class="btn-secondary" onclick="closeQuickEditModal()">Cancel</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'flex';
}

// Save quick edit
async function saveQuickEdit(event, id) {
    event.preventDefault();
    
    const status = document.getElementById('quick-status').value;
    const price = parseFloat(document.getElementById('quick-price').value);
    const booked_until = status === 'booked' ? document.getElementById('quick-booked-until').value : null;
    
    const updatedData = {
        status: status,
        price: price,
        booked_until: booked_until
    };
    
    try {
        await roomManager.updateRoom(id, updatedData);
        alert('Room status updated successfully!');
        closeQuickEditModal();
        updateDashboard();
        displayRooms();
    } catch (error) {
        alert('Error updating room: ' + error.message);
    }
}

// Close quick edit modal
function closeQuickEditModal() {
    document.getElementById('quick-edit-modal').style.display = 'none';
}

// Update quick edit availability fields
function updateQuickAvailabilityFields() {
    const status = document.getElementById('quick-status').value;
    const bookedUntilGroup = document.getElementById('quick-booked-until-group');
    
    if (status === 'booked') {
        bookedUntilGroup.style.display = 'block';
        document.getElementById('quick-booked-until').required = true;
    } else {
        bookedUntilGroup.style.display = 'none';
        document.getElementById('quick-booked-until').required = false;
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const editModal = document.getElementById('edit-modal');
    const quickEditModal = document.getElementById('quick-edit-modal');
    
    if (event.target === editModal) {
        editModal.style.display = 'none';
    }
    if (event.target === quickEditModal) {
        quickEditModal.style.display = 'none';
    }
    
    // Close taken IDs popup when clicking overlay
    if (event.target.classList.contains('popup-overlay')) {
        closeTakenIdsPopup();
    }
}

// ===== Room ID Validation =====

// Validate Room ID in real-time
function validateRoomId(value) {
    const statusEl = document.getElementById('room-id-status');
    const inputEl = document.getElementById('room-custom-id');
    
    // Clear status if empty
    if (!value) {
        statusEl.textContent = '';
        statusEl.className = 'validation-message';
        inputEl.style.borderColor = '';
        return;
    }
    
    // Check format (4 digits)
    if (!/^[0-9]{4}$/.test(value)) {
        if (value.length < 4) {
            statusEl.textContent = `Enter ${4 - value.length} more digit(s)`;
            statusEl.className = 'validation-message';
        } else {
            statusEl.textContent = '❌ Must be exactly 4 digits';
            statusEl.className = 'validation-message error';
        }
        inputEl.style.borderColor = '';
        return;
    }
    
    // Check if ID is taken
    if (roomManager.isRoomIdTaken(value)) {
        statusEl.textContent = '❌ This Room ID is already taken';
        statusEl.className = 'validation-message error';
        inputEl.style.borderColor = '#d32f2f';
    } else {
        statusEl.textContent = '✅ Room ID is available';
        statusEl.className = 'validation-message success';
        inputEl.style.borderColor = '#3d5a40';
    }
}

// Show popup with all taken Room IDs
function showTakenRoomIds() {
    const takenIds = roomManager.getTakenRoomIds();
    
    // Remove existing popup if any
    closeTakenIdsPopup();
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.id = 'taken-ids-overlay';
    
    // Create popup
    const popup = document.createElement('div');
    popup.className = 'taken-ids-popup';
    popup.id = 'taken-ids-popup';
    
    // Sort IDs numerically
    const sortedIds = takenIds.sort((a, b) => {
        const numA = parseInt(a) || 0;
        const numB = parseInt(b) || 0;
        return numA - numB;
    });
    
    popup.innerHTML = `
        <h3>🏠 Taken Room IDs (${sortedIds.length})</h3>
        <div class="taken-ids-list">
            ${sortedIds.length > 0 
                ? sortedIds.map(id => `<span class="taken-id-badge">${id}</span>`).join('')
                : '<p style="color: #666;">No rooms have been added yet.</p>'
            }
        </div>
        <button class="btn-primary" onclick="closeTakenIdsPopup()" style="width: 100%;">Close</button>
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
}

// Close the taken IDs popup
function closeTakenIdsPopup() {
    const overlay = document.getElementById('taken-ids-overlay');
    const popup = document.getElementById('taken-ids-popup');
    if (overlay) overlay.remove();
    if (popup) popup.remove();
}