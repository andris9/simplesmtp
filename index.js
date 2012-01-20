var RAIServer = require("rai").RAIServer,
    EventEmitter = require('events').EventEmitter,
    oslib = require('os'),
    utillib = require("util"),
    dnslib = require("dns");

module.exports.SMTPServer = SMTPServer;

/**
 * <p>Constructs a SMTP server</p>
 * 
 * <p>Possible options are:</p>
 * 
 * <ul>
 *     <li><b>HOSTNAME</b> - the hostname of the server, will be used for
 *         informational messages</li>
 *     <li><b>debug</b> - if set to true, print out messages about the connection</li>
 *     <li><b>timeout</b> - client timeout in milliseconds, defaults to 60 000</li>
 *     <li><b>SMTPBanner</b> - greeting banner that is sent to the client on connection</li>
 *     <li><b>requireAuthentication</b> - if set to true, require that the client
 *         must authenticate itself</li>
 *     <li><b>validateSender</b> - if set to true, emit <code>'validateSender'</code>
 *         with <code>email</code> and <code>callback</code> when the client
 *         enters <code>MAIL FROM:&lt;address&gt;</code></li>
 *     <li><b>validateRecipients</b> - if set to true, emit <code>'validateRecipient'</code>
 *         with <code>email</code> and <code>callback</code> when the client
 *         enters <code>RCPT TO:&lt;address&gt;</code></li>
 *     <li><b>maxSize</b> - maximum size of an e-mail in bytes</li>
 * </ul>
 * 
 * @constructor
 * @param {Object} [options] Options object
 */
function SMTPServer(options){
    EventEmitter.call(this);
    
    this.options = options || {};
    this.options.HOSTNAME = this.options.HOSTNAME || (oslib.hostname && oslib.hostname()) ||
               (oslib.getHostname && oslib.getHostname()) ||
               "127.0.0.1";

    this.SMTPServer = new RAIServer({
        timeout: this.options.timeout || 60*1000,
        disconnectOnTimeout: false,
        debug: !!this.options.debug
    });
    
    this.SMTPServer.on("connection", this._createSMTPConnection.bind(this));
}
utillib.inherits(SMTPServer, EventEmitter);

/**
 * Server starts listening on defined port and hostname
 * 
 * @param {Number} port The port number to listen
 * @param {String} [host] The hostname to listen
 * @param {Function} callback The callback function to run when the server is listening
 */
SMTPServer.prototype.listen = function(port, host, callback){
    this.SMTPServer.listen(port, host, callback);
}

/**
 * <p>Creates a new {@link SMTPConnection} object and links the main server with
 * the client socket</p>
 * 
 * @param {Object} client RAISocket object to a client
 */
SMTPServer.prototype._createSMTPConnection = function(client){
    new SMTPConnection(this, client);
}

/**
 * <p>Sets up a handler for the connected client</p>
 * 
 * <p>Restarts the state and sets up event listeners for client actions</p>
 * 
 * @constructor
 * @param {Object} server {@link SMTPServer} instance
 * @param {Object} client RAISocket instance for the client
 */
function SMTPConnection(server, client){
    this.server = server;
    this.client = client;

    this.init();

    console.log("Connection from", this.client.remoteAddress)
    
    this.client.on("timeout", this._onTimeout.bind(this));
    this.client.on("error", this._onError.bind(this));
    this.client.on("command", this._onCommand.bind(this));
    this.client.on("end", this._onEnd.bind(this));
    
    this.client.on("data", this._onData.bind(this));
    this.client.on("ready", this._onDataReady.bind(this));
    
    // Send the greeting banner
    this.client.send("220 "+this.server.options.HOSTNAME+" "+(this.server.options.SMTPBanner || "ESMTP node.js simplesmtp"));
}

