import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ReviewMetadata {
  id: string;
  filename: string;
  path: string;
  type: "diff" | "ai_review";
  timestamp: Date;
  branch: string;
  repository: string;
  aiProvider?: string;
  aiModel?: string;
  reviewDepth?: string;
  focusArea?: string;
  fileCount: number;
  linesAdded: number;
  linesDeleted: number;
  summary?: string;
  tags: string[];
}

export interface ReviewSession {
  id: string;
  timestamp: Date;
  reviews: ReviewMetadata[];
  workspacePath: string;
  repository: string;
  branch: string;
}

export class ReviewStorage {
  private static readonly STORAGE_KEY = 'reviewer.reviewHistory';
  private static readonly SESSION_KEY = 'reviewer.currentSession';
  private static readonly MAX_REVIEWS = 100;
  private static readonly MAX_SESSIONS = 20;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Save a new review to persistent storage
   */
  async saveReview(reviewData: Omit<ReviewMetadata, 'id' | 'timestamp'>): Promise<ReviewMetadata> {
    const review: ReviewMetadata = {
      id: this.generateId(),
      timestamp: new Date(),
      ...reviewData
    };

    // Save to global storage
    await this.addToHistory(review);

    // Add to current session
    await this.addToCurrentSession(review);

    return review;
  }

