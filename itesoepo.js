var express = require('express');
var http 	= require('http');
var path 	= require('path');
var favicon	= require('serve-favicon');

var credenciales = require('./credenciales.js');
var rutas 		 = require('./rutas/index.js');
var epo 		 = require('./epo.js');

// custom module, galleta de la fortuna.
//var fortune = require(__dirname + '/lib/fortune.js');

var app = express();

// Puerto donde el servidor https escucha
app.set('port', 80);

// Crear la conexion a la base de datos
rutas.connectDB();

// set favicon
app.use(favicon(__dirname + '/public/img/favicon.ico'));

// body parser para HTML forms que usan POST
app.use(require('body-parser')());

// Cookie parser y session handler
app.use(require('cookie-parser')(credenciales.hashKey));
app.use(require('express-session')());

// Setup handlebars view engine. main.handlebar es el layout usado por defecto
// registrar un helper rangoFin que ayuda a mostrar correctamente el rango en los resultados de las busquedas
var handlebars = require('express3-handlebars').create({defaultLayout:'main',
					helpers: {
						rangoFin:function(fin, total) { if (fin > total) return total; return fin; }
					}
				});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

// middleware para detectar parametro tests=1 y mostrar los QA tests
app.use(function(req, res, next) {
	res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
	next();
});

// Transferir y borrar variables que no deben de permanecer durante toda la sesion
app.use(function(req, res, next){
	res.locals.flash = req.session.flash;
	delete req.session.flash;

	res.locals.forma = req.session.forma;
	delete req.session.forma;

	// datos del usuario
	res.locals.usuario = req.session.usuario;

	// resultados de la última búsqueda
	res.locals.resultados = req.session.resultados;

	next();
})

// Servir contenido estatico
app.use(express.static(__dirname + '/public'));


//
// Sección de rutas
//

// página principal
app.get('/', function(req, res) {
	if (req.session.usuario) {
		res.redirect(303, '/tablero');
	}
	else {
		res.render('home');
	}
});

// Rutas para el tablero
app.get('/tablero', rutas.validarSesion, rutas.tablero);

// ruta que muestra el resultado del analisis de un proyecto
app.get('/tablero/analisis', rutas.validarSesion, rutas.mostrarAnalisis);

// permite atrapar cualquier recurso (seccion) debajo de tablero/. Eg. /tablero/busqueda
app.get('/tablero/:seccion', rutas.validarSesion, rutas.tablero);

// ruta que responde al AJAX para bajar el PDF
app.get('/resultados/descargaPDF', rutas.validarSesion, rutas.descargaPDF);

// ruta que inicia el analisis de un proyecto
app.get('/analizar', rutas.validarSesion, rutas.analizarProyecto);

// cuando un usuario quiere crear un stop word a partir de un ngrama del corpus
app.post('/addStopWords', rutas.validarSesion, rutas.addStopWords);
app.post('/delStopWords', rutas.validarSesion, rutas.delStopWords);
app.post('/delDict', rutas.validarSesion, rutas.delDict);
app.post('/addDict', rutas.validarSesion, rutas.addDict);

// ruta que almacena las patentes en la base de datos local
app.post('/resultados/almacenarPatentes', rutas.validarSesion, rutas.almacenarPatentes);

// Procesar la forma de búsqueda de patentes
app.post('/tablero/buscar', rutas.validarSesion, rutas.busqueda);

// Procesar la forma que borra un proyecto desde el tablero/resumen del usuario.
app.post('/tablero/borrarProyecto', rutas.validarSesion, rutas.borrarProyecto);

// Procesar la forma para crear un proyeco nuevo desde el tablero/resumen del usuario
app.post('/tablero/crearProyecto', rutas.validarSesion, rutas.crearProyecto);

// Registro de nuevo usuarios
app.post('/registro', rutas.registro);

// Salir de la sesion, redirecciona a '/'
app.post('/logout', rutas.logout);

app.post('/login', rutas.login);


// catch-all middleware, si llega aqui es porque no existe el recurso solicitado
app.use(rutas.catchAll);

// error handler
app.use(function(err, req, res, next) {
	console.log('Error handler...');
	console.error(err.stack);
	res.send(500, '500 - Error interno :..(');
});


//
// Iniciar el servidor
//

http.createServer(app).listen(app.get('port'), function(){
	console.log('Express started in ' + app.get('env') +  ' mode at http://localhost:' 
		+ app.get('port') + '; press Ctrl+C to terminate....');
});