/**
 * <p>Reset the envelope state</p>
 * 
 * <p>If <code>keepAuthData</code> is set to true, then doesn't remove
 * authentication data</p>
 * 
 * @param {Boolean} [keepAuthData=false] If set to true keep authentication data
 */
SMTPConnection.prototype.init = function(keepAuthData){
    this.envelope = {from: "", to:[], date: new Date()};
    
    if(!keepAuthData){
        this.authentication = {
            username: false,
            authenticated: false,
            state: "NORMAL"
        };
    }
}

/**
 * <p>Sends a message to the client and closes the connection</p>
 * 
 * @param {String} [message] if set, send it to the client before disconnecting
 */
SMTPConnection.prototype.end = function(message){
    if(message){
        this.client.send(message);
    }
    this.client.end();
}

/**
 * <p>Will be called when the connection to the client is closed</p>
 */
SMTPConnection.prototype._onEnd = function(){
    console.log("Connection closed to", this.client.remoteAddress);
}

/**
 * <p>Will be called when timeout occurs</p>
 */
SMTPConnection.prototype._onTimeout = function(){
    this.end("421 4.4.2 "+this.server.options.HOSTNAME+" Error: timeout exceeded");
}

/**
 * <p>Will be called when an error occurs</p>
 */
SMTPConnection.prototype._onError = function(){
    this.end("421 4.4.2 "+this.server.options.HOSTNAME+" Error: client error");
}

/**
 * <p>Will be called when a command is received from the client</p>
 * 
 * @param 
 */
SMTPConnection.prototype._onCommand = function(command, payload){

    if(this.authentication.state == "AUTHENTICATING"){
        this._handleAuthLogin(command);
        return;
    }
    
    switch(command){
        case "HELO":
            this._onCommandHELO(payload.toString("utf-8").trim());
            break;
            
        case "RSET":
            this._onCommandRSET();
            break;
            
        case "EHLO":
            this._onCommandEHLO(payload.toString("utf-8").trim());
            break;
            
        case "QUIT":
            this.end("221 2.0.0 Goodbye!");
            break;
            
        case "VRFY":
            this.end("252 2.1.5 Send some mail, I'll try my best");
            break;
            
        case "MAIL":
            this._onCommandMAIL(payload.toString("utf-8").trim());
            break;
        
        case "RCPT":
            this._onCommandRCPT(payload.toString("utf-8").trim());
            break;
        
        case "AUTH":
            this._onCommandAUTH(payload);
            break;
        
        case "DATA":
            this._onCommandDATA();
            break;
        
        case "STARTTLS":
            this._onCommandSTARTTLS();
            break;
        default:
            this.client.send("502 5.5.2 Error: command not recognized");
    }
    
}

SMTPConnection.prototype._onCommandMAIL = function(mail){
    var match, email, domain;
    
    if(!this.hostNameAppearsAs){
        return this.client.send("503 5.5.1 Error: send HELO/EHLO first");
    }
    
    if(!this.client.secureConnection){
        return this.client.send("530 5.7.0 Must issue a STARTTLS command first");
    }
    
    if(this.server.options.requireAuthentication && !this.authentication.authenticated){
        return this.client.send("530 5.5.1 Authentication Required");
    }
    
    if(this.envelope.from){
        return this.client.send("503 5.5.1 Error: nested MAIL command");
    }
    
    if(!(match = mail.match(/^from\:\s*\<([^@>]+\@([^@>]+))\>$/i))){
        return this.client.send("501 5.1.7 Bad sender address syntax");
    }
    
    email = match[1] || "";
    domain = (match[2] || "").toLowerCase();
    
    dnslib.resolveMx(domain, (function(err, addresses){
        if(err || !addresses || !addresses.length){
            return this.client.send("450 4.1.8 <"+email+">: Sender address rejected: Domain not found");
        }
        
        if(this.server.options.validateSender){
            this.server.emit("validateSender", email, (function(err){
                if(err){
                    return this.client.send("550 5.1.1 <"+email+">: Sender address rejected: User unknown in local sender table");
                }
                
                // force domain part to be lowercase
                email = email.substr(0, email.length - domain.length) + domain;
                this.envelope.from = email;
                this.client.send("250 2.1.0 Ok");
        
            }).bind(this));
        }else{
            // force domain part to be lowercase
            email = email.substr(0, email.length - domain.length) + domain;
            this.envelope.from = email;
            this.client.send("250 2.1.0 Ok");
        }
    }).bind(this)); 
    
}

