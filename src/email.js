// Email Manager
const nodemailer = require('nodemailer');
const imaps = require('imap-simple');
const { EventEmitter } = require('events');

class EmailManager extends EventEmitter {
    constructor(settingsManager) {
        super();
        this.settings = settingsManager;
        this.imapConnection = null;
        this.smtpTransporter = null;
        this.isConnected = false;
        this.emails = [];
        this.folders = ['INBOX', 'SENT', 'DRAFTS'];
        this.currentFolder = 'INBOX';
    }

    async connect(emailConfig) {
        try {
            console.log('Attempting email connection with config:', { 
                provider: emailConfig.provider, 
                email: emailConfig.email,
                imapHost: emailConfig.imapHost,
                smtpHost: emailConfig.smtpHost
            });

            const provider = this.settings.getEmailProviders().find(p => p.id === emailConfig.provider);
            
            if (!provider && emailConfig.provider !== 'custom') {
                throw new Error('Invalid email provider');
            }

            // For custom provider, use provided hosts
            let imapHost, smtpHost, imapPort, smtpPort, imapSecure, smtpSecure;
            
            if (emailConfig.provider === 'custom') {
                imapHost = emailConfig.imapHost;
                smtpHost = emailConfig.smtpHost;
                imapPort = emailConfig.imapPort || 993;
                smtpPort = emailConfig.smtpPort || 587;
                imapSecure = emailConfig.imapSecure !== undefined ? emailConfig.imapSecure : true;
                smtpSecure = emailConfig.smtpSecure !== undefined ? emailConfig.smtpSecure : false;
            } else {
                imapHost = provider.imap.host;
                smtpHost = provider.smtp.host;
                imapPort = provider.imap.port;
                smtpPort = provider.smtp.port;
                imapSecure = provider.imap.secure;
                smtpSecure = provider.smtp.secure;
            }

            // Configure SMTP first
            console.log('Configuring SMTP transport...');
            this.smtpTransporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: {
                    user: emailConfig.email,
                    pass: emailConfig.password
                },
                debug: true,
                logger: true
            });

            // Test SMTP connection
            console.log('Testing SMTP connection...');
            await this.smtpTransporter.verify();
            console.log('SMTP connection successful');

            // Configure IMAP
            const imapConfig = {
                imap: {
                    user: emailConfig.email,
                    password: emailConfig.password,
                    host: imapHost,
                    port: imapPort,
                    tls: imapSecure,
                    authTimeout: 10000,
                    connTimeout: 15000,
                    tlsOptions: { rejectUnauthorized: false }
                }
            };

            console.log('Connecting to IMAP...');
            // Connect to IMAP
            this.imapConnection = await imaps.connect(imapConfig);
            console.log('IMAP connection successful');
            
            this.isConnected = true;

            // Save config (encrypt password)
            this.settings.set('emailConfig', {
                ...emailConfig,
                password: this.encryptPassword(emailConfig.password)
            });
            this.settings.set('emailEnabled', true);

            this.emit('connected');
            console.log('Email connection completed successfully');
            
            // Try to fetch a few emails to verify everything works
            try {
                await this.fetchEmails('INBOX', 5);
                console.log('Email fetch test successful');
            } catch (fetchError) {
                console.warn('Email fetch test failed:', fetchError.message);
            }

