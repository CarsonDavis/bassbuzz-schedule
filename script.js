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
        this.setupInfoModal();
        this.renderModules();
        this.renderCalendar();
        this.updateTodayStats();
        this.calculateTargetDate();
        this.updateStatsDisplay();
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
            // Migration: add courseStartDate if missing
            if (!this.progress.hasOwnProperty('courseStartDate')) {
                this.progress.courseStartDate = null;
            }
        } else {
            this.progress = {
                lessons: {},
                practiceLog: {},
                totalPracticeTime: 0,
                courseStartDate: null
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
            const today = this.getLocalDateString();
            if (!this.progress.practiceLog[today]) {
                this.progress.practiceLog[today] = 0;
            }
            this.progress.practiceLog[today] += this.currentTime;
            this.progress.totalPracticeTime += this.currentTime;
            
            // Set course start date if not already set
            if (!this.progress.courseStartDate) {
                this.setCourseStartDate();
            }
            
            this.saveProgress();
            this.updateTodayStats();
            this.renderCalendar();
            this.updateStatsDisplay();
        }
    }

    updateTodayStats() {
        const today = this.getLocalDateString();
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
                
                // Set course start date when first lesson is completed (if no practice dates exist)
                if (e.target.checked && !this.progress.courseStartDate) {
                    this.setCourseStartDate();
                }
                
                this.saveProgress();
                this.updateOverallProgress();
                this.renderModules();
                this.calculateTargetDate();
                this.updateStatsDisplay();
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
            
            const dateStr = this.getLocalDateString(date);
            const isCurrentMonth = date.getMonth() === this.currentMonth;
            const isToday = dateStr === this.getLocalDateString();
            const practiceTime = this.progress.practiceLog[dateStr] || 0;
            const practiceMinutes = Math.floor(practiceTime / 60);
            
            // Create date number and minutes display
            dayDiv.innerHTML = `
                <span class="date-number">${date.getDate()}</span>
                ${practiceMinutes > 0 ? `<span class="practice-minutes">${practiceMinutes}m</span>` : ''}
            `;
            
            // Add click handler for editing practice time (except for day headers and future dates)
            if (isCurrentMonth && dateStr <= this.getLocalDateString()) {
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
        // Calculate all three target dates
        this.targetDates = {
            onePerDay: this.calculateOnePerDayTarget(),
            lessonRate: this.calculateLessonRateTarget(),
            timeRate: this.calculateTimeRateTarget()
        };
        
        // Keep the original targetDate for calendar display (use lesson rate as primary)
        this.targetDate = this.targetDates.lessonRate;
    }

    calculateOnePerDayTarget() {
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        const remainingLessons = totalLessons - completedLessons;
        
        if (remainingLessons <= 0) {
            return null;
        }

        // Simple calculation: 1 lesson per day
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + remainingLessons);
        return this.getLocalDateString(targetDate);
    }

    calculateLessonRateTarget() {
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        const remainingLessons = totalLessons - completedLessons;
        
        if (remainingLessons <= 0) {
            return null;
        }

        // If no lessons completed, can't calculate
        if (completedLessons === 0) {
            return null;
        }
        
        // If no start date, try to set it based on practice log
        if (!this.progress.courseStartDate) {
            this.setCourseStartDate();
            
            // If still no start date, can't calculate
            if (!this.progress.courseStartDate) {
                return null;
            }
            
            this.saveProgress();
        }

        // Calculate lessons per day based on actual progress
        const startDate = new Date(this.progress.courseStartDate);
        const today = new Date();
        const daysSinceStart = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
        
        // Avoid division by zero
        if (daysSinceStart <= 0) {
            return null;
        }

        const lessonsPerDay = completedLessons / daysSinceStart;
        
        // Ensure minimum reasonable learning rate (at least 1 lesson per month)
        const minLessonsPerDay = 1 / 30; // 1 lesson per 30 days
        const effectiveLessonsPerDay = Math.max(lessonsPerDay, minLessonsPerDay);

        // Calculate projected completion date
        const daysToComplete = Math.ceil(remainingLessons / effectiveLessonsPerDay);
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysToComplete);
        return this.getLocalDateString(targetDate);
    }

    calculateTimeRateTarget() {
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        const remainingLessons = totalLessons - completedLessons;
        
        if (remainingLessons <= 0) {
            return null;
        }

        // Get total course duration in minutes
        const totalCourseDuration = this.getTotalCourseDurationMinutes();
        if (totalCourseDuration === 0) {
            return null;
        }

        // Calculate completed course duration
        const completedDuration = (completedLessons / totalLessons) * totalCourseDuration;
        const remainingDuration = totalCourseDuration - completedDuration;

        // Calculate average daily practice time
        const practiceEntries = Object.entries(this.progress.practiceLog);
        if (practiceEntries.length === 0) {
            return null;
        }

        const totalPracticeSeconds = Object.values(this.progress.practiceLog).reduce((sum, seconds) => sum + seconds, 0);
        const practiceMinutes = totalPracticeSeconds / 60;
        
        // Calculate days with practice
        const daysWithPractice = practiceEntries.filter(([date, time]) => time > 0).length;
        if (daysWithPractice === 0) {
            return null;
        }

        const avgDailyPracticeMinutes = practiceMinutes / daysWithPractice;
        
        // Ensure minimum reasonable practice rate (at least 5 minutes per day)
        const minPracticePerDay = 5;
        const effectivePracticePerDay = Math.max(avgDailyPracticeMinutes, minPracticePerDay);

        // Calculate projected completion date based on remaining content vs practice rate
        const daysToComplete = Math.ceil(remainingDuration / effectivePracticePerDay);
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysToComplete);
        return this.getLocalDateString(targetDate);
    }

    getTotalCourseDurationMinutes() {
        let totalMinutes = 0;
        
        this.lessons.forEach(module => {
            const duration = module.duration;
            if (duration) {
                // Parse duration string like "2 hrs 30 min" or "1 hr 50 min"
                const hoursMatch = duration.match(/(\d+)\s*hrs?/);
                const minutesMatch = duration.match(/(\d+)\s*min/);
                
                const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
                const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
                
                totalMinutes += (hours * 60) + minutes;
            }
        });
        
        return totalMinutes;
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
            
            // Check if date is in the future
            const today = this.getLocalDateString();
            if (dateStr > today) {
                this.showModalError('Cannot add practice time for future dates');
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
        
        // Update course start date if this changes the earliest practice date
        if (newSeconds > 0 && (!this.progress.courseStartDate || dateStr < this.progress.courseStartDate)) {
            this.setCourseStartDate();
        }
        
        // Save and refresh displays
        this.saveProgress();
        this.renderCalendar();
        this.updateTodayStats();
        this.calculateTargetDate();
        this.updateStatsDisplay();
    }

    getPracticeColor(minutes) {
        if (minutes === 0) return null; // Default background
        
        // Smooth scaling: 1-60 minutes = full color range
        const intensity = Math.min(minutes / 60, 1);
        const saturation = 40 + (intensity * 30); // 40% to 70%
        const lightness = 70 - (intensity * 35);  // 70% to 35%
        
        return `hsl(120, ${saturation}%, ${lightness}%)`;
    }

    // Helper function to get local date in YYYY-MM-DD format
    getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Set course start date based on earliest practice date
    setCourseStartDate() {
        const practiceEntries = Object.entries(this.progress.practiceLog);
        if (practiceEntries.length > 0) {
            // Find earliest date with practice time > 0
            const earliestDate = practiceEntries
                .filter(([date, time]) => time > 0)
                .map(([date, time]) => date)
                .sort()[0];
            
            if (earliestDate) {
                this.progress.courseStartDate = earliestDate;
            }
        }
        
        // Fallback to today if no practice dates exist
        if (!this.progress.courseStartDate) {
            this.progress.courseStartDate = this.getLocalDateString();
        }
    }

    // Helper function to format time from seconds
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '0m';
        }
    }


    // Calculate lessons per day rate
    calculateLessonsPerDay() {
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        
        if (completedLessons === 0) {
            return 0;
        }
        
        if (!this.progress.courseStartDate) {
            return 0;
        }
        
        const startDate = new Date(this.progress.courseStartDate);
        const today = new Date();
        const daysSinceStart = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceStart <= 0) {
            return 0;
        }
        
        return completedLessons / daysSinceStart;
    }

    // Statistics update methods
    updateTotalPracticeTime() {
        const totalSeconds = this.progress.totalPracticeTime || 0;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        
        let displayText;
        if (hours > 0) {
            displayText = `${hours} hour${hours !== 1 ? 's' : ''}`;
            if (minutes > 0) {
                displayText += ` ${minutes} min`;
            }
        } else if (minutes > 0) {
            displayText = `${minutes} min`;
        } else {
            displayText = '0 min';
        }
        
        document.getElementById('totalPracticeTime').textContent = displayText;
    }

    updateAverageSessionLength() {
        const practiceEntries = Object.values(this.progress.practiceLog);
        const activeSessions = practiceEntries.filter(seconds => seconds > 0);
        
        if (activeSessions.length === 0) {
            document.getElementById('avgSessionLength').textContent = '0 min';
            return;
        }
        
        const totalSeconds = activeSessions.reduce((sum, seconds) => sum + seconds, 0);
        const averageSeconds = totalSeconds / activeSessions.length;
        const averageMinutes = Math.round(averageSeconds / 60);
        
        document.getElementById('avgSessionLength').textContent = `${averageMinutes} min`;
    }

    updateExpectedCompletion() {
        // Check if course is actually complete
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        
        if (completedLessons >= totalLessons) {
            document.getElementById('expectedCompletionOnePerDay').textContent = 'Complete!';
            document.getElementById('expectedCompletionLessonRate').textContent = 'Complete!';
            document.getElementById('expectedCompletionTimeRate').textContent = 'Complete!';
            return;
        }
        
        // Update labels with actual rates
        this.updateCompletionLabels();
        
        // Update each completion estimate
        this.updateSingleExpectedCompletion('expectedCompletionOnePerDay', this.targetDates?.onePerDay);
        this.updateSingleExpectedCompletion('expectedCompletionLessonRate', this.targetDates?.lessonRate);
        this.updateSingleExpectedCompletion('expectedCompletionTimeRate', this.targetDates?.timeRate);
    }

    updateCompletionLabels() {
        // Update lesson rate label
        const lessonsPerDay = this.calculateLessonsPerDay();
        if (lessonsPerDay > 0) {
            document.getElementById('lessonRateLabel').textContent = `Actual ${lessonsPerDay.toFixed(2)} lessons/day`;
        } else {
            document.getElementById('lessonRateLabel').textContent = 'Actual lesson rate';
        }
        
        // Update time rate label
        const avgDailyMinutes = this.calculateAvgDailyPracticeMinutes();
        if (avgDailyMinutes > 0) {
            document.getElementById('timeRateLabel').textContent = `Actual ${avgDailyMinutes.toFixed(0)} min/day`;
        } else {
            document.getElementById('timeRateLabel').textContent = 'Actual time rate';
        }
    }

    calculateAvgDailyPracticeMinutes() {
        const practiceEntries = Object.entries(this.progress.practiceLog);
        if (practiceEntries.length === 0) {
            return 0;
        }

        const totalPracticeSeconds = Object.values(this.progress.practiceLog).reduce((sum, seconds) => sum + seconds, 0);
        const practiceMinutes = totalPracticeSeconds / 60;
        
        // Calculate days with practice
        const daysWithPractice = practiceEntries.filter(([date, time]) => time > 0).length;
        if (daysWithPractice === 0) {
            return 0;
        }

        return practiceMinutes / daysWithPractice;
    }

    updateSingleExpectedCompletion(elementId, targetDate) {
        const element = document.getElementById(elementId);
        
        if (!targetDate) {
            element.textContent = '--';
            return;
        }
        
        const targetDateObj = new Date(targetDate);
        const now = new Date();
        const diffTime = targetDateObj - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            element.textContent = 'Overdue';
        } else if (diffDays === 0) {
            element.textContent = 'Today';
        } else if (diffDays <= 7) {
            element.textContent = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
        } else if (diffDays <= 30) {
            const weeks = Math.ceil(diffDays / 7);
            element.textContent = `${weeks} week${weeks !== 1 ? 's' : ''}`;
        } else {
            const options = { month: 'short', day: 'numeric' };
            if (targetDateObj.getFullYear() !== now.getFullYear()) {
                options.year = 'numeric';
            }
            element.textContent = targetDateObj.toLocaleDateString('en-US', options);
        }
    }

    updateLessonsPerDay() {
        const lessonsPerDay = this.calculateLessonsPerDay();
        
        if (lessonsPerDay === 0) {
            document.getElementById('lessonsPerDay').textContent = '--';
        } else {
            document.getElementById('lessonsPerDay').textContent = `${lessonsPerDay.toFixed(2)}`;
        }
    }

    // Main statistics display update method
    updateStatsDisplay() {
        this.updateTotalPracticeTime();
        this.updateAverageSessionLength();
        this.updateLessonsPerDay();
        this.updateExpectedCompletion();
    }

    // Authentication Methods
    setupAuthControls() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        loginBtn.addEventListener('click', () => this.handleGoogleLogin());
        logoutBtn.addEventListener('click', () => this.handleGoogleLogout());
    }

    setupInfoModal() {
        const infoBtn = document.getElementById('infoBtn');
        const infoModal = document.getElementById('infoModal');
        const infoModalClose = document.getElementById('infoModalClose');
        const infoModalClose2 = document.getElementById('infoModalClose2');

        infoBtn.addEventListener('click', () => this.showInfoModal());
        infoModalClose.addEventListener('click', () => this.hideInfoModal());
        infoModalClose2.addEventListener('click', () => this.hideInfoModal());

        // Close modal when clicking outside
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                this.hideInfoModal();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && infoModal.classList.contains('active')) {
                this.hideInfoModal();
            }
        });
    }

    async showInfoModal() {
        const infoModal = document.getElementById('infoModal');
        const infoContent = document.getElementById('infoContent');
        
        try {
            const response = await fetch('info.md');
            const markdownText = await response.text();
            
            // Simple markdown to HTML conversion
            const htmlContent = this.convertMarkdownToHTML(markdownText);
            infoContent.innerHTML = htmlContent;
        } catch (error) {
            console.error('Error loading info content:', error);
            infoContent.innerHTML = '<p>Error loading information. Please try again.</p>';
        }
        
        infoModal.classList.add('active');
    }

    hideInfoModal() {
        const infoModal = document.getElementById('infoModal');
        infoModal.classList.remove('active');
    }

    convertMarkdownToHTML(markdown) {
        let html = markdown;
        
        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // Bold text
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Code blocks
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Line breaks and paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        html = '<p>' + html + '</p>';
        
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p><br>/g, '<p>');
        
        return html;
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
                return;
            }
            
            if (!response.credential) {
                console.error('No credential in response:', response);
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
    }

    updateAuthUI() {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');

        if (this.isAuthenticated) {
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            
            userAvatar.src = this.user.picture;
            userName.textContent = this.user.name;
        } else {
            loginBtn.style.display = 'block';
            userInfo.style.display = 'none';
        }
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
            }
        });
    }

    async syncToCloud() {
        if (!this.isAuthenticated || this.syncInProgress) return;

        this.syncInProgress = true;

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
            
        } catch (error) {
            console.error('Sync to cloud error:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    async syncFromCloud() {
        if (!this.isAuthenticated || this.syncInProgress) return;

        this.syncInProgress = true;

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
                this.updateStatsDisplay();
            }

            
        } catch (error) {
            console.error('Sync from cloud error:', error);
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

}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new BassPracticeTracker();
});