const fs = require('fs');
const vm = require('vm');

/**
 * EntryEvaluator
 */
export default class EntryEvaluatorPlugin {
	/**
	 * @type {Array.<String>}
	 * @private
	 */
	_entries = [];

	/**
	 * @type {String}
	 * @private
	 */
	_destination;

	/**
	 * @type {Object}
	 * @private
	 */
	_scope;

	/**
	 * @type {Function}
	 * @private
	 */
	_template;

	/**
	 * @param {Array.<String>} entries - List of entries
	 * @param {String} destination - Destination file
	 * @param {Object} scope - Scope object
	 * @param {Function} template - Destination file template
	 */
	constructor(entries, destination, scope, template) {
		this._entries = entries;
		this._destination = destination;
		this._scope = scope;
		this._template = template;
	}

	apply(compiler) {
		compiler.plugin('emit', (compilation, done) => {
			try {
				const stats = compilation.getStats().toJson();
				const context = this._createContext();
				this._entries.forEach(entry => {
					let source;
					if (fs.existsSync(entry)) {
						//file on disk
						source = fs.readFileSync(entry);
					} else {
						const asset = findAsset(entry, compilation, stats);
						if (!asset) {
							throw new Error(`Output file not found: "${entry}"`);
						}
						source = asset.source();
						source = `module.exports = ${source};`;
					}
					vm.runInContext(source, context);
				});
				let exported = context.module.exports;
				if (exported && exported.default) {
					exported = exported.default;
				}
				const result = this._template({
					html: exported,
					assets: getAssetsFromCompiler(compilation, stats)
				});
				compilation.assets[this._destination] = createAssetFromContents(result);
			} catch (error) {
				return done(error);
			}

			return done();
		});
	}

	_createContext() {
		const context = vm.createContext(this._scope);
		context.window = context;
		context.exports = {};
		context.module = {
			exports: context.exports
		};
		context.global = context;
		return context;
	}
}

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