/*

Modulo para comunicarse con la EPO Open Patent Serivce utilizando http requests

*/
var https 		 = require('https');
var credenciales = require('./credenciales.js');
var util 	 	 = require('util');
var parser 		 = require('xml2json');
var fs 			 = require('fs');
var archiver 	 = require('archiver');
var mkdirp		 = require('mkdirp');

module.exports = function(epoOptions) {

	// Obtener el access token desde EPO OPS. La variable lastRefresh se utiliza para
	// saber si ya pasaron 19 minutos (el token lo expira la EPO cada 20 minutos).

	var accessToken = '';
	var lastRefresh = 0;
	
	function getAccessToken(cb) {
		if (accessToken) {
			// Revisar si todavía no caduca (caduca cada 20 minutos por la EPO)
			if (Date.now() < (lastRefresh +  19 * 60 * 1000)) {
				return cb(accessToken);
			}
		}

		// Hay que solicitar el token ya sea porque caducó o porque no se ha solicitado aun 

		var toEncode = credenciales.epo.oauth.consumerKey + ':' + 
					   credenciales.epo.oauth.consumerSecret;

		var bearerToken = new Buffer(toEncode).toString('base64');

		var options = {
			hostname: credenciales.epo.host,
			port: 443,
			method: 'POST',
			path: credenciales.epo.oauth.path,
			headers: {
				'Authorization': 'Basic ' + bearerToken,
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json',
			},
		};

		var request = https.request(options, function(res) {
			var data = '';

			console.log('Status: ' + res.statusCode);

			res.on('data', function(chunk) {
				data += chunk;
			});

			// Al darse 'end' revisar el statusCode y generar un error si EPO OPS respondió con un error 
			res.on('end', function() {
				if (res.statusCode == 200) {
					lastRefresh = Date.now();

					var auth = JSON.parse(data);
					
					accessToken = auth.access_token;
					cb(accessToken);
				}
				else {
					// Generar un objeto JSON en la variable error para que el callback
					// pueda hacer render del code y el message
					var json  = parser.toJson(data, {object: true});
					var error = {};

					// busca code y messge en el objeto json parseado para construir error
					for (c in json) {
						if (json[c].code) {
							error.code = json[c].code;
						}
						if (json[c].message) {
							error.message = json[c].message;
						}
					}

					if (!error.code) error.code = res.statusCode;
					if (!error.message) error.message = 'Error de EPO OPS';
					
					console.log('json: ' + util.inspect(json));
					console.log('error: ' + util.inspect(error));

					cb(accessToken, error);
				}
			});
		});

		request.on('error', function(error) {
			console.log('Error with request to EPO OPS: ' + error.message);

			cb(undefined, error)
		});

		request.write('grant_type=client_credentials');
		request.end();
	};

	function estado() {
		if (accessToken) {
			// Revisar si todavía no caduca (caduca cada 20 minutos por la EPO)
			if (Date.now() < (lastRefresh +  19 * 60 * 1000)) {
				return 1;
			}
		}
		return 0;
	}

	function buscarEPO(consulta, rango, cb) {
		if (!cb && typeof rango == 'function') {
			cb = rango;
			rango = {
				inicio: '1',
				fin: '20',
			};
		}

		// construir los headers y opciones de la busqueda
		var options = {
			hostname: credenciales.epo.host,
			port: 443,
			method: 'POST',
			path: '/3.1/rest-services/published-data/search/biblio',
			headers: {
				'Authorization': 'Bearer ' + accessToken,
				'Content-Type': 'text/plain',
				'Accept': 'application/json',
				'X-OPS-Range': rango.inicio + '-' + rango.fin,
			},
		};

		// hacer el request a la EPO
		var request = https.request(options, function(res) {
			var data = '';

			console.log('Status: ' + res.statusCode);
//			console.log('Headers: ' + util.inspect(res.headers));

			res.on('data', function(chunk) {
				data += chunk;
			});

			// Al darse 'end' revisar el statusCode y generar un error si EPO OPS respondió con un error 
			res.on('end', function() {
				switch (res.statusCode) {
				case 200:
					data = JSON.parse(data);

					// Parsear la respuesta de la EPO para obtener los campos de interés
					var resultado = {
						total: 0,
						rango: {},
						documentos: [],
					};

					var biblioSearch = data['ops:world-patent-data']['ops:biblio-search'];

					resultado.total = biblioSearch['@total-result-count'];
					resultado.rango = {
						inicio: biblioSearch['ops:range']['@begin'],
						fin: biblioSearch['ops:range']['@end'],
					};
					resultado.query = biblioSearch['ops:query']['$'];

					var excDocuments = [];

					if (resultado.total > 0) {
						// hacer que exchange documents siempre sea un array (aunque sea de 1 documento)
						excDocuments = biblioSearch['ops:search-result']['exchange-documents'];
						if (!util.isArray(excDocuments)) {
							excDocuments = [biblioSearch['ops:search-result']['exchange-documents']];
						}
					}

					// utilizando el exchange documents obtener informacion de cada documento
					// resultado.documentos será un arreglo de documentos con información de cada uno
					var epodoc = '';
					excDocuments.forEach(function(doc) {
						var epodoc = '';
						var fecha  = '';

						var biblio = doc['exchange-document']['bibliographic-data'];
						var docIds = biblio['publication-reference']['document-id'];

						// convertir docIds a array si no lo es
						if (!util.isArray(docIds)) {
							docIds = [biblio['publication-reference']['document-id']];
						}

						// Obtener el epodoc del documento
						docIds.forEach(function(doc) {
							if (doc['@document-id-type'] == 'epodoc') {
								epodoc = doc['doc-number']['$'];
								fecha  = doc['date']['$'];
								fecha  = fecha.substring(0,4) + '-' + fecha.substring(4,6) +
									'-' + fecha.substring(6);
							}
						});

						// Obtener el título en inglés del documento, si no está disponible
						// entonces usar el primer título.
						var titulo 		 = '';
						var tituloIdioma = '';

						var titles = biblio['invention-title'];
						if (!util.isArray(titles)) {
							titles = [biblio['invention-title']];
						}
						
						titles.forEach(function(title) {
							if (title && '@lang' in title && title['@lang'] == 'en') {
								titulo 		 = title['$'];
								tituloIdioma = 'en';
							}
						});

						if (titulo.length == 0 && titles[0]) {
							titulo 		 = titles[0]['$'];
							tituloIdioma = titles[0]['@lang'];
						}

						// Obtener los nombres de los inventores
						var inventors = [];

						// no siempre existe el campo de inventors o el de parties
						if (('parties' in biblio) && ('inventors' in biblio['parties'])) {
							inventors = biblio['parties']['inventors']['inventor'];
						}

						if (!util.isArray(inventors)) {
							inventors = [biblio['parties']['inventors']['inventor']];
						}

						var inventoresNombres = [];

						inventors.forEach(function(inv) {
							if (inv['@data-format'] == 'epodoc') {
								inventoresNombres.push(inv['inventor-name']['name']['$']);
							}

						})

						var abstract = {
							texto: '',
							idioma: '',
						};

						// Obtener los parrafos del abstract (no siempre hay abstract)
						if ('abstract' in doc['exchange-document']) {
							var abstracts = doc['exchange-document']['abstract'];
		
							if (!util.isArray(abstracts)) {
								abstracts = [doc['exchange-document']['abstract']];
							}
		
							var parrafos = [];
		
							abstracts.forEach(function(abs) {
								if (abs['@lang'] == 'en') {
									parrafos = abs['p'];
		
									if (!util.isArray(parrafos)) {
										parrafos = [abs['p']];
									}
		
									abstract.idioma = 'en';
								}
							});

							parrafos.forEach(function(p) {
								abstract.texto += p['$'] + "\n";
							});
						}


						// Hacer push del documento ya completo
						resultado.documentos.push({
							epodoc: epodoc, 
							fecha: fecha,
							titulo: {
								texto: titulo,
								idioma: tituloIdioma,
							},
							inventores: {
								numero: inventoresNombres.length,
								nombres: inventoresNombres,
							},
							abstract: abstract,
						});
					});
				
					// Regresar el resultado al callback
					cb(resultado);
					break;
				
				case 503:
					console.log('Error servidor EPO se encuentra temporalmente fuera de serivicio (503)');
					var err = {
						code: 503,
						message: 'Service Temporarily Unavailable',
					};
					
					cb(undefined, err);
					break;

				default:
					// Generar un objeto JSON en la variable error para que el callback
					// pueda hacer render del code y el message
					var json  = parser.toJson(data, {object: true});
					var error = {};

					for (c in json) {
						if (json[c].code) {
							error.code = json[c].code;
						}
						if (json[c].message) {
							error.message = json[c].message;
						}
					}

					if (!error.code) error.code = res.statusCode;
					if (!error.message) error.message = 'Error de EPO OPS';

					console.log('json: ' + util.inspect(json));
					console.log('error: ' + util.inspect(error));

					cb(undefined, error);

					console.log('Error data from epo: (' + res.statusCode + ')');
					break;
				}
			});
		});

		request.on('error', function(error) {
			console.log('Error with request to EPO OPS: ' + error.message);

			cb(undefined, error)
		});

		request.write('q=' + consulta);
		request.end();
	}

	// Esta funcion es llamada cuano el usuario hace click en descargar PDF. Recibe el epodoc de la patente
	// y primero consulta cuantas páginas tiene el documento para después bajarlas.
	function descargaPDF (epodoc, formato, cb) {
		if (!cb && typeof formato == 'function') {
			cb = formato;
			formato = '.pdf';
		}

		// Lo primero que hay que hacer es revisar si no existe ya el archivo, así no se descarga de nuevo
		var archivoExiste = __dirname + '/public/patentes/' + epodoc + '/' + epodoc + '.zip';
		if (fs.existsSync(archivoExiste) && formato == '.pdf') {
			return cb('/patentes/' + epodoc + '/' + epodoc + '.zip');
		}

		// construir los headers y opciones de la busqueda
		var options = {
			hostname: credenciales.epo.host,
			port: 443,
			method: 'GET',
			path: '/3.1/rest-services/published-data/publication/epodoc/' + epodoc + '/images',
			headers: {
				'Authorization': 'Bearer ' + accessToken,
				'Content-Type': 'text/plain',
				'Accept': 'application/json',
			},
		};

		// hacer el request a la EPO para conocer el número de páginas del documento
		var request = https.request(options, function(res) {
			var data = '';

			console.log('Status: ' + res.statusCode);
			//console.log('Headers: ' + util.inspect(res.headers));

			res.on('data', function(chunk) {
				data += chunk;
			});

			// Al darse 'end' revisar el statusCode y generar un error si EPO OPS respondió con un error 
			res.on('end', function() {
				switch (res.statusCode) {
					case 200:
						data = JSON.parse(data);

						var patentData = '';

						if (data['ops:world-patent-data']['ops:document-inquiry']['ops:inquiry-result'] != undefined) {
							patentData = data['ops:world-patent-data']['ops:document-inquiry']['ops:inquiry-result']
						}
						else {
							cb(undefined, {code: 1, message: 'No hay datos'});
							return;
						}

						if ('ops:document-instance' in patentData)
							patentData = patentData['ops:document-instance'];
						else {
							cb(undefined, {code: 2, message: 'No hay datos'});
							return;
						}

						// en ocasiones ops:ocument-instance no es un array, esto no sucede siempre.
						// por eso hay que asegurarse que sea convertio a un array si no lo es.
						if (!util.isArray(patentData))
							patentData = [patentData];

						var documentos = [];

						// Una de las entradas del array tiene la información del número de páginas.
						forEachStop = false;

						patentData.forEach(function(doc) {
							if (doc['@desc'] == 'FullDocument') {

								if (forEachStop) { return; }

								var paginas = doc['@number-of-pages'];
								var link    = doc['@link'];

								console.log('Link: ' + link);
								console.log('Páginas: ' + paginas);

								// crear el directorio en el file system donde se guardarán las patentes
								mkdirp(__dirname + '/public/patentes/' + epodoc, {mode: '777'}, function (err) {
									if (err) {
										return cb(undefined, err);
									}
								});

								// Generar un JSON con la información necesaria para descargar cada página
								for (var i = 1; i <= paginas; i++) {
									documentos.push({
										epodoc: epodoc,
										pagina: i,
										link: '/3.1/rest-services/' + link + formato + '?Range=' + i,
										path: __dirname + '/public/patentes/' + epodoc +'/archivo.' + i + formato,
										nombre: 'archivo.' + i + formato,
										folder: __dirname + '/public/patentes/' + epodoc,
									});
								}

								// llamar construirPDF en serie para que procese una página a la vez
								// de forma secuencial
								construirPDF(documentos.shift());

								// Algunas patentes tienen dos o mas 'juegos' de TIFFS, pueden ser versiones 
								// como A, A1, C, etc. Esta bandera se asegura que se baje solo la primera
								forEachStop = true;
							}
						});

						// lista que contiene los archivos que ya fueron descargados en el file system
						// se usa para construir el zip
						var archivosDescargados = [];

						// esta es la función que hace el request a la EPO página por página
						// al final lo mete todo en un zip y regresa la URL a ese zip.
						function construirPDF(doc) {
							if (doc) {
								options.path = doc.link;
								var chunks = '';
								
								// hacer un request por pagina y guadarlo como archivo binario
								var reqPDF = https.request(options, function(res) {
									res.setEncoding('binary');
									res.on('data', function(chunk) {
										chunks += chunk;
									});

									res.on('end', function() {										
										fs.writeFileSync(doc.path, chunks, {encoding: 'binary', mode: '777'});
										
										archivosDescargados.push(doc);
										
										// descargar el siguiente archivo
										return construirPDF(documentos.shift());
									});
								});

								reqPDF.write('');
								reqPDF.end();
							} 
							else {
								// cuando no hay más documentos en la lista es porque ya se descargaron
								// todos. 

								// Si el formato es tiff entonces solo se descargan sin crear un zip
								// esta opción es utilizada para poder leer el texto (OCR) de tiffs de forma
								// más sencilla que de PDFs, ya que requeriría convertirlo de pdf a tiff
								if (formato == '.tiff') {
									cb(archivosDescargados);
									return;
								}

								// Si el formato es pdf entonces se crea un archivo zip
								var archiver = require('archiver');

								// tomar el folder del primer archivo descargado (todos están en el mismo folder)
								var folder     = archivosDescargados[0].folder;
								var archivoZip = folder + '/' + epodoc + '.zip';

								var output = fs.createWriteStream(archivoZip, {mode: '777'});
								var zip = archiver('zip');

								output.on('close', function() {
									console.log('terminado el zip', '/patentes/' + epodoc + '/' + epodoc + '.zip');
									cb('/patentes/' + epodoc + '/' + epodoc + '.zip');
								});

								zip.pipe(output);

								zip.bulk([
									{src: ['**/*pdf'], cwd: folder, expand: true}
								]);

								zip.finalize();
							}
						}

						break;

					default:
						cb(undefined, {code: res.statusCode, message: 'status no manejado'});
				}
			});
		});

		request.write('');
		request.end();
	}


	//
	// Esto es lo que exporta el modulo
	//
	return {
		// función que se conecta a la EPO y obtiene un access token por medio de OAuth
		conectar: function(cb) {
			getAccessToken(function(accessToken, err) {
				// Cuando hay error llamar al callback con el access token y el error.
				if (err) {
					cb(accessToken, err);
					return 0;
				}

				// No hay error, llamar al callback con el access token.
				cb(accessToken);
			});
		},
		// función que revisa si el access token ya caducó o todavía es válido
		estado: estado,
		// función que hace una consulta a la EPO.
		buscar: function(consulta, rango, cb) {
			if (!cb && typeof rango == 'function') {
				cb = rango;
				rango = {};
			}

			console.log('Obteniendo access token...');

			getAccessToken(function(token, err) {
				if (err) {
					cb(undefined, err);
				}
				else {
					buscarEPO(consulta, rango, function(data, err) {
						if (err)
							cb(data, err);
						else
							cb(data);
					});
				}
			});
		},

		descargaPDF: function(epodoc, formato, cb) {
			if (!cb && typeof formato == 'function') {
				cb = formato;
				formato = '.pdf';
			}
			getAccessToken(function (token, err) {
				if (err) {
					cb(undefined, err);
				}
				else {
					descargaPDF(epodoc, formato, function(data, err) {
						if (err)
							cb(data, err);
						else
							cb(data);
					});
				}
			});
		}
	}
}
