/**
 * Simple event emitter for coordinating actions across React contexts
 * Used primarily for triggering data reloads after database operations
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);

    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(l => l !== listener);
    };
  }

  emit(event, data) {
    if (!this.events[event]) {
      return;
    }
    this.events[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  off(event, listener) {
    if (!this.events[event]) {
      return;
    }
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
}

// Create singleton instance
export const appEvents = new EventEmitter();

// Event names
export const EVENTS = {
  DATABASE_RESET: 'database:reset',
  RELOAD_ALL: 'reload:all',
  OPERATION_CHANGED: 'operation:changed',
  BUDGETS_NEED_REFRESH: 'budgets:refresh',
};