SMTPConnection.prototype._onCommandRCPT = function(mail){
    var match, email, domain;
    
    if(!this.client.secureConnection){
        return this.client.send("530 5.7.0 Must issue a STARTTLS command first");
    }
    
    if(!this.envelope.from){
        return this.client.send("503 5.5.1 Error: need MAIL command");
    }
    
    if(!(match = mail.match(/^to\:\s*\<([^@>]+\@([^@>]+))\>$/i))){
        return this.client.send("501 5.1.7 Bad sender address syntax");
    }
    
    email = match[1] || "";
    domain = (match[2] || "").toLowerCase();
    
    dnslib.resolveMx(domain, (function(err, addresses){
        if(err || !addresses || !addresses.length){
            return this.client.send("450 4.1.8 <"+email+">: Recipient address rejected: Domain not found");
        }
        
        if(this.server.options.validateRecipients){
            this.server.emit("validateRecipient", email, (function(err){
                if(err){
                    return this.client.send("550 5.1.1 <"+email+">: Recipient address rejected: User unknown in local recipient table");
                }
                
                // force domain part to be lowercase
                email = email.substr(0, email.length - domain.length) + domain;
                
                // add to recipients list
                if(this.envelope.to.indexOf(email)<0){
                    this.envelope.to.push(email);
                }
                this.client.send("250 2.1.0 Ok");
            }).bind(this));
        }else{
            // force domain part to be lowercase
            email = email.substr(0, email.length - domain.length) + domain;
            
            // add to recipients list
            if(this.envelope.to.indexOf(email)<0){
                this.envelope.to.push(email);
            }
            this.client.send("250 2.1.0 Ok");
        }
    }).bind(this));
    
}

SMTPConnection.prototype._onCommandDATA = function(){
    if(!this.client.secureConnection){
        return this.client.send("530 5.7.0 Must issue a STARTTLS command first");
    }
    
    if(!this.envelope.to.length){
        return this.client.send("503 5.5.1 Error: need RCPT command");
    }
    
    this.client.startDataMode();
    this.client.send("354 End data with <CR><LF>.<CR><LF>");
    this.server.emit("startData", this.envelope);
}

SMTPConnection.prototype._onCommandRSET = function(){
    this.init();
    this.client.send("250 2.0.0 Ok");
}

SMTPConnection.prototype._onCommandAUTH = function(payload){
    var method;
    
    if(!this.server.options.requireAuthentication){
        return this.client.send("503 5.5.1 Error: authentication not enabled");
    }
    
    if(!this.client.secureConnection){
        return this.client.send("530 5.7.0 Must issue a STARTTLS command first");
    }
    
    if(this.authentication.authenticated){
        return this.client.send("503 5.7.0 No identity changes permitted");
    }
    
    payload = payload.toString("utf-8").trim().split(" ");
    method = payload.shift().trim().toUpperCase()
    
    if(["LOGIN", "PLAIN"].indexOf(method)<0){
        return this.client.send("535 5.7.8 Error: authentication failed: no mechanism available");
    }
    
    switch(method){
        case "PLAIN":
            this._handleAuthPlain(payload);
            break;
        case "LOGIN":
            this._handleAuthLogin();
            break;
    }
}

SMTPConnection.prototype._onCommandSTARTTLS = function(){
    if(this.client.secureConnection){
        return this.client.send("554 5.5.1 Error: TLS already active");
    }
    
    this.client.send("220 2.0.0 Ready to start TLS");
    
    this.client.startTLS((function(){
        // Connection secured
    }).bind(this));
}

