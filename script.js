class BassPracticeTracker {
    constructor() {
        this.lessons = [];
        this.currentTime = 0;
        this.timerInterval = null;
        this.isRunning = false;
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        
        // Authentication state
        this.isAuthenticated = false;
        this.user = null;
        this.googleIdToken = null;
        this.lastSync = 0;
        this.cloudVersion = 0;
        this.syncInProgress = false;
        
        this.init();
    }

    async init() {
        await this.loadLessons();
        this.loadProgress();
        this.setupTimerControls();
        this.setupAuthControls();
        this.renderModules();
        this.renderCalendar();
        this.updateTodayStats();
        this.calculateTargetDate();
        this.initializeGoogleAuth();
    }

    async loadLessons() {
        try {
            const response = await fetch('lessons.json');
            const data = await response.json();
            this.lessons = data.modules;
        } catch (error) {
            console.error('Error loading lessons:', error);
        }
    }

    loadProgress() {
        const saved = localStorage.getItem('bassProgress');
        if (saved) {
            this.progress = JSON.parse(saved);
        } else {
            this.progress = {
                lessons: {},
                practiceLog: {},
                totalPracticeTime: 0
            };
        }
    }

    saveProgress() {
        localStorage.setItem('bassProgress', JSON.stringify(this.progress));
        
        // Auto-sync to cloud if authenticated
        if (this.isAuthenticated && !this.syncInProgress) {
            this.syncToCloud();
        }
    }

    setupTimerControls() {
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const resetBtn = document.getElementById('resetBtn');
        const timerDisplay = document.getElementById('timerDisplay');

        startBtn.addEventListener('click', () => this.startTimer());
        pauseBtn.addEventListener('click', () => this.pauseTimer());
        resetBtn.addEventListener('click', () => this.resetTimer());

        // Update display
        this.updateTimerDisplay();
    }

    startTimer() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.timerInterval = setInterval(() => {
                this.currentTime++;
                this.updateTimerDisplay();
            }, 1000);
        }
    }

    pauseTimer() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.timerInterval);
            this.savePracticeSession();
        }
    }

    resetTimer() {
        this.isRunning = false;
        clearInterval(this.timerInterval);
        this.currentTime = 0;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const hours = Math.floor(this.currentTime / 3600);
        const minutes = Math.floor((this.currentTime % 3600) / 60);
        const seconds = this.currentTime % 60;
        
        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timerDisplay').textContent = display;
    }

    savePracticeSession() {
        if (this.currentTime > 0) {
            const today = new Date().toISOString().split('T')[0];
            if (!this.progress.practiceLog[today]) {
                this.progress.practiceLog[today] = 0;
            }
            this.progress.practiceLog[today] += this.currentTime;
            this.progress.totalPracticeTime += this.currentTime;
            this.saveProgress();
            this.updateTodayStats();
            this.renderCalendar();
        }
    }

    updateTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        const todayMinutes = Math.floor((this.progress.practiceLog[today] || 0) / 60);
        document.getElementById('todayTotal').textContent = `${todayMinutes} min`;
    }

    renderModules() {
        const container = document.getElementById('modulesContainer');
        
        // Save which modules are currently open
        const openModules = new Set();
        container.querySelectorAll('.module-content.active').forEach(content => {
            const moduleId = content.closest('.module').dataset.moduleId;
            if (moduleId) openModules.add(moduleId);
        });
        
        container.innerHTML = '';

        this.lessons.forEach(module => {
            const moduleDiv = document.createElement('div');
            moduleDiv.className = 'module';
            moduleDiv.dataset.moduleId = module.id;
            
            const completedLessons = module.lessons.filter(lesson => 
                this.progress.lessons[`${module.id}-${lesson}`]
            ).length;
            
            const progressPercent = (completedLessons / module.lessons.length) * 100;
            const isOpen = openModules.has(module.id.toString());

            moduleDiv.innerHTML = `
                <div class="module-header" onclick="this.parentElement.querySelector('.module-content').classList.toggle('active')">
                    <div>
                        <div class="module-title">${module.title}</div>
                        <div class="module-duration">${module.duration}</div>
                    </div>
                    <div class="module-progress">${completedLessons}/${module.lessons.length}</div>
                </div>
                <div class="module-content ${isOpen ? 'active' : ''}">
                    ${module.lessons.map(lesson => `
                        <div class="lesson-item ${this.progress.lessons[`${module.id}-${lesson}`] ? 'completed' : ''}">
                            <input type="checkbox" class="lesson-checkbox" 
                                   data-module="${module.id}" 
                                   data-lesson="${lesson}"
                                   ${this.progress.lessons[`${module.id}-${lesson}`] ? 'checked' : ''}>
                            <span class="lesson-name">${lesson}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            
            container.appendChild(moduleDiv);
        });

        // Add event listeners for checkboxes
        container.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                e.stopPropagation(); // Prevent module from closing
                const moduleId = e.target.dataset.module;
                const lessonName = e.target.dataset.lesson;
                const key = `${moduleId}-${lessonName}`;
                
                this.progress.lessons[key] = e.target.checked;
                this.saveProgress();
                this.updateOverallProgress();
                this.renderModules();
                this.calculateTargetDate();
            }
        });

        // Prevent module closing when clicking on lesson items
        container.addEventListener('click', (e) => {
            if (e.target.closest('.lesson-item')) {
                e.stopPropagation();
            }
        });

        this.updateOverallProgress();
    }

    updateOverallProgress() {
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        const percentage = (completedLessons / totalLessons) * 100;

        document.getElementById('overallProgress').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = `${completedLessons} / ${totalLessons} lessons completed`;
    }

    renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        
        document.getElementById('currentMonth').textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;
        
        // Setup month navigation
        document.getElementById('prevMonth').onclick = () => {
            this.currentMonth--;
            if (this.currentMonth < 0) {
                this.currentMonth = 11;
                this.currentYear--;
            }
            this.renderCalendar();
        };
        
        document.getElementById('nextMonth').onclick = () => {
            this.currentMonth++;
            if (this.currentMonth > 11) {
                this.currentMonth = 0;
                this.currentYear++;
            }
            this.renderCalendar();
        };

        // Clear grid
        grid.innerHTML = '';

        // Day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'calendar-day calendar-day-header';
            dayHeader.textContent = day;
            grid.appendChild(dayHeader);
        });

        // Get calendar data
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        // Generate calendar days
        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            
            const dateStr = date.toISOString().split('T')[0];
            const isCurrentMonth = date.getMonth() === this.currentMonth;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const practiceTime = this.progress.practiceLog[dateStr] || 0;
            const practiceMinutes = Math.floor(practiceTime / 60);
            
            // Create date number and minutes display
            dayDiv.innerHTML = `
                <span class="date-number">${date.getDate()}</span>
                ${practiceMinutes > 0 ? `<span class="practice-minutes">${practiceMinutes}m</span>` : ''}
            `;
            
            // Add click handler for editing practice time (except for day headers)
            if (isCurrentMonth) {
                dayDiv.addEventListener('click', () => {
                    this.editPracticeTime(dateStr, practiceMinutes);
                });
            }
            
            if (!isCurrentMonth) {
                dayDiv.classList.add('other-month');
            }
            
            if (isToday) {
                dayDiv.classList.add('today');
            }
            
            // Apply gradient color based on practice time
            const practiceColor = this.getPracticeColor(practiceMinutes);
            if (practiceColor) {
                dayDiv.style.backgroundColor = practiceColor;
                dayDiv.style.color = 'white'; // Ensure text is readable
            }
            
            // Check if this is the target completion date
            if (this.targetDate && dateStr === this.targetDate) {
                dayDiv.classList.add('target-date');
            }
            
            grid.appendChild(dayDiv);
        }
    }

    calculateTargetDate() {
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        const remainingLessons = totalLessons - completedLessons;
        
        if (remainingLessons <= 0) {
            this.targetDate = null;
            return;
        }

        // Calculate average practice frequency (days per week)
        const practiceEntries = Object.entries(this.progress.practiceLog);
        if (practiceEntries.length < 7) {
            // Not enough data, assume 3 days per week
            const daysPerWeek = 3;
            const weeksNeeded = Math.ceil(remainingLessons / daysPerWeek);
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + (weeksNeeded * 7));
            this.targetDate = targetDate.toISOString().split('T')[0];
        } else {
            // Calculate based on actual practice frequency
            const recentEntries = practiceEntries.slice(-30); // Last 30 days
            const practiceDays = recentEntries.filter(([date, time]) => time > 0).length;
            const daysPerWeek = (practiceDays / 30) * 7;
            
            if (daysPerWeek > 0) {
                const weeksNeeded = Math.ceil(remainingLessons / daysPerWeek);
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + (weeksNeeded * 7));
                this.targetDate = targetDate.toISOString().split('T')[0];
            }
        }
    }

    editPracticeTime(dateStr, currentMinutes) {
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dateDisplay = dateObj.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
        });
        
        this.showEditModal(dateStr, dateDisplay, currentMinutes);
    }

    showEditModal(dateStr, dateDisplay, currentMinutes) {
        const modal = document.getElementById('editModal');
        const modalDate = document.getElementById('modalDate');
        const practiceInput = document.getElementById('practiceInput');
        const modalError = document.getElementById('modalError');
        const modalSave = document.getElementById('modalSave');
        const modalCancel = document.getElementById('modalCancel');
        const modalClose = document.getElementById('modalClose');

        // Set modal content
        modalDate.textContent = dateDisplay;
        practiceInput.value = currentMinutes;
        modalError.classList.remove('show');
        modalError.textContent = '';

        // Show modal
        modal.classList.add('active');
        setTimeout(() => practiceInput.focus(), 100);

        // Handle save
        const handleSave = () => {
            const newMinutes = parseInt(practiceInput.value);
            
            if (isNaN(newMinutes) || newMinutes < 0) {
                this.showModalError('Please enter a valid number of minutes (0 or greater)');
                return;
            }
            
            if (newMinutes > 600) {
                this.showModalError('Practice time cannot exceed 10 hours (600 minutes)');
                return;
            }
            
            this.updatePracticeTime(dateStr, newMinutes);
            this.hideEditModal();
        };

        // Handle cancel/close
        const handleCancel = () => {
            this.hideEditModal();
        };

        // Event listeners
        modalSave.onclick = handleSave;
        modalCancel.onclick = handleCancel;
        modalClose.onclick = handleCancel;

        // Keyboard shortcuts
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        // Click outside to close
        const handleOutsideClick = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };

        // Add event listeners
        document.addEventListener('keydown', handleKeydown);
        modal.addEventListener('click', handleOutsideClick);

        // Store cleanup function
        this.modalCleanup = () => {
            document.removeEventListener('keydown', handleKeydown);
            modal.removeEventListener('click', handleOutsideClick);
            modalSave.onclick = null;
            modalCancel.onclick = null;
            modalClose.onclick = null;
        };
    }

    hideEditModal() {
        const modal = document.getElementById('editModal');
        modal.classList.remove('active');
        
        // Cleanup event listeners
        if (this.modalCleanup) {
            this.modalCleanup();
            this.modalCleanup = null;
        }
    }

    showModalError(message) {
        const modalError = document.getElementById('modalError');
        modalError.textContent = message;
        modalError.classList.add('show');
    }

    updatePracticeTime(dateStr, newMinutes) {
        // Convert minutes to seconds and update practice log
        const newSeconds = newMinutes * 60;
        const oldSeconds = this.progress.practiceLog[dateStr] || 0;
        
        if (newSeconds === 0) {
            // Remove the entry if setting to 0
            delete this.progress.practiceLog[dateStr];
        } else {
            this.progress.practiceLog[dateStr] = newSeconds;
        }
        
        // Update total practice time
        this.progress.totalPracticeTime += (newSeconds - oldSeconds);
        
        // Save and refresh displays
        this.saveProgress();
        this.renderCalendar();
        this.updateTodayStats();
        this.calculateTargetDate();
    }

    getPracticeColor(minutes) {
        if (minutes === 0) return null; // Default background
        
        // Smooth scaling: 1-60 minutes = full color range
        const intensity = Math.min(minutes / 60, 1);
        const saturation = 40 + (intensity * 30); // 40% to 70%
        const lightness = 70 - (intensity * 35);  // 70% to 35%
        
        return `hsl(120, ${saturation}%, ${lightness}%)`;
    }

    // Authentication Methods
    setupAuthControls() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const manualSyncBtn = document.getElementById('manualSyncBtn');

        loginBtn.addEventListener('click', () => this.handleGoogleLogin());
        logoutBtn.addEventListener('click', () => this.handleGoogleLogout());
        manualSyncBtn.addEventListener('click', () => this.manualSync());
    }

    initializeGoogleAuth() {
        // Initialize Google OAuth when the API is loaded
        const initGoogle = () => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                try {
                    google.accounts.id.initialize({
                        client_id: 'YOUR_GOOGLE_CLIENT_ID', // Replace with actual client ID
                        callback: this.handleGoogleCallback.bind(this)
                    });
                    console.log('Google OAuth initialized successfully');
                } catch (error) {
                    console.error('Error initializing Google OAuth:', error);
                }
            } else {
                // Google SDK not ready, try again in 100ms
                setTimeout(initGoogle, 100);
            }
        };

        // Try to initialize immediately if Google is already loaded
        if (document.readyState === 'complete') {
            initGoogle();
        } else {
            // Wait for the page to load
            window.addEventListener('load', initGoogle);
        }
    }

    handleGoogleLogin() {
        if (window.google && window.google.accounts && window.google.accounts.id) {
            try {
                google.accounts.id.prompt();
            } catch (error) {
                console.error('Error prompting Google login:', error);
                // Fallback: try to reinitialize and prompt again
                setTimeout(() => {
                    this.initializeGoogleAuth();
                }, 1000);
            }
        } else {
            console.warn('Google SDK not ready for login');
        }
    }

    handleGoogleCallback(response) {
        console.log('=== GOOGLE CALLBACK DEBUG ===');
        console.log('Full response:', response);
        console.log('Response type:', typeof response);
        console.log('Response keys:', Object.keys(response || {}));
        
        try {
            if (!response) {
                console.error('No response from Google');
                this.updateSyncStatus('Error', 'error');
                return;
            }
            
            if (!response.credential) {
                console.error('No credential in response:', response);
                this.updateSyncStatus('Error', 'error');
                return;
            }
            
            console.log('Credential found:', response.credential.substring(0, 50) + '...');
            console.log('Credential length:', response.credential.length);
            
            // Decode the JWT token
            const payload = JSON.parse(atob(response.credential.split('.')[1]));
            console.log('Decoded payload:', payload);
            
            this.user = {
                sub: payload.sub,
                name: payload.name,
                email: payload.email,
                picture: payload.picture
            };
            
            this.googleIdToken = response.credential;
            this.isAuthenticated = true;
            
            console.log('Set googleIdToken:', this.googleIdToken ? 'YES' : 'NO');
            console.log('User authenticated:', this.isAuthenticated);
            
            this.updateAuthUI();
            this.initializeAWS();
            this.syncFromCloud();
            
        } catch (error) {
            console.error('Google login error:', error);
            this.updateSyncStatus('Error', 'error');
        }
    }

    handleGoogleLogout() {
        this.isAuthenticated = false;
        this.user = null;
        this.googleIdToken = null;
        
        // Clear AWS credentials
        if (window.AWS) {
            AWS.config.credentials = null;
        }
        
        // Clear Google OAuth state
        if (window.google && window.google.accounts && window.google.accounts.id) {
            try {
                // Disable auto-select to prevent automatic re-authentication
                google.accounts.id.disableAutoSelect();
                
                // Cancel any pending prompts
                google.accounts.id.cancel();
                
                // Reinitialize Google OAuth to reset state
                setTimeout(() => {
                    this.initializeGoogleAuth();
                }, 100);
            } catch (error) {
                console.error('Error during Google logout:', error);
            }
        }
        
        this.updateAuthUI();
        this.updateSyncStatus('Offline', '');
    }

    updateAuthUI() {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const syncStatus = document.getElementById('syncStatus');

        if (this.isAuthenticated) {
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            syncStatus.style.display = 'flex';
            
            userAvatar.src = this.user.picture;
            userName.textContent = this.user.name;
            
            this.updateSyncStatus('Synced', '');
        } else {
            loginBtn.style.display = 'block';
            userInfo.style.display = 'none';
            syncStatus.style.display = 'none';
        }
    }

    updateSyncStatus(text, className) {
        const syncStatusText = document.getElementById('syncStatusText');
        const syncStatus = document.getElementById('syncStatus');
        
        syncStatusText.textContent = text;
        syncStatus.className = `sync-status ${className}`;
    }

    // AWS and Sync Methods
    initializeAWS() {
        if (!window.AWS || !this.googleIdToken) return;

        // Configure AWS Cognito Identity Pool
        AWS.config.region = 'us-east-1'; // Replace with your region
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: 'YOUR_IDENTITY_POOL_ID', // Replace with actual pool ID
            Logins: {
                'accounts.google.com': this.googleIdToken
            }
        });

        // Refresh credentials
        AWS.config.credentials.refresh((error) => {
            if (error) {
                console.error('AWS credential refresh error:', error);
                this.updateSyncStatus('Auth Error', 'error');
            } else {
                this.updateSyncStatus('Connected', '');
            }
        });
    }

    async syncToCloud() {
        if (!this.isAuthenticated || this.syncInProgress) return;

        this.syncInProgress = true;
        this.updateSyncStatus('Syncing...', 'syncing');

        try {
            const dynamoDb = new AWS.DynamoDB.DocumentClient();
            const item = {
                userId: this.user.sub,
                data: JSON.stringify(this.progress),
                lastUpdated: Date.now(),
                version: this.cloudVersion + 1
            };

            await dynamoDb.put({
                TableName: 'bass-practice-data',
                Item: item
            }).promise();

            this.cloudVersion = item.version;
            this.lastSync = Date.now();
            this.updateSyncStatus('Synced', '');
            
        } catch (error) {
            console.error('Sync to cloud error:', error);
            this.updateSyncStatus('Sync Error', 'error');
        } finally {
            this.syncInProgress = false;
        }
    }

    async syncFromCloud() {
        if (!this.isAuthenticated || this.syncInProgress) return;

        this.syncInProgress = true;
        this.updateSyncStatus('Syncing...', 'syncing');

        try {
            const dynamoDb = new AWS.DynamoDB.DocumentClient();
            const result = await dynamoDb.get({
                TableName: 'bass-practice-data',
                Key: { userId: this.user.sub }
            }).promise();

            if (result.Item && result.Item.lastUpdated > this.lastSync) {
                const cloudProgress = JSON.parse(result.Item.data);
                this.mergeProgress(cloudProgress);
                this.cloudVersion = result.Item.version;
                this.lastSync = result.Item.lastUpdated;
                
                // Update UI after sync
                this.renderModules();
                this.renderCalendar();
                this.updateTodayStats();
                this.calculateTargetDate();
            }

            this.updateSyncStatus('Synced', '');
            
        } catch (error) {
            console.error('Sync from cloud error:', error);
            this.updateSyncStatus('Sync Error', 'error');
        } finally {
            this.syncInProgress = false;
        }
    }

    mergeProgress(cloudProgress) {
        // Simple merge strategy: cloud wins for conflicts
        // In a real app, you'd want more sophisticated conflict resolution
        
        // Merge lesson progress
        this.progress.lessons = { ...this.progress.lessons, ...cloudProgress.lessons };
        
        // Merge practice logs (keep highest time for each date)
        for (const [date, time] of Object.entries(cloudProgress.practiceLog || {})) {
            if (!this.progress.practiceLog[date] || this.progress.practiceLog[date] < time) {
                this.progress.practiceLog[date] = time;
            }
        }
        
        // Update total practice time
        this.progress.totalPracticeTime = Math.max(
            this.progress.totalPracticeTime, 
            cloudProgress.totalPracticeTime || 0
        );
        
        this.saveProgress();
    }

    async manualSync() {
        if (!this.isAuthenticated) return;
        
        await this.syncFromCloud();
        await this.syncToCloud();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new BassPracticeTracker();
});