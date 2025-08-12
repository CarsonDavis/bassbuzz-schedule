/**
 * @jest-environment jsdom
 */

// Mock DOM structure for testing
function createMockDOM() {
    document.body.innerHTML = `
        <div id="modulesContainer"></div>
    `;
}

// Test helper for select all functionality
class TestSelectAllTracker {
    constructor() {
        this.lessons = [
            {
                id: 1,
                title: "Test Module 1",
                duration: "1 hr",
                lessons: ["Lesson 1A", "Lesson 1B", "Lesson 1C"]
            },
            {
                id: 2,
                title: "Test Module 2", 
                duration: "2 hrs",
                lessons: ["Lesson 2A", "Lesson 2B"]
            }
        ];
        this.progress = {
            lessons: {}
        };
    }

    handleSelectAll(moduleId, checked) {
        const module = this.lessons.find(m => m.id.toString() === moduleId.toString());
        if (!module) return;

        // Update all lessons in this module
        module.lessons.forEach(lesson => {
            const key = `${moduleId}-${lesson}`;
            this.progress.lessons[key] = checked;
            
            // Update visual state of individual checkboxes
            const checkbox = document.querySelector(`[data-module="${moduleId}"][data-lesson="${lesson}"]`);
            if (checkbox) {
                checkbox.checked = checked;
                const lessonItem = checkbox.closest('.lesson-item');
                if (lessonItem) {
                    lessonItem.classList.toggle('completed', checked);
                }
            }
        });
    }

    updateSelectAllState(moduleId) {
        const module = this.lessons.find(m => m.id.toString() === moduleId.toString());
        if (!module) return;

        const selectAllCheckbox = document.querySelector(`.select-all-checkbox[data-module="${moduleId}"]`);
        if (!selectAllCheckbox) return;

        // Check if all lessons in this module are completed
        const allCompleted = module.lessons.every(lesson => {
            const key = `${moduleId}-${lesson}`;
            return this.progress.lessons[key];
        });

        // Check if some lessons are completed
        const someCompleted = module.lessons.some(lesson => {
            const key = `${moduleId}-${lesson}`;
            return this.progress.lessons[key];
        });

        selectAllCheckbox.checked = allCompleted;
        selectAllCheckbox.indeterminate = someCompleted && !allCompleted;
    }

