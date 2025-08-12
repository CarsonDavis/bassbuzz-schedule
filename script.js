class BassPracticeTracker {
    constructor() {
        this.lessons = [];
        this.currentTime = 0;
        this.lastSavedTime = 0;
        this.startTimestamp = null;
        this.timerInterval = null;
        this.isRunning = false;
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.currentChartYear = new Date().getFullYear();
        
        // Authentication state
        this.isAuthenticated = false;
        this.user = null;
        this.googleIdToken = null;
        this.lastSync = 0;
        this.cloudVersion = 0;
        this.syncInProgress = false;
        
        // Global tooltip element
        this.globalTooltip = null;
        
        // Color scaling preference
        this.linearColorScale = false;
        
        // Performance optimization state
        this.renderTimeout = null;
        this.lastTargetInputs = null;
        this.lessonUpdateTimeout = null;
        
        this.init();
    }


    async init() {
        await this.loadLessons();
        this.loadProgress();
        this.linearColorScale = this.progress.linearColorScale;
        this.setupTimerControls();
        this.setupAuthControls();
        this.setupInfoModal();
        this.createGlobalTooltip();
        this.renderModules();
        this.updateTodayStats();
        this.calculateTargetDate(); // Calculate target date BEFORE rendering calendars
        this.updateStatsDisplay();
        this.renderCalendar();     // Render calendars AFTER target date is calculated
        this.renderYearlyChart();
        this.initializeGoogleAuth();
        this.setupSyncRetry();
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
            // Migration: add sync tracking fields if missing
            if (!this.progress.hasOwnProperty('lastLocalUpdate')) {
                this.progress.lastLocalUpdate = Date.now();
            }
            if (!this.progress.hasOwnProperty('pendingSync')) {
                this.progress.pendingSync = false;
            }
            if (!this.progress.hasOwnProperty('linearColorScale')) {
                this.progress.linearColorScale = false;
            }
            if (!this.progress.hasOwnProperty('syncVersion')) {
                this.progress.syncVersion = 0;
            }
        } else {
            this.progress = {
                lessons: {},
                practiceLog: {},
                totalPracticeTime: 0,
                courseStartDate: null,
                lastLocalUpdate: Date.now(),
                pendingSync: false,
                syncVersion: 0,
                linearColorScale: false
            };
        }
    }

    saveProgress() {
        // Update local modification tracking
        this.progress.lastLocalUpdate = Date.now();
        this.progress.pendingSync = true;
        
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
            this.startTimestamp = Date.now() - (this.currentTime * 1000);
            this.timerInterval = setInterval(() => {
                this.updateCurrentTime();
                this.updateTimerDisplay();
            }, 100);
        }
    }

    pauseTimer() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.timerInterval);
            this.updateCurrentTime();
            this.savePracticeSession();
        }
    }

    resetTimer() {
        this.isRunning = false;
        clearInterval(this.timerInterval);
        this.currentTime = 0;
        this.lastSavedTime = 0;
        this.startTimestamp = null;
        this.updateTimerDisplay();
    }

    updateCurrentTime() {
        if (this.isRunning && this.startTimestamp) {
            this.currentTime = Math.floor((Date.now() - this.startTimestamp) / 1000);
        }
    }

    updateTimerDisplay() {
        const hours = Math.floor(this.currentTime / 3600);
        const minutes = Math.floor((this.currentTime % 3600) / 60);
        const seconds = this.currentTime % 60;
        
        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timerDisplay').textContent = display;
    }

    createGlobalTooltip() {
        // Create a single global tooltip element
        this.globalTooltip = document.createElement('div');
        this.globalTooltip.className = 'yearly-chart-tooltip';
        this.globalTooltip.style.position = 'fixed';
        this.globalTooltip.style.visibility = 'hidden';
        this.globalTooltip.style.opacity = '0';
        this.globalTooltip.style.zIndex = '9999';
        this.globalTooltip.style.pointerEvents = 'none';
        
        // Append to body
        document.body.appendChild(this.globalTooltip);
    }

    getViewportBounds() {
        return {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
        };
    }

    showTooltip(element, content) {
        if (!this.globalTooltip) return;

        // Update tooltip content
        this.globalTooltip.innerHTML = content;
        
        // Get element position
        const elementRect = element.getBoundingClientRect();
        
        // Simple positioning - always above and centered, no complex calculations
        const left = elementRect.left + elementRect.width / 2;
        const top = elementRect.top - 60; // Fixed 60px above
        
        // Position tooltip
        this.globalTooltip.style.left = `${left}px`;
        this.globalTooltip.style.top = `${top}px`;
        this.globalTooltip.style.transform = 'translateX(-50%)';
        this.globalTooltip.style.visibility = 'visible';
        this.globalTooltip.style.opacity = '1';
    }

    hideTooltip() {
        if (this.globalTooltip) {
            this.globalTooltip.style.visibility = 'hidden';
            this.globalTooltip.style.opacity = '0';
        }
    }

    savePracticeSession() {
        if (this.currentTime > this.lastSavedTime) {
            const sessionTime = this.currentTime - this.lastSavedTime;
            const today = this.getLocalDateString();
            if (!this.progress.practiceLog[today]) {
                this.progress.practiceLog[today] = 0;
            }
            this.progress.practiceLog[today] += sessionTime;
            this.progress.totalPracticeTime += sessionTime;
            this.lastSavedTime = this.currentTime;
            
            // Set course start date if not already set
            if (!this.progress.courseStartDate) {
                this.setCourseStartDate();
            }
            
            this.saveProgress();
            this.updateTodayStats();
            this.calculateTargetDate(); // Calculate target date before rendering
            this.updateStatsDisplay();
            
            // Use selective updates instead of full re-renders
            this.updateCalendarCell(today);
            this.updateYearlyChartCell(today);
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
                
                // Immediate visual feedback - update lesson item styling
                const lessonItem = e.target.closest('.lesson-item');
                if (lessonItem) {
                    lessonItem.classList.toggle('completed', e.target.checked);
                }
                
                // Set course start date when first lesson is completed (if no practice dates exist)
                if (e.target.checked && !this.progress.courseStartDate) {
                    this.setCourseStartDate();
                }
                
                // Batch all expensive operations to handle rapid clicking
                this.scheduleLessonUpdate();
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

    // Selective calendar update methods
    scheduleRender() {
        if (this.renderTimeout) return; // Already scheduled
        
        this.renderTimeout = setTimeout(() => {
            this.renderCalendar();
            this.renderYearlyChart();
            this.renderTimeout = null;
        }, 50); // 50ms debounce
    }

    scheduleLessonUpdate() {
        if (this.lessonUpdateTimeout) return; // Already scheduled
        
        this.lessonUpdateTimeout = setTimeout(() => {
            // Batch all the expensive operations
            this.saveProgress();
            this.updateOverallProgress();
            this.renderModules();
            this.calculateTargetDate();
            this.updateStatsDisplay();
            this.scheduleRender(); // This will also be debounced
            this.lessonUpdateTimeout = null;
        }, 100); // 100ms debounce for lesson updates (longer than render debounce)
    }

    updateCalendarCell(dateStr) {
        const cell = document.querySelector(`#calendarGrid [data-date="${dateStr}"]`);
        if (!cell) {
            // Cell not visible in current month view, trigger full render
            this.renderCalendar();
            return;
        }
        
        const practiceTime = this.progress.practiceLog[dateStr] || 0;
        const practiceMinutes = Math.floor(practiceTime / 60);
        
        // Update practice minutes display
        const minutesSpan = cell.querySelector('.practice-minutes');
        if (practiceMinutes > 0) {
            if (!minutesSpan) {
                cell.insertAdjacentHTML('beforeend', `<span class="practice-minutes">${practiceMinutes}m</span>`);
            } else {
                minutesSpan.textContent = `${practiceMinutes}m`;
            }
        } else if (minutesSpan) {
            minutesSpan.remove();
        }
        
        // Update background color
        const practiceColor = this.getPracticeColor(practiceMinutes);
        cell.style.backgroundColor = practiceColor || '';
        cell.style.color = practiceColor ? 'white' : '';
        
        // Update target date highlighting
        cell.classList.toggle('target-date', dateStr === this.targetDate);
    }

    updateYearlyChartCell(dateStr) {
        const cell = document.querySelector(`#yearlyChartGrid [data-date="${dateStr}"]`);
        if (!cell) {
            // Cell not visible in current year view, trigger full render
            this.renderYearlyChart();
            return;
        }
        
        const practiceTime = this.progress.practiceLog[dateStr] || 0;
        const practiceMinutes = Math.floor(practiceTime / 60);
        
        // Update background color
        const practiceColor = this.getPracticeColor(practiceMinutes);
        if (practiceColor) {
            cell.style.backgroundColor = practiceColor;
            cell.classList.remove('level-0');
        } else {
            cell.style.backgroundColor = '';
            cell.classList.add('level-0');
        }
        
        // Update target date highlighting
        if (this.targetDate && dateStr === this.targetDate) {
            cell.classList.add('target-date');
            cell.style.backgroundColor = '#9b59b6';
        } else {
            cell.classList.remove('target-date');
        }
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
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        // Generate calendar days
        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            
            const dateStr = this.getLocalDateString(date);
            dayDiv.dataset.date = dateStr;
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
                console.log('MONTHLY CALENDAR: Adding target-date class for', dateStr);
                dayDiv.classList.add('target-date');
            }
            
            grid.appendChild(dayDiv);
        }
        
        // Setup color scale toggle (only once)
        const colorScaleToggle = document.getElementById('colorScaleToggle');
        if (colorScaleToggle && !colorScaleToggle.hasEventListener) {
            colorScaleToggle.textContent = this.linearColorScale ? 'Linear' : 'Curved';
            colorScaleToggle.onclick = () => {
                this.toggleColorScale();
            };
            colorScaleToggle.hasEventListener = true; // Prevent duplicate listeners
        }
        
        // Debug: Log rendering info
        console.log('MONTHLY CALENDAR RENDER - Current targetDate:', this.targetDate);
        console.log('MONTHLY CALENDAR RENDER - Current month/year:', this.currentMonth, this.currentYear);
    }

    renderYearlyChart() {
        const grid = document.getElementById('yearlyChartGrid');
        const monthsContainer = document.getElementById('yearlyChartMonths');
        
        if (!grid || !monthsContainer) {
            console.error('Yearly chart containers not found');
            return;
        }
        
        // Update year display
        document.getElementById('currentYear').textContent = this.currentChartYear;
        
        // Debug: Log yearly chart info
        console.log('YEARLY CHART RENDER - Current targetDate:', this.targetDate);
        console.log('YEARLY CHART RENDER - Current chart year:', this.currentChartYear);
        console.log('YEARLY CHART RENDER - Target date year:', this.targetDate ? new Date(this.targetDate).getFullYear() : 'no target date');
        
        // Setup year navigation
        document.getElementById('prevYear').onclick = () => {
            this.currentChartYear--;
            this.renderYearlyChart();
        };
        
        document.getElementById('nextYear').onclick = () => {
            this.currentChartYear++;
            this.renderYearlyChart();
        };
        

        // Clear containers
        grid.innerHTML = '';
        monthsContainer.innerHTML = '';
        
        // Generate month labels
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Calculate weeks and month positions
        const yearStart = new Date(this.currentChartYear, 0, 1);
        
        // Find first Sunday of the year (or before)
        const firstSunday = new Date(yearStart);
        firstSunday.setDate(yearStart.getDate() - yearStart.getDay());
        
        // Generate month labels based on first occurrence of each month
        let monthPositions = [];
        let tempDate = new Date(firstSunday);
        
        for (let week = 0; week < 53; week++) {
            const monthInWeek = tempDate.getMonth();
            const yearInWeek = tempDate.getFullYear();
            
            if (yearInWeek === this.currentChartYear) {
                if (!monthPositions.find(m => m.month === monthInWeek)) {
                    monthPositions.push({
                        month: monthInWeek,
                        week: week,
                        name: monthNames[monthInWeek]
                    });
                }
            }
            
            tempDate.setDate(tempDate.getDate() + 7);
        }
        
        // Create month labels
        monthPositions.forEach(pos => {
            const monthDiv = document.createElement('div');
            monthDiv.className = 'yearly-chart-month';
            monthDiv.textContent = pos.name;
            monthDiv.style.gridColumnStart = pos.week + 1;
            monthDiv.style.gridColumnEnd = 'span 4'; // Span multiple weeks for visibility
            monthsContainer.appendChild(monthDiv);
        });
        
        // Generate daily grid
        let currentDate = new Date(firstSunday);
        const today = this.getLocalDateString();
        console.log('YEARLY CHART: Starting from date:', this.getLocalDateString(currentDate));
        console.log('YEARLY CHART: Looking for target date:', this.targetDate);
        for (let week = 0; week < 53; week++) {
            for (let day = 0; day < 7; day++) {
                const dateStr = this.getLocalDateString(currentDate);
                const dayDiv = document.createElement('div');
                dayDiv.className = 'yearly-chart-day';
                dayDiv.dataset.date = dateStr;
                
                // Check if this date is in the future
                const isFuture = dateStr > today;
                
                // Check if this is the target completion date FIRST (before future check)
                if (this.targetDate && dateStr === this.targetDate) {
                    console.log('YEARLY CALENDAR: *** MATCH! Adding target-date for', dateStr);
                    dayDiv.classList.add('target-date');
                    // Override any practice color with target date styling
                    dayDiv.style.backgroundColor = '#9b59b6';
                } else if (isFuture) {
                    dayDiv.classList.add('future');
                } else {
                    // Add practice data
                    const practiceTime = this.progress.practiceLog[dateStr] || 0;
                    const practiceMinutes = Math.floor(practiceTime / 60);
                    
                    // Apply dynamic color using the unified function
                    const practiceColor = this.getPracticeColor(practiceMinutes);
                    if (practiceColor) {
                        dayDiv.style.backgroundColor = practiceColor;
                    } else {
                        dayDiv.classList.add('level-0'); // Keep level-0 class for no practice
                    }
                }
                
                // Add click handler
                if (!isFuture) {
                    dayDiv.addEventListener('click', () => {
                        const practiceTime = this.progress.practiceLog[dateStr] || 0;
                        const practiceMinutes = Math.floor(practiceTime / 60);
                        this.editPracticeTime(dateStr, practiceMinutes);
                    });
                }
                
                // Add tooltip
                const practiceTime = this.progress.practiceLog[dateStr] || 0;
                this.addYearlyChartTooltip(dayDiv, new Date(currentDate), practiceTime);
                
                grid.appendChild(dayDiv);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    }

    addYearlyChartTooltip(dayDiv, date, practiceTime) {
        const practiceMinutes = Math.floor(practiceTime / 60);
        
        dayDiv.addEventListener('mouseenter', () => {
            const dateStr = date.toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric'
            });
            
            const practiceText = practiceMinutes === 0 ? 'No practice' : 
                               practiceMinutes === 1 ? '1 minute' : 
                               `${practiceMinutes} minutes`;
            
            const content = `${practiceText}<br><strong>${dateStr}</strong>`;
            
            // Use the global tooltip with safe positioning
            this.showTooltip(dayDiv, content);
        });
        
        dayDiv.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
    }

    calculateTargetDate() {
        // Only recalculate if inputs actually changed
        const currentInputs = JSON.stringify({
            lessons: this.progress.lessons,
            practiceLog: Object.keys(this.progress.practiceLog).length,
            startDate: this.progress.courseStartDate,
            totalPracticeTime: this.progress.totalPracticeTime
        });
        
        if (this.lastTargetInputs === currentInputs) {
            return; // No changes, skip calculation
        }
        
        console.log('=== CALCULATING TARGET DATE ===');
        this.lastTargetInputs = currentInputs;
        
        // Calculate all three target dates
        this.targetDates = {
            onePerDay: this.calculateOnePerDayTarget(),
            lessonRate: this.calculateLessonRateTarget(),
            timeRate: this.calculateTimeRateTarget()
        };
        
        console.log('Target dates calculated:', this.targetDates);
        
        // Keep the original targetDate for calendar display (use lesson rate as primary)
        this.targetDate = this.targetDates.lessonRate;
        
        console.log('Final targetDate set to:', this.targetDate);
        console.log('=== END TARGET DATE CALCULATION ===');
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
        console.log('--- Calculating Lesson Rate Target ---');
        const totalLessons = this.lessons.reduce((sum, module) => sum + module.lessons.length, 0);
        const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
        const remainingLessons = totalLessons - completedLessons;
        
        console.log('Total lessons:', totalLessons);
        console.log('Completed lessons:', completedLessons);
        console.log('Remaining lessons:', remainingLessons);
        
        if (remainingLessons <= 0) {
            console.log('No remaining lessons - returning null');
            return null;
        }

        // If no lessons completed, can't calculate
        if (completedLessons === 0) {
            console.log('No lessons completed - returning null');
            return null;
        }
        
        console.log('Course start date:', this.progress.courseStartDate);
        
        // If no start date, try to set it based on practice log
        if (!this.progress.courseStartDate) {
            console.log('No course start date, trying to set it...');
            this.setCourseStartDate();
            
            // If still no start date, can't calculate
            if (!this.progress.courseStartDate) {
                console.log('Still no course start date - returning null');
                return null;
            }
            
            this.saveProgress();
        }

        // Calculate lessons per day based on actual progress
        const startDate = new Date(this.progress.courseStartDate);
        const today = new Date();
        const daysSinceStart = (today - startDate) / (1000 * 60 * 60 * 24);
        
        console.log('Start date:', startDate);
        console.log('Today:', today);
        console.log('Days since start:', daysSinceStart);
        
        // Avoid division by zero and handle same-day start
        if (daysSinceStart < 1.0) {
            console.log('Within first day - using current rate for projection');
            // For target date calculation, use current rate but don't be overly optimistic
            const currentRate = completedLessons / Math.max(daysSinceStart, 0.1);
            const daysToComplete = Math.ceil(remainingLessons / Math.max(currentRate, 1/30));
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + daysToComplete);
            console.log('First-day target calculation - rate:', currentRate, 'days to complete:', daysToComplete);
            return this.getLocalDateString(targetDate);
        }

        const lessonsPerDay = completedLessons / daysSinceStart;
        
        console.log('Lessons per day (raw):', lessonsPerDay);
        
        // Ensure minimum reasonable learning rate (at least 1 lesson per month)
        const minLessonsPerDay = 1 / 30; // 1 lesson per 30 days
        const effectiveLessonsPerDay = Math.max(lessonsPerDay, minLessonsPerDay);

        console.log('Effective lessons per day:', effectiveLessonsPerDay);

        // Calculate projected completion date
        const daysToComplete = Math.ceil(remainingLessons / effectiveLessonsPerDay);
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysToComplete);
        
        console.log('Days to complete:', daysToComplete);
        console.log('Target date object:', targetDate);
        
        const targetDateString = this.getLocalDateString(targetDate);
        console.log('Target date string:', targetDateString);
        console.log('--- End Lesson Rate Target ---');
        
        return targetDateString;
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
        const daysWithPractice = practiceEntries.filter(([_, time]) => time > 0).length;
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
        this.updateTodayStats();
        this.calculateTargetDate(); // Calculate target date before rendering
        this.updateStatsDisplay();
        
        // Use debounced full render to ensure both calendars update
        // (selective updates can miss when target date changes or cells aren't visible)
        this.scheduleRender();
    }

    getPracticeColor(minutes) {
        if (minutes === 0) return null; // Default background
        
        const rawIntensity = Math.min(minutes / 120, 1);
        
        let intensity;
        if (this.linearColorScale) {
            // Linear scaling
            intensity = rawIntensity;
        } else {
            // Subtle non-linear scaling: blend linear and square root for gentler curve
            const sqrtIntensity = Math.sqrt(rawIntensity);
            intensity = (rawIntensity + sqrtIntensity) / 2; // Average of linear and sqrt
        }
        
        const saturation = 40 + (intensity * 30); // 40% to 70%
        const lightness = 85 - (intensity * 60);  // 85% to 25% (lighter to darker)
        
        return `hsl(120, ${saturation}%, ${lightness}%)`;
    }

    toggleColorScale() {
        this.linearColorScale = !this.linearColorScale;
        this.progress.linearColorScale = this.linearColorScale;
        this.saveProgress();
        
        // Update button text
        const toggleButton = document.getElementById('colorScaleToggle');
        toggleButton.textContent = this.linearColorScale ? 'Linear' : 'Curved';
        
        // Refresh both calendars - color scale changes require full re-render
        this.scheduleRender();
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
                .filter(([_, time]) => time > 0)
                .map(([date, _]) => date)
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
        
        // Use actual fractional days, not rounded up days
        const daysSinceStart = (today - startDate) / (1000 * 60 * 60 * 24);
        
        // Handle same-day and very recent starts properly
        if (daysSinceStart < 1.0) {
            // If less than a full day, show the rate they're achieving today
            // This gives new users an encouraging but realistic rate
            return completedLessons / Math.max(daysSinceStart, 0.1);
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
        const daysWithPractice = practiceEntries.filter(([_, time]) => time > 0).length;
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
        } else {
            // Always show actual date for 8+ days
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

    setupSyncRetry() {
        // Check for pending syncs every 30 seconds
        setInterval(() => {
            if (this.isAuthenticated && this.progress.pendingSync && !this.syncInProgress) {
                console.log('Retrying pending sync...');
                this.syncToCloud();
            }
        }, 30000);
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
        
        try {
            if (!response) {
                console.error('No response from Google');
                return;
            }
            
            if (!response.credential) {
                console.error('No credential in response:', response);
                return;
            }
            
            
            // Decode the JWT token
            const payload = JSON.parse(atob(response.credential.split('.')[1]));
            
            this.user = {
                sub: payload.sub,
                name: payload.name,
                email: payload.email,
                picture: payload.picture
            };
            
            this.googleIdToken = response.credential;
            this.isAuthenticated = true;
            
            
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
            
            // Create a copy of progress for upload, with updated sync fields
            const progressToUpload = {
                ...this.progress,
                syncVersion: this.progress.syncVersion + 1,
                pendingSync: false
            };
            
            const item = {
                userId: this.user.sub,
                data: JSON.stringify(progressToUpload),
                lastUpdated: Date.now(),
                version: this.cloudVersion + 1
            };

            await dynamoDb.put({
                TableName: 'bass-practice-data',
                Item: item
            }).promise();

            // Update local state on successful sync
            this.cloudVersion = item.version;
            this.lastSync = item.lastUpdated;
            this.progress.syncVersion = progressToUpload.syncVersion;
            this.progress.pendingSync = false;
            
            // Save updated local state
            localStorage.setItem('bassProgress', JSON.stringify(this.progress));
            console.log('Sync to cloud successful, version:', this.cloudVersion);
            
        } catch (error) {
            console.error('Sync to cloud error:', error);
            // Keep pendingSync flag set for retry
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

            if (result.Item) {
                const cloudProgress = JSON.parse(result.Item.data);
                
                // Always merge - this handles both fresh login and updates
                this.mergeProgress(cloudProgress);
                this.cloudVersion = result.Item.version;
                this.lastSync = result.Item.lastUpdated;
                
                // Update UI after sync
                this.renderModules();
                this.updateTodayStats();
                this.calculateTargetDate();
                this.updateStatsDisplay();
                
                // Use debounced render for calendars after data merge
                this.scheduleRender();
                
                // If we had pending changes, sync them back to cloud
                if (this.progress.pendingSync) {
                    console.log('Local changes detected, syncing back to cloud...');
                    await this.syncToCloud();
                }
            } else {
                // Mark as pending sync so first local change creates cloud record
                this.progress.pendingSync = true;
                this.saveProgress();
            }

            
        } catch (error) {
            console.error('Sync from cloud error:', error);
            // Mark pending sync so we retry later
            this.progress.pendingSync = true;
            this.saveProgress();
        } finally {
            this.syncInProgress = false;
        }
    }

    mergeProgress(cloudProgress) {
        
        // Intelligent merge strategy to preserve all practice data
        const mergedProgress = {
            lessons: {},
            practiceLog: {},
            totalPracticeTime: 0,
            courseStartDate: null,
            lastLocalUpdate: this.progress.lastLocalUpdate,
            pendingSync: false,
            syncVersion: (cloudProgress.syncVersion || 0) + 1
        };
        
        // Merge lesson progress: Union (never lose completed lessons)
        const allLessons = { ...cloudProgress.lessons, ...this.progress.lessons };
        for (const [lessonKey, completed] of Object.entries(allLessons)) {
            if (completed) {
                mergedProgress.lessons[lessonKey] = true;
            }
        }
        
        // Merge practice logs: Combine all dates, add times for same date
        const allPracticeDates = new Set([
            ...Object.keys(cloudProgress.practiceLog || {}),
            ...Object.keys(this.progress.practiceLog || {})
        ]);
        
        for (const date of allPracticeDates) {
            const cloudTime = cloudProgress.practiceLog?.[date] || 0;
            const localTime = this.progress.practiceLog?.[date] || 0;
            
            // For same date, take the maximum (could be multiple sessions)
            // This handles the case where user practiced on different devices
            mergedProgress.practiceLog[date] = Math.max(cloudTime, localTime);
        }
        
        // Recalculate total practice time from merged practice log
        mergedProgress.totalPracticeTime = Object.values(mergedProgress.practiceLog)
            .reduce((total, seconds) => total + seconds, 0);
        
        // Handle course start date: earliest date
        const cloudStartDate = cloudProgress.courseStartDate;
        const localStartDate = this.progress.courseStartDate;
        if (cloudStartDate && localStartDate) {
            mergedProgress.courseStartDate = cloudStartDate < localStartDate ? cloudStartDate : localStartDate;
        } else {
            mergedProgress.courseStartDate = cloudStartDate || localStartDate;
        }
        
        
        // Update local progress with merged data
        this.progress = mergedProgress;
        this.saveProgress();
    }

    // Manual data import function
    importJuly2025Data() {
        const july2025Data = {
            '2025-07-01': 30 * 60,  // 30m
            '2025-07-02': 30 * 60,  // 30m
            '2025-07-03': 30 * 60,  // 30m
            '2025-07-04': 30 * 60,  // 30m
            '2025-07-05': 30 * 60,  // 30m
            '2025-07-06': 26 * 60,  // 26m
            '2025-07-07': 57 * 60,  // 57m
            '2025-07-08': 30 * 60,  // 30m
            '2025-07-09': 35 * 60,  // 35m
            '2025-07-10': 40 * 60,  // 40m
            '2025-07-11': 32 * 60,  // 32m
            '2025-07-12': 91 * 60,  // 91m
            '2025-07-13': 144 * 60, // 144m
            '2025-07-14': 46 * 60,  // 46m
            '2025-07-15': 40 * 60,  // 40m
            '2025-07-16': 33 * 60,  // 33m
            '2025-07-17': 67 * 60,  // 67m
            '2025-07-18': 85 * 60,  // 85m
            '2025-07-19': 55 * 60,  // 55m
            '2025-07-20': 165 * 60, // 165m
            '2025-07-21': 46 * 60,  // 46m
            '2025-07-22': 59 * 60,  // 59m
            '2025-07-23': 47 * 60,  // 47m
            '2025-07-24': 70 * 60,  // 70m
            '2025-07-25': 30 * 60,  // 30m
            '2025-07-26': 60 * 60,  // 60m
            '2025-07-27': 101 * 60, // 101m
            '2025-07-28': 56 * 60,  // 56m
            '2025-07-29': 37 * 60,  // 37m
            '2025-07-30': 82 * 60,  // 82m
            '2025-07-31': 56 * 60,  // 56m
            '2025-08-01': 65 * 60,  // 65m
            '2025-08-02': 64 * 60,  // 64m
            '2025-08-03': 72 * 60,  // 72m
            '2025-08-04': 59 * 60,  // 59m
            '2025-08-05': 36 * 60,  // 36m
            '2025-08-06': 71 * 60,  // 71m
            '2025-08-07': 82 * 60,  // 82m
            '2025-08-08': 96 * 60   // 96m
        };

        // Add all the practice data to current progress
        Object.assign(this.progress.practiceLog, july2025Data);
        
        // Recalculate total practice time
        this.progress.totalPracticeTime = Object.values(this.progress.practiceLog)
            .reduce((total, seconds) => total + seconds, 0);
        
        // Save to localStorage
        this.saveProgress();
        
        // Refresh the displays
        this.renderCalendar();
        this.renderYearlyChart();
        this.updateStatsDisplay();
        
        console.log('July 2025 data imported successfully!');
        console.log('Total practice time:', Math.floor(this.progress.totalPracticeTime / 3600), 'hours');
    }

}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new BassPracticeTracker();
});