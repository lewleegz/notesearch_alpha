// Visit Analytics Manager
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

class VisitAnalytics {
    constructor(settingsManager) {
        this.settings = settingsManager;
        this.visits = [];
        this.sessions = [];
        this.currentSession = null;
        this.visitsFilePath = path.join(__dirname, 'visits.json');
        this.sessionsFilePath = path.join(__dirname, 'sessions.json');
        
        this.init();
    }

    async init() {
        await this.loadVisits();
        await this.loadSessions();
        this.startSession();
    }

    async loadVisits() {
        try {
            const data = await fs.readFile(this.visitsFilePath, 'utf8');
            this.visits = JSON.parse(data);
        } catch (error) {
            this.visits = [];
        }
    }

    async loadSessions() {
        try {
            const data = await fs.readFile(this.sessionsFilePath, 'utf8');
            this.sessions = JSON.parse(data);
        } catch (error) {
            this.sessions = [];
        }
    }

    async saveVisits() {
        try {
            await fs.writeFile(this.visitsFilePath, JSON.stringify(this.visits, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to save visits:', error);
        }
    }

    async saveSessions() {
        try {
            await fs.writeFile(this.sessionsFilePath, JSON.stringify(this.sessions, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to save sessions:', error);
        }
    }

    startSession() {
        this.currentSession = {
            id: Date.now().toString(),
            startTime: new Date().toISOString(),
            endTime: null,
            visitCount: 0,
            duration: 0,
            topSites: []
        };
    }

    async endSession() {
        if (this.currentSession) {
            this.currentSession.endTime = new Date().toISOString();
            this.currentSession.duration = new Date(this.currentSession.endTime).getTime() - 
                                         new Date(this.currentSession.startTime).getTime();
            this.sessions.push(this.currentSession);
            await this.saveSessions();
            this.currentSession = null;
        }
    }

    async recordVisit(url, title = '', duration = 0) {
        try {
            const urlObj = new URL(url);
            
            // Skip certain URLs
            if (url === 'about:blank' || 
                urlObj.protocol === 'file:' || 
                urlObj.hostname === 'localhost' ||
                url.includes('chrome-extension://')) {
                return;
            }

            const domain = urlObj.hostname.replace(/^www\./, '');
            const visitData = {
                url: url,
                domain: domain,
                title: title || domain,
                timestamp: new Date().toISOString(),
                duration: duration,
                sessionId: this.currentSession?.id || 'unknown'
            };

            // Find existing visit for this URL
            const existingVisitIndex = this.visits.findIndex(visit => visit.url === url);
            
            if (existingVisitIndex !== -1) {
                // Update existing visit
                this.visits[existingVisitIndex].lastVisit = visitData.timestamp;
                this.visits[existingVisitIndex].visitCount = (this.visits[existingVisitIndex].visitCount || 1) + 1;
                this.visits[existingVisitIndex].totalDuration = (this.visits[existingVisitIndex].totalDuration || 0) + duration;
                this.visits[existingVisitIndex].title = title || this.visits[existingVisitIndex].title;
            } else {
                // Create new visit record
                visitData.firstVisit = visitData.timestamp;
                visitData.lastVisit = visitData.timestamp;
                visitData.visitCount = 1;
                visitData.totalDuration = duration;
                this.visits.push(visitData);
            }

            // Update current session
            if (this.currentSession) {
                this.currentSession.visitCount++;
            }

            // Limit visits array to prevent it from growing too large
            if (this.visits.length > 10000) {
                this.visits = this.visits.slice(-5000);
            }

            await this.saveVisits();
            
        } catch (error) {
            console.error('Failed to record visit:', error);
        }
    }

    getMostVisitedSites(limit = 10) {
        // Group by domain and calculate metrics
        const domainStats = {};
        
        this.visits.forEach(visit => {
            if (!domainStats[visit.domain]) {
                domainStats[visit.domain] = {
                    domain: visit.domain,
                    title: visit.title,
                    url: this.getBestUrlForDomain(visit.domain),
                    visitCount: 0,
                    totalDuration: 0,
                    lastVisit: visit.lastVisit,
                    favicon: this.getFaviconUrl(visit.domain),
                    score: 0
                };
            }

            domainStats[visit.domain].visitCount += (visit.visitCount || 1);
            domainStats[visit.domain].totalDuration += (visit.totalDuration || 0);
            
            // Keep the most recent title and URL
            if (new Date(visit.lastVisit) > new Date(domainStats[visit.domain].lastVisit)) {
                domainStats[visit.domain].lastVisit = visit.lastVisit;
                domainStats[visit.domain].title = visit.title;
                domainStats[visit.domain].url = visit.url;
            }
        });

        // Calculate weighted score (visits + recency + duration)
        const now = new Date().getTime();
        const weekInMs = 7 * 24 * 60 * 60 * 1000;

        Object.values(domainStats).forEach(site => {
            const recencyScore = Math.max(0, weekInMs - (now - new Date(site.lastVisit).getTime())) / weekInMs;
            const durationScore = Math.min(site.totalDuration / 60000, 30) / 30; // Max 30 minutes
            
            site.score = (site.visitCount * 2) + (recencyScore * 10) + (durationScore * 5);
        });

        // Sort by score and return top sites
        return Object.values(domainStats)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(site => ({
                domain: site.domain,
                title: site.title || site.domain,
                url: site.url,
                visitCount: site.visitCount,
                favicon: site.favicon,
                lastVisit: site.lastVisit
            }));
    }

    getBestUrlForDomain(domain) {
        // Find the most visited URL for this domain
        const domainVisits = this.visits.filter(visit => visit.domain === domain);
        if (domainVisits.length === 0) return `https://${domain}`;

        const urlCounts = {};
        domainVisits.forEach(visit => {
            urlCounts[visit.url] = (urlCounts[visit.url] || 0) + (visit.visitCount || 1);
        });

        const mostVisitedUrl = Object.entries(urlCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0];
        
        return mostVisitedUrl || `https://${domain}`;
    }

    getFaviconUrl(domain) {
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    }

    getRecentlyVisited(limit = 20) {
        return this.visits
            .sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime())
            .slice(0, limit)
            .map(visit => ({
                url: visit.url,
                title: visit.title,
                domain: visit.domain,
                lastVisit: visit.lastVisit,
                favicon: this.getFaviconUrl(visit.domain)
            }));
    }

    getVisitsByTimeRange(startDate, endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        
        return this.visits.filter(visit => {
            const visitTime = new Date(visit.timestamp).getTime();
            return visitTime >= start && visitTime <= end;
        });
    }

    getTopDomainsByDay(days = 7) {
        const result = {};
        const now = new Date();
        
        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayStart = new Date(date.setHours(0, 0, 0, 0));
            const dayEnd = new Date(date.setHours(23, 59, 59, 999));
            
            const dayVisits = this.getVisitsByTimeRange(dayStart, dayEnd);
            const domainCounts = {};
            
            dayVisits.forEach(visit => {
                domainCounts[visit.domain] = (domainCounts[visit.domain] || 0) + (visit.visitCount || 1);
            });
            
            result[dateStr] = Object.entries(domainCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([domain, count]) => ({ domain, count }));
        }
        
        return result;
    }

    getBrowsingStats() {
        const totalVisits = this.visits.reduce((sum, visit) => sum + (visit.visitCount || 1), 0);
        const totalTime = this.visits.reduce((sum, visit) => sum + (visit.totalDuration || 0), 0);
        const uniqueDomains = new Set(this.visits.map(visit => visit.domain)).size;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayVisits = this.visits.filter(visit => 
            new Date(visit.lastVisit) >= today
        );
        
        return {
            totalVisits,
            totalTime: Math.round(totalTime / 1000), // Convert to seconds
            uniqueDomains,
            todayVisits: todayVisits.length,
            averageSessionTime: totalTime / this.sessions.length || 0,
            topDomain: this.getMostVisitedSites(1)[0]?.domain || 'None'
        };
    }

    clearOldVisits(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        this.visits = this.visits.filter(visit => 
            new Date(visit.lastVisit) >= cutoffDate
        );
        
        this.sessions = this.sessions.filter(session =>
            new Date(session.startTime) >= cutoffDate
        );
        
        this.saveVisits();
        this.saveSessions();
    }

    exportData() {
        return {
            visits: this.visits,
            sessions: this.sessions,
            stats: this.getBrowsingStats(),
            mostVisited: this.getMostVisitedSites(20),
            exportDate: new Date().toISOString()
        };
    }

    async importData(data) {
        if (data.visits) {
            this.visits = [...this.visits, ...data.visits];
        }
        if (data.sessions) {
            this.sessions = [...this.sessions, ...data.sessions];
        }
        
        await this.saveVisits();
        await this.saveSessions();
    }
}

module.exports = VisitAnalytics;