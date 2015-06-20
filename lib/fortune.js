var fortuneCookies = [
'En ocasiones como esta sólo tu conoces la respuesta, no la busques en otro lado. ',
'Comprobaras junto con un amigo que tomaron la decisión correcta.',
'La naturaleza, la pacienca y el tiempo son los tres mejores doctores. Aplicarás conocimientos que creías perdidos. ',
'Mantente al margen de las situaciones riesgosas que se presenten ',
'No todo es posible, pero lo que no se intenta es imposible. ',
'Se acerca el momento que temes, pero no des marcha atrás, tendrás éxito si dejas que la honestidad de tu mente te guíe. ',
'Deberás ser un líder y tomar el control de la situación. ',
'No tengas miedo de desplegar todo el poder de tu imaginación ',
'Recompensa la amabilidad y encontrarás la fortuna. ',
'Deja de esperar ese tren que ya has perdido. ',
'Si un amigo te necesita no dudes en apoyarlo, pronto necesitaras de su ayuda. ',
'La luz del cariño te ayudara a salir adelante. ',
'Encontrarás un camino que nadie conoce. ',
'Cualquiera que sea el camino que tomes siempre recuerda que la vida esta donde tu estás.'
];

exports.getFortune = function() {
	var idx = Math.floor(Math.random() * fortuneCookies.length);
	return fortuneCookies[idx];
};