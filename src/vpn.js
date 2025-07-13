// Simple VPN Manager (proxy-based)
const { session } = require('electron');

class VPNManager {
    constructor(settingsManager) {
        this.settings = settingsManager;
        this.isConnected = false;
        this.currentServer = null;
        this.freeProxyServers = [
            { id: 'us-east', host: '52.179.231.206', port: 80, country: 'US', flag: '🇺🇸', name: 'US East' },
            { id: 'us-west', host: '13.78.125.167', port: 8080, country: 'US', flag: '🇺🇸', name: 'US West' },
            { id: 'uk', host: '185.162.251.76', port: 80, country: 'UK', flag: '🇬🇧', name: 'United Kingdom' },
            { id: 'germany', host: '85.214.94.28', port: 80, country: 'DE', flag: '🇩🇪', name: 'Germany' },
            { id: 'canada', host: '51.222.21.95', port: 32101, country: 'CA', flag: '🇨🇦', name: 'Canada' },
            { id: 'singapore', host: '103.152.112.162', port: 80, country: 'SG', flag: '🇸🇬', name: 'Singapore' }
        ];
    }

    async connect(serverId = 'auto') {
        try {
            let server;
            
            if (serverId === 'auto') {
                // Select random server
                server = this.freeProxyServers[Math.floor(Math.random() * this.freeProxyServers.length)];
            } else {
                server = this.freeProxyServers.find(s => s.id === serverId);
            }

            if (!server) {
                throw new Error('Server not found');
            }

            // Test connection to proxy server
            await this.testProxyConnection(server);

            // Configure Electron session to use proxy
            await this.configureProxy(server);
            
            this.isConnected = true;
            this.currentServer = server;
            this.settings.set('vpnEnabled', true);
            this.settings.set('vpnServer', serverId);

            return {
                success: true,
                server: server
            };
        } catch (error) {
            throw new Error(`Failed to connect to VPN: ${error.message}`);
        }
    }

    async disconnect() {
        try {
            // Remove proxy configuration
            await session.defaultSession.setProxy({ mode: 'direct' });
            
            this.isConnected = false;
            this.currentServer = null;
            this.settings.set('vpnEnabled', false);

            return { success: true };
        } catch (error) {
            throw new Error(`Failed to disconnect VPN: ${error.message}`);
        }
    }

    async configureProxy(server) {
        const proxyConfig = {
            mode: 'fixed_servers',
            proxyRules: `http=${server.host}:${server.port};https=${server.host}:${server.port}`
        };

        await session.defaultSession.setProxy(proxyConfig);
    }

    async testProxyConnection(server) {
        return new Promise((resolve, reject) => {
            const net = require('net');
            const socket = new net.Socket();
            
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            }, 5000);

            socket.connect(server.port, server.host, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve(true);
            });

            socket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    getStatus() {
        return {
            connected: this.isConnected,
            server: this.currentServer,
            servers: this.freeProxyServers.map(server => ({
                ...server,
                status: this.currentServer?.id === server.id ? 'connected' : 'available'
            }))
        };
    }

    async getPublicIP() {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch('https://api.ipify.org?format=json', {
                timeout: 5000
            });
            const data = await response.json();
            return data.ip;
        } catch (error) {
            throw new Error('Failed to get public IP');
        }
    }

    async getLocation() {
        try {
            const ip = await this.getPublicIP();
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`http://ip-api.com/json/${ip}`, {
                timeout: 5000
            });
            const data = await response.json();
            
            return {
                ip: ip,
                country: data.country,
                city: data.city,
                region: data.regionName,
                isp: data.isp,
                proxy: this.isConnected
            };
        } catch (error) {
            return {
                ip: 'Unknown',
                country: 'Unknown',
                city: 'Unknown',
                region: 'Unknown',
                isp: 'Unknown',
                proxy: this.isConnected
            };
        }
    }

    // Auto-connect on startup if enabled
    async autoConnect() {
        const vpnEnabled = this.settings.get('vpnEnabled');
        const vpnServer = this.settings.get('vpnServer');

        if (vpnEnabled) {
            try {
                await this.connect(vpnServer);
            } catch (error) {
                console.warn('Auto-connect to VPN failed:', error.message);
                this.settings.set('vpnEnabled', false);
            }
        }
    }

    // Get list of alternative free proxy sources
    async updateServerList() {
        try {
            // In a real implementation, you would fetch from proxy APIs
            // For now, we'll use the static list
            return this.freeProxyServers;
        } catch (error) {
            console.warn('Failed to update server list:', error.message);
            return this.freeProxyServers;
        }
    }

    // Check if current proxy is working
    async checkConnection() {
        if (!this.isConnected || !this.currentServer) {
            return false;
        }

        try {
            await this.testProxyConnection(this.currentServer);
            return true;
        } catch (error) {
            // Auto-disconnect if proxy is not working
            await this.disconnect();
            return false;
        }
    }
}

module.exports = VPNManager;