#!/usr/bin/node
var http = require('http'),
    querystring = require('querystring'),
    crypto = require('crypto'),
    url = require('url'),
    path = require('path'),
    fs = require('fs');

var app = {
    //config from eniroment
    'config': {
        key:    process.env['NEXMO_KEY'],
        secret: process.env['NEXMO_SECRET'],
        from:   process.env['NEXMO_FROM']
    },
    //store the proxy info, should be some key/value store or some kind of database
    'proxy': {},
    'lookup': {},
    'users': {},
    //here are users waiting for a conneciton
    'waiting': {},
    'queue': [],
    'process': function(number, text){
        //is there an active chat for this number
        var id = this.getChatId(number);

        //process chat
        if(id){
            //check for command
            switch(text.toLowerCase()){
                case '#end':
                    this.end(number);
                    return;
                default:
                    //add to message log
                    this.proxy[id].messages.push({
                        'number': number,
                        'message': text,
                        'created': new Date(),
                        'user': this.users[number]
                    });

                    //relay the chat to the other user
                    this.proxy[id].users.forEach(function(user){
                        if(user.number != number){
                            this.send(user.number, text);
                        }
                    }, this);
            }
            return;
        }

        //check for new chat, valid email

        if(text.toLowerCase().trim().match(/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/)){
            this.start(number, text);
            return;
        }

        //no chat, send usage message
        this.log(number, 'chat not found, sending help');
        this.send(number, 'To chat, text your email address.');
        return;

    },
    'start': function(number, email){
        this.log(number, 'starting chat');
        var user = {
            'number': number,
            'email': email,
            'md5': crypto.createHash('md5').update(email.toLowerCase().trim()).digest("hex"),
            'created': new Date()
        }

        //make sure user's not already waiting
        if(this.waiting[number]){
            this.log(number, 'already waiting');
            return;
        }

        //if no one is waiting, queue up this user (this only makes sense when storage is not in the threads memory)
        if(this.queue.length == 0){
            this.log(number, 'creating new chat');
            this.waiting[number] = (user);
            this.queue.push(number);
            this.send(number, 'Waiting for another user...');
            return;
        }

        //people are waiting, get one
        var key = this.queue.shift();
        var connect = this.waiting[key];
        delete this.waiting[key];
        var chat = {
            'users': [user, connect],
            'active': true,
            'messages': [],
            'id': crypto.createHash('md5').update(user.email+connect.email).digest("hex")
        };

        //add to proxy
        this.proxy[chat.id] = chat;

        //map users
        this.lookup[user.number] = chat.id;
        this.lookup[connect.number] = chat.id;

        this.users[user.number] = user;
        this.users[connect.number] = connect;

        this.log(number, 'chat found, user added');

        //let them both know
        chat.users.forEach(function(user){
            this.send(user.number, 'Connected, text #end to stop.');
        }, this);
    },
    'end': function(number){
        this.log(number, 'ending chat');
        var id = this.getChatId(number);
        var chat = this.proxy[id];

        //remove chat
        delete this.proxy[id];

        //send message and clean up users hash
        chat.users.forEach(function(user){
            this.send(user.number, 'Thanks for chatting. Text your email address to start chat.');
            delete this.users[number];
        }, this);
    },
    'getChatId': function(number){
        //this is not efficient
        return this.lookup[number];
    },
    'send': function(to, text){
        //make a request to nexmo
        var options = {
            host: 'rest.nexmo.com',
            //host: 'lx7aol1hflre.runscope.net',
            port: 80,
            path: '/sms/json',
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        };

        var app = this;
        var req = http.request(options, function(res){
            res.content = '';
            res.on('data', function (chunk) {
                res.content += chunk;
            });

            res.on('end', function(){
                data = JSON.parse(res.content);
                data.messages.forEach(function(message){
                    if(message['error-text']){
                        app.log(to, message['error-text']);
                    } else {
                        app.log(to, message['message-id']);
                    }
                });

            });
        });

        req.on('error', function(e) {
            console.log('problem with request: ' + e.message);
        });

        req.write(JSON.stringify({
            api_key: this.config.key,
            api_secret: this.config.secret,
            from: this.config.from,
            to: to,
            text: text
        }));
        req.end();

        this.log(to, 'sending message: '+text);

    },
    'log': function(number, text){
        console.log('['+number+'] '+text);
    }
};

http.createServer(function (req, res) {
    //simple request router, wrangle the uri and params
    var parsed = url.parse(req.url, true);
    var params = parsed.query;

    //pull in the request
    req.content = '';
    req.on("data", function(chunk){
        req.content += chunk; //keep pulling in the content
    });

    //once all the request is in, process things
    req.on("end", function(){
        var body = querystring.parse(req.content);

        //combine query and post
        for (var param in body){
            params[param] = body[param];
        }

        //looks like a nexmo request
        if(params.hasOwnProperty('msisdn') & params.hasOwnProperty('text')){
            //close the connection, everything is good
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end();
            app.process(params.msisdn, params.text);
            return;
        }

        //ajax request
        if(req.headers['x-requested-with']){
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(app.proxy));
        }

        //got this far, must be a static resource
        switch(parsed.pathname){
            case '/':
                var file = 'html/index.html';
                var type = 'text/html';
                break;
            case '/app.js':
                var file = 'html/app.js';
                var type = 'application/json';
                break;
            //guess not
            default:
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end();
                return;
        }

        var file = path.join(process.cwd(), file);
        res.writeHead(200, {'Content-Type': type});
        var stream = fs.createReadStream(file);
        stream.pipe(res);
    });
}).listen(1337, '127.0.0.1');

console.log('Server running at http://127.0.0.1:1337/');
