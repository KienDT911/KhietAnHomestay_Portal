// Set min date for check-in input and validate on change
document.addEventListener('DOMContentLoaded', function() {
    const checkinInput = document.getElementById('dashboard-filter-checkin');
    if (checkinInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;
        checkinInput.setAttribute('min', todayStr);
        checkinInput.addEventListener('change', function() {
            if (checkinInput.value < todayStr) {
                checkinInput.value = todayStr;
            }
        });
    }
    
    // Setup drag and drop for image upload areas
    setupImageDragDrop('room-image-preview', 'room-image-file');
    setupImageDragDrop('edit-room-image-preview', 'edit-room-image-file');
});

// Setup drag and drop for image preview areas
function setupImageDragDrop(previewId, inputId) {
    const preview = document.getElementById(previewId);
    const input = document.getElementById(inputId);
    
    if (!preview || !input) return;
    
    // Click to open file dialog
    preview.addEventListener('click', () => input.click());
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        preview.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    
    // Highlight on drag over
    ['dragenter', 'dragover'].forEach(eventName => {
        preview.addEventListener(eventName, () => {
            preview.style.borderColor = 'var(--sage-green)';
            preview.style.background = 'rgba(123, 155, 126, 0.1)';
        });
    });
    
    // Remove highlight on drag leave
    ['dragleave', 'drop'].forEach(eventName => {
        preview.addEventListener(eventName, () => {
            preview.style.borderColor = '';
            preview.style.background = '';
        });
    });
    
    // Handle drop
    preview.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // Create a new DataTransfer to set files on input
            const dt = new DataTransfer();
            dt.items.add(files[0]);
            input.files = dt.files;
            // Trigger change event
            input.dispatchEvent(new Event('change'));
        }
    });
}
// ===== Configuration =====
// Use local backend when developing on localhost, otherwise use production API
const API_BASE_URL = (function() {
    const host = window.location.hostname;
    if (host === '127.0.0.1' || host === 'localhost') {
        // Use same hostname to avoid cross-origin issues
        return `http://${host}:5000/backend/api/admin`;
    }
    return 'https://khietanportal.vercel.app/backend/api/admin';
})();
console.log('API_BASE_URL:', API_BASE_URL);

// Global flag to prevent reloads during upload - MUST be defined before WebSocket intercept
let isUploadingImages = false;

// Intercept and disable Live Server's auto-reload during uploads
(function() {
    // Store original WebSocket
    const OriginalWebSocket = window.WebSocket;
    
    // Override WebSocket to intercept Live Server messages
    window.WebSocket = function(url, protocols) {
        const socket = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
        
        // Intercept onmessage to block reload during uploads
        const originalOnMessage = socket.onmessage;
        
        Object.defineProperty(socket, 'onmessage', {
            set: function(handler) {
                socket._customHandler = function(event) {
                    // Block reload messages during upload
                    if (isUploadingImages) {
                        console.log('🚫 Blocked Live Server reload during upload');
                        return;
                    }
                    if (handler) handler.call(socket, event);
                };
                OriginalWebSocket.prototype.__lookupSetter__('onmessage').call(socket, socket._customHandler);
            },
            get: function() {
                return socket._customHandler;
            }
        });
        
        return socket;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
})();

// ===== Authentication =====
// User accounts with roles: 'admin' has full access, 'manager' cannot access room management
const VALID_USERS = [
    {
        username: 'trungkien',
        password: '123456',
        role: 'admin',
        displayName: 'Trung Kiên (Admin)'
    },
    {
        username: 'khietanquanly',
        password: '123123',
        role: 'manager',
        displayName: 'Khiết An (Manager)'
    }
];

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
    
    console.log('Login attempt:', { username }); // Debug log
    
    // Find matching user
    const user = VALID_USERS.find(u => u.username === username && u.password === password);
    
    if (user) {
        console.log('Login successful! Role:', user.role); // Debug log
        sessionStorage.setItem('adminLoggedIn', 'true');
        sessionStorage.setItem('adminUsername', user.displayName);
        sessionStorage.setItem('adminRole', user.role);
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
    
    // Apply role-based access control
    applyRoleBasedAccess();
    
    // Initialize sidebar (always starts collapsed)
    initSidebar();
    
    // Initialize dashboard
    roomManager.loadRooms();
}

// Apply role-based access control to UI elements
function applyRoleBasedAccess() {
    const role = sessionStorage.getItem('adminRole') || 'manager';
    const isAdmin = role === 'admin';
    
    // Get sidebar menu items for Manage Rooms and Add New Room
    const sidebarMenu = document.querySelector('.sidebar-menu');
    const menuItems = sidebarMenu.querySelectorAll('li');
    
    // Menu items: [0] = Dashboard, [1] = Manage Rooms, [2] = Add New Room
    if (menuItems[1]) {
        menuItems[1].style.display = isAdmin ? 'block' : 'none';
    }
    if (menuItems[2]) {
        menuItems[2].style.display = isAdmin ? 'block' : 'none';
    }
    
    // Also hide the "+ Add New Room" button in Manage Rooms section header
    const addRoomBtn = document.querySelector('#rooms .section-header .btn-primary');
    if (addRoomBtn) {
        addRoomBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }
    
    console.log('Role-based access applied. Role:', role, 'Is Admin:', isAdmin);
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('adminLoggedIn');
        sessionStorage.removeItem('adminUsername');
        sessionStorage.removeItem('adminRole');
        document.getElementById('login-form').reset();
        document.getElementById('login-error').textContent = '';
        showLoginPage();
    }
}

