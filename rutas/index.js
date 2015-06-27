/*
	Este archivo contiene solamente funciones que son utilizadas en 
	las rutas del archivo principal: itesoepo.js

	Mantener las funciones utilizadas por las rutas en un archivo
	separado ayuda a tener un archivo principal limpio y legible.
*/

var validator   = require('validator');
var crypto 	    = require('crypto');
var nodemailer  = require('nodemailer');
var mysql	    = require('mysql');
var util 	    = require('util');
var nodecr	    = require('nodecr');
var PythonShell = require('python-shell');

var credenciales = require('../credenciales.js');
var epo 		 = require('../epo.js')();

var client;

// Inicializar la conexion a la base de datos mysql
exports.connectDB = function() {
	client = mysql.createConnection({
		user: 	  credenciales.database.user,
		password: credenciales.database.pass,
		database: credenciales.database.name,
		host:     credenciales.database.host,
		port: 	  credenciales.database.port
	});

	// DB error catcher
	client.on('error', function(err) {
		console.log('Error de la base de datos.');
		throw err;
	});

	client.connect(function(err) {
		if (err) {
			console.log('Hubo un error conectandose a la base de datos: ' + err);
			console.log('User: ' + credenciales.database.user);
			console.log('Host: ' + credenciales.database.host);
			return;
		}
		console.log('Conectado a la base de datos.');
		console.log(' Id:   ' + client.threadId);
		console.log(' Host: ' + credenciales.database.host);
	});
}

// Configurar nodemailer para usar una cuenta gmail
var mailTransport = nodemailer.createTransport('SMTP', {
	service: 'Gmail',
	auth: {
		user: credenciales.gmail.user,
		pass: credenciales.gmail.pass
	}
});

// Ruta para el registro de nuevo usuarios
exports.registro = function (req, res, next) {
	// objeto usuario que contiene toda la informacion de la forma
	var usuario = {
		nombre   : req.body.nombre,
		apellido : req.body.apellido,
		email    : req.body.email,
		password : req.body.password,
		password2: req.body.password_confirmation
 	};

 	// Limpiar la entrada y validar errores
 	var errors = [];
 	
 	usuario.nombre   = validator.trim(usuario.nombre);
 	usuario.apellido = validator.trim(usuario.apellido);
 	usuario.email    = validator.trim(usuario.email);

 	// Reglas que deben cumplirse para aceptar un registro
 	if (usuario.password !== usuario.password2)
 		errors.push('Las dos claves no concuerdan');

 	if (!validator.isLength(usuario.password, 8, 64))
 		errors.push('La clave debe de tener entre 8 y 64 caracteres longitud');
 	
 	if (!validator.isAlphanumeric(usuario.password))
 		errors.push('La clave solo puede contener caracteres alfanuméricos');

 	if (!validator.isEmail(usuario.email))
 		errors.push('Email invalido');

 	if (!usuario.email.match(/@iteso.mx$/))
 		errors.push('Solo se aceptan registros de usuarios con cuenta de correo del ITESO (@iteso.mx)');
 	
 	if (!validator.isLength(usuario.email, 1, 64))
 		errors.push('El email no puede tener más de 64 caracteres');

 	if (!validator.isLength(usuario.nombre, 1, 50))
 		errors.push('El nombre debe contener entre 1 y 50 caracteres');

 	if (!validator.isLength(usuario.apellido, 1, 50))
 		errors.push('El apellido debe contener entre 1 y 50 caracteres');
 	
 	// Revisar que el email no exista en la base de datos
 	client.query('SELECT * FROM usuarios WHERE email=' + 
 		client.escape(usuario.email), function(err, result) {
 		if (err) {
 			console.log('Error: ' + err);
 		}
 		else {
 			// Si el query regresa una fila el usuario ya existe
 			if (Object.keys(result).length)
 				errors.push('El email ya existe en la base de datos');
 			
 			// registrar usuario revisa errores y si no los hay inserta un registro en la DB
 			registrarUsuario(req, res, usuario, errors, next);
 		}
 	});
};

function registrarUsuario(req, res, usuario, errors, next) {
 	if (errors.length == 0) {

 		// Crear hash del password el usuario, esto se guardara en la BD
 		usuario.hash = crypto.createHmac('md5', credenciales.hashKey)
 			.update(usuario.password)
 			.digest('hex');

 		// unir primer nombre y apellido.
 		usuario.nombre += ' ' + usuario.apellido;
 		delete usuario.apellido;

 		console.log('Creando nuevo usuario en el sistema: ' +
 			usuario.nombre);

 		// Insertar un nuevo usuario en la base de datos
		client.query('INSERT INTO usuarios SET nombre = ?, email = ?, ' +
 			'hash = ?, rol = ?', [usuario.nombre, usuario.email, usuario.hash, 1], 
 			function(err, result) {
 				if (err) {
 					console.log('Error al registrar al usuario en la base de datos');
 					console.log(err);
 					next(err);
 				}
 				else {
 					// obtener el nombre del rol de la tabla de roles
 					client.query('SELECT nombre from roles where id_rol = ?', [1], function(err, result) {
 						if (!err) req.session.usuario.rol = result[0].nombre;
 					});

 					console.log('Se ha insertado el usuario en la base de datos ' + util.inspect(result));

			 		// Identificar al usuario en la sesion (cookie). Ya no se necesitan los passwords.
			 		delete usuario.password;
			 		delete usuario.password2;

			 		usuario.id = result.insertId;
			 		req.session.usuario = usuario;

			 		// Enviarle un email de bienvenida al sistema, utilizando el handlebar email-registro
			 		// el 3er parametro es un callback con el html generado por el handlebar
				 	res.render('email-registro',
						{layout: false, usuario: usuario}, function EnviaEmailRegistro(err, html) {
						if (err) {
							console.log('Error en el template de email');
							console.log(err);
						}

						mailTransport.sendMail({
							from: '"Luis Echeverria" <luisneto@gmail.com>',
							to: usuario.email,
							subject: 'Registro en ITESO EPO OPS',
							html: html,
							generateTextFromHtml: true
						}, function(error) {
							if(error) {
								console.log('No se pudo enviar el email: ' + error);
							}
						});
					});

				 	// mostrar una alerta de success en la pagina principal al hace el redirect.
				 	msgFlash(req, 'success', usuario.nombre + ' has sido dado de alta en el sistema!');

					res.redirect(303, '/tablero');
				}
			}
		);
	}
	else { // errors.length != 0

		// Crear un mensaje de error tipo flash
		msgFlash(req, 'danger', 'Ha ocurrido un error al llenar la forma de registro:', errors);

		// la forma de registro debe permanecer visible para que el usuario 
		// pueda hacer cambios e intentar el registro de nuevo
		req.session.forma = true;

		res.redirect(303, '/');
	}
}

