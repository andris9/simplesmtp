var simplesmtp = require("../index"),
    fs = require("fs");

// Example for http://tools.ietf.org/search/rfc1870

var allowedRecipientDomains = ["node.ee", "neti.ee"];

var smtp = simplesmtp.createServer({
    maxSize: 5000, // maxSize must be set in order to support SIZE
    disableDNSValidation: true
});
smtp.listen(25);

// Set up recipient validation function
smtp.on("validateRecipient", function(connection, email, done){

    // SIZE value can be found from connection.messageSize
    if(typeof connection.messageSize == "number" && connection.messageSize > 100){
        var err = new Error("Max space reached");
        // anything in the SMTPResponse will be reported back to user. If not set, default error message wil, be used 
        err.SMTPResponse = "452 Insufficient channel storage: " + email;
        done(err);
    }else{
        done();
    }
});

smtp.on("startData", function(connection){
    connection.saveStream = fs.createWriteStream("/tmp/message.txt");
});

smtp.on("data", function(connection, chunk){
    connection.saveStream.write(chunk);
});

smtp.on("dataReady", function(connection, done){
    connection.saveStream.end();
    done();

    console.log("Delivered message by " + connection.from +
        " to " + connection.to.join(", ") + ", sent from " + connection.host +
        " (" + connection.remoteAddress + ")");
});