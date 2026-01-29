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

// ===== Logging Configuration =====
// Set to true to enable detailed debug logs (URLs, data, etc.)
// Set to false for production (only essential action confirmations)
const DEBUG_MODE = false;

// Logger utility - only logs essential messages in production
const logger = {
    // Always show these (essential confirmations)
    info: (msg) => console.log(`✓ ${msg}`),
    warn: (msg) => console.warn(`⚠ ${msg}`),
    error: (msg) => console.error(`✗ ${msg}`),
    // Only show in debug mode (URLs, detailed data, etc.)
    debug: (...args) => { if (DEBUG_MODE) console.log(...args); }
};

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
                        logger.debug('🚫 Blocked Live Server reload during upload');
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

// ===== Secure Authentication =====
// Authentication is now handled securely via backend API
// No credentials are stored in frontend code

// Auth API URL
const AUTH_API_URL = (function() {
    const host = window.location.hostname;
    if (host === '127.0.0.1' || host === 'localhost') {
        return `http://${host}:5000/backend/api/auth`;
    }
    return 'https://khietanportal.vercel.app/backend/api/auth';
})();

// Get stored auth token
function getAuthToken() {
    return sessionStorage.getItem('authToken');
}

// Set auth token
function setAuthToken(token) {
    sessionStorage.setItem('authToken', token);
}

// Clear auth data
function clearAuthData() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('adminLoggedIn');
    sessionStorage.removeItem('adminUsername');
    sessionStorage.removeItem('adminRole');
    sessionStorage.removeItem('adminPermissions');
}

