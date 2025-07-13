// NoteSearch - Renderer Process Main JavaScript

const { ipcRenderer } = require('electron');

class NoteSearch {
    constructor() {
        this.webview = null;
        this.urlInput = null;
        this.homeSearch = null;
        this.startPage = null;
        this.sidebar = null;
        this.currentNoteId = null;
        this.notes = [];
        this.settings = {};
        this.emailStatus = { connected: false };
        this.vpnStatus = { connected: false };
        this.adBlockerStats = { blockedRequests: 0 };
        this.visitStartTime = null;
        this.currentUrl = null;
        this.pageTitle = null;
        
        // Tab system
        this.tabs = new Map();
        this.activeTabId = 'tab-1';
        this.tabCounter = 1;
        
        this.init();
    }

    async init() {
        this.setupElements();
        this.setupEventListeners();
        await this.loadSettings();
        await this.loadNotes();
        this.applySettings();
        this.showStartPage();
        this.updateStatuses();
        await this.loadPersonalizedQuickAccess();
        this.initTabSystem();
    }

    setupElements() {
        // Core browser elements
        this.webview = document.getElementById('webview');
        this.urlInput = document.getElementById('url-input');
        this.homeSearch = document.getElementById('home-search');
        this.startPage = document.getElementById('start-page');
        this.sidebar = document.getElementById('sidebar');
        
        // Navigation elements
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.homeBtn = document.getElementById('home-btn');
        this.searchBtn = document.getElementById('search-btn');
        
        // Title bar elements
        this.minimizeBtn = document.getElementById('minimize-btn');
        this.maximizeBtn = document.getElementById('maximize-btn');
        this.closeBtn = document.getElementById('close-btn');
        
        // Action buttons
        this.notesBtn = document.getElementById('notes-btn');
        this.emailBtn = document.getElementById('email-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        
        // Sidebar elements
        this.sidebarTitle = document.getElementById('sidebar-title');
        this.sidebarClose = document.getElementById('sidebar-close');
        this.notesPanel = document.getElementById('notes-panel');
        this.emailPanel = document.getElementById('email-panel');
        
        // Notes elements
        this.newNoteBtn = document.getElementById('new-note-btn');
        this.saveNoteBtn = document.getElementById('save-note-btn');
        this.notesList = document.getElementById('notes-list');
        this.noteContent = document.getElementById('note-content');
        
        // Loading indicator
        this.loadingIndicator = document.getElementById('loading-indicator');
        
        // Settings modal
        this.settingsModal = document.getElementById('settings-modal');
        this.settingsClose = document.getElementById('settings-close');
    }

    setupEventListeners() {
        // Title bar controls
        this.minimizeBtn.addEventListener('click', () => {
            ipcRenderer.invoke('minimize-window');
        });

        this.maximizeBtn.addEventListener('click', () => {
            ipcRenderer.invoke('maximize-window');
        });

        this.closeBtn.addEventListener('click', () => {
            ipcRenderer.invoke('close-window');
        });

        // Navigation controls
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.refreshBtn.addEventListener('click', () => this.refresh());
        this.homeBtn.addEventListener('click', () => this.goHome());
        
        // URL input and search
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigate(this.urlInput.value);
            }
        });
        
        this.homeSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigate(this.homeSearch.value);
            }
        });

        this.searchBtn.addEventListener('click', () => {
            this.navigate(this.urlInput.value);
        });

        // Action buttons
        this.notesBtn.addEventListener('click', () => this.toggleSidebar('notes'));
        this.emailBtn.addEventListener('click', () => this.toggleSidebar('email'));
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        
        // Sidebar controls
        this.sidebarClose.addEventListener('click', () => this.closeSidebar());
        
        // Notes functionality
        this.newNoteBtn.addEventListener('click', () => this.createNewNote());
        this.saveNoteBtn.addEventListener('click', () => this.saveCurrentNote());
        this.noteContent.addEventListener('input', () => this.onNoteContentChange());
        
        // Remove old quick link event listeners since they're generated dynamically
        // Quick links are now handled in renderQuickAccessLinks and renderDefaultQuickAccess

        // Refresh quick access every 5 minutes
        setInterval(() => {
            if (this.startPage.style.display === 'flex') {
                this.loadPersonalizedQuickAccess();
            }
        }, 5 * 60 * 1000);

        // Settings modal
        this.settingsClose.addEventListener('click', () => this.closeSettings());
        document.querySelector('.settings-backdrop').addEventListener('click', () => this.closeSettings());
        
        // Settings navigation
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.getAttribute('data-section');
                this.showSettingsSection(section);
            });
        });

        // Settings controls
        this.setupSettingsControls();

        // Webview events
        this.webview.addEventListener('dom-ready', () => {
            this.hideLoading();
            this.updateNavigationState();
            this.injectAdBlocker();
            this.recordPageVisit();
        });

        this.webview.addEventListener('did-start-loading', () => {
            this.showLoading();
            this.startVisitTimer();
        });

        this.webview.addEventListener('did-stop-loading', () => {
            this.hideLoading();
            this.updateNavigationState();
            this.updateUrlBar();
        });

        this.webview.addEventListener('page-title-updated', (e) => {
            this.pageTitle = e.title;
            this.updateTitle(e.title);
            this.updateActiveTabTitle(e.title);
        });

        this.webview.addEventListener('did-navigate', (e) => {
            this.updateActiveTabUrl(e.url);
            this.recordPageVisit();
        });

        this.webview.addEventListener('did-navigate-in-page', (e) => {
            this.recordPageVisit();
        });

        this.webview.addEventListener('new-window', (e) => {
            ipcRenderer.invoke('open-external', e.url);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        this.refresh();
                        break;
                    case 'l':
                        e.preventDefault();
                        this.urlInput.focus();
                        this.urlInput.select();
                        break;
                    case 't':
                        e.preventDefault();
                        this.goHome();
                        break;
                    case ',':
                        e.preventDefault();
                        this.openSettings();
                        break;
                    case 'n':
                        e.preventDefault();
                        if (this.sidebar.classList.contains('active') && 
                            this.notesPanel.style.display !== 'none') {
                            this.createNewNote();
                        }
                        break;
                    case 's':
                        e.preventDefault();
                        if (this.sidebar.classList.contains('active') && 
                            this.notesPanel.style.display !== 'none') {
                            this.saveCurrentNote();
                        }
                        break;
                }
            }
        });
    }

    setupSettingsControls() {
        try {
            // Theme selector
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) {
                themeSelect.addEventListener('change', async () => {
                    try {
                        await ipcRenderer.invoke('set-setting', 'theme', themeSelect.value);
                        this.settings.theme = themeSelect.value;
                        this.applyTheme();
                        this.showNotification('Theme updated successfully!');
                    } catch (error) {
                        this.showNotification('Failed to update theme', 'error');
                        console.error('Theme update error:', error);
                    }
                });
            }

            // Tab layout
            document.querySelectorAll('input[name="tabLayout"]').forEach(radio => {
                radio.addEventListener('change', async () => {
                    if (radio.checked) {
                        try {
                            await ipcRenderer.invoke('set-setting', 'tabLayout', radio.value);
                            this.settings.tabLayout = radio.value;
                            this.applyTabLayout();
                            this.showNotification('Tab layout updated successfully!');
                        } catch (error) {
                            this.showNotification('Failed to update tab layout', 'error');
                            console.error('Tab layout update error:', error);
                        }
                    }
                });
            });

            // Zoom controls
            const zoomSlider = document.getElementById('zoom-slider');
            const zoomDisplay = document.getElementById('zoom-display');
            const zoomDecrease = document.getElementById('zoom-decrease');
            const zoomIncrease = document.getElementById('zoom-increase');

            if (zoomSlider) {
                zoomSlider.addEventListener('input', async () => {
                    try {
                        const zoom = parseInt(zoomSlider.value);
                        if (zoomDisplay) zoomDisplay.textContent = `${zoom}%`;
                        await ipcRenderer.invoke('set-setting', 'defaultZoom', zoom);
                        this.settings.defaultZoom = zoom;
                        this.webview.setZoomFactor(zoom / 100);
                        this.showNotification(`Zoom set to ${zoom}%`);
                    } catch (error) {
                        this.showNotification('Failed to update zoom', 'error');
                        console.error('Zoom update error:', error);
                    }
                });
            }

            if (zoomDecrease) {
                zoomDecrease.addEventListener('click', () => {
                    if (zoomSlider) {
                        const currentZoom = parseInt(zoomSlider.value);
                        const newZoom = Math.max(50, currentZoom - 10);
                        zoomSlider.value = newZoom;
                        zoomSlider.dispatchEvent(new Event('input'));
                    }
                });
            }

            if (zoomIncrease) {
                zoomIncrease.addEventListener('click', () => {
                    if (zoomSlider) {
                        const currentZoom = parseInt(zoomSlider.value);
                        const newZoom = Math.min(200, currentZoom + 10);
                        zoomSlider.value = newZoom;
                        zoomSlider.dispatchEvent(new Event('input'));
                    }
                });
            }

            // Search engine
            const searchEngineSelect = document.getElementById('search-engine-select');
            const customSearchGroup = document.getElementById('custom-search-group');
            
            if (searchEngineSelect) {
                searchEngineSelect.addEventListener('change', async () => {
                    try {
                        const engine = searchEngineSelect.value;
                        await ipcRenderer.invoke('set-setting', 'searchEngine', engine);
                        this.settings.searchEngine = engine;
                        if (customSearchGroup) {
                            customSearchGroup.style.display = engine === 'custom' ? 'block' : 'none';
                        }
                        this.showNotification('Search engine updated successfully!');
                    } catch (error) {
                        this.showNotification('Failed to update search engine', 'error');
                        console.error('Search engine update error:', error);
                    }
                });
            }

            // Custom search URL
            const customSearchUrl = document.getElementById('custom-search-url');
            if (customSearchUrl) {
                customSearchUrl.addEventListener('blur', async () => {
                    await ipcRenderer.invoke('set-setting', 'customSearchUrl', customSearchUrl.value);
                    this.settings.customSearchUrl = customSearchUrl.value;
                });
            }

            // Homepage
            const homepageSelect = document.getElementById('homepage-select');
            const customHomepageGroup = document.getElementById('custom-homepage-group');
            
            if (homepageSelect) {
                homepageSelect.addEventListener('change', async () => {
                    const homepage = homepageSelect.value;
                    await ipcRenderer.invoke('set-setting', 'homepage', homepage);
                    this.settings.homepage = homepage;
                    if (customHomepageGroup) {
                        customHomepageGroup.style.display = homepage === 'custom' ? 'block' : 'none';
                    }
                });
            }

            // Custom homepage URL
            const customHomepageUrl = document.getElementById('custom-homepage-url');
            if (customHomepageUrl) {
                customHomepageUrl.addEventListener('blur', async () => {
                    await ipcRenderer.invoke('set-setting', 'customHomepage', customHomepageUrl.value);
                    this.settings.customHomepage = customHomepageUrl.value;
                });
            }

            // Ad blocker
            const adBlockerEnabled = document.getElementById('adblocker-enabled');
            if (adBlockerEnabled) {
                adBlockerEnabled.addEventListener('change', async () => {
                    try {
                        await ipcRenderer.invoke('adblocker-toggle');
                        this.settings.adBlocker = adBlockerEnabled.checked;
                        this.updateAdBlockerStats();
                        this.showNotification(`Ad blocker ${adBlockerEnabled.checked ? 'enabled' : 'disabled'}`);
                    } catch (error) {
                        this.showNotification('Failed to toggle ad blocker', 'error');
                        console.error('Ad blocker toggle error:', error);
                        // Revert checkbox state on error
                        adBlockerEnabled.checked = !adBlockerEnabled.checked;
                    }
                });
            }

            // Cookie policy
            const cookiePolicySelect = document.getElementById('cookie-policy-select');
            if (cookiePolicySelect) {
                cookiePolicySelect.addEventListener('change', async () => {
                    await ipcRenderer.invoke('set-setting', 'cookiePolicy', cookiePolicySelect.value);
                    this.settings.cookiePolicy = cookiePolicySelect.value;
                });
            }

            // Email settings
            this.setupEmailSettings();

            // VPN settings
            this.setupVpnSettings();

            // Extensions settings
            this.setupExtensionsSettings();

            // Advanced settings
            this.setupAdvancedSettings();
        } catch (error) {
            console.error('Error setting up settings controls:', error);
        }
    }

    setupEmailSettings() {
        const emailProviderSelect = document.getElementById('email-provider-select');
        const emailConfig = document.getElementById('email-config');
        const customEmailConfig = document.getElementById('custom-email-config');
        const emailConnectBtn = document.getElementById('email-connect-btn');
        const emailDisconnectBtn = document.getElementById('email-disconnect-btn');

        emailProviderSelect.addEventListener('change', () => {
            const provider = emailProviderSelect.value;
            emailConfig.style.display = provider ? 'block' : 'none';
            customEmailConfig.style.display = provider === 'custom' ? 'block' : 'none';
        });

        emailConnectBtn.addEventListener('click', async () => {
            try {
                const config = {
                    provider: emailProviderSelect.value,
                    email: document.getElementById('email-address').value,
                    password: document.getElementById('email-password').value
                };

                if (emailProviderSelect.value === 'custom') {
                    config.imapHost = document.getElementById('imap-host').value;
                    config.smtpHost = document.getElementById('smtp-host').value;
                }

                await ipcRenderer.invoke('email-connect', config);
                this.updateEmailStatus();
                this.showNotification('Email connected successfully!');
            } catch (error) {
                this.showNotification(`Failed to connect email: ${error.message}`, 'error');
            }
        });

        emailDisconnectBtn.addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('email-disconnect');
                this.updateEmailStatus();
                this.showNotification('Email disconnected');
            } catch (error) {
                this.showNotification(`Failed to disconnect email: ${error.message}`, 'error');
            }
        });
    }

    setupVpnSettings() {
        const vpnEnabledCheckbox = document.getElementById('vpn-enabled');
        const vpnServerSelect = document.getElementById('vpn-server-select');
        const vpnConnectBtn = document.getElementById('vpn-connect-btn');
        const vpnDisconnectBtn = document.getElementById('vpn-disconnect-btn');

        vpnConnectBtn.addEventListener('click', async () => {
            try {
                const serverId = vpnServerSelect.value;
                await ipcRenderer.invoke('vpn-connect', serverId);
                this.updateVpnStatus();
                this.showNotification('VPN connected successfully!');
            } catch (error) {
                this.showNotification(`Failed to connect VPN: ${error.message}`, 'error');
            }
        });

        vpnDisconnectBtn.addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('vpn-disconnect');
                this.updateVpnStatus();
                this.showNotification('VPN disconnected');
            } catch (error) {
                this.showNotification(`Failed to disconnect VPN: ${error.message}`, 'error');
            }
        });

        vpnEnabledCheckbox.addEventListener('change', async () => {
            try {
                if (vpnEnabledCheckbox.checked) {
                    const serverId = vpnServerSelect.value;
                    await ipcRenderer.invoke('vpn-connect', serverId);
                    this.showNotification('VPN connected successfully!');
                } else {
                    await ipcRenderer.invoke('vpn-disconnect');
                    this.showNotification('VPN disconnected');
                }
                this.updateVpnStatus();
            } catch (error) {
                this.showNotification(`VPN operation failed: ${error.message}`, 'error');
                // Revert checkbox state on error
                vpnEnabledCheckbox.checked = !vpnEnabledCheckbox.checked;
            }
        });
    }

    setupExtensionsSettings() {
        const installExtensionBtn = document.getElementById('install-extension-btn');
        const extensionsList = document.getElementById('extensions-list');

        if (installExtensionBtn) {
            installExtensionBtn.addEventListener('click', async () => {
                try {
                    const { dialog } = require('@electron/remote');
                    const result = await dialog.showOpenDialog({
                        title: 'Select Chrome Extension',
                        properties: ['openDirectory'],
                        filters: [
                            { name: 'Chrome Extension', extensions: ['crx'] }
                        ]
                    });

                    if (!result.canceled && result.filePaths.length > 0) {
                        const extensionPath = result.filePaths[0];
                        await ipcRenderer.invoke('install-extension', extensionPath);
                        this.showNotification('Extension installed successfully!');
                        this.loadExtensions();
                    }
                } catch (error) {
                    this.showNotification(`Failed to install extension: ${error.message}`, 'error');
                }
            });
        }

        this.loadExtensions();
    }

    async loadExtensions() {
        try {
            const extensions = await ipcRenderer.invoke('get-extensions');
            this.renderExtensionsList(extensions);
        } catch (error) {
            console.error('Failed to load extensions:', error);
        }
    }

    renderExtensionsList(extensions) {
        const extensionsList = document.getElementById('extensions-list');
        if (!extensionsList) return;

        if (extensions.length === 0) {
            extensionsList.innerHTML = `
                <div class="no-extensions">
                    <i class="fas fa-puzzle-piece" style="font-size: 48px; opacity: 0.3;"></i>
                    <p>No extensions installed</p>
                    <small>Install Chrome extensions to enhance your browsing experience</small>
                </div>
            `;
            return;
        }

        extensionsList.innerHTML = extensions.map(extension => `
            <div class="extension-item">
                <div class="extension-info">
                    <div class="extension-name">${extension.name}</div>
                    <div class="extension-version">v${extension.version}</div>
                    <div class="extension-description">${extension.description}</div>
                </div>
                <div class="extension-actions">
                    <button class="danger-btn" onclick="removeExtension('${extension.id}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        `).join('');
    }

    async removeExtension(extensionId) {
        try {
            await ipcRenderer.invoke('remove-extension', extensionId);
            this.showNotification('Extension removed successfully!');
            this.loadExtensions();
        } catch (error) {
            this.showNotification(`Failed to remove extension: ${error.message}`, 'error');
        }
    }

    setupAdvancedSettings() {
        const hardwareAcceleration = document.getElementById('hardware-acceleration');
        const developerMode = document.getElementById('developer-mode');
        const notesAutosave = document.getElementById('notes-autosave');
        const resetSettingsBtn = document.getElementById('reset-settings-btn');
        const clearDataBtn = document.getElementById('clear-data-btn');

        if (hardwareAcceleration) {
            hardwareAcceleration.addEventListener('change', async () => {
                await ipcRenderer.invoke('set-setting', 'hardwareAcceleration', hardwareAcceleration.checked);
                this.settings.hardwareAcceleration = hardwareAcceleration.checked;
            });
        }

        if (developerMode) {
            developerMode.addEventListener('change', async () => {
                await ipcRenderer.invoke('set-setting', 'developerMode', developerMode.checked);
                this.settings.developerMode = developerMode.checked;
            });
        }

        if (notesAutosave) {
            notesAutosave.addEventListener('change', async () => {
                await ipcRenderer.invoke('set-setting', 'notesAutoSave', notesAutosave.checked);
                this.settings.notesAutoSave = notesAutosave.checked;
            });
        }

        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to reset all settings? This cannot be undone.')) {
                    await ipcRenderer.invoke('reset-settings');
                    this.showNotification('Settings reset successfully');
                    location.reload();
                }
            });
        }

        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to clear all data including notes? This cannot be undone.')) {
                    this.notes = [];
                    await this.saveNotes();
                    this.renderNotesList();
                    this.showNotification('All data cleared successfully');
                }
            });
        }
    }

    async loadSettings() {
        this.settings = await ipcRenderer.invoke('get-settings');
    }

    applySettings() {
        // Apply theme
        this.applyTheme();
        
        // Apply zoom
        const zoom = this.settings.defaultZoom || 100;
        this.webview.setZoomFactor(zoom / 100);
        
        // Update settings UI
        this.updateSettingsUI();
    }

    applyTheme() {
        const theme = this.settings.theme || 'light';
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldUseDark = theme === 'dark' || (theme === 'auto' && systemDark);
        
        document.documentElement.setAttribute('data-theme', shouldUseDark ? 'dark' : 'light');
    }

    updateSettingsUI() {
        // Update all form controls with current settings
        try {
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) themeSelect.value = this.settings.theme || 'light';
            
            const tabLayout = this.settings.tabLayout || 'horizontal';
            const tabRadio = document.querySelector(`input[name="tabLayout"][value="${tabLayout}"]`);
            if (tabRadio) tabRadio.checked = true;
            
            const zoom = this.settings.defaultZoom || 100;
            const zoomSlider = document.getElementById('zoom-slider');
            const zoomDisplay = document.getElementById('zoom-display');
            if (zoomSlider) zoomSlider.value = zoom;
            if (zoomDisplay) zoomDisplay.textContent = `${zoom}%`;
            
            const searchEngineSelect = document.getElementById('search-engine-select');
            if (searchEngineSelect) searchEngineSelect.value = this.settings.searchEngine || 'google';
            
            const customSearchUrl = document.getElementById('custom-search-url');
            if (customSearchUrl) customSearchUrl.value = this.settings.customSearchUrl || '';
            
            const homepageSelect = document.getElementById('homepage-select');
            if (homepageSelect) homepageSelect.value = this.settings.homepage || 'start';
            
            const customHomepageUrl = document.getElementById('custom-homepage-url');
            if (customHomepageUrl) customHomepageUrl.value = this.settings.customHomepage || '';
            
            const adBlockerEnabled = document.getElementById('adblocker-enabled');
            if (adBlockerEnabled) adBlockerEnabled.checked = this.settings.adBlocker !== false;
            
            const cookiePolicySelect = document.getElementById('cookie-policy-select');
            if (cookiePolicySelect) cookiePolicySelect.value = this.settings.cookiePolicy || 'block-third-party';
            
            const hardwareAcceleration = document.getElementById('hardware-acceleration');
            if (hardwareAcceleration) hardwareAcceleration.checked = this.settings.hardwareAcceleration !== false;
            
            const developerMode = document.getElementById('developer-mode');
            if (developerMode) developerMode.checked = this.settings.developerMode === true;
            
            const notesAutosave = document.getElementById('notes-autosave');
            if (notesAutosave) notesAutosave.checked = this.settings.notesAutoSave !== false;

            // Show/hide conditional groups
            const customSearchGroup = document.getElementById('custom-search-group');
            if (customSearchGroup) {
                customSearchGroup.style.display = this.settings.searchEngine === 'custom' ? 'block' : 'none';
            }
            
            const customHomepageGroup = document.getElementById('custom-homepage-group');
            if (customHomepageGroup) {
                customHomepageGroup.style.display = this.settings.homepage === 'custom' ? 'block' : 'none';
            }
        } catch (error) {
            console.error('Error updating settings UI:', error);
        }
    }

    async updateStatuses() {
        await this.updateEmailStatus();
        await this.updateVpnStatus();
        await this.updateAdBlockerStats();
    }

    async updateEmailStatus() {
        try {
            this.emailStatus = await ipcRenderer.invoke('email-get-status');
            const indicator = document.querySelector('#email-status .status-indicator');
            const text = document.querySelector('#email-status span');
            const connectBtn = document.getElementById('email-connect-btn');
            const disconnectBtn = document.getElementById('email-disconnect-btn');

            if (this.emailStatus.connected) {
                indicator.classList.add('connected');
                text.textContent = `Connected (${this.emailStatus.email})`;
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-flex';
            } else {
                indicator.classList.remove('connected');
                text.textContent = 'Not Connected';
                connectBtn.style.display = 'inline-flex';
                disconnectBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to update email status:', error);
        }
    }

    async updateVpnStatus() {
        try {
            this.vpnStatus = await ipcRenderer.invoke('vpn-get-status');
            const indicator = document.querySelector('#vpn-status .status-indicator');
            const text = document.querySelector('#vpn-status span');
            const location = document.getElementById('vpn-location');
            const checkbox = document.getElementById('vpn-enabled');
            const connectBtn = document.getElementById('vpn-connect-btn');
            const disconnectBtn = document.getElementById('vpn-disconnect-btn');

            if (this.vpnStatus.connected) {
                if (indicator) indicator.classList.add('connected');
                if (text) text.textContent = 'Connected';
                if (location) location.textContent = this.vpnStatus.server ? `${this.vpnStatus.server.flag} ${this.vpnStatus.server.name}` : '';
                if (checkbox && !checkbox.checked) checkbox.checked = true;
                if (connectBtn) connectBtn.style.display = 'none';
                if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
            } else {
                if (indicator) indicator.classList.remove('connected');
                if (text) text.textContent = 'Disconnected';
                if (location) location.textContent = '';
                if (checkbox && checkbox.checked) checkbox.checked = false;
                if (connectBtn) connectBtn.style.display = 'inline-flex';
                if (disconnectBtn) disconnectBtn.style.display = 'none';
            }

            // Populate VPN servers
            const serverSelect = document.getElementById('vpn-server-select');
            if (serverSelect && this.vpnStatus.servers) {
                serverSelect.innerHTML = '';
                this.vpnStatus.servers.forEach(server => {
                    const option = document.createElement('option');
                    option.value = server.id;
                    option.textContent = `${server.flag} ${server.name}`;
                    serverSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to update VPN status:', error);
        }
    }

    async updateAdBlockerStats() {
        try {
            this.adBlockerStats = await ipcRenderer.invoke('adblocker-get-stats');
            const statsElement = document.getElementById('adblocker-stats');
            statsElement.querySelector('small').textContent = 
                `Blocked ${this.adBlockerStats.blockedRequests} ads and trackers`;
        } catch (error) {
            console.error('Failed to update ad blocker stats:', error);
        }
    }

    async injectAdBlocker() {
        try {
            const script = await ipcRenderer.invoke('get-content-blocking-script');
            this.webview.executeJavaScript(script);
        } catch (error) {
            console.error('Failed to inject ad blocker:', error);
        }
    }

    startVisitTimer() {
        this.visitStartTime = Date.now();
    }

    async recordPageVisit() {
        try {
            const url = this.webview.getURL();
            if (!url || url === 'about:blank') return;

            // Record previous visit duration if we have one
            if (this.currentUrl && this.visitStartTime) {
                const duration = Date.now() - this.visitStartTime;
                await ipcRenderer.invoke('analytics-record-visit', this.currentUrl, this.pageTitle || '', duration);
            }

            // Start tracking current page
            this.currentUrl = url;
            this.visitStartTime = Date.now();
            
        } catch (error) {
            console.error('Failed to record page visit:', error);
        }
    }

    async loadPersonalizedQuickAccess() {
        try {
            const mostVisited = await ipcRenderer.invoke('analytics-get-most-visited', 8);
            this.renderQuickAccessLinks(mostVisited);
        } catch (error) {
            console.error('Failed to load personalized quick access:', error);
            this.renderDefaultQuickAccess();
        }
    }

    renderQuickAccessLinks(sites) {
        const linksGrid = document.querySelector('.links-grid');
        if (!linksGrid) return;

        if (sites.length === 0) {
            this.renderDefaultQuickAccess();
            return;
        }

        linksGrid.innerHTML = sites.map(site => {
            const displayTitle = site.title.length > 15 ? site.title.substring(0, 15) + '...' : site.title;
            return `
                <a href="#" class="quick-link personalized" data-url="${site.url}" title="${site.title}">
                    <div class="quick-link-favicon">
                        <img src="${site.favicon}" alt="${site.domain}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <i class="fas fa-globe" style="display: none;"></i>
                    </div>
                    <span>${displayTitle}</span>
                    <div class="quick-link-stats">
                        <small>${site.visitCount} visits</small>
                    </div>
                </a>
            `;
        }).join('');

        // Add event listeners to new links
        linksGrid.querySelectorAll('.quick-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = link.getAttribute('data-url');
                this.navigate(url);
            });
        });
    }

    renderDefaultQuickAccess() {
        const linksGrid = document.querySelector('.links-grid');
        if (!linksGrid) return;

        const defaultLinks = [
            { url: 'https://google.com', icon: 'fab fa-google', title: 'Google' },
            { url: 'https://github.com', icon: 'fab fa-github', title: 'GitHub' },
            { url: 'https://stackoverflow.com', icon: 'fab fa-stack-overflow', title: 'Stack Overflow' },
            { url: 'https://youtube.com', icon: 'fab fa-youtube', title: 'YouTube' },
            { url: 'https://reddit.com', icon: 'fab fa-reddit', title: 'Reddit' },
            { url: 'https://wikipedia.org', icon: 'fab fa-wikipedia-w', title: 'Wikipedia' },
            { url: 'https://twitter.com', icon: 'fab fa-twitter', title: 'Twitter' },
            { url: 'https://news.ycombinator.com', icon: 'fab fa-hacker-news', title: 'Hacker News' }
        ];

        linksGrid.innerHTML = defaultLinks.map(link => `
            <a href="#" class="quick-link" data-url="${link.url}">
                <i class="${link.icon}"></i>
                <span>${link.title}</span>
            </a>
        `).join('');

        // Add event listeners
        linksGrid.querySelectorAll('.quick-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = link.getAttribute('data-url');
                this.navigate(url);
            });
        });
    }

    // Navigation methods (unchanged from original)
    async navigate(url) {
        if (!url) return;

        let targetUrl = url.trim();
        
        if (!targetUrl.includes('.') && !targetUrl.startsWith('http')) {
            // Use custom search engine
            targetUrl = await ipcRenderer.invoke('get-search-url', targetUrl);
        } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `https://${targetUrl}`;
        }

        this.hideStartPage();
        this.webview.src = targetUrl;
        this.urlInput.value = targetUrl;
    }

    goBack() {
        if (this.webview.canGoBack()) {
            this.webview.goBack();
        }
    }

    goForward() {
        if (this.webview.canGoForward()) {
            this.webview.goForward();
        }
    }

    refresh() {
        if (this.startPage.style.display !== 'none') {
            this.showStartPage();
        } else {
            this.webview.reload();
        }
    }

    goHome() {
        this.showStartPage();
        this.urlInput.value = '';
    }

    updateNavigationState() {
        this.backBtn.disabled = !this.webview.canGoBack();
        this.forwardBtn.disabled = !this.webview.canGoForward();
    }

    updateUrlBar() {
        this.urlInput.value = this.webview.getURL();
    }

    updateTitle(title) {
        document.querySelector('.window-title').textContent = title || 'NoteSearch';
    }

    showStartPage() {
        this.startPage.style.display = 'flex';
        this.webview.src = 'about:blank';
        this.urlInput.value = '';
        this.updateTitle('NoteSearch');
        this.updateNavigationState();
    }

    hideStartPage() {
        this.startPage.style.display = 'none';
    }

    showLoading() {
        this.loadingIndicator.classList.add('active');
    }

    hideLoading() {
        this.loadingIndicator.classList.remove('active');
    }

    // Settings modal methods
    openSettings() {
        this.settingsModal.classList.add('active');
        this.updateStatuses();
    }

    closeSettings() {
        this.settingsModal.classList.remove('active');
    }

    showSettingsSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Update sections
        document.querySelectorAll('.settings-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${sectionName}-section`).classList.add('active');
    }

    // Sidebar methods (unchanged)
    toggleSidebar(type) {
        if (this.sidebar.classList.contains('active') && 
            this.getCurrentSidebarType() === type) {
            this.closeSidebar();
            return;
        }
        this.showSidebar(type);
    }

    showSidebar(type) {
        this.sidebar.classList.add('active');
        
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (type === 'notes') {
            this.sidebarTitle.textContent = 'Notes';
            this.notesPanel.style.display = 'flex';
            this.emailPanel.style.display = 'none';
            this.notesBtn.classList.add('active');
        } else if (type === 'email') {
            this.sidebarTitle.textContent = 'Email';
            this.notesPanel.style.display = 'none';
            this.emailPanel.style.display = 'flex';
            this.emailBtn.classList.add('active');
            this.loadEmails();
        }
    }

    closeSidebar() {
        this.sidebar.classList.remove('active');
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    getCurrentSidebarType() {
        if (this.notesPanel.style.display !== 'none') return 'notes';
        if (this.emailPanel.style.display !== 'none') return 'email';
        return null;
    }

    // Notes functionality (enhanced with email sharing)
    async loadNotes() {
        try {
            const notes = await ipcRenderer.invoke('get-notes');
            this.notes = notes || [];
            this.renderNotesList();
        } catch (error) {
            console.error('Failed to load notes:', error);
        }
    }

    renderNotesList() {
        this.notesList.innerHTML = '';
        
        if (this.notes.length === 0) {
            this.notesList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--text-muted);">
                    <i class="fas fa-sticky-note" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p>No notes yet. Create your first note!</p>
                </div>
            `;
            return;
        }

        this.notes.forEach(note => {
            const noteElement = document.createElement('div');
            noteElement.className = 'note-item';
            noteElement.setAttribute('data-note-id', note.id);
            
            const title = note.content.split('\n')[0] || 'Untitled Note';
            const preview = note.content.substring(0, 100);
            
            noteElement.innerHTML = `
                <div class="note-title">${this.escapeHtml(title)}</div>
                <div class="note-preview">${this.escapeHtml(preview)}${preview.length >= 100 ? '...' : ''}</div>
                <div class="note-actions">
                    <button class="share-note-btn" title="Share via email">
                        <i class="fas fa-share"></i>
                    </button>
                </div>
            `;
            
            noteElement.addEventListener('click', (e) => {
                if (!e.target.closest('.note-actions')) {
                    this.selectNote(note.id);
                }
            });

            const shareBtn = noteElement.querySelector('.share-note-btn');
            shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.shareNoteViaEmail(note);
            });
            
            this.notesList.appendChild(noteElement);
        });
    }

    async shareNoteViaEmail(note) {
        try {
            if (!this.emailStatus.connected) {
                this.showNotification('Please connect your email first in Settings', 'error');
                return;
            }

            const title = note.content.split('\n')[0] || 'Untitled Note';
            await ipcRenderer.invoke('email-share-note', note.content, title);
            this.showNotification('Note shared via email successfully!');
        } catch (error) {
            this.showNotification(`Failed to share note: ${error.message}`, 'error');
        }
    }

    createNewNote() {
        const newNote = {
            id: Date.now().toString(),
            content: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.notes.unshift(newNote);
        this.renderNotesList();
        this.selectNote(newNote.id);
        this.noteContent.focus();
    }

    selectNote(noteId) {
        this.currentNoteId = noteId;
        const note = this.notes.find(n => n.id === noteId);
        
        if (note) {
            this.noteContent.value = note.content;
            
            document.querySelectorAll('.note-item').forEach(item => {
                item.classList.remove('active');
            });
            
            const selectedItem = document.querySelector(`[data-note-id="${noteId}"]`);
            if (selectedItem) {
                selectedItem.classList.add('active');
            }
        }
    }

    onNoteContentChange() {
        if (this.currentNoteId) {
            const note = this.notes.find(n => n.id === this.currentNoteId);
            if (note) {
                note.content = this.noteContent.value;
                note.updatedAt = new Date().toISOString();
                
                if (this.settings.notesAutoSave !== false) {
                    clearTimeout(this.autoSaveTimeout);
                    this.autoSaveTimeout = setTimeout(() => {
                        this.saveCurrentNote();
                    }, 2000);
                }
                
                this.renderNotesList();
                this.selectNote(this.currentNoteId);
            }
        }
    }

    async saveCurrentNote() {
        if (!this.currentNoteId) return;
        
        try {
            await this.saveNotes();
            this.showNotification('Note saved successfully!');
        } catch (error) {
            console.error('Failed to save note:', error);
            this.showNotification('Failed to save note', 'error');
        }
    }

    async saveNotes() {
        await ipcRenderer.invoke('save-notes', this.notes);
    }

    async loadEmails() {
        if (!this.emailStatus.connected) return;

        try {
            const emails = await ipcRenderer.invoke('email-fetch', 'INBOX', 20);
            this.renderEmailList(emails);
        } catch (error) {
            console.error('Failed to load emails:', error);
        }
    }

    renderEmailList(emails) {
        const emailList = document.getElementById('email-list');
        
        if (!emails || emails.length === 0) {
            emailList.innerHTML = `
                <div class="email-placeholder">
                    <i class="fas fa-envelope-open-text"></i>
                    <p>No emails found</p>
                </div>
            `;
            return;
        }

        emailList.innerHTML = emails.map(email => `
            <div class="email-item ${email.seen ? '' : 'unread'}">
                <div class="email-from">${this.escapeHtml(email.from)}</div>
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                <div class="email-date">${new Date(email.date).toLocaleDateString()}</div>
            </div>
        `).join('');
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initTabSystem() {
        // Initialize first tab
        this.tabs.set('tab-1', {
            id: 'tab-1',
            title: 'New Tab',
            url: 'about:blank',
            isActive: true
        });

        // Setup tab event listeners
        this.setupTabEventListeners();
        this.applyTabLayout();
    }

    setupTabEventListeners() {
        const newTabBtn = document.getElementById('new-tab-btn');
        const tabsContainer = document.getElementById('tabs-container');

        // New tab button
        if (newTabBtn) {
            newTabBtn.addEventListener('click', () => this.createNewTab());
        }

        // Tab clicks and close buttons
        if (tabsContainer) {
            tabsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.tab');
                if (!tab) return;

                if (e.target.classList.contains('tab-close')) {
                    e.stopPropagation();
                    this.closeTab(tab.dataset.tabId);
                } else {
                    this.switchToTab(tab.dataset.tabId);
                }
            });
        }
    }

    createNewTab() {
        this.tabCounter++;
        const tabId = `tab-${this.tabCounter}`;
        
        const newTab = {
            id: tabId,
            title: 'New Tab',
            url: 'about:blank',
            isActive: false
        };

        this.tabs.set(tabId, newTab);
        this.renderTabs();
        this.switchToTab(tabId);
    }

    closeTab(tabId) {
        if (this.tabs.size <= 1) return; // Don't close last tab

        this.tabs.delete(tabId);
        
        // If we closed the active tab, switch to another
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            this.switchToTab(remainingTabs[0]);
        }
        
        this.renderTabs();
    }

    switchToTab(tabId) {
        // Update tab states
        this.tabs.forEach(tab => {
            tab.isActive = tab.id === tabId;
        });
        
        this.activeTabId = tabId;
        this.renderTabs();
        
        // Update webview content
        const tab = this.tabs.get(tabId);
        if (tab && tab.url !== 'about:blank') {
            this.webview.src = tab.url;
        } else {
            this.showStartPage();
        }
    }

    renderTabs() {
        const tabsContainer = document.getElementById('tabs-container');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = Array.from(this.tabs.values()).map(tab => `
            <div class="tab ${tab.isActive ? 'active' : ''}" data-tab-id="${tab.id}">
                <span class="tab-title">${tab.title}</span>
                <button class="tab-close">×</button>
            </div>
        `).join('');
    }

    updateActiveTabTitle(title) {
        const activeTab = this.tabs.get(this.activeTabId);
        if (activeTab) {
            activeTab.title = title || 'New Tab';
            this.renderTabs();
        }
    }

    updateActiveTabUrl(url) {
        const activeTab = this.tabs.get(this.activeTabId);
        if (activeTab) {
            activeTab.url = url;
        }
    }

    applyTabLayout() {
        const navBar = document.querySelector('.nav-bar');
        const tabLayout = this.settings.tabLayout || 'horizontal';
        
        if (tabLayout === 'vertical') {
            navBar.classList.add('vertical-tabs');
        } else {
            navBar.classList.remove('vertical-tabs');
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            background: ${type === 'error' ? 'var(--error)' : 'var(--success)'};
            color: white;
            padding: 12px 16px;
            border-radius: var(--radius);
            box-shadow: var(--shadow-lg);
            z-index: 10000;
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 100);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the browser when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NoteSearch();
});

// Handle window focus events
window.addEventListener('focus', () => {
    document.body.classList.add('focused');
});

window.addEventListener('blur', () => {
    document.body.classList.remove('focused');
});