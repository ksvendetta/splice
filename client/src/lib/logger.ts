import { db } from './db';
import type { Log } from '@/../../shared/schema';
import { nanoid } from 'nanoid';

export type LogLevel = 'info' | 'warning' | 'error';
export type LogCategory = 'cable' | 'circuit' | 'ocr' | 'file' | 'system';

interface LogOptions {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
}

class Logger {
  private maxLogs = 1000;
  private maxAgeDays = 7;

  /**
   * Log a message to IndexedDB
   */
  async log({ level, category, message, data }: LogOptions): Promise<void> {
    try {
      const logEntry: Log = {
        id: nanoid(),
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        data: data ? JSON.stringify(data) : null,
      };

      await db.logs.add(logEntry);

      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        const consoleMethod = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
        consoleMethod(`[${category.toUpperCase()}]`, message, data || '');
      }

      // Cleanup old logs (run occasionally, not every time)
      if (Math.random() < 0.1) {
        await this.cleanup();
      }
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  /**
   * Log info message
   */
  async info(category: LogCategory, message: string, data?: any): Promise<void> {
    await this.log({ level: 'info', category, message, data });
  }

  /**
   * Log warning message
   */
  async warning(category: LogCategory, message: string, data?: any): Promise<void> {
    await this.log({ level: 'warning', category, message, data });
  }

  /**
   * Log error message
   */
  async error(category: LogCategory, message: string, data?: any): Promise<void> {
    await this.log({ level: 'error', category, message, data });
  }

  /**
   * Get all logs sorted by timestamp (newest first)
   */
  async getAllLogs(): Promise<Log[]> {
    return await db.logs.orderBy('timestamp').reverse().toArray();
  }

  /**
   * Get logs filtered by level
   */
  async getLogsByLevel(level: LogLevel): Promise<Log[]> {
    return await db.logs.where('level').equals(level).reverse().sortBy('timestamp');
  }

  /**
   * Get logs filtered by category
   */
  async getLogsByCategory(category: LogCategory): Promise<Log[]> {
    return await db.logs.where('category').equals(category).reverse().sortBy('timestamp');
  }

  /**
   * Clear all logs
   */
  async clearAllLogs(): Promise<void> {
    await db.logs.clear();
    console.log('All logs cleared');
  }

  /**
   * Export logs as JSON string
   */
  async exportLogs(): Promise<string> {
    const logs = await this.getAllLogs();
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Cleanup old logs
   * - Keep only last 1000 logs
   * - Delete logs older than 7 days
   */
  private async cleanup(): Promise<void> {
    try {
      // Delete logs older than maxAgeDays
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.maxAgeDays);
      const cutoffTimestamp = cutoffDate.toISOString();

      await db.logs.where('timestamp').below(cutoffTimestamp).delete();

      // Keep only the last maxLogs entries
      const allLogs = await db.logs.orderBy('timestamp').reverse().toArray();
      if (allLogs.length > this.maxLogs) {
        const logsToDelete = allLogs.slice(this.maxLogs);
        await Promise.all(logsToDelete.map(log => db.logs.delete(log.id)));
      }
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
    }
  }
}

// Export singleton instance
export const logger = new Logger();
