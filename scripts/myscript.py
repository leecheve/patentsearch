#!/usr/bin/python
# -*- coding: UTF-8 -*-

import nltk
from nltk import FreqDist
import matplotlib.pyplot as plt

plt.ion()

import mysql.connector
import sys
import codecs
from wordcloud import WordCloud

sys.stdout = codecs.EncodedFile(sys.stdout, 'utf-8') 
reload(sys)
sys.setdefaultencoding("utf-8")

if (len(sys.argv) <= 1):
	print "Error. Se requiren argumentos extra!"
	exit()

id_proyecto = sys.argv.pop(1)
print "Proyecto: {}".format(id_proyecto)


mysql_config = {
	'user': 'iteso',
	'password': 'itesoepo',
	'host': 'localhost',
	'database': 'itesoepo',
}


# Establecer conexion y crear un cursor
conn = mysql.connector.connect(**mysql_config)
c = conn.cursor()

# Almacenar epodoc -> texto en 'documentos'
documentos = {}

for epodoc in sys.argv[1:]:
	# Obtener los epodocs de la tabla de patentes
	c.execute("SELECT epodoc, texto FROM patentes WHERE epodoc='" + epodoc + "';")

	results = c.fetchall()

	if (len(results)):
		documentos[results[0][0]] = results[0][1]

	# El resultado se guarda en la BD. Hay que borrar cualquier resultado existente.
	c.execute("DELETE FROM word_count WHERE epodoc='" + epodoc + "';")
	c.execute("DELETE FROM ngrams WHERE epodoc='" + epodoc + "';")

# Verificar que al menos una patente exista en la BD
if (len(documentos.keys()) == 0):
	print "Las patentes especificadas no se encontraorn en la base de datos"
	exit()

#
# Hace una limpieza del texto.
# - Juntar palabras separadas por un guion, al final de una linea.
# - remover todos los guiones
# - Remover algunos signos de puntuacion
# - Cualquier palabra que tiene un '?'
import re

for epodoc in documentos:
	documentos[epodoc] = re.sub('-\n', '', documentos[epodoc])
	documentos[epodoc] = re.sub('-+', '', documentos[epodoc])
	documentos[epodoc] = re.sub(r'[;,\.:]', '', documentos[epodoc])
	documentos[epodoc] = re.sub(r'\S*\?\S*', '', documentos[epodoc])
	documentos[epodoc] = re.sub(r'\s+', ' ', documentos[epodoc])
	#print documentos[epodoc].lower()

#
# Hacer tokenization por palabra, utilizando una expresión regular
# la variable corpus es una lista de documentos ya tokenizados
#

#from nltk.tokenize import WhitespaceTokenizer
#tokenizer = WhitespaceTokenizer()
from nltk.tokenize import RegexpTokenizer
import codecs
from nltk.corpus import stopwords
from math import log, ceil

# Create a tokenizer to tokenize text
tokenizer = RegexpTokenizer(r'[a-zA-Z\-]+')

# Build the stop words set
stopWords = set(stopwords.words('english'))

# Iterar los documentos y procesarlos
for epodoc in documentos.keys():
	documentos[epodoc] = tokenizer.tokenize(documentos[epodoc])

	documentos[epodoc] = [w for w in documentos[epodoc] if len(w) > 2]

	# convertir a minusculas
	documentos[epodoc] = [w.lower() for w in documentos[epodoc]]

	# remover stopwords y numeros
	documentos[epodoc] = [w for w in documentos[epodoc] if w not in stopWords]
	documentos[epodoc] = [w for w in documentos[epodoc] if not w.isdigit()]

#
# Generar una cuenta de palabras por cada documento y guardar el resultado en la BD
#
cuenta_palabras = {}

for epodoc in documentos.keys():
	fdist = FreqDist(documentos[epodoc])

	# Se recalcula el valor de la frecuencia de cada palabra utilizando el logaritmo base e
	# de esta forma se reduce el impacto de una patente que repite una palabra muchas veces
	# En cuenta_palabras se guardan los dos valores, el normal y el logaritmo.

	tempDict = {}
	for word in fdist.keys():
		logVal = int(ceil(log(fdist[word]))) or 1;
	
		if (fdist[word] > 1) :
			tempDict[word] = {'normal':fdist[word], 'logaritmo':logVal}

	cuenta_palabras[epodoc] = tempDict


