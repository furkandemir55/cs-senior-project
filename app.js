const express = require('express'),
    session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const bodyparser = require('body-parser');
const SpotifyWebApi = require('spotify-web-api-node');
const multer = require('multer');
const upload = multer({dest: __dirname + '/uploads/images'});
const app = express();
const http = require('http');
const socketIo = require('socket.io');
const server = http.Server(app);
const fs = require('fs');
const spawn = require("child_process").spawn;
const io = socketIo(server);
const Transform = require('stream').Transform;
const util = require('util');
server.listen(80, '0.0.0.0');
io.attach(server, {
    pingInterval: 5000,
    pingTimeout: 15000
});
const sessionMiddleware = session({
    secret: "this is a big secret"
});
io.use(function (socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});
app.use(bodyparser.urlencoded({extended: false}));
app.use(bodyparser.json());
app.use(sessionMiddleware);


//spotify application key and secret
const appKey = '88ce56cd91a544278175ceccc32c54ff';
const appSecret = '4daa917b086b49b19a5ebe1148c9407d';
//spotify options for recommendation algorithm
const emotionOptions = {
    happy: {
        target_energy: 0.8,
        target_instrumentalness: 0.5,
        target_popularity: 80,
        target_valence: 1.0,
        target_danceability: 1.0,
        limit: 50
    },
    angry: {
        target_energy: 1.0,
        target_instrumentalness: 1.0,
        target_valence: 0.0,
        seed_genres: ['heavy-metal', 'black-metal'],
        target_tempo: 150,
        limit: 50
    }, scared: {
        target_energy: 0.4,
        target_instrumentalness: 0.9,
        target_speechiness: 0.1,
        target_popularity: 50,
        seed_genres: ['piano', 'classical'],
        target_valence: 0.6,
        limit: 50
    }, sad: {
        target_energy: 0.0,
        target_instrumentalness: 0.5,
        target_valence: 0.0,
        limit: 50
    }
};

//socket connection
io.on('connection', (socket) => {
    console.log('a user connected');
    socket.emit('userInfo', {uid: socket.request.session.uid, spotify: socket.request.session.spotify});

    //Spotify Playlist Creation is requested by the client
    socket.on('spotifyCreate', emotion => {
        //A new api is created with the users' credentials
        var loggedInSpotifyApi = new SpotifyWebApi();
        loggedInSpotifyApi.setAccessToken(socket.request.session.access_token);
        //Users most listened artists are queried.
        loggedInSpotifyApi.getMyTopArtists({limit: 3}).then(data => {
            //Artists are added to algorithm to create some uniqueness between playlists
            emotionOptions[emotion].seed_artists = data.body.items.map(artist => artist.id);
            loggedInSpotifyApi.getRecommendations(emotionOptions[emotion]).then(done => {
                //50 recommended tracks are queried and added to trackList array
                const trackList = [];
                done.body.tracks.forEach(track => trackList.push(track.uri));
                //getMe function is called to get users spotify id
                loggedInSpotifyApi.getMe().then(r => {
                    const userId = r.body.id;
                    const playlistName = new Date().toString() + ' Generated Playlist Emotion: ' + emotion;
                    //A private playlist is generated for the user
                    loggedInSpotifyApi.createPlaylist(userId, playlistName, {'public': false}).then(data => {
                        //tracks in the array are added to the Playlist
                        loggedInSpotifyApi.addTracksToPlaylist(data.body.id, trackList).then(r => socket.emit('done')).catch(err => 'trackadd err' + err)
                    }).catch(err => console.log('playlist err' + err))
                }).catch(err => console.log('meerr' + err));
            }).catch(err => console.log('recommendationerr' + err));
        }).catch(err => console.log('topartisterr' + err));
    });
});


app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true
}));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.engine('html', require('ejs').renderFile);


app.get('/', function (req, res, next) {
    //uid generated for the session
    if (typeof req.session.uid === 'undefined')
        req.session.uid = Math.random() * 216;
    if (typeof req.session.spotify === 'undefined')
        req.session.spotify = false;
    res.render('index.html', {title: 'Expres2s'});
});

//images from the client are uploaded to the server
app.post('/', upload.array('images'), function (req, res, next) {
    //run the python script with images to analyze
    const pythonProcess = spawn('cmd.exe', ['/c D:\\Programs\\miniconda\\Scripts\\conda.exe run -n senior python C:\\Users\\Furkan\\Desktop\\bitirme\\olduuuu\\predictSingleImage.py']);
    pythonProcess.stdout.on('data', (data) => {
        //results of the script
        const arr = data.toString().split('\n');
        let counts = arr.reduce((a, c) => {
            a[c] = (a[c] || 0) + 1;
            return a;
        }, {});
        let maxCount = Math.max(...Object.values(counts));
        //get the most occured emotion in the images.
        let emotion = Object.keys(counts).filter(k => counts[k] === maxCount);
        console.log(emotion.toLocaleString());
        //broadcast the emotion with uid, correct client will take it.
        if (typeof req.session.uid !== 'undefined')
            io.emit('scriptDone', {uid: req.session.uid, emotion: emotion.toLocaleString()});

        //after capturing the emotion, images are deleted to save space
        const directory = './uploads/images';
        fs.readdir(directory, (err, files) => {
            if (err) throw err;
            for (const file of files) {
                fs.unlink(path.join(directory, file), err => {
                    if (err) throw err;
                });
            }
        });
        res.sendStatus(200);
    });
});

