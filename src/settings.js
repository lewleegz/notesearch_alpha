// Settings Manager
const Store = require('electron-store');

class SettingsManager {
    constructor() {
        this.store = new Store({
            defaults: {
                // Appearance
                theme: 'light', // light, dark, auto
                customTheme: {
                    primary: '#2563eb',
                    background: '#ffffff',
                    surface: '#f8fafc',
                    text: '#0f172a'
                },
                
                // Browser
                tabLayout: 'horizontal', // horizontal, vertical
                defaultZoom: 100,
                searchEngine: 'google', // google, bing, duckduckgo, custom
                customSearchUrl: '',
                homepage: 'start', // start, custom, blank
                customHomepage: '',
                
                // Privacy & Security
                adBlocker: true,
                vpnEnabled: false,
                vpnServer: 'auto',
                cookiePolicy: 'block-third-party', // allow-all, block-third-party, block-all
                
                // Features
                notesAutoSave: true,
                emailEnabled: false,
                emailProvider: '', // gmail, outlook, custom
                emailConfig: {},
                
                // Advanced
                extensions: [],
                developerMode: false,
                hardwareAcceleration: true,
                
                // Window
                windowBounds: {
                    width: 1400,
                    height: 900,
                    x: undefined,
                    y: undefined
                },
                maximized: false
            }
        });
    }

    get(key) {
        return this.store.get(key);
    }

    set(key, value) {
        this.store.set(key, value);
    }

    getAll() {
        return this.store.store;
    }

    reset() {
        this.store.clear();
    }

    // Theme management
    getTheme() {
        const theme = this.get('theme');
        if (theme === 'auto') {
            return require('electron').nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        }
        return theme;
    }

    getCustomTheme() {
        return this.get('customTheme');
    }

    // Search engine management
    getSearchUrl(query) {
        const engine = this.get('searchEngine');
        const searchEngines = {
            google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
            duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            custom: this.get('customSearchUrl').replace('%s', encodeURIComponent(query))
        };
        
        return searchEngines[engine] || searchEngines.google;
    }

    // VPN servers list
    getVpnServers() {
        return [
            { id: 'auto', name: 'Auto Select', country: 'AUTO', flag: '🌐' },
            { id: 'us-east', name: 'US East', country: 'US', flag: '🇺🇸' },
            { id: 'us-west', name: 'US West', country: 'US', flag: '🇺🇸' },
            { id: 'uk', name: 'United Kingdom', country: 'UK', flag: '🇬🇧' },
            { id: 'germany', name: 'Germany', country: 'DE', flag: '🇩🇪' },
            { id: 'japan', name: 'Japan', country: 'JP', flag: '🇯🇵' },
            { id: 'canada', name: 'Canada', country: 'CA', flag: '🇨🇦' },
            { id: 'australia', name: 'Australia', country: 'AU', flag: '🇦🇺' }
        ];
    }

    // Email providers
    getEmailProviders() {
        return [
            {
                id: 'gmail',
                name: 'Gmail',
                icon: 'fab fa-google',
                imap: { host: 'imap.gmail.com', port: 993, secure: true },
                smtp: { host: 'smtp.gmail.com', port: 587, secure: false }
            },
            {
                id: 'outlook',
                name: 'Outlook',
                icon: 'fab fa-microsoft',
                imap: { host: 'outlook.office365.com', port: 993, secure: true },
                smtp: { host: 'smtp.office365.com', port: 587, secure: false }
            },
            {
                id: 'yahoo',
                name: 'Yahoo',
                icon: 'fab fa-yahoo',
                imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
                smtp: { host: 'smtp.mail.yahoo.com', port: 587, secure: false }
            },
            {
                id: 'custom',
                name: 'Custom IMAP/SMTP',
                icon: 'fas fa-server',
                imap: { host: '', port: 993, secure: true },
                smtp: { host: '', port: 587, secure: false }
            }
        ];
    }

    // Extensions management
    addExtension(extension) {
        const extensions = this.get('extensions');
        extensions.push(extension);
        this.set('extensions', extensions);
    }

    removeExtension(extensionId) {
        const extensions = this.get('extensions').filter(ext => ext.id !== extensionId);
        this.set('extensions', extensions);
    }

    getExtensions() {
        return this.get('extensions');
    }
}

module.exports = SettingsManager;