//
// Función utilitaria que settea el flash message en la sesión
//
function msgFlash(req, type, message, errors) {
	var errorMsg = '';

	var intro = '';

	switch (type) {
		case 'danger':
			intro = 'Error';
			break;
		case 'warning':
			intro = 'Advertencia';
			break;
		default:
			intro = 'Información';
			break;
	}

	if (errors && errors.length > 0) {
		// crear el HTML del mensaje de error.
	 	errorMsg = '<ul>';
	
	 	errors.forEach(function (error) {
	 		errorMsg += '<li>' + error + '</li>';
	 	});
	
	 	errorMsg += '</ul>';
	}

	req.session.flash = {
		type: type,
		intro: intro,
		message: '<p>' + message + '</p>' + errorMsg
	};
}


//
// Procesa el POST que viende de tablero/resumen y que indica que se debe de borrar un proyecto
// en especifico (esto cuando el usuario da click en el boton Borrar al lado del proyecto)
//
exports.borrarProyecto = function(req, res, next) {
	if ('idBorrar' in req.body) {
		console.log(util.inspect(req.session));
		console.log("Borrando el proyecto: " + req.body.idBorrar + ' del usuario: ' + req.session.usuario.id);

		// Borrar el proyecto de la tabla de proyectos asignados y luego de la tabla de proyectos
		// es necesario hacer un redirect en cada branch por la naturaleza asíncrona de Node JS
		client.query('DELETE FROM proyectos_asignados WHERE id_proyecto = ?', 
			[req.body.idBorrar], 
 			function(err, result) {
 				if (err) {
 					msgFlash(req, 'danger', 'Ha habido un error al borrar la asignación de proyecto de la base de datos:', [err.code]);
 
  					res.redirect(303,'/tablero');
 				}
 				else {
 					client.query('DELETE FROM diccionario WHERE id_proyecto = ?',
 					[req.body.idBorrar], function(err, result) {
 						if (err) {
 							console.log("ERROR borrando dicionario para proyecto " + req.body.idBorrar)
 							console.log(err)
							msgFlash(req, 'danger', 'Error al borrar el proyecto de la base de datos:', [err.code]);
 						}
 						else {

 							client.query('DELETE FROM patentes_proyectos WHERE id_proyecto = ?',
 							[req.body.idBorrar], function(err, result) {
 								if (err) {
 									console.log('ERROR borrando las patentes del proyecto ' + req.body.idBorrar)
 									console.log(err)
 									msgFlash(req, 'danger', 'Error al borrar el proyecto de la base de datos:', [err.code]);
 								}
 								else {

 									client.query('DELETE FROM stop_words WHERE id_proyecto = ?',
 									[req.body.idBorrar], function(err, result) {
 										if (err) {
 											console.log('ERROR borrando los stopwords del proyecto ' + req.body.idBorrar)
 											console.log(err)
 										}
 										else {
											client.query('DELETE FROM proyectos WHERE id_proyecto = ?', 
											[req.body.idBorrar], function(err, result) {
												if (err) {
						 							console.log("ERROR borrando el proyecto " + req.body.idBorrar)
													console.log(err);
													msgFlash(req, 'danger', 'Error al borrar el proyecto de la base de datos:', [err.code]);
												}
												else {
													msgFlash(req, 'success', 'Proyecto borrado con éxito');
												}
												// En este punto ya se borró el proyecto, sus patentes, su asignación, su diccionario y stopwords.
												res.redirect(303,'/tablero');
											}); 											
 										}
 									});
 								}
 							});
 						}
 					});
				}
 			});
	}
	else {
		// si no existe un campo idBorrar, simplemente se renderea tablero/resumen
		res.render('tablero/resumen', {layout: 'tablero', menu:'resumen'});
	}
};


exports.addDict = function(req, res, next) {
	var id_proyecto = req.body.id_proyecto;
	var ngramas = req.body.ngramas;

	if (ngramas.length == 0)
		return do_reply();

	console.log("Añadiendo " + ngramas.length + " ngramas al diccionario.");

	var inserts_done = [];

	ngramas.forEach(function(ngrama) {
		client.query('INSERT INTO diccionario (id_proyecto, ngram) VALUES(?, ?)', [id_proyecto, ngrama.ngrama], 
			function(err, res) {
				if (err) console.log(err);
				else {
					inserts_done.push(ngrama.ngrama);

					if (inserts_done.length == ngramas.length) {
						console.log(inserts_done.length + " ngramas añadidos.");
						do_reply();
					}
				}
			});
	});

	function do_reply(){
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({data: 'data'}));
	}

}

