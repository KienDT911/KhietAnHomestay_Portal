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
    
    // Restore sidebar state
    restoreSidebarState();
    
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

// ===== Calendar State =====
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-indexed

// ===== UI Functions =====

// Toggle sidebar collapsed state
function toggleSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    sidebar.classList.toggle('collapsed');
    
    // Save state to sessionStorage
    sessionStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

// Collapse sidebar (called when tab is selected)
function collapseSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        sessionStorage.setItem('sidebarCollapsed', 'true');
    }
}

// Restore sidebar state from session storage
function restoreSidebarState() {
    const sidebar = document.getElementById('admin-sidebar');
    const isCollapsed = sessionStorage.getItem('sidebarCollapsed');
    
    if (isCollapsed === 'true' && sidebar) {
        sidebar.classList.add('collapsed');
    }
}

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
        // Find the closest .menu-item element (in case icon was clicked)
        const menuItem = event.target.closest('.menu-item');
        if (menuItem) {
            menuItem.classList.add('active');
        }
    }
    
    // Collapse sidebar after selecting a tab
    collapseSidebar();
    
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
    
    // Update month display
    updateMonthDisplay();
    
    // Render room calendars with filters
    applyDashboardFilters();
}

// ===== Dashboard Filter Functions =====

// Apply filters and render calendars
function applyDashboardFilters() {
    const statusFilter = document.getElementById('dashboard-filter-status')?.value || '';
    const capacityFilter = document.getElementById('dashboard-filter-capacity')?.value || '';
    const priceFilter = document.getElementById('dashboard-filter-price')?.value || '';
    const checkinDate = document.getElementById('dashboard-filter-checkin')?.value || '';
    const checkoutDate = document.getElementById('dashboard-filter-checkout')?.value || '';
    const sortBy = document.getElementById('dashboard-sort')?.value || 'room_id';
    
    let filteredRooms = [...roomManager.getAllRooms()];
    
    // Filter by status
    if (statusFilter) {
        filteredRooms = filteredRooms.filter(room => room.status === statusFilter);
    }
    
    // Filter by capacity
    if (capacityFilter) {
        filteredRooms = filteredRooms.filter(room => {
            const capacity = room.capacity || room.persons || 0;
            switch (capacityFilter) {
                case '1-2': return capacity >= 1 && capacity <= 2;
                case '3-4': return capacity >= 3 && capacity <= 4;
                case '5-6': return capacity >= 5 && capacity <= 6;
                case '7+': return capacity >= 7;
                default: return true;
            }
        });
    }
    
    // Filter by price
    if (priceFilter) {
        filteredRooms = filteredRooms.filter(room => {
            const price = room.price || 0;
            switch (priceFilter) {
                case '0-50': return price < 50;
                case '50-75': return price >= 50 && price <= 75;
                case '75-100': return price > 75 && price <= 100;
                case '100+': return price > 100;
                default: return true;
            }
        });
    }
    
    // Filter by availability for date range (check-in to check-out)
    if (checkinDate && checkoutDate) {
        filteredRooms = filteredRooms.filter(room => {
            return isRoomAvailableForDateRange(room, checkinDate, checkoutDate);
        });
    } else if (checkinDate) {
        // If only check-in date is provided, check that single date
        filteredRooms = filteredRooms.filter(room => {
            const bookedDates = getBookedDatesForRoom(room);
            return !bookedDates.has(checkinDate);
        });
    }
    
    // Sort rooms
    filteredRooms = sortRooms(filteredRooms, sortBy);
    
    // Update results count
    updateFilterResultsCount(filteredRooms.length, roomManager.getAllRooms().length);
    
    // Render filtered calendars
    renderFilteredCalendars(filteredRooms);
}