// ===== Mobile Filter Toggle =====
function toggleMobileFilter() {
    const filterPanel = document.getElementById('dashboard-filter-panel');
    const toggleBtn = document.getElementById('mobile-filter-toggle');
    
    if (filterPanel) {
        filterPanel.classList.toggle('mobile-visible');
        
        // Update button text
        if (toggleBtn) {
            const isVisible = filterPanel.classList.contains('mobile-visible');
            toggleBtn.querySelector('span').textContent = isVisible ? 'Hide Filter' : 'Filter';
        }
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
        // Don't reload while uploading/deleting images
        if (isUploadingImages) {
            console.log('⏸️ Skipping loadRooms - operation in progress');
            return;
        }
        
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

    // Load rooms silently (no error alerts) - used after image upload/delete
    async loadRoomsSilent() {
        const response = await fetch(this.apiUrl);
        const result = await response.json();
        
        if (result.success) {
            this.rooms = result.data || [];
            console.log(`✓ Loaded ${this.rooms.length} rooms from database`);
            updateDashboard();
            displayRooms();
        } else {
            throw new Error(result.error || 'Failed to load rooms');
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
    async updateRoom(id, roomData, skipReload = false) {
        try {
            const response = await fetch(`${this.apiUrl}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roomData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✓ Room updated successfully');
                if (!skipReload) {
                    await this.loadRooms();
                }
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
}

// Initialize Room Manager
const roomManager = new RoomManager();

// ===== Calendar State =====
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-indexed

// ===== UI Functions =====

// Sidebar auto-hide timer
let sidebarAutoHideTimer = null;

// Toggle sidebar collapsed state
function toggleSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    sidebar.classList.toggle('collapsed');
    
    // Clear any existing auto-hide timer
    if (sidebarAutoHideTimer) {
        clearTimeout(sidebarAutoHideTimer);
        sidebarAutoHideTimer = null;
    }
    
    // If sidebar is now expanded, start auto-hide timer
    if (!sidebar.classList.contains('collapsed')) {
        startSidebarAutoHide();
    }
}

// Start auto-hide timer for sidebar (3 seconds of inactivity)
function startSidebarAutoHide() {
    if (sidebarAutoHideTimer) {
        clearTimeout(sidebarAutoHideTimer);
    }
    sidebarAutoHideTimer = setTimeout(() => {
        collapseSidebar();
    }, 3000); // Auto-hide after 3 seconds
}

// Reset auto-hide timer when user interacts with sidebar
function resetSidebarAutoHide() {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
        startSidebarAutoHide();
    }
}

// Collapse sidebar (called when tab is selected or auto-hide triggers)
function collapseSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
    }
    // Clear timer
    if (sidebarAutoHideTimer) {
        clearTimeout(sidebarAutoHideTimer);
        sidebarAutoHideTimer = null;
    }
}

// Initialize sidebar - always start collapsed
function initSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar) {
        // Always start collapsed
        sidebar.classList.add('collapsed');
        
        // Add mouse enter/leave listeners for auto-hide
        sidebar.addEventListener('mouseenter', () => {
            // Reset timer when mouse enters
            if (sidebarAutoHideTimer) {
                clearTimeout(sidebarAutoHideTimer);
                sidebarAutoHideTimer = null;
            }
        });
        
        sidebar.addEventListener('mouseleave', () => {
            // Start auto-hide when mouse leaves (if expanded)
            if (!sidebar.classList.contains('collapsed')) {
                startSidebarAutoHide();
            }
        });
    }
}

// Switch tabs
function switchTab(tabName) {
    // Check role-based access for restricted tabs
    const role = sessionStorage.getItem('adminRole') || 'manager';
    const restrictedTabs = ['rooms', 'add-room'];
    
    if (role !== 'admin' && restrictedTabs.includes(tabName)) {
        alert('Access denied. Only administrators can access this section.');
        return;
    }
    
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
    
    // Show/hide filter panel based on tab
    const filterPanel = document.getElementById('dashboard-filter-panel');
    if (filterPanel) {
        filterPanel.style.display = tabName === 'dashboard' ? 'flex' : 'none';
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
    // Update month display
    updateMonthDisplay();
    
    // Render room calendars with filters
    applyDashboardFilters();
}

// ===== Dashboard Filter Functions =====

// Add event listener: when checkin changes, clear checkout and jump to month
document.addEventListener('DOMContentLoaded', function() {
    const checkinInput = document.getElementById('dashboard-filter-checkin');
    const checkoutInput = document.getElementById('dashboard-filter-checkout');
    if (checkinInput) {
        checkinInput.addEventListener('change', function() {
            if (checkoutInput) checkoutInput.value = '';
            // Jump calendar to checkin month
            if (checkinInput.value) {
                const d = new Date(checkinInput.value);
                if (!isNaN(d.getTime())) {
                    currentCalendarYear = d.getFullYear();
                    currentCalendarMonth = d.getMonth();
                    updateMonthDisplay();
                }
            }
            applyDashboardFilters();
        });
    }
});

// Apply filters and render calendars
function applyDashboardFilters() {
    const capacityFilter = document.getElementById('dashboard-filter-capacity')?.value || '';
    const priceFilter = document.getElementById('dashboard-filter-price')?.value || '';
    let checkinDate = document.getElementById('dashboard-filter-checkin')?.value || '';
    let checkoutDate = document.getElementById('dashboard-filter-checkout')?.value || '';
    const sortBy = document.getElementById('dashboard-sort')?.value || 'room_id';

    // Auto-correct: if checkout <= checkin, set checkout = one day after checkin
    if (checkinDate && checkoutDate && checkoutDate <= checkinDate) {
        const nextDay = new Date(checkinDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().slice(0, 10);
        checkoutDate = nextDayStr;
        document.getElementById('dashboard-filter-checkout').value = nextDayStr;
    }

    let filteredRooms = [...roomManager.getAllRooms()];

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

    // Render filtered calendars with temporary selection highlight
    renderFilteredCalendars(filteredRooms, checkinDate, checkoutDate);
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
    const capacitySelect = document.getElementById('dashboard-filter-capacity');
    const priceSelect = document.getElementById('dashboard-filter-price');
    const checkinInput = document.getElementById('dashboard-filter-checkin');
    const checkoutInput = document.getElementById('dashboard-filter-checkout');
    const sortSelect = document.getElementById('dashboard-sort');
    
    if (capacitySelect) capacitySelect.value = '';
    if (priceSelect) priceSelect.value = '';
    if (checkinInput) checkinInput.value = '';
    if (checkoutInput) checkoutInput.value = '';
    if (sortSelect) sortSelect.value = 'room_id';
    
    applyDashboardFilters();
}

// Render filtered room calendars, with optional temp selection
function renderFilteredCalendars(rooms, checkinDate, checkoutDate) {
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
        const rowEl = createRoomCalendarRow(room, checkinDate, checkoutDate);
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

// Create a room calendar row, with optional temp selection
function createRoomCalendarRow(room, checkinDate, checkoutDate) {
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
        <div class="room-image-placeholder"></div>
    `;
    infoPanel.style.cursor = 'pointer';
    infoPanel.onclick = () => openQuickEditModal(room.room_id || room.id);

    // Image / upload handling
    (function setupRoomImage() {
        const placeholder = infoPanel.querySelector('.room-image-placeholder');
        if (!placeholder) return;

        const role = sessionStorage.getItem('adminRole') || 'manager';
        const roomId = room.room_id || room.id;

        const basePath = API_BASE_URL.split('/backend')[0] || '';

        // Get image URL - prefer first cover image, then first room image, then legacy imageUrl
        let imageUrl = null;
        if (room.images) {
            if (room.images.cover && room.images.cover.length > 0) {
                imageUrl = room.images.cover[0];
            } else if (room.images.room && room.images.room.length > 0) {
                imageUrl = room.images.room[0];
            }
        }
        // Fallback to legacy imageUrl only if no images in the new structure
        if (!imageUrl && room.imageUrl) {
            imageUrl = room.imageUrl;
        }

        if (imageUrl) {
            const img = document.createElement('img');
            img.className = 'room-image';
            img.src = (imageUrl.startsWith('http') ? imageUrl : (basePath + imageUrl));
            img.alt = room.name;
            img.addEventListener('click', function(e) { e.stopPropagation(); openImageViewer(img.src); });
            placeholder.appendChild(img);

            // For admins, show edit button to open image gallery modal
            if (role === 'admin') {
                const controls = document.createElement('div');
                controls.className = 'image-controls';

                const editImagesBtn = document.createElement('button');
                editImagesBtn.type = 'button';
                editImagesBtn.className = 'image-change';
                editImagesBtn.title = 'Manage images';
                editImagesBtn.textContent = '✎';

                editImagesBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    editRoom(roomId);
                });

                controls.appendChild(editImagesBtn);
                placeholder.appendChild(controls);
            }
        } else if (role === 'admin') {
            // No image yet - show button to open Edit modal for adding images
            const uploadBtn = document.createElement('button');
            uploadBtn.type = 'button';
            uploadBtn.className = 'upload-icon';
            uploadBtn.title = 'Add room images';
            uploadBtn.textContent = '+';

            uploadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                editRoom(roomId);
            });

            placeholder.appendChild(uploadBtn);
        }
    })();

    // Calendar panel
    const calendarPanel = document.createElement('div');
    calendarPanel.className = 'calendar-panel';

    const calendarGrid = createCalendarGrid(room, checkinDate, checkoutDate);
    calendarPanel.appendChild(calendarGrid);

    row.appendChild(infoPanel);
    row.appendChild(calendarPanel);

    return row;
}

// Create calendar grid for a room, with optional temp selection
function createCalendarGrid(room, checkinDate, checkoutDate) {
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
    const bookedIntervals = getBookedIntervalsForRoom(room);

    // Build a map of date to interval info for booking bars
    const dateToIntervalInfo = buildDateToIntervalMap(bookedIntervals, currentCalendarYear, currentCalendarMonth);

    // Get current date info
    const today = new Date();
    const todayStr = formatDateString(today);

    // Get first day of month and number of days
    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1);
    const lastDay = new Date(currentCalendarYear, currentCalendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Prepare temp selection set if valid interval
    let tempSelected = new Set();
    if (checkinDate && checkoutDate && checkoutDate >= checkinDate) {
        let d = new Date(checkinDate);
        const end = new Date(checkoutDate);
        while (d < end) {
            tempSelected.add(formatDateString(d));
            d.setDate(d.getDate() + 1);
        }
    }

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
        dayCell.dataset.date = dateStr;
        dayCell.dataset.roomId = room.room_id || room.id;

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
            const interval = findIntervalForDate(bookedIntervals, dateStr);
            const intervalInfo = dateToIntervalInfo.get(dateStr);

            // Add day number as small text
            const dayNumber = document.createElement('span');
            dayNumber.className = 'day-number';
            dayNumber.textContent = day;
            dayCell.appendChild(dayNumber);

            // Add booking bar based on position in interval
            if (intervalInfo) {
                const bookingBar = createBookingBar(interval, intervalInfo, room);
                dayCell.appendChild(bookingBar);
            }

            dayCell.onclick = (e) => handleBookedDateClick(room, interval, e);
            dayCell.style.cursor = 'pointer';
        } else {
            dayCell.textContent = day;
            if (!dayCell.classList.contains('past')) {
                dayCell.classList.add('available');
                dayCell.classList.add('selectable');
                // Add click handler for date selection
                dayCell.onclick = (e) => handleDateSelection(e, room, date);
            }
        }

        // Highlight temp selection if in interval and not booked
        if (tempSelected.size > 0 && tempSelected.has(dateStr) && !dayCell.classList.contains('booked')) {
            dayCell.classList.add('temp-selected');
        }

        grid.appendChild(dayCell);
    }

    return grid;
}