// Add auth header to fetch requests
function getAuthHeaders() {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Get user permissions from session storage
function getUserPermissions() {
    try {
        const permissions = sessionStorage.getItem('adminPermissions');
        return permissions ? JSON.parse(permissions) : [];
    } catch (e) {
        return [];
    }
}

// Check if user has specific permission
function hasPermission(permission) {
    const role = sessionStorage.getItem('adminRole');
    if (role === 'admin') return true; // Admins have all permissions
    
    const permissions = getUserPermissions();
    return permissions.includes(permission);
}

// Check if user is logged in on page load
document.addEventListener('DOMContentLoaded', async function() {
    const token = getAuthToken();
    if (token) {
        // Verify token is still valid
        try {
            const response = await fetch(`${AUTH_API_URL}/verify`, {
                method: 'GET',
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    sessionStorage.setItem('adminLoggedIn', 'true');
                    sessionStorage.setItem('adminUsername', data.user.displayName);
                    sessionStorage.setItem('adminRole', data.user.role);
                    sessionStorage.setItem('adminPermissions', JSON.stringify(data.user.permissions || []));
                    showDashboard();
                    return;
                }
            }
        } catch (error) {
            console.error('Token verification failed:', error);
        }
        // Token invalid, clear and show login
        clearAuthData();
    }
    showLoginPage();
});

// Login handler - now uses secure API
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');
    const loginBtn = document.querySelector('#login-form button[type="submit"]');
    
    // Disable button during login
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';
    }
    
    try {
        const response = await fetch(`${AUTH_API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            console.log('Login successful! Role:', data.user.role);
            
            // Store token and user info
            setAuthToken(data.token);
            sessionStorage.setItem('adminLoggedIn', 'true');
            sessionStorage.setItem('adminUsername', data.user.displayName);
            sessionStorage.setItem('adminRole', data.user.role);
            // Store permissions as JSON string
            sessionStorage.setItem('adminPermissions', JSON.stringify(data.user.permissions || []));
            
            showDashboard();
            errorElement.textContent = '';
        } else {
            console.log('Login failed:', data.error);
            errorElement.textContent = data.error || 'Invalid username or password';
            document.getElementById('password').value = '';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorElement.textContent = 'Connection error. Please try again.';
        document.getElementById('password').value = '';
    } finally {
        // Re-enable button
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
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
    
    // Always start on dashboard tab when logging in (prevents restricted tab access after role change)
    forceShowDashboardTab();
    
    // Initialize dashboard
    roomManager.loadRooms();
}

// Force show dashboard tab (used after login to ensure correct tab is shown)
function forceShowDashboardTab() {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show dashboard tab
    const dashboardTab = document.getElementById('dashboard');
    if (dashboardTab) {
        dashboardTab.classList.add('active');
    }
    
    // Mark dashboard menu item as active
    const dashboardMenuItem = document.querySelector('.menu-item[onclick="switchTab(\'dashboard\')"]');
    if (dashboardMenuItem) {
        dashboardMenuItem.classList.add('active');
    }
    
    // Show filter panel for dashboard
    const filterPanel = document.getElementById('dashboard-filter-panel');
    if (filterPanel) {
        filterPanel.style.display = 'flex';
    }
    
    // Update dashboard content
    updateDashboard();
}

// Apply role-based access control to UI elements
function applyRoleBasedAccess() {
    const role = sessionStorage.getItem('adminRole') || 'manager';
    const isAdmin = role === 'admin';
    
    // Get sidebar menu items for Manage Rooms, Add New Room, and Manage Users
    const sidebarMenu = document.querySelector('.sidebar-menu');
    const menuItems = sidebarMenu.querySelectorAll('li');
    
    // Menu items: [0] = Dashboard, [1] = Manage Rooms, [2] = Add New Room, [3] = Manage Users, [4] = Finance
    // For admins: show all. For managers: check individual permissions
    if (menuItems[1]) {
        menuItems[1].style.display = hasPermission('rooms') ? 'block' : 'none';
    }
    if (menuItems[2]) {
        menuItems[2].style.display = hasPermission('add-room') ? 'block' : 'none';
    }
    if (menuItems[3]) {
        menuItems[3].style.display = hasPermission('manage-users') ? 'block' : 'none';
    }
    if (menuItems[4]) {
        menuItems[4].style.display = hasPermission('finance') ? 'block' : 'none';
    }
    
    // Also hide the "+ Add New Room" button in Manage Rooms section header
    const addRoomBtn = document.querySelector('#rooms .rooms-header .btn-primary');
    if (addRoomBtn) {
        addRoomBtn.style.display = hasPermission('add-room') ? 'inline-flex' : 'none';
    }
    
    console.log('Role-based access applied. Role:', role, 'Is Admin:', isAdmin, 'Permissions:', getUserPermissions());
}

// Logout - clears all auth data including token
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        clearAuthData();  // Clear token and session data
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
        
        // Update filter panel display
        const isVisible = filterPanel.classList.contains('mobile-visible');
        filterPanel.style.display = isVisible ? 'block' : 'none';
        
        // Hide/show toggle button based on panel visibility
        if (toggleBtn) {
            if (isVisible) {
                toggleBtn.classList.remove('show');
            } else {
                toggleBtn.classList.add('show');
            }
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
                
                // Auto-sync iCal for all rooms with configured URLs (runs in background)
                autoSyncAllIcal();
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
    // Check permission-based access for tabs
    const restrictedTabs = ['rooms', 'add-room', 'manage-users', 'finance'];
    
    if (restrictedTabs.includes(tabName) && !hasPermission(tabName)) {
        alert('Access denied. You do not have permission to access this section.');
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
    
    // Update filter panel visibility based on tab and screen size
    handleFilterResponsive();
    
    // Update content based on tab
    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'rooms') {
        displayRooms();
    } else if (tabName === 'add-room') {
        resetForm();
    } else if (tabName === 'manage-users') {
        loadUsers();
    } else if (tabName === 'finance') {
        loadTransactions();
    }
}

// Update dashboard
async function updateDashboard() {
    // Update month display
    updateMonthDisplay();
    
    // Show filter panel on dashboard
    handleFilterResponsive();
    
    // Render room calendars with filters
    applyDashboardFilters();
}

// ===== Dashboard Filter Functions =====

// Handle responsive filter panel visibility on window resize
function handleFilterResponsive() {
    const filterPanel = document.getElementById('dashboard-filter-panel');
    const mobileFilterToggle = document.getElementById('mobile-filter-toggle');
    const dashboardTab = document.getElementById('dashboard');
    
    // Only show filter on Dashboard tab
    const isDashboardActive = dashboardTab && dashboardTab.classList.contains('active');
    
    if (!isDashboardActive) {
        // Not on dashboard - hide everything
        if (filterPanel) {
            filterPanel.style.display = 'none';
            filterPanel.classList.remove('mobile-visible');
        }
        if (mobileFilterToggle) {
            mobileFilterToggle.classList.remove('show');
        }
        return;
    }
    
    // On Dashboard tab
    if (window.innerWidth >= 768) {
        // Desktop/tablet: show filter panel, hide mobile toggle
        if (filterPanel) {
            filterPanel.style.display = 'flex';
            filterPanel.classList.remove('mobile-visible');
        }
        if (mobileFilterToggle) {
            mobileFilterToggle.classList.remove('show');
        }
    } else {
        // Mobile: hide filter panel by default (unless mobile-visible), show mobile toggle
        if (filterPanel && !filterPanel.classList.contains('mobile-visible')) {
            filterPanel.style.display = 'none';
        }
        if (mobileFilterToggle) {
            mobileFilterToggle.classList.add('show');
        }
    }
}

// Add resize listener
window.addEventListener('resize', handleFilterResponsive);

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

// Slide calendar horizontally
function slideCalendar(calendarPanel, scrollAmount) {
    const wrapper = calendarPanel.querySelector('.calendar-wrapper');
    if (wrapper) {
        wrapper.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    }
}

// Render all room calendars (legacy - now uses applyDashboardFilters)
function renderRoomCalendars() {
    applyDashboardFilters();
}

// Create a room calendar row, with optional temp selection
function createRoomCalendarRow(room, checkinDate, checkoutDate) {
    const row = document.createElement('div');
    row.className = 'room-calendar-row';

    // Room info panel - Two-row layout for mobile responsiveness
    // Row 1: Room ID + Room Name
    // Row 2: Price + Guests + Image (image aligned to the right)
    const infoPanel = document.createElement('div');
    infoPanel.className = 'room-info-panel';
    
    const roomId = room.room_id || room.id;
    const icalUrl = room.icalUrl || '';
    const lastSync = room.lastIcalSync ? new Date(room.lastIcalSync).toLocaleDateString() : '';
    
    // Check if promotion is active
    const hasPromotion = room.promotion && room.promotion.active;
    const discountPrice = room.promotion ? room.promotion.discountPrice : '';
    const role = sessionStorage.getItem('adminRole') || 'manager';
    const isAdmin = role === 'admin';
    
    // Build price display with promotion support
    const priceDisplay = hasPromotion 
        ? `<span class="original-price">$${room.price}</span><span class="discount-price">$${discountPrice}</span>` 
        : `$${room.price}`;
    
    infoPanel.innerHTML = `
        <div class="room-header-row">
            <span class="room-number">#${roomId}</span>
            <h4>${room.name}</h4>
        </div>
        <div class="room-details-row">
            <div class="room-details">
                <p class="room-price-line">${priceDisplay}/night</p>
                <p>${room.capacity || room.persons} guests</p>
            </div>
            <div class="room-image-placeholder"></div>
        </div>
        ${isAdmin ? `
        <div class="room-promotion-section" data-room-id="${roomId}">
            <div class="promotion-toggle-row">
                <label class="promotion-toggle">
                    <input type="checkbox" class="promotion-checkbox" ${hasPromotion ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <span class="promotion-label">Promotion</span>
            </div>
            <div class="promotion-price-input" style="display: ${hasPromotion ? 'flex' : 'none'};">
                <span class="currency-symbol">$</span>
                <input type="number" class="discount-price-input" 
                    placeholder="Discount price" 
                    value="${discountPrice}"
                    min="0" step="0.01"
                    title="Enter discounted price">
                <button type="button" class="btn-save-promotion" title="Save promotion">💾</button>
            </div>
        </div>
        ` : ''}
        ${isAdmin ? `
        <div class="room-ical-section" data-room-id="${roomId}">
            <div class="ical-input-row">
                <input type="url" class="ical-url-input" 
                    placeholder="Airbnb iCal URL" 
                    value="${icalUrl}"
                    title="Paste Airbnb iCal URL here">
                <button type="button" class="btn-ical-save" title="Save URL">💾</button>
                <button type="button" class="btn-ical-sync" title="Sync bookings" ${!icalUrl ? 'disabled' : ''}>🔄</button>
            </div>
            ${lastSync ? `<small class="ical-last-sync">Last sync: ${lastSync}</small>` : ''}
        </div>
        ` : ''}
    `;
    infoPanel.style.cursor = 'pointer';
    
    // Click handler for the main panel (excluding iCal section)
    infoPanel.addEventListener('click', (e) => {
        // Don't trigger edit if clicking on iCal section or promotion section
        if (e.target.closest('.room-ical-section')) return;
        if (e.target.closest('.room-promotion-section')) return;
        openQuickEditModal(roomId);
    });
    
    // Setup iCal button handlers (admin only)
    const icalSection = infoPanel.querySelector('.room-ical-section');
    if (icalSection) {
        const icalInput = icalSection.querySelector('.ical-url-input');
        const saveBtn = icalSection.querySelector('.btn-ical-save');
        const syncBtn = icalSection.querySelector('.btn-ical-sync');
        
        // Prevent click propagation on iCal elements
        icalInput.addEventListener('click', (e) => e.stopPropagation());
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            saveRoomIcalUrl(roomId, icalInput.value.trim(), saveBtn, syncBtn);
        });
        syncBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            syncRoomIcalFromCard(roomId, syncBtn);
        });
    }
    
    // Setup promotion handlers (admin only)
    const promotionSection = infoPanel.querySelector('.room-promotion-section');
    if (promotionSection) {
        const promotionCheckbox = promotionSection.querySelector('.promotion-checkbox');
        const promotionPriceInput = promotionSection.querySelector('.promotion-price-input');
        const discountInput = promotionSection.querySelector('.discount-price-input');
        const savePromotionBtn = promotionSection.querySelector('.btn-save-promotion');
        
        // Prevent click propagation on promotion elements
        promotionSection.addEventListener('click', (e) => e.stopPropagation());
        
        // Toggle promotion price input visibility
        promotionCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            promotionPriceInput.style.display = isChecked ? 'flex' : 'none';
            
            // If turning off promotion, save immediately
            if (!isChecked) {
                saveRoomPromotion(roomId, false, null, savePromotionBtn);
            }
        });
        
        // Save promotion on button click
        savePromotionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = promotionCheckbox.checked;
            const discountPrice = parseFloat(discountInput.value);
            
            if (isActive && (!discountPrice || discountPrice <= 0)) {
                alert('Please enter a valid discount price');
                return;
            }
            
            saveRoomPromotion(roomId, isActive, discountPrice, savePromotionBtn);
        });
        
        // Allow Enter key to save promotion
        discountInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                savePromotionBtn.click();
            }
        });
    }

    // Image / upload handling
    (function setupRoomImage() {
        const placeholder = infoPanel.querySelector('.room-image-placeholder');
        if (!placeholder) return;

        const role = sessionStorage.getItem('adminRole') || 'manager';
        const roomId = room.room_id || room.id;

        const basePath = API_BASE_URL.split('/backend')[0] || '';

        // Get image URL - prefer first cover image, then bedroom, bathroom, exterior, then legacy imageUrl
        let imageUrl = null;
        if (room.images) {
            if (room.images.cover && room.images.cover.length > 0) {
                imageUrl = room.images.cover[0];
            } else if (room.images.bedroom && room.images.bedroom.length > 0) {
                imageUrl = room.images.bedroom[0];
            } else if (room.images.bathroom && room.images.bathroom.length > 0) {
                imageUrl = room.images.bathroom[0];
            } else if (room.images.exterior && room.images.exterior.length > 0) {
                imageUrl = room.images.exterior[0];
            } else if (room.images.room && room.images.room.length > 0) {
                // Legacy fallback for old 'room' category
                imageUrl = room.images.room[0];
            }
        }
        // Fallback to legacy imageUrl only if no images in the new structure
        if (!imageUrl && room.imageUrl) {
            imageUrl = room.imageUrl;
        }

        // Function to show add button (for admin) or placeholder icon
        function showAddImageButton() {
            placeholder.innerHTML = ''; // Clear any failed image
            if (role === 'admin') {
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
            } else {
                // For non-admin, show a placeholder icon
                const placeholderIcon = document.createElement('span');
                placeholderIcon.className = 'no-image-icon';
                placeholderIcon.textContent = '🏠';
                placeholder.appendChild(placeholderIcon);
            }
        }

        if (imageUrl) {
            const img = document.createElement('img');
            img.className = 'room-image';
            img.src = (imageUrl.startsWith('http') ? imageUrl : (basePath + imageUrl));
            img.alt = room.name;
            
            // Handle image load error - show add button instead
            img.onerror = function() {
                showAddImageButton();
            };
            
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
        } else {
            // No image - show add button
            showAddImageButton();
        }
    })();

    // Calendar panel
    const calendarPanel = document.createElement('div');
    calendarPanel.className = 'calendar-panel';

    // Add slide navigation buttons
    const slideLeftBtn = document.createElement('button');
    slideLeftBtn.className = 'calendar-slide-btn slide-left';
    slideLeftBtn.innerHTML = '&#8249;';
    slideLeftBtn.title = 'Previous month';
    slideLeftBtn.onclick = (e) => {
        e.stopPropagation();
        changeMonth(-1);
    };

    const slideRightBtn = document.createElement('button');
    slideRightBtn.className = 'calendar-slide-btn slide-right';
    slideRightBtn.innerHTML = '&#8250;';
    slideRightBtn.title = 'Next month';
    slideRightBtn.onclick = (e) => {
        e.stopPropagation();
        changeMonth(1);
    };

    // Calendar wrapper for scrolling
    const calendarWrapper = document.createElement('div');
    calendarWrapper.className = 'calendar-wrapper';

    const calendarGrid = createCalendarGrid(room, checkinDate, checkoutDate);
    calendarWrapper.appendChild(calendarGrid);

    calendarPanel.appendChild(slideLeftBtn);
    calendarPanel.appendChild(calendarWrapper);
    calendarPanel.appendChild(slideRightBtn);

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
            let errText = '';
            // Provide user-friendly error messages
            if (resp.status === 413) {
                errText = 'File too large (max 4.5MB for server)';
            } else if (resp.status === 0 || resp.status === undefined) {
                errText = 'Network error - CORS blocked or server unavailable';
            } else {
                errText = resp.status + ' ' + resp.statusText;
                try {
                    if (contentType.includes('application/json')) {
                        const json = await resp.json();
                        errText = json.error || JSON.stringify(json);
                    } else {
                        const text = await resp.text();
                        if (text) errText = text;
                    }
                } catch (e) {}
            }
            const error = new Error(errText);
            error.fileName = file.name;
            error.fileSize = (file.size / 1024 / 1024).toFixed(2) + 'MB';
            error.statusCode = resp.status;
            throw error;
        }

        const result = contentType.includes('application/json') ? await resp.json() : { success: true };
        if (!result.success) {
            const error = new Error(result.error || 'Upload failed');
            error.fileName = file.name;
            throw error;
        }
        return result.imageUrl;
    } catch (err) {
        console.error('uploadRoomImageWithCategory error:', err);
        // Preserve file info in error
        if (!err.fileName) {
            err.fileName = file.name;
            err.fileSize = (file.size / 1024 / 1024).toFixed(2) + 'MB';
        }
        // Check for network/CORS errors
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            err.message = 'Network error - CORS blocked or server unavailable';
        }
        throw err;
    }
}

// Update all images order in database (using existing /images PUT endpoint)
async function updateAllImagesOrder(roomId, coverUrls, bedroomUrls, bathroomUrls, exteriorUrls) {
    try {
        console.log('📤 Saving image order for room:', roomId);
        console.log('Cover URLs:', coverUrls);
        console.log('Bedroom URLs:', bedroomUrls);
        console.log('Bathroom URLs:', bathroomUrls);
        console.log('Exterior URLs:', exteriorUrls);
        
        const resp = await fetch(`${API_BASE_URL}/rooms/${roomId}/images`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                images: {
                    cover: coverUrls,
                    bedroom: bedroomUrls,
                    bathroom: bathroomUrls,
                    exterior: exteriorUrls
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
                
                // Track failed uploads with details
                const failedUploads = [];
                
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
                        // Store detailed error info
                        failedUploads.push({
                            fileName: imgErr.fileName || item.file.name,
                            fileSize: imgErr.fileSize || (item.file.size / 1024 / 1024).toFixed(2) + 'MB',
                            category: item.category,
                            error: imgErr.message || 'Unknown error'
                        });
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
                
                // Show detailed error message if any uploads failed
                if (failedCount > 0) {
                    let errorMessage = `❌ ${failedCount} image(s) failed to upload:\n\n`;
                    failedUploads.forEach((fail, idx) => {
                        errorMessage += `${idx + 1}. "${fail.fileName}" (${fail.fileSize}, ${fail.category})\n`;
                        errorMessage += `   Error: ${fail.error}\n\n`;
                    });
                    errorMessage += `\n💡 Tips:\n`;
                    errorMessage += `• Max file size: 4.5MB (Vercel limit)\n`;
                    errorMessage += `• Compress large images before uploading\n`;
                    errorMessage += `• Try JPG format for smaller file size`;
                    alert(errorMessage);
                }
            }
            
            // Save the final image order ONLY if no new uploads happened
            // (If we uploaded, the order is already correct in DB - don't overwrite with stale data)
            const hasExistingImages = existingImages.cover.length > 0 || 
                existingImages.bedroom.length > 0 || 
                existingImages.bathroom.length > 0 || 
                existingImages.exterior.length > 0;
            
            if (pendingFiles.length === 0 && hasExistingImages) {
                submitButton.textContent = 'Saving order...';
                try {
                    // Get final order of existing images (URLs only)
                    const coverUrls = existingImages.cover.map(img => img.originalUrl);
                    const bedroomUrls = existingImages.bedroom.map(img => img.originalUrl);
                    const bathroomUrls = existingImages.bathroom.map(img => img.originalUrl);
                    const exteriorUrls = existingImages.exterior.map(img => img.originalUrl);
                    
                    // Use single endpoint to save all image orders
                    await updateAllImagesOrder(id, coverUrls, bedroomUrls, bathroomUrls, exteriorUrls);
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
    room: { cover: [], bedroom: [], bathroom: [], exterior: [] },
    edit: { cover: [], bedroom: [], bathroom: [], exterior: [] }
};

// Store existing images for edit mode
let existingImages = {
    cover: [],
    bedroom: [],
    bathroom: [],
    exterior: []
};

// Images marked for deletion
let imagesToDelete = [];

// Initialize image galleries on page load
document.addEventListener('DOMContentLoaded', function() {
    // Setup Add Room galleries
    setupImageGallery('room-cover-gallery', 'room-cover-dropzone', 'room', 'cover');
    setupImageGallery('room-bedroom-gallery', 'room-bedroom-dropzone', 'room', 'bedroom');
    setupImageGallery('room-bathroom-gallery', 'room-bathroom-dropzone', 'room', 'bathroom');
    setupImageGallery('room-exterior-gallery', 'room-exterior-dropzone', 'room', 'exterior');
    
    // Setup Edit Room galleries
    setupImageGallery('edit-room-cover-gallery', 'edit-room-cover-dropzone', 'edit', 'cover');
    setupImageGallery('edit-room-bedroom-gallery', 'edit-room-bedroom-dropzone', 'edit', 'bedroom');
    setupImageGallery('edit-room-bathroom-gallery', 'edit-room-bathroom-dropzone', 'edit', 'bathroom');
    setupImageGallery('edit-room-exterior-gallery', 'edit-room-exterior-dropzone', 'edit', 'exterior');
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
    // Map category to gallery IDs
    const galleryIdMap = {
        edit: {
            cover: 'edit-room-cover-gallery',
            bedroom: 'edit-room-bedroom-gallery',
            bathroom: 'edit-room-bathroom-gallery',
            exterior: 'edit-room-exterior-gallery'
        },
        room: {
            cover: 'room-cover-gallery',
            bedroom: 'room-bedroom-gallery',
            bathroom: 'room-bathroom-gallery',
            exterior: 'room-exterior-gallery'
        }
    };
    
    const galleryId = galleryIdMap[formType]?.[category];
    
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
    pendingImages[formType] = { cover: [], bedroom: [], bathroom: [], exterior: [] };
    if (formType === 'edit') {
        existingImages = { cover: [], bedroom: [], bathroom: [], exterior: [] };
        imagesToDelete = [];
    }
    renderImageGallery(formType, 'cover');
    renderImageGallery(formType, 'bedroom');
    renderImageGallery(formType, 'bathroom');
    renderImageGallery(formType, 'exterior');
}

// Clear all images with confirmation
function clearAllImages(formType) {
    const categories = ['cover', 'bedroom', 'bathroom', 'exterior'];
    let hasAnyImages = false;
    
    for (const cat of categories) {
        if (formType === 'edit') {
            if (existingImages[cat].length > 0 || pendingImages.edit[cat].length > 0) {
                hasAnyImages = true;
                break;
            }
        } else {
            if (pendingImages.room[cat].length > 0) {
                hasAnyImages = true;
                break;
            }
        }
    }
    
    if (!hasAnyImages) {
        alert('No images to clear.');
        return;
    }
    
    if (!confirm('Are you sure you want to clear ALL images (cover, bedroom, bathroom, exterior)?')) {
        return;
    }
    
    if (formType === 'edit') {
        // Mark all existing images for deletion
        for (const cat of categories) {
            existingImages[cat].forEach(img => {
                if (img.originalUrl && !imagesToDelete.includes(img.originalUrl)) {
                    imagesToDelete.push(img.originalUrl);
                }
            });
        }
        console.log('Images marked for deletion:', imagesToDelete.length);
    }
    
    // Reset all image arrays
    resetImageGalleries(formType);
    console.log(`✓ All images cleared for ${formType} form`);
}

// Setup existing images for edit form
function setupEditRoomImages(room) {
    resetImageGalleries('edit');
    
    // Load existing images from room data
    if (room.images) {
        // New format: room.images = { cover: [...], bedroom: [...], bathroom: [...], exterior: [...] }
        existingImages.cover = (room.images.cover || []).map((url, idx) => ({
            id: `existing_cover_${idx}`,
            url: buildImageUrl(url),
            preview: buildImageUrl(url),
            isNew: false,
            originalUrl: url
        }));
        existingImages.bedroom = (room.images.bedroom || room.images.room || []).map((url, idx) => ({
            id: `existing_bedroom_${idx}`,
            url: buildImageUrl(url),
            preview: buildImageUrl(url),
            isNew: false,
            originalUrl: url
        }));
        existingImages.bathroom = (room.images.bathroom || []).map((url, idx) => ({
            id: `existing_bathroom_${idx}`,
            url: buildImageUrl(url),
            preview: buildImageUrl(url),
            isNew: false,
            originalUrl: url
        }));
        existingImages.exterior = (room.images.exterior || []).map((url, idx) => ({
            id: `existing_exterior_${idx}`,
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
    renderImageGallery('edit', 'bedroom');
    renderImageGallery('edit', 'bathroom');
    renderImageGallery('edit', 'exterior');
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
    
    const bedroomImages = formType === 'edit'
        ? [...existingImages.bedroom, ...pendingImages[formType].bedroom]
        : pendingImages[formType].bedroom;
    
    const bathroomImages = formType === 'edit'
        ? [...existingImages.bathroom, ...pendingImages[formType].bathroom]
        : pendingImages[formType].bathroom;
    
    const exteriorImages = formType === 'edit'
        ? [...existingImages.exterior, ...pendingImages[formType].exterior]
        : pendingImages[formType].exterior;
    
    return {
        cover: coverImages,
        bedroom: bedroomImages,
        bathroom: bathroomImages,
        exterior: exteriorImages,
        toDelete: formType === 'edit' ? imagesToDelete : []
    };
}

// Get pending files for upload
function getPendingFilesForUpload(formType) {
    const files = [];
    const categories = ['cover', 'bedroom', 'bathroom', 'exterior'];
    
    console.log('Getting pending files for:', formType);
    
    for (const category of categories) {
        console.log(`Pending ${category} images:`, pendingImages[formType][category].length);
        pendingImages[formType][category].forEach((img, idx) => {
            if (img.file) {
                files.push({ file: img.file, category: category, order: idx });
            }
        });
    }
    
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

// ===== User Management System =====

// Store users data
let usersData = [];

// Load all users from API
async function loadUsers() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '<tr><td colspan="5" class="loading-text">Loading users...</td></tr>';
    
    try {
        const response = await fetch(`${AUTH_API_URL}/users`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                usersList.innerHTML = '<tr><td colspan="5" class="error-text">Access denied. Admin privileges required.</td></tr>';
                return;
            }
            throw new Error('Failed to load users');
        }
        
        const data = await response.json();
        
        if (data.success) {
            usersData = data.data || [];
            renderUsersTable();
        } else {
            usersList.innerHTML = '<tr><td colspan="6" class="error-text">Failed to load users</td></tr>';
        }
    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = '<tr><td colspan="6" class="error-text">Error loading users. Please try again.</td></tr>';
    }
}

// Format permissions for display
function formatPermissions(permissions, role) {
    if (role === 'admin') {
        return '<span class="permissions-badge all-access">All Access</span>';
    }
    
    if (!permissions || permissions.length === 0) {
        return '<span class="permissions-badge no-access">Dashboard Only</span>';
    }
    
    const permissionLabels = {
        'dashboard': 'Dashboard',
        'rooms': 'Rooms',
        'add-room': 'Add Room',
        'manage-users': 'Users',
        'finance': 'Finance'
    };
    
    return permissions.map(p => 
        `<span class="permissions-badge">${permissionLabels[p] || p}</span>`
    ).join('');
}

// Render users table
function renderUsersTable() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    if (usersData.length === 0) {
        usersList.innerHTML = '<tr><td colspan="6" class="empty-text">No users found</td></tr>';
        return;
    }
    
    const currentUsername = sessionStorage.getItem('adminUsername');
    
    usersList.innerHTML = usersData.map(user => {
        const isCurrentUser = user.displayName === currentUsername;
        const permissions = user.permissions || ['dashboard'];
        return `
            <tr class="${isCurrentUser ? 'current-user-row' : ''}">
                <td>
                    <strong>${escapeHtml(user.username)}</strong>
                    ${isCurrentUser ? '<span class="badge badge-you">You</span>' : ''}
                </td>
                <td>${escapeHtml(user.displayName || user.username)}</td>
                <td>
                    <span class="badge badge-${user.role}">${user.role === 'admin' ? 'Admin' : 'Manager'}</span>
                </td>
                <td class="permissions-cell">
                    ${formatPermissions(permissions, user.role)}
                </td>
                <td>
                    <span class="password-hidden">••••••••</span>
                    <button class="btn-small btn-outline" onclick="showChangePasswordForm('${user._id}', '${escapeHtml(user.username)}')">
                        Change
                    </button>
                </td>
                <td class="actions-cell">
                    <button class="btn-small btn-outline" onclick="editUser('${user._id}')">Edit</button>
                    ${!isCurrentUser ? `<button class="btn-small btn-danger-outline" onclick="deleteUser('${user._id}', '${escapeHtml(user.username)}')">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show add user form
function showAddUserForm() {
    document.getElementById('user-form-title').textContent = 'Add New User';
    document.getElementById('user-form').reset();
    document.getElementById('edit-user-id').value = '';
    document.getElementById('user-username').removeAttribute('readonly');
    document.getElementById('user-password').required = true;
    document.getElementById('user-form-container').style.display = 'block';
    document.getElementById('change-password-container').style.display = 'none';
    
    // Reset permissions checkboxes
    resetPermissionsCheckboxes();
    togglePermissionsSection();
}

// Hide add/edit user form
function hideUserForm() {
    document.getElementById('user-form-container').style.display = 'none';
    document.getElementById('user-form').reset();
    resetPermissionsCheckboxes();
}

// Toggle permissions section visibility based on role
function togglePermissionsSection() {
    const role = document.getElementById('user-role').value;
    const permissionsSection = document.getElementById('permissions-section');
    
    if (permissionsSection) {
        if (role === 'admin') {
            permissionsSection.style.display = 'none';
        } else {
            permissionsSection.style.display = 'block';
        }
    }
}

// Reset all permissions checkboxes to default state
function resetPermissionsCheckboxes() {
    const checkboxes = document.querySelectorAll('input[name="user-permissions"]');
    checkboxes.forEach(checkbox => {
        if (checkbox.value === 'dashboard') {
            checkbox.checked = true; // Dashboard always checked
        } else {
            checkbox.checked = false;
        }
    });
}

// Get selected permissions from checkboxes
function getSelectedPermissions() {
    const checkboxes = document.querySelectorAll('input[name="user-permissions"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Set permissions checkboxes based on user data
function setPermissionsCheckboxes(permissions) {
    const checkboxes = document.querySelectorAll('input[name="user-permissions"]');
    checkboxes.forEach(checkbox => {
        if (checkbox.value === 'dashboard') {
            checkbox.checked = true; // Dashboard always checked
        } else {
            checkbox.checked = permissions.includes(checkbox.value);
        }
    });
}

// Edit user
function editUser(userId) {
    const user = usersData.find(u => u._id === userId);
    if (!user) return;
    
    document.getElementById('user-form-title').textContent = 'Edit User';
    document.getElementById('edit-user-id').value = userId;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-username').setAttribute('readonly', true);
    document.getElementById('user-display-name').value = user.displayName || '';
    document.getElementById('user-role').value = user.role || 'manager';
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').required = false; // Password optional when editing
    document.getElementById('user-form-container').style.display = 'block';
    document.getElementById('change-password-container').style.display = 'none';
    
    // Set permissions checkboxes
    setPermissionsCheckboxes(user.permissions || ['dashboard']);
    togglePermissionsSection();
}

// Save user (create or update)
async function saveUser(event) {
    event.preventDefault();
    
    const userId = document.getElementById('edit-user-id').value;
    const username = document.getElementById('user-username').value.trim();
    const displayName = document.getElementById('user-display-name').value.trim();
    const role = document.getElementById('user-role').value;
    const password = document.getElementById('user-password').value;
    const permissions = getSelectedPermissions();
    
    // Validation
    if (!username || !displayName || !role) {
        alert('Please fill in all required fields');
        return;
    }
    
    if (!userId && !password) {
        alert('Password is required for new users');
        return;
    }
    
    if (password && password.length < 8) {
        alert('Password must be at least 8 characters');
        return;
    }
    
    const submitBtn = document.querySelector('#user-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    try {
        if (userId) {
            // Update existing user
            const response = await fetch(`${AUTH_API_URL}/users/${userId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    displayName,
                    role,
                    permissions
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                alert('User updated successfully!');
                hideUserForm();
                loadUsers();
            } else {
                alert('Failed to update user: ' + (data.error || 'Unknown error'));
            }
        } else {
            // Create new user
            const response = await fetch(`${AUTH_API_URL}/users`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    username,
                    displayName,
                    role,
                    password,
                    permissions
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                alert('User created successfully!');
                hideUserForm();
                loadUsers();
            } else {
                alert('Failed to create user: ' + (data.error || 'Unknown error'));
            }
        }
    } catch (error) {
        console.error('Error saving user:', error);
        alert('Error saving user. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Delete user
async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${AUTH_API_URL}/users/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            alert('User deleted successfully!');
            loadUsers();
        } else {
            alert('Failed to delete user: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user. Please try again.');
    }
}

// Show change password form
function showChangePasswordForm(userId, username) {
    document.getElementById('change-password-user-id').value = userId;
    document.getElementById('change-password-username').textContent = username;
    document.getElementById('change-password-form').reset();
    document.getElementById('change-password-container').style.display = 'block';
    document.getElementById('user-form-container').style.display = 'none';
}

// Hide change password form
function hideChangePasswordForm() {
    document.getElementById('change-password-container').style.display = 'none';
    document.getElementById('change-password-form').reset();
}

// Change user password (admin function)
async function changeUserPassword(event) {
    event.preventDefault();
    
    const userId = document.getElementById('change-password-user-id').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }
    
    if (newPassword.length < 8) {
        alert('Password must be at least 8 characters');
        return;
    }
    
    const submitBtn = document.querySelector('#change-password-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Changing...';
    
    try {
        const response = await fetch(`${AUTH_API_URL}/users/${userId}/password`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            alert('Password changed successfully!');
            hideChangePasswordForm();
        } else {
            alert('Failed to change password: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error changing password. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

// ===== Finance Management System =====

// Finance API URL
const FINANCE_API_URL = (function() {
    const host = window.location.hostname;
    if (host === '127.0.0.1' || host === 'localhost') {
        return `http://${host}:5000/backend/api/finance`;
    }
    return 'https://khietanportal.vercel.app/backend/api/finance';
})();

// Format currency with commas for thousands separator (no decimals)
function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// Store transactions data
let transactionsData = [];

// Load all transactions from API
async function loadTransactions() {
    const transactionsList = document.getElementById('transactions-list');
    if (!transactionsList) return;
    
    transactionsList.innerHTML = '<tr><td colspan="5" class="loading-text">Loading transactions...</td></tr>';
    
    try {
        const response = await fetch(FINANCE_API_URL, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                transactionsList.innerHTML = '<tr><td colspan="5" class="error-text">Access denied.</td></tr>';
                return;
            }
            throw new Error('Failed to load transactions');
        }
        
        const data = await response.json();
        
        if (data.success) {
            transactionsData = data.data || [];
            renderTransactionsTable();
            updateFinanceSummary();
        } else {
            transactionsList.innerHTML = '<tr><td colspan="6" class="error-text">Failed to load transactions</td></tr>';
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        transactionsList.innerHTML = '<tr><td colspan="6" class="error-text">Error loading transactions. Please try again.</td></tr>';
    }
}

// Render transactions table
function renderTransactionsTable() {
    const transactionsList = document.getElementById('transactions-list');
    if (!transactionsList) return;
    
    // Apply filters
    let filteredData = filterTransactionsData();
    
    if (filteredData.length === 0) {
        transactionsList.innerHTML = '<tr><td colspan="6" class="empty-text">No transactions found</td></tr>';
        return;
    }
    
    // Sort by date descending (newest first)
    filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    transactionsList.innerHTML = filteredData.map(transaction => {
        const date = new Date(transaction.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const isIncome = transaction.type === 'income';
        const amountClass = isIncome ? 'amount-income' : 'amount-expense';
        const amountPrefix = isIncome ? '+' : '-';
        const typeLabel = isIncome ? 'Income' : 'Expense';
        const typeBadgeClass = isIncome ? 'badge-income' : 'badge-expense';
        
        return `
            <tr>
                <td>${date}</td>
                <td><span class="badge ${typeBadgeClass}">${typeLabel}</span></td>
                <td class="${amountClass}">${amountPrefix}$${formatCurrency(transaction.amount)}</td>
                <td>${escapeHtml(transaction.personInCharge || '-')}</td>
                <td class="description-cell">
                    <div class="description-content">
                        ${transaction.category ? `<span class="category-tag">${formatCategory(transaction.category)}</span>` : ''}
                        <span>${escapeHtml(transaction.description)}</span>
                    </div>
                </td>
                <td class="actions-cell">
                    <button class="btn-small btn-outline" onclick="editTransaction('${transaction._id}')">Edit</button>
                    <button class="btn-small btn-danger-outline" onclick="deleteTransaction('${transaction._id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Format category for display
function formatCategory(category) {
    const categoryLabels = {
        'room-booking': 'Room Booking',
        'utilities': 'Utilities',
        'maintenance': 'Maintenance',
        'supplies': 'Supplies',
        'salary': 'Salary',
        'marketing': 'Marketing',
        'other': 'Other'
    };
    return categoryLabels[category] || category;
}

// Filter transactions based on filter inputs
function filterTransactionsData() {
    const typeFilter = document.getElementById('finance-filter-type')?.value || '';
    const dateFromFilter = document.getElementById('finance-filter-date-from')?.value || '';
    const dateToFilter = document.getElementById('finance-filter-date-to')?.value || '';
    
    return transactionsData.filter(t => {
        // Type filter
        if (typeFilter && t.type !== typeFilter) return false;
        
        // Date range filter
        if (dateFromFilter) {
            const transDate = new Date(t.date);
            const fromDate = new Date(dateFromFilter);
            if (transDate < fromDate) return false;
        }
        
        if (dateToFilter) {
            const transDate = new Date(t.date);
            const toDate = new Date(dateToFilter);
            toDate.setHours(23, 59, 59, 999); // End of day
            if (transDate > toDate) return false;
        }
        
        return true;
    });
}

// Filter transactions (called on filter change)
function filterTransactions() {
    renderTransactionsTable();
    updateFilteredSummary();
}

// Reset finance filters
function resetFinanceFilters() {
    document.getElementById('finance-filter-type').value = '';
    document.getElementById('finance-filter-date-from').value = '';
    document.getElementById('finance-filter-date-to').value = '';
    renderTransactionsTable();
    updateFinanceSummary();
}

// Update finance summary cards
function updateFinanceSummary() {
    const totalIncome = transactionsData
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    const totalExpenses = transactionsData
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    const netBalance = totalIncome - totalExpenses;
    
    document.getElementById('total-income').textContent = `$${formatCurrency(totalIncome)}`;
    document.getElementById('total-expenses').textContent = `$${formatCurrency(totalExpenses)}`;
    
    const balanceEl = document.getElementById('net-balance');
    balanceEl.textContent = `$${formatCurrency(netBalance)}`;
    balanceEl.className = 'finance-card-value ' + (netBalance >= 0 ? 'positive' : 'negative');
}

// Update summary based on filtered data
function updateFilteredSummary() {
    const filteredData = filterTransactionsData();
    
    const totalIncome = filteredData
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    const totalExpenses = filteredData
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    const netBalance = totalIncome - totalExpenses;
    
    document.getElementById('total-income').textContent = `$${formatCurrency(totalIncome)}`;
    document.getElementById('total-expenses').textContent = `$${formatCurrency(totalExpenses)}`;
    
    const balanceEl = document.getElementById('net-balance');
    balanceEl.textContent = `$${formatCurrency(netBalance)}`;
    balanceEl.className = 'finance-card-value ' + (netBalance >= 0 ? 'positive' : 'negative');
}

// Format amount input with thousand separators
function formatAmountInput(input) {
    // Remove all non-digit characters
    let value = input.value.replace(/[^\d]/g, '');
    
    // Format with commas
    if (value) {
        value = parseInt(value, 10).toLocaleString('en-US');
    }
    
    input.value = value;
}

// Get raw number from formatted amount input
function getRawAmount(formattedValue) {
    return parseFloat(formattedValue.replace(/,/g, '')) || 0;
}

// Show add transaction form
function showAddTransactionForm() {
    document.getElementById('transaction-form-title').textContent = 'Add New Transaction';
    document.getElementById('transaction-form').reset();
    document.getElementById('edit-transaction-id').value = '';
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transaction-date').value = today;
    
    const formContainer = document.getElementById('transaction-form-container');
    formContainer.style.display = 'block';
    
    // Scroll to the form smoothly
    setTimeout(() => {
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Hide transaction form
function hideTransactionForm() {
    document.getElementById('transaction-form-container').style.display = 'none';
    document.getElementById('transaction-form').reset();
}

// Edit transaction
function editTransaction(transactionId) {
    const transaction = transactionsData.find(t => t._id === transactionId);
    if (!transaction) return;
    
    document.getElementById('transaction-form-title').textContent = 'Edit Transaction';
    document.getElementById('edit-transaction-id').value = transactionId;
    document.getElementById('transaction-type').value = transaction.type;
    document.getElementById('transaction-amount').value = formatCurrency(transaction.amount);
    document.getElementById('transaction-date').value = transaction.date.split('T')[0];
    document.getElementById('transaction-category').value = transaction.category || '';
    document.getElementById('transaction-person').value = transaction.personInCharge || '';
    document.getElementById('transaction-description').value = transaction.description;
    
    const formContainer = document.getElementById('transaction-form-container');
    formContainer.style.display = 'block';
    
    // Scroll to the form smoothly
    setTimeout(() => {
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Save transaction (create or update)
async function saveTransaction(event) {
    event.preventDefault();
    
    const transactionId = document.getElementById('edit-transaction-id').value;
    const type = document.getElementById('transaction-type').value;
    const amount = getRawAmount(document.getElementById('transaction-amount').value);
    const date = document.getElementById('transaction-date').value;
    const category = document.getElementById('transaction-category').value;
    const personInCharge = document.getElementById('transaction-person').value.trim();
    const description = document.getElementById('transaction-description').value.trim();
    
    // Validation
    if (!type || !amount || !date || !personInCharge || !description) {
        alert('Please fill in all required fields');
        return;
    }
    
    if (amount <= 0) {
        alert('Amount must be greater than 0');
        return;
    }
    
    const submitBtn = document.querySelector('#transaction-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    try {
        const transactionData = {
            type,
            amount,
            date,
            category,
            personInCharge,
            description
        };
        
        let response;
        if (transactionId) {
            // Update existing transaction
            response = await fetch(`${FINANCE_API_URL}/${transactionId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(transactionData)
            });
        } else {
            // Create new transaction
            response = await fetch(FINANCE_API_URL, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(transactionData)
            });
        }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            alert(transactionId ? 'Transaction updated successfully!' : 'Transaction added successfully!');
            hideTransactionForm();
            loadTransactions();
        } else {
            alert('Failed to save transaction: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving transaction:', error);
        alert('Error saving transaction. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Delete transaction
async function deleteTransaction(transactionId) {
    if (!confirm('Are you sure you want to delete this transaction?\\n\\nThis action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${FINANCE_API_URL}/${transactionId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            alert('Transaction deleted successfully!');
            loadTransactions();
        } else {
            alert('Failed to delete transaction: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Error deleting transaction. Please try again.');
    }
}

// ===== iCal Sync Functions =====

// Setup iCal section when editing a room
function setupIcalSection(room) {
    const icalInput = document.getElementById('edit-room-ical-url');
    const icalStatus = document.getElementById('ical-status');
    const lastSyncTime = document.getElementById('last-sync-time');
    const syncBtn = document.getElementById('btn-sync-ical');
    
    if (icalInput) {
        icalInput.value = room.icalUrl || '';
        validateIcalUrl(icalInput.value);
    }
    
    if (lastSyncTime) {
        if (room.lastIcalSync) {
            const syncDate = new Date(room.lastIcalSync);
            lastSyncTime.textContent = `Last synced: ${syncDate.toLocaleString()}`;
            lastSyncTime.style.display = 'inline';
        } else {
            lastSyncTime.textContent = '';
            lastSyncTime.style.display = 'none';
        }
    }
    
    // Enable/disable sync button based on URL
    if (syncBtn) {
        syncBtn.disabled = !room.icalUrl;
    }
}

// Validate iCal URL format
function validateIcalUrl(url) {
    const icalStatus = document.getElementById('ical-status');
    const syncBtn = document.getElementById('btn-sync-ical');
    
    if (!url || url.trim() === '') {
        if (icalStatus) {
            icalStatus.textContent = '';
            icalStatus.className = '';
        }
        if (syncBtn) syncBtn.disabled = true;
        return false;
    }
    
    // Check if it's a valid URL
    const urlPattern = /^https?:\/\/.+\.ics/i;
    const isValidFormat = urlPattern.test(url) || url.includes('airbnb.com/calendar/ical');
    
    if (icalStatus) {
        if (isValidFormat) {
            icalStatus.textContent = '✓ Valid iCal URL format';
            icalStatus.className = 'ical-valid';
        } else {
            icalStatus.textContent = '⚠ URL should be an .ics calendar link';
            icalStatus.className = 'ical-warning';
        }
    }
    
    return isValidFormat;
}

// Save iCal URL for the current room
async function saveIcalUrl() {
    const roomId = currentEditRoomId;
    if (!roomId) {
        alert('No room selected');
        return;
    }
    
    const icalInput = document.getElementById('edit-room-ical-url');
    const icalUrl = icalInput.value.trim();
    const saveBtn = document.querySelector('.btn-save-ical');
    const originalText = saveBtn.textContent;
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/ical-url`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ icalUrl })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logger.info(`iCal URL ${icalUrl ? 'saved' : 'cleared'} for room ${roomId}`);
            
            // Update local room data
            const room = roomManager.getRoomById(roomId);
            if (room) {
                room.icalUrl = icalUrl;
            }
            
            // Enable sync button if URL is set
            const syncBtn = document.getElementById('btn-sync-ical');
            if (syncBtn) {
                syncBtn.disabled = !icalUrl;
            }
            
            // Show success message
            const icalStatus = document.getElementById('ical-status');
            if (icalStatus) {
                icalStatus.textContent = '✓ URL saved successfully';
                icalStatus.className = 'ical-success';
                setTimeout(() => validateIcalUrl(icalUrl), 2000);
            }
        } else {
            alert('Failed to save iCal URL: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving iCal URL:', error);
        alert('Error saving iCal URL. Please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

// Sync iCal for the current room
async function syncRoomIcal() {
    const roomId = currentEditRoomId;
    if (!roomId) {
        alert('No room selected');
        return;
    }
    
    const room = roomManager.getRoomById(roomId);
    if (!room || !room.icalUrl) {
        alert('Please save an iCal URL first');
        return;
    }
    
    const syncBtn = document.getElementById('btn-sync-ical');
    const originalHtml = syncBtn.innerHTML;
    
    syncBtn.disabled = true;
    syncBtn.innerHTML = `
        <svg class="spin" viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        Syncing...
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/sync-ical`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logger.info(`iCal sync completed: ${data.syncedCount} new, ${data.skippedCount} skipped`);
            
            // Update last sync time display
            const lastSyncTime = document.getElementById('last-sync-time');
            if (lastSyncTime && data.lastSync) {
                const syncDate = new Date(data.lastSync);
                lastSyncTime.textContent = `Last synced: ${syncDate.toLocaleString()}`;
                lastSyncTime.style.display = 'inline';
            }
            
            // Show result message
            const icalStatus = document.getElementById('ical-status');
            if (icalStatus) {
                if (data.syncedCount > 0) {
                    icalStatus.textContent = `✓ ${data.syncedCount} new booking(s) synced!`;
                    icalStatus.className = 'ical-success';
                } else {
                    icalStatus.textContent = '✓ Already up to date';
                    icalStatus.className = 'ical-valid';
                }
            }
            
            // Reload rooms to show new bookings
            await roomManager.loadRooms();
            applyDashboardFilters();
            
        } else {
            const icalStatus = document.getElementById('ical-status');
            if (icalStatus) {
                icalStatus.textContent = '✗ ' + (data.error || 'Sync failed');
                icalStatus.className = 'ical-error';
            }
            alert('Sync failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error syncing iCal:', error);
        const icalStatus = document.getElementById('ical-status');
        if (icalStatus) {
            icalStatus.textContent = '✗ Network error';
            icalStatus.className = 'ical-error';
        }
        alert('Error syncing iCal. Please check your connection and try again.');
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalHtml;
    }
}

// Sync all rooms with iCal URLs (called from dashboard or bulk action)
async function syncAllIcal() {
    if (!confirm('This will sync iCal data for all rooms with configured URLs. Continue?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/sync-all-ical`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logger.info(`Bulk iCal sync completed: ${data.message}`);
            
            let message = `Sync completed!\n\n`;
            for (const result of data.results) {
                if (result.success) {
                    message += `✓ ${result.roomName}: ${result.syncedCount} new bookings\n`;
                } else {
                    message += `✗ ${result.roomName}: ${result.error}\n`;
                }
            }
            
            alert(message);
            
            // Reload rooms to show new bookings
            await roomManager.loadRooms();
            applyDashboardFilters();
            
        } else {
            alert('Bulk sync failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error in bulk iCal sync:', error);
        alert('Error syncing all rooms. Please try again.');
    }
}

// Save iCal URL from room card in calendar view
async function saveRoomIcalUrl(roomId, icalUrl, saveBtn, syncBtn) {
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/ical-url`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ icalUrl })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logger.info(`iCal URL ${icalUrl ? 'saved' : 'cleared'} for room ${roomId}`);
            
            // Update local room data
            const room = roomManager.getRoomById(roomId);
            if (room) {
                room.icalUrl = icalUrl;
            }
            
            // Enable/disable sync button
            if (syncBtn) {
                syncBtn.disabled = !icalUrl;
            }
            
            // Brief success feedback
            saveBtn.textContent = '✓';
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 1500);
            
        } else {
            alert('Failed to save iCal URL: ' + (data.error || 'Unknown error'));
            saveBtn.textContent = originalText;
        }
    } catch (error) {
        console.error('Error saving iCal URL:', error);
        alert('Error saving iCal URL. Please try again.');
        saveBtn.textContent = originalText;
    } finally {
        saveBtn.disabled = false;
    }
}

// Save room promotion (discount price)
async function saveRoomPromotion(roomId, isActive, discountPrice, saveBtn) {
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/promotion`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                active: isActive, 
                discountPrice: isActive ? discountPrice : null 
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logger.info(`Promotion ${isActive ? 'activated' : 'deactivated'} for room ${roomId}`);
            
            // Update local room data
            const room = roomManager.getRoomById(roomId);
            if (room) {
                room.promotion = isActive ? { active: true, discountPrice: discountPrice } : null;
            }
            
            // Refresh the calendar display to show updated prices
            applyDashboardFilters();
            
            // Brief success feedback
            saveBtn.textContent = '✓';
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 1500);
            
        } else {
            alert('Failed to save promotion: ' + (data.error || 'Unknown error'));
            saveBtn.textContent = originalText;
        }
    } catch (error) {
        console.error('Error saving promotion:', error);
        alert('Error saving promotion. Please try again.');
        saveBtn.textContent = originalText;
    } finally {
        saveBtn.disabled = false;
    }
}

// Sync iCal from room card in calendar view
async function syncRoomIcalFromCard(roomId, syncBtn) {
    const room = roomManager.getRoomById(roomId);
    if (!room || !room.icalUrl) {
        alert('Please save an iCal URL first');
        return;
    }
    
    const originalText = syncBtn.textContent;
    syncBtn.disabled = true;
    syncBtn.textContent = '⏳';
    syncBtn.classList.add('syncing');
    
    try {
        const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/sync-ical`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logger.info(`iCal sync completed: ${data.syncedCount} new, ${data.skippedCount} skipped`);
            
            // Show brief success
            syncBtn.textContent = '✓';
            
            if (data.syncedCount > 0) {
                // Reload rooms and refresh calendar to show new bookings
                await roomManager.loadRooms();
                applyDashboardFilters();
            } else {
                setTimeout(() => {
                    syncBtn.textContent = originalText;
                    syncBtn.classList.remove('syncing');
                }, 1500);
            }
            
        } else {
            alert('Sync failed: ' + (data.error || 'Unknown error'));
            syncBtn.textContent = '✗';
            setTimeout(() => {
                syncBtn.textContent = originalText;
            }, 1500);
        }
    } catch (error) {
        console.error('Error syncing iCal:', error);
        alert('Error syncing iCal. Please check your connection and try again.');
        syncBtn.textContent = '✗';
        setTimeout(() => {
            syncBtn.textContent = originalText;
        }, 1500);
    } finally {
        syncBtn.disabled = false;
        syncBtn.classList.remove('syncing');
    }
}

// Flag to prevent multiple auto-syncs running simultaneously
let isAutoSyncing = false;

// Auto-sync all rooms with iCal URLs on page load (runs silently in background)
async function autoSyncAllIcal() {
    // Prevent multiple simultaneous auto-syncs
    if (isAutoSyncing) {
        console.log('⏸️ Auto-sync already in progress, skipping');
        return;
    }
    
    // Get all rooms with iCal URLs
    const rooms = roomManager.getAllRooms();
    const roomsWithIcal = rooms.filter(r => r.icalUrl && r.icalUrl.trim() !== '');
    
    if (roomsWithIcal.length === 0) {
        console.log('📅 No rooms with iCal URLs configured');
        return;
    }
    
    isAutoSyncing = true;
    console.log(`📅 Auto-syncing iCal for ${roomsWithIcal.length} room(s)...`);
    
    let totalSynced = 0;
    let hasNewBookings = false;
    
    try {
        // Sync all rooms with iCal URLs via the bulk endpoint
        const response = await fetch(`${API_BASE_URL}/sync-all-ical`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Count total new bookings
            for (const result of data.results) {
                if (result.success && result.syncedCount > 0) {
                    totalSynced += result.syncedCount;
                    hasNewBookings = true;
                    console.log(`  ✓ ${result.roomName}: ${result.syncedCount} new booking(s)`);
                }
            }
            
            if (hasNewBookings) {
                console.log(`📅 Auto-sync complete: ${totalSynced} new booking(s) imported`);
                
                // Reload rooms silently to show new bookings
                await roomManager.loadRoomsSilent();
            } else {
                console.log('📅 Auto-sync complete: No new bookings');
            }
        } else {
            console.warn('📅 Auto-sync failed:', data.error || 'Unknown error');
        }
    } catch (error) {
        console.warn('📅 Auto-sync error:', error.message);
        // Don't show alert for auto-sync errors - it's background operation
    } finally {
        isAutoSyncing = false;
    }
}