# Insertar los resultados para cada patente en la base de datos

query = ("INSERT INTO word_count (epodoc, word, count, log_count) "
		"VALUES (%s, %s, %s, %s)")

for epodoc in cuenta_palabras.keys():
	print "epodoc: {} : unique words: {}".format(epodoc, len(cuenta_palabras[epodoc].keys()))

	for word in cuenta_palabras[epodoc]:
		query_data = (epodoc, word, cuenta_palabras[epodoc][word]['normal'],
			cuenta_palabras[epodoc][word]['logaritmo'])
		c.execute(query, query_data)

# limpia la variable para liberar memoria
#cuenta_palabras = {}

# Texto de todos los documentos
texto = []

from nltk.collocations import *
bigram_measures = nltk.collocations.BigramAssocMeasures()
trigram_measures = nltk.collocations.TrigramAssocMeasures()


#
# Construir un diccionario de bigramas y trigramas por patente y almacenarlo en un diccionario

ngramas = {}

for epodoc in documentos:
	bigram_finder = BigramCollocationFinder.from_words(documentos[epodoc])
	trigram_finder = TrigramCollocationFinder.from_words(documentos[epodoc])
	
	bigramas  = {}
	trigramas = {}

	# Encontrar bigramas
	for tupla in bigram_finder.ngram_fd.items():
		frase = ' '.join(tupla[0])
		bigramas[frase] = tupla[1]

	# Encontrar trigramas
	for tupla in trigram_finder.ngram_fd.items():
		frase = ' '.join(tupla[0])
		trigramas[frase] = tupla[1]

	# Almacenar todo en el diccionario
	ngramas[epodoc] = {'bigramas': bigramas, 'trigramas': trigramas}

#
# Subir la informacion de ngramas a la BD

query = ("INSERT INTO ngrams (epodoc, ngram, ngram_count) "
		"VALUES (%s, %s, %s)")

for epodoc in ngramas.keys():
	bigrama  = []
	trigrama = []

	for word in cuenta_palabras[epodoc]:
		query_data = (epodoc, word, cuenta_palabras[epodoc][word]['normal'])
		c.execute(query, query_data)

	for bigrama in ngramas[epodoc]['bigramas']:
		query_data = (epodoc, bigrama, ngramas[epodoc]['bigramas'][bigrama])
		c.execute(query, query_data)

	for trigrama in ngramas[epodoc]['trigramas']:
		query_data = (epodoc, trigrama, ngramas[epodoc]['trigramas'][trigrama])
		c.execute(query, query_data)
		

# Cerrar conexion mysql
conn.commit()
c.close()
conn.close()

import os

full_path = os.path.realpath(__file__)
path, file = os.path.split(full_path)

# Llamar al script de R
from subprocess import call
call(["Rscript", path + "/myscript.R", id_proyecto])

exit(0)

# Crear una gráfica de las 50 palabras más repetidas.
ax = plt.axes()
fdist1.plot(50, cumulative=True)

# Guardar la gráfica a disco
ax.spines['right'].set_visible(False)
ax.spines['top'].set_visible(False)
ax.set_title(u"Frecuencia 50 palabras más comunes (acumulativo) de {}".format(len(texto)))
plt.draw() # Actualizar la gráfica
# bbox_inches asegura que las palabras no salgan cortadas en la imagen
plt.savefig("../public/1_50_palabras.png", bbox_inches='tight')

# Crear otra gráfica, esta no es acumulativa
plt.clf()
ax = plt.axes()
ax.spines['right'].set_visible(False)
ax.spines['top'].set_visible(False)
ax.set_title(u"Frecuencia 50 palabras más comunes de {}".format(len(texto)))
fdist1.plot(50, cumulative=False)
plt.draw() # Actualizar la gráfica
# bbox_inches asegura que las palabras no salgan cortadas en la imagen
plt.savefig("../public/2_50_palabras.png", bbox_inches='tight')

plt.clf()


#
# Insertar el texto limpio y procesado en la base de datos para que R pueda usarlo
# sin tener que limpiarlo de nuevo. Se guarda en la columna textoR de cada registro
#
