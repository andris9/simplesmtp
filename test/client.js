var testCase = require('nodeunit').testCase,
    runClientMockup = require("rai").runClientMockup,
    simplesmtp = require("../index"),
    netlib = require("net");

var PORT_NUMBER = 8397;

exports["General tests"] = {
    setUp: function (callback) {
        this.server = new simplesmtp.createServer({});
        this.server.listen(PORT_NUMBER, function(err){
            if(err){
                throw err;
            }else{
                callback();
            }
        });
        
    },
    
    tearDown: function (callback) {
        this.server.end(callback);
    },
    
    "Connect and setup": function(test){
        var client = simplesmtp.connect(PORT_NUMBER, false, {});
        
        client.on("idle", function(){
            // Client is ready to take messages
            test.ok(true);
            client.close();
        });
        
        client.on("error", function(err){
            test.ok(false);
        });
        
        client.on("end", function(){
            test.done();
        });
    }
}

exports["Secure server"] = {
    setUp: function (callback) {
        this.server = new simplesmtp.createServer({
            secureConnection: true
        });
        this.server.listen(PORT_NUMBER, function(err){
            if(err){
                throw err;
            }else{
                callback();
            }
        });
        
    },
    
    tearDown: function (callback) {
        this.server.end(callback);
    },
    
    "Connect and setup": function(test){
        var client = simplesmtp.connect(PORT_NUMBER, false, {
            secureConnection: true
        });
        
        client.on("idle", function(){
            // Client is ready to take messages
            test.ok(true);
            client.close();
        });
        
        client.on("error", function(err){
            test.ok(false);
        });
        
        client.on("end", function(){
            test.done();
        });
    }
}

exports["Disabled EHLO"] = {
    setUp: function (callback) {
        this.server = new simplesmtp.createServer({disableEHLO: true});
        this.server.listen(PORT_NUMBER, function(err){
            if(err){
                throw err;
            }else{
                callback();
            }
        });
        
    },
    
    tearDown: function (callback) {
        this.server.end(callback);
    },
    
    "Connect and setup": function(test){
        var client = simplesmtp.connect(PORT_NUMBER, false, {});
        
        client.on("idle", function(){
            // Client is ready to take messages
            test.ok(true);
            client.close();
        });
        
        client.on("error", function(err){
            test.ok(false);
        });
        
        client.on("end", function(){
            test.done();
        });
    }
}

exports["Authentication needed"] = {
    setUp: function (callback) {
        this.server = new simplesmtp.createServer({
            requireAuthentication: true
        });
        
        this.server.on("authorizeUser", function(envelope, user, pass, callback){
            callback(null, user=="test1" && pass == "test2");
        });
        
        this.server.listen(PORT_NUMBER, function(err){
            if(err){
                throw err;
            }else{
                callback();
            }
        });
        
    },
    
    tearDown: function (callback) {
        this.server.end(callback);
    },
    
    "Auth success": function(test){
        var client = simplesmtp.connect(PORT_NUMBER, false, {
            auth: {
                user: "test1",
                pass: "test2"
            }
        });
        
        client.on("idle", function(){
            // Client is ready to take messages
            test.ok(true);
            client.close();
        });
        
        client.on("error", function(err){
            test.ok(false);
        });
        
        client.on("end", function(){
            test.done();
        });
    },
    
    "Auth fails": function(test){
        var client = simplesmtp.connect(PORT_NUMBER, false, {
            auth: {
                user: "test3",
                pass: "test4"
            }
        });
        
        client.on("idle", function(){
            // Client is ready to take messages
            test.ok(false); // should not occur
            client.close();
        });
        
        client.on("error", function(err){
            test.ok(true); // login failed
            client.close();
        });
        
        client.on("end", function(){
            test.done();
        });
    }
}

exports["Message tests"] = {
    setUp: function (callback) {
        this.server = new simplesmtp.createServer();
        this.server.listen(PORT_NUMBER, function(err){
            if(err){
                throw err;
            }else{
                callback();
            }
        });
        
    },
    
    tearDown: function (callback) {
        this.server.end(callback);
    },
    
    
}