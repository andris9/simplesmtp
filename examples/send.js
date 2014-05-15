var simplesmtp = require('../index');

mail('sender@example.com', 'receiver@example.com', 'subject: test\r\n\r\nhello world!');

/**
 * Send a raw email
 *
 * @param {String} from E-mail address of the sender
 * @param {String|Array} to E-mail address or a list of addresses of the receiver
 * @param {[type]} message Mime message
 */
function mail(from, to, message) {
    var client = simplesmtp.connect(465, 'smtp.gmail.com', {
        secureConnection: true,
        auth: {
            user: 'gmail.username@gmail.com',
            pass: 'gmail_pass'
        },
        debug: true
    });

    client.once('idle', function() {
        client.useEnvelope({
            from: from,
            to: [].concat(to || [])
        });
    });

    client.on('message', function() {
        client.write(message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'));
        client.end();
    });

    client.on('ready', function(success) {
        client.quit();
    });

    client.on('error', function(err) {
        console.log('ERROR');
        console.log(err);
    });

    client.on('end', function() {
        console.log('DONE')
    });
}