    renderTestModule(moduleId) {
        const module = this.lessons.find(m => m.id === moduleId);
        if (!module) return;

        const container = document.getElementById('modulesContainer');
        const moduleDiv = document.createElement('div');
        moduleDiv.className = 'module';
        moduleDiv.innerHTML = `
            <div class="module-content active">
                <div class="lesson-item select-all-item">
                    <input type="checkbox" class="select-all-checkbox" 
                           data-module="${module.id}">
                    <span class="lesson-name select-all-label">Select All</span>
                </div>
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
    }
}

describe('Select All Functionality', () => {
    let tracker;

    beforeEach(() => {
        tracker = new TestSelectAllTracker();
        createMockDOM();
    });

    describe('Select All Checkbox Behavior', () => {
        test('should check all lessons when select all is checked', () => {
            tracker.renderTestModule(1);
            
            // Initially no lessons are completed
            expect(tracker.progress.lessons['1-Lesson 1A']).toBeFalsy();
            expect(tracker.progress.lessons['1-Lesson 1B']).toBeFalsy();
            expect(tracker.progress.lessons['1-Lesson 1C']).toBeFalsy();
            
            // Check select all
            tracker.handleSelectAll('1', true);
            
            // All lessons should now be completed
            expect(tracker.progress.lessons['1-Lesson 1A']).toBe(true);
            expect(tracker.progress.lessons['1-Lesson 1B']).toBe(true);
            expect(tracker.progress.lessons['1-Lesson 1C']).toBe(true);
            
            // Individual checkboxes should be checked
            const checkboxes = document.querySelectorAll('[data-module="1"][data-lesson]');
            checkboxes.forEach(checkbox => {
                expect(checkbox.checked).toBe(true);
            });
            
            // Lesson items should have completed class
            const lessonItems = document.querySelectorAll('.lesson-item:not(.select-all-item)');
            lessonItems.forEach(item => {
                expect(item.classList.contains('completed')).toBe(true);
            });
        });

        test('should uncheck all lessons when select all is unchecked', () => {
            tracker.renderTestModule(1);
            
            // Start with all lessons completed
            tracker.progress.lessons['1-Lesson 1A'] = true;
            tracker.progress.lessons['1-Lesson 1B'] = true;
            tracker.progress.lessons['1-Lesson 1C'] = true;
            
            // Uncheck select all
            tracker.handleSelectAll('1', false);
            
            // All lessons should now be uncompleted
            expect(tracker.progress.lessons['1-Lesson 1A']).toBe(false);
            expect(tracker.progress.lessons['1-Lesson 1B']).toBe(false);
            expect(tracker.progress.lessons['1-Lesson 1C']).toBe(false);
            
            // Individual checkboxes should be unchecked
            const checkboxes = document.querySelectorAll('[data-module="1"][data-lesson]');
            checkboxes.forEach(checkbox => {
                expect(checkbox.checked).toBe(false);
            });
        });

        test('should only affect lessons in the specified module', () => {
            tracker.renderTestModule(1);
            tracker.renderTestModule(2);
            
            // Set some lessons in module 2 as completed
            tracker.progress.lessons['2-Lesson 2A'] = true;
            
            // Check select all for module 1
            tracker.handleSelectAll('1', true);
            
            // Module 1 lessons should be completed
            expect(tracker.progress.lessons['1-Lesson 1A']).toBe(true);
            expect(tracker.progress.lessons['1-Lesson 1B']).toBe(true);
            expect(tracker.progress.lessons['1-Lesson 1C']).toBe(true);
            
            // Module 2 lessons should be unchanged
            expect(tracker.progress.lessons['2-Lesson 2A']).toBe(true);
            expect(tracker.progress.lessons['2-Lesson 2B']).toBeFalsy();
        });
    });

    describe('Select All State Management', () => {
        test('should be checked when all lessons are completed', () => {
            tracker.renderTestModule(1);
            
            // Complete all lessons
            tracker.progress.lessons['1-Lesson 1A'] = true;
            tracker.progress.lessons['1-Lesson 1B'] = true;
            tracker.progress.lessons['1-Lesson 1C'] = true;
            
            // Update select all state
            tracker.updateSelectAllState('1');
            
            const selectAllCheckbox = document.querySelector('.select-all-checkbox[data-module="1"]');
            expect(selectAllCheckbox.checked).toBe(true);
            expect(selectAllCheckbox.indeterminate).toBe(false);
        });

        test('should be unchecked when no lessons are completed', () => {
            tracker.renderTestModule(1);
            
            // No lessons completed (default state)
            tracker.updateSelectAllState('1');
            
            const selectAllCheckbox = document.querySelector('.select-all-checkbox[data-module="1"]');
            expect(selectAllCheckbox.checked).toBe(false);
            expect(selectAllCheckbox.indeterminate).toBe(false);
        });

        test('should be indeterminate when some lessons are completed', () => {
            tracker.renderTestModule(1);
            
            // Complete some but not all lessons
            tracker.progress.lessons['1-Lesson 1A'] = true;
            tracker.progress.lessons['1-Lesson 1B'] = false;
            tracker.progress.lessons['1-Lesson 1C'] = true;
            
            // Update select all state
            tracker.updateSelectAllState('1');
            
            const selectAllCheckbox = document.querySelector('.select-all-checkbox[data-module="1"]');
            expect(selectAllCheckbox.checked).toBe(false);
            expect(selectAllCheckbox.indeterminate).toBe(true);
        });

        test('should handle modules with different completion states', () => {
            tracker.renderTestModule(1);
            tracker.renderTestModule(2);
            
            // Module 1: all completed
            tracker.progress.lessons['1-Lesson 1A'] = true;
            tracker.progress.lessons['1-Lesson 1B'] = true;
            tracker.progress.lessons['1-Lesson 1C'] = true;
            
            // Module 2: partially completed
            tracker.progress.lessons['2-Lesson 2A'] = true;
            tracker.progress.lessons['2-Lesson 2B'] = false;
            
            tracker.updateSelectAllState('1');
            tracker.updateSelectAllState('2');
            
            const selectAll1 = document.querySelector('.select-all-checkbox[data-module="1"]');
            const selectAll2 = document.querySelector('.select-all-checkbox[data-module="2"]');
            
            expect(selectAll1.checked).toBe(true);
            expect(selectAll1.indeterminate).toBe(false);
            
            expect(selectAll2.checked).toBe(false);
            expect(selectAll2.indeterminate).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        test('should handle invalid module ID gracefully', () => {
            tracker.renderTestModule(1);
            
            // Try to handle select all for non-existent module
            expect(() => {
                tracker.handleSelectAll('999', true);
            }).not.toThrow();
            
            expect(() => {
                tracker.updateSelectAllState('999');
            }).not.toThrow();
        });

        test('should handle missing DOM elements gracefully', () => {
            // Don't render any modules
            expect(() => {
                tracker.updateSelectAllState('1');
            }).not.toThrow();
            
            expect(() => {
                tracker.handleSelectAll('1', true);
            }).not.toThrow();
        });

        test('should handle empty module (no lessons)', () => {
            const emptyModule = {
                id: 3,
                title: "Empty Module",
                duration: "0 min",
                lessons: []
            };
            tracker.lessons.push(emptyModule);
            
            expect(() => {
                tracker.handleSelectAll('3', true);
                tracker.updateSelectAllState('3');
            }).not.toThrow();
        });
    });

    describe('Integration with Existing Functionality', () => {
        test('should work correctly with individual lesson toggles', () => {
            tracker.renderTestModule(1);
            
            // Use select all to check everything
            tracker.handleSelectAll('1', true);
            expect(tracker.progress.lessons['1-Lesson 1A']).toBe(true);
            
            // Manually uncheck one lesson
            tracker.progress.lessons['1-Lesson 1A'] = false;
            
            // Update select all state
            tracker.updateSelectAllState('1');
            
            const selectAllCheckbox = document.querySelector('.select-all-checkbox[data-module="1"]');
            expect(selectAllCheckbox.checked).toBe(false);
            expect(selectAllCheckbox.indeterminate).toBe(true);
            
            // Use select all to check everything again
            tracker.handleSelectAll('1', true);
            expect(tracker.progress.lessons['1-Lesson 1A']).toBe(true);
            
            tracker.updateSelectAllState('1');
            expect(selectAllCheckbox.checked).toBe(true);
            expect(selectAllCheckbox.indeterminate).toBe(false);
        });
    });
});