  /**
   * Get all reviews from storage
   */
  async getAllReviews(): Promise<ReviewMetadata[]> {
    const reviews = this.context.globalState.get<ReviewMetadata[]>(ReviewStorage.STORAGE_KEY, []);

    // Convert date strings back to Date objects
    return reviews.map(review => ({
      ...review,
      timestamp: new Date(review.timestamp)
    })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get reviews for specific repository
   */
  async getReviewsByRepository(repository: string): Promise<ReviewMetadata[]> {
    const allReviews = await this.getAllReviews();
    return allReviews.filter(review => review.repository === repository);
  }

  /**
   * Get reviews for specific branch
   */
  async getReviewsByBranch(repository: string, branch: string): Promise<ReviewMetadata[]> {
    const repoReviews = await this.getReviewsByRepository(repository);
    return repoReviews.filter(review => review.branch === branch);
  }

  /**
   * Search reviews by content
   */
  async searchReviews(query: string): Promise<ReviewMetadata[]> {
    const allReviews = await this.getAllReviews();
    const lowerQuery = query.toLowerCase();

    return allReviews.filter(review =>
      review.filename.toLowerCase().includes(lowerQuery) ||
      review.branch.toLowerCase().includes(lowerQuery) ||
      review.repository.toLowerCase().includes(lowerQuery) ||
      review.summary?.toLowerCase().includes(lowerQuery) ||
      review.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get reviews by date range
   */
  async getReviewsByDateRange(startDate: Date, endDate: Date): Promise<ReviewMetadata[]> {
    const allReviews = await this.getAllReviews();
    return allReviews.filter(review =>
      review.timestamp >= startDate && review.timestamp <= endDate
    );
  }

  /**
   * Get reviews by type
   */
  async getReviewsByType(type: 'diff' | 'ai_review'): Promise<ReviewMetadata[]> {
    const allReviews = await this.getAllReviews();
    return allReviews.filter(review => review.type === type);
  }

  /**
   * Delete a review
   */
  async deleteReview(reviewId: string): Promise<void> {
    const reviews = await this.getAllReviews();
    const updatedReviews = reviews.filter(review => review.id !== reviewId);
    await this.context.globalState.update(ReviewStorage.STORAGE_KEY, updatedReviews);

    // Also delete the physical file if it exists
    const review = reviews.find(r => r.id === reviewId);
    if (review && fs.existsSync(review.path)) {
      try {
        fs.unlinkSync(review.path);
      } catch (error) {
        console.error('Failed to delete review file:', error);
      }
    }
  }

  /**
   * Clear all reviews
   */
  async clearAllReviews(): Promise<void> {
    await this.context.globalState.update(ReviewStorage.STORAGE_KEY, []);
    await this.context.globalState.update(ReviewStorage.SESSION_KEY, []);
  }

  /**
   * Get review statistics
   */
  async getReviewStatistics(): Promise<{
    totalReviews: number;
    reviewsByType: { diff: number; ai_review: number };
    reviewsByProvider: Record<string, number>;
    averageReviewsPerDay: number;
    mostActiveRepository: string;
    mostActiveBranch: string;
    recentActivity: { date: string; count: number }[];
  }> {
    const reviews = await this.getAllReviews();

    const reviewsByType = {
      diff: reviews.filter(r => r.type === 'diff').length,
      ai_review: reviews.filter(r => r.type === 'ai_review').length
    };

    const reviewsByProvider: Record<string, number> = {};
    reviews.forEach(review => {
      if (review.aiProvider) {
        reviewsByProvider[review.aiProvider] = (reviewsByProvider[review.aiProvider] || 0) + 1;
      }
    });

    // Calculate average reviews per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentReviews = reviews.filter(r => r.timestamp >= thirtyDaysAgo);
    const averageReviewsPerDay = recentReviews.length / 30;

    // Most active repository
    const repoCount: Record<string, number> = {};
    reviews.forEach(review => {
      repoCount[review.repository] = (repoCount[review.repository] || 0) + 1;
    });
    const mostActiveRepository = Object.entries(repoCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None';

    // Most active branch
    const branchCount: Record<string, number> = {};
    reviews.forEach(review => {
      branchCount[review.branch] = (branchCount[review.branch] || 0) + 1;
    });
    const mostActiveBranch = Object.entries(branchCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None';

    // Recent activity (last 7 days)
    const recentActivity: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayReviews = reviews.filter(r =>
        r.timestamp >= dayStart && r.timestamp <= dayEnd
      );

      recentActivity.push({
        date: dateStr,
        count: dayReviews.length
      });
    }

    return {
      totalReviews: reviews.length,
      reviewsByType,
      reviewsByProvider,
      averageReviewsPerDay,
      mostActiveRepository,
      mostActiveBranch,
      recentActivity
    };
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<ReviewSession | null> {
    const session = this.context.globalState.get<ReviewSession>(ReviewStorage.SESSION_KEY);
    return session ? {
      ...session,
      timestamp: new Date(session.timestamp),
      reviews: session.reviews.map(review => ({
        ...review,
        timestamp: new Date(review.timestamp)
      }))
    } : null;
  }

  /**
   * Start a new session
   */
  async startNewSession(workspacePath: string, repository: string, branch: string): Promise<ReviewSession> {
    const session: ReviewSession = {
      id: this.generateId(),
      timestamp: new Date(),
      reviews: [],
      workspacePath,
      repository,
      branch
    };

    await this.context.globalState.update(ReviewStorage.SESSION_KEY, session);
    return session;
  }

  /**
   * Export reviews to file
   */
  async exportReviews(filePath: string, filters?: {
    repository?: string;
    branch?: string;
    type?: 'diff' | 'ai_review';
    startDate?: Date;
    endDate?: Date;
  }): Promise<void> {
    let reviews = await this.getAllReviews();

    // Apply filters
    if (filters) {
      if (filters.repository) {
        reviews = reviews.filter(r => r.repository === filters.repository);
      }
      if (filters.branch) {
        reviews = reviews.filter(r => r.branch === filters.branch);
      }
      if (filters.type) {
        reviews = reviews.filter(r => r.type === filters.type);
      }
      if (filters.startDate) {
        reviews = reviews.filter(r => r.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        reviews = reviews.filter(r => r.timestamp <= filters.endDate!);
      }
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalReviews: reviews.length,
      filters,
      reviews: reviews.map(review => ({
        ...review,
        content: this.getReviewContent(review.path)
      }))
    };

    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
  }

  /**
   * Import reviews from file
   */
  async importReviews(filePath: string): Promise<number> {
    const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const reviews = importData.reviews || [];

    let imported = 0;
    for (const reviewData of reviews) {
      try {
        const review: ReviewMetadata = {
          ...reviewData,
          id: this.generateId(), // Generate new ID to avoid conflicts
          timestamp: new Date(reviewData.timestamp)
        };

        await this.addToHistory(review);
        imported++;
      } catch (error) {
        console.error('Failed to import review:', error);
      }
    }

    return imported;
  }

  private async addToHistory(review: ReviewMetadata): Promise<void> {
    const reviews = await this.getAllReviews();
    reviews.unshift(review);

    // Keep only the most recent reviews
    const trimmedReviews = reviews.slice(0, ReviewStorage.MAX_REVIEWS);

    await this.context.globalState.update(ReviewStorage.STORAGE_KEY, trimmedReviews);
  }

  private async addToCurrentSession(review: ReviewMetadata): Promise<void> {
    let session = await this.getCurrentSession();

    if (!session) {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
      session = await this.startNewSession(workspacePath, review.repository, review.branch);
    }

    session.reviews.unshift(review);
    await this.context.globalState.update(ReviewStorage.SESSION_KEY, session);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private getReviewContent(filePath: string): string | null {
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    } catch (error) {
      return null;
    }
  }
}