exports.delDict = function(req, res, next) {
	var id_proyecto = req.body.id_proyecto;
	var ngramas = req.body.ngramas;

	if (ngramas.length == 0)
		return do_reply();

	console.log("Removiendo " + ngramas.length + " ngramas del diccionario.");

	var inserts_done = [];

	ngramas.forEach(function(ngrama) {
		client.query('DELETE FROM diccionario WHERE id_proyecto=? AND ngram=?', [id_proyecto, ngrama.ngrama], 
			function(err, res) {
				if (err) console.log(err);
				else {
					inserts_done.push(ngrama.ngrama);

					if (inserts_done.length == ngramas.length) {
						console.log(inserts_done.length + " ngramas removidos.");
						do_reply();
					}
				}
			});
	});

	function do_reply(){
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({data: 'data'}));
	}

}


exports.delStopWords = function(req, res, next) {
	var id_proyecto = req.body.id_proyecto;
	var ngramas = req.body.ngramas;

	if (ngramas.length == 0)
		return do_reply();

	console.log("Removiendo " + ngramas.length + " stop words.");

	var inserts_done = [];

	ngramas.forEach(function(ngrama) {
		client.query('DELETE FROM stop_words WHERE id_proyecto=? AND word=?', [id_proyecto, ngrama.ngrama], 
			function(err, res) {
				if (err) console.log(err);
				else {
					inserts_done.push(ngrama.ngrama);

					if (inserts_done.length == ngramas.length) {
						console.log(inserts_done.length + " stop words removidas.");
						do_reply();
					}
				}
			});
	});

	function do_reply(){
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({data: 'data'}));
	}

}


//
// Anade stop words (ngramas) a la tabla de stop_words en la BD
//
exports.addStopWords = function(req, res, next) {
	var id_proyecto = req.body.id_proyecto;
	var ngramas = req.body.ngramas;

	if (ngramas.length == 0)
		return do_reply();

	console.log("Añadiendo " + ngramas.length + " stop words.");

	var inserts_done = [];

	ngramas.forEach(function(ngrama) {
		client.query('INSERT INTO stop_words (id_proyecto, word) VALUES(?, ?)', [id_proyecto, ngrama.ngrama], 
			function(err, res) {
				if (err) console.log(err);
				else {
					inserts_done.push(ngrama.ngrama);

					if (inserts_done.length == ngramas.length) {
						console.log(inserts_done.length + " stop words creadas.");
						do_reply();
					}
				}
			});
	});

	function do_reply(){
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({data: 'data'}));
	}

}

