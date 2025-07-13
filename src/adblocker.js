// Ad Blocker Manager
const fs = require('fs').promises;
const path = require('path');
const { net } = require('electron');

class AdBlocker {
    constructor(settingsManager) {
        this.settings = settingsManager;
        this.blockedDomains = new Set();
        this.blockedPatterns = [];
        this.blockedRequests = 0;
        this.enabled = this.settings.get('adBlocker');
        this.filterListsDir = path.join(__dirname, 'filterlists');
        
        this.init();
    }

    async init() {
        await this.loadFilterLists();
        this.updateFilters();
    }

    async loadFilterLists() {
        try {
            await fs.mkdir(this.filterListsDir, { recursive: true });
            
            // Check if filter lists exist, if not download them
            const easyListPath = path.join(this.filterListsDir, 'easylist.txt');
            const easyPrivacyPath = path.join(this.filterListsDir, 'easyprivacy.txt');
            
            try {
                await fs.access(easyListPath);
            } catch {
                await this.downloadFilterList(
                    'https://easylist.to/easylist/easylist.txt',
                    easyListPath
                );
            }

            try {
                await fs.access(easyPrivacyPath);
            } catch {
                await this.downloadFilterList(
                    'https://easylist.to/easylist/easyprivacy.txt',
                    easyPrivacyPath
                );
            }

            // Load filter lists
            await this.parseFilterList(easyListPath);
            await this.parseFilterList(easyPrivacyPath);
            
        } catch (error) {
            console.warn('Failed to load ad blocker filter lists:', error.message);
            // Fallback to basic blocking rules
            this.loadBasicRules();
        }
    }

    async downloadFilterList(url, filePath) {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(url);
            const content = await response.text();
            await fs.writeFile(filePath, content, 'utf8');
        } catch (error) {
            console.warn(`Failed to download filter list from ${url}:`, error.message);
        }
    }

    async parseFilterList(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                // Skip comments and empty lines
                if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) {
                    continue;
                }
                
                // Parse blocking rules
                if (trimmed.startsWith('||')) {
                    // Domain blocking rule
                    const domain = trimmed.substring(2).split('^')[0];
                    this.blockedDomains.add(domain);
                } else if (trimmed.includes('##')) {
                    // Element hiding rule (we'll skip these for now)
                    continue;
                } else if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
                    // Regex pattern
                    try {
                        const pattern = new RegExp(trimmed.slice(1, -1));
                        this.blockedPatterns.push(pattern);
                    } catch (e) {
                        // Invalid regex, skip
                    }
                } else {
                    // Simple pattern
                    this.blockedPatterns.push(trimmed);
                }
            }
        } catch (error) {
            console.warn(`Failed to parse filter list ${filePath}:`, error.message);
        }
    }

    loadBasicRules() {
        // Basic ad-serving domains
        const basicBlockList = [
            'doubleclick.net',
            'googleadservices.com',
            'googlesyndication.com',
            'googletagmanager.com',
            'googletagservices.com',
            'google-analytics.com',
            'facebook.com/tr',
            'connect.facebook.net',
            'amazon-adsystem.com',
            'ads.yahoo.com',
            'advertising.com',
            'adsystem.net',
            'adsenser.com',
            'outbrain.com',
            'taboola.com',
            'addthis.com',
            'scorecardresearch.com',
            'quantserve.com'
        ];

        basicBlockList.forEach(domain => this.blockedDomains.add(domain));
    }

    shouldBlockRequest(url) {
        if (!this.enabled) return false;

        try {
            const urlObj = new URL(url);
            
            // Check blocked domains
            for (const domain of this.blockedDomains) {
                if (urlObj.hostname.includes(domain)) {
                    this.blockedRequests++;
                    return true;
                }
            }

            // Check blocked patterns
            for (const pattern of this.blockedPatterns) {
                if (typeof pattern === 'string') {
                    if (url.includes(pattern)) {
                        this.blockedRequests++;
                        return true;
                    }
                } else if (pattern instanceof RegExp) {
                    if (pattern.test(url)) {
                        this.blockedRequests++;
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    enable() {
        this.enabled = true;
        this.settings.set('adBlocker', true);
    }

    disable() {
        this.enabled = false;
        this.settings.set('adBlocker', false);
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.enabled;
    }

    getStats() {
        return {
            enabled: this.enabled,
            blockedRequests: this.blockedRequests,
            blockedDomains: this.blockedDomains.size,
            blockedPatterns: this.blockedPatterns.length
        };
    }

    async updateFilters() {
        // Update filter lists (can be called periodically)
        try {
            const easyListPath = path.join(this.filterListsDir, 'easylist.txt');
            const easyPrivacyPath = path.join(this.filterListsDir, 'easyprivacy.txt');
            
            // Clear existing rules
            this.blockedDomains.clear();
            this.blockedPatterns = [];
            
            // Download fresh lists
            await this.downloadFilterList(
                'https://easylist.to/easylist/easylist.txt',
                easyListPath
            );
            await this.downloadFilterList(
                'https://easylist.to/easylist/easyprivacy.txt',
                easyPrivacyPath
            );
            
            // Parse updated lists
            await this.parseFilterList(easyListPath);
            await this.parseFilterList(easyPrivacyPath);
            
        } catch (error) {
            console.warn('Failed to update ad blocker filters:', error.message);
        }
    }

    // Content blocking script injection
    getContentBlockingScript() {
        return `
            (function() {
                // Block known ad containers
                const adSelectors = [
                    '[id*="ad"]', '[class*="ad"]', '[id*="banner"]', '[class*="banner"]',
                    '[id*="popup"]', '[class*="popup"]', '[data-ad-slot]',
                    '.advertisement', '.ads', '.ad-container', '.sponsored',
                    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]'
                ];
                
                function blockAds() {
                    adSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            if (el && el.parentNode) {
                                el.style.display = 'none';
                                el.style.visibility = 'hidden';
                                el.style.opacity = '0';
                                el.style.width = '0';
                                el.style.height = '0';
                            }
                        });
                    });
                }
                
                // Run immediately and on DOM changes
                blockAds();
                
                if (window.MutationObserver) {
                    const observer = new MutationObserver(blockAds);
                    observer.observe(document.body || document.documentElement, {
                        childList: true,
                        subtree: true
                    });
                }
                
                // Block common ad networks
                const originalFetch = window.fetch;
                window.fetch = function(...args) {
                    const url = args[0];
                    if (typeof url === 'string') {
                        const blockedDomains = ['doubleclick.net', 'googlesyndication.com', 'googletagmanager.com'];
                        for (const domain of blockedDomains) {
                            if (url.includes(domain)) {
                                return Promise.reject(new Error('Blocked by ad blocker'));
                            }
                        }
                    }
                    return originalFetch.apply(this, args);
                };
            })();
        `;
    }
}

module.exports = AdBlocker;