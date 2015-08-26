// https://codeforgeek.com/2015/07/unit-testing-nodejs-application-using-mocha/
var path       = require('path');
var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
var session    = require('express-session');
var util       = require('util');
var routes     = require(path.join(__dirname, 'src', 'routes', 'index.js'));

// middleware
app.use(session({
	secret: 'keyboard cat',
	saveUninitialized: false,
	resave: false
}));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// Use jade for HTML templating
app.set('view engine', 'jade');
app.set('views', __dirname + '/src/views');

// Serve static content
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to pass session data to jade
app.use(function(req,res,next) {
	res.locals.message = req.session.message;
	delete req.session.message;

	console.log(util.inspect(res.locals.message));
	next();
})

app.get('/', routes.index);

app.post('/name', function (req, res, next) {
	console.log('Body: ' + util.inspect(req.body));
	req.session.message = req.body.name;
	res.redirect(303, '/');
});
// catch routes and show 404
app.use(routes.catchAll)

app.listen(3000);
console.log('Express started on port 3000');
