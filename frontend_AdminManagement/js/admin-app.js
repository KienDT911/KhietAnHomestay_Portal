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
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');
    
    // Validate credentials
    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
        sessionStorage.setItem('adminLoggedIn', 'true');
        sessionStorage.setItem('adminUsername', username);
        showDashboard();
        errorElement.textContent = '';
    } else {
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
    updateDashboard();
    displayRooms();
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
        this.loadRooms();
    }

    // Load rooms from localStorage (fallback to empty array)
    loadRooms() {
        const stored = localStorage.getItem('khietanRooms');
        if (stored) {
            this.rooms = JSON.parse(stored);
        } else {
            this.rooms = [];
        }
    }

    // Save rooms to localStorage
    saveRooms() {
        localStorage.setItem('khietanRooms', JSON.stringify(this.rooms));
    }

    // Get all rooms
    getAllRooms() {
        return this.rooms;
    }

    // Get room by ID
    getRoomById(id) {
        return this.rooms.find(r => r.id === parseInt(id));
    }

    // Add new room
    addRoom(roomData) {
        const newRoom = {
            id: Math.max(...this.rooms.map(r => r.id), 0) + 1,
            ...roomData
        };
        this.rooms.push(newRoom);
        this.saveRooms();
        return newRoom;
    }

    // Update room
    updateRoom(id, roomData) {
        const index = this.rooms.findIndex(r => r.id === parseInt(id));
        if (index > -1) {
            this.rooms[index] = { ...this.rooms[index], ...roomData };
            this.saveRooms();
            return this.rooms[index];
        }
        return null;
    }

    // Delete room
    deleteRoom(id) {
        this.rooms = this.rooms.filter(r => r.id !== parseInt(id));
        this.saveRooms();
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
    event.target.classList.add('active');
    
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
function updateDashboard() {
    const stats = {
        total: roomManager.rooms.length,
        available: roomManager.rooms.filter(r => r.status === 'available').length,
        booked: roomManager.rooms.filter(r => r.status === 'booked').length
    };
    
    document.getElementById('total-rooms').textContent = stats.total;
    document.getElementById('available-count').textContent = stats.available;
    document.getElementById('booked-count').textContent = stats.booked;
    
    // Display quick preview
    const gridContainer = document.getElementById('quick-rooms-grid');
    gridContainer.innerHTML = '';
    
    roomManager.getAllRooms().forEach(room => {
        const card = document.createElement('div');
        card.className = `quick-room-card ${room.status}`;
        card.innerHTML = `
            <span class="quick-room-number">#${room.id}</span>
            <span class="quick-room-status ${room.status}">${room.status.toUpperCase()}</span>
            <h4>${room.name}</h4>
            <p>$${room.price}/night</p>
            <p>${room.capacity} guests</p>
        `;
        card.onclick = () => openQuickEditModal(room.id);
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
                    <button class="btn-icon" onclick="editRoom(${room.id})">Edit</button>
                    <button class="btn-icon btn-delete" onclick="deleteRoomConfirm(${room.id})">Delete</button>
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
                        <button class="btn-icon" onclick="editRoom(${room.id})">Edit</button>
                        <button class="btn-icon btn-delete" onclick="deleteRoomConfirm(${room.id})">Delete</button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
}

// Save room (add or update)
function saveRoom(event) {
    event.preventDefault();
    
    const roomId = document.getElementById('room-id').value;
    const roomData = {
        name: document.getElementById('room-name').value,
        price: parseFloat(document.getElementById('room-price').value),
        capacity: parseInt(document.getElementById('room-capacity').value),
        description: document.getElementById('room-description').value,
        amenities: document.getElementById('room-amenities').value.split(',').map(a => a.trim()),
        status: document.getElementById('room-status').value,
        bookedUntil: document.getElementById('room-status').value === 'booked' 
            ? document.getElementById('booked-until').value 
            : null
    };
    
    if (roomId) {
        roomManager.updateRoom(roomId, roomData);
        alert('Room updated successfully!');
        closeModal();
    } else {
        roomManager.addRoom(roomData);
        alert('Room added successfully!');
    }
    
    resetForm();
    displayRooms();
    updateDashboard();
}

// Edit room
function editRoom(id) {
    const room = roomManager.getRoomById(id);
    if (!room) return;
    
    document.getElementById('edit-room-id').value = room.id;
    document.getElementById('edit-room-name').value = room.name;
    document.getElementById('edit-room-price').value = room.price;
    document.getElementById('edit-room-capacity').value = room.capacity;
    document.getElementById('edit-room-description').value = room.description;
    document.getElementById('edit-room-amenities').value = room.amenities.join(', ');
    document.getElementById('edit-room-status').value = room.status;
    
    if (room.status === 'booked') {
        document.getElementById('edit-booked-until-group').style.display = 'block';
        document.getElementById('edit-booked-until').value = room.bookedUntil;
    }
    
    document.getElementById('edit-form').onsubmit = function(e) {
        e.preventDefault();
        const updatedData = {
            name: document.getElementById('edit-room-name').value,
            price: parseFloat(document.getElementById('edit-room-price').value),
            capacity: parseInt(document.getElementById('edit-room-capacity').value),
            description: document.getElementById('edit-room-description').value,
            amenities: document.getElementById('edit-room-amenities').value.split(',').map(a => a.trim()),
            status: document.getElementById('edit-room-status').value,
            bookedUntil: document.getElementById('edit-room-status').value === 'booked' 
                ? document.getElementById('edit-booked-until').value 
                : null
        };
        
        roomManager.updateRoom(id, updatedData);
        alert('Room updated successfully!');
        closeModal();
        displayRooms();
        updateDashboard();
    };
    
    document.getElementById('edit-modal').style.display = 'flex';
}

// Delete room with confirmation
function deleteRoomConfirm(id) {
    if (confirm('Are you sure you want to delete this room?')) {
        roomManager.deleteRoom(id);
        alert('Room deleted successfully!');
        displayRooms();
        updateDashboard();
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
        <form id="quick-edit-form" onsubmit="saveQuickEdit(event, ${id})">
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
                <input type="date" id="quick-booked-until" value="${room.bookedUntil || ''}">
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
function saveQuickEdit(event, id) {
    event.preventDefault();
    
    const status = document.getElementById('quick-status').value;
    const price = parseFloat(document.getElementById('quick-price').value);
    const bookedUntil = status === 'booked' ? document.getElementById('quick-booked-until').value : null;
    
    const updatedData = {
        status: status,
        price: price,
        bookedUntil: bookedUntil
    };
    
    roomManager.updateRoom(id, updatedData);
    alert('Room status updated successfully!');
    closeQuickEditModal();
    updateDashboard();
    displayRooms();
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
}
