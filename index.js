var fs = require('fs');
var vm = require('vm');
var strackTrace = require('stack-trace');

/**
 * EntryEvaluatorPlugin
 * @param {Array.<String>} entries - List of entries
 * @param {String} destination - Destination file
 * @param {Object} scope - Scope object
 * @param {Function} template - Destination file template
 */
function EntryEvaluatorPlugin(entries, destination, scope, template) {
	this._entries = entries;
	this._destination = destination;
	this._scope = scope;
	this._template = template;
}

EntryEvaluatorPlugin.prototype.apply = function apply(compiler) {
	compiler.plugin('emit', function(compilation, done) {
		try {
			var stats = compilation.getStats().toJson();
			var context = this._createContext();
			this._entries.forEach(function(entry) {
				var source;
				if (fs.existsSync(entry)) {
					//file on disk
					source = fs.readFileSync(entry);
				} else {
					var asset = findAsset(entry, compilation, stats);
					if (!asset) {
						throw new Error('Output file not found: ' + entry);
					}
					source = asset.source();
					source = 'module.exports = ' + source + ';';
				}
				try {
					vm.runInContext(source, context);
				} catch (e) {
					console.log();
					console.log('WEBPACK-EVALUATOR-PLUGIN: ERROR IN ', entry);
					showPrettyError(e, source);
					throw e;
				}
			}.bind(this));
			var exported = context.module.exports;
			if (exported && exported.default) {
				exported = exported.default;
			}
			var result = this._template({
				html: exported,
				assets: getAssetsFromCompiler(compilation, stats)
			});
			compilation.assets[this._destination] = createAssetFromContents(result);
		} catch (error) {
			return done(error);
		}

		return done();
	}.bind(this));
};

EntryEvaluatorPlugin.prototype._createContext = function _createContext() {
	const context = vm.createContext(this._scope);
	context.exports = {};
	context.module = {
		exports: context.exports
	};
	context.global = context;
	return context;
};

module.exports = EntryEvaluatorPlugin;

function findAsset(src, compiler, webpackStatsJson) {
	var asset = compiler.assets[src];
	if (asset) {
		return asset;
	}

	var chunkValue = webpackStatsJson.assetsByChunkName[src];
	if (!chunkValue) {
		return null;
	}
	// Webpack outputs an array for each chunk when using sourcemaps
	if (chunkValue instanceof Array) {
		// Is the main bundle always the first element?
		chunkValue = chunkValue[0];
	}
	return compiler.assets[chunkValue];
}

// Shamelessly stolen from html-webpack-plugin - Thanks @ampedandwired :)
function getAssetsFromCompiler(compiler, webpackStatsJson) {
	var assets = {};
	//noinspection Eslint
	/*eslint-disable guard-for-in*/
	for (var chunk in webpackStatsJson.assetsByChunkName) {
		var chunkValue = webpackStatsJson.assetsByChunkName[chunk];

		// Webpack outputs an array for each chunk when using sourcemaps
		if (chunkValue instanceof Array) {
			// Is the main bundle always the first element?
			chunkValue = chunkValue[0];
		}

		if (compiler.options.output.publicPath) {
			chunkValue = compiler.options.output.publicPath + chunkValue;
		}
		assets[chunk] = chunkValue;
	}

	return assets;
}

function createAssetFromContents(contents) {
	return {
		source: function() {
			return contents;
		},
		size: function() {
			return contents.length;
		}
	};
}


function showPrettyError(err, source) {
	var stackEntry = strackTrace.parse(err)[0];

	var line = stackEntry.lineNumber;
	var column = stackEntry.columnNumber;
	var fileName = stackEntry.fileName;

	var message = '\n'
			+ (fileName || '(anonymous file)')
			+ ':' + line
			+ '\n'
			+ source.split('\n').slice(line - 10, line).join('\n')
			+ '\n'
			+ Array(column).join(' ') + '^'
			+ '\n'
			+ source.split('\n').slice(line, line + 10).join('\n')
			+ '\n'
		;
	console.log(message);
}