//
// Procesa el POST que viene de tablero/resultados para almacenar patentes y asignarlas a un proyecto
//
exports.almacenarPatentes = function(req, res, next) {
	var proyecto = req.body.id_proyecto;
	var patentes = req.body.patentes;

	console.log("A descargar " + patentes.length + " patentes.");

	// hay que descargar los archivos .tiff de cada una de las patentes 
	tiffsDescargados = [];

	// descargaTIFFS almacena un arreglo de archivos descargados en tiffsDescargados
	descargaTIFFS(patentes.shift(), function() {
		textoPatentes = [];

		// obtener texto almacena un arreglo de [epodoc, texto] por patente en textoPatentes
		obtenerTexto(tiffsDescargados.shift(), function() {
			textoPatentes.forEach(function(patente) {
				console.log("Insertando en la BD el epodoc: " + patente.epodoc);
				console.log(" titulo: " + patente.titulo);

				// insertar en la BD
				insertarPatente(patente.epodoc, patente.titulo, patente.texto);
			})
		});
	});

	function asignaPatente(proyecto, epodoc) {
		client.query('SELECT * FROM patentes_proyectos WHERE id_proyecto = ? AND epodoc = ?',
			[proyecto, epodoc], function(err, result) {
				if (err) {
					console.log(err)
				}
				else {
					if (Object.keys(result).length) {
						// La patente ya está asignada
						console.log('La patente ' + epodoc + ' ya estaba asignada al proyecto ' + proyecto);
					}
					else {
						client.query('INSERT INTO patentes_proyectos (id_proyecto, epodoc) values (?, ?)',
							[proyecto, epodoc], function(err, result) {
								if (err) {
									console.log(err)
								}
								else {
									console.log('Patente ' + epodoc + ' asingada al proyecto ' + proyecto);
									obtenerProyectos(req, function() {});
								}
							})
					}
				}
			})
	}

	function insertarPatente(epodoc, titulo, texto) {
		// lo primero que hay que hacer es revisar si ya existe la patente en la BD
		client.query('SELECT epodoc FROM patentes WHERE epodoc = ?', 
	 		[epodoc], function(err, result) {
				if (err) {
					console.log(err);
				}
				else {
	 				if (Object.keys(result).length == 0) {
	 					// la patente no existe en la BD, hay que insertarla.
	 					client.query('INSERT INTO patentes (epodoc, titulo, texto) values(?, ?, ?)',
	 						[epodoc, titulo, texto], function(err, result) {
	 							if (err) {
	 								console.log(err)
	 							}
	 							else {
	 								console.log('Patente ' + epodoc + ' almacenada en la BD');

	 								// asignar la patente al proyecto
	 								asignaPatente(proyecto, epodoc)
	 							}
	 						}
	 					);
	 				}
	 				else {
	 					console.log('La patente ' + epodoc + ' ya existe en la BD')

	 					// asignarla al proyecto
	 					asignaPatente(proyecto, epodoc)
	 				}
 				}
 		});

	}

	function descargaTIFFS(patente, cb) {
		if (patente) {
			var epodoc = patente.epodoc;
			var titulo = patente.titulo;

			console.log("descargando patente " + epodoc);

			// primero hay que revisar si la patente ya existe en la BD
			client.query('SELECT epodoc FROM patentes WHERE epodoc = ?', [epodoc],
				function(err, result) {
					if (err) {
						console.log(err);
					}
					else {
						if (Object.keys(result).length) {
							// la patente ya existe y no es necesario descargarla
							console.log('La patente ' + epodoc + ' ya existe en la BD');

							// pero es necesario asignarla al proyecto
							asignaPatente(proyecto, epodoc);

							return descargaTIFFS(patentes.shift(), cb)
						}
						else {
							// la patente no fue encontrada en la BD, hay que descargarla.
							var formato = '.tiff';

							epo.descargaPDF(epodoc, formato, function(archivosDescargados) {
								var archivos = {
									imagenes: archivosDescargados,
									titulo: titulo
								}
								tiffsDescargados.push(archivos);
								return descargaTIFFS(patentes.shift(), cb);
							});
						}
					}
				}
			);

		}
		else {
			// enviar respuesta al ajax de la página (el modall de 'procesando')
			res.setHeader('Content-Type', 'application/json');
			res.send(JSON.stringify({data: 'data'}));

			// obtener el text de cada tiff y almacenarlo en la base de datos
			console.log("Se descargaron " + tiffsDescargados.length + " patentes");
			cb();
		}
	}

	// obtener el texto, por medio de OCR, de todas las patentes
	function obtenerTexto(archivos, cb) {
		if (archivos) {
			var patente = archivos.imagenes;
			var titulo  = archivos.titulo;

			var texto = '';

			// En algunos casos la patentes no tienen archivos .tiff
			if (!patente) {
				return obtenerTexto(tiffsDescargados.shift(), cb);
			}

			var epodoc = patente[0].epodoc

			console.log("Parseando OCR de patente " + epodoc);

			// la variable patente es una lista de archivos individuales .tiff 
			ocr(patente.shift());

			function ocr(archivo) {
				if (archivo) {
					// make it quiet
					nodecr.log = function() {};
					
					nodecr.process(archivo.path ,function(err, text) {
				    	if(err) {
				       		console.error(err);
				    	} else {
				    		texto += text;
				    		return ocr(patente.shift(), cb);
				    	}   
					});
				}
				else {
					textoPatentes.push(
					{
						epodoc: epodoc,
						texto: texto,
						titulo: titulo
					});

					console.log("Proceso de OCR completo para " + epodoc);
					obtenerTexto(tiffsDescargados.shift(), cb);
				}
			};
		}
		else {
			console.log("OCR de todas las patentes completo");
			cb();
		}
	}
};


//
// Procesa el POST que viende de tablero/resumen para crear un proyecto nuevo
//
exports.crearProyecto = function(req, res, next) {
	
	// Primero se valida la longitud de los campos de la forma, si hay errores se crea un array 'errors'
	// si no hay error, se inserta el proyecto nuevo.
	var errors = [];

	if (req.body.nombreProyecto.length == 0) {
		errors.push("La longitud del nombre del proyecto debe ser mayor a cero.");
	}
	if (req.body.nombreProyecto.length > 150) {
		errors.push("La longitud del nombre del proyecto no puede ser mayor a 150 caracteres.");
	}
	if (req.body.descripcionProyecto.length > 250) {
		errors.push("La longitud de la descripción del proyecto no puede ser mayor a 250 caracteres.");
	}

	if (errors.length) {
		msgFlash(req, 'danger', 'Ha habido errores en la forma:', errors);
		res.redirect(303,'/tablero');
	}
	else {
		// Desde aquí se inserta primero el proyecto en la tabla de proyectos y despúes en la tabla de
		// proyectos asignados utilizando el id del usuario.
		client.query('INSERT INTO proyectos (id_solicitante, nombre, descripcion) values(?, ?, ?)', 
		[req.session.usuario.id, req.body.nombreProyecto, req.body.descripcionProyecto], function(err, result) {
			if (err) {
				console.log(err);
				msgFlash(req, 'danger', 'Error al crear el proyecto en la base de datos:', [err.code]);
				res.redirect(303,'/tablero');
			}
			else {
				client.query('INSERT INTO proyectos_asignados (id_usuario, id_proyecto) values (?, ?)',
				[req.session.usuario.id, result.insertId], function(err, result) {
					if (err) {
						msgFlash(req, 'danger', 'Error asignando el proyecto', [err.code]);
					}	
					else {
						msgFlash(req, 'success', 'Creado el proyecto con éxito:', [req.body.nombreProyecto]);
					}
					res.redirect(303,'/tablero');
				});
			}
		});	
	}
//	next();
};

exports.descargaPDF = function (req, res, next) {
	// Se llama una funcion en epo.js que descarga las páginas del documento, 
	// está función regresa una URL al zip con todos los PDFs

	epo.descargaPDF(req.query.epodoc, function(data, err) {
		if (err) {
			// hace falta manejar el error y notificarlo al usuario
			console.log("error " + util.inspect(err));
			return;
		}
		// responderle al AJAX con la URL del archivo ZIP
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({'url': data}));
	});
};


