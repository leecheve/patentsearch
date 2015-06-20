options(warn=-1)

# usePackage installa el paquete si no ha sido instalado aun y luego le hace require
usePackage <- function(p) {
  if (!is.element(p, installed.packages()[,1]))
    install.packages(p, dep = TRUE)
  require(p, character.only = TRUE)
}

usePackage('NLP')

numPalabras<-function (x) {
  length(strsplit(as.String(x),' ')[[1]])
}

is.element('wordcloud',installed.packages()[,1])
args <- commandArgs(T)


# Instalar/cargar el paquete de MySQL
Sys.setenv(PKG_CPPFLAGS = "-I/usr/include/mysql")
Sys.setenv(PKG_LIBS = "-L/usr/lib -lmysqlclient")
usePackage('RMySQL')

# Crear la conexion a la base de datos
con <- dbConnect(MySQL(),
                 user="iteso", password="itesoepo",
                 dbname="itesoepo", host="localhost")
on.exit(dbDisconnect(con))


# Hacer consulta y traer registros
query <- paste("select ngram, SUM(ngram_count) as ngram_count, COUNT(epodoc) as ",
"epodoc from ngrams where (epodoc in (select epodoc from patentes_proyectos where id_proyecto = ",
args[1], ")) AND (ngram not in (select word from stop_words where id_proyecto=",
args[1],")) group by ngram order by ngram_count DESC;", sep='')

#print(query)
rs <- dbSendQuery(con, query)
texto <- fetch(rs, n=-1)
head(texto)


# Data frame con las palabras y  frecuencias
palabras <- texto$ngram
cuenta <- texto$ngram_count
frecuencias <- data.frame(word=palabras, freq=cuenta)

# La nube de palabras se construye con un maximo de 500 palabras
cuenta <- nrow(frecuencias)
if (cuenta > 500) cuenta <- 500
dm <- frecuencias[c(1:cuenta),]

usePackage('wordcloud')

print(getwd())

head(dm)
png(paste(getwd(),'/public/',args[1],"_wordcloud_1.png", sep=''), width=800,height=600)
wordcloud(dm$word, dm$freq, random.order = F, colors = brewer.pal(8, 'Dark2'))
dev.off()

# Se recalculan las frecuencias de cada palabra con la formula
# ln(<frecuencia_palabra>) + <numero de patentes en las que aparece>
dm <- frecuencias[c(1:cuenta),]
dm$freq <- log2(dm$freq) + ((texto$epodoc[c(1:cuenta)]) * as.numeric(lapply(dm$word, numPalabras)))
head(dm)


png(paste(getwd(),'/public/',args[1],"_wordcloud_2.png", sep=''), width=800,height=600)
wordcloud(dm$word, dm$freq, random.order = F, colors = brewer.pal(8, 'Dark2'))
dev.off()

#p<- ggplot(subset(dm, freq>10), aes(reorder(word, freq), freq))
#p <- p + geom_bar(stat='identity',fill="#56B4E9", colour="black") + coord_flip()
#p <- p + theme(axis.text.x=element_text(angle=45, hjust=1))
#p
quit(save="no", status=0)
