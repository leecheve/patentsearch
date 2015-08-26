
exports.index = function(req, res, next) {
	res.render('index');
};

exports.catchAll = function (req, res, next) {
	res.status(404).render('404');
};