// Check if room is available for entire date range
function isRoomAvailableForDateRange(room, checkinDate, checkoutDate) {
    const bookedDates = getBookedDatesForRoom(room);
    const startDate = new Date(checkinDate);
    const endDate = new Date(checkoutDate);
    
    // Validate dates
    if (startDate >= endDate) {
        return true; // Invalid range, don't filter
    }
    
    // Check each date in the range (excluding checkout date as guest leaves)
    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
        const dateStr = formatDateString(currentDate);
        if (bookedDates.has(dateStr)) {
            return false; // Room is booked on this date
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return true; // Room is available for entire range
}

// Sort rooms based on criteria
function sortRooms(rooms, sortBy) {
    return rooms.sort((a, b) => {
        switch (sortBy) {
            case 'room_id':
                return (a.room_id || '').localeCompare(b.room_id || '');
            case 'name':
                return (a.name || '').localeCompare(b.name || '');
            case 'price_asc':
                return (a.price || 0) - (b.price || 0);
            case 'price_desc':
                return (b.price || 0) - (a.price || 0);
            case 'capacity_asc':
                return (a.capacity || a.persons || 0) - (b.capacity || b.persons || 0);
            case 'capacity_desc':
                return (b.capacity || b.persons || 0) - (a.capacity || a.persons || 0);
            default:
                return 0;
        }
    });
}

// Update filter results count
function updateFilterResultsCount(filteredCount, totalCount) {
    const countEl = document.getElementById('filter-results-count');
    if (countEl) {
        if (filteredCount === totalCount) {
            countEl.textContent = `All ${totalCount} rooms`;
        } else {
            countEl.textContent = `${filteredCount}/${totalCount} rooms`;
        }
    }
}

// Reset all dashboard filters
function resetDashboardFilters() {
    const statusSelect = document.getElementById('dashboard-filter-status');
    const capacitySelect = document.getElementById('dashboard-filter-capacity');
    const priceSelect = document.getElementById('dashboard-filter-price');
    const checkinInput = document.getElementById('dashboard-filter-checkin');
    const checkoutInput = document.getElementById('dashboard-filter-checkout');
    const sortSelect = document.getElementById('dashboard-sort');
    
    if (statusSelect) statusSelect.value = '';
    if (capacitySelect) capacitySelect.value = '';
    if (priceSelect) priceSelect.value = '';
    if (checkinInput) checkinInput.value = '';
    if (checkoutInput) checkoutInput.value = '';
    if (sortSelect) sortSelect.value = 'room_id';
    
    applyDashboardFilters();
}

// Render filtered room calendars
function renderFilteredCalendars(rooms) {
    const container = document.getElementById('rooms-calendar-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (rooms.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <svg viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                <p>No rooms match your filters</p>
                <button class="btn-secondary" onclick="resetDashboardFilters()">Reset Filters</button>
            </div>
        `;
        return;
    }
    
    rooms.forEach(room => {
        const rowEl = createRoomCalendarRow(room);
        container.appendChild(rowEl);
    });
    
    // Add legend at the bottom
    addCalendarLegend(container);
}

// Add calendar legend
function addCalendarLegend(container) {
    const legend = document.createElement('div');
    legend.className = 'calendar-legend';
    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color today"></div>
            <span>Today</span>
        </div>
        <div class="legend-item">
            <div class="legend-color available"></div>
            <span>Available</span>
        </div>
        <div class="legend-item">
            <div class="legend-color booked"></div>
            <span>Booked</span>
        </div>
        <div class="legend-item">
            <div class="legend-color past"></div>
            <span>Past Date</span>
        </div>
    `;
    container.appendChild(legend);
}

// Update month display text
function updateMonthDisplay() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const displayEl = document.getElementById('current-month-display');
    if (displayEl) {
        displayEl.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;
    }
}

// Change month (direction: -1 for prev, 1 for next)
function changeMonth(direction) {
    currentCalendarMonth += direction;
    
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    
    updateMonthDisplay();
    applyDashboardFilters();
}

// Render all room calendars (legacy - now uses applyDashboardFilters)
function renderRoomCalendars() {
    applyDashboardFilters();
}

// Create a room calendar row
function createRoomCalendarRow(room) {
    const row = document.createElement('div');
    row.className = 'room-calendar-row';
    
    // Room info panel
    const infoPanel = document.createElement('div');
    infoPanel.className = 'room-info-panel';
    infoPanel.innerHTML = `
        <span class="room-number">#${room.room_id || room.id}</span>
        <h4>${room.name}</h4>
        <div class="room-details">
            <p>$${room.price}/night</p>
            <p>${room.capacity || room.persons} guests</p>
        </div>
        <span class="room-status-badge ${room.status}">${room.status.toUpperCase()}</span>
    `;
    infoPanel.style.cursor = 'pointer';
    infoPanel.onclick = () => openQuickEditModal(room.room_id || room.id);
    
    // Calendar panel
    const calendarPanel = document.createElement('div');
    calendarPanel.className = 'calendar-panel';
    
    const calendarGrid = createCalendarGrid(room);
    calendarPanel.appendChild(calendarGrid);
    
    row.appendChild(infoPanel);
    row.appendChild(calendarPanel);
    
    return row;
}

// Create calendar grid for a room
function createCalendarGrid(room) {
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    
    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        grid.appendChild(header);
    });
    
    // Get booked dates for this room
    const bookedDates = getBookedDatesForRoom(room);
    
    // Get current date info
    const today = new Date();
    const todayStr = formatDateString(today);
    
    // Get first day of month and number of days
    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1);
    const lastDay = new Date(currentCalendarYear, currentCalendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }
    
    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentCalendarYear, currentCalendarMonth, day);
        const dateStr = formatDateString(date);
        
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        dayCell.textContent = day;
        
        // Check if today
        if (dateStr === todayStr) {
            dayCell.classList.add('today');
        }
        
        // Check if past (before today)
        if (date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
            dayCell.classList.add('past');
        }
        
        // Check if booked
        if (bookedDates.has(dateStr)) {
            dayCell.classList.add('booked');
        } else if (!dayCell.classList.contains('past')) {
            dayCell.classList.add('available');
        }
        
        grid.appendChild(dayCell);
    }
    
    return grid;
}

// Get booked dates for a room from bookedIntervals
function getBookedDatesForRoom(room) {
    const bookedDates = new Set();
    
    // Check if room has bookedIntervals array
    const intervals = room.bookedIntervals || [];
    
    intervals.forEach(interval => {
        const checkIn = new Date(interval.checkIn);
        const checkOut = new Date(interval.checkOut);
        
        // Add all dates from check-in to check-out (exclusive of check-out)
        let current = new Date(checkIn);
        while (current < checkOut) {
            bookedDates.add(formatDateString(current));
            current.setDate(current.getDate() + 1);
        }
    });
    
    return bookedDates;
}

// Format date as YYYY-MM-DD string
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Display rooms in table
function displayRooms() {
    const tableBody = document.getElementById('rooms-list');
    tableBody.innerHTML = '';
    
    // Sort rooms by room_id ascending (level order)
    const sortedRooms = [...roomManager.getAllRooms()].sort((a, b) => {
        return a.room_id.localeCompare(b.room_id);
    });
    
    sortedRooms.forEach(room => {
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
    
    // Sort and filter rooms by room_id ascending (level order)
    [...roomManager.getAllRooms()]
        .sort((a, b) => a.room_id.localeCompare(b.room_id))
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