//
// Se llama cuando el analisis se completo y se quiere mostrar el resultado en pantalla
//
exports.mostrarAnalisis = function (req, res, next) {
	var ruta    = 'tablero/analisis';

	var id_proyecto = req.query.proyecto;
	var nombre_proyecto;

	var analisis = {};

	// Si a esta pagina se llega con un proyecto en el query (/analisis?proyecto=X)
	// entonces se obtiene todo el analisis para dicho proyecto y se pone en 'analisis'
	if (id_proyecto) {
		client.query('SELECT nombre FROM proyectos WHERE id_proyecto=?', [id_proyecto],
			function(err, result) {
				nombre_proyecto = result[0].nombre;
				analisis = {
					id_proyecto: id_proyecto,
					nombre_proyecto: nombre_proyecto,
					ngramas: [],
					stopwords: [],
					diccionario: [],
					matriz: [],
					patentes: [],
				};

				// completa el json analisis que va a ser utilizado por el handlebars
				getNgrams(id_proyecto, function() {
					getMatrix(id_proyecto, function() {
						console.log("Mostrando análisis.");
						showAnalisis();	
					});
				});
		});
	}
	else {
		// Si no hubo proyecto en el query entoncs se renderea la pagina sin mostrar ningun analisis
		showAnalisis();
	}

	/* El objetivo es construir una matriz que se pueda almacenar en la variable analisis.matriz,
	ya que esta variable llega despues a analisis.handlebars y este la puede procesar

	Se consigue obteniendo todos los ngramas del diccionario del proyecto, por cada ngrama
	se consulta su existencia en cada una de las patentes del proyecto. Por eso hay 3 querys anidadas
	*/
	function getMatrix(id_proyecto, cb) {	
		// obtener todos los ngramas del DICCIONARIO del proyecto
		client.query('SELECT ngram FROM diccionario WHERE id_proyecto=?', [id_proyecto],
			function(err, ngramas) {
				if (ngramas.length == 0)
					return cb();

				// Obtener todas las patentes del proyecto
				client.query('SELECT epodoc FROM patentes_proyectos WHERE id_proyecto=?',
					[id_proyecto], function(err, patentes) {
						var counter = 0;

						// por cada ngrama se va a buscar en cada patente
						ngramas.forEach(function(ngrama){
							analisis.matriz = [];

							//console.log(ngrama.ngram + " y " + patentes.length + " patentes");

							var filas = {
								ngrama: ngrama.ngram,
								patentes: [],
							};

							var contadorPatentes = 0;
							analisis.patentes = [];

							// buscar en cada una de las patentes
							patentes.forEach(function(patente) {

								// primero construir la lista de patentes en la variable analisis
								// esta va a servir para saber todos los epodocs de la matriz
								// ya que la matriz solo guarda las intersecciones donde existe el ngrama
								analisis.patentes.push({epodoc: patente.epodoc});

								client.query('SELECT ngram FROM ngrams WHERE ' +
									'ngram=? AND epodoc=?', [ngrama.ngram, patente.epodoc], 
									function(err, res) {
										if (err) console.log(err);

										// la existencia de dicho ngrama en dicha patente
										if (res.length) {
											filas.patentes.push("1");
										}
										else{
											filas.patentes.push(" ");
										}

										// es neceario saber cuando se consultados todas las patentes
										// para un ngrama, es entonces cuando se anade la fila a la matriz
										contadorPatentes++;
										if (contadorPatentes == patentes.length) {
											analisis.matriz.push(filas);
										}

										counter++;

										// el total de iteraciones es patentes * ngramas
										if (counter == (ngramas.length * patentes.length)) {
											return cb();
										}
									})

							})
						})
					})
			})
	}
	// Obtiene los ngramas de un proyecto (sumando los de todas las patentes asociadas al proyecto)
	// y tambien obtiene los stopwords. 
	function getNgrams(id_proyecto, cb) {
		client.query('SELECT ngram, SUM(ngram_count) AS ngram_count, count(epodoc) as patentes ' +
			'FROM ngrams WHERE (epodoc IN (SELECT epodoc FROM patentes_proyectos WHERE id_proyecto = ?)) ' +
			'AND (ngram not in (select word from stop_words where id_proyecto=?)) ' +
			'AND (ngram not in (select ngram from diccionario where id_proyecto=?)) ' +
			'GROUP BY ngram ORDER BY ngram_count DESC LIMIT 1000',
			[id_proyecto, id_proyecto, id_proyecto], function (err, result) {
				if (err)
					console.log(err);

			result.forEach(function(item) {
				analisis.ngramas.push({ngrama: item.ngram, cuenta: item.ngram_count, patentes: item.patentes});

			    if(result.length == analisis.ngramas.length) {
			    	client.query('SELECT word FROM stop_words WHERE id_proyecto=?', [id_proyecto],
			    		function (err, result) {
			    			if (result.length == 0) {
			    				return cb();
			    			}
			    			result.forEach(function(item) {
			    				analisis.stopwords.push({word: item.word});

			    				if (result.length == analisis.stopwords.length) {
			    					// ya que se proceso todo (ngramas y stopwords), llamar al callback
			    					console.log("Stopwords encontrados. Buscando diccionario");
/*
	TODO: Partir este proceso en dos. Obtener los ngramas y en otro query obtener el número de patentes y su cuenta.
	esto va a permitir mostrar los ngramas añadidos que no están en ninguna patente
*/
			    					client.query(
			'SELECT ngram, SUM(ngram_count) AS ngram_count, count(epodoc) as patentes ' +
			'FROM ngrams WHERE (epodoc IN (SELECT epodoc FROM patentes_proyectos WHERE id_proyecto = ?)) ' +
			'AND (ngram not in (select word from stop_words where id_proyecto=?)) ' +
			'AND (ngram in (select ngram from diccionario where id_proyecto=?)) ' +
			'GROUP BY ngram ORDER BY ngram_count DESC LIMIT 1000',
			    						[id_proyecto,id_proyecto,id_proyecto], function (err, res) {
			    							if (res.length == 0) {
			    								return 	cb();
			    							}

			    							res.forEach(function(item) {
			    								analisis.diccionario.push({ngrama: item.ngram,
			    									cuenta: item.ngram_count, patentes: item.patentes});

			    								if (res.length == analisis.diccionario.length) {
			    									cb();
			    								}
			    							});
			    						});
			    				}
			    			});
			    	});
			    }
			});	
		});
	}

	function showAnalisis() {
		res.render(ruta, {layout: 'tablero', menu: 'analisis', analisis: analisis}, function(err, html) {
			// revisar si una seccion existe dentro del folder tablero
			if (err) {
				if (err.message.indexOf('Failed to lookup view') !== -1) {
					// si la view no existe es porque el recurso no existe, un return next()
					// enventualmente llegará al 404 Not Found.
					return next();
				}
				throw err;
			}

			// Si la view sí existe entonces enviarla al cliente;
			res.send(html);
		});
	}
};