// Upload room image to backend
async function uploadRoomImage(roomId, file) {
    const form = new FormData();
    form.append('image', file);
    try {
        const resp = await fetch(`${API_BASE_URL}/rooms/${roomId}/image`, {
            method: 'POST',
            body: form
        });

        // If network-level error, fetch will throw and land in catch
        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok) {
            let errText = resp.status + ' ' + resp.statusText;
            try {
                if (contentType.includes('application/json')) {
                    const json = await resp.json();
                    errText = json.error || JSON.stringify(json);
                } else {
                    errText = await resp.text();
                }
            } catch (e) {}
            throw new Error('Upload failed: ' + errText);
        }

        const result = contentType.includes('application/json') ? await resp.json() : { success: true };
        if (!result.success) {
            throw new Error(result.error || 'Upload failed');
        }
        return result.imageUrl;
    } catch (err) {
        console.error('uploadRoomImage error:', err);
        throw new Error(err.message || 'Failed to fetch');
    }
}

// Delete room image
async function deleteRoomImage(roomId) {
    try {
        const resp = await fetch(`${API_BASE_URL}/rooms/${roomId}/image`, {
            method: 'DELETE'
        });
        if (!resp.ok) {
            let text = resp.status + ' ' + resp.statusText;
            try {
                const j = await resp.json();
                text = j.error || JSON.stringify(j);
            } catch (_) {}
            throw new Error(text);
        }
        return true;
    } catch (err) {
        console.error('deleteRoomImage error:', err);
        throw err;
    }
}

// Upload room image with category (cover/room)
async function uploadRoomImageWithCategory(roomId, file, category, order) {
    const form = new FormData();
    form.append('image', file);
    form.append('category', category);
    form.append('order', order);
    
    try {
        const resp = await fetch(`${API_BASE_URL}/rooms/${roomId}/images`, {
            method: 'POST',
            body: form
        });

        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok) {
            let errText = resp.status + ' ' + resp.statusText;
            try {
                if (contentType.includes('application/json')) {
                    const json = await resp.json();
                    errText = json.error || JSON.stringify(json);
                } else {
                    errText = await resp.text();
                }
            } catch (e) {}
            throw new Error('Upload failed: ' + errText);
        }

        const result = contentType.includes('application/json') ? await resp.json() : { success: true };
        if (!result.success) {
            throw new Error(result.error || 'Upload failed');
        }
        return result.imageUrl;
    } catch (err) {
        console.error('uploadRoomImageWithCategory error:', err);
        throw new Error(err.message || 'Failed to upload image');
    }
}

// Update all images order in database (using existing /images PUT endpoint)
async function updateAllImagesOrder(roomId, coverUrls, roomUrls) {
    try {
        console.log('📤 Saving image order for room:', roomId);
        console.log('Cover URLs:', coverUrls);
        console.log('Room URLs:', roomUrls);
        
        const resp = await fetch(`${API_BASE_URL}/rooms/${roomId}/images`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                images: {
                    cover: coverUrls,
                    room: roomUrls
                }
            })
        });
        
        if (!resp.ok) {
            let text = resp.status + ' ' + resp.statusText;
            try {
                const j = await resp.json();
                text = j.error || JSON.stringify(j);
            } catch (_) {}
            throw new Error(text);
        }
        console.log('✓ Image order saved successfully');
        return true;
    } catch (err) {
        console.error('updateAllImagesOrder error:', err);
        throw err;
    }
}

