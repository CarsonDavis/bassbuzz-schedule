class BassPracticeTracker {
    constructor() {
        this.lessons = [];
        this.currentTime = 0;
        this.timerInterval = null;
        this.isRunning = false;
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        
        this.init();
    }

    async init() {
        await this.loadLessons();
        this.loadProgress();
        this.setupTimerControls();
        this.renderModules();
        this.renderCalendar();
        this.updateTodayStats();
        this.calculateTargetDate();
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
            dayDiv.textContent = date.getDate();
            
            const dateStr = date.toISOString().split('T')[0];
            const isCurrentMonth = date.getMonth() === this.currentMonth;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const practiceTime = this.progress.practiceLog[dateStr] || 0;
            
            if (!isCurrentMonth) {
                dayDiv.classList.add('other-month');
            }
            
            if (isToday) {
                dayDiv.classList.add('today');
            }
            
            if (practiceTime > 0) {
                if (practiceTime >= 1800) { // 30 minutes
                    dayDiv.classList.add('long-practice');
                } else {
                    dayDiv.classList.add('practice-day');
                }
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BassPracticeTracker();
});