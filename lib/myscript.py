#!/usr/bin/python
# -*- coding: UTF-8 -*-

import nltk
from nltk import FreqDist
import matplotlib.pyplot as plt

plt.ion()

import mysql.connector
import sys
import codecs

sys.stdout = codecs.EncodedFile(sys.stdout, 'utf-8') 

if (len(sys.argv) <= 1):
	print "Error. Se requiren argumentos extra!"
	exit()

id_ae = int(sys.argv.pop())
print "ae: " + str(id_ae)

mysql_config = {
	'user': 'luisneto',
	'password': 'omGtkk4350',
	'host': 'localhost',
	'database': 'proyectofinal',
}

# Establecer conexion y crear un cursor
conn = mysql.connector.connect(**mysql_config)
c = conn.cursor()

c.execute("SELECT * FROM ae;")

# Almacenar el id y nombre del 'ae' en un diccionario ids
ids = {}

for row in c:
	ids[row[0]] = row[1]

# El id pasado como parametro debe de existir en la base de datos
if (ids.has_key(id_ae)):
	print "Id {0} encontrado: {1}".format(id_ae, ids[id_ae])
else:
	print "Error. No se encuentra el id {} en la base de datos!".format(id_ae)


# Obtener los textos correspondientes al id del ae
# El corpus se guarda en la lista llamada 'texto'
query_corpus = "SELECT texto FROM documentos WHERE idae = %s"

c.execute(query_corpus, str(id_ae))
texto = c.fetchall()

print("Total de documentos: {}".format(len(texto)))

# Cerrar conexion mysql
c.close()

# crear lista llamada corpus para contener los documentos
corpus = []

# Hacer tokenization por palabra
#from nltk.tokenize import WhitespaceTokenizer
#tokenizer = WhitespaceTokenizer()
from nltk.tokenize import RegexpTokenizer
tokenizer = RegexpTokenizer(r'\w+')

for documento in texto:
	corpus.append(tokenizer.tokenize(documento[0]))


# todas las palabras a minusculas y remover repeticiones por documento
for x in range(len(corpus)):
	#print("id: {}. {}".format(x, len(corpus[x])))
	corpus[x] = [w.lower() for w in corpus[x]]
	corpus[x] = set(corpus[x])

# Remover stopwords en cada documento del corpus
from nltk.corpus import stopwords
stops = set(stopwords.words('spanish'))
stops = stops | set(['pap','iteso','proyecto','aplicacion','profesional','coordinacion','desarrollo'])

for x in range(len(corpus)):
	corpus[x] = [word for word in corpus[x] if word not in stops]

# Remover numeros
for x in range(len(corpus)):
	corpus[x] = [word for word in corpus[x] if not word.isdigit()]
	#print("id: {}. {}".format(x, len(corpus[x])))

texto = []
for d in corpus:
	texto.extend(d)

print(len(texto))
fdist1 = FreqDist(texto)
print(fdist1)
#print(fdist1.max())


ax = plt.axes()
fdist1.plot(50, cumulative=True)


ax.spines['right'].set_visible(False)
ax.spines['top'].set_visible(False)
ax.set_title(u'Frecuencia de las 50 palabras más comunes (cumulative)')

plt.draw() # update the plot
plt.savefig('cfd.png', bbox_inches='tight') # sa