// Delete room image by URL/ID
async function deleteRoomImageByUrl(roomId, imageUrl) {
    try {
        // Extract just the filename from the URL for simpler matching
        let filename = imageUrl;
        if (imageUrl.includes('/')) {
            filename = imageUrl.split('/').pop();
        }
        // Remove any query params
        if (filename.includes('?')) {
            filename = filename.split('?')[0];
        }
        console.log('Deleting image:', filename, 'from room:', roomId);
        console.log('Delete URL:', `${API_BASE_URL}/rooms/${roomId}/images/${encodeURIComponent(filename)}`);
        
        const resp = await fetch(`${API_BASE_URL}/rooms/${roomId}/images/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Delete response status:', resp.status);
        
        if (!resp.ok) {
            let text = resp.status + ' ' + resp.statusText;
            try {
                const j = await resp.json();
                text = j.error || JSON.stringify(j);
            } catch (_) {}
            throw new Error(text);
        }
        return true;
    } catch (err) {
        console.error('deleteRoomImageByUrl error:', err);
        throw err;
    }
}

// Simple image viewer modal
function openImageViewer(src) {
    let overlay = document.getElementById('image-viewer-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'image-viewer-overlay';
        overlay.className = 'image-viewer-overlay';
        overlay.onclick = () => overlay.remove();
        const img = document.createElement('img');
        img.id = 'image-viewer-img';
        img.className = 'image-viewer-img';
        overlay.appendChild(img);
        document.body.appendChild(overlay);
    }
    const img = document.getElementById('image-viewer-img');
    img.src = src;
    overlay.style.display = 'flex';
}

// Build a map of date to interval position info (accounting for week row breaks)
function buildDateToIntervalMap(intervals, year, month) {
    const dateToInfo = new Map();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstOfMonth.getDay(); // 0 = Sunday
    
    intervals.forEach(interval => {
        const checkIn = new Date(interval.checkIn);
        const checkOut = new Date(interval.checkOut);
        
        // Get dates in this month for this interval
        let current = new Date(checkIn);
        let daysInInterval = [];
        
        while (current < checkOut) {
            if (current >= firstOfMonth && current <= lastOfMonth) {
                const dateStr = formatDateString(current);
                const dayOfMonth = current.getDate();
                // Calculate which grid row this day is in
                const gridPosition = startDayOfWeek + dayOfMonth - 1;
                const weekRow = Math.floor(gridPosition / 7);
                const dayOfWeek = current.getDay(); // 0 = Sunday
                
                daysInInterval.push({
                    dateStr: dateStr,
                    weekRow: weekRow,
                    dayOfWeek: dayOfWeek
                });
            }
            current.setDate(current.getDate() + 1);
        }
        
        // Group days by week row
        const weekGroups = {};
        daysInInterval.forEach(dayInfo => {
            if (!weekGroups[dayInfo.weekRow]) {
                weekGroups[dayInfo.weekRow] = [];
            }
            weekGroups[dayInfo.weekRow].push(dayInfo);
        });
        
        // Mark position for each date within its week row segment
        Object.values(weekGroups).forEach(weekDays => {
            weekDays.forEach((dayInfo, index) => {
                let position = 'middle';
                const isFirstInRow = index === 0;
                const isLastInRow = index === weekDays.length - 1;
                const isFirstOfBooking = dayInfo.dateStr === daysInInterval[0].dateStr;
                const isLastOfBooking = dayInfo.dateStr === daysInInterval[daysInInterval.length - 1].dateStr;
                
                if (weekDays.length === 1) {
                    position = 'single';
                } else if (isFirstInRow) {
                    position = 'row-start';
                } else if (isLastInRow) {
                    position = 'row-end';
                }
                
                // Determine bar style based on booking edges
                let barStyle = 'middle';
                if (isFirstOfBooking && isLastOfBooking) {
                    barStyle = 'single';
                } else if (isFirstOfBooking) {
                    barStyle = 'start';
                } else if (isLastOfBooking) {
                    barStyle = 'end';
                } else if (isFirstInRow) {
                    barStyle = 'continue-start';
                } else if (isLastInRow) {
                    barStyle = 'continue-end';
                }
                
                dateToInfo.set(dayInfo.dateStr, {
                    position: position,
                    barStyle: barStyle,
                    daysInRowSegment: weekDays.length,
                    indexInRow: index,
                    guestName: interval.guestName || 'Guest',
                    interval: interval,
                    isFirstOfBooking: isFirstOfBooking
                });
            });
        });
    });
    
    return dateToInfo;
}

// Create booking bar element
function createBookingBar(interval, intervalInfo, room) {
    const bar = document.createElement('div');
    
    // Determine CSS class based on bar style
    let barClass = 'booking-bar';
    if (intervalInfo.barStyle === 'single') {
        barClass += ' booking-bar-single';
    } else if (intervalInfo.barStyle === 'start') {
        barClass += ' booking-bar-start';
    } else if (intervalInfo.barStyle === 'end') {
        barClass += ' booking-bar-end';
    } else if (intervalInfo.barStyle === 'continue-start') {
        barClass += ' booking-bar-continue-start';
    } else if (intervalInfo.barStyle === 'continue-end') {
        barClass += ' booking-bar-continue-end';
    } else {
        barClass += ' booking-bar-middle';
    }
    bar.className = barClass;
    
    // Only show guest name on row-start or single positions
    if (intervalInfo.position === 'row-start' || intervalInfo.position === 'single') {
        const guestName = intervalInfo.guestName;
        const maxLen = Math.min(intervalInfo.daysInRowSegment * 8, 20);
        const displayName = guestName.length > maxLen ? guestName.substring(0, maxLen) + '...' : guestName;
        bar.textContent = displayName;
        
        // Calculate width to span remaining days in this row segment
        const daysToSpan = intervalInfo.daysInRowSegment;
        bar.style.width = `calc(${daysToSpan * 100}% + ${(daysToSpan - 1) * 4}px)`;
    } else {
        // Hide bar for non-start cells in the row (bar spans from row-start)
        bar.style.display = 'none';
    }
    
    return bar;
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
    
    const tableBody = document.getElementById('rooms-list');
    tableBody.innerHTML = '';
    
    // Sort and filter rooms by room_id ascending (level order)
    [...roomManager.getAllRooms()]
        .sort((a, b) => a.room_id.localeCompare(b.room_id))
        .filter(room => {
            const matchesSearch = room.name.toLowerCase().includes(searchTerm);
            return matchesSearch;
        })
        .forEach(room => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${room.name}</strong></td>
                <td>$${room.price}</td>
                <td>${room.capacity} guests</td>
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
    
    // Get submit button and prevent multiple clicks
    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton.disabled) return;
    
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
    
    const roomId = document.getElementById('room-id').value;
    const customId = document.getElementById('room-custom-id')?.value;
    
    // Validate custom ID format (4 digits)
    if (!roomId && customId && !/^[0-9]{4}$/.test(customId)) {
        alert('Room ID must be exactly 4 digits (e.g., 0101, 0201)');
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        return;
    }
    
    // Check if room ID is already taken (only for new rooms)
    if (!roomId && customId && roomManager.isRoomIdTaken(customId)) {
        alert(`Room ID "${customId}" is already taken. Please choose a different ID.`);
        document.getElementById('room-custom-id').focus();
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        return;
    }
    
    const roomData = {
        name: document.getElementById('room-name').value,
        price: parseFloat(document.getElementById('room-price').value),
        capacity: parseInt(document.getElementById('room-capacity').value),
        description: document.getElementById('room-description').value,
        amenities: document.getElementById('room-amenities').value.split(',').map(a => a.trim())
    };
    
    // Add custom ID for new rooms
    if (!roomId && customId) {
        roomData.custom_id = customId;
    }
    
    try {
        let savedRoom;
        if (roomId) {
            savedRoom = await roomManager.updateRoom(roomId, roomData);
        } else {
            savedRoom = await roomManager.addRoom(roomData);
        }
        
        // Handle image uploads for new rooms
        if (!roomId && savedRoom) {
            const newRoomId = savedRoom.room_id || savedRoom.id || customId;
            if (newRoomId) {
                const pendingFiles = getPendingFilesForUpload('room');
                if (pendingFiles.length > 0) {
                    submitButton.textContent = 'Uploading images...';
                    for (const item of pendingFiles) {
                        try {
                            await uploadRoomImageWithCategory(newRoomId, item.file, item.category, item.order);
                        } catch (imgErr) {
                            console.error('Image upload failed:', imgErr);
                        }
                    }
                    await roomManager.loadRooms(); // Reload to get updated image URLs
                }
            }
        }
        
        alert(roomId ? 'Room updated successfully!' : 'Room added successfully!');
        
        resetForm();
        displayRooms();
        updateDashboard();
    } catch (error) {
        alert('Error saving room: ' + error.message);
    } finally {
        // Re-enable button after operation completes
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

// Edit room
function editRoom(id) {
    const room = roomManager.getRoomById(id);
    if (!room) return;
    
    // Set current room ID for immediate image uploads
    currentEditRoomId = room.room_id;
    
    document.getElementById('edit-room-id').value = room.room_id;
    document.getElementById('edit-room-display-id').value = room.room_id;
    document.getElementById('edit-room-name').value = room.name;
    document.getElementById('edit-room-price').value = room.price;
    document.getElementById('edit-room-capacity').value = room.capacity;
    document.getElementById('edit-room-description').value = room.description;
    document.getElementById('edit-room-amenities').value = room.amenities.join(', ');
    
    // Setup image galleries
    setupEditRoomImages(room);
    
    document.getElementById('edit-form').onsubmit = async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('=== UPDATE ROOM STARTED ===');
        
        // Prevent multiple clicks
        const submitButton = document.getElementById('edit-submit-btn');
        if (submitButton.disabled) {
            console.log('Button already disabled, ignoring click');
            return false;
        }
        
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Updating...';
        
        const updatedData = {
            name: document.getElementById('edit-room-name').value,
            price: parseFloat(document.getElementById('edit-room-price').value),
            capacity: parseInt(document.getElementById('edit-room-capacity').value),
            description: document.getElementById('edit-room-description').value,
            amenities: document.getElementById('edit-room-amenities').value.split(',').map(a => a.trim())
        };
        
        try {
            console.log('Updating room ID:', id);
            // First update room info
            await roomManager.updateRoom(id, updatedData, true);
            
            // Delete images marked for deletion
            if (imagesToDelete.length > 0) {
                isUploadingImages = true; // Also block reloads during delete
                console.log('🔒 Delete lock ON');
                
                submitButton.textContent = `Removing images 0/${imagesToDelete.length}...`;
                for (let i = 0; i < imagesToDelete.length; i++) {
                    const imgUrl = imagesToDelete[i];
                    try {
                        console.log(`[${i + 1}/${imagesToDelete.length}] Deleting:`, imgUrl);
                        await deleteRoomImageByUrl(id, imgUrl);
                        submitButton.textContent = `Removing images ${i + 1}/${imagesToDelete.length}...`;
                    } catch (err) {
                        console.error('Failed to delete image:', err);
                    }
                    // Add small delay between deletes
                    if (i < imagesToDelete.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
                console.log('🔓 Delete lock OFF');
            }
            
            // Now upload pending images (images added during this edit session)
            const pendingFiles = getPendingFilesForUpload('edit');
            console.log('Pending files to upload:', pendingFiles.length, pendingFiles);
            console.log('Room ID for upload:', id);
            
            let uploadedCount = 0;
            let failedCount = 0;
            
            if (pendingFiles.length > 0) {
                // Set global flag to prevent any reloads during upload
                isUploadingImages = true;
                console.log('🔒 Upload lock ON');
                
                submitButton.textContent = `Uploading images 0/${pendingFiles.length}...`;
                console.log('=== STARTING UPLOAD LOOP ===');
                
                for (let i = 0; i < pendingFiles.length; i++) {
                    const item = pendingFiles[i];
                    console.log(`[${i + 1}/${pendingFiles.length}] Starting upload:`, item.file.name, 'category:', item.category);
                    
                    try {
                        const result = await uploadRoomImageWithCategory(id, item.file, item.category, item.order);
                        console.log(`[${i + 1}/${pendingFiles.length}] Upload SUCCESS:`, result);
                        uploadedCount++;
                        submitButton.textContent = `Uploading images ${uploadedCount}/${pendingFiles.length}...`;
                    } catch (imgErr) {
                        console.error(`[${i + 1}/${pendingFiles.length}] Upload FAILED:`, imgErr);
                        failedCount++;
                    }
                    
                    console.log(`[${i + 1}/${pendingFiles.length}] Completed. Waiting 500ms before next...`);
                    
                    // Add delay between uploads to prevent server overload
                    if (i < pendingFiles.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        console.log(`[${i + 1}/${pendingFiles.length}] Wait done. Continuing to next file...`);
                    }
                }
                
                // Release the upload lock
                isUploadingImages = false;
                console.log('🔓 Upload lock OFF');
                
                console.log('=== UPLOAD LOOP FINISHED ===');
                console.log(`Upload summary: ${uploadedCount} success, ${failedCount} failed`);
                if (failedCount > 0) {
                    alert(`${failedCount} image(s) failed to upload. Please try again.`);
                }
            }
            
            // Save the final image order ONLY if no new uploads happened
            // (If we uploaded, the order is already correct in DB - don't overwrite with stale data)
            if (pendingFiles.length === 0 && (existingImages.cover.length > 0 || existingImages.room.length > 0)) {
                submitButton.textContent = 'Saving order...';
                try {
                    // Get final order of existing images (URLs only)
                    const coverUrls = existingImages.cover.map(img => img.originalUrl);
                    const roomUrls = existingImages.room.map(img => img.originalUrl);
                    
                    // Use single endpoint to save all image orders
                    await updateAllImagesOrder(id, coverUrls, roomUrls);
                    console.log('✓ Image order saved');
                } catch (orderErr) {
                    console.error('Failed to save image order:', orderErr);
                }
            } else if (pendingFiles.length > 0) {
                console.log('⏭️ Skipping order save - just uploaded new images');
            }
            
            console.log('=== ALL OPERATIONS COMPLETE ===');
            
            // Make sure lock is off before reloading
            isUploadingImages = false;
            
            await roomManager.loadRooms(); // Reload to get updated data
            
            console.log('=== ROOMS RELOADED ===');
            alert('Room updated successfully!');
            closeModal();
            currentEditRoomId = null; // Clear current edit room
            displayRooms();
            updateDashboard();
        } catch (error) {
            console.error('=== UPDATE ROOM ERROR ===', error);
            isUploadingImages = false; // Make sure to release lock on error
            alert('Error updating room: ' + error.message);
        } finally {
            // Re-enable button after operation completes
            isUploadingImages = false; // Final safety release
            submitButton.disabled = false;
            submitButton.textContent = originalText;
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
    currentEditRoomId = null; // Clear current edit room
    imagesToDelete = []; // Clear deletion list
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
    const bookedUntilGroup = document.getElementById('booked-until-group');
    if (bookedUntilGroup) {
        bookedUntilGroup.style.display = 'none';
    }
    // Reset image galleries
    resetImageGalleries('room');
}

// ===== Multi-Image Gallery System =====

// Current room being edited (for immediate uploads)
let currentEditRoomId = null;

// Store pending images for upload (only used for NEW rooms)
let pendingImages = {
    room: { cover: [], room: [] },
    edit: { cover: [], room: [] }
};

// Store existing images for edit mode
let existingImages = {
    cover: [],
    room: []
};

// Images marked for deletion
let imagesToDelete = [];

// Initialize image galleries on page load
document.addEventListener('DOMContentLoaded', function() {
    // Setup Add Room galleries
    setupImageGallery('room-cover-gallery', 'room-cover-dropzone', 'room', 'cover');
    setupImageGallery('room-images-gallery', 'room-images-dropzone', 'room', 'room');
    
    // Setup Edit Room galleries
    setupImageGallery('edit-room-cover-gallery', 'edit-room-cover-dropzone', 'edit', 'cover');
    setupImageGallery('edit-room-images-gallery', 'edit-room-images-dropzone', 'edit', 'room');
});

// Setup a single image gallery with drag-drop
function setupImageGallery(galleryId, dropzoneId, formType, category) {
    const gallery = document.getElementById(galleryId);
    const dropzone = document.getElementById(dropzoneId);
    
    if (!gallery || !dropzone) return;
    
    const fileInput = dropzone.querySelector('input[type="file"]');
    
    // Click to select files
    dropzone.addEventListener('click', (e) => {
        // Don't trigger if clicking on the file input itself
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });
    
    // File input change - handle async properly
    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            console.log(`Selected ${files.length} files for upload`);
            await handleImageFiles(files, formType, category);
        }
        fileInput.value = ''; // Reset for next selection
    });
    
    // Drag and drop for adding new images
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        gallery.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        gallery.addEventListener(eventName, () => gallery.classList.add('drag-over'));
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        gallery.addEventListener(eventName, () => gallery.classList.remove('drag-over'));
    });
    
    gallery.addEventListener('drop', async (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            console.log(`Dropped ${files.length} files for upload`);
            await handleImageFiles(files, formType, category);
        }
    });
}

// Handle selected image files - add to pending for preview (upload on save)
async function handleImageFiles(files, formType, category) {
    const fileArray = Array.from(files);
    console.log(`handleImageFiles: ${fileArray.length} files, formType=${formType}, category=${category}`);
    
    // Add files to pending for preview (will upload when clicking Update Room)
    for (const file of fileArray) {
        // Validate file
        if (!file.type.startsWith('image/')) {
            alert('Please select only image files');
            continue;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert(`Image "${file.name}" is too large. Max 5MB.`);
            continue;
        }
        
        // Read file and add to pending
        const preview = await readFileAsDataURL(file);
        const imageData = {
            id: 'new_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            file: file,
            preview: preview,
            isNew: true
        };
        pendingImages[formType][category].push(imageData);
    }
    
    // Render gallery with new images
    renderImageGallery(formType, category);
}

// Helper to read file as data URL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Render image gallery
function renderImageGallery(formType, category) {
    const galleryId = formType === 'edit' 
        ? (category === 'cover' ? 'edit-room-cover-gallery' : 'edit-room-images-gallery')
        : (category === 'cover' ? 'room-cover-gallery' : 'room-images-gallery');
    
    const gallery = document.getElementById(galleryId);
    if (!gallery) return;
    
    // Get dropzone
    const dropzone = gallery.querySelector('.image-drop-zone');
    
    // Clear all image items but keep dropzone
    gallery.querySelectorAll('.gallery-image-item').forEach(item => item.remove());
    
    // Combine existing and pending images
    const images = formType === 'edit' 
        ? [...existingImages[category], ...pendingImages[formType][category]]
        : pendingImages[formType][category];
    
    // Add image items before dropzone
    images.forEach((img, index) => {
        const item = createGalleryImageItem(img, index, formType, category);
        gallery.insertBefore(item, dropzone);
    });
}

// Create gallery image item element
function createGalleryImageItem(imageData, index, formType, category) {
    const item = document.createElement('div');
    item.className = 'gallery-image-item';
    item.draggable = true;
    item.dataset.imageId = imageData.id;
    item.dataset.index = index;
    item.dataset.formType = formType;
    item.dataset.category = category;
    
    const imgSrc = imageData.preview || imageData.url;
    
    item.innerHTML = `
        <img src="${imgSrc}" alt="Room image ${index + 1}">
        <span class="image-order">${index + 1}</span>
        <button type="button" class="image-delete-btn" title="Delete image">×</button>
    `;
    
    // Click to view
    item.querySelector('img').addEventListener('click', (e) => {
        e.stopPropagation();
        openImageViewer(imgSrc);
    });
    
    // Delete button
    item.querySelector('.image-delete-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteGalleryImage(imageData, formType, category);
    });
    
    // Drag events for reordering
    item.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        item.classList.add('dragging');
        // Store the image ID for lookup during drop
        e.dataTransfer.setData('text/plain', JSON.stringify({
            imageId: imageData.id,
            formType,
            category
        }));
        e.dataTransfer.effectAllowed = 'move';
    });
    
    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        // Remove any visual indicators
        document.querySelectorAll('.gallery-image-item.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    });
    
    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggingItem = document.querySelector('.gallery-image-item.dragging');
        if (draggingItem && draggingItem !== item) {
            item.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        }
    });
    
    item.addEventListener('dragleave', (e) => {
        item.classList.remove('drag-over');
    });
    
    item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drag-over');
        
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.formType === formType && data.category === category && data.imageId !== imageData.id) {
                // Find current indices by image ID
                const fromIndex = findImageIndex(data.imageId, formType, category);
                const toIndex = findImageIndex(imageData.id, formType, category);
                
                if (fromIndex !== -1 && toIndex !== -1) {
                    reorderImages(fromIndex, toIndex, formType, category);
                }
            }
        } catch (err) {
            console.error('Drop error:', err);
        }
    });
    
    return item;
}

// Find index of image by its ID
function findImageIndex(imageId, formType, category) {
    let images;
    if (formType === 'edit') {
        images = [...existingImages[category], ...pendingImages[formType][category]];
    } else {
        images = pendingImages[formType][category];
    }
    return images.findIndex(img => img.id === imageId);
}

// Delete image from gallery
function deleteGalleryImage(imageData, formType, category) {
    console.log('deleteGalleryImage:', imageData.id, 'isNew:', imageData.isNew, 'formType:', formType);
    
    if (imageData.isNew) {
        // Remove from pending (not uploaded yet) - no server call needed
        console.log('Removing NEW image from pending');
        pendingImages[formType][category] = pendingImages[formType][category]
            .filter(img => img.id !== imageData.id);
        renderImageGallery(formType, category);
    } else if (formType === 'edit') {
        // For existing images in edit mode - mark for deletion (will delete on save)
        if (!confirm('Remove this image? It will be deleted when you click Update Room.')) return;
        
        console.log('Marking EXISTING image for deletion:', imageData.originalUrl);
        // Mark for deletion on save
        imagesToDelete.push(imageData.originalUrl);
        
        // Remove from local display
        existingImages[category] = existingImages[category]
            .filter(img => img.id !== imageData.id);
        renderImageGallery(formType, category);
    } else {
        // Fallback: remove from display
        console.log('Removing image (fallback)');
        pendingImages[formType][category] = pendingImages[formType][category]
            .filter(img => img.id !== imageData.id);
        renderImageGallery(formType, category);
    }
}

// Reorder images via drag and drop
function reorderImages(fromIndex, toIndex, formType, category) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    
    console.log(`Reordering: ${fromIndex} -> ${toIndex} in ${formType}/${category}`);
    
    let images;
    if (formType === 'edit') {
        // Combine existing and pending for reordering
        images = [...existingImages[category], ...pendingImages[formType][category]];
    } else {
        images = [...pendingImages[formType][category]];
    }
    
    if (fromIndex >= images.length || toIndex >= images.length) return;
    
    // Move item from source to destination
    const [movedItem] = images.splice(fromIndex, 1);
    images.splice(toIndex, 0, movedItem);
    
    // Update arrays - maintain order but separate by type
    if (formType === 'edit') {
        // Keep all images in their new order, but split by isNew flag
        existingImages[category] = images.filter(img => !img.isNew);
        pendingImages[formType][category] = images.filter(img => img.isNew);
    } else {
        pendingImages[formType][category] = images;
    }
    
    renderImageGallery(formType, category);
}

// Reset image galleries
function resetImageGalleries(formType) {
    pendingImages[formType] = { cover: [], room: [] };
    if (formType === 'edit') {
        existingImages = { cover: [], room: [] };
        imagesToDelete = [];
    }
    renderImageGallery(formType, 'cover');
    renderImageGallery(formType, 'room');
}

// Setup existing images for edit form
function setupEditRoomImages(room) {
    resetImageGalleries('edit');
    
    // Load existing images from room data
    if (room.images) {
        // New format: room.images = { cover: [...], room: [...] }
        existingImages.cover = (room.images.cover || []).map((url, idx) => ({
            id: `existing_cover_${idx}`,
            url: buildImageUrl(url),
            preview: buildImageUrl(url),
            isNew: false,
            originalUrl: url
        }));
        existingImages.room = (room.images.room || []).map((url, idx) => ({
            id: `existing_room_${idx}`,
            url: buildImageUrl(url),
            preview: buildImageUrl(url),
            isNew: false,
            originalUrl: url
        }));
    } else if (room.imageUrl) {
        // Legacy single image - treat as cover
        existingImages.cover = [{
            id: 'existing_cover_0',
            url: buildImageUrl(room.imageUrl),
            preview: buildImageUrl(room.imageUrl),
            isNew: false,
            originalUrl: room.imageUrl
        }];
    }
    
    renderImageGallery('edit', 'cover');
    renderImageGallery('edit', 'room');
}

// Build full image URL
function buildImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const basePath = API_BASE_URL.split('/backend')[0] || '';
    return basePath + url;
}

// Get images data for saving
function getImagesForSave(formType) {
    const coverImages = formType === 'edit'
        ? [...existingImages.cover, ...pendingImages[formType].cover]
        : pendingImages[formType].cover;
    
    const roomImages = formType === 'edit'
        ? [...existingImages.room, ...pendingImages[formType].room]
        : pendingImages[formType].room;
    
    return {
        cover: coverImages,
        room: roomImages,
        toDelete: formType === 'edit' ? imagesToDelete : []
    };
}

// Get pending files for upload
function getPendingFilesForUpload(formType) {
    const files = [];
    
    console.log('Getting pending files for:', formType);
    console.log('Pending cover images:', pendingImages[formType].cover.length);
    console.log('Pending room images:', pendingImages[formType].room.length);
    
    pendingImages[formType].cover.forEach((img, idx) => {
        if (img.file) {
            files.push({ file: img.file, category: 'cover', order: idx });
        }
    });
    
    pendingImages[formType].room.forEach((img, idx) => {
        if (img.file) {
            files.push({ file: img.file, category: 'room', order: idx });
        }
    });
    
    console.log('Total files to upload:', files.length);
    return files;
}

// Quick edit modal for price update from dashboard
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
    
    const price = parseFloat(document.getElementById('quick-price').value);
    
    const updatedData = {
        price: price
    };
    
    try {
        await roomManager.updateRoom(id, updatedData);
        alert('Room updated successfully!');
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

// ===== Date Selection and Booking System =====

let selectedRoom = null;
let selectedDates = new Set(); // Store multiple selected dates
let currentBookingInterval = null;
let lastClickedCell = null;

// Get booked intervals for a room
function getBookedIntervalsForRoom(room) {
    return room.bookedIntervals || [];
}

// Find the booking interval that contains a specific date
function findIntervalForDate(intervals, dateStr) {
    return intervals.find(interval => {
        const checkIn = new Date(interval.checkIn);
        const checkOut = new Date(interval.checkOut);
        const targetDate = new Date(dateStr);
        
        return targetDate >= checkIn && targetDate < checkOut;
    });
}

// Handle click on booked date - show edit booking form
function handleBookedDateClick(room, interval, event) {
    console.log('handleBookedDateClick called:', { room, interval });
    
    if (!interval) {
        console.error('No interval provided');
        return;
    }
    
    selectedRoom = room;
    currentBookingInterval = interval;
    lastClickedCell = event?.currentTarget;
    
    console.log('Set currentBookingInterval:', currentBookingInterval);
    
    // Populate edit form with booking info
    document.getElementById('unlock-room-name').textContent = room.name;
    document.getElementById('unlock-checkin-display').textContent = formatDateDisplay(interval.checkIn);
    document.getElementById('unlock-checkout-display').textContent = formatDateDisplay(interval.checkOut);
    
    const nights = calculateNights(interval.checkIn, interval.checkOut);
    document.getElementById('unlock-duration').textContent = nights;
    
    // Populate editable fields
    document.getElementById('edit-guest-name').value = interval.guestName || '';
    document.getElementById('edit-guest-phone').value = interval.guestPhone || '';
    document.getElementById('edit-guest-email').value = interval.guestEmail || '';
    document.getElementById('edit-booking-notes').value = interval.notes || '';
    
    // Show modal with edit form
    document.getElementById('booking-modal-title').textContent = 'Edit Booking';
    document.getElementById('booking-form').style.display = 'none';
    document.getElementById('unlock-form').style.display = 'block';
    
    // Hide floating button
    const floatingBtn = document.getElementById('confirm-selection-btn');
    if (floatingBtn) {
        floatingBtn.style.display = 'none';
    }
    
    showModalAboveSelection();

    // Ensure cancel booking button is enabled and ready for use
    const cancelBtn = document.querySelector('.cancel-booking-section .btn-danger-outline');
    if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.classList.remove('btn-disabled');
        cancelBtn.textContent = 'Cancel Booking';
    }
    // Reset cancel flag
    isCancelBookingInProgress = false;
}

// Validate edit booking form
function validateEditBookingForm() {
    const guestName = document.getElementById('edit-guest-name').value.trim();
    const saveBtn = document.getElementById('save-booking-btn');
    
    if (saveBtn) {
        saveBtn.disabled = !guestName;
    }
}

// Save booking changes
let isSavingBooking = false;

async function saveBookingChanges() {
    // Prevent double submission
    if (isSavingBooking) {
        console.log('Save already in progress, ignoring click');
        return;
    }
    
    if (!selectedRoom || !currentBookingInterval) {
        console.error('Missing data:', { selectedRoom, currentBookingInterval });
        alert('Error: No booking selected');
        return;
    }
    
    const guestName = document.getElementById('edit-guest-name').value.trim();
    const guestPhone = document.getElementById('edit-guest-phone').value.trim();
    const guestEmail = document.getElementById('edit-guest-email').value.trim();
    const notes = document.getElementById('edit-booking-notes').value.trim();
    
    if (!guestName) {
        alert('Please enter guest name');
        return;
    }
    
    // Set flag and disable button
    isSavingBooking = true;
    const saveBtn = document.querySelector('.booking-modal-content .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
    
    try {
        const roomId = selectedRoom._id || selectedRoom.room_id || selectedRoom.id;
        console.log('Updating booking:', {
            roomId,
            checkIn: currentBookingInterval.checkIn,
            checkOut: currentBookingInterval.checkOut,
            guestName
        });
        
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/update-booking`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                checkIn: currentBookingInterval.checkIn,
                checkOut: currentBookingInterval.checkOut,
                guestName: guestName,
                guestPhone: guestPhone,
                guestEmail: guestEmail,
                notes: notes
            })
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response data:', result);
        
        if (response.ok || result.success) {
            closeBookingModal();
            await roomManager.loadRooms();
            filterRooms();
            alert('Booking updated successfully!');
        } else {
            alert('Failed to update booking: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating booking:', error);
        alert('Failed to update booking: ' + error.message);
    } finally {
        // Reset flag and button
        isSavingBooking = false;
        const saveBtn = document.querySelector('.booking-modal-content .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// Handle date selection for booking - toggle individual days
function handleDateSelection(event, room, date) {
    const cell = event.currentTarget;
    
    // Don't allow selection on past or booked dates
    if (cell.classList.contains('past') || cell.classList.contains('booked')) {
        return;
    }
    
    // If selecting from a different room, reset selection
    if (selectedRoom && (selectedRoom.room_id || selectedRoom.id) !== (room.room_id || room.id)) {
        resetDateSelection();
    }
    
    selectedRoom = room;
    lastClickedCell = cell;
    
    const dateStr = formatDateString(date);
    
    // Toggle this date - if already selected, remove it; otherwise add it
    if (selectedDates.has(dateStr)) {
        selectedDates.delete(dateStr);
        cell.classList.remove('day-selected');
    } else {
        selectedDates.add(dateStr);
        cell.classList.add('day-selected');
    }
    
    // Update visual immediately on the clicked cell
    updateCellHighlight(cell, selectedDates.has(dateStr));
    
    // If we have selected dates, show the booking button
    updateBookingButton();
}

// Update single cell highlight immediately
function updateCellHighlight(cell, isSelected) {
    if (isSelected) {
        cell.classList.add('day-selected');
    } else {
        cell.classList.remove('day-selected');
    }
}

// Update booking button visibility
function updateBookingButton() {
    let confirmBtn = document.getElementById('confirm-selection-btn');
    
    if (selectedDates.size > 0) {
        if (!confirmBtn) {
            // Create floating confirm button
            confirmBtn = document.createElement('div');
            confirmBtn.id = 'confirm-selection-btn';
            confirmBtn.className = 'floating-confirm-btn';
            confirmBtn.innerHTML = `
                <span class="selected-count">${selectedDates.size} day(s) selected</span>
                <button class="btn-confirm" onclick="openBookingFormForSelectedDates()">Book Now</button>
                <button class="btn-clear" onclick="resetDateSelection()">Clear</button>
            `;
            document.body.appendChild(confirmBtn);
        } else {
            confirmBtn.querySelector('.selected-count').textContent = `${selectedDates.size} day(s) selected`;
            confirmBtn.style.display = 'flex';
        }
    } else {
        if (confirmBtn) {
            confirmBtn.style.display = 'none';
        }
    }
}

// Open booking form for selected dates
function openBookingFormForSelectedDates() {
    if (selectedDates.size === 0 || !selectedRoom) return;
    
    // Sort dates and get first and last
    const sortedDates = Array.from(selectedDates).sort();
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];
    
    // Calculate checkout (day after last selected date)
    const checkoutDate = new Date(lastDate);
    checkoutDate.setDate(checkoutDate.getDate() + 1);
    
    showBookingFormMultiple(selectedRoom, firstDate, formatDateString(checkoutDate), sortedDates);
}

// Check if any dates in range are booked
function isRangeBooked(room, startDate, endDate) {
    const bookedDates = getBookedDatesForRoom(room);
    let current = new Date(startDate);
    
    while (current < endDate) {
        const dateStr = formatDateString(current);
        if (bookedDates.has(dateStr)) {
            return true;
        }
        current.setDate(current.getDate() + 1);
    }
    
    return false;
}

// Highlight selected dates (called when re-rendering calendar)
function highlightSelectedDates() {
    // Clear previous highlights
    document.querySelectorAll('.calendar-day').forEach(cell => {
        cell.classList.remove('day-selected', 'selected-start', 'selected-end', 'selected-range');
    });
    
    if (selectedDates.size === 0 || !selectedRoom) return;
    
    // Highlight all selected cells for the selected room's calendar
    const roomId = selectedRoom.room_id || selectedRoom.id;
    const cells = document.querySelectorAll(`.calendar-day[data-room-id="${roomId}"]`);
    
    cells.forEach(cell => {
        const dateStr = cell.dataset.date;
        if (selectedDates.has(dateStr)) {
            cell.classList.add('day-selected');
        }
    });
}

// Reset date selection
function resetDateSelection() {
    selectedDates.clear();
    selectedRoom = null;
    
    document.querySelectorAll('.calendar-day').forEach(cell => {
        cell.classList.remove('day-selected', 'selected-start', 'selected-end', 'selected-range');
    });
    
    // Hide confirm button
    const confirmBtn = document.getElementById('confirm-selection-btn');
    if (confirmBtn) {
        confirmBtn.style.display = 'none';
    }
}

// Show booking form with selected dates
function showBookingFormMultiple(room, checkIn, checkOut, selectedDatesList) {
    // Hide the floating confirm button to avoid overlap
    const floatingBtn = document.getElementById('confirm-selection-btn');
    if (floatingBtn) {
        floatingBtn.style.display = 'none';
    }
    
    // Populate booking form
    document.getElementById('booking-room-name').textContent = room.name;
    document.getElementById('booking-checkin-display').textContent = formatDateDisplay(checkIn);
    document.getElementById('booking-checkout-display').textContent = formatDateDisplay(checkOut);
    
    const nights = selectedDatesList.length;
    document.getElementById('booking-duration').textContent = nights;
    
    // Clear previous form data
    document.getElementById('guest-name').value = '';
    document.getElementById('guest-phone').value = '';
    document.getElementById('guest-email').value = '';
    document.getElementById('booking-notes').value = '';
    
    // Reset booking flag and button state for new booking
    isBookingInProgress = false;
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;  // Will be enabled when guest name is entered
        confirmBtn.textContent = 'Confirm Booking';
        confirmBtn.style.pointerEvents = 'auto';
    }
    
    // Show modal with booking form
    document.getElementById('booking-modal-title').textContent = 'Create Booking';
    document.getElementById('booking-form').style.display = 'block';
    document.getElementById('unlock-form').style.display = 'none';
    
    // Position modal above selection
    showModalAboveSelection();
    
    // Reset booking flag when showing form
    isBookingInProgress = false;
    
    // Set up form submission with double-submit prevention
    const form = document.getElementById('booking-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        // Disable submit button immediately on form submit
        const submitBtn = document.getElementById('confirm-booking-btn');
        if (submitBtn && submitBtn.disabled) {
            console.log('Button already disabled, ignoring form submit');
            return false;
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
        }
        confirmBookingMultiple(checkIn, checkOut);
        return false;
    };
}

// Show booking form with selected dates (legacy support)
function showBookingForm(room, startDate, endDate) {
    const checkIn = formatDateString(startDate);
    const checkOut = formatDateString(endDate);
    
    // Build selected dates list
    const selectedDatesList = [];
    let current = new Date(startDate);
    while (current < endDate) {
        selectedDatesList.push(formatDateString(current));
        current.setDate(current.getDate() + 1);
    }
    
    showBookingFormMultiple(room, checkIn, checkOut, selectedDatesList);
}

// Show modal positioned to not cover the selection
function showModalAboveSelection() {
    const modal = document.getElementById('booking-modal');
    const modalContent = modal.querySelector('.booking-modal-content');
    
    modal.style.display = 'flex';
    modal.classList.remove('positioned-above', 'positioned-below');
    
    // Reset any previous drag position
    modalContent.style.position = 'relative';
    modalContent.style.left = '0';
    modalContent.style.top = '0';
    
    // Get the selected cells position
    if (lastClickedCell) {
        const cellRect = lastClickedCell.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const modalHeight = modalContent.offsetHeight || 400;
        
        // Calculate available space above and below
        const spaceAbove = cellRect.top;
        const spaceBelow = viewportHeight - cellRect.bottom;
        
        // Position modal where there's more space
        if (spaceAbove > spaceBelow && spaceAbove > modalHeight + 50) {
            // Position above the selection
            modal.classList.add('positioned-above');
            modalContent.style.marginTop = '0';
            modalContent.style.marginBottom = `${viewportHeight - cellRect.top + 20}px`;
        } else {
            // Position below the selection
            modal.classList.add('positioned-below');
            modalContent.style.marginTop = `${cellRect.bottom + 20}px`;
            modalContent.style.marginBottom = '0';
        }
    }
    
    // Make modal draggable
    makeModalDraggable(modalContent);
    
    // Focus on guest name input
    setTimeout(() => {
        const guestNameInput = document.getElementById('guest-name');
        if (guestNameInput) guestNameInput.focus();
    }, 100);
}

// Make modal draggable
function makeModalDraggable(modalContent) {
    const header = modalContent.querySelector('.modal-header');
    if (!header) return;
    
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    // Remove previous listeners if any
    header.onmousedown = null;
    
    header.onmousedown = function(e) {
        // Don't start drag on close button click
        if (e.target.closest('.close-btn')) return;
        
        isDragging = true;
        modalContent.classList.add('dragging');
        
        startX = e.clientX;
        startY = e.clientY;
        initialX = parseInt(modalContent.style.left || '0');
        initialY = parseInt(modalContent.style.top || '0');
        
        document.onmousemove = function(e) {
            if (!isDragging) return;
            
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            modalContent.style.left = `${initialX + dx}px`;
            modalContent.style.top = `${initialY + dy}px`;
        };
        
        document.onmouseup = function() {
            isDragging = false;
            modalContent.classList.remove('dragging');
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

// Calculate number of nights
function calculateNights(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Format date for display
function formatDateDisplay(date) {
    const d = new Date(date);
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-US', options);
}

// Confirm booking
async function confirmBooking() {
    // Check if already in progress
    if (isBookingInProgress) {
        console.log('Booking already in progress, ignoring click');
        return;
    }
    
    // Redirect to new function
    const sortedDates = Array.from(selectedDates).sort();
    if (sortedDates.length === 0) {
        alert('Please select dates first');
        return;
    }
    const checkOut = new Date(sortedDates[sortedDates.length - 1]);
    checkOut.setDate(checkOut.getDate() + 1);
    confirmBookingMultiple(sortedDates[0], formatDateString(checkOut));
}

// Confirm booking with multiple dates
let isBookingInProgress = false;

async function confirmBookingMultiple(checkIn, checkOut) {
    // Prevent double submission - CHECK AND SET FLAG IMMEDIATELY
    if (isBookingInProgress) {
        console.log('Booking already in progress, ignoring click');
        return;
    }
    
    // Set flag IMMEDIATELY before any other code runs
    isBookingInProgress = true;
    console.log('Starting booking process, flag set to true');
    
    // Get and disable button immediately - use the specific button ID
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';
        confirmBtn.style.pointerEvents = 'none';
    }
    
    try {
        if (!selectedRoom || selectedDates.size === 0) {
            alert('Please select dates first');
            return;
        }
        
        const guestName = document.getElementById('guest-name').value.trim();
        if (!guestName) {
            alert('Guest name is required');
            return;
        }
        
        const bookingData = {
            checkIn: checkIn,
            checkOut: checkOut,
            guestName: guestName,
            guestPhone: document.getElementById('guest-phone').value.trim(),
            guestEmail: document.getElementById('guest-email').value.trim(),
            notes: document.getElementById('booking-notes').value.trim()
        };
        
        const roomId = selectedRoom.room_id || selectedRoom.id;
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Booking created successfully!');
            closeBookingModal();
            resetDateSelection();
            await roomManager.loadRooms();
        } else {
            alert('Failed to create booking: ' + result.error);
            // Re-enable button on error
            const submitBtn = document.getElementById('confirm-booking-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Confirm Booking';
            }
        }
    } catch (error) {
        console.error('Error creating booking:', error);
        alert('Error creating booking. Please try again.');
        // Re-enable button on error
        const submitBtn = document.getElementById('confirm-booking-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Booking';
        }
    } finally {
        // Reset flag
        isBookingInProgress = false;
    }
}

// Confirm unlock/cancel booking
let isCancelBookingInProgress = false;
async function confirmUnlockRoom() {
    if (isCancelBookingInProgress) return;
    isCancelBookingInProgress = true;
    const cancelBtn = document.querySelector('.cancel-booking-section .btn-danger-outline');
    let originalText = '';
    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.classList.add('btn-disabled');
        originalText = cancelBtn.textContent;
        cancelBtn.textContent = 'Processing...';
    }
    if (!selectedRoom || !currentBookingInterval) {
        alert('No booking selected');
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.classList.remove('btn-disabled');
            cancelBtn.textContent = originalText || 'Cancel Booking';
        }
        isCancelBookingInProgress = false;
        return;
    }
    try {
        const roomId = selectedRoom.room_id || selectedRoom.id;
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/unbook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                checkIn: currentBookingInterval.checkIn,
                checkOut: currentBookingInterval.checkOut
            })
        });
        const result = await response.json();
        if (result.success) {
            alert('Booking cancelled successfully!');
            closeBookingModal();
            currentBookingInterval = null;
            await roomManager.loadRooms();
            isCancelBookingInProgress = false;
        } else {
            alert('Failed to cancel booking: ' + result.error);
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.classList.remove('btn-disabled');
                cancelBtn.textContent = originalText || 'Cancel Booking';
            }
            isCancelBookingInProgress = false;
        }
    } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Error cancelling booking. Please try again.');
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.classList.remove('btn-disabled');
            cancelBtn.textContent = originalText || 'Cancel Booking';
        }
    } finally {
        isCancelBookingInProgress = false;
    }
}

// Close booking modal
function closeBookingModal() {
    const modal = document.getElementById('booking-modal');
    const modalContent = modal.querySelector('.booking-modal-content');

    modal.style.display = 'none';
    modal.classList.remove('positioned-above', 'positioned-below');
    modalContent.style.marginTop = '';
    modalContent.style.marginBottom = '';

    resetDateSelection();
    currentBookingInterval = null;
    lastClickedCell = null;

    // Reset cancel flag so user can cancel again
    isCancelBookingInProgress = false;

    // Reset cancel button state if present
    const cancelBtn = document.querySelector('.cancel-booking-section .btn-danger-outline');
    if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.classList.remove('btn-disabled');
        cancelBtn.textContent = 'Cancel Booking';
    }

    // Show floating button again (if needed - will be updated by updateBookingButton)
    updateBookingButton();
}

// Validate booking form and enable/disable confirm button
function validateBookingForm() {
    const guestName = document.getElementById('guest-name').value.trim();
    const confirmBtn = document.getElementById('confirm-booking-btn');
    
    if (confirmBtn) {
        confirmBtn.disabled = !guestName;
    }
}