//permission for spotify api
const scopes = ['playlist-read-collaborative', 'playlist-modify-public', 'user-read-private', 'user-modify-playback-state', 'user-top-read', 'playlist-modify-private'];
//redirect user to spotify authorization api
app.get('/spotifyLogin', function (req, res, next) {
    var authorizeURL = spotifyApi.createAuthorizeURL(scopes, null, true);
    console.log(authorizeURL);
    res.statusCode = 302;
    res.setHeader("Location", authorizeURL);
    res.end();
});
app.get('/spotify_callback', function (req, res, next) {
    req.session.spotify = true;
    io.emit('spotifyLogin', req.session.uid);
    res.render('spotify_callback.html')
});
var spotifyApi = new SpotifyWebApi({
    clientId: appKey,
    clientSecret: appSecret,
    redirectUri: 'http://159.146.3.104/auth/spotify/actualcallback'
});
app.get('/auth/spotify/actualcallback', function (req, res, next) {
    //callback after the successful spotify login
    var authorizationCode = req.query.code;
    spotifyApi.authorizationCodeGrant(authorizationCode)
        .then(function (data) {
            req.session.access_token = data.body.access_token;
            req.session.refresh_token = data.body.refresh_token;
            res.redirect('/spotify_callback')
        }, function (err) {
            console.log('Something went wrong when retrieving the access token!', err.message);
        });
});


/**
 code for opencv based face recognition with nodejs. Not necessary anymore for the project.
 */
/*
try {
    var camera = new cv.VideoCapture(0);
    var window = new cv.NamedWindow('Video', 0);
    let imageCount = 0;
    setInterval(function () {
        camera.read(function (err, im) {
            if (imageCount === 100) {
                // imageCount = 0;
                const pythonProcess = spawn('cmd.exe', ['/c D:\\Programs\\miniconda\\Scripts\\conda.exe run -n senior python C:\\Users\\Furkan\\Desktop\\bitirme\\olduuuu\\predictSingleImage.py']);
                pythonProcess.stdout.on('data', (data) => {
                    console.log(data.toString().split('\n'));
                    const directory = './output';
                    fs.readdir(directory, (err, files) => {
                        if (err) throw err;
                        for (const file of files) {
                            fs.unlink(path.join(directory, file), err => {
                                if (err) throw err;
                            });
                        }
                    });
                });
            }
            if (imageCount < 100)
                im.save('./output/out' + imageCount + '.jpg');
            imageCount++;
            im.detectObject(cv.FACE_CASCADE, {}, function (err, faces) {
                for (var i = 0; i < faces.length; i++) {
                    var x = faces[i];
                    im.ellipse(x.x + x.width / 2, x.y + x.height / 2, x.width / 2, x.height / 2);
                }
            });
            if (err) throw err;
            // console.log(im.size());
            if (im.size()[0] > 0 && im.size()[1] > 0) {
                if (err) throw err;
                window.show(im);
            }
            window.blockingWaitKey(0, 50);
        });
    }, 20);
} catch (e) {
    console.log('Couldn’t start camera:', e)
}*/

//output of the prediction
// pythonProcess.stdout.on('data', (data) => {
//     console.log(6)
//     console.log(data.toString())
// });
// pythonProcess.stderr.on('data', (data) => {
//     console.log('ERRRRRR')
//     console.log(data.toString())
// });
// pythonProcess.stdin.on('data', (data) => {
//     console.log(4)
//     console.log(data.toString())
// });
// //prediction is done
// pythonProcess.on('close', data => {
//     console.log(3)
//     console.log(data.toString())
// });


//functions to delete images after process
function RemoveFirstLine(args) {
    if (!(this instanceof RemoveFirstLine)) {
        return new RemoveFirstLine(args);
    }
    Transform.call(this, args);
    this._buff = '';
    this._removed = false;
}

util.inherits(RemoveFirstLine, Transform);

RemoveFirstLine.prototype._transform = function (chunk, encoding, done) {
    if (this._removed) { // if already removed
        this.push(chunk); // just push through buffer
    } else {
        // collect string into buffer
        this._buff += chunk.toString();
        // check if string has newline symbol
        if (this._buff.indexOf('\n') !== -1) {
            // push to stream skipping first line
            this.push(this._buff.slice(this._buff.indexOf('\n') + 2));
            // clear string buffer
            this._buff = null;
            // mark as removed
            this._removed = true;
        }
    }
    done();
};

module.exports = app;