//
// Se llama cuando el usuario desea analizar las patentes de un proyecto
//  la llamada viene de un AJAX en la seccion de Proyectos
//
exports.analizarProyecto = function (req, res, next) {
	var id_proyecto = req.query.proyecto;

	console.log("Iniciar analisis del proyecto " + id_proyecto);

	// obtener las patentes del proyecto desde la base de datos
	client.query('SELECT epodoc FROM patentes_proyectos WHERE id_proyecto=?',
		[id_proyecto], function(err, result) {
 		
 		if (err) {
 			console.log('Error: ' + err);
 		}
 		else {
			var noPatentes = Object.keys(result).length;

 			if (noPatentes == 0) {
 				errors.push('El proyecto no tiene patentes');
 			}
 			else {
 				// Construir un arreglo patentes con los epodocs, para usar en python
 				var patentes = [id_proyecto];
 				epodocs(result.shift(), function () {
 					console.log("Epodocs a analizar " + util.inspect(patentes));

 					// llamar script de python para que procese las patentes
 					// cuando termine de procesarlas, responder con la URL del analisis
 					scriptPython(patentes, function() {

						/*
		 				var analisis = {
		 					id_proyecto: id_proyecto,
		 					nombre_proyecto: nombre_proyecto,
			 			};

			 			// Guardar en la sesion del usuario los datos de sus proyectos
			 			req.session.usuario.analisis = analisis;
			 			*/

						res.setHeader('Content-Type', 'application/json');
						res.send(JSON.stringify({'url': '/tablero/analisis?proyecto=' + id_proyecto}));
 					})
 				})
 			}
 		}

		function scriptPython(args, cb) {
			var options = {
			  mode: 'text',
			  pythonPath: '/usr/bin/python',
			  pythonOptions: ['-u'],
			  scriptPath: __dirname + '/../scripts/',
			  args: args
			};

			console.log("Running " + util.inspect(options));
			PythonShell.run('myscript.py', options, function (err, results) {
				console.log("Análisis completo.");
				console.log(util.inspect(results));
				cb();
			});
		}

		function epodocs(res, cb) {
			if (res) {
				patentes.push(res.epodoc);
				epodocs(result.shift(), cb);
			}
			else {
				return cb();
			}
		}
 	});
};

//
// Procesa el POST de la forma de búsqueda avanzada
//
exports.busqueda = function(req, res, next) {

	var rango = {};

	if ('query' in req.body) {
		var inicio = parseInt(req.body.inicio.replace(/[^0-9]/g, ''), 10);
		var fin    = parseInt(req.body.fin.replace(/[^0-9]/g, ''), 10);
		var total  = parseInt(req.body.total.replace(/[^0-9]/g, ''), 10);

		if ('siguiente' in req.body) {
			if (total < fin) {
				msgFlash(req, 'warning', 'No hay  más resultados por explorar');
				console.log('no hay más resultados');
				return res.redirect(303, '/tablero/resultados');
			}
			else {
				rango.inicio = fin;
				rango.fin    = fin + 20;
			}
		}
		else {
			if (inicio == 1) {
				return res.redirect(303, '/tablero/resultados');
			}
			else {
				if (inicio > 20)
					rango.inicio = inicio - 20;
				else 
					rango.inicio = 1;

				rango.fin = rango.inicio + 20;
			}
		}

		epo.buscar(req.body.query, rango, function resutadosConsultaEPO(data, err) {
			if (err) {
				var errors = ['(' + err.code + ') ' + err.message];
				
				msgFlash(req, 'danger', 'Ha habido un error al consultar la EPO OPS:', errors);

				res.redirect(303, '/tablero/busqueda');
			}
			else {
				req.session.resultados = data;
				res.render('tablero/resultados', {layout: 'tablero', resultados: data});
			}
		});

		return;
	}

	var consulta = {
		ti: req.body.ti, // título
		ta: req.body.ta, // título o abstract
		pn: req.body.pn, // número de publicación
		ap: req.body.ap, // número de aplicación
		pr: req.body.pr, // número de prioridad
		pd: req.body.pd, // fecha de publicación
		pa: req.body.pa, // aplicante(s)
		in: req.body.in, // inventor(es)
		cpc: req.body.cpc, // CPC
		ipc: req.body.ipc // IPC
	};

	if (validarFormaBusquedaOK(req, res, consulta)) {
		// la forma está bien ahora hay que hacer la consulta

		var rango = {
			inicio: '1',
			fin: '20',
		}

		consultarEpo(req, consulta, rango, function(data, err) {
			if (err) {
				var errors = ['(' + err.code + ') ' + err.message];
				
				msgFlash(req, 'danger', 'Ha habido un error al consultar la EPO OPS:', errors);

				res.redirect(303, '/tablero/busqueda');
			}
			else {
				req.session.resultados = data;
				res.render('tablero/resultados', {layout: 'tablero', resultados: data});
			}
		});
	}
	else {
		// hubo errores en la forma, hay que hacer redirect pues la funcion de validarFormaBusquedaOK
		// ya generó un msgFlash.
		res.redirect(303, '/tablero/busqueda');
	}

};