SMTPConnection.prototype._onCommandHELO = function(host){
    if(!host){
        return this.client.send("501 Syntax: EHLO hostname");
    }else{
        this.hostNameAppearsAs = host;
    }
    this.client.send("250 "+this.server.options.HOSTNAME+" at your service, ["+
        this.client.remoteAddress+"]");
}

SMTPConnection.prototype._onCommandEHLO = function(host){
    var response = [this.server.options.HOSTNAME+" at your service, ["+
        this.client.remoteAddress+"]", "8BITMIME", "ENHANCEDSTATUSCODES"];
    
    if(this.server.options.maxSize){
        response.push("SIZE "+this.server.options.maxSize);
    }
    
    if(this.client.secureConnection && this.server.options.requireAuthentication){
        response.push("AUTH LOGIN PLAIN");
        response.push("AUTH=LOGIN PLAIN");
    }
    
    if(!this.client.secureConnection){
        response.push("STARTTLS");
    }
    
    if(!host){
        return this.client.send("501 Syntax: EHLO hostname");
    }else{
        this.hostNameAppearsAs = host;
    }
    
    this.client.send(response.map(function(feature, i, arr){
        return "250"+(i<arr.length-1?"-":" ")+feature;
    }).join("\r\n"));    
}

SMTPConnection.prototype._handleAuthPlain = function(payload){
    var userdata = new Buffer(payload.join(" "), "base64"), password;
    userdata = userdata.toString("utf-8").split("\u0000");
    this.authentication.username = userdata[1] || userdata[0] || "";
    password = userdata[2] || "";
    
    this.server.emit("authorizeUser", 
        this.envelope, 
        this.authentication.username, 
        password, 
        (function(err, success){
            if(err || !success){
                this.authentication.authenticated = false;
                this.authentication.username = false;
                this.authentication.state = "NORMAL";
                return this.client.send("535 5.7.8 Error: authentication failed: generic failure");
            }
            this.client.send("235 2.7.0 Authentication successful");
            this.authentication.authenticated = true;
            this.authentication.state = "AUTHENTICATED";
        }).bind(this));
}

SMTPConnection.prototype._handleAuthLogin = function(payload){
    if(this.authentication.state == "NORMAL"){
        this.authentication.state = "AUTHENTICATING";
        this.client.send("334 VXNlcm5hbWU6");
    }else if(this.authentication.state == "AUTHENTICATING"){
        if(this.authentication.username === false){
            this.authentication.username = new Buffer(payload, "base64").toString("utf-8");
            this.client.send("334 UGFzc3dvcmQ6");
        }else{
            this.authentication.state == "VERIFYING";
            this.server.emit("authorizeUser", 
                this.envelope, 
                this.authentication.username, 
                new Buffer(payload, "base64").toString("utf-8"), 
                (function(err, success){
                    if(err || !success){
                        this.authentication.authenticated = false;
                        this.authentication.username = false;
                        this.authentication.state = "NORMAL";
                        return this.client.send("535 5.7.8 Error: authentication failed: generic failure");
                    }
                    this.client.send("235 2.7.0 Authentication successful");
                    this.authentication.authenticated = true;
                    this.authentication.state = "AUTHENTICATED";
                }).bind(this));
        }
        
    }
}

SMTPConnection.prototype._onData = function(chunk){
    this.server.emit("data", this.envelope, chunk);
}

SMTPConnection.prototype._onDataReady = function(){
    this.server.emit("dataReady", this.envelope, (function(err, code){
        this.init(true); //reset state, keep auth data
        
        if(err){
            this.client.send("550 FAILED");
        }else{
            this.client.send("250 2.0.0 Ok: queued as "+(code || "FOOBARBAZ"));
        }
        
    }).bind(this));
}
