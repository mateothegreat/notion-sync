/**
 * Calculates accurate ETAs using speed history and trend analysis.
 */
export class ETACalculator {
  private startTime: Date = new Date();
  private lastUpdateTime: Date = new Date();
  private processedItems: number = 0;
  private totalItems: number = 0;
  private speedHistory: Array<{ timestamp: Date; speed: number }> = [];
  private readonly maxHistorySize: number;

  constructor(maxHistorySize: number = 10) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Initializes ETA calculation for a new operation.
   * @param totalItems - Total number of items to process.
   */
  start(totalItems: number): void {
    this.startTime = new Date();
    this.lastUpdateTime = this.startTime;
    this.totalItems = totalItems;
    this.processedItems = 0;
    this.speedHistory = [];
  }

  /**
   * Updates progress and calculates new ETA.
   * @param processedItems - Current number of processed items.
   * @returns ETA calculation results.
   */
  update(processedItems: number): {
    progress: number;
    eta: number;
    speed: number;
    timeElapsed: number;
  } {
    const now = new Date();
    const timeDelta = now.getTime() - this.lastUpdateTime.getTime();
    const itemsDelta = processedItems - this.processedItems;

    // Calculate current speed (items per second)
    const currentSpeed = timeDelta > 0 ? (itemsDelta / timeDelta) * 1000 : 0;

    // Update speed history with timestamp
    this.speedHistory.push({
      timestamp: now,
      speed: currentSpeed
    });

    // Remove old entries (keep only recent history)
    const cutoffTime = new Date(now.getTime() - 60000); // Last minute
    this.speedHistory = this.speedHistory.filter((entry) => entry.timestamp >= cutoffTime);

    // Limit history size
    if (this.speedHistory.length > this.maxHistorySize) {
      this.speedHistory = this.speedHistory.slice(-this.maxHistorySize);
    }

    // Calculate weighted average speed (recent entries weighted more)
    const avgSpeed = this.calculateWeightedAverageSpeed();

    // Calculate progress
    const progress = this.totalItems > 0 ? Math.min(processedItems / this.totalItems, 1) : 0;

    // Calculate ETA
    const remainingItems = this.totalItems - processedItems;
    const eta = avgSpeed > 0 ? (remainingItems / avgSpeed) * 1000 : -1;

    // Update state
    this.processedItems = processedItems;
    this.lastUpdateTime = now;

    return {
      progress,
      eta: eta === -1 ? -1 : Math.max(eta, 0),
      speed: avgSpeed,
      timeElapsed: now.getTime() - this.startTime.getTime()
    };
  }

  /**
   * Formats ETA in human-readable format.
   * @param eta - ETA in milliseconds.
   * @returns Formatted time string.
   */
  formatETA(eta: number): string {
    if (eta < 0) return "Unknown";

    const seconds = Math.floor(eta / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Gets current ETA confidence level (0-1).
   * @returns Confidence level based on data points and consistency.
   */
  getConfidence(): number {
    if (this.speedHistory.length < 3) return 0;

    // Calculate variance in speed
    const speeds = this.speedHistory.map((h) => h.speed);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = speeds.reduce((sum, speed) => sum + Math.pow(speed - avgSpeed, 2), 0) / speeds.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher confidence
    const cvScore = avgSpeed > 0 ? 1 - Math.min(stdDev / avgSpeed, 1) : 0;

    // More data points = higher confidence
    const dataScore = Math.min(this.speedHistory.length / 10, 1);

    // Progress completion = higher confidence
    const progressScore = this.totalItems > 0 ? this.processedItems / this.totalItems : 0;

    // Combined confidence score
    return cvScore * 0.4 + dataScore * 0.3 + progressScore * 0.3;
  }

  private calculateWeightedAverageSpeed(): number {
    if (this.speedHistory.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;
    const now = new Date();

    this.speedHistory.forEach((entry, index) => {
      // Weight recent entries more heavily
      const recencyWeight = Math.exp(-(now.getTime() - entry.timestamp.getTime()) / 30000); // 30 second decay
      const positionWeight = (index + 1) / this.speedHistory.length; // Later entries weighted more
      const weight = recencyWeight * positionWeight;

      weightedSum += entry.speed * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }
}
