module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		concat: {
			javascript: {
				src: ['src/vendor/*.js', 'src/vendor/bootstrap*/**/*.js'],
				dest: 'build/<%= pkg.name %>.js'
			},
		},
		uglify: {
			options: {
				banner: '/*! <%= pkg.name %> - <%= grunt.template.today("yyyy-mm-dd") %> */\n'
			},
			build: {
				src: 'build/<%= pkg.name %>.js',
				dest: 'public/js/app.min.js'
			},
		},
		watch: {
			javascript: {
				files: ['<%= concat.javascript.src %>'],
				tasks: ['concat', 'uglify']
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-watch')
	grunt.registerTask('default', ['concat', 'uglify', 'watch']);
}