//
// Aquí se construye el query CQL y se hace la consulta utilizando una función en epo.js
//
function consultarEpo(req, consulta, rango, cb) {
	// el rango es opcional.
	if (!cb && typeof rango == 'function') {
		cb = rango;
		rango = {};
	}

	// hay que convertir la consulta del usuario a CQL
	var cqlp  = require('../lib/cql.js').make();
	var query = '';

	for (campo in consulta) {
		try {
			if (!consulta[campo].length) continue;

			cqlp.parse(consulta[campo]);
			
			if (query.length) {
				query += ' AND (' + campo + '=(' + cqlp.toString() + '))';
			}
			else {
				query = '(' + campo + '=(' + cqlp.toString() + '))';
			}
		}
		catch (e) {
			console.log("Error parseando la consulta del usuario: " + e.message);
			return cb(undefined, e);
		}
	}

	console.log('Consulta: ' + query);

	epo.buscar(query, rango, function resutadosConsultaEPO(data, err) {
		if (err)
			cb(data, err);
		else
			cb(data);
	});
}

//
// Función helper del exports.busqueda que valida los campos de la forma
//
function validarFormaBusquedaOK(req, res, consulta) {
	var errors = [];

	// Aquí se revisan todos los errores...

	// Hay que revisar que la forma no esté vacía
	var length = 0;

	for (campo in consulta) {
		// Cuando son números hay que convertirlo a string;
		if (typeof consulta[campo] == 'number') {
			length += consulta[campo].toString().length;

			if (!validator.isLength(consulta[campo].toString(), 0, 1024))
				errors.push("La longitud máxima de caracteres en cada campo es de 1024");
		}
		else {
			length += consulta[campo].length;
			if (!validator.isLength(consulta[campo], 0, 1024))
				errors.push("La longitud máxima de caracteres en cada campo es de 1024");			
		}
	}

	if (length == 0) // error forma vacia
		errors.push("La forma está vacía");


	// Si hubo errores entonces se genera el mensaje de error
	if (errors.length > 0) {
		msgFlash(req, 'danger', 'Ha ocurrido un error en la forma:', errors);

		return 0;
	}

	return 1;
};

//
// Ruta principal del tablero (sección que permite consultas a la EPO)
//
exports.tablero = function(req, res, next) {
		// la seccion es el parametro que puede o no venir despues de /tablero/:seccion
		// Asi con una sola ruta se pueden servir differentes paginas dentro de tablero
		if (req.params.seccion) {
			var seccion = req.params.seccion;
			var ruta    = 'tablero/' + seccion;

			res.render(ruta, {layout: 'tablero', menu: seccion}, function(err, html) {
				// revisar si una seccion existe dentro del folder tablero
				if (err) {
					if (err.message.indexOf('Failed to lookup view') !== -1) {
						// si la view no existe es porque el recurso no existe, un return next()
						// enventualmente llegará al 404 Not Found.
      					return next();
      				}
      				throw err;
      			}

      			// Si la view sí existe entonces enviarla al cliente;
      			res.send(html);
      		});
		}
		else {
			// si no hubo parametro de seccion entonces se hace render de resumen por default

			// primero hay que obtener los proyectos del usuario
			obtenerProyectos(req, function(err) {
				if (err) {
					var error = ['(' + err.code + ')'];
					msgFlash(req, 'danger', 'Error al obtener los proyectos del usuario', error);
					
					// Es necesario setear el res.locals aquí porque ya no se pasará por el middleware
					// que lo hace (en itesoepo.js), lo que sigue es el render directamente.
					res.locals.flash = req.session.flash;
					delete req.session.flash;
				}

				setTimeout(
					function() {
						res.render('tablero/resumen', {layout: 'tablero', menu:'resumen'});
					},
					1000);
			});
		}
};

//
// Funcion que valida que el useario esté loggeado, si no lo está lo redirecciona a /
//
exports.validarSesion = function(req, res, next) {
	// El usuario debe de tener una session para estar loggeado
	if (req.session.usuario) {
		return next();
	} 
	else {
		// si el usuario no esta loggeado hay que mandarlo a / y mostrar un mensaje de warning
		msgFlash(req, 'warning', 'Es necesario indentificarse con email y contraseña');

		res.redirect(303, '/');		
	}
};

