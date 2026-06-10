import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Create a local EventEmitter class for testing (since it's not exported)
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

describe('EventEmitter', () => {
  let emitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    // Clear all listeners from singleton appEvents
    appEvents.events = {};
  });

  describe('Event Registration (on)', () => {
    it('should register a listener for an event', async () => {
      const listener = jest.fn();
      
      emitter.on('test-event', listener);
      
      expect(emitter.events['test-event']).toContain(listener);
    });

    it('should create event array if it does not exist', async () => {
      const listener = jest.fn();
      
      expect(emitter.events['new-event']).toBeUndefined();
      
      emitter.on('new-event', listener);
      
      expect(emitter.events['new-event']).toBeDefined();
      expect(emitter.events['new-event']).toHaveLength(1);
    });

    it('should register multiple listeners for the same event', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.on('test-event', listener3);
      
      expect(emitter.events['test-event']).toHaveLength(3);
      expect(emitter.events['test-event']).toContain(listener1);
      expect(emitter.events['test-event']).toContain(listener2);
      expect(emitter.events['test-event']).toContain(listener3);
    });

    it('should register listeners for different events independently', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('event-1', listener1);
      emitter.on('event-2', listener2);
      
      expect(emitter.events['event-1']).toContain(listener1);
      expect(emitter.events['event-1']).not.toContain(listener2);
      expect(emitter.events['event-2']).toContain(listener2);
      expect(emitter.events['event-2']).not.toContain(listener1);
    });

    it('should return an unsubscribe function', async () => {
      const listener = jest.fn();
      
      const unsubscribe = emitter.on('test-event', listener);
      
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('Event Emission (emit)', () => {
    it('should call all registered listeners when event is emitted', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      
      emitter.emit('test-event');
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should pass data to listeners', async () => {
      const listener = jest.fn();
      const testData = { id: 123, name: 'Test' };
      
      emitter.on('test-event', listener);
      emitter.emit('test-event', testData);
      
      expect(listener).toHaveBeenCalledWith(testData);
    });

    it('should handle emitting non-existent event gracefully', async () => {
      expect(() => {
        emitter.emit('non-existent-event');
      }).not.toThrow();
    });

    it('should not call listeners for different events', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('event-1', listener1);
      emitter.on('event-2', listener2);
      
      emitter.emit('event-1');
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should call listeners in order of registration', async () => {
      const callOrder = [];
      const listener1 = jest.fn(() => callOrder.push(1));
      const listener2 = jest.fn(() => callOrder.push(2));
      const listener3 = jest.fn(() => callOrder.push(3));
      
      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.on('test-event', listener3);
      
      emitter.emit('test-event');
      
      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should handle listener errors gracefully and continue executing other listeners', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const listener1 = jest.fn(() => {
        throw new Error('Listener 1 error');
      });
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.on('test-event', listener3);
      
      emitter.emit('test-event');
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in event listener for test-event:'),
        expect.any(Error),
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should allow same listener to be called multiple times for multiple emissions', async () => {
      const listener = jest.fn();
      
      emitter.on('test-event', listener);
      
      emitter.emit('test-event', 'data1');
      emitter.emit('test-event', 'data2');
      emitter.emit('test-event', 'data3');
      
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, 'data1');
      expect(listener).toHaveBeenNthCalledWith(2, 'data2');
      expect(listener).toHaveBeenNthCalledWith(3, 'data3');
    });
  });

  describe('Event Unsubscription (unsubscribe function)', () => {
    it('should remove listener when unsubscribe function is called', async () => {
      const listener = jest.fn();
      
      const unsubscribe = emitter.on('test-event', listener);
      expect(emitter.events['test-event']).toContain(listener);
      
      unsubscribe();
      
      expect(emitter.events['test-event']).not.toContain(listener);
    });

    it('should not call listener after unsubscribing', async () => {
      const listener = jest.fn();
      
      const unsubscribe = emitter.on('test-event', listener);
      emitter.emit('test-event');
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      emitter.emit('test-event');
      
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should only remove the specific listener, not others', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      const unsubscribe1 = emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.on('test-event', listener3);
      
      unsubscribe1();
      emitter.emit('test-event');
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should handle calling unsubscribe multiple times gracefully', async () => {
      const listener = jest.fn();
      
      const unsubscribe = emitter.on('test-event', listener);
      
      expect(() => {
        unsubscribe();
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });

    it('should work correctly when unsubscribing during event emission', async () => {
      const listener1 = jest.fn();
      let unsubscribe2;
      const listener2 = jest.fn(() => {
        unsubscribe2(); // Unsubscribe self during execution
      });
      const listener3 = jest.fn();
      
      emitter.on('test-event', listener1);
      unsubscribe2 = emitter.on('test-event', listener2);
      emitter.on('test-event', listener3);
      
      emitter.emit('test-event');
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
      
      // Second emission should not call listener2
      emitter.emit('test-event');
      
      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(1); // Still 1
      expect(listener3).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Unsubscription (off method)', () => {
    it('should remove listener using off method', async () => {
      const listener = jest.fn();
      
      emitter.on('test-event', listener);
      expect(emitter.events['test-event']).toContain(listener);
      
      emitter.off('test-event', listener);
      
      expect(emitter.events['test-event']).not.toContain(listener);
    });

    it('should handle removing listener from non-existent event gracefully', async () => {
      const listener = jest.fn();
      
      expect(() => {
        emitter.off('non-existent-event', listener);
      }).not.toThrow();
    });

    it('should handle removing non-existent listener gracefully', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      emitter.on('test-event', listener1);
      
      expect(() => {
        emitter.off('test-event', listener2);
      }).not.toThrow();
      
      expect(emitter.events['test-event']).toContain(listener1);
    });

    it('should only remove specified listener, not all listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.on('test-event', listener3);
      
      emitter.off('test-event', listener2);
      
      expect(emitter.events['test-event']).toHaveLength(2);
      expect(emitter.events['test-event']).toContain(listener1);
      expect(emitter.events['test-event']).not.toContain(listener2);
      expect(emitter.events['test-event']).toContain(listener3);
    });
  });

  describe('Singleton Instance (appEvents)', () => {
    it('should export a singleton instance', async () => {
      expect(appEvents).toBeDefined();
      expect(typeof appEvents.on).toBe('function');
      expect(typeof appEvents.emit).toBe('function');
      expect(typeof appEvents.off).toBe('function');
    });

    it('should maintain state across multiple imports', async () => {
      const listener = jest.fn();
      
      appEvents.on('singleton-test', listener);
      appEvents.emit('singleton-test', 'test-data');
      
      expect(listener).toHaveBeenCalledWith('test-data');
    });

    it('should have independent events from new instances', async () => {
      const newEmitter = new EventEmitter();
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      appEvents.on('test-event', listener1);
      newEmitter.on('test-event', listener2);
      
      appEvents.emit('test-event');
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('Event Constants (EVENTS)', () => {
    it('should export DATABASE_RESET event constant', async () => {
      expect(EVENTS.DATABASE_RESET).toBe('database:reset');
    });

    it('should export RELOAD_ALL event constant', async () => {
      expect(EVENTS.RELOAD_ALL).toBe('reload:all');
    });

    it('should export OPERATION_CHANGED event constant', async () => {
      expect(EVENTS.OPERATION_CHANGED).toBe('operation:changed');
    });

    it('should export BUDGETS_NEED_REFRESH event constant', async () => {
      expect(EVENTS.BUDGETS_NEED_REFRESH).toBe('budgets:refresh');
    });

    it('should allow using constants with appEvents', async () => {
      const listener = jest.fn();
      
      appEvents.on(EVENTS.DATABASE_RESET, listener);
      appEvents.emit(EVENTS.DATABASE_RESET, { reason: 'test' });
      
      expect(listener).toHaveBeenCalledWith({ reason: 'test' });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined data in emit', async () => {
      const listener = jest.fn();
      
      emitter.on('test-event', listener);
      emitter.emit('test-event', undefined);
      
      expect(listener).toHaveBeenCalledWith(undefined);
    });

    it('should handle null data in emit', async () => {
      const listener = jest.fn();
      
      emitter.on('test-event', listener);
      emitter.emit('test-event', null);
      
      expect(listener).toHaveBeenCalledWith(null);
    });

    it('should handle complex data structures', async () => {
      const listener = jest.fn();
      const complexData = {
        nested: {
          data: {
            array: [1, 2, 3],
            string: 'test',
            boolean: true,
          },
        },
        callback: () => {},
      };
      
      emitter.on('test-event', listener);
      emitter.emit('test-event', complexData);
      
      expect(listener).toHaveBeenCalledWith(complexData);
    });

    it('should handle rapid successive emissions', async () => {
      const listener = jest.fn();
      
      emitter.on('test-event', listener);
      
      for (let i = 0; i < 100; i++) {
        emitter.emit('test-event', i);
      }
      
      expect(listener).toHaveBeenCalledTimes(100);
    });

    it('should handle many listeners for same event', async () => {
      const listeners = [];
      
      for (let i = 0; i < 50; i++) {
        const listener = jest.fn();
        listeners.push(listener);
        emitter.on('test-event', listener);
      }
      
      emitter.emit('test-event');
      
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle async listeners without issues', async () => {
      const results = [];
      const asyncListener1 = jest.fn(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(`listener1-${data}`);
      });
      const asyncListener2 = jest.fn(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push(`listener2-${data}`);
      });
      
      emitter.on('test-event', asyncListener1);
      emitter.on('test-event', asyncListener2);
      
      emitter.emit('test-event', 'test');
      
      expect(asyncListener1).toHaveBeenCalled();
      expect(asyncListener2).toHaveBeenCalled();
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(results).toHaveLength(2);
      expect(results).toContain('listener1-test');
      expect(results).toContain('listener2-test');
    });
  });

  describe('Real-World Usage Patterns', () => {
    it('should support typical reload pattern', async () => {
      const reloadAccounts = jest.fn();
      const reloadOperations = jest.fn();
      const reloadCategories = jest.fn();
      
      appEvents.on(EVENTS.RELOAD_ALL, reloadAccounts);
      appEvents.on(EVENTS.RELOAD_ALL, reloadOperations);
      appEvents.on(EVENTS.RELOAD_ALL, reloadCategories);
      
      appEvents.emit(EVENTS.RELOAD_ALL);
      
      expect(reloadAccounts).toHaveBeenCalled();
      expect(reloadOperations).toHaveBeenCalled();
      expect(reloadCategories).toHaveBeenCalled();
    });

    it('should support operation change notifications', async () => {
      const updateBudgets = jest.fn();
      const refreshGraphs = jest.fn();
      
      appEvents.on(EVENTS.OPERATION_CHANGED, updateBudgets);
      appEvents.on(EVENTS.OPERATION_CHANGED, refreshGraphs);
      
      const operationData = { operationId: '123', accountId: '456' };
      appEvents.emit(EVENTS.OPERATION_CHANGED, operationData);
      
      expect(updateBudgets).toHaveBeenCalledWith(operationData);
      expect(refreshGraphs).toHaveBeenCalledWith(operationData);
    });

    it('should support cleanup pattern with unsubscribe', async () => {
      const listener = jest.fn();
      
      const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, listener);
      
      appEvents.emit(EVENTS.DATABASE_RESET);
      expect(listener).toHaveBeenCalledTimes(1);
      
      // Cleanup
      unsubscribe();
      
      appEvents.emit(EVENTS.DATABASE_RESET);
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should support multiple event types for same listener', async () => {
      const refreshUI = jest.fn();
      
      appEvents.on(EVENTS.DATABASE_RESET, refreshUI);
      appEvents.on(EVENTS.RELOAD_ALL, refreshUI);
      appEvents.on(EVENTS.OPERATION_CHANGED, refreshUI);
      
      appEvents.emit(EVENTS.DATABASE_RESET);
      expect(refreshUI).toHaveBeenCalledTimes(1);
      
      appEvents.emit(EVENTS.RELOAD_ALL);
      expect(refreshUI).toHaveBeenCalledTimes(2);
      
      appEvents.emit(EVENTS.OPERATION_CHANGED);
      expect(refreshUI).toHaveBeenCalledTimes(3);
    });
  });

  describe('Memory Management', () => {
    it('should allow garbage collection of unsubscribed listeners', async () => {
      let listener = jest.fn();
      const weakRef = new WeakRef(listener);
      
      const unsubscribe = emitter.on('test-event', listener);
      unsubscribe();
      
      listener = null; // Remove strong reference
      
      // The listener should no longer be in the events array
      expect(emitter.events['test-event']).toHaveLength(0);
    });

    it('should not accumulate listeners after repeated subscribe/unsubscribe', async () => {
      for (let i = 0; i < 100; i++) {
        const listener = jest.fn();
        const unsubscribe = emitter.on('test-event', listener);
        unsubscribe();
      }

      expect(emitter.events['test-event']).toHaveLength(0);
    });
  });

  describe('appEvents singleton - uncovered paths', () => {
    it('appEvents.emit catches and logs listener errors without stopping other listeners', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const throwingListener = jest.fn(() => { throw new Error('boom'); });
      const normalListener = jest.fn();

      appEvents.on('err-test', throwingListener);
      appEvents.on('err-test', normalListener);

      expect(() => appEvents.emit('err-test')).not.toThrow();

      expect(throwingListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in event listener for err-test:'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('appEvents.off on a non-existent event does not throw', async () => {
      expect(() => appEvents.off('does-not-exist', jest.fn())).not.toThrow();
    });

    it('appEvents.off removes a specific listener from the singleton', async () => {
      const listener = jest.fn();
      appEvents.on('off-test', listener);
      appEvents.off('off-test', listener);
      appEvents.emit('off-test');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