            return true;
        } catch (error) {
            console.error('Email connection failed:', error);
            this.emit('error', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.imapConnection) {
            this.imapConnection.end();
            this.imapConnection = null;
        }
        
        if (this.smtpTransporter) {
            this.smtpTransporter.close();
            this.smtpTransporter = null;
        }

        this.isConnected = false;
        this.emit('disconnected');
    }

    async fetchEmails(folder = 'INBOX', limit = 50) {
        if (!this.isConnected || !this.imapConnection) {
            throw new Error('Not connected to email server');
        }

        try {
            await this.imapConnection.openBox(folder);
            
            const searchCriteria = ['ALL'];
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT'],
                markSeen: false,
                struct: true
            };

            const messages = await this.imapConnection.search(searchCriteria, fetchOptions);
            
            const emails = messages.slice(-limit).reverse().map(message => {
                const header = message.parts.find(part => part.which === 'HEADER');
                const body = message.parts.find(part => part.which === 'TEXT');
                
                const headerObj = header ? header.body : {};
                
                return {
                    id: message.attributes.uid,
                    messageId: headerObj['message-id'] ? headerObj['message-id'][0] : '',
                    from: headerObj.from ? headerObj.from[0] : '',
                    to: headerObj.to ? headerObj.to[0] : '',
                    subject: headerObj.subject ? headerObj.subject[0] : 'No Subject',
                    date: headerObj.date ? new Date(headerObj.date[0]) : new Date(),
                    body: body ? body.body : '',
                    seen: message.attributes.flags.includes('\\Seen'),
                    folder: folder,
                    attachments: this.parseAttachments(message.attributes.struct)
                };
            });

            this.emails = emails;
            this.currentFolder = folder;
            this.emit('emails-updated', emails);
            
            return emails;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async sendEmail(to, subject, body, attachments = []) {
        if (!this.smtpTransporter) {
            throw new Error('SMTP not configured');
        }

        try {
            const emailConfig = this.settings.get('emailConfig');
            if (!emailConfig || !emailConfig.email) {
                throw new Error('Email configuration missing');
            }

            const mailOptions = {
                from: emailConfig.email,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: subject,
                html: body,
                attachments: attachments
            };

            console.log('Sending email with options:', { 
                from: mailOptions.from, 
                to: mailOptions.to, 
                subject: mailOptions.subject 
            });

            const result = await this.smtpTransporter.sendMail(mailOptions);
            this.emit('email-sent', result);
            
            return result;
        } catch (error) {
            console.error('Email send error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    async markAsRead(emailId) {
        if (!this.imapConnection) return;

        try {
            await this.imapConnection.addFlags(emailId, ['\\Seen']);
            const email = this.emails.find(e => e.id === emailId);
            if (email) {
                email.seen = true;
                this.emit('emails-updated', this.emails);
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    async deleteEmail(emailId) {
        if (!this.imapConnection) return;

        try {
            await this.imapConnection.addFlags(emailId, ['\\Deleted']);
            await this.imapConnection.expunge();
            
            this.emails = this.emails.filter(e => e.id !== emailId);
            this.emit('emails-updated', this.emails);
        } catch (error) {
            this.emit('error', error);
        }
    }

    parseAttachments(struct) {
        const attachments = [];
        
        if (struct && Array.isArray(struct)) {
            struct.forEach(part => {
                if (part.disposition && part.disposition.type === 'attachment') {
                    attachments.push({
                        filename: part.disposition.params.filename,
                        contentType: part.subtype,
                        size: part.size
                    });
                }
            });
        }
        
        return attachments;
    }

    encryptPassword(password) {
        const CryptoJS = require('crypto-js');
        const secretKey = 'notesearch-secret';
        return CryptoJS.AES.encrypt(password, secretKey).toString();
    }

    decryptPassword(encryptedPassword) {
        const CryptoJS = require('crypto-js');
        const secretKey = 'notesearch-secret';
        const bytes = CryptoJS.AES.decrypt(encryptedPassword, secretKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    async shareNoteViaEmail(noteContent, noteTitle) {
        const emailConfig = this.settings.get('emailConfig');
        if (!emailConfig || !emailConfig.email) {
            throw new Error('No email configured');
        }

        const subject = `Shared Note: ${noteTitle}`;
        const body = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">${noteTitle}</h2>
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                    <pre style="white-space: pre-wrap; font-family: inherit; margin: 0; color: #1e293b;">${noteContent}</pre>
                </div>
                <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px;">
                    Shared from NoteSearch
                </p>
            </div>
        `;

        return await this.sendEmail(emailConfig.email, subject, body);
    }

    // Auto-connect on startup if configured
    async autoConnect() {
        const emailConfig = this.settings.get('emailConfig');
        const emailEnabled = this.settings.get('emailEnabled');

        if (emailEnabled && emailConfig && emailConfig.email && emailConfig.password) {
            try {
                emailConfig.password = this.decryptPassword(emailConfig.password);
                await this.connect(emailConfig);
            } catch (error) {
                console.warn('Auto-connect to email failed:', error.message);
                this.settings.set('emailEnabled', false);
            }
        }
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected,
            email: this.settings.get('emailConfig').email || null,
            provider: this.settings.get('emailConfig').provider || null
        };
    }
}

module.exports = EmailManager;