//
// Función para catch-all, todo lo que llegue aquí es porque no existe y genera un 404
//
exports.catchAll = function(req, res, next) {
	res.status(404);
	res.render('404', {layout: false});
};

//
// Logout, borrar el usuario de la sesion
//
exports.logout = function(req, res) {
	delete req.session.usuario;
	req.session.destroy();
	res.redirect(303, '/');
};

//
// Login, identifica al usuario por su email y password
//
exports.login = function(req, res, next) {
	var usuario = {
		email    : req.body.email,
		password : req.body.password
	};

 	// Limpiar la entrada y validar errores
 	var error = false;

 	if (!validator.isLength(usuario.password, 8, 64))
		error = true;

 	if (!validator.isAlphanumeric(usuario.password))
		error = true;

 	if (!validator.isEmail(usuario.email))
		error = true;
 	
 	if (!validator.isLength(usuario.email, 1, 64))
		error = true;

	// si hay un error entonces hay que mostrar un mensaje de error que no sea muy especifico
	if (error) {
		msgFlash(req, 'danger', 'Error en el formato del usuario y/o password');

		delete req.session.usuario;
		return res.redirect(303, '/');
	}

	// Calcular hash del password
	usuario.hash = crypto.createHmac('md5', credenciales.hashKey)
		.update(usuario.password)
		.digest('hex');	

	// ya no necesitamos el password en memoria.
	delete usuario.password;

	console.log('Buscando al usuario en la base de datos');

	// Utilizar la tabla usuarios y la tabla roles para de una vez regresar el nombre del rol
	// en la sesion del usuario
 	client.query("SELECT u.id_usuario, u.nombre, u.email, u.hash, r.nombre as 'rol' " +
 	'FROM usuarios u, roles r WHERE u.email = ? AND u.hash = ? AND u.rol = r.id_rol',
 		[usuario.email, usuario.hash], function(err, result) {
 		if (err) {
 			console.log('Error al buscar en la DB: ' + err);
 			next(err);
 		}
 		else {
 			if (Object.keys(result).length) {
 				// Login success!
 				usuario.nombre = result[0].nombre;
 				usuario.rol    = result[0].rol;
 				usuario.id     = result[0].id_usuario;

 				console.log(usuario.id + ': ' + usuario.email + ' se ha logeado en el sistema.');

 				req.session.usuario = usuario;

 				//obtenerProyectos(req, function() {
 					res.redirect(303, '/tablero');
 				//});

 			}
 			else {
 				// El email o el password son incorrectos.
 				console.log('Login fail!');

 				msgFlash(req, 'danger', 'Email y/o clave incorrectos');

				delete req.session.usuario;
				return res.redirect(303, '/');
 			}
 		}
 	});
};

//
// Obtiene todos los proyectos a los que un id de usuario está asignado
// y los pone en req.session.usuario.pryectos = []
//
function obtenerProyectos(req, cb) {
	var id_usuario = req.session.usuario.id;
 	
 	console.log('Obteniendo proyectos para usuario ' + id_usuario);
 	req.session.usuario.proyectos = [];

 	client.query('SELECT ' + 
					    'p.id_proyecto,' +
					    'p.id_solicitante,' +
					    "DATE_FORMAT(p.fecha_creacion,'%a, %d %b %y') as fecha_creacion," +
					    'p.nombre,' +
					    'p.descripcion' +
					' FROM ' +
					    'proyectos p,' +
					    'proyectos_asignados pa' +
					' WHERE ' +
					    'pa.id_usuario = ? ' +
						'and pa.id_proyecto = p.id_proyecto',
 		[id_usuario], function(err, result) {
 		if (err) {
 			console.log('Error al buscar los proyectos asignados en la DB: ' + err);
 			cb(err);
 		}
 		else {
 			// Obtener el número de patentes que cada proyecto tiene asignadas.
 			result.forEach(function(data) {
 				client.query('SELECT epodoc FROM patentes_proyectos WHERE id_proyecto=?',
 					[data.id_proyecto], function(err, result) {
 						if (err) {
 							console.log(err)
 						}
 						else {
 							var noPatentes = Object.keys(result).length;
 							var patentes   = [];

 							// ahora es necesario obtener el titulo de cada patente para lo cual
 							// se procesa un record de los resultados a la vez
 							obtenerPatentes(result.shift(), function() {
	 			 				var proyecto = {
					 				id: data.id_proyecto,
					 				nombre: data.nombre,
					 				descripcion: data.descripcion,
					 				fechaCreacion: data.fecha_creacion,
					 				noPatentes: noPatentes,
					 				patentes: patentes,
					 			};

					 			// Guardar en la sesion del usuario los datos de sus proyectos
					 			req.session.usuario.proyectos.push(proyecto);
 							});

 							// esta funcion toma el epodoc y obtiene el titulo de la patente
 							function obtenerPatentes(record, cb) {
								if (record) {
									var epodoc = record.epodoc;

									client.query('SELECT titulo FROM patentes WHERE epodoc=?', epodoc,
									function(err, res){
										if (err) {
											console.log(err);
										}
										else {
											patentes.push({
												titulo: res.shift().titulo,
												epodoc: epodoc
											});
											return obtenerPatentes(result.shift(), cb);
										}
									});
								}
								else {
									// ya que no hay más records es porque ya se obtuvieron todos los titulos
									return cb();
								}
							}
			 			}
 				});
 			});

 			// llamar el callback al terminar
 			cb(undefined);
 		}
 	});
}